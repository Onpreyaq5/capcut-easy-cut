/* ============================================================
   ตัวสร้าง prompt กลาง (ใช้ได้ทั้งฝั่ง server [API route] และ browser [Puter])
   ============================================================ */
import {
  AGENT1_SYSTEM, AGENT1_USER,
  AGENT2_SYSTEM, AGENT2_USER,
  AGENT3_SYSTEM, AGENT3_USER,
  AGENT4_SYSTEM, AGENT4_USER,
  fillTemplate,
} from '@/lib/prompts';
import { PLATFORMS, CAMPAIGNS, TONES } from '@/lib/platforms';
import type {
  StoryInput, StoryResult, ProductInput, StoryboardInput, Storyboard, Scene, SocialInput,
} from '@/lib/types';

export interface Built {
  system: string;
  user: string;
}

const LENGTH_TH = { short: 'สั้น ~30วิ', medium: 'ปานกลาง ~45วิ', long: 'ยาว ~60วิ' } as const;

export function buildStory(input: StoryInput): Built {
  const user = fillTemplate(AGENT1_USER, {
    brandName: input.brandName || 'ธัญกิจ ปุ๋ยภัณฑ์',
    idea: input.idea,
    referenceContext: input.referenceContext || '(ไม่มี)',
    tone: input.tone || 'จริงใจ บ้านๆ',
    durationSec: input.durationSec || 45,
    frameOverride: input.frameOverride && input.frameOverride !== 'auto' ? `โครงที่ ${input.frameOverride}` : 'auto (ให้ AI เลือก)',
    notes: input.notes || '(ไม่มี)',
  });
  return { system: AGENT1_SYSTEM, user };
}

export function buildProduct(story: StoryResult, product: ProductInput): Built {
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
  return { system: AGENT2_SYSTEM, user };
}

export function buildStoryboard(input: StoryboardInput): Built & { aspectRatio: string; secondsPerScene: number } {
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
  return { system: AGENT3_SYSTEM, user, aspectRatio, secondsPerScene };
}

export function buildSocial(
  input: SocialInput,
  context: { brandName: string; videoTitle: string; logline: string; productInfo: string },
): Built {
  const platformSpecs = input.platforms
    .map((p) => `- ${p} (${PLATFORMS[p]?.name}): ไม่เกิน ${PLATFORMS[p]?.maxChars} ตัวอักษร · รูปแบบ: ${PLATFORMS[p]?.formats.join('/')}`)
    .join('\n');
  const user = fillTemplate(AGENT4_USER, {
    brandName: context?.brandName || 'ธัญกิจ ปุ๋ยภัณฑ์',
    videoTitle: context?.videoTitle || '(ไม่ระบุ)',
    logline: context?.logline || '(ไม่ระบุ)',
    productInfo: context?.productInfo || '(ไม่ระบุ)',
    platformSpecs,
    campaign: (CAMPAIGNS[input.campaign]?.label || '') + ' — ' + (CAMPAIGNS[input.campaign]?.goal || '(ทั่วไป)'),
    tone: TONES[input.tone] || input.tone || 'เป็นกันเอง',
    link: input.link || '(ไม่ระบุ ใส่ "ลิงก์ในโปรไฟล์")',
    promo: input.promo || '(ไม่มี)',
  });
  return { system: AGENT4_SYSTEM, user };
}

/** กันค่าเพี้ยน: บังคับเวลาให้ต่อเนื่อง คำนวณ durationSec/total ใหม่ */
export function normalizeStoryboard(sb: Storyboard, maxSceneSec: number, aspectRatio: string): Storyboard {
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
