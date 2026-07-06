import { NextRequest, NextResponse } from 'next/server';
import type { Storyboard } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * สเต็ป 2 ของ "ตัวละครพูด": รับ storyboard (พรีวิว) แล้วสร้าง
 * "ชุด prompt พร้อมผลิตจริง" ต่อช็อต (veo + ตัวละครพูด ผูก character bible ให้คงเส้นคงวา)
 * ถ้ามี key อวตาร (HeyGen/D-ID) จะแนบหมายเหตุการต่อยอด
 */
export async function POST(req: NextRequest) {
  try {
    const { storyboard, avatarProvider, avatarKey } = (await req.json()) as {
      storyboard: Storyboard;
      avatarProvider: 'prompt-only' | 'heygen' | 'did';
      avatarKey?: string;
    };
    if (!storyboard?.scenes?.length) {
      return NextResponse.json({ error: 'ยังไม่มี storyboard ให้สร้าง' }, { status: 400 });
    }

    const bible = storyboard.characterBible;
    const bibleTag = `[CHARACTER LOCK] ${bible?.name ?? ''} — ${bible?.appearance ?? ''}, wearing ${bible?.outfit ?? ''}. Keep identical across all shots.`;

    const shots = storyboard.scenes.map((sc, i) => {
      const finalVeoPrompt = `${sc.veoPrompt}\n${bibleTag}`.trim();
      const finalCharacterPrompt = sc.characterSpeakingPrompt
        ? `${sc.characterSpeakingPrompt}\n${bibleTag}\nLip-sync exactly to Thai voiceover: "${sc.voiceoverTH}"`
        : '';
      return {
        sceneId: sc.id,
        index: i + 1,
        beat: sc.beat,
        startSec: sc.startSec,
        endSec: sc.endSec,
        isTalking: Boolean(sc.characterSpeakingPrompt),
        finalVeoPrompt,
        finalCharacterPrompt,
        voiceoverTH: sc.voiceoverTH,
        ttsVoiceHint: sc.ttsVoiceHint,
      };
    });

    let avatarNote = '';
    if (avatarProvider === 'heygen' || avatarProvider === 'did') {
      avatarNote = avatarKey
        ? `พร้อมต่อ ${avatarProvider.toUpperCase()} — ระบบเตรียม prompt + บทพากย์ให้แล้ว ขั้นถัดไปต้องระบุ avatar_id/voice_id ของบัญชี ${avatarProvider} เพื่อสั่งเรนเดอร์วิดีโออวตารจริง (ดูคู่มือในหน้า "ตั้งค่า")`
        : `ยังไม่ได้ใส่ API key ของ ${avatarProvider} — แสดง prompt พร้อมผลิตให้ก่อน เอาไปเข้า Google Flow ได้เลย`;
    } else {
      avatarNote = 'โหมด Prompt-only: นำ prompt พร้อมผลิตด้านล่างไปวางใน Google Flow/Veo ได้ทันที (1 ช็อต = 1 prompt) แล้วใส่เสียงพากย์ที่สร้างจากปุ่ม "สร้างเสียง"';
    }

    return NextResponse.json({
      result: {
        videoTitle: storyboard.videoTitle,
        characterBible: bible,
        totalShots: shots.length,
        talkingShots: shots.filter((s) => s.isTalking).length,
        shots,
        avatarNote,
        generationStep: 'generate',
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: 'สร้างชุดตัวละครพูดไม่สำเร็จ', detail: String(e?.message ?? e) }, { status: 500 });
  }
}
