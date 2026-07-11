'use client';
// ตัวแก้ซับ WYSIWYG — เลียนแบบ UX tamsub.com (วิดีโอ 9:16 + พรีวิวซับสด + 3 แท็บ ข้อความ/เทมเพลต/สไตล์)
// ปรับสถาปัตยกรรมให้รันในเครื่อง: ถอดเสียงผ่าน Python engine (faster-whisper), ส่งออก SRT / เข้า CapCut
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Upload,
  Type,
  LayoutTemplate,
  Palette,
  Play,
  Pause,
  Download,
  Loader2,
  FileVideo,
  Scissors,
} from 'lucide-react';
import {
  SubLine,
  SubStyle,
  SubWord,
  DEFAULT_STYLE,
  FONTS,
  SUB_COLORS,
  TEMPLATES,
  TemplateId,
  groupWords,
  lineStart,
  lineEnd,
  toSRT,
} from '@/lib/subtitleTypes';
import { SubtitleOverlay, OverlayKeyframes } from './SubtitleOverlay';

type Tab = 'text' | 'template' | 'style';

export default function SubtitleEditor() {
  const [videoUrl, setVideoUrl] = useState('');
  const [videoName, setVideoName] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [allWords, setAllWords] = useState<SubWord[]>([]);
  const [lines, setLines] = useState<SubLine[]>([]);
  const [style, setStyle] = useState<SubStyle>(DEFAULT_STYLE);
  const [tab, setTab] = useState<Tab>('style');
  const [transcribing, setTranscribing] = useState(false);
  const [progress, setProgress] = useState('');
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);

  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const srtInput = useRef<HTMLInputElement>(null);
  const [box, setBox] = useState({ w: 360, h: 640 });

  // จัดคำเป็นบรรทัดใหม่เมื่อ wordsPerLine เปลี่ยน
  const regroup = useCallback((words: SubWord[], wpl: number) => {
    setLines(groupWords(words, wpl));
  }, []);

  // โหมด demo (?demo=1) — โหลดคลิป+ซับตัวอย่างอัตโนมัติ เพื่อทดสอบพรีวิว (dev)
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!new URLSearchParams(window.location.search).has('demo')) return;
    const demo: SubWord[] = [
      { text: 'สวัสดี', start: 0.3, end: 0.9 }, { text: 'ครับ', start: 0.9, end: 1.4 },
      { text: 'วันนี้', start: 1.5, end: 2.1 }, { text: 'จะ', start: 2.1, end: 2.4 },
      { text: 'สอน', start: 2.4, end: 2.9 }, { text: 'ตัดต่อ', start: 3.0, end: 3.7 },
      { text: 'คลิป', start: 3.8, end: 4.3 }, { text: 'ให้', start: 4.3, end: 4.6 },
      { text: 'ปัง', start: 4.7, end: 5.3 }, { text: 'มาก', start: 5.3, end: 5.9 },
    ];
    setVideoUrl('/demo.mp4');
    setVideoName('demo.mp4');
    setAllWords(demo);
    setLines(groupWords(demo, DEFAULT_STYLE.wordsPerLine));
    // โหลดเป็น File ด้วย เพื่อให้ปุ่ม "ส่งเข้า CapCut" ใช้งานได้ในโหมด demo
    fetch('/demo.mp4').then((r) => r.blob()).then((b) => setVideoFile(new File([b], 'demo.mp4', { type: 'video/mp4' }))).catch(() => undefined);
  }, []);

  const onPickVideo = (f: File) => {
    const url = URL.createObjectURL(f);
    setVideoFile(f);
    setVideoUrl(url);
    setVideoName(f.name);
    setAllWords([]);
    setLines([]);
  };

  const measure = () => {
    if (boxRef.current) {
      const r = boxRef.current.getBoundingClientRect();
      setBox({ w: r.width, h: r.height });
    }
  };

  // ถอดเสียงผ่าน engine (transcribe-only)
  const transcribe = async () => {
    if (!videoFile) return;
    setTranscribing(true);
    setProgress('กำลังอัปโหลด + ถอดเสียง (อาจใช้เวลาสักครู่)…');
    try {
      const fd = new FormData();
      fd.append('clip', videoFile);
      const res = await fetch('/api/easycut/transcribe', { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'ถอดเสียงไม่สำเร็จ');
      const words: SubWord[] = (data.words || []).map((w: { text?: string; word?: string; start: number; end: number }) => ({
        text: (w.text ?? w.word ?? '').trim(),
        start: w.start,
        end: w.end,
      })).filter((w: SubWord) => w.text);
      setAllWords(words);
      regroup(words, style.wordsPerLine);
      setTab('text');
      setProgress(`ถอดเสียงเสร็จ — ได้ ${words.length} คำ`);
    } catch (e) {
      setProgress('❌ ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setTranscribing(false);
    }
  };

  const patchStyle = (p: Partial<SubStyle>) => {
    setStyle((s) => {
      const next = { ...s, ...p };
      if (p.wordsPerLine !== undefined) regroup(allWords, p.wordsPerLine);
      return next;
    });
  };

  const editWord = (li: number, wi: number, text: string) => {
    setLines((ls) => ls.map((l, i) => (i === li ? { ...l, words: l.words.map((w, j) => (j === wi ? { ...w, text } : w)) } : l)));
  };

  const play = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };

  const seek = (sec: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = Math.max(0, Math.min(dur || 0, sec));
  };

  const [building, setBuilding] = useState(false);
  const sendToCapcut = async () => {
    if (!videoFile || !hasSub) return;
    setBuilding(true);
    setProgress('กำลังสร้างโปรเจกต์ CapCut… (ปิด CapCut ให้สนิทก่อนนะ)');
    try {
      const fd = new FormData();
      fd.append('video', videoFile);
      fd.append('name', (videoName.replace(/\.[^.]+$/, '') || 'CAPCUT_Easy_CUT') + '_Editor');
      fd.append('project', JSON.stringify({ lines, style }));
      const res = await fetch('/api/easycut/editor-build', { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'สร้างไม่สำเร็จ');
      setProgress(`✅ สร้างโปรเจกต์ CapCut "${data.name}" แล้ว (${data.captions} แคปชัน) — เปิด CapCut โปรเจกต์จะอยู่บนสุด`);
    } catch (e) {
      setProgress('❌ ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBuilding(false);
    }
  };

  const exportSRT = () => {
    const srt = toSRT(lines, style.noSpace);
    const blob = new Blob([srt], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (videoName.replace(/\.[^.]+$/, '') || 'subtitle') + '.srt';
    a.click();
  };

  const importSRT = async (f: File) => {
    const txt = await f.text();
    const words: SubWord[] = [];
    const blocks = txt.replace(/\r/g, '').split(/\n\n+/);
    const tp = (s: string) => {
      const m = s.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
      if (!m) return 0;
      return +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000;
    };
    for (const b of blocks) {
      const ln = b.split('\n');
      const ti = ln.findIndex((x) => x.includes('-->'));
      if (ti < 0) continue;
      const [a, z] = ln[ti].split('-->');
      const text = ln.slice(ti + 1).join(' ').trim();
      if (text) words.push({ text, start: tp(a), end: tp(z) });
    }
    setAllWords(words);
    setLines(words.map((w, i) => ({ id: `imp${i}`, words: [w] })));
    setProgress(`นำเข้า SRT — ${words.length} บรรทัด`);
  };

  const hasSub = lines.length > 0;

  return (
    <div className="mx-auto max-w-6xl px-4 py-6">
      <OverlayKeyframes />
      {/* แถบบน */}
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">ตัวแก้ซับ (Editor)</h1>
          <p className="text-xs text-text-muted">อัปคลิป → ถอดเสียง → แก้คำ/เลือกเทมเพลต/สไตล์ → ส่งออก SRT หรือเข้า CapCut</p>
        </div>
        <div className="flex items-center gap-2">
          <input ref={srtInput} type="file" accept=".srt" hidden onChange={(e) => e.target.files?.[0] && importSRT(e.target.files[0])} />
          <button onClick={() => srtInput.current?.click()} className="rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-primary/50">
            นำเข้า SRT
          </button>
          <button onClick={exportSRT} disabled={!hasSub} className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text-secondary hover:border-primary/50 disabled:opacity-40">
            <Download size={14} /> ส่งออก SRT
          </button>
          <button onClick={sendToCapcut} disabled={!hasSub || !videoFile || building} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
            {building ? <Loader2 size={14} className="animate-spin" /> : <Scissors size={14} />} ส่งเข้า CapCut
          </button>
        </div>
      </div>

      {!videoUrl ? (
        <button
          onClick={() => fileInput.current?.click()}
          className="flex min-h-[320px] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-surface/40 text-text-muted transition-colors hover:border-primary/60 hover:text-text-secondary"
        >
          <Upload size={40} />
          <span className="text-sm font-semibold">ลากคลิปใส่ หรือคลิกเพื่อเลือก</span>
          <span className="text-xs">MP4 · MOV · MKV · WEBM</span>
          <input ref={fileInput} type="file" accept="video/*" hidden onChange={(e) => e.target.files?.[0] && onPickVideo(e.target.files[0])} />
        </button>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          {/* ซ้าย: วิดีโอ + พรีวิว */}
          <div>
            <div ref={boxRef} className="relative mx-auto aspect-[9/16] w-full max-w-[360px] overflow-hidden rounded-xl bg-black">
              <video
                ref={videoRef}
                src={videoUrl}
                className="h-full w-full object-contain"
                onLoadedMetadata={(e) => { setDur(e.currentTarget.duration); measure(); }}
                onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
                onPause={() => setPlaying(false)}
                onPlay={() => setPlaying(true)}
                playsInline
              />
              {/* TikTok safe zone */}
              <div className="pointer-events-none absolute inset-x-0 top-[12%] bottom-[18%] border-x border-white/10" />
              {hasSub && <SubtitleOverlay videoRef={videoRef} lines={lines} style={style} boxW={box.w} boxH={box.h} />}
            </div>

            {/* คอนโทรลเล่น + timeline */}
            <div className="mx-auto mt-3 max-w-[360px]">
              <div className="flex items-center gap-3">
                <button onClick={play} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white">
                  {playing ? <Pause size={16} /> : <Play size={16} />}
                </button>
                <input type="range" min={0} max={dur || 0} step={0.01} value={cur} onChange={(e) => seek(Number(e.target.value))} className="flex-1 accent-primary" />
                <span className="w-16 text-right text-[11px] tabular-nums text-text-muted">{fmt(cur)}/{fmt(dur)}</span>
              </div>

              {!hasSub && (
                <button
                  onClick={transcribe}
                  disabled={transcribing}
                  className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {transcribing ? <Loader2 size={16} className="animate-spin" /> : <Type size={16} />}
                  {transcribing ? 'กำลังถอดเสียง…' : 'ถอดเสียงทำซับอัตโนมัติ'}
                </button>
              )}
              {progress && <p className="mt-2 text-center text-xs text-text-muted">{progress}</p>}
              <button onClick={() => { setVideoUrl(''); setVideoFile(null); }} className="mt-2 flex w-full items-center justify-center gap-1 text-[11px] text-text-muted hover:text-text-secondary">
                <FileVideo size={12} /> เปลี่ยนคลิป
              </button>
            </div>
          </div>

          {/* ขวา: แท็บ */}
          <div className="rounded-xl border border-border bg-surface">
            <div className="flex border-b border-border">
              <TabBtn active={tab === 'text'} onClick={() => setTab('text')} icon={<Type size={15} />} label="ข้อความ" />
              <TabBtn active={tab === 'template'} onClick={() => setTab('template')} icon={<LayoutTemplate size={15} />} label="เทมเพลต" />
              <TabBtn active={tab === 'style'} onClick={() => setTab('style')} icon={<Palette size={15} />} label="สไตล์" />
            </div>
            <div className="max-h-[560px] overflow-y-auto p-4">
              {tab === 'text' && <TextTab lines={lines} cur={cur} onSeek={seek} onEdit={editWord} />}
              {tab === 'template' && <TemplateTab value={style.template} onPick={(id) => patchStyle({ template: id })} />}
              {tab === 'style' && <StyleTab style={style} onChange={patchStyle} />}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function fmt(s: number) {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${active ? 'border-b-2 border-primary text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
      {icon} {label}
    </button>
  );
}

// ---------- แท็บ ข้อความ (แก้ทีละคำ) ----------
function TextTab({ lines, cur, onSeek, onEdit }: { lines: SubLine[]; cur: number; onSeek: (s: number) => void; onEdit: (li: number, wi: number, t: string) => void }) {
  if (!lines.length) return <p className="text-center text-xs text-text-muted">ยังไม่มีซับ — กด “ถอดเสียงทำซับอัตโนมัติ” ก่อน</p>;
  return (
    <div className="space-y-2">
      {lines.map((l, li) => {
        const active = cur >= lineStart(l) && cur < lineEnd(l);
        return (
          <div key={l.id} className={`rounded-lg border p-2 ${active ? 'border-primary bg-primary/5' : 'border-border'}`}>
            <button onClick={() => onSeek(lineStart(l))} className="mb-1 text-[10px] font-mono text-text-muted hover:text-primary">
              {fmt(lineStart(l))} → {fmt(lineEnd(l))}
            </button>
            <div className="flex flex-wrap gap-1">
              {l.words.map((w, wi) => (
                <input
                  key={wi}
                  value={w.text}
                  onChange={(e) => onEdit(li, wi, e.target.value)}
                  className="min-w-[2ch] rounded border border-border bg-background px-1.5 py-0.5 text-xs text-text-primary focus:border-primary focus:outline-none"
                  style={{ width: `${Math.max(2, w.text.length + 1)}ch` }}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- แท็บ เทมเพลต ----------
function TemplateTab({ value, onPick }: { value: TemplateId; onPick: (id: TemplateId) => void }) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {TEMPLATES.map((tp) => (
        <button
          key={tp.id}
          onClick={() => onPick(tp.id)}
          className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors ${value === tp.id ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
        >
          <div className="flex h-14 w-full items-center justify-center rounded bg-black">
            <span
              className="text-sm font-extrabold"
              style={{
                color: tp.karaoke ? '#FFE400' : '#fff',
                textShadow: '1px 1px 0 #000,-1px -1px 0 #000,1px -1px 0 #000,-1px 1px 0 #000' + (tp.neon ? ',0 0 8px #FFE400' : ''),
                ...(tp.box ? { background: 'rgba(0,0,0,.6)', borderRadius: 4, padding: '2px 6px' } : {}),
              }}
            >
              ตัวอย่าง
            </span>
          </div>
          <span className={`text-[11px] font-semibold ${value === tp.id ? 'text-primary' : 'text-text-secondary'}`}>{tp.name}</span>
        </button>
      ))}
    </div>
  );
}

// ---------- แท็บ สไตล์ ----------
function StyleTab({ style, onChange }: { style: SubStyle; onChange: (p: Partial<SubStyle>) => void }) {
  const wpl = [0, 1, 2, 3, 4, 5, 6];
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="mb-1 block text-xs font-semibold text-text-muted">ฟอนต์</span>
        <select value={style.fontFamily} onChange={(e) => onChange({ fontFamily: e.target.value })} className="w-full rounded-md border border-border bg-background px-2 py-1.5 text-sm text-text-primary">
          <option value="">ค่าเริ่มต้น (Leelawadee)</option>
          {FONTS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>

      <Range label="ขนาดตัวอักษร" value={style.fontSizePct} min={3} max={12} step={0.2} suffix="%" onChange={(v) => onChange({ fontSizePct: v })} />
      <Range label="ตำแหน่งแนวตั้ง" value={style.yPercent} min={40} max={92} step={1} suffix="%" onChange={(v) => onChange({ yPercent: v })} />
      <Range label="ความหนาเส้นขอบ" value={style.strokeWidthPx} min={0} max={20} step={1} suffix="px" onChange={(v) => onChange({ strokeWidthPx: v })} />

      <div>
        <span className="mb-1 block text-xs font-semibold text-text-muted">จำนวนคำต่อบรรทัด</span>
        <div className="flex flex-wrap gap-1.5">
          {wpl.map((n) => (
            <button key={n} onClick={() => onChange({ wordsPerLine: n })} className={`rounded-md border px-2.5 py-1 text-xs font-semibold ${style.wordsPerLine === n ? 'border-primary bg-primary/10 text-primary' : 'border-border text-text-secondary'}`}>
              {n === 0 ? 'อัตโนมัติ' : n}
            </button>
          ))}
        </div>
      </div>

      <Swatch label="สีตัวอักษร" value={style.color} onPick={(c) => onChange({ color: c })} />
      <Swatch label="สีคำเน้น (highlight)" value={style.highlightColor} onPick={(c) => onChange({ highlightColor: c })} />

      <Toggle label="ซับต่อเนื่อง ไม่เว้นช่วงเงียบ" value={style.continuous} onChange={(v) => onChange({ continuous: v })} />
      <Toggle label="ไม่เว้นวรรคระหว่างคำ" value={style.noSpace} onChange={(v) => onChange({ noSpace: v })} />
    </div>
  );
}

function Range({ label, value, min, max, step, suffix, onChange }: { label: string; value: number; min: number; max: number; step: number; suffix: string; onChange: (v: number) => void }) {
  return (
    <label className="block">
      <span className="mb-1 flex justify-between text-xs font-semibold text-text-muted">
        <span>{label}</span><span>{value}{suffix}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-primary" />
    </label>
  );
}

function Swatch({ label, value, onPick }: { label: string; value: string; onPick: (c: string) => void }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-semibold text-text-muted">{label}</span>
      <div className="flex flex-wrap gap-1.5">
        {SUB_COLORS.map((c) => (
          <button key={c} onClick={() => onPick(c)} className={`h-7 w-7 rounded-full border-2 ${value.toUpperCase() === c ? 'border-primary' : 'border-border'}`} style={{ background: c }} title={c} />
        ))}
      </div>
    </div>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-2">
      <span className="text-xs font-semibold text-text-secondary">{label}</span>
      <input type="checkbox" checked={value} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-primary" />
    </label>
  );
}
