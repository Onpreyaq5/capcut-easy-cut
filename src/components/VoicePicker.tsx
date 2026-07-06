'use client';

import { useEffect, useState } from 'react';
import { Play, Check, Copy, ExternalLink, Volume2, RefreshCw, Square } from 'lucide-react';
import { useApp } from '@/lib/store';
import { previewBrowserVoice, previewCloudVoice, stopSpeaking } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Badge, Alert } from '@/components/ui';

const SAMPLE = 'สวัสดีครับ นี่คือเสียงพากย์ตัวอย่างของธัญกิจ ปุ๋ยภัณฑ์ นาข้าวเขียวขจี ผลผลิตเพิ่มขึ้นแน่นอน';

/** เสียงไทยของ Google Cloud TTS ที่ใช้ได้บ่อย (ฟังได้ถ้าใส่ key Google แล้ว) */
const GOOGLE_TH = [
  { id: 'th-TH-Standard-A', label: 'Standard A · หญิง · พื้นฐาน' },
  { id: 'th-TH-Neural2-C', label: 'Neural2 C · หญิง · ธรรมชาติ (แนะนำ)' },
  { id: 'th-TH-Chirp3-HD-Achernar', label: 'Chirp3 HD · หญิง · คุณภาพสูง' },
  { id: 'th-TH-Chirp3-HD-Charon', label: 'Chirp3 HD · ชาย · คุณภาพสูง' },
  { id: 'th-TH-Chirp3-HD-Puck', label: 'Chirp3 HD · ชาย · สดใส' },
];

export function VoicePicker() {
  const { settings, setSettings } = useApp();

  if (settings.ttsProvider === 'browser') return <BrowserVoices selected={settings.ttsVoiceId} onPick={(name) => setSettings({ ttsVoiceId: name })} />;
  if (settings.ttsProvider === 'google')
    return <GoogleVoices apiKey={settings.ttsKey} selected={settings.ttsVoiceId} onPick={(id) => setSettings({ ttsVoiceId: id })} />;
  return <ElevenLabsHelp />;
}

/* ---------------- เสียงในเบราว์เซอร์ (ฟรี) ---------------- */
function BrowserVoices({ selected, onPick }: { selected: string; onPick: (name: string) => void }) {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [showAll, setShowAll] = useState(false);
  const [playing, setPlaying] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
    const load = () => setVoices(window.speechSynthesis.getVoices());
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, []);

  const thai = voices.filter((v) => v.lang?.toLowerCase().startsWith('th'));
  const shown = showAll ? voices : thai;

  function play(name: string) {
    setPlaying(name);
    previewBrowserVoice(SAMPLE, name);
    setTimeout(() => setPlaying((p) => (p === name ? null : p)), 6000);
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-text-secondary">
          <Volume2 className="mr-1 inline h-4 w-4" /> เสียงในเครื่องคุณ {thai.length > 0 && <Badge tone="success">ภาษาไทย {thai.length} เสียง</Badge>}
        </span>
        <div className="flex items-center gap-2">
          <button onClick={() => { stopSpeaking(); setPlaying(null); }} className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-danger">
            <Square className="h-3 w-3" /> หยุด
          </button>
          <button onClick={() => setShowAll((s) => !s)} className="text-xs text-accent hover:underline">
            {showAll ? 'ดูเฉพาะไทย' : `ดูทุกภาษา (${voices.length})`}
          </button>
        </div>
      </div>

      {voices.length === 0 && (
        <Alert tone="warning">
          ยังไม่เจอเสียงในเครื่อง — ลองกด <RefreshCw className="inline h-3 w-3" /> รีเฟรชหน้า หรือเบราว์เซอร์อาจยังโหลดเสียงไม่เสร็จ
        </Alert>
      )}

      {voices.length > 0 && thai.length === 0 && !showAll && (
        <Alert tone="warning">
          เครื่องนี้ยังไม่มีเสียงภาษาไทย — ติดตั้งได้ที่ Windows: Settings → Time &amp; Language → Language → เพิ่ม “ไทย” แล้วเลือก Speech (หรือกด “ดูทุกภาษา” เพื่อใช้เสียงอื่นไปก่อน)
        </Alert>
      )}

      <div className="grid gap-2 sm:grid-cols-2">
        {shown.map((v) => {
          const active = selected === v.name;
          return (
            <div key={v.name} className={cn('flex items-center gap-2 rounded-md border p-2.5', active ? 'border-primary bg-primary-soft/40' : 'border-border')}>
              <button
                onClick={() => play(v.name)}
                className={cn('grid h-9 w-9 shrink-0 place-items-center rounded-full', playing === v.name ? 'bg-primary text-primary-on animate-pulse' : 'bg-surface-muted text-primary hover:bg-primary-soft')}
                aria-label="เล่นเสียง"
              >
                <Play className="h-4 w-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text-primary">{v.name}</p>
                <p className="text-[11px] text-text-muted">{v.lang}{v.localService ? ' · ในเครื่อง' : ' · ออนไลน์'}</p>
              </div>
              <button
                onClick={() => onPick(v.name)}
                className={cn('rounded-sm px-2.5 py-1.5 text-xs font-medium', active ? 'bg-primary text-primary-on' : 'border border-border text-text-secondary hover:bg-surface-muted')}
              >
                {active ? <Check className="h-3.5 w-3.5" /> : 'ใช้เสียงนี้'}
              </button>
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-xs text-text-muted">เสียงเบราว์เซอร์ใช้ฟังพรีวิว/ทำคลิปแบบเร็วได้ฟรี (เสียงในเครื่องคุณภาพดีกว่าเสียงออนไลน์) — ถ้าต้องการไฟล์เสียง .mp3 ใส่ลง CapCut ให้เลือก Google/ElevenLabs</p>
    </div>
  );
}

/* ---------------- เสียง Google Cloud TTS ---------------- */
function GoogleVoices({ apiKey, selected, onPick }: { apiKey: string; selected: string; onPick: (id: string) => void }) {
  const [loading, setLoading] = useState<string | null>(null);
  const [err, setErr] = useState('');

  async function play(id: string) {
    setErr('');
    if (!apiKey) {
      setErr('ใส่ API key ของ Google ก่อน ถึงจะฟังเสียงได้');
      return;
    }
    setLoading(id);
    try {
      await previewCloudVoice('google', apiKey, SAMPLE, id);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="mt-4">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-sm font-medium text-text-secondary">
          <Volume2 className="mr-1 inline h-4 w-4" /> เสียงไทย Google Cloud TTS
        </span>
        <a href="https://cloud.google.com/text-to-speech/docs/voices" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-accent hover:underline">
          ดูรายชื่อทั้งหมด <ExternalLink className="h-3 w-3" />
        </a>
      </div>
      {!apiKey && <Alert tone="info">ใส่ API key ของ Google ในช่องด้านบนก่อน แล้วจะกดฟังเสียงแต่ละตัวได้ (เสียงได้เป็นไฟล์ .mp3 ใส่ CapCut ได้)</Alert>}
      {err && <div className="mb-2"><Alert tone="danger">{err}</Alert></div>}
      <div className="grid gap-2">
        {GOOGLE_TH.map((v) => {
          const active = selected === v.id;
          return (
            <div key={v.id} className={cn('flex items-center gap-2 rounded-md border p-2.5', active ? 'border-primary bg-primary-soft/40' : 'border-border')}>
              <button
                onClick={() => play(v.id)}
                disabled={loading === v.id}
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-surface-muted text-primary hover:bg-primary-soft disabled:opacity-50"
              >
                {loading === v.id ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Play className="h-4 w-4" />}
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm font-medium text-text-primary">{v.id}</p>
                <p className="text-[11px] text-text-muted">{v.label}</p>
              </div>
              <button onClick={() => navigator.clipboard.writeText(v.id)} className="rounded-sm border border-border px-2 py-1.5 text-text-muted hover:bg-surface-muted" title="คัดลอก ID">
                <Copy className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => onPick(v.id)}
                className={cn('rounded-sm px-2.5 py-1.5 text-xs font-medium', active ? 'bg-primary text-primary-on' : 'border border-border text-text-secondary hover:bg-surface-muted')}
              >
                {active ? <Check className="h-3.5 w-3.5" /> : 'ใช้'}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ---------------- ElevenLabs ---------------- */
function ElevenLabsHelp() {
  return (
    <div className="mt-4">
      <Alert tone="info">
        ElevenLabs มีคลังเสียงเยอะมาก ฟัง + ก๊อป Voice ID ได้ที่คลังเสียงของเขา แล้วเอามาวางในช่อง “Voice ID” ด้านบน
      </Alert>
      <a
        href="https://elevenlabs.io/app/voice-library"
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 rounded-md border border-border px-4 py-2 text-sm font-medium text-accent hover:bg-surface-muted"
      >
        เปิดคลังเสียง ElevenLabs <ExternalLink className="h-4 w-4" />
      </a>
    </div>
  );
}
