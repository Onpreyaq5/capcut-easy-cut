import { NextRequest, NextResponse } from 'next/server';
import Busboy from 'busboy';
import { Readable } from 'node:stream';
import { createWriteStream, promises as fs } from 'node:fs';
import { spawn, execFileSync } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { getSessionUser } from '@/lib/authStore';
import { isCloud } from '@/lib/platform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const TOOL_DIR = path.resolve(process.cwd(), 'tools', 'capcut-auto');

// CapCut เปิดค้าง = คลิปขึ้นแดง (ล็อกโฟลเดอร์) — ต้องปิดก่อนสร้าง
function capcutIsRunning(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq CapCut.exe', '/NH'], { encoding: 'utf8', timeout: 15000 });
    return out.includes('CapCut.exe');
  } catch {
    return false;
  }
}

interface Parsed { videoPath?: string; project?: string; name?: string }

function parse(req: NextRequest, videoDest: string): Promise<Parsed> {
  return new Promise((resolve, reject) => {
    const ct = req.headers.get('content-type') || '';
    if (!ct.includes('multipart/form-data')) return reject(new Error('ต้องส่ง multipart/form-data'));
    const bb = Busboy({ headers: { 'content-type': ct } });
    const writes: Promise<void>[] = [];
    const out: Parsed = {};
    bb.on('field', (n, v) => { if (n === 'project') out.project = v; if (n === 'name') out.name = v; });
    bb.on('file', (n, stream) => {
      if (n !== 'video') { stream.resume(); return; }
      out.videoPath = videoDest;
      const ws = createWriteStream(videoDest);
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
  if (!(await getSessionUser(req))) {
    return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, { status: 401 });
  }
  // สร้างโปรเจกต์ CapCut ต้องมี CapCut ติดตั้ง — ทำได้เฉพาะแอปเวอร์ชันเครื่อง ไม่ใช่เซิร์ฟเวอร์คลาวด์
  if (isCloud()) {
    return NextResponse.json(
      { ok: false, code: 'cloud', error: 'ส่งเข้า CapCut ใช้ได้ในแอปเวอร์ชันติดตั้งบนเครื่อง — บนเว็บใช้ปุ่ม "ดาวน์โหลดวิดีโอ (ฝังซับ)" แทนได้เลย' },
      { status: 501 },
    );
  }
  const tmp = path.join(os.tmpdir(), `easycut_ed_${Date.now()}`);
  await fs.mkdir(tmp, { recursive: true });
  const videoDest = path.join(tmp, 'clip.mp4');
  const projPath = path.join(tmp, 'project.json');
  try {
    const { videoPath, project, name } = await parse(req, videoDest);
    if (!videoPath || !project) {
      return NextResponse.json({ ok: false, error: 'ต้องมีทั้งวิดีโอและซับ' }, { status: 400 });
    }
    if (capcutIsRunning()) {
      return NextResponse.json(
        { ok: false, error: 'CapCut กำลังเปิดอยู่ — กรุณาปิด CapCut ให้สนิทก่อนกดสร้าง แล้วลองใหม่ (ถ้าสร้างขณะ CapCut เปิด คลิปจะขึ้นสีแดง)' },
        { status: 409 },
      );
    }
    await fs.writeFile(projPath, project, 'utf8');
    const projName = (name || 'CAPCUT_Easy_CUT_Editor').replace(/[^\w฀-๿\- ]/g, '').trim() || 'CAPCUT_Easy_CUT_Editor';

    const result = await new Promise<{ ok: boolean; outDir?: string; error?: string; captions?: number }>((resolve) => {
      const child = spawn('python', ['-u', 'build_from_editor.py', '--video', videoPath, '--name', projName, '--project', projPath], {
        cwd: TOOL_DIR,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });
      let outBuf = '';
      let errBuf = '';
      child.stdout.on('data', (d) => { outBuf += d.toString(); });
      child.stderr.on('data', (d) => { errBuf += d.toString(); });
      child.on('error', (e) => resolve({ ok: false, error: 'รัน python ไม่ได้: ' + e.message }));
      child.on('close', (code) => {
        const m = outBuf.lastIndexOf('__RESULT__');
        if (m >= 0) {
          try { resolve(JSON.parse(outBuf.slice(m + '__RESULT__'.length).trim())); return; } catch { /* noop */ }
        }
        resolve({ ok: false, error: `สร้างไม่สำเร็จ (code ${code}) ${errBuf.slice(-400)}` });
      });
    });

    return NextResponse.json({ ...result, name: projName }, { status: result.ok ? 200 : 500 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}
