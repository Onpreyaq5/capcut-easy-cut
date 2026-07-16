// โมเดลข้อมูลซับสำหรับตัวแก้ซับ WYSIWYG (แกะสถาปัตยกรรมจาก tamsub.com — Nuxt+PocketBase, ASS subtitle)
// ปรับให้เข้ากับสแต็กเฟริส: Next.js + Python engine (faster-whisper คืน word timestamp)

// คำเดียว (จาก whisper word-level: {word,start,end} หน่วยวินาที)
export interface SubWord {
  text: string;
  start: number; // วินาที
  end: number;
}

// หนึ่งบรรทัดซับ (กลุ่มคำที่ขึ้นพร้อมกัน)
export interface SubLine {
  id: string;
  words: SubWord[];
}

// เทมเพลตแอนิเมชัน (เลียนแบบแกลเลอรี tamsub)
export type TemplateId =
  | 'minimal'      // ขึ้นเฉย ๆ ไม่มีแอนิเมชัน
  | 'minimalBox'   // มีกล่องพื้นหลังโค้ง
  | 'focusScale'   // คำที่พูดขยายใหญ่
  | 'focusColor'   // คำที่พูดเปลี่ยนสี (คาราโอเกะ)
  | 'karaoke'      // ไล่สีทีละคำแบบ TikTok
  | 'popIn'        // เด้งเข้า (scale bounce)
  | 'typewriter'   // พิมพ์ทีละคำ
  | 'neon'         // เรืองแสง neon
  | 'wave';        // คลื่นขึ้นลง

export interface TemplateMeta {
  id: TemplateId;
  name: string;        // ชื่อไทยโชว์บนการ์ด
  desc: string;
  animate: boolean;    // มี entrance animation ไหม
  karaoke: boolean;    // ไล่ไฮไลต์ทีละคำไหม
  box: boolean;        // มีกล่องพื้นหลังไหม
  neon: boolean;
}

export const TEMPLATES: TemplateMeta[] = [
  { id: 'minimal', name: 'มินิมอล', desc: 'เรียบ ๆ ขึ้นทั้งบรรทัด', animate: false, karaoke: false, box: false, neon: false },
  { id: 'minimalBox', name: 'มินิมอล กล่อง', desc: 'มีกล่องพื้นหลังโค้ง', animate: false, karaoke: false, box: true, neon: false },
  { id: 'focusScale', name: 'โฟกัส ขยาย', desc: 'คำที่พูดขยายใหญ่', animate: true, karaoke: true, box: false, neon: false },
  { id: 'focusColor', name: 'โฟกัส เปลี่ยนสี', desc: 'คำที่พูดเปลี่ยนสี', animate: false, karaoke: true, box: false, neon: false },
  { id: 'karaoke', name: 'คาราโอเกะ TikTok', desc: 'ไล่สีทีละคำ', animate: true, karaoke: true, box: true, neon: false },
  { id: 'popIn', name: 'ป๊อปอิน', desc: 'เด้งเข้าแต่ละบรรทัด', animate: true, karaoke: false, box: false, neon: false },
  { id: 'typewriter', name: 'พิมพ์ดีด', desc: 'พิมพ์ทีละคำ', animate: true, karaoke: false, box: false, neon: false },
  { id: 'neon', name: 'นีออน', desc: 'เรืองแสงนีออน', animate: true, karaoke: true, box: false, neon: true },
  { id: 'wave', name: 'เวฟ', desc: 'คลื่นขึ้นลงทีละคำ', animate: true, karaoke: true, box: false, neon: false },
];

// สไตล์รวมของโปรเจกต์ซับ
export interface SubStyle {
  fontFamily: string;    // '' = ค่าเริ่มต้น (Leelawadee)
  fontSizePct: number;   // % ของความสูงจอ (เช่น 6 = 6% ของ 1280 ≈ 77px)
  yPercent: number;      // ตำแหน่งแนวตั้ง 0(บน)–100(ล่าง); ~78 = โซนล่าง
  wordsPerLine: number;  // 0 = อัตโนมัติ
  color: string;         // สีตัวอักษรหลัก (#hex)
  highlightColor: string;// สีคำที่กำลังพูด (#hex)
  strokeWidthPx: number; // ความหนาเส้นขอบดำ (px @1280)
  continuous: boolean;   // ซับต่อเนื่อง ไม่เว้นช่วงเงียบ
  noSpace: boolean;      // ไม่เว้นวรรคระหว่างคำ
  template: TemplateId;
}

export const DEFAULT_STYLE: SubStyle = {
  fontFamily: 'Kanit',
  fontSizePct: 5,
  yPercent: 72,
  wordsPerLine: 0,
  color: '#FFFFFF',
  highlightColor: '#FFE400',
  strokeWidthPx: 6,
  continuous: false,
  noSpace: false,
  template: 'karaoke',
};

export interface SubtitleProject {
  videoUrl: string;      // object URL ของวิดีโอที่อัปโหลด
  videoName: string;
  durationSec: number;
  lines: SubLine[];
  style: SubStyle;
}

export const FONTS = ['Kanit', 'Prompt', 'Sarabun', 'ChakraPetch', 'Mitr', 'BaiJamjuree', 'Krub', 'Kodchasan'] as const;
export const SUB_COLORS = ['#FFFFFF', '#FFE400', '#33D17A', '#00C2FF', '#B983FF', '#FF7AC6', '#FF6B4A', '#FF3B3B'] as const;

// ---------- helper: จัดคำเป็นบรรทัด ----------
let _idc = 0;
const nid = () => `l${Date.now().toString(36)}_${(_idc++).toString(36)}`;

// จัดกลุ่ม words เป็นบรรทัดตามจำนวนคำต่อบรรทัด (0 = อัตโนมัติตามช่องว่างเวลา)
export function groupWords(words: SubWord[], wordsPerLine: number): SubLine[] {
  if (!words.length) return [];
  // เรียงตามเวลาก่อนเสมอ — whisper บางครั้งคืน timestamp ไม่เรียง ทำให้บรรทัดทับกัน/พรีวิวเพี้ยน
  words = [...words].sort((a, b) => a.start - b.start);
  const lines: SubLine[] = [];
  if (wordsPerLine > 0) {
    for (let i = 0; i < words.length; i += wordsPerLine) {
      lines.push({ id: nid(), words: words.slice(i, i + wordsPerLine) });
    }
    return lines;
  }
  // อัตโนมัติ: ให้จังหวะพูด/ความยาววลีเป็นตัวตัด แทนจำนวนคำตายตัว
  // เพื่อให้ภาษาไทยไม่เกิดบรรทัดยาวล้นจอหรือวลีสั้นโดดเดี่ยวเกินไป
  const MAX_WORDS = 5;
  const MAX_CHARS = 20;
  const PAUSE_SEC = 0.4;
  const endsPhrase = (text: string) => /[.!?…。！？ๆ]$/.test(text.trim());
  let cur: SubWord[] = [];
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    const prev = words[i - 1];
    const gap = prev ? w.start - prev.end : 0;
    const nextChars = cur.reduce((sum, word) => sum + word.text.trim().length, 0)
      + (cur.length ? 1 : 0) + w.text.trim().length;
    if (cur.length && (
      gap > PAUSE_SEC
      || cur.length >= MAX_WORDS
      || nextChars > MAX_CHARS
      || (prev && endsPhrase(prev.text))
    )) {
      lines.push({ id: nid(), words: cur });
      cur = [];
    }
    cur.push(w);
  }
  if (cur.length) lines.push({ id: nid(), words: cur });
  return lines;
}

export const lineStart = (l: SubLine) => (l.words.length ? l.words[0].start : 0);
export const lineEnd = (l: SubLine) => (l.words.length ? l.words[l.words.length - 1].end : 0);

// หาบรรทัดที่ active ณ เวลา t (คืน index หรือ -1)
export function activeLineIndex(lines: SubLine[], t: number, continuous: boolean): number {
  for (let i = 0; i < lines.length; i++) {
    const s = lineStart(lines[i]);
    let e = lineEnd(lines[i]);
    if (continuous && i < lines.length - 1) e = lineStart(lines[i + 1]); // ยืดจนถึงบรรทัดถัดไป
    if (t >= s && t < e) return i;
  }
  return -1;
}

// SRT export
function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const mm = ms % 1000;
  const p = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${p(h)}:${p(m)}:${p(s)},${p(mm, 3)}`;
}

export function toSRT(lines: SubLine[], noSpace: boolean): string {
  return lines
    .filter((l) => l.words.length)
    .map((l, i) => {
      const text = l.words.map((w) => w.text).join(noSpace ? '' : ' ');
      return `${i + 1}\n${srtTime(lineStart(l))} --> ${srtTime(lineEnd(l))}\n${text}\n`;
    })
    .join('\n');
}
