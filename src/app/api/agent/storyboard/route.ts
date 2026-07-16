import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, rateLimit } from '@/lib/authStore';
import { callLLM, extractJson } from '@/lib/llm';
import { AGENT3_SYSTEM, AGENT3_USER, fillTemplate } from '@/lib/prompts';
import type { ProviderId, Storyboard, StoryboardInput, Scene } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, { status: 401 });
  if (!rateLimit(`ai:${user.email}`, 30, 60_000)) return NextResponse.json({ error: 'เรียก AI ถี่เกินไป กรุณารอสักครู่' }, { status: 429 });
  try {
    const body = await req.json();
    const { provider, model, apiKey, input } = body as {
      provider: ProviderId;
      model: string;
      apiKey: string;
      input: StoryboardInput;
    };
    if (!input?.fullStory) {
      return NextResponse.json({ error: 'ยังไม่มีเนื้อเรื่อง — กลับไปทำขั้นที่ 1 ก่อน' }, { status: 400 });
    }

    const aspectRatio = input.aspectRatio || '9:16';
    const secondsPerScene = Math.min(15, Math.max(4, input.secondsPerScene || 10));

    const user = fillTemplate(AGENT3_USER, {
      aspectRatio,
      secondsPerScene,
      audioSource: input.audioSource || 'flow',
      targetDurationSec: input.targetDurationSec || 40,
      visualStyle: input.visualStyle || 'ฟิล์มโฆษณาแบรนด์พรีเมียม แสงทองตอนเช้า เกรดสีฟิล์มอุ่น เลนส์ละลายหลัง สมจริงมีมิติ บรรยากาศทุ่งนาไทย',
      storyFramework: input.storyFramework || '(ให้ AI เลือก)',
      fullStory: input.fullStory,
      salesScript: input.salesScript || '(ยังไม่มีบทขาย — เล่าเรื่องตามปกติ เว้นจุดพลิกไว้)',
      productInfo: input.productInfo || '(ไม่ระบุ)',
      characterHint: input.characterHint || '(ไม่ระบุ ให้ AI กำหนดตามบริบทเกษตรไทย)',
    });

    const text = await callLLM({
      provider,
      model,
      apiKey,
      baseUrl: body.baseUrl,
      system: AGENT3_SYSTEM,
      user,
      temperature: 0.7,
      maxTokens: 8192,
      json: true,
    });

    const sb = normalizeStoryboard(extractJson<Storyboard>(text), secondsPerScene, aspectRatio);
    return NextResponse.json({ result: sb });
  } catch (e: any) {
    return NextResponse.json({ error: 'สร้าง storyboard ไม่สำเร็จ', detail: String(e?.message ?? e) }, { status: 500 });
  }
}

/** กันค่าเพี้ยน: บังคับเวลาให้ต่อเนื่อง คำนวณ durationSec/total ใหม่ ตามความยาวต่อช็อต */
function normalizeStoryboard(sb: Storyboard, maxSceneSec: number, aspectRatio: string): Storyboard {
  let t = 0;
  const scenes: Scene[] = (sb.scenes || []).map((sc, i) => {
    const dur = Math.min(maxSceneSec, Math.max(3, Math.round(sc.durationSec || (sc.endSec ?? 0) - (sc.startSec ?? 0) || maxSceneSec)));
    const startSec = t;
    const endSec = t + dur;
    t = endSec;
    return {
      ...sc,
      id: sc.id || `s${i + 1}`,
      startSec,
      endSec,
      durationSec: dur,
      onScreenText: sc.onScreenText ?? '',
      characterSpeakingPrompt: sc.characterSpeakingPrompt ?? '',
    };
  });
  return {
    ...sb,
    aspectRatio,
    generationStep: 'preview',
    scenes,
    totalDurationSec: t,
    captionsSrtReady: scenes.length > 0 && scenes.every((s) => s.voiceoverTH?.trim()),
  };
}
