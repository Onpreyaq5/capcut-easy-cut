'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AudioLines,
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

export function EasyCutTool() {
  const [files, setFiles] = useState<File[]>([]);
  const [projectName, setProjectName] = useState('CAPCUT_Easy_CUT');
  const [deadAir, setDeadAir] = useState(true);
  const [hookText, setHookText] = useState('');
  const settings = useApp((s) => s.settings);
  const setSettings = useApp((s) => s.setSettings);
  const thaiCheckLlm = pickThaiCheckLlm(settings);
  const [dragging, setDragging] = useState(false);
  const [busy, setBusy] = useState<BusyMode>('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

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

  async function downloadPackage() {
    if (!files.length) {
      setError('ลากคลิปเข้ามาก่อน แล้วค่อยเริ่มประมวลผล');
      return;
    }
    setBusy('zip');
    setError('');
    setSuccess('');
    try {
      const fd = new FormData();
      fd.append('name', projectName || 'CAPCUT_Easy_CUT');
      fd.append('deadAir', deadAir ? 'on' : 'off');
      files.forEach((file) => fd.append('clips', file));
      const res = await fetch('/api/easycut/process', { method: 'POST', body: fd });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        const log = body?.log ? `\n\n${body.log}` : '';
        throw new Error((body?.error || 'ประมวลผลไม่สำเร็จ') + log);
      }
      const blob = await res.blob();
      const name = filenameFromDisposition(res.headers.get('Content-Disposition'), `${projectName || 'CAPCUT_Easy_CUT'}_package.zip`);
      downloadBlob(blob, name);
      setSuccess('ดาวน์โหลดแพ็กเกจแล้ว: วิดีโอหลังตัด + smart subtitles + transcript พร้อมเข้า CapCut');
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy('');
    }
  }

  async function createCapCutProject() {
    if (!files.length) {
      setError('ลากคลิปเข้ามาก่อน แล้วค่อยสร้างโปรเจกต์ CapCut');
      return;
    }
    setBusy('capcut');
    setError('');
    setSuccess('');
    try {
      const fd = new FormData();
      fd.append('name', projectName || 'CAPCUT_Easy_CUT');
      fd.append('hook', hookText.trim());
      // AI (ถ้ามี) ใช้ตรวจแก้ภาษาไทยในซับให้แม่นขึ้น — ไม่บังคับ
      if (thaiCheckLlm) {
        fd.append('llmProvider', thaiCheckLlm.provider);
        fd.append('llmKey', thaiCheckLlm.key);
        fd.append('llmModel', thaiCheckLlm.model);
        fd.append('llmBase', thaiCheckLlm.base);
      }
      files.forEach((file) => fd.append('clips', file));
      const res = await fetch('/api/capcut/build', { method: 'POST', body: fd });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok) {
        const log = body?.log ? `\n\n${body.log}` : '';
        throw new Error((body?.error || 'สร้างโปรเจกต์ไม่สำเร็จ') + log);
      }
      // ดึงสรุปผลตรวจภาษาไทย จาก log มาแสดง
      const infoLines = String(body.log || '')
        .split('\n')
        .filter((l: string) => l.includes('[THAI]'))
        .map((l: string) => l.replace('[THAI]', 'ภาษาไทย:').trim())
        .join('\n');
      setSuccess(
        `สร้างโปรเจกต์ "${body.name}" ใน CapCut แล้ว ปิด CapCut ให้สนิทแล้วเปิดใหม่` +
          (infoLines ? `\n${infoLines}` : ''),
      );
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy('');
    }
  }

  return (
    <div className="container-page py-8 lg:py-12">
      <div className="mb-8 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px] lg:items-end">
        <div>
          <Badge tone="ai" className="mb-4">
            <Sparkles className="h-3.5 w-3.5" />
            AI audio cleanup
          </Badge>
          <h1 className="max-w-3xl font-heading text-[2.35rem] font-bold leading-[1.03] text-text-primary sm:text-6xl">
            <span className="block sm:inline">CAPCUT Easy</span>
            <span className="block sm:ml-3 sm:inline">CUT</span>
          </h1>
          <p className="mt-4 max-w-2xl text-lg text-text-secondary">
            อัปคลิปดิบ แล้วส่งออกเป็นวิดีโอที่กระชับพร้อมซับ Smart Karaoke สำหรับ CapCut ในจังหวะเดียว
          </p>
        </div>

        <div className="grid grid-cols-3 gap-2 rounded-lg border border-border bg-surface p-2 shadow-md">
          <div className="rounded-md bg-surface-muted px-3 py-3 text-center">
            <Scissors className="mx-auto mb-1.5 h-4 w-4 text-primary" />
            <p className="text-xs font-semibold text-text-secondary">Dead air</p>
          </div>
          <div className="rounded-md bg-surface-muted px-3 py-3 text-center">
            <AudioLines className="mx-auto mb-1.5 h-4 w-4 text-accent" />
            <p className="text-xs font-semibold text-text-secondary">Whisper</p>
          </div>
          <div className="rounded-md bg-surface-muted px-3 py-3 text-center">
            <FileText className="mx-auto mb-1.5 h-4 w-4 text-ai" />
            <p className="text-xs font-semibold text-text-secondary">SRT</p>
          </div>
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

            <label className="mb-4 block">
              <span className="mb-1.5 block text-sm font-semibold text-text-secondary">ข้อความ Hook (เขียวตัวใหญ่ช่วงเปิดคลิป)</span>
              <Input
                value={hookText}
                onChange={(e) => setHookText(e.target.value)}
                placeholder="เช่น คนพูดรัวๆ มักพรีเซนต์ไม่ดี (เว้นว่าง = ไม่ใส่)"
              />
            </label>

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
                <div className="flex items-center gap-2 font-semibold">
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  {busy === 'zip' ? 'กำลังวิเคราะห์เสียงและทำซับ' : 'กำลังสร้างโปรเจกต์ CapCut'}
                </div>
                <div className="mt-3 h-2 overflow-hidden rounded-full bg-bg-subtle">
                  <div className="h-full w-2/3 animate-pulse rounded-full grad-hero" />
                </div>
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
    </div>
  );
}
