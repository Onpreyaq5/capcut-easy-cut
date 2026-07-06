import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { Scene, Storyboard } from '@/lib/types';
import { scenesToSrt, secToSrtTime } from './srt';

export type AssetKind = 'video' | 'audio' | 'image' | 'other';

export interface AssetItem {
  id: string;
  file: File;
  kind: AssetKind;
  /** ลำดับในไทม์ไลน์ (เริ่ม 1) */
  order: number;
  /** ป้ายกำกับ เช่น ช็อตที่/จังหวะ */
  label: string;
}

const BEAT_TH: Record<string, string> = {
  problem: 'ปัญหา',
  pain: 'จุดเจ็บ',
  failed_attempts: 'ลองแล้วพัง',
  turning_point: 'จุดพลิก',
  result: 'ผลลัพธ์',
};

function ext(name: string): string {
  const m = /\.([a-z0-9]+)$/i.exec(name);
  return m ? m[1].toLowerCase() : 'bin';
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** ตั้งชื่อไฟล์ใหม่ตามลำดับ + จังหวะ (ถ้ามี storyboard ช่วยตั้งชื่อ) */
function renameFor(item: AssetItem, scenes: Scene[]): string {
  const sc = scenes[item.order - 1];
  const beat = sc ? BEAT_TH[sc.beat] || sc.beat : '';
  const base = `${pad(item.order)}${beat ? '_' + beat : item.label ? '_' + item.label.replace(/\s+/g, '') : ''}`;
  return `${base}.${ext(item.file.name)}`;
}

function timelineMd(items: AssetItem[], sb?: Storyboard): string {
  const lines: string[] = [];
  lines.push(`# ลำดับไทม์ไลน์ (เรียงตามนี้ใน CapCut)`);
  if (sb) lines.push(`\nคลิป: **${sb.videoTitle}** · ${sb.aspectRatio} · รวม ~${sb.totalDurationSec} วินาที\n`);
  lines.push('| ลำดับ | ไฟล์ | จังหวะ | ช่วงเวลา | บทพากย์ |');
  lines.push('|---|---|---|---|---|');
  const videos = items.filter((i) => i.kind === 'video').sort((a, b) => a.order - b.order);
  videos.forEach((it) => {
    const sc = sb?.scenes?.[it.order - 1];
    const time = sc ? `${secToSrtTime(sc.startSec).slice(3, 8)}–${secToSrtTime(sc.endSec).slice(3, 8)}` : '-';
    const beat = sc ? BEAT_TH[sc.beat] || sc.beat : '-';
    const vo = sc ? (sc.voiceoverTH || '').replace(/\|/g, ' ').slice(0, 60) : '-';
    lines.push(`| ${it.order} | ${renameFor(it, sb?.scenes || [])} | ${beat} | ${time} | ${vo} |`);
  });
  return lines.join('\n');
}

const README = (sb?: Storyboard) => `# วิธีเอาไฟล์เข้า CapCut (เรียงมาให้แล้ว)

โฟลเดอร์นี้จัดลำดับไฟล์ให้พร้อมตัดต่อ — ไม่ต้องมานั่งหาว่าคลิปไหนมาก่อนหลัง

## ในแพ็กเกจมี
- **clips/** — วิดีโอทุกช็อต ตั้งชื่อนำหน้าด้วยเลขลำดับ (01, 02, 03...) ลากเข้า CapCut ตามเลขได้เลย
- **voice/** — ไฟล์เสียงพากย์ (จาก Botnoi) เรียงตามช็อต
- **subtitles.srt** — ซับไตเติลตรงเวลา (ถ้ามี storyboard)
- **timeline.md** — ตารางลำดับ + ช่วงเวลา + บทพากย์ของแต่ละช็อต

## ขั้นตอน
1. เปิด CapCut → โปรเจกต์ใหม่ อัตราส่วน ${sb?.aspectRatio || '9:16'}
2. ลากไฟล์ใน **clips/** เข้าไทม์ไลน์ **เรียงตามเลข 01 → 02 → 03 ...**
3. ลากไฟล์ใน **voice/** วางใต้คลิปให้ตรงช็อต (ดูเวลาใน timeline.md)
4. เมนูข้อความ/Captions → Import → เลือก **subtitles.srt** (ซับวางตรงเวลาให้เอง)
5. ใส่เพลง ปรับสี แล้ว Export

> เคล็ดลับประหยัดเวลา: เปิด timeline.md ไว้ข้างๆ จะเห็นว่าช็อตไหนพูดอะไร ตรงเวลาไหน
`;

/** สร้าง zip แพ็กเกจจัดลำดับไฟล์ แล้วสั่งดาวน์โหลด */
export async function downloadOrderedPackage(items: AssetItem[], sb?: Storyboard): Promise<void> {
  if (!items.length) throw new Error('ยังไม่มีไฟล์ให้จัดเรียง');
  const zip = new JSZip();
  const clips = zip.folder('clips')!;
  const voice = zip.folder('voice')!;
  const images = zip.folder('images')!;

  const sorted = [...items].sort((a, b) => a.order - b.order);
  for (const it of sorted) {
    const buf = new Uint8Array(await it.file.arrayBuffer());
    const name = renameFor(it, sb?.scenes || []);
    if (it.kind === 'video') clips.file(name, buf);
    else if (it.kind === 'audio') voice.file(name, buf);
    else if (it.kind === 'image') images.file(name, buf);
    else zip.file(name, buf);
  }

  if (sb?.scenes?.length) zip.file('subtitles.srt', scenesToSrt(sb.scenes, 'voiceoverTH'));
  zip.file('timeline.md', timelineMd(items, sb));
  zip.file('README_capcut.md', README(sb));

  const blob = await zip.generateAsync({ type: 'blob' });
  const safe = (sb?.videoTitle || 'thanyakij_assembled').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40);
  saveAs(blob, `${safe}_เรียงไฟล์.zip`);
}
