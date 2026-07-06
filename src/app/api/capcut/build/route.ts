import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// ทำงานในเครื่องเท่านั้น (เขียนไฟล์ draft ลงโฟลเดอร์ CapCut + เรียก Python/ffmpeg/whisper)
export const runtime = 'nodejs';
export const maxDuration = 600;

const TOOL_DIR = path.join(process.cwd(), 'tools', 'capcut-auto');
// ไฟล์งาน (คลิปที่ตัดแล้ว) ต้องอยู่นอกโฟลเดอร์โปรเจกต์ที่ซิงก์ OneDrive —
// ไม่งั้น OneDrive จะแปลงเป็นไฟล์ "cloud-only" (placeholder) ทีหลัง ทำให้ CapCut หาไฟล์ไม่เจอ ขึ้นสีแดง
const JOBS_ROOT = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'CAPCUT_Easy_CUT', 'jobs');

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const rawName = ((form.get('name') as string) || 'CAPCUT_Easy_CUT').trim();
    const name = rawName.replace(/[\\/:*?"<>|]+/g, '_').replace(/\s+/g, '_').slice(0, 60) || 'CAPCUT_Easy_CUT';
    const scriptRaw = (form.get('script') as string) || '';
    const files = form.getAll('clips').filter((f): f is File => f instanceof File);
    if (!files.length) {
      return NextResponse.json({ ok: false, error: 'ไม่มีคลิปให้ประมวลผล' }, { status: 400 });
    }

    // ตรวจว่าเอนจินมีอยู่ (รันในเครื่องที่ติดตั้งไว้)
    const py = path.join(TOOL_DIR, 'build_capcut.py');
    try {
      await fs.access(py);
    } catch {
      return NextResponse.json(
        { ok: false, error: 'ไม่พบเอนจิน tools/capcut-auto (ปุ่มนี้ใช้ได้เฉพาะตอนรันเว็บในเครื่อง)' },
        { status: 501 },
      );
    }

    const jobDir = path.join(JOBS_ROOT, String(Date.now()));
    const clipsDir = path.join(jobDir, 'clips');
    await fs.mkdir(clipsDir, { recursive: true });

    for (let i = 0; i < files.length; i++) {
      const ext = path.extname(files[i].name) || '.mp4';
      const buf = Buffer.from(await files[i].arrayBuffer());
      await fs.writeFile(path.join(clipsDir, `${String(i + 1).padStart(2, '0')}${ext}`), buf);
    }

    const args = ['--clips', clipsDir, '--name', name, '--brand', path.join(TOOL_DIR, 'brand.json')];
    if (scriptRaw) {
      const sp = path.join(clipsDir, 'script.json');
      await fs.writeFile(sp, scriptRaw, 'utf8');
      args.push('--script', sp);
    }

    // ข้อความ hook เขียวตัวใหญ่ช่วงเปิดคลิป ("auto" = ใช้ประโยคแรก)
    const hook = ((form.get('hook') as string) || '').trim();
    if (hook) args.push('--hook', hook);

    // AI (ไม่บังคับ): ใช้ตรวจแก้คำภาษาไทยที่ถอดเสียงผิดในซับให้แม่นขึ้น
    const llmProvider = ((form.get('llmProvider') as string) || '').trim();
    const llmKey = ((form.get('llmKey') as string) || '').trim();
    const llmModel = ((form.get('llmModel') as string) || '').trim();
    const llmBase = ((form.get('llmBase') as string) || '').trim();
    if (llmProvider) args.push('--llm-provider', llmProvider);
    if (llmKey) args.push('--llm-key', llmKey);
    if (llmModel) args.push('--llm-model', llmModel);
    if (llmBase) args.push('--llm-base', llmBase);

    const result = await new Promise<{ code: number; out: string }>((resolve) => {
      const child = spawn('python', [py, ...args], {
        cwd: TOOL_DIR,
        env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
      });
      let out = '';
      child.stdout.on('data', (d) => (out += d.toString()));
      child.stderr.on('data', (d) => (out += d.toString()));
      child.on('close', (code) => resolve({ code: code ?? 1, out }));
      child.on('error', (e) => resolve({ code: 1, out: String(e) }));
    });

    // เก็บ log ไว้ตรวจย้อนหลังได้
    await fs.writeFile(path.join(jobDir, 'build.log'), result.out, 'utf8').catch(() => {});

    if (result.code !== 0) {
      return NextResponse.json({ ok: false, error: 'สร้างโปรเจกต์ไม่สำเร็จ', log: result.out.slice(-1200) }, { status: 500 });
    }
    return NextResponse.json({ ok: true, name, log: result.out.slice(-1800) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
