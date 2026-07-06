'use client';

import { useRef, useState } from 'react';
import { Sparkles, ImagePlus, X, RefreshCw, ArrowRight, Lightbulb } from 'lucide-react';
import { useApp } from '@/lib/store';
import { generateStory } from '@/lib/api';
import { Card, Field, Input, Textarea, Select, Button, Badge, Alert, CopyButton } from '@/components/ui';
import { uid } from '@/lib/utils';
import type { ReferenceMedia } from '@/lib/types';

const FRAMES = [
  { v: 'auto', t: 'ให้ AI เลือกให้' },
  { v: '1', t: '1 · ลุกจากก้นเหว' },
  { v: '2', t: '2 · สารภาพ' },
  { v: '3', t: '3 · ก่อน-หลัง' },
  { v: '4', t: '4 · จุดเริ่มต้น' },
  { v: '5', t: '5 · เคสคนอื่น' },
  { v: '6', t: '6 · เฉลยผล' },
];

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result as string);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

export function StepStory({ onNext }: { onNext: () => void }) {
  const { project, settings, patchStoryInput, setStory, addReference, removeReference } = useApp();
  const si = project.storyInput;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  const hasKey = settings.activeProvider === 'local' || settings.activeProvider === 'puter' || Boolean(settings.keys[settings.activeProvider]);

  async function handleFiles(files: FileList | null) {
    if (!files) return;
    for (const f of Array.from(files).slice(0, 4)) {
      const isImg = f.type.startsWith('image/');
      const dataUrl = await fileToDataUrl(f);
      const ref: ReferenceMedia = {
        id: uid('ref'),
        name: f.name,
        mime: f.type,
        kind: isImg ? 'image' : 'video',
        dataUrl,
      };
      addReference(ref);
    }
  }

  async function run() {
    setError('');
    if (!hasKey) {
      setError('ยังไม่ได้ใส่ API key — ไปที่หน้า "ตั้งค่า" ก่อน');
      return;
    }
    setLoading(true);
    try {
      const images = project.references.filter((r) => r.kind === 'image').map((r) => r.dataUrl);
      const result = await generateStory(settings, si, images);
      setStory(result);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  const story = project.story;

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ---------- ฟอร์ม ---------- */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-primary-soft text-primary text-sm font-bold">1</span>
          <h2 className="font-heading text-lg font-bold">เนื้อเรื่องชาวนา</h2>
        </div>

        <div className="space-y-4">
          <Field label="ชื่อช่อง/แบรนด์">
            <Input value={si.brandName} onChange={(e) => patchStoryInput({ brandName: e.target.value })} placeholder="ธัญกิจ ปุ๋ยภัณฑ์" />
          </Field>

          <Field label="โครงเรื่องคร่าวๆ ของคุณ *" hint="เล่าสั้นๆ ว่าชาวนาเจอปัญหาอะไร แล้วอยากให้จบยังไง">
            <Textarea
              value={si.idea}
              onChange={(e) => patchStoryInput({ idea: e.target.value })}
              placeholder="เช่น ชาวนาปลูกข้าวใบเหลือง ใส่ปุ๋ยเท่าไหร่ก็ไม่ขึ้น ผลผลิตตก จนมาเจอวิธีบำรุงดินที่ถูก เลยกลับมาเขียวและได้ผลผลิตเพิ่ม"
              className="min-h-[140px]"
            />
          </Field>

          <Field label="แนบรูป/วิดีโอตัวอย่าง (ให้ AI ทำงานตรงที่สุด)" hint="รูปจะถูกส่งให้ AI ดู (สูงสุด 4 รูป) · วิดีโอใช้เป็นไฟล์อ้างอิง">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="flex w-full flex-col items-center gap-2 rounded-lg border border-dashed border-border-strong bg-surface-muted/40 py-6 text-text-muted transition-colors hover:border-primary hover:bg-primary-soft/30"
            >
              <ImagePlus className="h-7 w-7" />
              <span className="text-sm">คลิกเพื่อเลือกรูป/วิดีโอ</span>
            </button>
            <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={(e) => handleFiles(e.target.files)} />
          </Field>

          {project.references.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {project.references.map((r) => (
                <div key={r.id} className="relative h-16 w-16 overflow-hidden rounded-md border border-border">
                  {r.kind === 'image' ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.dataUrl} alt={r.name} className="h-full w-full object-cover" />
                  ) : (
                    <div className="grid h-full w-full place-items-center bg-surface-muted text-[10px] text-text-muted">วิดีโอ</div>
                  )}
                  <button
                    onClick={() => removeReference(r.id)}
                    className="absolute right-0.5 top-0.5 grid h-5 w-5 place-items-center rounded-full bg-overlay text-white"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label="โทน">
              <Select value={si.tone} onChange={(e) => patchStoryInput({ tone: e.target.value })}>
                <option>จริงใจ เนิบ บ้านๆ</option>
                <option>สู้ชีวิต ปลุกใจ</option>
                <option>สารภาพ อบอุ่น</option>
                <option>สนุก กันเอง</option>
              </Select>
            </Field>
            <Field label="โครงเล่าเรื่อง">
              <Select value={String(si.frameOverride)} onChange={(e) => patchStoryInput({ frameOverride: e.target.value === 'auto' ? 'auto' : Number(e.target.value) })}>
                {FRAMES.map((f) => (
                  <option key={f.v} value={f.v}>
                    {f.t}
                  </option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label={`ความยาวคลิป: ${si.durationSec} วินาที`}>
            <input
              type="range"
              min={20}
              max={90}
              step={5}
              value={si.durationSec}
              onChange={(e) => patchStoryInput({ durationSec: Number(e.target.value) })}
              className="w-full accent-[var(--primary)]"
            />
          </Field>

          <Field label="สินค้าที่จะขายในคลิปนี้ (เว้นจุดพลิกไว้)" hint="ไม่ต้องลงรายละเอียดมาก แค่บอกว่าจะขายอะไร">
            <Textarea value={si.notes} onChange={(e) => patchStoryInput({ notes: e.target.value })} placeholder="เช่น ปุ๋ยปรับสภาพดินของธัญกิจ" className="min-h-[70px]" />
          </Field>

          {error && <Alert tone="danger">{error}</Alert>}

          <Button variant="ai" size="lg" className="w-full" loading={loading} onClick={run}>
            <Sparkles className="h-5 w-5" />
            {story ? 'สร้างเนื้อเรื่องใหม่' : 'ให้ AI แต่งเนื้อเรื่อง'}
          </Button>
        </div>
      </Card>

      {/* ---------- ผลลัพธ์ ---------- */}
      <div className="space-y-4">
        {!story && (
          <Card className="grid h-full min-h-[300px] place-items-center p-8 text-center">
            <div className="text-text-muted">
              <Lightbulb className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p>กรอกโครงเรื่องแล้วกด “ให้ AI แต่งเนื้อเรื่อง”</p>
              <p className="mt-1 text-sm">ผลลัพธ์เนื้อเรื่องตามสูตร 5 จังหวะจะมาแสดงตรงนี้</p>
            </div>
          </Card>
        )}

        {story && (
          <>
            <Card className="p-6 animate-fade-up">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <Badge tone="primary">โครง: {story.chosenFrame.name}</Badge>
                <Badge tone="muted">~{story.suggestedDurationSec} วิ</Badge>
                <CopyButton text={story.fullStory} label="คัดลอกเรื่อง" className="ml-auto" />
              </div>
              <p className="mb-1 text-sm font-medium text-text-secondary">{story.logline}</p>
              <p className="rounded-md bg-primary-soft/50 p-3 text-sm italic text-text-primary">“{story.hook}”</p>
              <p className="mt-4 whitespace-pre-wrap text-[15px] leading-relaxed text-text-primary">{story.fullStory}</p>
            </Card>

            <Card className="p-6">
              <h3 className="mb-3 font-heading font-bold">5 จังหวะ</h3>
              <div className="space-y-2 text-sm">
                {[
                  ['1 · ปัญหา', story.beats.problem],
                  ['2 · จุดเจ็บ', story.beats.pain],
                  ['3 · ลองแล้วพัง', story.beats.failedAttempts],
                  ['4 · จุดพลิก', story.beats.turningPoint],
                  ['5 · ผลลัพธ์', story.beats.result],
                ].map(([k, v]) => (
                  <div key={k} className="flex gap-3">
                    <span className="w-28 shrink-0 font-medium text-primary">{k}</span>
                    <span className="text-text-secondary">{v}</span>
                  </div>
                ))}
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="mb-2 font-heading font-bold">ตัวละครหลัก: {story.characterProfile.name}</h3>
              <p className="text-sm text-text-secondary">
                {story.characterProfile.ageRange} · {story.characterProfile.appearance} · {story.characterProfile.outfit}
              </p>
              <p className="mt-1 text-sm text-text-muted">ฉาก: {story.characterProfile.setting} · เสียง: {story.characterProfile.voiceTone}</p>
            </Card>

            <div className="flex gap-3">
              <Button variant="outline" onClick={run} loading={loading}>
                <RefreshCw className="h-4 w-4" /> ลองใหม่
              </Button>
              <Button variant="primary" className="flex-1" onClick={onNext}>
                ถัดไป: เขียนบทขาย <ArrowRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
