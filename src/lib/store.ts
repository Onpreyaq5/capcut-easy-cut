'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  Settings,
  Project,
  StoryResult,
  ProductInput,
  ProductScript,
  Storyboard,
  ReferenceMedia,
  StoryInput,
  StoryboardInput,
  SocialInput,
  SocialPost,
} from '@/lib/types';

export const DEFAULT_SETTINGS: Settings = {
  activeProvider: 'puter',
  models: { puter: 'gpt-4o-mini', anthropic: 'claude-sonnet-4-6', openai: 'gpt-4o', gemini: 'gemini-2.0-flash', local: 'qwen2.5:3b' },
  keys: { puter: '', anthropic: '', openai: '', gemini: '', local: '' },
  localBaseUrl: 'http://127.0.0.1:11434/v1',
  ttsProvider: 'browser',
  ttsKey: '',
  ttsVoiceId: '',
  avatarProvider: 'prompt-only',
  avatarKey: '',
  thaiCheckProvider: '',
  thaiCheckKey: '',
  compareModels: false,
  brandName: 'ธัญกิจ ปุ๋ยภัณฑ์',
  visualStyle: 'ฟิล์มโฆษณาแบรนด์พรีเมียม แสงทองตอนเช้า เกรดสีฟิล์มอุ่น เลนส์ละลายหลังนุ่ม กล้องเคลื่อนนุ่มนวล สมจริงมีมิติ อารมณ์อบอุ่น บรรยากาศทุ่งนาไทย',
  theme: 'dark',
};

function freshProject(): Project {
  return {
    id: `p_${Date.now()}`,
    name: 'คลิปใหม่',
    updatedAt: Date.now(),
    references: [],
    storyInput: {
      brandName: 'ธัญกิจ ปุ๋ยภัณฑ์',
      idea: '',
      referenceContext: '',
      tone: 'จริงใจ เนิบ บ้านๆ',
      durationSec: 45,
      notes: '',
      frameOverride: 'auto',
    },
    products: [],
    productScripts: [],
    storyboardInput: {
      aspectRatio: '9:16',
      targetDurationSec: 40,
      secondsPerScene: 10,
      audioSource: 'flow',
      visualStyle: 'ฟิล์มโฆษณาแบรนด์พรีเมียม แสงทองตอนเช้า เกรดสีฟิล์มอุ่น เลนส์ละลายหลังนุ่ม กล้องเคลื่อนนุ่มนวล สมจริงมีมิติ อารมณ์อบอุ่น บรรยากาศทุ่งนาไทย',
      storyFramework: '',
      fullStory: '',
      salesScript: '',
      productInfo: '',
      characterHint: '',
    },
    audio: {},
    socialInput: { platforms: ['tiktok', 'facebook'], campaign: 'problem_solution', tone: 'friendly', link: '', promo: '' },
    socialPosts: [],
  };
}

export function emptyProduct(): ProductInput {
  return {
    id: `prod_${Date.now()}_${Math.floor(Math.random() * 1000)}`,
    productName: '',
    formula: '',
    keyFeatures: '',
    problemsSolved: '',
    howToUse: '',
    pricePromo: '',
    proofReviews: '',
    length: 'medium',
  };
}

interface AppState {
  settings: Settings;
  project: Project;
  hydrated: boolean;
  // settings
  setSettings: (patch: Partial<Settings>) => void;
  setKey: (p: keyof Settings['keys'], v: string) => void;
  setModel: (p: keyof Settings['models'], v: string) => void;
  toggleTheme: () => void;
  // project
  resetProject: () => void;
  patchStoryInput: (patch: Partial<StoryInput>) => void;
  setStory: (s: StoryResult) => void;
  addReference: (r: ReferenceMedia) => void;
  removeReference: (id: string) => void;
  setReferenceContext: (text: string) => void;
  setProducts: (p: ProductInput[]) => void;
  addProductScript: (s: ProductScript) => void;
  removeProductScript: (i: number) => void;
  clearProductScripts: () => void;
  patchStoryboardInput: (patch: Partial<StoryboardInput>) => void;
  setStoryboard: (sb: Storyboard) => void;
  setSceneAudio: (sceneId: string, dataUrl: string) => void;
  patchSocialInput: (patch: Partial<SocialInput>) => void;
  setSocialPosts: (posts: SocialPost[]) => void;
  setHydrated: () => void;
}

export const useApp = create<AppState>()(
  persist(
    (set) => ({
      settings: DEFAULT_SETTINGS,
      project: freshProject(),
      hydrated: false,

      setSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      setKey: (p, v) => set((s) => ({ settings: { ...s.settings, keys: { ...s.settings.keys, [p]: v } } })),
      setModel: (p, v) => set((s) => ({ settings: { ...s.settings, models: { ...s.settings.models, [p]: v } } })),
      toggleTheme: () =>
        set((s) => ({ settings: { ...s.settings, theme: s.settings.theme === 'light' ? 'dark' : 'light' } })),

      resetProject: () => set({ project: freshProject() }),
      patchStoryInput: (patch) =>
        set((s) => ({ project: { ...s.project, storyInput: { ...s.project.storyInput, ...patch }, updatedAt: Date.now() } })),
      setStory: (story) =>
        set((s) => ({
          project: {
            ...s.project,
            story,
            storyboardInput: {
              ...s.project.storyboardInput,
              fullStory: story.fullStory,
              characterHint: `${story.characterProfile.name} ${story.characterProfile.ageRange} ${story.characterProfile.appearance} ${story.characterProfile.outfit}`,
              storyFramework: frameworkKey(story.chosenFrame.id),
            },
            updatedAt: Date.now(),
          },
        })),
      addReference: (r) => set((s) => ({ project: { ...s.project, references: [...s.project.references, r] } })),
      removeReference: (id) =>
        set((s) => ({ project: { ...s.project, references: s.project.references.filter((r) => r.id !== id) } })),
      setReferenceContext: (text) =>
        set((s) => ({ project: { ...s.project, storyInput: { ...s.project.storyInput, referenceContext: text } } })),
      setProducts: (products) => set((s) => ({ project: { ...s.project, products } })),
      addProductScript: (script) =>
        set((s) => {
          const productScripts = [...s.project.productScripts, script];
          return {
            project: {
              ...s.project,
              productScripts,
              storyboardInput: {
                ...s.project.storyboardInput,
                salesScript: productScripts.map((p) => `## ${p.productName}\n${p.salesScript}`).join('\n\n'),
                productInfo: productScripts
                  .map((p) => `- ${p.productName}: ${p.keyBenefitsSpoken.join(', ')}`)
                  .join('\n'),
              },
              updatedAt: Date.now(),
            },
          };
        }),
      removeProductScript: (i) =>
        set((s) => ({ project: { ...s.project, productScripts: s.project.productScripts.filter((_, idx) => idx !== i) } })),
      clearProductScripts: () => set((s) => ({ project: { ...s.project, productScripts: [] } })),
      patchStoryboardInput: (patch) =>
        set((s) => ({ project: { ...s.project, storyboardInput: { ...s.project.storyboardInput, ...patch } } })),
      setStoryboard: (storyboard) => set((s) => ({ project: { ...s.project, storyboard, updatedAt: Date.now() } })),
      setSceneAudio: (sceneId, dataUrl) =>
        set((s) => ({ project: { ...s.project, audio: { ...s.project.audio, [sceneId]: dataUrl } } })),
      patchSocialInput: (patch) =>
        set((s) => ({ project: { ...s.project, socialInput: { ...s.project.socialInput, ...patch } } })),
      setSocialPosts: (posts) => set((s) => ({ project: { ...s.project, socialPosts: posts, updatedAt: Date.now() } })),
      setHydrated: () => set({ hydrated: true }),
    }),
    {
      name: 'thanyakij-ai-web',
      version: 5,
      // ไม่เก็บไฟล์อ้างอิง/เสียง (ใหญ่เกิน localStorage) — เก็บเฉพาะข้อความ
      partialize: (s) => ({
        settings: s.settings,
        project: { ...s.project, references: [], audio: {} },
      }),
      // เติมฟิลด์ใหม่ให้โปรเจกต์เก่า (aspectRatio/secondsPerScene/audioSource)
      migrate: (persisted: any) => {
        const sbi = persisted?.project?.storyboardInput;
        if (sbi) {
          sbi.aspectRatio = sbi.aspectRatio || '9:16';
          sbi.secondsPerScene = sbi.secondsPerScene ?? 10;
          sbi.audioSource = sbi.audioSource || 'flow';
        }
        if (persisted?.settings) {
          persisted.settings.localBaseUrl = persisted.settings.localBaseUrl || 'http://127.0.0.1:11434/v1';
          persisted.settings.thaiCheckProvider = persisted.settings.thaiCheckProvider || persisted.settings.brollProvider || '';
          persisted.settings.thaiCheckKey = persisted.settings.thaiCheckKey || persisted.settings.brollKey || '';
          delete persisted.settings.pexelsKey;
          delete persisted.settings.brollProvider;
          delete persisted.settings.brollKey;
          persisted.settings.models = { puter: 'gpt-4o-mini', local: 'qwen2.5:3b', ...persisted.settings.models };
          persisted.settings.keys = { puter: '', local: '', ...persisted.settings.keys };
        }
        if (persisted?.project) {
          persisted.project.socialInput = persisted.project.socialInput || {
            platforms: ['tiktok', 'facebook'],
            campaign: 'problem_solution',
            tone: 'friendly',
            link: '',
            promo: '',
          };
          persisted.project.socialPosts = persisted.project.socialPosts || [];
        }
        return persisted;
      },
      onRehydrateStorage: () => (state) => state?.setHydrated(),
    },
  ),
);

export function frameworkKey(id: number): string {
  return (
    ['', 'hero_journey', 'confession', 'transformation_reveal', 'origin', 'lesson', 'proof_first'][id] || ''
  );
}
