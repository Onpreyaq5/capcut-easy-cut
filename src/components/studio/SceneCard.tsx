'use client';

import { useState } from 'react';
import { Volume2, Film, UserSquare2, Clapperboard, ExternalLink } from 'lucide-react';
import { useApp } from '@/lib/store';
import { generateVoice, copyAndOpenFlow } from '@/lib/api';
import { Card, Badge, CopyButton, Button } from '@/components/ui';
import { secToSrtTime } from '@/lib/export/srt';
import type { Scene } from '@/lib/types';

const BEAT: Record<string, { label: string; tone: 'danger' | 'warning' | 'muted' | 'ai' | 'success' }> = {
  problem: { label: '1·ปัญหา', tone: 'danger' },
  pain: { label: '2·จุดเจ็บ', tone: 'warning' },
  failed_attempts: { label: '3·ลองแล้วพัง', tone: 'muted' },
  turning_point: { label: '4·จุดพลิก', tone: 'ai' },
  result: { label: '5·ผลลัพธ์', tone: 'success' },
};

export function SceneCard({ scene, index }: { scene: Scene; index: number }) {
  const { settings, project, setSceneAudio } = useApp();
  const [voicing, setVoicing] = useState(false);
  const [err, setErr] = useState('');
  const beat = BEAT[scene.beat] ?? { label: scene.beat, tone: 'muted' as const };
  const audio = project.audio?.[scene.id];

  async function makeVoice() {
    setErr('');
    setVoicing(true);
    try {
      const dataUrl = await generateVoice(settings, scene.voiceoverTH);
      if (dataUrl) setSceneAudio(scene.id, dataUrl);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    } finally {
      setVoicing(false);
    }
  }

  return (
    <Card className="overflow-hidden p-0">
      <div className="flex items-center justify-between border-b border-border bg-surface-muted/50 px-4 py-2.5">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-surface text-xs font-bold text-text-secondary">{index + 1}</span>
          <Badge tone={beat.tone}>{beat.label}</Badge>
          <span className="tabular text-xs text-text-muted">
            {secToSrtTime(scene.startSec).slice(3, 8)}–{secToSrtTime(scene.endSec).slice(3, 8)} · {scene.durationSec}s
          </span>
        </div>
      </div>

      <div className="space-y-3 p-4">
        <p className="text-sm text-text-secondary">
          <Clapperboard className="mr-1 inline h-3.5 w-3.5 text-text-muted" />
          {scene.shotDescription}
        </p>

        {scene.onScreenText && (
          <div className="rounded-md bg-bg-subtle px-3 py-2">
            <span className="text-[11px] font-medium text-text-muted">ซับบนจอ</span>
            <p className="text-sm font-medium text-text-primary">{scene.onScreenText}</p>
          </div>
        )}

        <div className="rounded-md bg-primary-soft/40 px-3 py-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-primary">บทพากย์</span>
            <button onClick={makeVoice} disabled={voicing} className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline disabled:opacity-50">
              <Volume2 className="h-3.5 w-3.5" /> {voicing ? 'กำลังสร้าง…' : settings.ttsProvider === 'browser' ? 'เล่นเสียง' : 'สร้างเสียง'}
            </button>
          </div>
          <p className="text-sm text-text-primary">{scene.voiceoverTH}</p>
          <p className="mt-0.5 text-[11px] text-text-muted">เสียง: {scene.ttsVoiceHint}</p>
          {audio && <audio controls src={audio} className="mt-2 h-8 w-full" />}
          {err && <p className="mt-1 text-[11px] text-danger">{err}</p>}
        </div>

        <div className="grid gap-2 sm:grid-cols-2">
          <div className="rounded-md border border-border p-2.5">
            <div className="mb-1 flex items-center justify-between">
              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-accent">
                <Film className="h-3.5 w-3.5" /> Prompt Flow/Veo
              </span>
              <div className="flex items-center gap-1.5">
                <CopyButton text={scene.veoPrompt} label="คัดลอก" />
                <button
                  onClick={() => copyAndOpenFlow(scene.veoPrompt)}
                  className="inline-flex items-center gap-1 rounded-sm bg-accent-soft px-2 py-1.5 text-xs font-medium text-accent hover:opacity-90"
                  title="คัดลอก prompt แล้วเปิด Google Flow"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> เปิด Flow
                </button>
              </div>
            </div>
            <p className="line-clamp-3 font-mono text-[11px] leading-relaxed text-text-muted">{scene.veoPrompt}</p>
          </div>
          {scene.characterSpeakingPrompt ? (
            <div className="rounded-md border border-border p-2.5">
              <div className="mb-1 flex items-center justify-between">
                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-ai">
                  <UserSquare2 className="h-3.5 w-3.5" /> Prompt ตัวละครพูด
                </span>
                <CopyButton text={scene.characterSpeakingPrompt} label="คัดลอก" />
              </div>
              <p className="line-clamp-3 font-mono text-[11px] leading-relaxed text-text-muted">{scene.characterSpeakingPrompt}</p>
            </div>
          ) : (
            <div className="grid place-items-center rounded-md border border-dashed border-border p-2.5 text-[11px] text-text-muted">ช็อตภาพ (ไม่มีคนพูด)</div>
          )}
        </div>
      </div>
    </Card>
  );
}
