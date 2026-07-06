import { NextRequest, NextResponse } from 'next/server';
import { callLLM, extractJson } from '@/lib/llm';
import { AGENT2_SYSTEM, AGENT2_USER, fillTemplate } from '@/lib/prompts';
import type { ProductInput, ProductScript, ProviderId, StoryResult } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 60;

const LENGTH_TH = { short: 'สั้น ~30วิ', medium: 'ปานกลาง ~45วิ', long: 'ยาว ~60วิ' };

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, model, apiKey, product, story } = body as {
      provider: ProviderId;
      model: string;
      apiKey: string;
      product: ProductInput;
      story: StoryResult;
    };
    if (!story?.fullStory) {
      return NextResponse.json({ error: 'ยังไม่มีเนื้อเรื่องจาก Agent 1 — สร้างเนื้อเรื่องก่อน' }, { status: 400 });
    }
    if (!product?.productName?.trim()) {
      return NextResponse.json({ error: 'กรุณาใส่ชื่อสินค้า' }, { status: 400 });
    }

    const user = fillTemplate(AGENT2_USER, {
      storyFramework: story.chosenFrame?.name || '',
      characters: story.characterProfile?.name || '',
      setting: story.characterProfile?.setting || '',
      story: story.fullStory,
      storyProblem: story.beats?.problem || '',
      storyPainPoint: story.beats?.pain || '',
      productName: product.productName,
      formula: product.formula || '(ไม่ระบุ)',
      keyFeatures: product.keyFeatures || '(ไม่ระบุ)',
      problemsSolved: product.problemsSolved || '(ไม่ระบุ)',
      howToUse: product.howToUse || '(ไม่ระบุ)',
      pricePromo: product.pricePromo || '(ไม่ระบุ)',
      proofReviews: product.proofReviews || '(ไม่มีหลักฐานตัวเลข — ห้ามแต่งตัวเลข)',
      length: LENGTH_TH[product.length] || LENGTH_TH.medium,
    });

    const text = await callLLM({
      provider,
      model,
      apiKey,
      baseUrl: body.baseUrl,
      system: AGENT2_SYSTEM,
      user,
      temperature: 0.75,
      maxTokens: 3072,
      json: true,
    });

    const result = extractJson<ProductScript>(text);
    return NextResponse.json({ result });
  } catch (e: any) {
    return NextResponse.json({ error: 'เขียนบทขายไม่สำเร็จ', detail: String(e?.message ?? e) }, { status: 500 });
  }
}
