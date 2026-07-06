'use client';

import type {
  Settings,
  StoryInput,
  StoryResult,
  ProductInput,
  ProductScript,
  StoryboardInput,
  Storyboard,
  SocialInput,
  SocialPost,
} from '@/lib/types';
import { extractJson } from '@/lib/llm';
import { buildStory, buildProduct, buildStoryboard, buildSocial, normalizeStoryboard } from '@/lib/agentBuild';

/* ---------------- โหมดฟรี: Puter.js (AI ผ่านคลาวด์ ไม่ต้องใช้ key) ---------------- */
function puterText(resp: any): string {
  if (typeof resp === 'string') return resp;
  const c = resp?.message?.content ?? resp?.content ?? resp?.text;
  if (typeof c === 'string') return c;
  if (Array.isArray(c)) return c.map((b: any) => (typeof b === 'string' ? b : b?.text ?? '')).join('');
  return resp != null ? String(resp) : '';
}

async function callPuter(model: string, system: string, user: string): Promise<string> {
  const puter = (typeof window !== 'undefined' ? (window as any).puter : null);
  if (!puter?.ai?.chat) {
    throw new Error('โหมดฟรี (Puter) ยังโหลดไม่เสร็จ — รอ 2-3 วินาทีแล้วลองใหม่ หรือเช็คอินเทอร์เน็ต');
  }
  const resp = await puter.ai.chat(
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    { model },
  );
  const text = puterText(resp).trim();
  if (!text) throw new Error('โหมดฟรี (Puter) ไม่ส่งข้อความกลับมา ลองกดสร้างใหม่อีกครั้ง');
  return text;
}

async function postJson<T>(url: string, body: unknown): Promise<T> {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data?.detail ? `${data.error}: ${data.detail}` : data?.error || `เกิดข้อผิดพลาด (${res.status})`);
  }
  return data.result as T;
}

function llmConf(settings: Settings) {
  return {
    provider: settings.activeProvider,
    model: settings.models[settings.activeProvider],
    apiKey: settings.keys[settings.activeProvider],
    baseUrl: settings.localBaseUrl,
  };
}

export async function generateStory(settings: Settings, input: StoryInput, images: string[] = []): Promise<StoryResult> {
  if (settings.activeProvider === 'puter') {
    const { system, user } = buildStory(input);
    return extractJson<StoryResult>(await callPuter(settings.models.puter, system, user));
  }
  return postJson<StoryResult>('/api/agent/story', { ...llmConf(settings), input, images });
}

export async function generateProduct(settings: Settings, story: StoryResult, product: ProductInput): Promise<ProductScript> {
  if (settings.activeProvider === 'puter') {
    const { system, user } = buildProduct(story, product);
    return extractJson<ProductScript>(await callPuter(settings.models.puter, system, user));
  }
  return postJson<ProductScript>('/api/agent/product', { ...llmConf(settings), story, product });
}

export async function generateStoryboard(settings: Settings, input: StoryboardInput): Promise<Storyboard> {
  if (settings.activeProvider === 'puter') {
    const { system, user, aspectRatio, secondsPerScene } = buildStoryboard(input);
    const sb = extractJson<Storyboard>(await callPuter(settings.models.puter, system, user));
    return normalizeStoryboard(sb, secondsPerScene, aspectRatio);
  }
  return postJson<Storyboard>('/api/agent/storyboard', { ...llmConf(settings), input });
}

export interface CharacterPackage {
  videoTitle: string;
  characterBible: Storyboard['characterBible'];
  totalShots: number;
  talkingShots: number;
  shots: {
    sceneId: string;
    index: number;
    beat: string;
    startSec: number;
    endSec: number;
    isTalking: boolean;
    finalVeoPrompt: string;
    finalCharacterPrompt: string;
    voiceoverTH: string;
    ttsVoiceHint: string;
  }[];
  avatarNote: string;
  generationStep: 'generate';
}

export async function generateSocial(
  settings: Settings,
  input: SocialInput,
  context: { brandName: string; videoTitle: string; logline: string; productInfo: string },
): Promise<SocialPost[]> {
  if (settings.activeProvider === 'puter') {
    const { system, user } = buildSocial(input, context);
    const parsed = extractJson<{ posts: SocialPost[] }>(await callPuter(settings.models.puter, system, user));
    const valid = new Set(input.platforms);
    return (parsed.posts || []).filter((p) => valid.has(p.platform));
  }
  return postJson<SocialPost[]>('/api/agent/social', { ...llmConf(settings), input, context });
}

export function generateCharacter(settings: Settings, storyboard: Storyboard): Promise<CharacterPackage> {
  return postJson<CharacterPackage>('/api/generate/character', {
    storyboard,
    avatarProvider: settings.avatarProvider,
    avatarKey: settings.avatarKey,
  });
}

/** สร้างเสียง: ถ้าเลือก browser ใช้ Web Speech (เล่นเลย ไม่คืนไฟล์), ถ้า cloud คืน data URL */
export async function generateVoice(settings: Settings, text: string): Promise<string | null> {
  if (settings.ttsProvider === 'browser') {
    speakBrowser(text, settings);
    return null;
  }
  const res = await fetch('/api/generate/voice', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider: settings.ttsProvider, apiKey: settings.ttsKey, text, voiceId: settings.ttsVoiceId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail ? `${data.error}: ${data.detail}` : data?.error || 'สร้างเสียงไม่สำเร็จ');
  return data.dataUrl as string;
}

/** เล่นเสียงพากย์ในเบราว์เซอร์ (ฟรี ไม่ต้องมี key) — เคารพ Voice ID ที่เลือก */
export function speakBrowser(text: string, settings: Settings) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  const voices = window.speechSynthesis.getVoices();
  const chosen = settings.ttsVoiceId ? voices.find((v) => v.name === settings.ttsVoiceId) : undefined;
  const th = chosen || voices.find((v) => v.lang?.toLowerCase().startsWith('th'));
  previewBrowserVoice(text, th?.name);
}

/** เล่นเสียงตัวอย่างด้วยเสียงเบราว์เซอร์ที่ระบุชื่อ (ใช้ในหน้าฟังเสียง) */
export function previewBrowserVoice(text: string, voiceName?: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.rate = 0.95;
  const voices = window.speechSynthesis.getVoices();
  const v = voiceName ? voices.find((x) => x.name === voiceName) : voices.find((x) => x.lang?.toLowerCase().startsWith('th'));
  if (v) {
    u.voice = v;
    u.lang = v.lang;
  } else {
    u.lang = 'th-TH';
  }
  window.speechSynthesis.speak(u);
}

/** เล่นเสียงตัวอย่างจากคลาวด์ (Google/ElevenLabs) ตาม voiceId — ต้องมี key */
export async function previewCloudVoice(
  provider: 'elevenlabs' | 'google',
  apiKey: string,
  text: string,
  voiceId: string,
): Promise<void> {
  const res = await fetch('/api/generate/voice', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ provider, apiKey, text, voiceId }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.detail ? `${data.error}: ${data.detail}` : data?.error || 'เล่นเสียงไม่สำเร็จ');
  await new Audio(data.dataUrl).play();
}

export function stopSpeaking() {
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) window.speechSynthesis.cancel();
}

/* ---------------- Google Flow ---------------- */
export const FLOW_URL = 'https://labs.google/fx/tools/flow';

/** คัดลอก prompt แล้วเปิด Google Flow ในแท็บใหม่ (Flow ไม่มี API ต้องวางเอง) */
export async function copyAndOpenFlow(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    /* ignore */
  }
  if (typeof window !== 'undefined') window.open(FLOW_URL, '_blank', 'noopener,noreferrer');
}
