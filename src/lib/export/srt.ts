import type { Scene } from '@/lib/types';

/** แปลงวินาที -> HH:MM:SS,mmm */
export function secToSrtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  const pad = (n: number, l = 2) => String(n).padStart(l, '0');
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`;
}

/**
 * สร้างไฟล์ .srt จาก storyboard
 * @param field เลือกว่าจะใช้ซับบนจอ (onScreenText) หรือบทพากย์เต็ม (voiceoverTH)
 */
export function scenesToSrt(scenes: Scene[], field: 'onScreenText' | 'voiceoverTH' = 'voiceoverTH'): string {
  return scenes
    .map((sc, i) => {
      const text = (sc[field] || sc.voiceoverTH || sc.onScreenText || '').trim();
      return `${i + 1}\n${secToSrtTime(sc.startSec)} --> ${secToSrtTime(sc.endSec)}\n${text}\n`;
    })
    .join('\n');
}
