// งานประมวลผลเบื้องหลัง (async job) สำหรับ CAPCUT Easy CUT
// เหตุผล: เดิม route รอ python จนจบในคำขอเดียว -> คลิปยาวเกิน maxDuration -> "Failed to fetch"
// ตอนนี้แยกเป็น start (สั่งงาน) / status (poll ความคืบหน้า) / result (โหลด ZIP) / cancel (ยกเลิก)
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createReadStream, createWriteStream } from 'node:fs';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import JSZip from 'jszip';

export type JobMode = 'zip' | 'capcut';
export type JobStatus = 'running' | 'done' | 'error' | 'canceled';

export interface Job {
  id: string;
  mode: JobMode;
  status: JobStatus;
  progress: number; // 0-100 (ประมาณการ)
  phase: string; // ป้ายบอกขั้นตอนปัจจุบัน (ภาษาไทย)
  log: string[]; // เก็บ log เต็มไว้ (ตัดตอนส่งให้ client)
  error?: string;
  name: string;
  resultName?: string; // ชื่อไฟล์ ZIP (เฉพาะ mode zip)
  jobDir: string;
  outDir: string;
  zipPath?: string;
  child?: ChildProcessWithoutNullStreams;
  createdAt: number;
  // สถานะภายในสำหรับคำนวณ %
  totalClips: number;
  curClip: number;
}

const TOOL_DIR = path.resolve(process.cwd(), 'tools', 'capcut-auto');
// เก็บไฟล์งานนอกโฟลเดอร์โปรเจกต์ที่ซิงก์ OneDrive (กัน ffmpeg/whisper ชนการซิงก์)
const JOBS_ROOT = path.join(process.env.LOCALAPPDATA || os.tmpdir(), 'CAPCUT_Easy_CUT', 'jobs');
const MAX_LOG = 400;
const JOB_TTL_MS = 60 * 60 * 1000; // เก็บงานเก่าไว้ 1 ชม. แล้วกวาดทิ้ง

// เก็บงานไว้ในหน่วยความจำของ process (ใช้งานในเครื่อง = single node process จึงพอ)
// ต้องผูกกับ globalThis เพราะ Next.js แยก bundle ต่อ route -> module-level Map จะไม่ถูกแชร์ข้าม start/status/result
const g = globalThis as unknown as { __easycutJobs?: Map<string, Job> };
const jobs: Map<string, Job> = g.__easycutJobs ?? (g.__easycutJobs = new Map<string, Job>());

function sweepOld() {
  const now = Date.now();
  for (const [id, j] of jobs) {
    if (j.status !== 'running' && now - j.createdAt > JOB_TTL_MS) {
      fs.rm(j.jobDir, { recursive: true, force: true }).catch(() => undefined);
      jobs.delete(id);
    }
  }
}

export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

/** สรุปสถานะแบบย่อสำหรับส่งให้ client (ไม่รวม child/handle) */
export function publicStatus(j: Job) {
  return {
    id: j.id,
    mode: j.mode,
    status: j.status,
    progress: Math.round(j.progress),
    phase: j.phase,
    error: j.error,
    name: j.name,
    resultName: j.resultName,
    hasResult: Boolean(j.zipPath),
    log: j.log.slice(-30),
  };
}

function safeName(input: string): string {
  return (
    input
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '_')
      .replace(/\s+/g, '_')
      .slice(0, 60) || 'CAPCUT_Easy_CUT'
  );
}

// ---------- พาร์ส progress จาก stdout ของ python ----------
function ingestLine(j: Job, line: string) {
  const t = line.trim();
  if (!t) return;
  j.log.push(t);
  if (j.log.length > MAX_LOG) j.log.splice(0, j.log.length - MAX_LOG);

  let m: RegExpMatchArray | null;
  if ((m = t.match(/พบคลิป\s+(\d+)\s+ไฟล์/))) {
    j.totalClips = Math.max(1, parseInt(m[1], 10));
    j.phase = `พบคลิป ${j.totalClips} ไฟล์`;
    j.progress = Math.max(j.progress, 3);
    return;
  }
  if ((m = t.match(/\[(\d+)\/(\d+)\]\s*วิเคราะห์เสียง/))) {
    j.curClip = parseInt(m[1], 10);
    j.totalClips = Math.max(j.totalClips, parseInt(m[2], 10));
    j.phase = `วิเคราะห์เสียง คลิป ${j.curClip}/${j.totalClips}`;
    setClipProgress(j, 0);
    return;
  }
  if (/โหลดโมเดล whisper/.test(t)) {
    j.phase = `โหลดโมเดลถอดเสียง (คลิป ${j.curClip || 1}/${j.totalClips})`;
    return;
  }
  if ((m = t.match(/ถอดเสียง\.\.\.\s*(\d+)%/))) {
    const pct = parseInt(m[1], 10);
    j.phase = `ถอดเสียง คลิป ${j.curClip || 1}/${j.totalClips} — ${pct}%`;
    setClipProgress(j, pct / 100);
    return;
  }
  if (/ตัดคำพูดติดขัด/.test(t)) {
    j.phase = `ตัดคำพูดติดขัด/พูดผิด คลิป ${j.curClip || 1}/${j.totalClips}`;
    setClipProgress(j, 1);
    return;
  }
  if (/ตัดช่วงเงียบ/.test(t)) {
    j.phase = `ตัด dead air คลิป ${j.curClip || 1}/${j.totalClips}`;
    setClipProgress(j, 1);
    return;
  }
  if (/รวมคลิป/.test(t)) {
    j.phase = 'รวมคลิปเป็นไฟล์เดียว';
    j.progress = Math.max(j.progress, 88);
    return;
  }
  if (/\[THAI\]/.test(t)) {
    j.phase = 'AI ตรวจแก้ภาษาไทยในซับ';
    return;
  }
  if (/เขียน|draft|โปรเจกต์/.test(t)) {
    j.phase = 'เขียนโปรเจกต์ CapCut';
    j.progress = Math.max(j.progress, 90);
    return;
  }
}

// per-clip span = 3..82% ของทั้งงาน (ถอดเสียงเป็นส่วนที่กินเวลาหลัก)
function setClipProgress(j: Job, fracWithinClip: number) {
  const span = 79; // 3 -> 82
  const per = span / Math.max(1, j.totalClips);
  const clipIdx = Math.max(0, (j.curClip || 1) - 1);
  const val = 3 + per * clipIdx + per * Math.min(1, Math.max(0, fracWithinClip));
  j.progress = Math.max(j.progress, Math.min(82, val));
}

async function addFolderToZip(zip: JSZip, folder: string, base = ''): Promise<void> {
  const entries = await fs.readdir(/*turbopackIgnore: true*/ folder, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === '_work') continue;
    const abs = path.join(/*turbopackIgnore: true*/ folder, entry.name);
    const rel = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) await addFolderToZip(zip, abs, rel);
    // ป้อนไฟล์เข้า zip เป็น stream (ไม่อ่านทั้งไฟล์เข้า RAM) — ตัวใหญ่คือวิดีโอ combined
    else zip.file(rel, createReadStream(abs));
  }
}

function buildZipToDisk(outDir: string, zipPath: string): Promise<void> {
  return new Promise(async (resolve, reject) => {
    try {
      const zip = new JSZip();
      await addFolderToZip(zip, outDir);
      const ws = createWriteStream(zipPath);
      ws.on('error', reject);
      ws.on('finish', () => resolve());
      zip
        .generateNodeStream({ type: 'nodebuffer', streamFiles: true, compression: 'DEFLATE' })
        .on('error', reject)
        .pipe(ws);
    } catch (e) {
      reject(e);
    }
  });
}

/** สร้างโฟลเดอร์งานใหม่ (jobDir/clips, jobDir/output) เพื่อให้ route สตรีมไฟล์ลง clipsDir เอง */
export async function createJobDirs(mode: JobMode): Promise<{ id: string; jobDir: string; clipsDir: string; outDir: string }> {
  sweepOld();
  const id = `${Date.now()}_${Math.floor(performance.now())}`;
  const jobDir = path.join(JOBS_ROOT, `${mode}_${id}`);
  const clipsDir = path.join(jobDir, 'clips');
  const outDir = path.join(jobDir, 'output');
  await fs.mkdir(clipsDir, { recursive: true });
  await fs.mkdir(outDir, { recursive: true });
  return { id, jobDir, clipsDir, outDir };
}

export interface StartOptions {
  mode: JobMode;
  name: string;
  id: string;
  jobDir: string;
  clipsDir: string;
  outDir: string;
  clipCount: number; // จำนวนคลิปที่ route เขียนลงดิสก์แล้ว
  deadAir?: boolean; // zip
  hook?: string; // capcut
  script?: string; // capcut
  words?: number; // จำนวนคำต่อ 1 ซับ (0/undefined = อัตโนมัติ)
  cutFlubs?: boolean; // ตัดคำพูดติดขัด/พูดผิด (เอ่อ อ่า, พูดซ้ำ, retake/blooper)
  bgm?: string; // path ไฟล์เพลงประกอบ (capcut)
  removeVocals?: boolean; // ตัดเสียงร้องออกจากเพลง BGM
  bgmVolume?: number; // ระดับเสียงเพลง 0-1
  whoosh?: string; // path SFX วูช (รอยต่อคลิป)
  intro?: string; // path SFX เปิดคลิป
  ding?: string[]; // paths SFX เน้นคำ (สลับเสียง)
  hookLogos?: string[]; // paths ภาพโลโก้ Hook (1-2)
  hookTitle?: string; // ข้อความใหญ่บน Hook
  llm?: { provider?: string; key?: string; model?: string; base?: string };
}

/** เริ่มงาน: spawn python บนคลิปที่ route สตรีมลงดิสก์ไว้แล้ว (ไม่รอจบ) แล้วคืน jobId ทันที */
export async function startJob(opts: StartOptions): Promise<string> {
  const { id, jobDir, clipsDir, outDir } = opts;
  const name = safeName(opts.name);

  let script: string;
  let args: string[];
  const words = opts.words && opts.words > 0 ? String(opts.words) : '';
  if (opts.mode === 'zip') {
    script = path.join(TOOL_DIR, 'process_easycut.py');
    args = [script, '--clips', clipsDir, '--out', outDir, '--name', name, '--brand', path.join(TOOL_DIR, 'brand.json')];
    if (opts.deadAir === false) args.push('--no-dead-air');
    if (words) args.push('--words', words);
    if (opts.cutFlubs) args.push('--cut-flubs');
  } else {
    script = path.join(TOOL_DIR, 'build_capcut.py');
    args = ['--clips', clipsDir, '--name', name, '--brand', path.join(TOOL_DIR, 'brand.json')];
    if (opts.script) {
      const sp = path.join(clipsDir, 'script.json');
      await fs.writeFile(sp, opts.script, 'utf8');
      args.push('--script', sp);
    }
    if (opts.hook) args.push('--hook', opts.hook);
    if (words) args.push('--words', words);
    if (opts.cutFlubs) args.push('--cut-flubs');
    if (opts.bgm) {
      args.push('--bgm', opts.bgm);
      if (opts.removeVocals) args.push('--remove-vocals');
      if (opts.bgmVolume && opts.bgmVolume > 0) args.push('--bgm-volume', String(opts.bgmVolume));
    }
    if (opts.whoosh) args.push('--whoosh', opts.whoosh);
    if (opts.intro) args.push('--intro', opts.intro);
    if (opts.ding && opts.ding.length) args.push('--ding', opts.ding.join(','));
    if (opts.hookLogos && opts.hookLogos.length) args.push('--hook-logo', opts.hookLogos.join(','));
    if (opts.hookTitle) args.push('--hook-title', opts.hookTitle);
    const l = opts.llm;
    if (l?.provider) args.push('--llm-provider', l.provider);
    if (l?.key) args.push('--llm-key', l.key);
    if (l?.model) args.push('--llm-model', l.model);
    if (l?.base) args.push('--llm-base', l.base);
    args = [script, ...args];
  }

  const job: Job = {
    id,
    mode: opts.mode,
    status: 'running',
    progress: 1,
    phase: 'เริ่มงาน...',
    log: [],
    name,
    jobDir,
    outDir,
    createdAt: Date.now(),
    totalClips: Math.max(1, opts.clipCount),
    curClip: 0,
  };
  jobs.set(id, job);

  const child = spawn('python', ['-u', ...args], {
    cwd: TOOL_DIR,
    env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
  }) as ChildProcessWithoutNullStreams;
  job.child = child;

  let buf = '';
  const onData = (d: Buffer) => {
    buf += d.toString();
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() || '';
    for (const line of lines) ingestLine(job, line);
  };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);

  child.on('error', (e) => {
    job.status = 'error';
    job.error = String(e);
  });

  child.on('close', async (code) => {
    if (buf.trim()) ingestLine(job, buf);
    job.child = undefined;
    if (job.status === 'canceled') {
      fs.rm(jobDir, { recursive: true, force: true }).catch(() => undefined);
      return;
    }
    if (code !== 0) {
      job.status = 'error';
      job.error = job.error || 'ประมวลผลไม่สำเร็จ';
      return;
    }
    if (job.mode === 'zip') {
      try {
        job.phase = 'กำลังบีบอัดแพ็กเกจ';
        job.progress = Math.max(job.progress, 92);
        const zipPath = path.join(jobDir, `${name}_CAPCUT_Easy_CUT.zip`);
        await buildZipToDisk(outDir, zipPath);
        job.zipPath = zipPath;
        job.resultName = path.basename(zipPath);
      } catch (e) {
        job.status = 'error';
        job.error = 'สร้างไฟล์ ZIP ไม่สำเร็จ: ' + String(e);
        return;
      }
    }
    job.phase = 'เสร็จสมบูรณ์';
    job.progress = 100;
    job.status = 'done';
  });

  return id;
}

/** ยกเลิกงาน: ฆ่า process ลูก (แก้ปัญหางานค้างกินเครื่อง) */
export function cancelJob(id: string): boolean {
  const j = jobs.get(id);
  if (!j) return false;
  if (j.status === 'running') {
    j.status = 'canceled';
    j.phase = 'ยกเลิกแล้ว';
    if (j.child) {
      try {
        j.child.kill('SIGTERM');
        // Windows: บาง process ไม่ตายด้วย SIGTERM — ตามด้วย SIGKILL
        setTimeout(() => j.child?.kill('SIGKILL'), 1500);
      } catch {
        /* ignore */
      }
    }
  }
  return true;
}

/** สตรีม ZIP ออกจากดิสก์ (ไม่โหลดเข้า RAM) พร้อม cleanup หลังส่งเสร็จ */
export function openResultStream(id: string): { stream: ReturnType<typeof createReadStream>; name: string } | null {
  const j = jobs.get(id);
  if (!j || !j.zipPath) return null;
  const stream = createReadStream(j.zipPath);
  return { stream, name: j.resultName || `${j.name}.zip` };
}
