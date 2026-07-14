import { NextRequest, NextResponse } from 'next/server';
import Busboy from 'busboy';
import { Readable } from 'node:stream';
import { createWriteStream, promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { getSessionUser } from '@/lib/authStore';
import { groqEnabled, transcribeGroq, transcribeLocal } from '@/lib/transcribe';
import { isCloud } from '@/lib/platform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300; // ถอดเสียง whisper อาจนานสำหรับคลิปยาว

const TOOL_DIR = path.resolve(process.cwd(), 'tools', 'capcut-auto');

// รับวิดีโอ 1 ไฟล์ (สตรีมลงดิสก์) + ฟิลด์ข้อความ (keyterms) → คืน path + fields
function saveUpload(req: NextRequest, dest: string): Promise<{ saved: boolean; fields: Record<string, string> }> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) return reject(new Error('ต้องส่ง multipart/form-data'));
    const bb = Busboy({ headers: { 'content-type': contentType } });
    const writes: Promise<void>[] = [];
    const fields: Record<string, string> = {};
    let saved = false;
    bb.on('field', (name, val) => { fields[name] = val; });
    bb.on('file', (name, stream) => {
      if (name !== 'clip' || saved) { stream.resume(); return; }
      saved = true;
      const ws = createWriteStream(dest);
      writes.push(new Promise<void>((res, rej) => { ws.on('finish', () => res()); ws.on('error', rej); stream.on('error', rej); }));
      stream.pipe(ws);
    });
    bb.on('close', () => { Promise.all(writes).then(() => resolve({ saved, fields })).catch(reject); });
    bb.on('error', reject);
    if (!req.body) return reject(new Error('ไม่มีข้อมูล'));
    Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]).pipe(bb);
  });
}

export async function POST(req: NextRequest) {
  if (!(await getSessionUser(req))) {
    return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, { status: 401 });
  }
  // บนคลาวด์ไม่มี whisper ในเครื่อง — ถ้ายังไม่ตั้ง GROQ_API_KEY ให้บอกตรง ๆ ทันที
  // (ไม่ปล่อยให้ผู้ใช้อัปคลิปรอนานแล้วค่อยพังด้วย ModuleNotFoundError)
  if (isCloud() && !groqEnabled()) {
    return NextResponse.json(
      { ok: false, code: 'no-groq', error: 'ระบบถอดเสียงยังไม่พร้อม — ผู้ดูแลเว็บต้องตั้งค่า GROQ_API_KEY ใน Environment ก่อน' },
      { status: 503 },
    );
  }
  const tmp = path.join(os.tmpdir(), `easycut_tr_${Date.now()}`);
  await fs.mkdir(tmp, { recursive: true });
  const videoPath = path.join(tmp, 'clip.mp4');
  try {
    const { saved, fields } = await saveUpload(req, videoPath);
    if (!saved) return NextResponse.json({ ok: false, error: 'ไม่มีไฟล์วิดีโอ' }, { status: 400 });

    // pluggable: Groq (คลาวด์ ไม่ต้อง Python) ถ้ามีคีย์ ไม่งั้น faster-whisper ในเครื่อง
    const words = groqEnabled()
      ? await transcribeGroq(videoPath, fields.keyterms)
      : await transcribeLocal(videoPath, TOOL_DIR);

    return NextResponse.json({ ok: true, words, engine: groqEnabled() ? 'groq' : 'local' });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}
