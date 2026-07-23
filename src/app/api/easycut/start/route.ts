import { NextRequest, NextResponse } from 'next/server';
import Busboy from 'busboy';
import { Readable } from 'node:stream';
import { createWriteStream, promises as fs } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { createJobDirs, runningJobCount, startJob, type JobMode } from '@/lib/easycutJobs';
import { getSessionUser } from '@/lib/authStore';
import { isCloud } from '@/lib/platform';
import { capcutAccess, processingAccess } from '@/lib/access';

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
const MAX_UPLOAD_BYTES = Math.max(1, Number(process.env.EASYCUT_MAX_UPLOAD_MB || 2048)) * 1024 * 1024;
const MAX_CLIPS = Math.max(1, Number(process.env.EASYCUT_MAX_CLIPS || 100));

function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i >= 0 ? name.slice(i).toLowerCase() : '';
}

interface Parsed {
  fields: Record<string, string>;
  clipCount: number;
  bgmPath?: string; // ไฟล์เพลงประกอบที่อัปโหลด (ถ้ามี)
  whooshPath?: string;
  introPath?: string;
  dingPaths: string[];
  hookLogoPaths: string[];
}

// สตรีม multipart ลงดิสก์ตรง ๆ ด้วย busboy (ไม่โหลดไฟล์ทั้งก้อนเข้า RAM เหมือน req.formData())
function streamMultipart(req: NextRequest, mode: JobMode, clipsDir: string): Promise<Parsed> {
  return new Promise((resolve, reject) => {
    const contentType = req.headers.get('content-type') || '';
    if (!contentType.includes('multipart/form-data')) {
      reject(new Error('ต้องส่งเป็น multipart/form-data'));
      return;
    }
    const bb = Busboy({
      headers: { 'content-type': contentType },
      limits: { fileSize: MAX_UPLOAD_BYTES, files: MAX_CLIPS + 20, fields: 80, fieldSize: 2 * 1024 * 1024 },
    });
    const fields: Record<string, string> = {};
    const writes: Promise<void>[] = [];
    let clipCount = 0;
    let bgmPath: string | undefined;
    let whooshPath: string | undefined;
    let introPath: string | undefined;
    const dingPaths: string[] = [];
    const hookLogoPaths: string[] = [];
    let failed: Error | null = null;

    // เซฟ stream ลงไฟล์ + รอจนเสร็จ
    const saveTo = (stream: NodeJS.ReadableStream, dest: string) => {
      const ws = createWriteStream(dest);
      writes.push(
        new Promise<void>((res, rej) => {
          ws.on('finish', () => res());
          ws.on('error', rej);
          stream.on('error', rej);
        }),
      );
      stream.pipe(ws);
    };

    bb.on('field', (name, val) => {
      fields[name] = val;
    });

    bb.on('file', (name, stream, info) => {
      stream.once('limit', () => {
        failed = new Error(`ไฟล์ ${info.filename || ''} ใหญ่เกิน ${Math.round(MAX_UPLOAD_BYTES / 1024 / 1024)} MB`);
      });
      // เพลง/SFX/โลโก้ hook (ไฟล์ประกอบ)
      if (name === 'bgm') {
        bgmPath = path.join(clipsDir, `_bgm${extOf(info.filename || '') || '.mp3'}`);
        saveTo(stream, bgmPath);
        return;
      }
      if (name === 'whoosh') {
        whooshPath = path.join(clipsDir, `_whoosh${extOf(info.filename || '') || '.mp3'}`);
        saveTo(stream, whooshPath);
        return;
      }
      if (name === 'intro') {
        introPath = path.join(clipsDir, `_intro${extOf(info.filename || '') || '.mp3'}`);
        saveTo(stream, introPath);
        return;
      }
      if (name === 'ding') {
        const p = path.join(clipsDir, `_ding${dingPaths.length}${extOf(info.filename || '') || '.mp3'}`);
        dingPaths.push(p);
        saveTo(stream, p);
        return;
      }
      if (name === 'hookLogo') {
        const p = path.join(clipsDir, `_hooklogo${hookLogoPaths.length}${extOf(info.filename || '') || '.png'}`);
        hookLogoPaths.push(p);
        saveTo(stream, p);
        return;
      }
      if (name !== 'clips') {
        stream.resume(); // ทิ้ง field ไฟล์ที่ไม่เกี่ยว
        return;
      }
      const ext = extOf(info.filename || '') || '.mp4';
      if (!VIDEO_EXT.has(ext)) {
        stream.resume();
        return;
      }
      if (clipCount >= MAX_CLIPS) {
        failed = new Error(`อัปโหลดได้ไม่เกิน ${MAX_CLIPS} คลิปต่อหนึ่งงาน`);
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
    bb.on('filesLimit', () => { failed = new Error('จำนวนไฟล์เกินกำหนด'); });
    bb.on('fieldsLimit', () => { failed = new Error('จำนวนช่องข้อมูลเกินกำหนด'); });

    bb.on('close', () => {
      if (failed) {
        reject(failed);
        return;
      }
      Promise.all(writes)
        .then(() => resolve({ fields, clipCount, bgmPath, whooshPath, introPath, dingPaths, hookLogoPaths }))
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
  // ต้องเข้าสู่ระบบก่อนใช้งาน (เก็บสถิติลูกค้า + กันยิง API ตรงโดยไม่ login)
  const user = await getSessionUser(req);
  if (!user) {
    return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, { status: 401 });
  }
  // โหมดตัดออโต้เต็มรูปแบบใช้ whisper/CapCut ในเครื่อง — บนคลาวด์ยังไม่รองรับ
  // ปฏิเสธ "ก่อน" รับไฟล์ ไม่ให้ผู้ใช้เสียเวลาอัปโหลดแล้วค่อยพัง
  if (isCloud()) {
    return NextResponse.json(
      { ok: false, code: 'cloud', error: 'โหมดตัดออโต้ใช้ได้ในแอปเวอร์ชันติดตั้งบนเครื่อง (Windows) — บนเว็บใช้หน้า "ตัวแก้ซับ" ได้เลย: ถอดเสียง แก้ซับ และดาวน์โหลดวิดีโอฝังซับ' },
      { status: 501 },
    );
  }
  // อ่าน mode จาก query ก่อน (เพื่อรู้กติกาการกรองไฟล์ก่อนเริ่มสตรีม) — เผื่อไม่ได้ส่งก็ default zip
  const mode = ((req.nextUrl.searchParams.get('mode') as JobMode) || 'zip') as JobMode;
  if (mode !== 'zip' && mode !== 'capcut') {
    return NextResponse.json({ ok: false, error: 'โหมดงานไม่ถูกต้อง' }, { status: 400 });
  }
  const access = mode === 'capcut' ? capcutAccess(user) : processingAccess(user);
  if (!access.ok) {
    return NextResponse.json({ ok: false, code: access.code, error: access.error }, { status: access.status });
  }
  const concurrentLimit = access.quota.plan === 'studio' ? 4 : access.quota.plan === 'pro' ? 2 : 1;
  if (runningJobCount(user.email) >= concurrentLimit) {
    return NextResponse.json(
      { ok: false, code: 'busy', error: `แพ็กเกจ ${access.quota.limit.label} ทำงานพร้อมกันได้สูงสุด ${concurrentLimit} งาน กรุณารอให้งานเดิมเสร็จก่อน` },
      { status: 429 },
    );
  }
  const dirs = await createJobDirs(mode);
  try {
    const { fields, clipCount, bgmPath, whooshPath, introPath, dingPaths, hookLogoPaths } =
      await streamMultipart(req, mode, dirs.clipsDir);
    // mode ในฟอร์มมีสิทธิ์เหนือกว่า query (แต่การกรองไฟล์ทำตาม query ไปแล้ว)
    const finalMode = ((fields.mode as JobMode) || mode) as JobMode;
    if (finalMode !== mode) {
      await fs.rm(dirs.jobDir, { recursive: true, force: true }).catch(() => undefined);
      return NextResponse.json({ ok: false, error: 'โหมดในคำขอไม่ตรงกัน กรุณาลองใหม่' }, { status: 400 });
    }

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
      ownerEmail: user.email,
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
      quality: fields.quality === 'fast' || fields.quality === 'accurate' ? fields.quality : 'max',
      keyterms: (fields.keyterms || '').trim().slice(0, 1000),
      cutFlubs: fields.cutFlubs === 'on',
      compareModels: fields.compareModels === 'on',
      bgm: bgmPath,
      removeVocals: fields.removeVocals === 'on',
      bgmVolume: parseFloat(fields.bgmVolume || '0.12') || 0.12,
      autoSfx: fields.autoSfx === 'on',
      whoosh: whooshPath,
      intro: introPath,
      ding: dingPaths,
      hookLogos: hookLogoPaths,
      hookTitle: (fields.hookTitle || '').trim(),
      font: (fields.font || '').trim(),
      fontSize: parseFloat(fields.fontSize || '0') || 0,
      subY: fields.subY ? parseFloat(fields.subY) : undefined,
      borderWidth: fields.borderWidth ? parseFloat(fields.borderWidth) : undefined,
      textColor: (fields.textColor || '').trim(),
      hlColor: (fields.hlColor || '').trim(),
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
