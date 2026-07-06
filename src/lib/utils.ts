import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** รวม className แบบฉลาด (clsx + tailwind-merge) */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** หน่วงเวลา (ใช้กับ retry / animation) */
export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** ตัดข้อความให้สั้นลงพร้อม … */
export function truncate(text: string, max = 120) {
  if (!text) return '';
  return text.length > max ? text.slice(0, max).trimEnd() + '…' : text;
}

/** สร้าง id สั้นๆ แบบ deterministic-ish (ไม่ใช้ crypto เพื่อให้รันได้ทุกที่) */
export function uid(prefix = 'id') {
  return `${prefix}_${Math.abs(hashString(prefix + performance.now())).toString(36)}`;
}

function hashString(str: string) {
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  }
  return h;
}
