'use client';

import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';
import { saveAs } from 'file-saver';

let ff: FFmpeg | null = null;
let loaded = false;

/** โหลด ffmpeg.wasm (single-thread core จาก CDN — ไม่ต้องใช้ COOP/COEP) */
async function getFFmpeg(onLog?: (m: string) => void): Promise<FFmpeg> {
  if (ff && loaded) return ff;
  ff = new FFmpeg();
  if (onLog) ff.on('log', ({ message }) => onLog(message));
  const base = 'https://unpkg.com/@ffmpeg/core@0.12.10/dist/umd';
  await ff.load({
    coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
    wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
  });
  loaded = true;
  return ff;
}

/**
 * รวมคลิปวิดีโอหลายไฟล์เป็นไฟล์เดียว (เรียงตามลำดับที่ส่งมา) ในเบราว์เซอร์ ฟรี
 * พยายาม stream-copy ก่อน (เร็ว) ถ้าไม่ได้ค่อย re-encode
 */
export async function mergeAndDownload(
  files: File[],
  outName = 'CAPCUT_Easy_CUT_merged.mp4',
  onProgress?: (ratio: number) => void,
): Promise<void> {
  if (files.length === 0) throw new Error('ไม่มีคลิปให้รวม');
  const ffmpeg = await getFFmpeg();
  if (onProgress) ffmpeg.on('progress', ({ progress }) => onProgress(Math.min(1, Math.max(0, progress))));

  const names: string[] = [];
  for (let i = 0; i < files.length; i++) {
    const n = `in${String(i).padStart(2, '0')}.mp4`;
    await ffmpeg.writeFile(n, await fetchFile(files[i]));
    names.push(n);
  }
  const list = names.map((n) => `file '${n}'`).join('\n');
  await ffmpeg.writeFile('list.txt', new TextEncoder().encode(list));

  let ok = false;
  try {
    await ffmpeg.exec(['-f', 'concat', '-safe', '0', '-i', 'list.txt', '-c', 'copy', 'out.mp4']);
    const test = (await ffmpeg.readFile('out.mp4')) as Uint8Array;
    ok = test && test.length > 1000;
  } catch {
    ok = false;
  }
  if (!ok) {
    // คลิปคนละสเปก -> re-encode (ช้ากว่าแต่ชัวร์)
    await ffmpeg.exec([
      '-f', 'concat', '-safe', '0', '-i', 'list.txt',
      '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-pix_fmt', 'yuv420p', 'out.mp4',
    ]);
  }

  const data = (await ffmpeg.readFile('out.mp4')) as Uint8Array;
  if (!data || data.length < 1000) throw new Error('รวมไฟล์ไม่สำเร็จ — ลองตรวจว่าไฟล์เป็น .mp4 ทั้งหมด หรือใช้แพ็กเกจจัดเรียงแทน');
  saveAs(new Blob([data], { type: 'video/mp4' }), outName);
}
