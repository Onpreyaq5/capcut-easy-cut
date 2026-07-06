import type { Storyboard } from '@/lib/types';

/**
 * รวม prompt ทุกช็อตเป็น "บล็อกละ 1 ช็อต คั่นด้วยบรรทัดว่าง"
 * = รูปแบบมาตรฐานที่ Chrome extension ตระกูล Flow Automator / Auto Flow / Veo Automation รับไปทำ batch ได้ทันที
 * (collapse newline ในแต่ละ prompt ให้เป็นช่องว่าง เพื่อไม่ให้บรรทัดว่างภายในไปตัดบล็อกผิด)
 */
export function bulkVeoPrompts(sb: Storyboard): string {
  return sb.scenes
    .map((sc) => (sc.veoPrompt || '').replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .join('\n\n');
}

/** เวอร์ชันมีเลขช็อตกำกับ (เผื่อบางเอ็กซ์เทนชันให้ใส่ชื่อ/โน้ตได้) */
export function bulkVeoPromptsNumbered(sb: Storyboard): string {
  return sb.scenes
    .map((sc, i) => `ช็อต ${i + 1} | ${(sc.veoPrompt || '').replace(/\s*\n\s*/g, ' ').trim()}`)
    .join('\n\n');
}
