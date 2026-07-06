import { NextRequest, NextResponse } from 'next/server';
import { callLLM, extractJson } from '@/lib/llm';
import { AGENT4_SYSTEM, AGENT4_USER, fillTemplate } from '@/lib/prompts';
import { PLATFORMS, CAMPAIGNS, TONES } from '@/lib/platforms';
import type { ProviderId, SocialInput, SocialPost, PlatformId } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, model, apiKey, input, context } = body as {
      provider: ProviderId;
      model: string;
      apiKey: string;
      input: SocialInput;
      context: { brandName: string; videoTitle: string; logline: string; productInfo: string };
    };

    if (!input?.platforms?.length) {
      return NextResponse.json({ error: 'กรุณาเลือกอย่างน้อย 1 แพลตฟอร์ม' }, { status: 400 });
    }

    const platformSpecs = input.platforms
      .map((p) => `- ${p} (${PLATFORMS[p]?.name}): ไม่เกิน ${PLATFORMS[p]?.maxChars} ตัวอักษร · รูปแบบ: ${PLATFORMS[p]?.formats.join('/')}`)
      .join('\n');

    const user = fillTemplate(AGENT4_USER, {
      brandName: context?.brandName || 'ธัญกิจ ปุ๋ยภัณฑ์',
      videoTitle: context?.videoTitle || '(ไม่ระบุ)',
      logline: context?.logline || '(ไม่ระบุ)',
      productInfo: context?.productInfo || '(ไม่ระบุ)',
      platformSpecs,
      campaign: CAMPAIGNS[input.campaign]?.label + ' — ' + (CAMPAIGNS[input.campaign]?.goal || '') || '(ทั่วไป)',
      tone: TONES[input.tone] || input.tone || 'เป็นกันเอง',
      link: input.link || '(ไม่ระบุ ใส่ "ลิงก์ในโปรไฟล์")',
      promo: input.promo || '(ไม่มี)',
    });

    const text = await callLLM({
      provider,
      model,
      apiKey,
      baseUrl: body.baseUrl,
      system: AGENT4_SYSTEM,
      user,
      temperature: 0.85,
      maxTokens: 4096,
      json: true,
    });

    const parsed = extractJson<{ posts: SocialPost[] }>(text);
    const valid = new Set(input.platforms);
    const posts = (parsed.posts || []).filter((p) => valid.has(p.platform as PlatformId));
    return NextResponse.json({ result: posts });
  } catch (e: any) {
    return NextResponse.json({ error: 'สร้างแคปชันไม่สำเร็จ', detail: String(e?.message ?? e) }, { status: 500 });
  }
}
