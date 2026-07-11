import { NextRequest, NextResponse } from 'next/server';
import Busboy from 'busboy';
import { Readable } from 'node:stream';
import { createWriteStream, promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createJobDirs, startJob, type JobMode } from '@/lib/easycutJobs';

// เช็คว่ามี CapCut เปิดค้างอยู่ไหม (Windows) — ถ้าสร้างโปรเจกต์ขณะ CapCut เปิด คลิปจะขึ้นสีแดง Media Not Found
function capcutIsRunning(): boolean {
  if (process.platform !== 'win32') return false;
  try {
    const out = execFileSync('tasklist', ['/FI', 'IMAGENAME eq CapCut.exe', '/NH'], {
      encoding: 'utf8',
      timeout: 15000,
    });
    return out.includes('CapCut.exe');
  } catch {
    return false;
  }
}

// ทำงานในเครื่อง: spawn python/ffmpeg/whisper + เขียนไฟล์ local
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// คำขอนี้แค่รับไฟล์ (สตรีมลงดิสก์) + สั่งงาน แล้วคืน jobId ทันที (ไม่รอประมวลผล) จึงไม่ชน timeout ยาว ๆ
export const maxDuration = 300;

const VIDEO_EXT = new Set(['.mp4', '.mov', '.mkv', '.webm', '.m4v']);

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

interface Parsed {
  fields: Record<string, string>;
  clipCount: number;
  bgmPath?: string; // ไฟล์เพลงประกอบที่อัปโหลด (ถ้ามี)
}

// สตรีม multipart ลงดิสก์ตรง ๆ ด้วย busboy (ไม่โหลดไฟล์ทั้งก้อนเข้า RAM เหมือน req.formData())
function streamMultipart(req: NextRequest, mode: JobMode, clipsDir: string): Promise<Parsed> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      reject(new Error('ต้องส่งเป็น multipart/form-data'));
      return;
    }
    const bb = Busboy({ headers: { 'content-type': contentType } });
    const fields: Record<string, string> = {};
    const writes: Promise<void>[] = [];
    let clipCount = 0;
    let bgmPath: string | undefined;
    let failed: Error | null = null;

    bb.on('field', (name, val) => {
      fields[name] = val;
    });

    bb.on('file', (name, stream, info) => {
      // เพลงประกอบ (BGM) — 1 ไฟล์
      if (name === 'bgm') {
        const ext = extOf(info.filename || '') || '.mp3';
        const dest = path.join(clipsDir, `_bgm${ext}`);
        bgmPath = dest;
        const ws = createWriteStream(dest);
        writes.push(
          new Promise<void>((res, rej) => {
            ws.on('finish', () => res());
            ws.on('error', rej);
            stream.on('error', rej);
          }),
        );
        stream.pipe(ws);
        return;
      }
      if (name !== 'clips') {
        stream.resume(); // ทิ้ง field ไฟล์ที่ไม่เกี่ยว
        return;
      }
      const ext = extOf(info.filename || '') || '.mp4';
      // โหมด zip รับเฉพาะสกุลวิดีโอ (โหมด capcut รับตามที่ส่งมา)
      if (mode === 'zip' && !VIDEO_EXT.has(ext)) {
        stream.resume();
        return;
      }
      clipCount += 1;
      const dest = path.join(clipsDir, `${String(clipCount).padStart(2, '0')}${ext}`);
      const ws = createWriteStream(dest);
      writes.push(
        new Promise<void>((res, rej) => {
          ws.on('finish', () => res());
          ws.on('error', rej);
          stream.on('error', rej);
        }),
      );
      stream.pipe(ws);
    });

    bb.on('error', (e) => {
      failed = e instanceof Error ? e : new Error(String(e));
    });

    bb.on('close', () => {
      if (failed) {
        reject(failed);
        return;
      }
      Promise.all(writes)
        .then(() => resolve({ fields, clipCount, bgmPath }))
        .catch(reject);
    });

    if (!req.body) {
      reject(new Error('ไม่มีข้อมูลใน request'));
      return;
    }
    Readable.fromWeb(req.body as Parameters<typeof Readable.fromWeb>[0]).pipe(bb);
  });
}

export async function POST(req: NextRequest) {
  // อ่าน mode จาก query ก่อน (เพื่อรู้กติกาการกรองไฟล์ก่อนเริ่มสตรีม) — เผื่อไม่ได้ส่งก็ default zip
  const mode = ((req.nextUrl.searchParams.get('mode') as JobMode) || 'zip') as JobMode;
  const dirs = await createJobDirs(mode);
  try {
    const { fields, clipCount, bgmPath } = await streamMultipart(req, mode, dirs.clipsDir);
    // mode ในฟอร์มมีสิทธิ์เหนือกว่า query (แต่การกรองไฟล์ทำตาม query ไปแล้ว)
    const finalMode = ((fields.mode as JobMode) || mode) as JobMode;

    if (!clipCount) {
      await fs.rm(dirs.jobDir, { recursive: true, force: true }).catch(() => undefined);
      return NextResponse.json({ ok: false, error: 'ยังไม่มีไฟล์วิดีโอให้ประมวลผล' }, { status: 400 });
    }

    // โหมดสร้างโปรเจกต์ CapCut: ต้องปิด CapCut ก่อน ไม่งั้นคลิปขึ้นสีแดง Media Not Found
    // เช็คทันทีก่อนเริ่มงาน (ไม่ต้องรอถอดเสียง 10 นาทีแล้วค่อยรู้)
    if (finalMode === 'capcut' && capcutIsRunning()) {
      await fs.rm(dirs.jobDir, { recursive: true, force: true }).catch(() => undefined);
      return NextResponse.json(
        {
          ok: false,
          error:
            'CapCut กำลังเปิดอยู่ — กรุณาปิด CapCut ให้สนิทก่อนกดสร้าง แล้วลองใหม่\n' +
            '(ถ้าสร้างขณะ CapCut เปิดค้าง คลิปจะขึ้นเป็นสีแดง Media Not Found เพราะ CapCut ล็อกโฟลเดอร์ไว้) ' +
            'พอสร้างเสร็จค่อยเปิด CapCut โปรเจกต์จะอยู่บนสุด',
        },
        { status: 409 },
      );
    }

    const jobId = await startJob({
      mode: finalMode,
      name: fields.name || 'CAPCUT_Easy_CUT',
      id: dirs.id,
      jobDir: dirs.jobDir,
      clipsDir: dirs.clipsDir,
      outDir: dirs.outDir,
      clipCount,
      deadAir: fields.deadAir !== 'off',
      hook: (fields.hook || '').trim(),
      script: fields.script || '',
      words: parseInt(fields.words || '0', 10) || 0,
      cutFlubs: fields.cutFlubs === 'on',
      bgm: bgmPath,
      removeVocals: fields.removeVocals === 'on',
      bgmVolume: parseFloat(fields.bgmVolume || '0.12') || 0.12,
      llm: {
        provider: (fields.llmProvider || '').trim(),
        key: (fields.llmKey || '').trim(),
        model: (fields.llmModel || '').trim(),
        base: (fields.llmBase || '').trim(),
      },
    });

    return NextResponse.json({ ok: true, jobId });
  } catch (e: unknown) {
    await fs.rm(dirs.jobDir, { recursive: true, force: true }).catch(() => undefined);
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
