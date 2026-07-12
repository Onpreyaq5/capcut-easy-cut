import { NextRequest, NextResponse } from 'next/server';
import Busboy from 'busboy';
import { Readable } from 'node:stream';
import { createWriteStream, createReadStream, promises as fs } from 'node:fs';
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { getSessionUser, quotaOf, addUsage } from '@/lib/authStore';

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

  // เช็คโควตาตามแพ็กเกจ (freemium) — บล็อกถ้าใช้ครบเดือนนี้แล้ว
  const q = quotaOf(user);
  if (q.remainingSeconds <= 0) {
    return NextResponse.json(
      { ok: false, code: 'quota', plan: q.plan, error: `ใช้โควตาแพ็กเกจ ${q.limit.label} ครบเดือนนี้แล้ว — อัปเกรดเป็น Pro เพื่อเรนเดอร์ต่อ` },
      { status: 402 },
    );
  }

  const tmp = path.join(os.tmpdir(), `easycut_rv_${Date.now()}`);
  await fs.mkdir(tmp, { recursive: true });
  const videoDest = path.join(tmp, 'clip.mp4');
  const projPath = path.join(tmp, 'project.json');
  const outPath = path.join(tmp, 'out.mp4');
  let streaming = false; // เมื่อเริ่มสตรีมแล้ว การลบไฟล์ชั่วคราวเป็นหน้าที่ของ stream ไม่ใช่ finally
  try {
    const { videoPath, project } = await parse(req, videoDest);
    if (!videoPath || !project) return NextResponse.json({ ok: false, error: 'ต้องมีทั้งวิดีโอและซับ' }, { status: 400 });
    await fs.writeFile(projPath, project, 'utf8');

    // ลายน้ำ + ความละเอียด ตามแพ็กเกจ
    const args = ['-u', 'render_video.py', '--video', videoPath, '--project', projPath, '--out', outPath,
      '--max-height', String(q.limit.maxHeight)];
    if (q.limit.watermark) args.push('--watermark');

    const result = await new Promise<{ ok: boolean; error?: string; dur?: number }>((resolve) => {
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

    // บันทึกการใช้งานตามความยาวคลิป (ตัดโควตา)
    if (result.dur && result.dur > 0) await addUsage(user.email, result.dur);

    // ส่งไฟล์วิดีโอแบบ "สตรีม" — ไม่โหลดทั้งไฟล์เข้า RAM (กัน OOM บนเซิร์ฟเวอร์เล็ก เช่น Render free 512MB)
    const size = (await fs.stat(outPath)).size;
    const fileStream = createReadStream(outPath);
    streaming = true;
    const cleanup = () => { fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined); };
    fileStream.once('close', cleanup); // ลบไฟล์ชั่วคราวเมื่อส่งจบ (หรือผู้ใช้ยกเลิกกลางทาง)
    fileStream.once('error', cleanup);
    return new NextResponse(Readable.toWeb(fileStream) as unknown as BodyInit, {
      headers: {
        'Content-Type': 'video/mp4',
        'Content-Disposition': 'attachment; filename="easycut-subtitled.mp4"',
        'Content-Length': String(size),
      },
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  } finally {
    if (!streaming) fs.rm(tmp, { recursive: true, force: true }).catch(() => undefined);
  }
}
