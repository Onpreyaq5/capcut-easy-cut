'use client';

import { useState } from 'react';
import { Megaphone, Plus, Trash2, ArrowRight, ArrowLeft, AlertTriangle } from 'lucide-react';
import { useApp, emptyProduct } from '@/lib/store';
import { generateProduct } from '@/lib/api';
import { Card, Field, Input, Textarea, Select, Button, Badge, Alert, CopyButton } from '@/components/ui';
import type { ProductInput } from '@/lib/types';

export function StepProduct({ onNext, onBack }: { onNext: () => void; onBack: () => void }) {
  const { project, settings, addProductScript, removeProductScript } = useApp();
  const [draft, setDraft] = useState<ProductInput>(emptyProduct());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const story = project.story;
  const set = (patch: Partial<ProductInput>) => setDraft((d) => ({ ...d, ...patch }));

  async function run() {
    setError('');
    if (!story) {
      setError('ยังไม่มีเนื้อเรื่อง — กลับไปขั้นที่ 1 ก่อน');
      return;
    }
    if (!draft.productName.trim()) {
      setError('กรุณาใส่ชื่อสินค้า');
      return;
    }
    setLoading(true);
    try {
      const result = await generateProduct(settings, story, draft);
      addProductScript(result);
      setDraft(emptyProduct());
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* ฟอร์มสินค้า */}
      <div className="space-y-4">
        {story && (
          <Card className="border-primary/30 bg-primary-soft/30 p-4">
            <p className="text-xs font-medium text-primary">อิงเนื้อเรื่อง:</p>
            <p className="mt-1 line-clamp-3 text-sm text-text-secondary">{story.logline}</p>
            <p className="mt-1 text-xs text-text-muted">ตัวละคร: {story.characterProfile.name} · โครง: {story.chosenFrame.name}</p>
          </Card>
        )}

        <Card className="p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-md bg-secondary-soft text-secondary text-sm font-bold">2</span>
            <h2 className="font-heading text-lg font-bold">ข้อมูลสินค้าปุ๋ย</h2>
          </div>
          <div className="space-y-4">
            <Field label="ชื่อสินค้า *">
              <Input value={draft.productName} onChange={(e) => set({ productName: e.target.value })} placeholder="เช่น ธัญกิจ ราก-เขียว 25-7-7" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="สูตร/ส่วนผสม">
                <Input value={draft.formula} onChange={(e) => set({ formula: e.target.value })} placeholder="25-7-7 + ธาตุรอง" />
              </Field>
              <Field label="ราคา/โปรโมชัน">
                <Input value={draft.pricePromo} onChange={(e) => set({ pricePromo: e.target.value })} placeholder="850 บ./กระสอบ ส่งฟรี 5+" />
              </Field>
            </div>
            <Field label="จุดเด่น">
              <Textarea value={draft.keyFeatures} onChange={(e) => set({ keyFeatures: e.target.value })} placeholder="ช่วยรากเดินเร็ว ใบเขียวไว" className="min-h-[70px]" />
            </Field>
            <Field label="ปัญหาที่แก้ได้">
              <Textarea value={draft.problemsSolved} onChange={(e) => set({ problemsSolved: e.target.value })} placeholder="ใบเหลือง รากตื้น ต้นไม่ดูดปุ๋ย" className="min-h-[70px]" />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="วิธีใช้/อัตราใช้">
                <Input value={draft.howToUse} onChange={(e) => set({ howToUse: e.target.value })} placeholder="หว่าน 20 กก./ไร่ 2 รอบ" />
              </Field>
              <Field label="ความยาวบท">
                <Select value={draft.length} onChange={(e) => set({ length: e.target.value as any })}>
                  <option value="short">สั้น ~30 วิ</option>
                  <option value="medium">ปานกลาง ~45 วิ</option>
                  <option value="long">ยาว ~60 วิ</option>
                </Select>
              </Field>
            </div>
            <Field label="หลักฐาน/รีวิว (ถ้ามี)" hint="ถ้าไม่มีตัวเลขรับรอง เว้นได้ — ระบบจะไม่แต่งตัวเลขให้">
              <Textarea value={draft.proofReviews} onChange={(e) => set({ proofReviews: e.target.value })} placeholder="รีวิวลูกค้าเก่าในเพจ" className="min-h-[60px]" />
            </Field>

            {error && <Alert tone="danger">{error}</Alert>}

            <Button variant="ai" size="lg" className="w-full" loading={loading} onClick={run}>
              <Plus className="h-5 w-5" /> เขียนบทขาย & เพิ่มลงคลิป
            </Button>
          </div>
        </Card>
      </div>

      {/* รายการบทขาย */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading font-bold">บทขายในคลิปนี้</h3>
          <Badge tone="secondary">{project.productScripts.length} ชิ้น</Badge>
        </div>

        {project.productScripts.length === 0 && (
          <Card className="grid min-h-[200px] place-items-center p-8 text-center text-text-muted">
            <div>
              <Megaphone className="mx-auto mb-3 h-10 w-10 opacity-40" />
              <p>ยังไม่มีบทขาย — กรอกข้อมูลสินค้าทางซ้ายแล้วกดเพิ่ม</p>
              <p className="mt-1 text-sm">เพิ่มได้หลายตัว (1 ปุ๋ย = 1 บท)</p>
            </div>
          </Card>
        )}

        {project.productScripts.map((ps, i) => (
          <Card key={i} className="p-5 animate-fade-up">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="font-heading font-bold text-text-primary">{ps.productName}</span>
              <div className="flex items-center gap-2">
                <CopyButton text={ps.salesScript} />
                <button onClick={() => removeProductScript(i)} className="text-text-muted hover:text-danger">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
            {ps.complianceFlags.length > 0 && (
              <div className="mb-2 flex items-start gap-1.5 rounded-md bg-secondary-soft px-3 py-2 text-xs text-warning">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <span>{ps.complianceFlags.join(' · ')}</span>
              </div>
            )}
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{ps.salesScript}</p>
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-xs text-text-muted">
                <span className="font-medium text-text-secondary">เสียบที่:</span> {ps.integrationPoint.beat} — “{ps.integrationPoint.anchorInStory}”
              </p>
              <p className="mt-1 text-xs text-text-muted">
                <span className="font-medium text-text-secondary">CTA:</span> {ps.cta.spokenLine}
              </p>
            </div>
          </Card>
        ))}

        <div className="flex gap-3 pt-2">
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> กลับ
          </Button>
          <Button variant="primary" className="flex-1" onClick={onNext} disabled={project.productScripts.length === 0}>
            ถัดไป: ทำ Storyboard <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        {project.productScripts.length === 0 && (
          <p className="text-center text-xs text-text-muted">เพิ่มบทขายอย่างน้อย 1 ชิ้นก่อนไปต่อ (หรือข้ามได้ถ้าจะขายเฉพาะเล่าเรื่อง)</p>
        )}
      </div>
    </div>
  );
}
