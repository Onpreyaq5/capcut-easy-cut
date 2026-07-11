'use client';
// พรีวิวซับสดวางทับวิดีโอ — sync กับ video.currentTime ด้วย requestAnimationFrame
// เลียนแบบ tamsub (ASS karaoke) แต่เรนเดอร์ด้วย DOM+CSS เพื่อรองรับฟอนต์ไทยเต็มที่และเบากว่า libass
import { useEffect, useRef, useState } from 'react';
import {
  SubLine,
  SubStyle,
  TEMPLATES,
  activeLineIndex,
  lineStart,
  lineEnd,
} from '@/lib/subtitleTypes';

export function SubtitleOverlay({
  videoRef,
  lines,
  style,
  boxW,
  boxH,
}: {
  videoRef: React.RefObject<HTMLVideoElement>;
  lines: SubLine[];
  style: SubStyle;
  boxW: number; // ความกว้างจริงของกรอบพรีวิว (px)
  boxH: number;
}) {
  const [t, setT] = useState(0);
  const raf = useRef<number>();

  useEffect(() => {
    const v = videoRef.current;
    // rAF = อัปเดตลื่น 60fps ตอนเล่น (คาราโอเกะเนียน) — แต่ rAF หยุดเมื่อแท็บถูกซ่อน
    const loop = () => {
      const vid = videoRef.current;
      if (vid) setT(vid.currentTime);
      raf.current = requestAnimationFrame(loop);
    };
    raf.current = requestAnimationFrame(loop);
    // event = สำรองตอน rAF ไม่วิ่ง (seek/แท็บซ่อน) ให้ซับตามเวลาเสมอ
    const sync = () => { if (v) setT(v.currentTime); };
    v?.addEventListener('timeupdate', sync);
    v?.addEventListener('seeked', sync);
    v?.addEventListener('seeking', sync);
    v?.addEventListener('loadedmetadata', sync);
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current);
      v?.removeEventListener('timeupdate', sync);
      v?.removeEventListener('seeked', sync);
      v?.removeEventListener('seeking', sync);
      v?.removeEventListener('loadedmetadata', sync);
    };
  }, [videoRef]);

  const tmpl = TEMPLATES.find((x) => x.id === style.template) || TEMPLATES[0];
  const idx = activeLineIndex(lines, t, style.continuous);
  if (idx < 0) return null;
  const line = lines[idx];

  // สเกลจากพิกัดอ้างอิง 1280px สูง → px จริง
  const k = boxH / 1280;
  const fontPx = (style.fontSizePct / 100) * 1280 * k;
  const strokePx = Math.max(1, style.strokeWidthPx * k);
  const fontFamily = style.fontFamily
    ? `'${style.fontFamily}', 'Leelawadee UI', sans-serif`
    : `'Leelawadee UI', 'Kanit', sans-serif`;

  // เส้นขอบดำหนา (text-stroke ไม่คมพอ → ใช้ text-shadow หลายทิศ)
  const strokeShadow = (() => {
    const parts: string[] = [];
    const n = 12;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      parts.push(`${Math.cos(a) * strokePx}px ${Math.sin(a) * strokePx}px 0 #000`);
    }
    if (tmpl.neon) parts.push(`0 0 ${fontPx * 0.5}px ${style.highlightColor}`, `0 0 ${fontPx * 0.9}px ${style.highlightColor}`);
    return parts.join(', ');
  })();

  // แต่ละคำ: อยู่ในช่วงพูดไหม (คาราโอเกะ)
  const spokenIdx = line.words.findIndex((w) => t >= w.start && t < w.end);
  const lastSpoken = (() => {
    let li = -1;
    for (let i = 0; i < line.words.length; i++) if (t >= line.words[i].start) li = i;
    return li;
  })();

  const ls = lineStart(line);
  const sinceLine = t - ls; // เวลาผ่านมาตั้งแต่บรรทัดขึ้น (สำหรับ entrance)

  // entrance ทั้งบรรทัด (retrigger ด้วย key=line.id)
  const containerAnim =
    tmpl.id === 'popIn'
      ? 'ecPop 320ms cubic-bezier(.34,1.56,.64,1) both'
      : tmpl.id === 'neon'
        ? 'ecFade 220ms ease both'
        : undefined;

  return (
    <div
      key={line.id}
      style={{
        animation: containerAnim,
        position: 'absolute',
        left: 0,
        right: 0,
        top: `${style.yPercent}%`,
        transform: 'translateY(-50%)',
        display: 'flex',
        flexWrap: 'wrap',
        justifyContent: 'center',
        alignItems: 'center',
        gap: style.noSpace ? 0 : `${fontPx * 0.28}px`,
        padding: `0 ${boxW * 0.06}px`,
        pointerEvents: 'none',
        fontFamily,
        fontWeight: 800,
        fontSize: `${fontPx}px`,
        lineHeight: 1.15,
        ...(tmpl.box
          ? {
              background: 'rgba(0,0,0,0.55)',
              borderRadius: `${fontPx * 0.35}px`,
              width: 'fit-content',
              margin: '0 auto',
              left: '50%',
              right: 'auto',
              transform: 'translate(-50%,-50%)',
              paddingLeft: `${fontPx * 0.5}px`,
              paddingRight: `${fontPx * 0.5}px`,
              paddingTop: `${fontPx * 0.18}px`,
              paddingBottom: `${fontPx * 0.18}px`,
            }
          : {}),
      }}
    >
      {line.words.map((w, i) => {
        const isSpoken = i === spokenIdx;
        const wasSpoken = tmpl.karaoke && i <= lastSpoken;
        const active = tmpl.karaoke ? wasSpoken : false;
        const color = active || isSpoken ? style.highlightColor : style.color;

        // entrance ต่อคำ (typewriter/wave/pop)
        let opacity = 1;
        let ty = 0;
        let scale = 1;
        if (tmpl.id === 'typewriter') {
          opacity = t >= w.start - 0.02 ? 1 : 0;
        } else if (tmpl.id === 'wave') {
          const p = w.start - ls;
          const local = sinceLine - p;
          if (local < 0) { opacity = 0; ty = fontPx * 0.4; }
          else if (local < 0.3) { const e = local / 0.3; ty = fontPx * 0.4 * (1 - e); }
        }
        if (isSpoken && (tmpl.id === 'focusScale' || tmpl.id === 'karaoke' || tmpl.id === 'wave')) {
          scale = 1.18;
        }

        return (
          <span
            key={i}
            style={{
              color,
              textShadow: strokeShadow,
              opacity,
              display: 'inline-block',
              transform: `translateY(${ty}px) scale(${scale})`,
              transition: 'color 90ms linear, transform 120ms cubic-bezier(.34,1.56,.64,1)',
              whiteSpace: 'pre',
            }}
          >
            {w.text}
            {!style.noSpace && i < line.words.length - 1 ? ' ' : ''}
          </span>
        );
      })}
    </div>
  );
}

// keyframes ฝังครั้งเดียว (เรียกจาก editor shell)
export function OverlayKeyframes() {
  return (
    <style>{`
      @keyframes ecPop { 0%{transform:translateY(-50%) scale(.4);opacity:0} 60%{transform:translateY(-50%) scale(1.08);opacity:1} 100%{transform:translateY(-50%) scale(1)} }
      @keyframes ecFade { from{opacity:0} to{opacity:1} }
    `}</style>
  );
}
