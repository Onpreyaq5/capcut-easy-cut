'use client';
// เรนเดอร์วิดีโอฝังซับ "ฝั่งเบราว์เซอร์" (ไม่พึ่งเซิร์ฟเวอร์) — เหมาะกับมือถือ
// วิธี: วาดเฟรมวิดีโอ + ซับคาราโอเกะลง <canvas> แบบ real-time แล้วอัดด้วย MediaRecorder
// จุดเด่น: เซิร์ฟเวอร์ไม่ต้องแบกงานเรนเดอร์ (ไม่ OOM/ไม่ต้องอัปเกรดแพ็กเกจ) + ใช้ GPU ของเครื่องลูกค้า
// ข้อจำกัด: อัดแบบ real-time (~1x ของความยาวคลิป) เหมาะกับคลิปสั้น 30วิ–3นาที (พอดี TikTok/Reels)
import {
  SubLine,
  SubStyle,
  TEMPLATES,
  activeLineIndex,
  lineStart,
  lineEnd,
} from './subtitleTypes';

export interface RenderOpts {
  video: HTMLVideoElement;
  lines: SubLine[];
  style: SubStyle;
  cutDeadAir: boolean;       // ตัดช่วงเงียบ (ไม่มีซับ) ออก
  deadAirGapSec?: number;    // ช่องว่างเกินกี่วินาทีถือเป็นเดดแอร์ (ค่าเริ่ม 0.6)
  onProgress?: (pct: number, label: string) => void;
}

// เลือกฟอร์แมตที่เบราว์เซอร์รองรับ (Safari/iOS = mp4, Chrome/Android = webm)
function pickMime(): { mime: string; ext: string } {
  const cands = [
    { mime: 'video/mp4;codecs=avc1.42E01E,mp4a.40.2', ext: 'mp4' },
    { mime: 'video/mp4', ext: 'mp4' },
    { mime: 'video/webm;codecs=vp9,opus', ext: 'webm' },
    { mime: 'video/webm;codecs=vp8,opus', ext: 'webm' },
    { mime: 'video/webm', ext: 'webm' },
  ];
  const MR = typeof MediaRecorder !== 'undefined' ? MediaRecorder : null;
  for (const c of cands) {
    if (MR && MR.isTypeSupported(c.mime)) return c;
  }
  return { mime: '', ext: 'webm' };
}

// คำนวณช่วงเวลาที่ "เก็บไว้" (มีซับ) เมื่อเปิดตัดเดดแอร์ — รวมช่วงบรรทัดที่ติดกันเข้าด้วยกัน
function keepSegments(lines: SubLine[], gap: number, dur: number): Array<[number, number]> {
  const spans = lines
    .filter((l) => l.words.length)
    .map((l) => [Math.max(0, lineStart(l) - 0.15), Math.min(dur, lineEnd(l) + 0.35)] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  if (!spans.length) return [[0, dur]];
  const merged: Array<[number, number]> = [spans[0]];
  for (let i = 1; i < spans.length; i++) {
    const last = merged[merged.length - 1];
    if (spans[i][0] - last[1] <= gap) last[1] = Math.max(last[1], spans[i][1]);
    else merged.push(spans[i]);
  }
  return merged;
}

// โหลดฟอนต์ให้พร้อมก่อนวาด (กันซับขึ้นเป็นฟอนต์ผิด/สี่เหลี่ยม)
async function ensureFont(fontFamily: string, fontPx: number) {
  const fam = fontFamily || 'Leelawadee UI';
  try {
    if (document.fonts && document.fonts.load) {
      await document.fonts.load(`800 ${Math.round(fontPx)}px '${fam}'`, 'ก ข ค A B C 1 2 3');
      await document.fonts.ready;
    }
  } catch { /* ไม่เป็นไร ใช้ฟอนต์สำรอง */ }
}

export async function renderSubtitledVideo(opts: RenderOpts): Promise<{ blob: Blob; ext: string }> {
  const { video, lines, style, cutDeadAir, onProgress } = opts;
  const gapSec = opts.deadAirGapSec ?? 0.6;

  const W = video.videoWidth || 720;
  const H = video.videoHeight || 1280;
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d')!;
  const k = H / 1280; // สเกลอ้างอิงเดียวกับพรีวิว (SubtitleOverlay)
  const fontPx = (style.fontSizePct / 100) * 1280 * k;
  const strokePx = Math.max(1, style.strokeWidthPx * k);
  const fam = style.fontFamily || 'Leelawadee UI';
  const tmpl = TEMPLATES.find((x) => x.id === style.template) || TEMPLATES[0];

  await ensureFont(style.fontFamily, fontPx);

  const dur = video.duration || 0;
  const segs = cutDeadAir ? keepSegments(lines, gapSec, dur) : [[0, dur] as [number, number]];
  const totalKeep = segs.reduce((a, s) => a + (s[1] - s[0]), 0) || dur || 1;

  // ---- เตรียมสตรีม: วิดีโอจาก canvas + เสียงจาก <video> ----
  const fps = 30;
  const canvasStream = (canvas as HTMLCanvasElement & { captureStream: (f: number) => MediaStream }).captureStream(fps);
  const tracks = [...canvasStream.getVideoTracks()];
  try {
    const vEl = video as HTMLVideoElement & { captureStream?: () => MediaStream; mozCaptureStream?: () => MediaStream };
    const vStream = vEl.captureStream ? vEl.captureStream() : vEl.mozCaptureStream ? vEl.mozCaptureStream() : null;
    if (vStream) tracks.push(...vStream.getAudioTracks());
  } catch { /* บางเบราว์เซอร์ไม่ให้ audio track — ได้วิดีโอเงียบ */ }
  const stream = new MediaStream(tracks);

  const { mime, ext } = pickMime();
  const rec = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 8_000_000 } : undefined);
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };

  // ---- วาดหนึ่งเฟรม (เฟรมวิดีโอ + ซับ) ----
  const drawFrame = (t: number) => {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    try { ctx.drawImage(video, 0, 0, W, H); } catch { /* เฟรมยังไม่พร้อม */ }
    drawSubs(ctx, lines, style, t, { W, H, fontPx, strokePx, fam, tmpl });
  };

  // ---- ลูปเล่น+อัด พร้อมข้ามเดดแอร์ ----
  return new Promise((resolve, reject) => {
    let segIdx = 0;
    let done = false;
    let raf = 0;
    let elapsedKeep = 0; // เวลาที่อัดไปแล้ว (สำหรับ progress)

    const cleanup = () => {
      if (raf) cancelAnimationFrame(raf);
      video.pause();
      stream.getTracks().forEach((tr) => tr.stop());
    };

    rec.onstop = () => {
      cleanup();
      if (!chunks.length) return reject(new Error('เรนเดอร์ไม่สำเร็จ (ไม่มีข้อมูลวิดีโอ) — ลองคลิปสั้นลงหรือเบราว์เซอร์อื่น'));
      resolve({ blob: new Blob(chunks, { type: mime || 'video/webm' }), ext });
    };
    rec.onerror = () => { cleanup(); reject(new Error('MediaRecorder ผิดพลาด')); };

    const finish = () => {
      if (done) return;
      done = true;
      try { rec.stop(); } catch { /* already stopped */ }
    };

    const tick = () => {
      if (done) return;
      const v = video;
      const seg = segs[segIdx];
      // ข้ามไปช่วง keep ถัดไปเมื่อเลยปลายช่วงปัจจุบัน (= ตัดเดดแอร์)
      if (v.currentTime >= seg[1] - 0.02) {
        elapsedKeep += seg[1] - seg[0];
        segIdx++;
        if (segIdx >= segs.length) { finish(); return; }
        v.currentTime = segs[segIdx][0];
      }
      drawFrame(v.currentTime);
      const cur = elapsedKeep + Math.max(0, v.currentTime - seg[0]);
      onProgress?.(Math.min(99, Math.round((cur / totalKeep) * 100)), 'กำลังเรนเดอร์วิดีโอ…');
      raf = requestAnimationFrame(tick);
    };

    const onEnded = () => finish();

    const start = () => {
      video.removeEventListener('seeked', start);
      rec.start(250);
      video.play().then(() => { raf = requestAnimationFrame(tick); }).catch(reject);
    };

    video.addEventListener('ended', onEnded);
    // เริ่มที่ต้นช่วง keep แรก
    if (Math.abs(video.currentTime - segs[0][0]) > 0.05) {
      video.addEventListener('seeked', start, { once: true });
      video.currentTime = segs[0][0];
    } else {
      start();
    }
  });
}

// ---- วาดซับคาราโอเกะลง canvas (เลียนแบบ SubtitleOverlay ให้ผลตรงกับพรีวิว) ----
function drawSubs(
  ctx: CanvasRenderingContext2D,
  lines: SubLine[],
  style: SubStyle,
  t: number,
  g: { W: number; H: number; fontPx: number; strokePx: number; fam: string; tmpl: (typeof TEMPLATES)[number] },
) {
  const idx = activeLineIndex(lines, t, style.continuous);
  if (idx < 0) return;
  const line = lines[idx];
  const { W, H, fontPx, strokePx, fam, tmpl } = g;

  ctx.font = `800 ${fontPx}px '${fam}', 'Leelawadee UI', sans-serif`;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const spaceW = style.noSpace ? 0 : fontPx * 0.28;
  const words = line.words;
  const measures = words.map((w) => ctx.measureText(w.text).width);

  // จัดบรรทัดแบบ word-wrap (กว้างไม่เกิน 88% ของจอ)
  const maxW = W * 0.88;
  const rows: number[][] = [];
  let cur: number[] = [];
  let curW = 0;
  for (let i = 0; i < words.length; i++) {
    const add = measures[i] + (cur.length ? spaceW : 0);
    if (cur.length && curW + add > maxW) { rows.push(cur); cur = []; curW = 0; }
    cur.push(i);
    curW += measures[i] + (cur.length > 1 ? spaceW : 0);
  }
  if (cur.length) rows.push(cur);

  const lineH = fontPx * 1.18;
  const totalH = rows.length * lineH;
  const cy = (style.yPercent / 100) * H;
  let rowY = cy - totalH / 2 + lineH / 2;

  // คำที่ถูกพูดล่าสุด (คาราโอเกะ = ไฮไลต์คำที่ผ่านมาแล้วทั้งหมด)
  let lastSpoken = -1;
  for (let i = 0; i < words.length; i++) if (t >= words[i].start) lastSpoken = i;
  const spokenIdx = words.findIndex((w) => t >= w.start && t < w.end);

  // กล่องพื้นหลัง
  if (tmpl.box) {
    const rowWidths = rows.map((r) => r.reduce((a, wi, j) => a + measures[wi] + (j ? spaceW : 0), 0));
    const boxW = Math.max(...rowWidths) + fontPx;
    const pad = fontPx * 0.35;
    roundRect(ctx, W / 2 - boxW / 2, cy - totalH / 2 - pad, boxW, totalH + pad * 2, fontPx * 0.35);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fill();
  }

  for (const row of rows) {
    const rowW = row.reduce((a, wi, j) => a + measures[wi] + (j ? spaceW : 0), 0);
    let x = W / 2 - rowW / 2;
    for (const wi of row) {
      const active = tmpl.karaoke ? wi <= lastSpoken : false;
      const isSpoken = wi === spokenIdx;
      const color = active || isSpoken ? style.highlightColor : style.color;
      const cxw = x + measures[wi] / 2;
      // เส้นขอบดำ
      if (strokePx > 0) {
        ctx.lineWidth = strokePx * 2;
        ctx.strokeStyle = '#000';
        ctx.strokeText(words[wi].text, cxw, rowY, maxW);
      }
      // แสงนีออน
      if (tmpl.neon) {
        ctx.save();
        ctx.shadowColor = style.highlightColor;
        ctx.shadowBlur = fontPx * 0.7;
        ctx.fillStyle = color;
        ctx.fillText(words[wi].text, cxw, rowY, maxW);
        ctx.restore();
      }
      ctx.fillStyle = color;
      ctx.textAlign = 'center';
      ctx.fillText(words[wi].text, cxw, rowY, maxW);
      x += measures[wi] + spaceW;
    }
    rowY += lineH;
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export { keepSegments, pickMime };
