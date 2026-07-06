'use client';

import { useState } from 'react';
import { Clapperboard, Sparkles, ArrowLeft, ArrowRight, UserSquare2, Download, Copy, Film, Wand2, Info, ExternalLink, Repeat } from 'lucide-react';
import { useApp } from '@/lib/store';
import { generateStoryboard, generateCharacter, FLOW_URL, type CharacterPackage } from '@/lib/api';
import { downloadCapcutPackage } from '@/lib/export/package';
import { bulkVeoPrompts } from '@/lib/export/bulk';
import { Card, Field, Input, Select, Button, Badge, Alert, CopyButton, Spinner } from '@/components/ui';
import { SceneCard } from './SceneCard';

export function StepStoryboard({ onBack, onNext }: { onBack: () => void; onNext: () => void }) {
  const { project, settings, patchStoryboardInput, setStoryboard } = useApp();
  const sbi = project.storyboardInput;
  const sb = project.storyboard;

  const [loading, setLoading] = useState(false);
  const [charLoading, setCharLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [charPkg, setCharPkg] = useState<CharacterPackage | null>(null);
  const [error, setError] = useState('');

  async function makeStoryboard() {
    setError('');
    if (!project.story) {
      setError('ยังไม่มีเนื้อเรื่อง — กลับไปขั้นที่ 1');
      return;
    }
    setLoading(true);
    setCharPkg(null);
    try {
      const result = await generateStoryboard(settings, sbi);
      setStoryboard(result);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setLoading(false);
    }
  }

  async function makeCharacter() {
    if (!sb) return;
    setError('');
    setCharLoading(true);
    try {
      const pkg = await generateCharacter(settings, sb);
      setCharPkg(pkg);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setCharLoading(false);
    }
  }

  async function doExport() {
    setExporting(true);
    try {
      await downloadCapcutPackage(project);
    } catch (e: any) {
      setError(String(e?.message ?? e));
    } finally {
      setExporting(false);
    }
  }

  const allVeo = sb ? sb.scenes.map((s, i) => `# ช็อต ${i + 1} [${s.beat}]\n${s.veoPrompt}`).join('\n\n') : '';
  const allVoice = sb ? sb.scenes.map((s, i) => `[ช็อต ${i + 1}] ${s.voiceoverTH}`).join('\n\n') : '';

  return (
    <div className="space-y-6">
      {/* ควบคุมการสร้าง */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <span className="grid h-8 w-8 place-items-center rounded-md bg-ai-soft text-ai text-sm font-bold">3</span>
          <h2 className="font-heading text-lg font-bold">Storyboard + ตัวละครพูด</h2>
        </div>
        <div className="space-y-4">
          <Field label="สไตล์ภาพ">
            <Input value={sbi.visualStyle} onChange={(e) => patchStoryboardInput({ visualStyle: e.target.value })} placeholder="ฟิล์มอุ่น แสงเช้า เรียลสมจริง" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="อัตราส่วนภาพ">
              <Select value={sbi.aspectRatio} onChange={(e) => patchStoryboardInput({ aspectRatio: e.target.value as any })}>
                <option value="9:16">9:16 แนวตั้ง (TikTok/Reels)</option>
                <option value="16:9">16:9 แนวนอน (YouTube)</option>
                <option value="1:1">1:1 จัตุรัส</option>
              </Select>
            </Field>
            <Field label="ความยาวต่อช็อต (Flow)">
              <Select value={String(sbi.secondsPerScene)} onChange={(e) => patchStoryboardInput({ secondsPerScene: Number(e.target.value) })}>
                <option value="8">8 วินาที/ช็อต</option>
                <option value="10">10 วินาที/ช็อต (Omni Flash)</option>
                <option value="12">12 วินาที/ช็อต</option>
              </Select>
            </Field>
            <Field label="แหล่งเสียง">
              <Select value={sbi.audioSource} onChange={(e) => patchStoryboardInput({ audioSource: e.target.value as any })}>
                <option value="flow">วิดีโอ+เสียงพูด ใน prompt เดียว (Flow)</option>
                <option value="tts">วิดีโอเงียบ พากย์เองด้วย Botnoi</option>
              </Select>
            </Field>
          </div>
          <Field label={`ความยาวคลิปรวม: ~${sbi.targetDurationSec} วิ (≈ ${Math.max(1, Math.round(sbi.targetDurationSec / sbi.secondsPerScene))} ช็อต)`}>
            <input
              type="range"
              min={20}
              max={90}
              step={10}
              value={sbi.targetDurationSec}
              onChange={(e) => patchStoryboardInput({ targetDurationSec: Number(e.target.value) })}
              className="mt-1 w-full accent-[var(--ai)]"
            />
          </Field>
        </div>
        {error && (
          <div className="mt-4">
            <Alert tone="danger">{error}</Alert>
          </div>
        )}
        <div className="mt-4 flex flex-wrap gap-3">
          <Button variant="ai" size="lg" loading={loading} onClick={makeStoryboard}>
            <Sparkles className="h-5 w-5" /> {sb ? 'สร้าง Storyboard ใหม่' : 'สร้าง Storyboard'}
          </Button>
          <Button variant="outline" onClick={onBack}>
            <ArrowLeft className="h-4 w-4" /> กลับ
          </Button>
        </div>
      </Card>

      {loading && (
        <Card className="grid place-items-center gap-3 p-12 text-text-muted">
          <Spinner className="h-8 w-8" />
          <p>AI กำลังแตกเนื้อเรื่องเป็นช็อต + เขียน prompt วิดีโอ… (อาจใช้เวลาสักครู่)</p>
        </Card>
      )}

      {/* ผลลัพธ์ storyboard */}
      {sb && !loading && (
        <>
          <Card className="p-6">
            <div className="flex flex-wrap items-center gap-3">
              <Clapperboard className="h-6 w-6 text-ai" />
              <div className="flex-1">
                <h3 className="font-heading text-lg font-bold">{sb.videoTitle}</h3>
                <p className="text-sm text-text-muted">
                  {sb.aspectRatio} · {sb.totalDurationSec} วิ · {sb.scenes.length} ช็อต · ตัวละคร {sb.characterBible.name}
                </p>
              </div>
              {sb.captionsSrtReady && <Badge tone="success">พร้อม export ซับ</Badge>}
            </div>
            {sb.reasoning && (
              <p className="mt-3 flex items-start gap-2 rounded-md bg-bg-subtle p-3 text-sm text-text-secondary">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-text-muted" />
                {sb.reasoning}
              </p>
            )}
          </Card>

          {/* เชื่อมต่อ Google Flow */}
          <Card className="border-accent/30 p-6">
            <div className="mb-2 flex items-center gap-2">
              <ExternalLink className="h-5 w-5 text-accent" />
              <h3 className="font-heading text-lg font-bold">เปิดสร้างวิดีโอใน Google Flow</h3>
            </div>
            <p className="mb-3 text-sm text-text-secondary">
              Google Flow ไม่มีปุ่มเชื่อมอัตโนมัติ (ไม่มี API สาธารณะ) — วิธีที่ลื่นสุดคือกด <b>“เปิด Flow”</b> ที่การ์ดแต่ละช็อตด้านล่าง
              (ระบบจะ<b>คัดลอก prompt + เปิด Flow</b>ให้) แล้ววางในช่องสร้าง โดยตั้งค่าหน้านั้นให้ตรงตามนี้:
            </p>
            <div className="mb-4 flex flex-wrap gap-2">
              <Badge tone="accent">Video</Badge>
              <Badge tone="accent">Omni Flash</Badge>
              <Badge tone="accent">{sb.aspectRatio}</Badge>
              <Badge tone="accent">{sbi.secondsPerScene}s</Badge>
              <Badge tone="accent">1x</Badge>
            </div>
            <ol className="mb-4 list-decimal space-y-1 pl-5 text-sm text-text-secondary">
              <li>กด “เปิด Flow” ที่ช็อตแรก (prompt ถูกคัดลอกอัตโนมัติแล้ว)</li>
              <li>ในหน้า Flow เลือก <b>Video · Omni Flash · {sb.aspectRatio} · {sbi.secondsPerScene}s · 1x</b> แล้ววาง prompt → Generate</li>
              <li>ทำซ้ำทีละช็อต (1 prompt = 1 คลิป ~15 credits)</li>
              <li>โหลดคลิปครบทุกช็อต แล้วมากด “ดาวน์โหลด .zip” เอาไปต่อใน CapCut</li>
            </ol>
            <a
              href={FLOW_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex h-11 items-center gap-2 rounded-md bg-accent px-5 font-semibold text-accent-on hover:opacity-90"
            >
              เปิด Google Flow <ExternalLink className="h-4 w-4" />
            </a>

            {/* ทำหลายช็อตอัตโนมัติ โดยไม่ใช้ API */}
            <div className="mt-5 rounded-md border border-border bg-surface-muted/40 p-4">
              <p className="mb-1 flex items-center gap-1.5 text-sm font-semibold text-text-primary">
                <Repeat className="h-4 w-4 text-ai" /> ทำหลายช็อตอัตโนมัติ (ไม่ใช้ API)
              </p>
              <p className="mb-3 text-xs leading-relaxed text-text-secondary">
                ติดตั้ง Chrome extension ตระกูล <b>“Flow Automator / Auto Flow / Veo Automation”</b> (ค้นใน Chrome Web Store) →
                กดปุ่มนี้คัดลอกลิสต์ prompt ทุกช็อต (บล็อกละช็อต) → วางในเอ็กซ์เทนชัน → มันจะป้อนเข้า Flow + กด Generate + โหลดวิดีโอให้เองทีละช็อต
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <CopyButton text={bulkVeoPrompts(sb)} label={`คัดลอก Bulk Prompts (${sb.scenes.length} ช็อต)`} />
                <a
                  href="https://chromewebstore.google.com/search/google%20flow%20automation"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 rounded-sm border border-border px-2.5 py-1.5 text-xs font-medium text-accent hover:bg-surface-muted"
                >
                  หาเอ็กซ์เทนชัน <ExternalLink className="h-3 w-3" />
                </a>
              </div>
              <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
                ⚠️ เอ็กซ์เทนชันเหล่านี้เป็นของบุคคลที่สาม เข้าถึงบัญชี Flow ของคุณ ควรดูสิทธิ์/รีวิวก่อนติดตั้ง · ถ้าไม่อยากลงของคนอื่น ใช้สคริปต์ของเราเอง
                <b> tools/flow-queue.user.js</b> (โปร่งใส อ่านโค้ดได้) ดูวิธีในไฟล์ <b>tools/README-flow-automation.md</b>
              </p>
            </div>
          </Card>

          <div className="space-y-3">
            {sb.scenes.map((scene, i) => (
              <SceneCard key={scene.id} scene={scene} index={i} />
            ))}
          </div>

          {/* ขั้นสร้างตัวละครพูด (ข้อ 1) */}
          <Card className="border-ai/30 p-6">
            <div className="mb-2 flex items-center gap-2">
              <UserSquare2 className="h-5 w-5 text-ai" />
              <h3 className="font-heading text-lg font-bold">ตัวละคร AI ยืนพูดตามสคริปต์</h3>
            </div>
            <p className="mb-4 text-sm text-text-secondary">
              ด้านบนคือ <b>storyboard (พรีวิว)</b> แล้ว — กดปุ่มนี้เพื่อให้เอเจนต์ <b>สร้างชุด prompt ตัวละครพูดพร้อมผลิตจริง</b> (ล็อกหน้าตาตัวละครให้เหมือนกันทุกช็อต) เอาไปวางใน Google Flow ได้เลย
            </p>
            <Button variant="ai" size="lg" loading={charLoading} onClick={makeCharacter}>
              <Wand2 className="h-5 w-5" /> สร้างตัวละครพูด (สั่งเลย)
            </Button>

            {charPkg && (
              <div className="mt-5 space-y-3 animate-fade-up">
                <Alert tone="info">{charPkg.avatarNote}</Alert>
                <p className="text-sm text-text-muted">
                  ล็อกตัวละคร: <b className="text-text-secondary">{charPkg.characterBible.name}</b> — {charPkg.characterBible.appearance}
                </p>
                {charPkg.shots.map((shot) => (
                  <div key={shot.sceneId} className="rounded-md border border-border p-3">
                    <div className="mb-1.5 flex items-center justify-between">
                      <span className="text-xs font-medium text-text-secondary">
                        ช็อต {shot.index} · {shot.beat} {shot.isTalking ? '· 🗣️ พูด' : '· 🎬 ภาพ'}
                      </span>
                      <CopyButton text={shot.isTalking ? shot.finalCharacterPrompt : shot.finalVeoPrompt} label="คัดลอก prompt" />
                    </div>
                    <p className="font-mono text-[11px] leading-relaxed text-text-muted">
                      {shot.isTalking ? shot.finalCharacterPrompt : shot.finalVeoPrompt}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </Card>

          {/* Export */}
          <Card className="grad-hero relative overflow-hidden p-6 text-white">
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_20%_20%,rgba(255,255,255,.2),transparent_60%)]" />
            <div className="relative flex flex-wrap items-center gap-4">
              <Download className="h-8 w-8" />
              <div className="flex-1">
                <h3 className="font-heading text-lg font-bold">ส่งออกชุดไฟล์สำหรับ CapCut</h3>
                <p className="text-sm text-white/90">ซับ .srt + prompt Flow ทุกช็อต + บทพากย์ + เสียง (ถ้าสร้างไว้) + คู่มือ import</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => navigator.clipboard.writeText(allVeo)}
                  className="inline-flex h-11 items-center gap-2 rounded-md bg-white/15 px-4 font-semibold text-white backdrop-blur hover:bg-white/25"
                >
                  <Copy className="h-4 w-4" /> คัดลอก prompt Flow ทั้งหมด
                </button>
                <button
                  onClick={() => navigator.clipboard.writeText(allVoice)}
                  className="inline-flex h-11 items-center gap-2 rounded-md bg-white/15 px-4 font-semibold text-white backdrop-blur hover:bg-white/25"
                  title="คัดลอกบทพากย์ทุกช็อต เอาไปวางใน Botnoi Voice"
                >
                  <Copy className="h-4 w-4" /> คัดลอกบทพากย์ (Botnoi)
                </button>
                <button
                  onClick={doExport}
                  disabled={exporting}
                  className="inline-flex h-11 items-center gap-2 rounded-md bg-white px-5 font-semibold text-primary shadow-lg hover:-translate-y-0.5 transition-transform disabled:opacity-60"
                >
                  <Film className="h-4 w-4" /> {exporting ? 'กำลังสร้างไฟล์…' : 'ดาวน์โหลด .zip'}
                </button>
              </div>
            </div>
          </Card>

          <div className="flex justify-end">
            <Button variant="primary" onClick={onNext}>
              ถัดไป: ทำแคปชันโพสต์ <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
