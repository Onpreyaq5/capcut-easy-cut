'use client';
// ตัวแก้ซับ WYSIWYG แบบ tamsub.com — หน้าตัดต่อเต็มรูปแบบ:
// วิดีโอ (ลากย้ายตำแหน่งซับได้) + แท็บ ข้อความ/เทมเพลต/สไตล์ + ไทม์ไลน์คลื่นเสียง+ชิปคำ
// + แทรกคำ / ข้ามช่วงเงียบ / ✨AI แก้คำผิด (Groq LLM คงจังหวะเวลาเดิม)
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Upload,
  Type,
  LayoutTemplate,
  Palette,
  Play,
  Pause,
  Download,
  Loader2,
  Scissors,
  ArrowLeft,
  Plus,
  Minus,
  Trash2,
  Wand2,
  FastForward,
  Smartphone,
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
import { renderSubtitledVideo } from '@/lib/clientRender';

type Tab = 'text' | 'template' | 'style';

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export default function SubtitleEditor() {
  const [videoUrl, setVideoUrl] = useState('');
  const [videoName, setVideoName] = useState('');
  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [allWords, setAllWords] = useState<SubWord[]>([]);
  const [style, setStyle] = useState<SubStyle>(DEFAULT_STYLE);
  const [tab, setTab] = useState<Tab>('text');
  const [transcribing, setTranscribing] = useState(false);
  const [keyterms, setKeyterms] = useState('');
  const [cutDeadAir, setCutDeadAir] = useState(true);
  const [progress, setProgress] = useState('');
  const [playing, setPlaying] = useState(false);
  const [cur, setCur] = useState(0);
  const [dur, setDur] = useState(0);
  const [selIdx, setSelIdx] = useState(-1);      // คำที่เลือกในไทม์ไลน์ (index ใน allWords)
  const [skipSilence, setSkipSilence] = useState(false); // ข้ามช่วงเงียบตอนพรีวิว
  const [safeZone, setSafeZone] = useState(true);
  const [pps, setPps] = useState(90);            // ไทม์ไลน์: พิกเซลต่อวินาที (ซูม)
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [refining, setRefining] = useState(false);

  // lines = จัดกลุ่มจาก allWords เสมอ (allWords เรียงตามเวลาแล้ว)
  const lines = useMemo(() => groupWords(allWords, style.wordsPerLine), [allWords, style.wordsPerLine]);
  const hasSub = lines.length > 0;
  // index เริ่มของแต่ละบรรทัดในลิสต์คำแบน (ใช้แปลง line/word -> global index)
  const lineOffsets = useMemo(() => {
    const offs: number[] = [];
    let n = 0;
    for (const l of lines) { offs.push(n); n += l.words.length; }
    return offs;
  }, [lines]);

  const [caps, setCaps] = useState<{ capcut: boolean } | null>(null);
  useEffect(() => {
    fetch('/api/easycut/capabilities').then((r) => r.json()).then(setCaps).catch(() => setCaps({ capcut: true }));
  }, []);

  const videoRef = useRef<HTMLVideoElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const srtInput = useRef<HTMLInputElement>(null);
  const tlRef = useRef<HTMLDivElement>(null);     // ไทม์ไลน์ scroll container
  const waveRef = useRef<HTMLCanvasElement>(null);
  const [box, setBox] = useState({ w: 315, h: 560 });

  const measure = useCallback(() => {
    if (boxRef.current) {
      const r = boxRef.current.getBoundingClientRect();
      setBox({ w: r.width, h: r.height });
    }
  }, []);
  useEffect(() => {
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [measure]);

  const setWordsSorted = (ws: SubWord[]) => {
    setAllWords([...ws].sort((a, b) => a.start - b.start));
  };

  // demo mode (?demo=1)
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
    setWordsSorted(demo);
    fetch('/demo.mp4').then((r) => r.blob()).then((b) => setVideoFile(new File([b], 'demo.mp4', { type: 'video/mp4' }))).catch(() => undefined);
  }, []);

  const onPickVideo = (f: File) => {
    setVideoFile(f);
    setVideoUrl(URL.createObjectURL(f));
    setVideoName(f.name);
    setAllWords([]);
    setSelIdx(-1);
    setPeaks(null);
  };

  // ---------- คลื่นเสียง: ถอด peaks จากไฟล์ (50 จุด/วินาที) ----------
  useEffect(() => {
    if (!videoFile) return;
    let cancelled = false;
    let ac: AudioContext | null = null;
    (async () => {
      try {
        const buf = await videoFile.arrayBuffer();
        type AC = typeof AudioContext;
        const Ctx: AC = window.AudioContext || (window as unknown as { webkitAudioContext: AC }).webkitAudioContext;
        ac = new Ctx();
        const audio = await ac.decodeAudioData(buf);
        const ch = audio.getChannelData(0);
        const n = Math.max(1, Math.floor(audio.duration * 50));
        const out = new Float32Array(n);
        const step = Math.max(1, Math.floor(ch.length / n));
        for (let i = 0; i < n; i++) {
          let m = 0;
          const s = i * step;
          for (let j = 0; j < step; j += 32) { const v = Math.abs(ch[s + j] || 0); if (v > m) m = v; }
          out[i] = m;
        }
        if (!cancelled) setPeaks(out);
      } catch { /* วิดีโอบางไฟล์ decode ไม่ได้ — ไม่แสดงคลื่น */ }
      finally { ac?.close().catch(() => undefined); }
    })();
    return () => { cancelled = true; };
  }, [videoFile]);

  // วาดคลื่นเสียงตามซูม
  useEffect(() => {
    const cv = waveRef.current;
    if (!cv || !peaks || !dur) return;
    const w = Math.min(Math.ceil(dur * pps), 32000);
    const h = 36;
    cv.width = w; cv.height = h;
    const ctx = cv.getContext('2d')!;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(120,140,255,0.55)';
    const bucketsPerPx = peaks.length / w;
    for (let x = 0; x < w; x += 2) {
      let m = 0;
      const s = Math.floor(x * bucketsPerPx);
      const e = Math.max(s + 1, Math.floor((x + 2) * bucketsPerPx));
      for (let i = s; i < e && i < peaks.length; i++) if (peaks[i] > m) m = peaks[i];
      const bh = Math.max(1, m * h);
      ctx.fillRect(x, (h - bh) / 2, 1.4, bh);
    }
  }, [peaks, pps, dur]);

  // ---------- ถอดเสียง ----------
  const transcribe = async () => {
    if (!videoFile) return;
    setTranscribing(true);
    setProgress('กำลังอัปโหลด + ถอดเสียง (อาจใช้เวลาสักครู่)…');
    try {
      const fd = new FormData();
      fd.append('clip', videoFile);
      if (keyterms.trim()) fd.append('keyterms', keyterms.trim());
      const res = await fetch('/api/easycut/transcribe', { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'ถอดเสียงไม่สำเร็จ');
      const words: SubWord[] = (data.words || []).map((w: { text?: string; word?: string; start: number; end: number }) => ({
        text: (w.text ?? w.word ?? '').trim(), start: w.start, end: w.end,
      })).filter((w: SubWord) => w.text);
      setWordsSorted(words);
      setTab('text');
      setProgress(`ถอดเสียงเสร็จ — ได้ ${words.length} คำ · แตะคำในไทม์ไลน์เพื่อแก้ได้เลย`);
    } catch (e) {
      setProgress('❌ ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setTranscribing(false);
    }
  };

  // ---------- ✨ AI แก้คำผิดทั้งคลิป (คงเวลาเดิม) ----------
  const refineAI = async () => {
    if (!hasSub || refining) return;
    setRefining(true);
    setProgress('✨ AI กำลังตรวจแก้คำผิดทั้งคลิป…');
    try {
      const res = await fetch('/api/easycut/refine', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ words: allWords, keyterms }),
      });
      const data = await res.json();
      if (!data.ok) throw new Error(data.error || 'AI แก้คำไม่สำเร็จ');
      const texts: string[] = data.texts || [];
      if (texts.length === allWords.length) {
        setAllWords((ws) => ws.map((w, i) => (texts[i] && texts[i] !== w.text ? { ...w, text: texts[i] } : w)));
      }
      setProgress(data.changed > 0 ? `✨ AI แก้ให้ ${data.changed} คำ` : '✨ AI ตรวจแล้ว — ไม่พบคำที่ต้องแก้');
    } catch (e) {
      setProgress('❌ ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRefining(false);
    }
  };

  const patchStyle = (p: Partial<SubStyle>) => setStyle((s) => ({ ...s, ...p }));
  const editWordFlat = (gi: number, text: string) => {
    setAllWords((ws) => ws.map((w, i) => (i === gi ? { ...w, text } : w)));
  };
  const deleteWord = (gi: number) => {
    setAllWords((ws) => ws.filter((_, i) => i !== gi));
    setSelIdx(-1);
  };
  const insertWordAt = (t: number) => {
    const w: SubWord = { text: 'คำใหม่', start: t, end: Math.min(dur || t + 0.4, t + 0.4) };
    const next = [...allWords, w].sort((a, b) => a.start - b.start);
    setAllWords(next);
    setSelIdx(next.indexOf(w));
  };

  const play = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) { v.play(); setPlaying(true); } else { v.pause(); setPlaying(false); }
  };
  const seek = (sec: number) => {
    const v = videoRef.current;
    if (v) v.currentTime = clamp(sec, 0, dur || 0);
  };

  // ข้ามช่วงเงียบตอนพรีวิว: อยู่ในช่องว่างระหว่างบรรทัด > 0.45s -> กระโดดไปบรรทัดถัดไป
  useEffect(() => {
    if (!skipSilence || !playing || !lines.length) return;
    const nxt = lines.find((l) => lineStart(l) > cur + 0.12);
    const prevEnd = lines.reduce((m, l) => (lineEnd(l) <= cur + 0.05 ? Math.max(m, lineEnd(l)) : m), 0);
    if (nxt && cur > prevEnd && lineStart(nxt) - cur > 0.45 && (!lines.some((l) => cur >= lineStart(l) && cur < lineEnd(l)))) {
      seek(lineStart(nxt) - 0.06);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cur, skipSilence, playing]);

  // ไทม์ไลน์เลื่อนตามหัวอ่านตอนเล่น
  useEffect(() => {
    const el = tlRef.current;
    if (!el || !playing) return;
    const x = cur * pps;
    if (x < el.scrollLeft + 60 || x > el.scrollLeft + el.clientWidth - 120) {
      el.scrollLeft = Math.max(0, x - el.clientWidth * 0.35);
    }
  }, [cur, playing, pps]);

  // ---------- ลากย้ายตำแหน่งซับบนวิดีโอ ----------
  const dragging = useRef(false);
  const startDragSub = (e: React.PointerEvent) => {
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onDragSub = (e: React.PointerEvent) => {
    if (!dragging.current || !boxRef.current) return;
    const r = boxRef.current.getBoundingClientRect();
    patchStyle({ yPercent: Math.round(clamp(((e.clientY - r.top) / r.height) * 100, 20, 94)) });
  };
  const endDragSub = () => { dragging.current = false; };

  // ---------- ส่งออก ----------
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
      setProgress(`✅ สร้างโปรเจกต์ CapCut "${data.name}" แล้ว (${data.captions} แคปชัน)`);
    } catch (e) {
      setProgress('❌ ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setBuilding(false);
    }
  };

  const [rendering, setRendering] = useState(false);
  const renderVideo = async () => {
    const v = videoRef.current;
    if (!v || !hasSub) return;
    setRendering(true);
    v.pause();
    setPlaying(false);
    setProgress('กำลังเตรียมเรนเดอร์… (อย่าปิดหน้านี้ระหว่างเรนเดอร์)');
    try {
      const { blob, ext } = await renderSubtitledVideo({
        video: v, lines, style, cutDeadAir,
        onProgress: (pct, label) => setProgress(`${label} ${pct}%`),
      });
      v.pause();
      setPlaying(false);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = (videoName.replace(/\.[^.]+$/, '') || 'easycut') + '-subtitled.' + ext;
      a.click();
      setProgress(`✅ ดาวน์โหลดวิดีโอฝังซับแล้ว (.${ext})` + (cutDeadAir ? ' · ตัดช่วงเงียบแล้ว' : ''));
    } catch (e) {
      setProgress('❌ ' + (e instanceof Error ? e.message : String(e)));
    } finally {
      setRendering(false);
    }
  };

  const exportSRT = () => {
    const blob = new Blob([toSRT(lines, style.noSpace)], { type: 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (videoName.replace(/\.[^.]+$/, '') || 'subtitle') + '.srt';
    a.click();
  };

  const importSRT = async (f: File) => {
    const txt = await f.text();
    const words: SubWord[] = [];
    const tp = (s: string) => {
      const m = s.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
      return m ? +m[1] * 3600 + +m[2] * 60 + +m[3] + +m[4] / 1000 : 0;
    };
    for (const b of txt.replace(/\r/g, '').split(/\n\n+/)) {
      const ln = b.split('\n');
      const ti = ln.findIndex((x) => x.includes('-->'));
      if (ti < 0) continue;
      const [a, z] = ln[ti].split('-->');
      const text = ln.slice(ti + 1).join(' ').trim();
      if (text) words.push({ text, start: tp(a), end: tp(z) });
    }
    setWordsSorted(words);
    setProgress(`นำเข้า SRT — ${words.length} บรรทัด`);
  };

  const sel = selIdx >= 0 && selIdx < allWords.length ? allWords[selIdx] : null;

  // ================= หน้าอัปโหลด =================
  if (!videoUrl) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-xl font-bold text-text-primary">ตัวแก้ซับ (Editor)</h1>
        <p className="mb-5 text-xs text-text-muted">อัปคลิป → ถอดเสียง → แก้คำบนไทม์ไลน์ → ดาวน์โหลดวิดีโอซับฝัง (มือถือได้) หรือส่งเข้า CapCut (คอม)</p>
        <button
          onClick={() => fileInput.current?.click()}
          className="flex min-h-[300px] w-full flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-surface/40 text-text-muted transition-colors hover:border-primary/60 hover:text-text-secondary"
        >
          <Upload size={40} />
          <span className="text-sm font-semibold">ลากคลิปใส่ หรือแตะเพื่อเลือก</span>
          <span className="text-xs">MP4 · MOV · MKV · WEBM</span>
          <input ref={fileInput} type="file" accept="video/*" hidden onChange={(e) => e.target.files?.[0] && onPickVideo(e.target.files[0])} />
        </button>
      </div>
    );
  }

  // ================= หน้าตัดต่อเต็มรูปแบบ (tamsub-style) =================
  return (
    <div className="mx-auto max-w-[1400px] px-3 py-3">
      <OverlayKeyframes />

      {/* แถบบน */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button onClick={() => { setVideoUrl(''); setVideoFile(null); setPlaying(false); }} className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-surface text-text-secondary hover:border-primary/50" title="เปลี่ยนคลิป">
          <ArrowLeft size={15} />
        </button>
        <span className="text-sm font-bold text-text-primary">ทำซับ</span>
        <span className="max-w-[160px] truncate text-[11px] text-text-muted">{videoName}</span>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <input ref={srtInput} type="file" accept=".srt" hidden onChange={(e) => e.target.files?.[0] && importSRT(e.target.files[0])} />
          <button onClick={() => srtInput.current?.click()} className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary hover:border-primary/50">นำเข้า SRT</button>
          <button onClick={exportSRT} disabled={!hasSub} className="rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary hover:border-primary/50 disabled:opacity-40">SRT</button>
          <label className="flex cursor-pointer items-center gap-1 rounded-md border border-border bg-surface px-2 py-1.5 text-[11px] font-semibold text-text-secondary" title="ตัดช่วงที่ไม่มีเสียงพูดออกตอนส่งออกวิดีโอ">
            <input type="checkbox" checked={cutDeadAir} onChange={(e) => setCutDeadAir(e.target.checked)} className="h-3.5 w-3.5 accent-primary" />
            ตัดช่วงเงียบ
          </label>
          <button onClick={renderVideo} disabled={!hasSub || rendering} className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-primary/90 disabled:opacity-50">
            {rendering ? <Loader2 size={13} className="animate-spin" /> : <Smartphone size={13} />} ส่งออกวิดีโอ
          </button>
          {caps?.capcut !== false && (
            <button onClick={sendToCapcut} disabled={!hasSub || !videoFile || building} className="flex items-center gap-1.5 rounded-md border border-border bg-surface px-2.5 py-1.5 text-[11px] font-semibold text-text-secondary hover:border-primary/50 disabled:opacity-50">
              {building ? <Loader2 size={13} className="animate-spin" /> : <Scissors size={13} />} CapCut
            </button>
          )}
        </div>
      </div>

      {/* กลาง: วิดีโอ + แผงขวา */}
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* วิดีโอ */}
        <div className="flex flex-col items-center">
          <div ref={boxRef} className="relative aspect-[9/16] w-full max-w-[300px] overflow-hidden rounded-xl bg-black" onPointerMove={onDragSub} onPointerUp={endDragSub}>
            <video
              ref={videoRef}
              src={videoUrl}
              className="h-full w-full object-contain"
              onLoadedMetadata={(e) => { setDur(e.currentTarget.duration); measure(); }}
              onTimeUpdate={(e) => setCur(e.currentTarget.currentTime)}
              onPause={() => setPlaying(false)}
              onPlay={() => setPlaying(true)}
              onClick={play}
              playsInline
            />
            {safeZone && <div className="pointer-events-none absolute inset-x-0 top-[12%] bottom-[18%] border-x border-white/10" />}
            {hasSub && <SubtitleOverlay videoRef={videoRef} lines={lines} style={style} boxW={box.w} boxH={box.h} />}
            {/* ที่จับลากย้ายตำแหน่งซับ */}
            {hasSub && (
              <button
                onPointerDown={startDragSub}
                className="absolute right-1.5 z-10 flex h-8 w-8 -translate-y-1/2 cursor-grab touch-none items-center justify-center rounded-full border border-white/30 bg-black/60 text-sm text-white active:cursor-grabbing"
                style={{ top: `${style.yPercent}%` }}
                title="ลากขึ้น-ลง เพื่อย้ายตำแหน่งซับ"
              >
                ↕
              </button>
            )}
          </div>
          <div className="mt-1.5 flex w-full max-w-[300px] items-center justify-between">
            <label className="flex cursor-pointer items-center gap-1 text-[10px] text-text-muted">
              <input type="checkbox" checked={safeZone} onChange={(e) => setSafeZone(e.target.checked)} className="h-3 w-3 accent-primary" />
              TikTok Safe Zone
            </label>
            <span className="text-[10px] text-text-muted">ลากปุ่ม ↕ เพื่อย้ายซับ</span>
          </div>

          {!hasSub && (
            <div className="mt-3 w-full max-w-[300px]">
              <label className="block">
                <span className="mb-1 block text-[11px] font-semibold text-text-muted">คลังคำ (ไม่บังคับ) — ศัพท์อังกฤษ/แบรนด์ที่พูดในคลิป ช่วยถอดแม่นขึ้น</span>
                <textarea
                  value={keyterms}
                  onChange={(e) => setKeyterms(e.target.value)}
                  rows={2}
                  placeholder="เช่น ChatGPT, TikTok, CapCut, AI, ชื่อแบรนด์ของคุณ"
                  className="w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-xs text-text-primary focus:border-primary focus:outline-none"
                />
              </label>
              <button onClick={transcribe} disabled={transcribing} className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white disabled:opacity-60">
                {transcribing ? <Loader2 size={16} className="animate-spin" /> : <Type size={16} />}
                {transcribing ? 'กำลังถอดเสียง…' : 'ถอดเสียงทำซับอัตโนมัติ'}
              </button>
            </div>
          )}
          {progress && <p className="mt-2 max-w-[300px] text-center text-[11px] text-text-muted">{progress}</p>}
        </div>

        {/* แผงขวา: แท็บ */}
        <div className="flex min-h-[420px] flex-col rounded-xl border border-border bg-surface">
          <div className="flex border-b border-border">
            <TabBtn active={tab === 'text'} onClick={() => setTab('text')} icon={<Type size={15} />} label="ข้อความ" />
            <TabBtn active={tab === 'template'} onClick={() => setTab('template')} icon={<LayoutTemplate size={15} />} label="เทมเพลต" />
            <TabBtn active={tab === 'style'} onClick={() => setTab('style')} icon={<Palette size={15} />} label="สไตล์" />
          </div>
          <div className="max-h-[52vh] flex-1 overflow-y-auto p-3">
            {tab === 'text' && (
              <>
                {hasSub && (
                  <button onClick={refineAI} disabled={refining} className="mb-2 flex w-full items-center justify-center gap-1.5 rounded-lg border border-primary/40 bg-primary/10 py-2 text-xs font-semibold text-primary hover:bg-primary/20 disabled:opacity-50">
                    {refining ? <Loader2 size={14} className="animate-spin" /> : <Wand2 size={14} />}
                    {refining ? 'AI กำลังตรวจแก้…' : '✨ AI แก้คำผิดทั้งคลิป (คงเวลาเดิม)'}
                  </button>
                )}
                <TextTab lines={lines} lineOffsets={lineOffsets} cur={cur} onSeek={seek} onEdit={editWordFlat} onSelect={setSelIdx} selIdx={selIdx} />
              </>
            )}
            {tab === 'template' && <TemplateTab value={style.template} onPick={(id) => patchStyle({ template: id })} />}
            {tab === 'style' && <StyleTab style={style} onChange={patchStyle} />}
          </div>
        </div>
      </div>

      {/* ล่าง: ไทม์ไลน์ */}
      <div className="mt-3 rounded-xl border border-border bg-surface p-3">
        {/* คอนโทรล */}
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={play} className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-white">
            {playing ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <span className="text-xs font-bold tabular-nums text-primary">{fmt1(cur)}</span>
          <span className="text-xs text-text-muted">/ {fmt1(dur)}</span>
          <button onClick={() => insertWordAt(cur)} disabled={!videoUrl} className="flex items-center gap-1 rounded-full border border-border bg-background px-3 py-1.5 text-[11px] font-semibold text-text-secondary hover:border-primary/50">
            <Plus size={13} /> แทรกคำ
          </button>
          <button
            onClick={() => setSkipSilence((v) => !v)}
            className={`flex items-center gap-1 rounded-full border px-3 py-1.5 text-[11px] font-semibold ${skipSilence ? 'border-primary bg-primary/15 text-primary' : 'border-border bg-background text-text-secondary hover:border-primary/50'}`}
            title="ตอนพรีวิว: กระโดดข้ามช่วงที่ไม่มีซับ"
          >
            <FastForward size={13} /> ข้ามช่วงเงียบ
          </button>
          <div className="ml-auto flex items-center gap-1">
            <button onClick={() => setPps((p) => clamp(p - 30, 30, 300))} className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-text-secondary"><Minus size={13} /></button>
            <span className="w-10 text-center text-[10px] tabular-nums text-text-muted">{(pps / 90).toFixed(1)}x</span>
            <button onClick={() => setPps((p) => clamp(p + 30, 30, 300))} className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-background text-text-secondary"><Plus size={13} /></button>
          </div>
        </div>

        {/* ราง: คลื่นเสียง + ชิปคำ + หัวอ่าน */}
        <div ref={tlRef} className="relative mt-2 overflow-x-auto rounded-lg border border-border bg-background">
          <div
            className="relative"
            style={{ width: `${Math.max(600, dur * pps)}px`, height: '110px' }}
            onClick={(e) => {
              const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
              seek((e.clientX - r.left) / pps);
            }}
          >
            {/* ไม้บรรทัดวินาที */}
            {Array.from({ length: Math.ceil(dur) + 1 }, (_, s) => (
              <div key={s} className="absolute top-0 h-full border-l border-border/50" style={{ left: `${s * pps}px` }}>
                <span className="ml-1 text-[9px] text-text-muted">{s}s</span>
              </div>
            ))}
            {/* คลื่นเสียง */}
            <canvas ref={waveRef} className="absolute left-0 top-5 h-9" style={{ width: `${Math.min(Math.ceil(dur * pps), 32000)}px` }} />
            {/* ชิปคำ */}
            <div className="absolute left-0 top-[64px] h-10 w-full">
              {lines.map((l, li) =>
                l.words.map((w, wi) => {
                  const gi = lineOffsets[li] + wi;
                  const active = cur >= w.start && cur < w.end;
                  return (
                    <button
                      key={gi}
                      onClick={(e) => { e.stopPropagation(); setSelIdx(gi); seek(w.start + 0.01); }}
                      className={`absolute top-0 h-9 overflow-hidden rounded-md border px-1 text-[10px] font-semibold leading-9 ${selIdx === gi ? 'z-10 border-primary bg-primary/25 text-primary' : active ? 'border-primary/60 bg-primary/10 text-text-primary' : 'border-border bg-surface text-text-secondary hover:border-primary/40'}`}
                      style={{ left: `${w.start * pps}px`, width: `${Math.max(18, (w.end - w.start) * pps - 2)}px` }}
                      title={`${w.text} · ${fmt1(w.start)}→${fmt1(w.end)}`}
                    >
                      {wi === 0 && <span className="mr-0.5 text-[8px] text-text-muted">{li + 1}</span>}
                      {w.text}
                    </button>
                  );
                }),
              )}
            </div>
            {/* หัวอ่าน */}
            <div className="pointer-events-none absolute top-0 z-20 h-full w-[2px] bg-primary" style={{ left: `${cur * pps}px` }}>
              <div className="-ml-[5px] h-3 w-3 rounded-full bg-primary" />
            </div>
          </div>
        </div>

        {/* แถวแก้คำที่เลือก */}
        {sel && (
          <div className="mt-2 flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/5 px-3 py-2">
            <button onClick={() => seek(sel.start + 0.01)} className="font-mono text-[10px] text-text-muted hover:text-primary">
              {fmt1(sel.start)} → {fmt1(sel.end)}
            </button>
            <input
              value={sel.text}
              onChange={(e) => editWordFlat(selIdx, e.target.value)}
              className="flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-sm text-text-primary focus:border-primary focus:outline-none"
            />
            <button onClick={() => deleteWord(selIdx)} className="flex h-8 w-8 items-center justify-center rounded-md border border-border text-red-400 hover:border-red-400" title="ลบคำนี้">
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>

      {/* ปุ่มดาวน์โหลดลอย (มือถือเห็นง่าย) */}
      {hasSub && (
        <button onClick={renderVideo} disabled={rendering} className="fixed bottom-4 right-4 z-30 flex items-center gap-2 rounded-full bg-primary px-4 py-3 text-xs font-bold text-white shadow-lg shadow-primary/30 lg:hidden">
          {rendering ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />} ดาวน์โหลด
        </button>
      )}
    </div>
  );
}

function fmt1(s: number) {
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`;
}

function TabBtn({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button onClick={onClick} className={`flex flex-1 items-center justify-center gap-1.5 py-2.5 text-xs font-semibold transition-colors ${active ? 'border-b-2 border-primary text-primary' : 'text-text-muted hover:text-text-secondary'}`}>
      {icon} {label}
    </button>
  );
}

// ---------- แท็บ ข้อความ ----------
function TextTab({ lines, lineOffsets, cur, onSeek, onEdit, onSelect, selIdx }: {
  lines: SubLine[];
  lineOffsets: number[];
  cur: number;
  onSeek: (s: number) => void;
  onEdit: (gi: number, t: string) => void;
  onSelect: (gi: number) => void;
  selIdx: number;
}) {
  if (!lines.length) return <p className="text-center text-xs text-text-muted">ยังไม่มีซับ — กด “ถอดเสียงทำซับอัตโนมัติ” ก่อน</p>;
  return (
    <div className="space-y-2">
      {lines.map((l, li) => {
        const active = cur >= lineStart(l) && cur < lineEnd(l);
        return (
          <div key={l.id} className={`rounded-lg border p-2 ${active ? 'border-primary bg-primary/5' : 'border-border'}`}>
            <button onClick={() => onSeek(lineStart(l))} className="mb-1 font-mono text-[10px] text-text-muted hover:text-primary">
              {fmt1(lineStart(l))} → {fmt1(lineEnd(l))}
            </button>
            <div className="flex flex-wrap gap-1">
              {l.words.map((w, wi) => {
                const gi = lineOffsets[li] + wi;
                return (
                  <input
                    key={wi}
                    value={w.text}
                    onFocus={() => onSelect(gi)}
                    onChange={(e) => onEdit(gi, e.target.value)}
                    className={`min-w-[2ch] rounded border px-1.5 py-0.5 text-xs text-text-primary focus:border-primary focus:outline-none ${selIdx === gi ? 'border-primary bg-primary/10' : 'border-border bg-background'}`}
                    style={{ width: `${Math.max(2, w.text.length + 1)}ch` }}
                  />
                );
              })}
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
      <Range label="ตำแหน่งแนวตั้ง" value={style.yPercent} min={20} max={94} step={1} suffix="%" onChange={(v) => onChange({ yPercent: v })} />
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
