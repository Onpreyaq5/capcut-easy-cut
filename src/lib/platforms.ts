import type { PlatformId } from '@/lib/types';

/** เมตาดาทาแพลตฟอร์ม (port + ปรับจากเว็บเดิมของเบส ให้เข้ากับโดเมนเกษตร) */
export const PLATFORMS: Record<
  PlatformId,
  { name: string; icon: string; color: string; maxChars: number; bestHours: number[]; formats: string[]; desc: string }
> = {
  tiktok: {
    name: 'TikTok',
    icon: '🎵',
    color: '#000000',
    maxChars: 2200,
    bestHours: [19, 21, 22],
    formats: ['วิดีโอสั้น', 'photo mode'],
    desc: 'ไวรัลง่าย เหมาะคลิปเล่าเรื่อง/รีวิวในนา',
  },
  facebook: {
    name: 'Facebook',
    icon: '🔵',
    color: '#1877F2',
    maxChars: 2000,
    bestHours: [9, 13, 20],
    formats: ['โพสต์', 'Reel', 'กลุ่มเกษตร'],
    desc: 'เข้าถึงเกษตรกรกว้าง โพสต์ในกลุ่ม/เพจได้',
  },
  instagram: {
    name: 'Instagram',
    icon: '🟣',
    color: '#E1306C',
    maxChars: 2200,
    bestHours: [9, 17, 21],
    formats: ['Reel', 'Feed', 'Story'],
    desc: 'เน้นภาพสวย โชว์ผลผลิต/ก่อน-หลัง',
  },
  youtube: {
    name: 'YouTube',
    icon: '🔴',
    color: '#FF0000',
    maxChars: 5000,
    bestHours: [12, 17, 20],
    formats: ['Shorts', 'วิดีโอยาว'],
    desc: 'ค้นเจอผ่าน Google เหมาะสอน how-to ใช้ปุ๋ย',
  },
  line_oa: {
    name: 'LINE OA',
    icon: '💚',
    color: '#06C755',
    maxChars: 1000,
    bestHours: [11, 17, 20],
    formats: ['ข้อความ', 'รูป', 'rich menu'],
    desc: 'ส่งตรงหาลูกค้าเดิม ปิดการขายได้เลย',
  },
};

export const PLATFORM_ORDER: PlatformId[] = ['tiktok', 'facebook', 'instagram', 'youtube', 'line_oa'];

/** แคมเปญ (ปรับจาก CAMPAIGN_TYPES ของเบส ให้เข้ากับการขายปุ๋ย) */
export const CAMPAIGNS: Record<string, { label: string; goal: string }> = {
  problem_solution: { label: '🌱 แก้ปัญหานา/พืช', goal: 'ดึงคนที่เจอปัญหา (ใบเหลือง เพลี้ย ดินเสีย) ให้สนใจสินค้า' },
  promo: { label: '⚡ โปร/ลดราคา/ส่งฟรี', goal: 'เร่งการตัดสินใจซื้อด้วยข้อเสนอจำกัดเวลา' },
  hero_product: { label: '⭐ ดันสินค้าตัวเด่น', goal: 'โฟกัสปุ๋ยตัวเด่น/มาร์จิ้นสูงให้ขายดีขึ้น' },
  proof: { label: '📸 รีวิว/ก่อน-หลัง', goal: 'โชว์ผลจริง สร้างความเชื่อถือ' },
  educate: { label: '📚 ให้ความรู้ดึงลูกค้า', goal: 'สอนวิธีใช้/ดูแลนา แล้วเนียนแนะนำสินค้า' },
  seasonal: { label: '🎉 ตามฤดูกาล', goal: 'จับจังหวะลงนา/ใส่ปุ๋ย/เก็บเกี่ยว' },
};

export const TONES: Record<string, string> = {
  friendly: 'เป็นกันเอง อบอุ่น ภาษาชาวนาบ้านๆ',
  urgent: 'เร่งด่วน สร้าง FOMO เวลา/ของจำกัด',
  expert: 'น่าเชื่อถือ เหมือนผู้รู้เรื่องดิน-ปุ๋ยแนะนำ',
  fun: 'สนุก กันเอง ใช้ emoji เยอะ',
};

/** แปลงชั่วโมงแนะนำเป็นข้อความ เช่น [19,21,22] -> "19:00, 21:00, 22:00 น." */
export function bestTimeLabel(hours: number[]): string {
  return hours.map((h) => `${String(h).padStart(2, '0')}:00`).join(', ') + ' น.';
}
