import { NextRequest, NextResponse } from 'next/server';
import Busboy from 'busboy';
import { Readable } from 'node:stream';
import { createWriteStream, promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { getSessionUser } from '@/lib/authStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TOOL_DIR = path.resolve(process.cwd(), 'tools', 'capcut-auto');

interface Parsed { videoPath?: string; project?: string }

function parse(req: NextRequest, dest: string): Promise<Parsed> {
  return new Promise((resolve, reject) => {
    const ct = req.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) return reject(new Error('ต้องส่ง multipart/form-data'));
    const bb = Busboy({ headers: { 'content-type': ct } });
    const writes: Promise<void>[] = [];
    const out: Parsed = {};
    bb.on('field', (n, v) => { if (n === 'project') out.project = v; });
    bb.on('file', (n, stream) => {
      if (n !== 'video') { stream.resume(); return; }
      out.videoPath = dest;
      const ws = createWriteStream(dest);
      writes.push(new Promise<void>((res, rej) => { ws.on('finish', () => res()); ws.on('error', rej); stream.on('error', rej); }));
      stream.pipe(ws);
    });
    bb.on('close', () => { Promise.all(writes).then(() => resolve(out)).catch(reject); });
    bb.on('error', reject);
    if (!req.body) return reject(new Error('ไม่มีข้อมูล'));
    Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]).pipe(bb);
  });
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, { status: 401 });

  const tmp = path.join(os.tmpdir(), `easycut_rv_${Date.now()}`);
  await fs.mkdir(tmp, { recursive: true });
  const videoDest = path.join(tmp, 'clip.mp4');
  const projPath = path.join(tmp, 'project.json');
  const outPath = path.join(tmp, 'out.mp4');
  try {
    const { videoPath, project } = await parse(req, videoDest);
    if (!videoPath || !project) return NextResponse.json({ ok: false, error: 'ต้องมีทั้งวิดีโอและซับ' }, { status: 400 });
    await fs.writeFile(projPath, project, 'utf8');

    // Free tier = ใส่ลายน้ำ; owner/pro = ไม่ใส่ (ตอนนี้ owner ยังไม่มีระบบ tier จริง → owner ถือเป็น pro)
    const watermark = user.role !== 'owner';
    const args = ['-u', 'render_video.py', '--video', videoPath, '--project', projPath, '--out', outPath];
    if (watermark) args.push('--watermark');

    const result = await new Promise<{ ok: boolean; error?: string }>((resolve) => {
      const child = spawn('python', args, { cwd: TOOL_DIR, env: { ...process.env, PYTHONIOENCODING: 'utf-8' } });
      let outBuf = '';
      let errBuf = '';
      child.stdout.on('data', (d) => { outBuf += d.toString(); });
      child.stderr.on('data', (d) => { errBuf += d.toString(); });
      child.on('error', (e) => resolve({ ok: false, error: 'รัน python ไม่ได้: ' + e.message }));
      child.on('close', (code) => {
        const m = outBuf.lastIndexOf('__RESULT__');
        if (m >= 0) { try { resolve(JSON.parse(outBuf.slice(m + '__RESULT__'.length).trim())); return; } catch { /* noop */ } }
        resolve({ ok: false, error: `เรนเดอร์ไม่สำเร็จ (code ${code}) ${errBuf.slice(-300)}` });
      });
    });
    if (!result.ok) return NextResponse.json(result, { status: 500 });

    // ส่งไฟล์วิดีโอกลับให้ดาวน์โหลด
    const buf = await fs.readFile(outPath);
    return new NextResponse(buf as unknown as BodyInit, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="easycut-subtitled.mp4"',
        'Content-Length': String(buf.length),
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}
