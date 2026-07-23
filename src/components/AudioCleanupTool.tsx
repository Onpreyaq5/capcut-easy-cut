'use client';
// ทำความสะอาดไฟล์เสียงล้วน (ไม่มีวิดีโอ) — ตัดคำพูดติดขัด/พูดซ้ำ + ตัดช่วงเงียบ + AI แก้คำ/เทียบ 2 โมเดล
// ใช้ engine เดียวกับ /auto (clean_audio.py) แต่รับเฉพาะไฟล์เสียง ไม่ต้องมีวิดีโอ
import { useRef, useState } from 'react';
import { AudioLines, Ban, CheckCircle2, Loader2, Music, UploadCloud, Wand2, X } from 'lucide-react';
import { Alert, Badge, Button, Input, Select } from '@/components/ui';
import { useApp } from '@/lib/store';
import type { ProviderId, Settings } from '@/lib/types';

interface JobProgress {
  status: 'running' | 'done' | 'error' | 'canceled';
  progress: number;
  phase: string;
  log: string[];
  error?: string;
}

const THAI_CHECK_PROVIDERS: Record<string, { label: string; model: string; keyUrl: string }> = {
  groq: { label: 'Groq (ฟรี · แนะนำ)', model: 'llama-3.3-70b-versatile', keyUrl: 'https://console.groq.com/keys' },
  cerebras: { label: 'Cerebras (ฟรี 1M โทเคน/วัน)', model: 'llama-3.3-70b', keyUrl: 'https://cloud.cerebras.ai/' },
  openrouter: { label: 'OpenRouter (มีรุ่นฟรี)', model: 'meta-llama/llama-3.3-70b-instruct:free', keyUrl: 'https://openrouter.ai/keys' },
};

function pickThaiCheckLlm(settings: Settings) {
  if (settings.thaiCheckProvider && settings.thaiCheckKey) {
    const meta = THAI_CHECK_PROVIDERS[settings.thaiCheckProvider];
    if (meta) return { provider: settings.thaiCheckProvider, key: settings.thaiCheckKey, model: meta.model, base: '' };
  }
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

const AUDIO_ACCEPT = 'audio/*,.wav,.mp3,.m4a,.aac,.flac,.ogg,.wma';

export default function AudioCleanupTool() {
  const { settings, setSettings } = useApp();
  const [files, setFiles] = useState<File[]>([]);
  const [name, setName] = useState('เสียงสะอาด');
  const [keyterms, setKeyterms] = useState('');
  const [deadAir, setDeadAir] = useState(true);
  const [cutFlubs, setCutFlubs] = useState(true);
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<JobProgress | null>(null);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const jobIdRef = useRef('');
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const thaiCheckLlm = pickThaiCheckLlm(settings);

  const addFiles = (list: FileList) => {
    setFiles((prev) => [...prev, ...Array.from(list)]);
    setError('');
    setSuccess('');
  };
  const removeFile = (i: number) => setFiles((prev) => prev.filter((_, j) => j !== i));

  function buildFormData(): FormData {
    const fd = new FormData();
    fd.append('mode', 'audio');
    fd.append('name', name.trim() || 'เสียงสะอาด');
    fd.append('deadAir', deadAir ? 'on' : 'off');
    if (cutFlubs) fd.append('cutFlubs', 'on');
    if (keyterms.trim()) fd.append('keyterms', keyterms.trim());
    if (thaiCheckLlm) {
      fd.append('llmProvider', thaiCheckLlm.provider);
      fd.append('llmKey', thaiCheckLlm.key);
      fd.append('llmModel', thaiCheckLlm.model);
      fd.append('llmBase', thaiCheckLlm.base);
      if (settings.compareModels) fd.append('compareModels', 'on');
    }
    files.forEach((f) => fd.append('clips', f));
    return fd;
  }

  function finishJob() {
    if (pollRef.current) clearTimeout(pollRef.current);
    pollRef.current = null;
    jobIdRef.current = '';
    setBusy(false);
    setJob(null);
  }

  function pollStatus(jobId: string) {
    const tick = async () => {
      if (jobIdRef.current !== jobId) return;
      try {
        const res = await fetch(`/api/easycut/status/${jobId}`, { cache: 'no-store' });
        if (!res.ok) {
          const body = await res.json().catch(() => null);
          throw new Error(body?.error || 'ติดตามสถานะงานไม่สำเร็จ');
        }
        const s = (await res.json()) as JobProgress;
        setJob({ status: s.status, progress: s.progress, phase: s.phase, log: s.log || [], error: s.error });

        if (s.status === 'done') {
          const r = await fetch(`/api/easycut/result/${jobId}`);
          if (!r.ok) throw new Error('ดาวน์โหลดผลลัพธ์ไม่สำเร็จ');
          const blob = await r.blob();
          const dl = filenameFromDisposition(r.headers.get('Content-Disposition'), `${name || 'เสียงสะอาด'}_cleaned.zip`);
          downloadBlob(blob, dl);
          setSuccess('ดาวน์โหลดแพ็กเกจแล้ว: ไฟล์เสียงที่ตัดแล้ว + transcript/SRT');
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

  async function runJob() {
    if (!files.length) {
      setError('ลากไฟล์เสียงเข้ามาก่อน แล้วค่อยเริ่มประมวลผล');
      return;
    }
    setBusy(true);
    setError('');
    setSuccess('');
    setJob({ status: 'running', progress: 0, phase: 'กำลังอัปโหลดไฟล์เสียง...', log: [] });
    try {
      const res = await fetch('/api/easycut/start?mode=audio', { method: 'POST', body: buildFormData() });
      const body = await res.json().catch(() => null);
      if (!res.ok || !body?.ok || !body.jobId) throw new Error(body?.error || 'เริ่มงานไม่สำเร็จ');
      jobIdRef.current = body.jobId;
      pollStatus(body.jobId);
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
  }

  return (
    <div className="container-page py-8 lg:py-12">
      <div className="mb-8 text-center">
        <Badge tone="ai" className="mb-4">
          <Music className="h-3.5 w-3.5" />
          ทำความสะอาดไฟล์เสียง
        </Badge>
        <h1 className="mx-auto max-w-2xl font-heading text-3xl font-bold leading-tight text-text-primary sm:text-4xl">
          ตัดคำพูดติดขัด/พูดซ้ำ + ตัดช่วงเงียบ ออกจากไฟล์เสียงล้วน
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-text-secondary">
          ไม่ต้องมีวิดีโอ — อัปโหลดไฟล์เสียง (WAV/MP3/M4A) ที่พูดผิดบ่อย/พูดวน แล้วให้ระบบตัดเก็บเฉพาะเทคที่ดีที่สุดให้อัตโนมัติ
        </p>
      </div>

      <div className="mx-auto max-w-2xl space-y-5">
        {error && <Alert tone="danger">{error}</Alert>}
        {success && <Alert tone="success">{success}</Alert>}

        <div
          className="rounded-2xl border-2 border-dashed border-border bg-surface/40 p-6 text-center transition-colors hover:border-primary/50"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => { e.preventDefault(); if (e.dataTransfer.files.length) addFiles(e.dataTransfer.files); }}
        >
          <input ref={fileRef} type="file" accept={AUDIO_ACCEPT} multiple hidden onChange={(e) => e.target.files && addFiles(e.target.files)} />
          <UploadCloud className="mx-auto mb-2 h-8 w-8 text-primary" />
          <p className="text-sm font-semibold text-text-primary">ลากไฟล์เสียงใส่ หรือแตะเพื่อเลือก</p>
          <p className="mt-1 text-xs text-text-muted">WAV · MP3 · M4A · AAC · FLAC · OGG</p>
          <Button variant="secondary" size="sm" className="mt-3" onClick={() => fileRef.current?.click()}>เลือกไฟล์เสียง</Button>
        </div>

        {files.length > 0 && (
          <div className="space-y-1.5">
            {files.map((f, i) => (
              <div key={i} className="flex items-center justify-between gap-2 rounded-lg border border-border bg-surface px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2 text-text-secondary">
                  <AudioLines className="h-4 w-4 shrink-0 text-primary" />
                  <span className="truncate">{f.name}</span>
                  <span className="shrink-0 text-xs text-text-muted">({(f.size / 1024 / 1024).toFixed(1)} MB)</span>
                </span>
                <button type="button" onClick={() => removeFile(i)} className="shrink-0 text-text-muted hover:text-danger" aria-label="ลบไฟล์">
                  <X className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-text-secondary">ชื่อโปรเจกต์</span>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="เสียงสะอาด" />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold text-text-secondary">ชื่อคน / แบรนด์ / ศัพท์เฉพาะ (ไม่บังคับ)</span>
          <textarea
            value={keyterms}
            onChange={(e) => setKeyterms(e.target.value)}
            rows={2}
            maxLength={1000}
            placeholder="เช่น ChatGPT, Growtopia, ชื่อแบรนด์ของคุณ"
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 text-sm text-text-primary outline-none focus:border-primary"
          />
        </label>

        <label className="flex items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted p-3">
          <span className="text-sm font-semibold text-text-secondary">ตัดช่วงเงียบ (dead air)</span>
          <input type="checkbox" checked={deadAir} onChange={(e) => setDeadAir(e.target.checked)} className="h-5 w-5 accent-primary" />
        </label>

        <label className="flex items-start justify-between gap-3 rounded-lg border border-border bg-surface-muted p-3">
          <span className="flex flex-col gap-1">
            <span className="text-sm font-semibold text-text-secondary">ตัดคำพูดติดขัด / พูดผิด</span>
            <span className="text-xs leading-relaxed text-text-muted">ตัดคำเติม (เอ่อ อ่า อืม) และประโยคที่พูดผิดแล้วพูดใหม่ ให้เหลือเทคที่ดีที่สุด</span>
          </span>
          <input type="checkbox" checked={cutFlubs} onChange={(e) => setCutFlubs(e.target.checked)} className="mt-0.5 h-5 w-5 shrink-0 accent-primary" />
        </label>

        <div className="rounded-lg border border-border bg-surface-muted p-3">
          <span className="mb-1 block text-xs font-semibold text-text-secondary">AI ตรวจแก้ภาษาไทยในซับ (ฟรี · ไม่บังคับ)</span>
          <p className="mb-2 text-xs leading-relaxed text-text-muted">
            ไม่เลือกก็ได้ — ระบบตัดช่วงเงียบและจัดจังหวะให้ตรงเสียงพูดอัตโนมัติอยู่แล้ว ส่วนนี้ช่วยแก้เฉพาะคำที่ถอดผิดให้แม่นขึ้นอีกชั้น
          </p>
          <div className="space-y-2">
            <Select
              value={settings.thaiCheckProvider}
              onChange={(e) => setSettings({ thaiCheckProvider: e.target.value as Settings['thaiCheckProvider'] })}
            >
              <option value="">ไม่ใช้ AI (ข้ามขั้นตอนนี้ ใช้ตามที่ถอดเสียงได้)</option>
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
                  <a href={THAI_CHECK_PROVIDERS[settings.thaiCheckProvider]?.keyUrl} target="_blank" rel="noreferrer" className="text-primary underline">
                    {THAI_CHECK_PROVIDERS[settings.thaiCheckProvider]?.keyUrl.replace('https://', '')}
                  </a>{' '}
                  (ล็อกอินด้วย Google ได้ ไม่ต้องผูกบัตร)
                </p>
                <label className="mt-1 flex items-start gap-2 rounded-md border border-border bg-background p-2.5">
                  <input
                    type="checkbox"
                    checked={!!settings.compareModels}
                    onChange={(e) => setSettings({ compareModels: e.target.checked })}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-primary"
                  />
                  <span className="text-xs leading-relaxed text-text-secondary">
                    <span className="font-semibold">เทียบ 2 โมเดล AI (แม่นยำสูงสุด)</span>
                    <br />
                    ถอดเสียงซ้ำด้วยโมเดลคนละตัว แล้วให้ AI เทียบผลเพื่อแก้คำที่ถอดผิด/ทับศัพท์เพี้ยน
                    (เช่น &ldquo;แชทจีบีที&rdquo; → &ldquo;ChatGPT&rdquo;) แม่นขึ้นชัดเจน แต่ใช้เวลาถอดเสียงเพิ่ม ~2 เท่า
                  </span>
                </label>
              </>
            )}
          </div>
        </div>

        {!busy ? (
          <Button variant="primary" size="lg" className="w-full" disabled={!files.length} onClick={runJob}>
            <Wand2 className="h-4 w-4" />
            เริ่มทำความสะอาดเสียง
          </Button>
        ) : (
          <div className="rounded-xl border border-border bg-surface p-4">
            <div className="mb-2 flex items-center justify-between">
              <span className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <Loader2 className="h-4 w-4 animate-spin text-primary" />
                {job?.phase || 'กำลังประมวลผล...'}
              </span>
              <Button variant="ghost" size="sm" onClick={cancelCurrentJob}>
                <Ban className="h-3.5 w-3.5" /> ยกเลิก
              </Button>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-surface-muted">
              <div className="h-full bg-primary transition-all" style={{ width: `${job?.progress ?? 0}%` }} />
            </div>
          </div>
        )}

        {!busy && success && (
          <p className="flex items-center justify-center gap-1.5 text-xs text-text-muted">
            <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> เสร็จแล้ว — เช็คโฟลเดอร์ดาวน์โหลดของเบราว์เซอร์
          </p>
        )}
      </div>
    </div>
  );
}
