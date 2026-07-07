import { NextRequest, NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

export const runtime = 'nodejs';
export const maxDuration = 900;

const TOOL_DIR = path.join('tools', 'capcut-auto');
// เก็บไฟล์งานนอกโฟลเดอร์โปรเจกต์ที่ซิงก์ OneDrive กัน ffmpeg/whisper ชนกับการซิงก์ระหว่างประมวลผล
const JOBS_ROOT = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'CAPCUT_Easy_CUT', 'jobs');
const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v']);

function safeName(input: string): string {
  return (
    input
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 60) || 'CAPCUT_Easy_CUT'
  );
}

async function addFolderToZip(zip: JSZip, folder: string, base = ''): Promise<void> {
  const entries = await fs.readdir(folder, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '_work') continue;
    const abs = path.join(folder, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      await addFolderToZip(zip, abs, rel);
    } else {
      zip.file(rel, await fs.readFile(abs));
    }
  }
}

async function runPython(args: string[], cwd: string): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const child = spawn('python', args, {
      cwd,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    let out = '';
    child.stdout.on('data', (d) => (out += d.toString()));
    child.stderr.on('data', (d) => (out += d.toString()));
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
    child.on('error', (e) => resolve({ code: 1, out: String(e) }));
  });
}

export async function POST(req: NextRequest) {
  let jobDir = '';
  try {
    const form = await req.formData();
    const rawName = safeName((form.get('name') as string) || 'CAPCUT_Easy_CUT');
    const noDeadAir = form.get('deadAir') === 'off';
    const files = form
      .getAll('clips')
      .filter((f): f is File => f instanceof File)
      .filter((f) => VIDEO_EXT.has(path.extname(f.name).toLowerCase()));

    if (!files.length) {
      return NextResponse.json({ ok: false, error: 'ยังไม่มีไฟล์วิดีโอให้ประมวลผล' }, { status: 400 });
    }

    const script = path.join(TOOL_DIR, 'process_easycut.py');
    try {
      await fs.access(script);
    } catch {
      return NextResponse.json({ ok: false, error: 'ไม่พบเอนจิน process_easycut.py' }, { status: 501 });
    }

    jobDir = path.join(JOBS_ROOT, `easycut_${Date.now()}`);
    const clipsDir = path.join(jobDir, 'clips');
    const outDir = path.join(jobDir, 'output');
    await fs.mkdir(clipsDir, { recursive: true });
    await fs.mkdir(outDir, { recursive: true });

    for (let i = 0; i < files.length; i++) {
      const ext = path.extname(files[i].name) || '.mp4';
      const buf = Buffer.from(await files[i].arrayBuffer());
      await fs.writeFile(path.join(clipsDir, `${String(i + 1).padStart(2, '0')}${ext}`), buf);
    }

    const args = [
      script,
      '--clips',
      clipsDir,
      '--out',
      outDir,
      '--name',
      rawName,
      '--brand',
      path.join(TOOL_DIR, 'brand.json'),
    ];
    if (noDeadAir) args.push('--no-dead-air');

    const result = await runPython(args, TOOL_DIR);
    if (result.code !== 0) {
      return NextResponse.json(
        {
          ok: false,
          error: 'ประมวลผลไม่สำเร็จ',
          log: result.out.slice(-2500),
        },
        { status: 500 },
      );
    }

    const zip = new JSZip();
    await addFolderToZip(zip, outDir);
    const payload = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });

    return new NextResponse(payload, {
      status: 200,
      headers: {
        'Content-Type': 'application/zip',
        'Content-Disposition': `attachment; filename="${rawName}_CAPCUT_Easy_CUT.zip"`,
        'Cache-Control': 'no-store',
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  } finally {
    if (jobDir) {
      await fs.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
    }
  }
}
