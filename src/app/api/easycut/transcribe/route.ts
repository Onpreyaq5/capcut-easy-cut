import { NextRequest, NextResponse } from 'next/server';
import Busboy from 'busboy';
import { Readable } from 'node:stream';
import { createWriteStream, promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // ถอดเสียง whisper อาจนานสำหรับคลิปยาว

const TOOL_DIR = path.resolve(process.cwd(), 'tools', 'capcut-auto');

// รับวิดีโอ 1 ไฟล์ (สตรีมลงดิสก์) → คืน path
function saveUpload(req: NextRequest, dest: string): Promise<{ saved: boolean }> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) return reject(new Error('ต้องส่ง multipart/form-data'));
    const bb = Busboy({ headers: { 'content-type': contentType } });
    const writes: Promise<void>[] = [];
    let saved = false;
    bb.on('file', (name, stream) => {
      if (name !== 'clip' || saved) { stream.resume(); return; }
      saved = true;
      const ws = createWriteStream(dest);
      writes.push(new Promise<void>((res, rej) => { ws.on('finish', () => res()); ws.on('error', rej); stream.on('error', rej); }));
      stream.pipe(ws);
    });
    bb.on('close', () => { Promise.all(writes).then(() => resolve({ saved })).catch(reject); });
    bb.on('error', reject);
    if (!req.body) return reject(new Error('ไม่มีข้อมูล'));
    Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]).pipe(bb);
  });
}

export async function POST(req: NextRequest) {
  const tmp = path.join(os.tmpdir(), `easycut_tr_${Date.now()}`);
  await fs.mkdir(tmp, { recursive: true });
  const videoPath = path.join(tmp, 'clip.mp4');
  try {
    const { saved } = await saveUpload(req, videoPath);
    if (!saved) return NextResponse.json({ ok: false, error: 'ไม่มีไฟล์วิดีโอ' }, { status: 400 });

    const result = await new Promise<{ ok: boolean; words?: unknown[]; error?: string }>((resolve) => {
      const child = spawn('python', ['-u', 'transcribe_only.py', videoPath], {
        cwd: TOOL_DIR,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });
      let out = '';
      let err = '';
      child.stdout.on('data', (d) => { out += d.toString(); });
      child.stderr.on('data', (d) => { err += d.toString(); });
      child.on('error', (e) => resolve({ ok: false, error: 'รัน python ไม่ได้: ' + e.message }));
      child.on('close', (code) => {
        const marker = out.lastIndexOf('__RESULT__');
        if (marker >= 0) {
          try {
            const json = JSON.parse(out.slice(marker + '__RESULT__'.length).trim());
            resolve(json);
            return;
          } catch { /* fallthrough */ }
        }
        resolve({ ok: false, error: `ถอดเสียงไม่สำเร็จ (code ${code}) ${err.slice(-400)}` });
      });
    });

    return NextResponse.json(result, { status: result.ok ? 200 : 500 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}
