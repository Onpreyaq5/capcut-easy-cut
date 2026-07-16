import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, rateLimit } from '@/lib/authStore';
import { callLLM, extractJson } from '@/lib/llm';
import { AGENT1_SYSTEM, AGENT1_USER, fillTemplate } from '@/lib/prompts';
import type { ProviderId, StoryInput, StoryResult } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, { status: 401 });
  if (!rateLimit(`ai:${user.email}`, 30, 60_000)) return NextResponse.json({ error: 'เรียก AI ถี่เกินไป กรุณารอสักครู่' }, { status: 429 });
  try {
    const body = await req.json();
    const { provider, model, apiKey, input, images } = body as {
      provider: ProviderId;
      model: string;
      apiKey: string;
      input: StoryInput;
      images?: string[];
    };
    if (!input?.idea?.trim()) {
      return NextResponse.json({ error: 'กรุณาใส่โครงเรื่องคร่าวๆ ก่อน' }, { status: 400 });
    }

    const user = fillTemplate(AGENT1_USER, {
      brandName: input.brandName || 'ธัญกิจ ปุ๋ยภัณฑ์',
      idea: input.idea,
      referenceContext: input.referenceContext || '(ไม่มี)',
      tone: input.tone || 'จริงใจ บ้านๆ',
      durationSec: input.durationSec || 45,
      frameOverride: input.frameOverride && input.frameOverride !== 'auto' ? `โครงที่ ${input.frameOverride}` : 'auto (ให้ AI เลือก)',
      notes: input.notes || '(ไม่มี)',
    });

    const text = await callLLM({
      provider,
      model,
      apiKey,
      baseUrl: body.baseUrl,
      system: AGENT1_SYSTEM,
      user,
      images: images?.slice(0, 4),
      temperature: 0.8,
      maxTokens: 4096,
      json: true,
    });

    const result = extractJson<StoryResult>(text);
    return NextResponse.json({ result });
  } catch (e: any) {
    return NextResponse.json({ error: 'สร้างเนื้อเรื่องไม่สำเร็จ', detail: String(e?.message ?? e) }, { status: 500 });
  }
}
