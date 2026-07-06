'use client';

import { useState } from 'react';
import { Megaphone, Sparkles, ArrowLeft, Clock, Hash, Check } from 'lucide-react';
import { useApp } from '@/lib/store';
import { generateSocial } from '@/lib/api';
import { PLATFORMS, PLATFORM_ORDER, CAMPAIGNS, TONES, bestTimeLabel } from '@/lib/platforms';
import type { PlatformId } from '@/lib/types';
import { Card, Field, Input, Select, Button, Badge, Alert, CopyButton } from '@/components/ui';
import { cn } from '@/lib/utils';

export function StepSocial({ onBack }: { onBack: () => void }) {
  const { project, settings, patchSocialInput, setSocialPosts } = useApp();
  const si = project.socialInput;
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const brandName = project.storyInput.brandName || settings.brandName;
  const videoTitle = project.storyboard?.videoTitle || project.story?.logline || 'คลิปขายปุ๋ย';
  const logline = project.story?.logline || project.storyboardInput.fullStory?.slice(0, 200) || '';
  const productInfo =
    project.storyboardInput.productInfo ||
    project.productScripts.map((p) => `${p.productName}: ${p.keyBenefitsSpoken.join(', ')}`).join('\n');

  function togglePlatform(p: PlatformId) {
    const has = si.platforms.includes(p);
    patchSocialInput({ platforms: has ? si.platforms.filter((x) => x !== p) : [...si.platforms, p] });
  }

  async function run() {
    setError('');
    if (!si.platforms.length) {
      setError('เลือกอย่างน้อย 1 แพลตฟอร์ม');
      return;
    }
    if (settings.activeProvider !== 'local' && settings.activeProvider !== 'puter' && !settings.keys[settings.activeProvider]) {
      setError('ยังไม่ได้ใส่ API key — ไปที่หน้า "ตั้งค่า" ก่อน');
      return;
    }
    setLoading(true);
    try {
      const posts = await generateSocial(settings, si, { brandName, videoTitle, logline, productInfo });
      setSocialPosts(posts);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-secondary-soft text-secondary text-sm font-bold">4</span>
          <h2 className="font-heading text-lg font-bold">แคปชัน + โพสต์ทุกแพลตฟอร์ม</h2>
        </div>

        {/* เลือกแพลตฟอร์ม */}
        <p className="mb-2 text-sm font-medium text-text-secondary">เลือกแพลตฟอร์ม</p>
        <div className="mb-4 flex flex-wrap gap-2">
          {PLATFORM_ORDER.map((p) => {
            const meta = PLATFORMS[p];
            const active = si.platforms.includes(p);
            return (
              <button
                key={p}
                onClick={() => togglePlatform(p)}
                className={cn(
                  'inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all',
                  active ? 'border-primary bg-primary-soft text-primary' : 'border-border text-text-secondary hover:bg-surface-muted',
                )}
              >
                <span>{meta.icon}</span>
                {meta.name}
                {active && <Check className="h-3.5 w-3.5" />}
              </button>
            );
          })}
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="เป้าหมายแคมเปญ">
            <Select value={si.campaign} onChange={(e) => patchSocialInput({ campaign: e.target.value })}>
              {Object.entries(CAMPAIGNS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="โทน">
            <Select value={si.tone} onChange={(e) => patchSocialInput({ tone: e.target.value })}>
              {Object.entries(TONES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="ลิงก์/ช่องทางสั่งซื้อ">
            <Input value={si.link} onChange={(e) => patchSocialInput({ link: e.target.value })} placeholder="เช่น line @thanyakij หรือ ลิงก์ในโปรไฟล์" />
          </Field>
          <Field label="โปร/ราคา (ถ้ามี)">
            <Input value={si.promo} onChange={(e) => patchSocialInput({ promo: e.target.value })} placeholder="เช่น ส่งฟรีตั้งแต่ 5 กระสอบ" />
          </Field>
        </div>

        {error && (
          <div className="mt-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}

        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="ai" size="lg" loading={loading} onClick={run}>
            <Sparkles className="h-5 w-5" /> {project.socialPosts.length ? 'สร้างแคปชันใหม่' : 'สร้างแคปชันทุกแพลตฟอร์ม'}
          </Button>
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> กลับ
          </Button>
        </div>
      </Card>

      {project.socialPosts.length === 0 && !loading && (
        <Card className="grid min-h-[200px] place-items-center p-8 text-center text-text-muted">
          <div>
            <Megaphone className="mx-auto mb-3 h-10 w-10 opacity-40" />
            <p>เลือกแพลตฟอร์มแล้วกด “สร้างแคปชัน”</p>
            <p className="mt-1 text-sm">จะได้แคปชัน + แฮชแท็ก + เวลาโพสต์ที่ดีที่สุด แยกตามแพลตฟอร์ม</p>
          </div>
        </Card>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        {project.socialPosts.map((post) => {
          const meta = PLATFORMS[post.platform];
          if (!meta) return null;
          const fullText = `${post.caption}\n\n${post.hashtags.join(' ')}${post.cta ? '\n' + post.cta : ''}`.trim();
          return (
            <Card key={post.platform} className="p-5 animate-fade-up">
              <div className="mb-3 flex items-center justify-between">
                <span className="flex items-center gap-2 font-heading font-bold" style={{ color: meta.color }}>
                  <span className="text-lg">{meta.icon}</span> {meta.name}
                </span>
                <CopyButton text={fullText} label="คัดลอกโพสต์" />
              </div>

              <div className="mb-2 flex flex-wrap items-center gap-2 text-xs text-text-muted">
                <Badge tone="muted">{post.formatNote || meta.formats[0]}</Badge>
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" /> {bestTimeLabel(meta.bestHours)}
                </span>
              </div>

              {post.hook && <p className="mb-2 rounded-md bg-secondary-soft/50 p-2 text-sm font-medium text-text-primary">{post.hook}</p>}
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-text-secondary">{post.caption}</p>

              {post.hashtags?.length > 0 && (
                <p className="mt-2 flex items-start gap-1 text-xs text-accent">
                  <Hash className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>{post.hashtags.join(' ')}</span>
                </p>
              )}
              {post.cta && <p className="mt-2 text-sm font-medium text-primary">{post.cta}</p>}
            </Card>
          );
        })}
      </div>
    </div>
  );
}
