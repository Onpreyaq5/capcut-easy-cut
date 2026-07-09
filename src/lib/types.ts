/* ============================================================
   ชนิดข้อมูลกลางของระบบ ธัญกิจ ปุ๋ยภัณฑ์ AI WEB
   ============================================================ */

export type ProviderId = 'puter' | 'anthropic' | 'openai' | 'gemini' | 'local';

export interface ProviderMeta {
  id: ProviderId;
  label: string;
  /** โมเดลแนะนำให้เลือก (ผู้ใช้พิมพ์เองได้) */
  models: string[];
  defaultModel: string;
  keyHint: string;
  /** หน้าเว็บไปขอ API key */
  keyUrl: string;
}

/** ตั้งค่าทั้งหมด (เก็บใน localStorage) */
export interface Settings {
  activeProvider: ProviderId;
  models: Record<ProviderId, string>;
  keys: Record<ProviderId, string>;
  /** TTS เสียงพากย์ไทย */
  ttsProvider: 'browser' | 'elevenlabs' | 'google';
  ttsKey: string;
  ttsVoiceId: string;
  /** อวตารตัวละครพูด */
  avatarProvider: 'prompt-only' | 'heygen' | 'did';
  avatarKey: string;
  /** AI เฉพาะงานตรวจแก้ภาษาไทยในซับ (เจ้าฟรี: groq/cerebras/openrouter) — เว้นว่าง = ใช้ AI จากหน้าตั้งค่า */
  thaiCheckProvider: '' | 'groq' | 'cerebras' | 'openrouter';
  thaiCheckKey: string;
  /** Base URL ของ LLM ในเครื่อง (Ollama/LM Studio, OpenAI-compatible) */
  localBaseUrl: string;
  /** ค่าเริ่มต้นแบรนด์ */
  brandName: string;
  visualStyle: string;
  theme: 'light' | 'dark';
  /** EasyCut Advanced Settings */
  minSilence: string;
  pad: string;
  removeFillers: boolean;
  generateShorts: boolean;
  detectSpeakers: boolean;
}

/** ไฟล์อ้างอิงที่ผู้ใช้แนบ (รูป/วิดีโอ) */
export interface ReferenceMedia {
  id: string;
  name: string;
  mime: string;
  kind: 'image' | 'video';
  /** data URL (base64) — รูปส่งเข้า vision ได้, วิดีโอใช้แค่ชื่อ/คำบรรยาย */
  dataUrl: string;
  /** คำบรรยายที่ผู้ใช้หรือ AI ใส่ */
  note?: string;
}

/* ---------- Agent 1: เนื้อเรื่องชาวนา ---------- */
export interface StoryBeats {
  problem: string;
  pain: string;
  failedAttempts: string;
  turningPoint: string;
  result: string;
}

export interface CharacterProfile {
  name: string;
  ageRange: string;
  appearance: string;
  outfit: string;
  setting: string;
  voiceTone: string;
  personality: string;
}

export interface StoryResult {
  chosenFrame: { id: number; name: string; why: string };
  logline: string;
  hook: string;
  fullStory: string;
  beats: StoryBeats;
  suggestedDurationSec: number;
  characterProfile: CharacterProfile;
}

export interface StoryInput {
  brandName: string;
  idea: string;
  referenceContext: string;
  tone: string;
  durationSec: number;
  notes: string;
  frameOverride?: number | 'auto';
}

/* ---------- Agent 2: บทขายสินค้า ---------- */
export interface ProductInput {
  id: string;
  productName: string;
  formula: string;
  keyFeatures: string;
  problemsSolved: string;
  howToUse: string;
  pricePromo: string;
  proofReviews: string;
  /** ความยาวบทขายที่ต้องการ */
  length: 'short' | 'medium' | 'long';
}

export interface ProductScript {
  productName: string;
  storyFrameworkUsed: string;
  integrationPoint: { beat: string; anchorInStory: string; bridge: string };
  salesScript: string;
  keyBenefitsSpoken: string[];
  objectionHandling: { objection: string; response: string }[];
  cta: { type: string; spokenLine: string };
  complianceFlags: string[];
  notes: string;
}

/* ---------- Agent 3: Storyboard ---------- */
export type Beat = 'problem' | 'pain' | 'failed_attempts' | 'turning_point' | 'result';

export interface Scene {
  id: string;
  beat: Beat;
  startSec: number;
  endSec: number;
  durationSec: number;
  shotDescription: string;
  onScreenText: string;
  voiceoverTH: string;
  veoPrompt: string;
  characterSpeakingPrompt: string;
  ttsVoiceHint: string;
}

export interface CharacterBible {
  name: string;
  appearance: string;
  outfit: string;
  voiceProfile: string;
}

export interface Storyboard {
  videoTitle: string;
  aspectRatio: string;
  storyFramework: string;
  totalDurationSec: number;
  generationStep: 'preview' | 'generate';
  captionsSrtReady: boolean;
  characterBible: CharacterBible;
  scenes: Scene[];
  reasoning: string;
}

export interface StoryboardInput {
  aspectRatio: '9:16' | '16:9' | '1:1';
  targetDurationSec: number;
  /** ความยาวต่อ 1 ช็อต ตามโมเดล Flow (เช่น 8 หรือ 10 วินาที) */
  secondsPerScene: number;
  /** แหล่งเสียง: 'flow' = ฝังบทพูดให้ Flow สร้างเสียงเอง, 'tts' = พากย์แยกทีหลัง */
  audioSource: 'flow' | 'tts';
  visualStyle: string;
  storyFramework: string;
  fullStory: string;
  salesScript: string;
  productInfo: string;
  characterHint: string;
}

/* ---------- Agent 4: แคปชัน + โพสต์หลายแพลตฟอร์ม ---------- */
export type PlatformId = 'tiktok' | 'facebook' | 'instagram' | 'youtube' | 'line_oa';

export interface SocialInput {
  platforms: PlatformId[];
  campaign: string;
  tone: string;
  link: string;
  promo: string;
}

export interface SocialPost {
  platform: PlatformId;
  hook: string;
  caption: string;
  hashtags: string[];
  cta: string;
  formatNote: string;
}

/* ---------- โปรเจกต์รวม (สถานะ pipeline 1→2→3→4) ---------- */
export interface Project {
  id: string;
  name: string;
  updatedAt: number;
  references: ReferenceMedia[];
  storyInput: StoryInput;
  story?: StoryResult;
  products: ProductInput[];
  productScripts: ProductScript[];
  storyboardInput: StoryboardInput;
  storyboard?: Storyboard;
  /** เสียงพากย์ที่ generate แล้ว (sceneId -> data URL) */
  audio: Record<string, string>;
  socialInput: SocialInput;
  socialPosts: SocialPost[];
}

/* ---------- คำขอ API กลาง ---------- */
export interface LlmRequest {
  provider: ProviderId;
  model: string;
  apiKey: string;
  /** ใช้กับ provider 'local' (Ollama/LM Studio) */
  baseUrl?: string;
  system: string;
  user: string;
  /** รูปอ้างอิง (data URL) ส่งเข้า vision */
  images?: string[];
  temperature?: number;
  maxTokens?: number;
  /** บังคับให้ตอบเป็น JSON */
  json?: boolean;
}

export interface ApiError {
  error: string;
  detail?: string;
}
