import { NextResponse } from 'next/server';
import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execAsync = promisify(exec);

export async function POST(req: Request) {
  try {
    const { filePaths } = await req.json();
    if (!filePaths || !Array.isArray(filePaths) || filePaths.length === 0) {
      return NextResponse.json({ error: 'No file paths provided' }, { status: 400 });
    }

    const file = filePaths[0]; // Analyze the first file for the dashboard
    if (!fs.existsSync(file)) {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }

    // Run ffprobe for video streams
    const ffprobeVideoCmd = `ffprobe -v error -select_streams v:0 -show_entries stream=width,height,r_frame_rate,duration -of json "${file}"`;
    const { stdout: videoOut } = await execAsync(ffprobeVideoCmd);
    const videoData = JSON.parse(videoOut);
    const videoStream = videoData.streams[0];

    // Run ffprobe for audio streams
    const ffprobeAudioCmd = `ffprobe -v error -select_streams a:0 -show_entries stream=sample_rate -of json "${file}"`;
    const { stdout: audioOut } = await execAsync(ffprobeAudioCmd);
    const audioData = JSON.parse(audioOut);
    const audioStream = audioData.streams[0];

    // Parsing FPS (often comes as a fraction like 30000/1001)
    let fps = 0;
    if (videoStream?.r_frame_rate) {
      const [num, den] = videoStream.r_frame_rate.split('/');
      fps = Math.round(Number(num) / (Number(den) || 1));
    }

    const durationSec = Number(videoStream?.duration || 0);
    const width = videoStream?.width || 0;
    const height = videoStream?.height || 0;
    const sampleRate = audioStream?.sample_rate || 0;

    // Run silencedetect (quick scan) for estimated cuts
    // This scans the audio track very quickly without decoding video
    const silenceCmd = `ffmpeg -v error -i "${file}" -af silencedetect=noise=-30dB:d=0.5 -f null -`;
    let silenceOut = '';
    try {
        const result = await execAsync(silenceCmd);
        silenceOut = result.stderr;
    } catch (e: any) {
        // ffmpeg logs to stderr which throws error in exec sometimes if not zero exit code, but we just need stderr
        silenceOut = e.stderr || '';
    }
    
    const silenceStarts = [...silenceOut.matchAll(/silence_start:\s*([\d.]+)/g)].map(m => Number(m[1]));
    const silenceEnds = [...silenceOut.matchAll(/silence_end:\s*([\d.]+)/g)].map(m => Number(m[1]));
    
    let estimatedSilenceDuration = 0;
    const estimatedCuts = silenceStarts.length;
    
    for (let i = 0; i < silenceStarts.length; i++) {
      if (silenceEnds[i]) {
        estimatedSilenceDuration += (silenceEnds[i] - silenceStarts[i]);
      }
    }

    // Calculations for the dashboard
    const estimatedProcessingTime = (durationSec * 0.4).toFixed(1); // Rough estimate: 40% of real-time
    const estimatedApiCost = (durationSec * 0.0001).toFixed(4); // Rough estimate API cost based on length
    const estimatedSubtitleCount = Math.round(durationSec / 3); // Approx 1 subtitle every 3 seconds

    return NextResponse.json({
      durationSec,
      resolution: `${width}x${height}`,
      fps,
      sampleRate,
      estimatedCuts,
      estimatedSilenceDuration,
      estimatedProcessingTime,
      estimatedApiCost,
      estimatedSubtitleCount,
      estimatedSpeakingSpeed: 'Normal (140 wpm)',
    });
  } catch (error: any) {
    console.error('Analyze error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
