'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
  Ban,
  CheckCircle2,
  Download,
  FileText,
  Film,
  Loader2,
  Package,
  Scissors,
  ShieldCheck,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { Alert, Badge, Button, Input, Select } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useApp } from '@/lib/store';
import type { ProviderId, Settings } from '@/lib/types';

type BusyMode = '' | 'zip' | 'capcut';

interface JobProgress {
  status: 'running' | 'done' | 'error' | 'canceled';
  progress: number;
  phase: string;
  log: string[];
  error?: string;
}

/** AI เจ้าฟรีสำหรับงานตรวจแก้ภาษาไทยในซับ (API มาตรฐาน OpenAI) */
const THAI_CHECK_PROVIDERS: Record<string, { label: string; model: string; keyUrl: string }> = {
  groq: { label: 'Groq (ฟรี · แนะนำ)', model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys' },
  cerebras: { label: 'Cerebras (ฟรี 1M โทเคน/วัน)', model: 'llama-3.3-70b', keyUrl: 'https://cloud.cerebras.ai/' },
  openrouter: { label: 'OpenRouter (มีรุ่นฟรี)', model: 'meta-llama/llama-3.3-70b-instruct:free', keyUrl: 'https://openrouter.ai/keys' },
};

/** เลือก AI ที่ใช้ตรวจแก้ภาษาไทยในซับ (puter ใช้ไม่ได้ — ทำงานเฉพาะในเบราว์เซอร์) */
function pickThaiCheckLlm(settings: Settings) {
  // 1) ถ้าเลือก AI เฉพาะงานนี้ไว้ (Groq/Cerebras/OpenRouter) ใช้ตัวนั้นก่อน
  if (settings.thaiCheckProvider && settings.thaiCheckKey) {
    const meta = THAI_CHECK_PROVIDERS[settings.thaiCheckProvider];
    if (meta) return { provider: settings.thaiCheckProvider, key: settings.thaiCheckKey, model: meta.model, base: '' };
  }
  // 2) ไม่งั้นใช้ AI หลักจากหน้า "ตั้งค่า"
  const usable = (p: ProviderId) => p === 'local' || Boolean(settings.keys[p]);
  if (settings.activeProvider !== 'puter' && usable(settings.activeProvider)) {
    return {
      provider: settings.activeProvider,
      key: settings.keys[settings.activeProvider] || '',
      model: settings.models[settings.activeProvider],
      base: settings.activeProvider === 'local' ? settings.localBaseUrl : '',
    };
  }
  for (const p of ['gemini', 'openai', 'anthropic'] as ProviderId[]) {
    if (settings.keys[p]) return { provider: p, key: settings.keys[p], model: settings.models[p], base: '' };
  }
  return null;
}

const VIDEO_EXT = ['.mp4', '.mov', '.mkv', '.webm', '.m4v'];

function mb(size: number): string {
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

function isVideo(file: File): boolean {
  const lower = file.name.toLowerCase();
  return file.type.startsWith('video/') || VIDEO_EXT.some((ext) => lower.endsWith(ext));
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function filenameFromDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = /filename="?([^"]+)"?/i.exec(header);
  return match?.[1] || fallback;
}

const waveform = [34, 52, 28, 70, 44, 84, 36, 64, 48, 78, 32, 56, 40, 88, 46, 62, 30, 72];

// 4 ขั้นตอน (โครงแบบ tamsub.com)
const STEPS = [
  { n: '1', t: 'อัปโหลดวิดีโอ', icon: UploadCloud },
  { n: '2', t: 'AI ถอดเสียง', icon: AudioLines },
  { n: '3', t: 'เลือกสไตล์', icon: Sparkles },
  { n: '4', t: 'เรนเดอร์ / CapCut', icon: FileText },
] as const;

// แถวเลือกไฟล์ SFX
function SfxRow({ label, file, onPick, onClear }: { label: string; file: File | null; onPick: () => void; onClear: () => void }) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        onClick={onPick}
        className="shrink-0 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs font-semibold text-text-secondary transition-colors hover:border-primary/50"
      >
        {label}
      </button>
      {file ? (
        <span className="flex min-w-0 flex-1 items-center gap-1 text-xs text-text-muted">
          <span className="truncate">{file.name}</span>
          <button type="button" onClick={onClear} className="shrink-0 hover:text-danger" aria-label="ลบ">
            <X className="h-3.5 w-3.5" />
          </button>
        </span>
      ) : (
        <span className="text-xs text-text-muted">ยังไม่ได้เลือก</span>
      )}
    </div>
  );
}

export function EasyCutTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [projectName, setProjectName] = useState('CAPCUT_Easy_CUT');
  const [deadAir, setDeadAir] = useState(true);
  const [hookText, setHookText] = useState('');
  // จำนวนคำต่อ 1 ซับ (0 = อัตโนมัติ ให้ระบบจัดวลีเอง)
  const [wordsPerCap, setWordsPerCap] = useState(0);
  // ตัดคำพูดติดขัด/พูดผิด (เอ่อ อ่า, พูดซ้ำ, retake/blooper)
  const [cutFlubs, setCutFlubs] = useState(false);
  // เพลงประกอบ (BGM) + ตัดเสียงร้อง
  const [bgmFile, setBgmFile] = useState<File | null>(null);
  const [removeVocals, setRemoveVocals] = useState(true);
  const bgmRef = useRef<HTMLInputElement>(null);
  // SFX (วูช / เปิดคลิป / เน้นคำ)
  const [whooshFile, setWhooshFile] = useState<File | null>(null);
  const [introFile, setIntroFile] = useState<File | null>(null);
  const [dingFiles, setDingFiles] = useState<File[]>([]);
  const whooshRef = useRef<HTMLInputElement>(null);
  const introRef = useRef<HTMLInputElement>(null);
  const dingRef = useRef<HTMLInputElement>(null);
  // Hook: โลโก้ + ข้อความใหญ่
  const [hookLogos, setHookLogos] = useState<File[]>([]);
  const [hookTitle, setHookTitle] = useState('');
  const hookLogoRef = useRef<HTMLInputElement>(null);
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const thaiCheckLlm = pickThaiCheckLlm(settings);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<BusyMode>('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [job, setJob] = useState<JobProgress | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const jobIdRef = useRef<string>('');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // เคลียร์ตัวจับเวลา poll เมื่อ component ถูกถอด
  useEffect(() => {
    return () => {
      if (pollRef.current) clearTimeout(pollRef.current);
    };
  }, []);

  const totalSize = useMemo(() => files.reduce((sum, f) => sum + f.size, 0), [files]);
  const firstFile = files[0];
  const isBusy = Boolean(busy);

  const [previewUrl, setPreviewUrl] = useState('');
  useEffect(() => {
    if (!firstFile) {
      setPreviewUrl('');
      return;
    }
    const nextUrl = URL.createObjectURL(firstFile);
    setPreviewUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [firstFile]);

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list).filter(isVideo);
    if (!incoming.length) {
      setError('ไฟล์ที่เลือกยังไม่ใช่วิดีโอที่รองรับ');
      return;
    }
    setFiles((prev) => [...prev, ...incoming]);
    setError('');
    setSuccess('');
  }

  function removeFile(index: number) {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }

  function buildFormData(mode: BusyMode): FormData {
    const fd = new FormData();
    fd.append('mode', mode);
    fd.append('name', projectName || 'CAPCUT_Easy_CUT');
    fd.append('deadAir', deadAir ? 'on' : 'off');
    fd.append('hook', hookText.trim());
    fd.append('words', String(wordsPerCap > 0 ? wordsPerCap : 0));
    fd.append('cutFlubs', cutFlubs ? 'on' : 'off');
    // เพลงประกอบ (เฉพาะโหมดสร้าง CapCut)
    if (bgmFile) {
      fd.append('bgm', bgmFile);
      fd.append('removeVocals', removeVocals ? 'on' : 'off');
      fd.append('bgmVolume', '0.12');
    }
    // SFX
    if (whooshFile) fd.append('whoosh', whooshFile);
    if (introFile) fd.append('intro', introFile);
    dingFiles.forEach((f) => fd.append('ding', f));
    // Hook (โลโก้ + ข้อความ)
    hookLogos.forEach((f) => fd.append('hookLogo', f));
    if (hookTitle.trim()) fd.append('hookTitle', hookTitle.trim());
    // AI (ถ้ามี) ใช้ตรวจแก้ภาษาไทยในซับให้แม่นขึ้น — ไม่บังคับ
    if (thaiCheckLlm) {
      fd.append('llmProvider', thaiCheckLlm.provider);
      fd.append('llmKey', thaiCheckLlm.key);
      fd.append('llmModel', thaiCheckLlm.model);
      fd.append('llmBase', thaiCheckLlm.base);
    }
    files.forEach((file) => fd.append('clips', file));
    return fd;
  }

  // จบงาน CapCut: ดึงสรุปผลตรวจภาษาไทยจาก log มาแสดง
  function capcutSuccessMessage(log: string[]): string {
    const infoLines = log
      .filter((l) => l.includes('[THAI]'))
      .map((l) => l.replace('[THAI]', 'ภาษาไทย:').trim())
      .join('\n');
    return (
      `สร้างโปรเจกต์ "${projectName || 'CAPCUT_Easy_CUT'}" ใน CapCut แล้ว ปิด CapCut ให้สนิทแล้วเปิดใหม่` +
      (infoLines ? `\n${infoLines}` : '')
    );
  }

  // poll สถานะงานทุก 1 วิ จนกว่าจะเสร็จ/ล้ม/ยกเลิก
  function pollStatus(jobId: string, mode: BusyMode) {
    const tick = async () => {
      if (jobIdRef.current !== jobId) return; // มีงานใหม่แทนที่แล้ว
      try {
        const res = await fetch(`/api/easycut/status/${jobId}`, { cache: 'no-store' });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || 'ติดตามสถานะงานไม่สำเร็จ');
        }
        const s = (await res.json()) as JobProgress & { resultName?: string };
        setJob({ status: s.status, progress: s.progress, phase: s.phase, log: s.log || [], error: s.error });

        if (s.status === 'done') {
          if (mode === 'zip') {
            const r = await fetch(`/api/easycut/result/${jobId}`);
            if (!r.ok) throw new Error('ดาวน์โหลดผลลัพธ์ไม่สำเร็จ');
            const blob = await r.blob();
            const name = filenameFromDisposition(r.headers.get('Content-Disposition'), `${projectName || 'CAPCUT_Easy_CUT'}_package.zip`);
            downloadBlob(blob, name);
            setSuccess('ดาวน์โหลดแพ็กเกจแล้ว: วิดีโอหลังตัด + smart subtitles + transcript พร้อมเข้า CapCut');
          } else {
            setSuccess(capcutSuccessMessage(s.log || []));
          }
          finishJob();
          return;
        }
        if (s.status === 'error') {
          const tail = (s.log || []).slice(-8).join('\n');
          setError((s.error || 'ประมวลผลไม่สำเร็จ') + (tail ? `\n\n${tail}` : ''));
          finishJob();
          return;
        }
        if (s.status === 'canceled') {
          setError('ยกเลิกงานแล้ว');
          finishJob();
          return;
        }
        pollRef.current = setTimeout(tick, 1000);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : String(e));
        finishJob();
      }
    };
    pollRef.current = setTimeout(tick, 600);
  }

  function finishJob() {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = null;
    jobIdRef.current = '';
    setBusy('');
    setJob(null);
  }

  async function runJob(mode: BusyMode) {
    if (!files.length) {
      setError('ลากคลิปเข้ามาก่อน แล้วค่อยเริ่มประมวลผล');
      return;
    }
    setBusy(mode);
    setError('');
    setSuccess('');
    setJob({ status: 'running', progress: 0, phase: 'กำลังอัปโหลดคลิป...', log: [] });
    try {
      const res = await fetch(`/api/easycut/start?mode=${mode}`, { method: 'POST', body: buildFormData(mode) });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok || !body.jobId) {
        throw new Error(body?.error || 'เริ่มงานไม่สำเร็จ');
      }
      jobIdRef.current = body.jobId;
      pollStatus(body.jobId, mode);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
      finishJob();
    }
  }

  async function cancelCurrentJob() {
    const id = jobIdRef.current;
    if (!id) return;
    setJob((j) => (j ? { ...j, phase: 'กำลังยกเลิก...' } : j));
    await fetch(`/api/easycut/cancel/${id}`, { method: 'POST' }).catch(() => undefined);
    // ปล่อยให้ poll ตัวถัดไปอ่านสถานะ canceled แล้ว finishJob เอง
  }

  const downloadPackage = () => runJob('zip');
  const createCapCutProject = () => runJob('capcut');

  return (
    <div className="container-page py-8 lg:py-12">
      {/* Hero — โครงสร้างแบบ tamsub.com (ใช้สีของเราเอง) */}
      <div className="mb-10 text-center">
        <Badge tone="ai" className="mb-4">
          <Sparkles className="h-3.5 w-3.5" />
          AI ทำซับอัตโนมัติ
        </Badge>
        <h1 className="mx-auto max-w-3xl font-heading text-[2.3rem] font-bold leading-[1.06] text-text-primary sm:text-6xl">
          ใส่ซับให้คลิปในไม่กี่วินาที
        </h1>
        <p className="mx-auto mt-4 max-w-2xl text-lg text-text-secondary">
          อัปคลิปดิบ → ตัด Dead air + ถอดเสียงทำซับไทยอัตโนมัติ พร้อมส่งเข้า CapCut ในจังหวะเดียว
        </p>

        {/* 4 ขั้นตอน (แบบ tamsub) */}
        <div className="mx-auto mt-7 grid max-w-3xl grid-cols-2 gap-3 sm:grid-cols-4">
          {STEPS.map((s) => (
            <div key={s.n} className="flex items-center gap-2.5 rounded-lg border border-border bg-surface p-3 shadow-sm">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-bold text-on-primary">
                {s.n}
              </span>
              <span className="flex items-center gap-1.5 text-left text-sm font-semibold text-text-secondary">
                <s.icon className="h-4 w-4 shrink-0 text-primary" />
                {s.t}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <section className="min-w-0">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            onDragEnter={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              addFiles(e.dataTransfer.files);
            }}
            className={cn(
              'relative grid min-h-[420px] w-full overflow-hidden rounded-lg border bg-surface text-left shadow-lg transition-all',
              dragging ? 'border-primary ring-4 ring-ring' : 'border-border hover:border-border-strong',
            )}
          >
            {previewUrl ? (
              <video className="absolute inset-0 h-full w-full object-cover" src={previewUrl} muted playsInline />
            ) : (
              <div className="absolute inset-0 bg-[linear-gradient(135deg,rgba(0,122,255,.08),rgba(0,163,199,.05)_36%,rgba(109,93,252,.07))]" />
            )}
            <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,.02),rgba(0,0,0,.28))]" />
            <div className="relative z-10 flex h-full flex-col justify-between p-6 sm:p-8">
              <div className="flex items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 rounded-md border border-white/35 bg-white/78 px-3 py-2 text-sm font-semibold text-text-primary shadow-sm backdrop-blur">
                  <UploadCloud className="h-4 w-4 text-primary" />
                  {files.length ? `${files.length} คลิป` : 'ลากคลิปใส่'}
                </span>
                <span className="rounded-md border border-white/35 bg-white/70 px-3 py-2 text-xs font-semibold text-text-secondary shadow-sm backdrop-blur">
                  MP4 · MOV · MKV · WEBM
                </span>
              </div>

              <div className="max-w-xl rounded-lg border border-white/35 bg-white/82 p-5 shadow-lg backdrop-blur-xl">
                <div className="mb-4 flex h-16 items-end gap-1.5">
                  {waveform.map((height, i) => (
                    <span
                      key={`${height}-${i}`}
                      className="w-full rounded-full bg-primary/80"
                      style={{ height: `${height}%`, opacity: i % 3 === 0 ? 0.55 : 0.88 }}
                    />
                  ))}
                </div>
                <h2 className="font-heading text-2xl font-bold text-text-primary sm:text-3xl">
                  {files.length ? firstFile?.name : 'Drop raw footage'}
                </h2>
                <p className="mt-2 text-sm text-text-secondary">
                  {files.length ? `${mb(totalSize)} พร้อมประมวลผล` : 'เลือกหลายคลิปได้ ระบบจะเรียงตามลำดับที่อัปโหลด'}
                </p>
              </div>
            </div>
          </button>
          <input ref={fileRef} type="file" accept="video/*,.mp4,.mov,.mkv,.webm,.m4v" multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />

          {files.length > 0 && (
            <div className="mt-5 rounded-lg border border-border bg-surface p-4 shadow-md">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h2 className="font-heading text-lg font-bold">คิวประมวลผล</h2>
                <Badge tone="muted">
                  {files.length} ไฟล์ · {mb(totalSize)}
                </Badge>
              </div>
              <div className="space-y-2">
                {files.map((file, index) => (
                  <div key={`${file.name}-${file.lastModified}-${index}`} className="flex items-center gap-3 rounded-md border border-border bg-surface-muted p-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary-soft text-primary">
                      <Film className="h-4 w-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-text-primary">{file.name}</p>
                      <p className="text-xs text-text-muted">{mb(file.size)}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeFile(index)}
                      className="grid h-8 w-8 place-items-center rounded-md text-text-muted transition-colors hover:bg-surface hover:text-danger"
                      aria-label="ลบไฟล์"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-lg border border-border bg-surface p-5 shadow-lg">
            <div className="mb-5 flex items-start gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-ai-soft text-ai">
                <Package className="h-5 w-5" />
              </span>
              <div>
                <h2 className="font-heading text-xl font-bold">ส่งออก</h2>
                <p className="text-sm text-text-muted">วิดีโอ + smart SRT/ASS + transcript</p>
              </div>
            </div>

            <label className="mb-4 block">
              <span className="mb-1.5 block text-sm font-semibold text-text-secondary">ชื่อโปรเจกต์</span>
              <Input value={projectName} onChange={(e) => setProjectName(e.target.value)} />
            </label>

            <label className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted p-3">
              <span className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
                <Scissors className="h-4 w-4 text-primary" />
                ตัด Dead air
              </span>
              <input
                type="checkbox"
                checked={deadAir}
                onChange={(e) => setDeadAir(e.target.checked)}
                className="h-5 w-5 accent-primary"
              />
            </label>

            <label className="mb-4 flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-muted p-3">
              <span className="flex flex-col gap-1">
                <span className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
                  <AudioLines className="h-4 w-4 text-primary" />
                  ตัดคำพูดติดขัด / พูดผิด
                </span>
                <span className="text-xs leading-relaxed text-text-muted">
                  ตัดคำเติม (เอ่อ อ่า อืม) และคำที่พูดซ้ำติดกันออก — ถ้าเลือก AI ด้านล่างด้วย
                  จะตัดประโยคที่พูดผิดแล้วพูดใหม่ (retake/blooper) ให้เหลือเทคที่ดีที่สุด
                </span>
              </span>
              <input
                type="checkbox"
                checked={cutFlubs}
                onChange={(e) => setCutFlubs(e.target.checked)}
                className="mt-0.5 h-5 w-5 shrink-0 accent-primary"
              />
            </label>

            {/* เพลงประกอบ (BGM) + ตัดเสียงร้อง */}
            <div className="mb-4 rounded-lg border border-border bg-surface-muted p-3">
              <span className="mb-1 flex items-center gap-2 text-sm font-semibold text-text-secondary">
                <AudioLines className="h-4 w-4 text-primary" />
                เพลงประกอบ (ไม่บังคับ)
              </span>
              <p className="mb-2 text-xs leading-relaxed text-text-muted">
                อัปโหลดเพลงคลอทั้งคลิป — เปิด &ldquo;ตัดเสียงร้อง&rdquo; เพื่อเหลือแต่ดนตรี (AI demucs)
              </p>
              <input
                ref={bgmRef}
                type="file"
                accept="audio/*,.mp3,.wav,.m4a,.aac"
                hidden
                onChange={(e) => setBgmFile(e.target.files?.[0] ?? null)}
              />
              <div className="flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => bgmRef.current?.click()}>
                  <UploadCloud className="h-4 w-4" />
                  {bgmFile ? 'เปลี่ยนเพลง' : 'เลือกเพลง'}
                </Button>
                {bgmFile && (
                  <span className="flex min-w-0 flex-1 items-center gap-1 text-xs text-text-secondary">
                    <span className="truncate">{bgmFile.name}</span>
                    <button
                      type="button"
                      onClick={() => setBgmFile(null)}
                      className="shrink-0 text-text-muted hover:text-danger"
                      aria-label="ลบเพลง"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </span>
                )}
              </div>
              {bgmFile && (
                <label className="mt-2 flex items-center gap-2 text-sm text-text-secondary">
                  <input
                    type="checkbox"
                    checked={removeVocals}
                    onChange={(e) => setRemoveVocals(e.target.checked)}
                    className="h-4 w-4 accent-primary"
                  />
                  ตัดเสียงร้องออก เหลือแต่ดนตรี (AI)
                </label>
              )}
            </div>

            {/* ซาวด์เอฟเฟกต์ (SFX) — อัปโหลดเอง */}
            <div className="mb-4 rounded-lg border border-border bg-surface-muted p-3">
              <span className="mb-1 flex items-center gap-2 text-sm font-semibold text-text-secondary">
                <Sparkles className="h-4 w-4 text-primary" />
                ซาวด์เอฟเฟกต์ (ไม่บังคับ)
              </span>
              <p className="mb-2 text-xs leading-relaxed text-text-muted">
                อัปโหลดเสียงเอง — วูช (ตรงรอยต่อคลิป) · เปิดคลิป · เน้นคำ (ใส่หลายไฟล์สลับเสียงได้)
              </p>
              <div className="space-y-2">
                <SfxRow label="💨 วูช (รอยต่อ)" file={whooshFile} onPick={() => whooshRef.current?.click()} onClear={() => setWhooshFile(null)} />
                <SfxRow label="🎬 เปิดคลิป" file={introFile} onPick={() => introRef.current?.click()} onClear={() => setIntroFile(null)} />
                <SfxRow label={`✨ เน้นคำ${dingFiles.length ? ` (${dingFiles.length})` : ''}`} file={dingFiles[0] ?? null} onPick={() => dingRef.current?.click()} onClear={() => setDingFiles([])} />
              </div>
              <input ref={whooshRef} type="file" accept="audio/*" hidden onChange={(e) => setWhooshFile(e.target.files?.[0] ?? null)} />
              <input ref={introRef} type="file" accept="audio/*" hidden onChange={(e) => setIntroFile(e.target.files?.[0] ?? null)} />
              <input ref={dingRef} type="file" accept="audio/*" multiple hidden onChange={(e) => setDingFiles(e.target.files ? Array.from(e.target.files) : [])} />
            </div>

            {/* Hook เปิดคลิป — โลโก้ + ข้อความ (ฝังลงวิดีโอ) */}
            <div className="mb-4 rounded-lg border border-border bg-surface-muted p-3">
              <span className="mb-1 flex items-center gap-2 text-sm font-semibold text-text-secondary">
                <Film className="h-4 w-4 text-primary" />
                Hook เปิดคลิป (ไม่บังคับ)
              </span>
              <p className="mb-2 text-xs leading-relaxed text-text-muted">
                อัปโหลดโลโก้ 1–2 อัน + ใส่ข้อความใหญ่ — ระบบฝังลงช่วงเปิดคลิป (สไลด์เด้งเข้า)
              </p>
              <Input value={hookTitle} onChange={(e) => setHookTitle(e.target.value)} placeholder="ข้อความใหญ่ เช่น ตัดต่อ (เว้นว่าง = ไม่ใส่)" />
              <input ref={hookLogoRef} type="file" accept="image/*" multiple hidden onChange={(e) => setHookLogos(e.target.files ? Array.from(e.target.files).slice(0, 2) : [])} />
              <div className="mt-2 flex items-center gap-2">
                <Button type="button" variant="secondary" size="sm" onClick={() => hookLogoRef.current?.click()}>
                  <UploadCloud className="h-4 w-4" />
                  {hookLogos.length ? `โลโก้ ${hookLogos.length} รูป` : 'อัปโหลดโลโก้'}
                </Button>
                {hookLogos.length > 0 && (
                  <button type="button" onClick={() => setHookLogos([])} className="text-text-muted hover:text-danger" aria-label="ลบโลโก้">
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>

            <label className="mb-4 block">
              <span className="mb-1.5 block text-sm font-semibold text-text-secondary">ข้อความ Hook (เขียวตัวใหญ่ช่วงเปิดคลิป)</span>
              <Input
                value={hookText}
                onChange={(e) => setHookText(e.target.value)}
                placeholder="เช่น คนพูดรัวๆ มักพรีเซนต์ไม่ดี (เว้นว่าง = ไม่ใส่)"
              />
            </label>

            <div className="mb-4 rounded-lg border border-border bg-surface-muted p-3">
              <span className="mb-1 block text-sm font-semibold text-text-secondary">
                จำนวนคำต่อ 1 ซับ
              </span>
              <p className="mb-2 text-xs leading-relaxed text-text-muted">
                กำหนดว่าซับแต่ละอันขึ้นกี่คำ (เช่น 3 = ขึ้นทีละ 3 คำ) — เลือก &ldquo;อัตโนมัติ&rdquo; ให้ระบบจัดวลีตามจังหวะพูดเอง
              </p>
              <div className="flex flex-wrap gap-2">
                {[
                  { v: 0, label: 'อัตโนมัติ' },
                  { v: 1, label: '1 คำ' },
                  { v: 2, label: '2 คำ' },
                  { v: 3, label: '3 คำ' },
                  { v: 4, label: '4 คำ' },
                  { v: 5, label: '5 คำ' },
                  { v: 6, label: '6 คำ' },
                ].map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setWordsPerCap(opt.v)}
                    className={`rounded-md border px-3 py-1.5 text-sm font-medium transition ${
                      wordsPerCap === opt.v
                        ? 'border-primary bg-primary text-white'
                        : 'border-border bg-surface text-text-secondary hover:border-primary/50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="mb-5 rounded-lg border border-border bg-surface-muted p-3">
              <span className="mb-1 block text-xs font-semibold text-text-secondary">
                AI ตรวจแก้ภาษาไทยในซับ (ฟรี · ไม่บังคับ)
              </span>
              <p className="mb-2 text-xs leading-relaxed text-text-muted">
                ไม่เลือกก็ได้ — ระบบตัด Dead air และจัดจังหวะซับให้ตรงเสียงพูดอัตโนมัติอยู่แล้ว
                ส่วนนี้ช่วยแก้เฉพาะคำที่ถอดเสียงผิดให้แม่นขึ้นอีกชั้น
              </p>
              <div className="space-y-2">
                <Select
                  value={settings.thaiCheckProvider}
                  onChange={(e) => setSettings({ thaiCheckProvider: e.target.value as Settings['thaiCheckProvider'] })}
                >
                  <option value="">ไม่ใช้ AI (ข้ามขั้นตอนนี้ ใช้ซับตามที่ถอดเสียงได้)</option>
                  <option value="groq">Groq — ฟรี · เร็ว · แนะนำ</option>
                  <option value="cerebras">Cerebras — ฟรี 1 ล้านโทเคน/วัน</option>
                  <option value="openrouter">OpenRouter — รวมรุ่นฟรีหลายตัว</option>
                </Select>
                {settings.thaiCheckProvider && (
                  <>
                    <Input
                      value={settings.thaiCheckKey}
                      onChange={(e) => setSettings({ thaiCheckKey: e.target.value })}
                      placeholder={`API key ของ ${THAI_CHECK_PROVIDERS[settings.thaiCheckProvider]?.label || settings.thaiCheckProvider}`}
                    />
                    <p className="text-xs text-text-muted">
                      ขอ key ฟรีที่{' '}
                      <a
                        href={THAI_CHECK_PROVIDERS[settings.thaiCheckProvider]?.keyUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline"
                      >
                        {THAI_CHECK_PROVIDERS[settings.thaiCheckProvider]?.keyUrl.replace('https://', '')}
                      </a>{' '}
                      (ล็อกอินด้วย Google ได้ ไม่ต้องผูกบัตร)
                    </p>
                  </>
                )}
              </div>
            </div>

            <div className="grid gap-3">
              <Button variant="primary" size="lg" className="w-full" loading={busy === 'zip'} disabled={!files.length || isBusy} onClick={downloadPackage}>
                <Download className="h-4 w-4" />
                ดาวน์โหลดแพ็กเกจ
              </Button>
              <Button variant="outline" size="lg" className="w-full" loading={busy === 'capcut'} disabled={!files.length || isBusy} onClick={createCapCutProject}>
                <Scissors className="h-4 w-4" />
                สร้างใน CapCut
              </Button>
            </div>

            <div className="mt-5 rounded-lg border border-border bg-surface-muted p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-text-secondary">
                <ShieldCheck className="h-4 w-4 text-success" />
                ประมวลผลบนเครื่องนี้
              </div>
              <p className="mt-1 text-xs text-text-muted">ไฟล์ไม่ถูกส่งไปเก็บบนระบบภายนอก</p>
            </div>

            {isBusy && (
              <div className="mt-4 rounded-lg border border-border bg-surface-muted p-3 text-sm text-text-secondary">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex min-w-0 items-center gap-2 font-semibold">
                    <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
                    <span className="truncate">{job?.phase || (busy === 'zip' ? 'กำลังวิเคราะห์เสียงและทำซับ' : 'กำลังสร้างโปรเจกต์ CapCut')}</span>
                  </div>
                  <span className="shrink-0 tabular-nums text-xs font-semibold text-text-muted">{Math.round(job?.progress ?? 0)}%</span>
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-subtle">
                  <div
                    className="h-full rounded-full grad-hero transition-[width] duration-500 ease-out"
                    style={{ width: `${Math.max(3, Math.min(100, job?.progress ?? 3))}%` }}
                  />
                </div>
                {job?.log && job.log.length > 0 && (
                  <pre className="mt-3 max-h-28 overflow-auto whitespace-pre-wrap break-words rounded-md bg-bg-subtle p-2 text-[11px] leading-relaxed text-text-muted">
                    {job.log.slice(-6).join('\n')}
                  </pre>
                )}
                <Button variant="ghost" size="sm" className="mt-3 w-full" onClick={cancelCurrentJob}>
                  <Ban className="h-4 w-4" />
                  ยกเลิกงาน
                </Button>
              </div>
            )}

            {success && (
              <div className="mt-4">
                <Alert tone="success">
                  <span className="inline-flex items-start gap-2">
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span className="whitespace-pre-wrap">{success}</span>
                  </span>
                </Alert>
              </div>
            )}

            {error && (
              <div className="mt-4">
                <Alert tone="danger">
                  <div className="flex items-start gap-2 whitespace-pre-wrap">
                    <Trash2 className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                </Alert>
              </div>
            )}
          </div>
        </aside>
      </div>

      {/* Footer — โครงแบบ tamsub.com */}
      <footer className="mt-16 border-t border-border pt-8 text-center text-sm text-text-muted">
        <div className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2">
          <a href="/guide" className="transition-colors hover:text-primary">
            FAQ / วิธีใช้
          </a>
          <a
            href="https://github.com/Onpreyaq5/capcut-easy-cut/issues/new?labels=enhancement"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-primary"
          >
            แนะนำฟีเจอร์
          </a>
          <a
            href="https://github.com/Onpreyaq5/capcut-easy-cut/issues/new?labels=bug"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-primary"
          >
            แจ้งบัค
          </a>
          <a
            href="https://github.com/Onpreyaq5/capcut-easy-cut"
            target="_blank"
            rel="noreferrer"
            className="transition-colors hover:text-primary"
          >
            ติดต่อทีมงาน
          </a>
        </div>
        <p className="mt-4 text-xs">CAPCUT Easy CUT — ประมวลผลบนเครื่องคุณ 100% ไม่อัปโหลดวิดีโอขึ้นเซิร์ฟเวอร์</p>
      </footer>
    </div>
  );
}
