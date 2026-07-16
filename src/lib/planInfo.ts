// ข้อมูลแพ็กเกจสำหรับแสดงผล (client-safe — ไม่ import อะไรจาก server)
// ตัวเลขลิมิตต้องตรงกับ PLAN_LIMITS ใน authStore.ts
export type PlanId = 'free' | 'pro' | 'studio';

export interface PlanInfo {
  id: PlanId;
  name: string;
  price: string;
  period: string;
  who: string;
  minutes: number;
  features: string[];
  cta: string;
  highlight?: boolean;
}

export const PLANS: PlanInfo[] = [
  {
    id: 'free',
    name: 'Free',
    price: '฿0',
    period: 'ตลอดชีพ',
    who: 'ให้ทุกคนได้ลองของจริง',
    minutes: 10,
    features: ['ทำซับอัตโนมัติ + แก้ในเว็บ', 'คาราโอเกะ + เทมเพลต + ฟอนต์', 'ดาวน์โหลด SRT เต็ม', 'วิดีโอ 720p', 'มีลายน้ำเล็ก ๆ มุมจอ'],
    cta: 'เริ่มใช้ฟรี',
  },
  {
    id: 'pro',
    name: 'Pro',
    price: '฿159',
    period: '/เดือน',
    who: 'ครีเอเตอร์/ฟรีแลนซ์ที่ตัดคลิปประจำ',
    minutes: 120,
    features: ['ไม่มีลายน้ำ', 'วิดีโอสูงสุด 1080p', 'สร้างโปรเจกต์ CapCut', 'ฟอนต์/เทมเพลต/SFX ครบ', 'โควตา 120 นาทีต่อเดือน'],
    cta: 'อัปเกรดเป็น Pro',
    highlight: true,
  },
  {
    id: 'studio',
    name: 'Studio',
    price: '฿449',
    period: '/เดือน',
    who: 'ทีม/เอเจนซี งานเยอะ',
    minutes: 500,
    features: ['ทุกอย่างใน Pro', 'วิดีโอสูงสุด 4K', 'โควตา 500 นาทีต่อเดือน', 'สร้างโปรเจกต์ CapCut', 'เหมาะกับงานปริมาณมาก'],
    cta: 'อัปเกรดเป็น Studio',
  },
];

// วินาที -> "X นาที" หรือ "X:YY นาที"
export function fmtMinutes(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return s === 0 ? `${m} นาที` : `${m}:${String(s).padStart(2, '0')} นาที`;
}
