'use client';

import { useEffect, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useApp } from '@/lib/store';
import { Stepper } from '@/components/studio/Stepper';
import { StepStory } from '@/components/studio/StepStory';
import { StepProduct } from '@/components/studio/StepProduct';
import { StepStoryboard } from '@/components/studio/StepStoryboard';
import { StepSocial } from '@/components/studio/StepSocial';
import { Button } from '@/components/ui';

export default function StudioPage() {
  const [mounted, setMounted] = useState(false);
  const [step, setStep] = useState(0);
  useEffect(() => setMounted(true), []);

  const project = useApp((s) => s.project);
  const resetProject = useApp((s) => s.resetProject);

  if (!mounted) return <div className="container-page py-16 text-text-muted">กำลังโหลดสตูดิโอ…</div>;

  const done = [
    Boolean(project.story),
    project.productScripts.length > 0,
    Boolean(project.storyboard),
    project.socialPosts.length > 0,
  ];

  return (
    <div className="container-page py-8">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">สตูดิโอทำคลิป</h1>
          <p className="text-sm text-text-muted">สร้างเรื่อง บทขาย Storyboard และ Prompt Pack (Beta) แล้วส่งออกไปทำวิดีโอ/CapCut</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            if (confirm('เริ่มคลิปใหม่? ข้อมูลปัจจุบันจะถูกล้าง')) {
              resetProject();
              setStep(0);
            }
          }}
        >
          <RotateCcw className="h-4 w-4" /> คลิปใหม่
        </Button>
      </div>

      <div className="mb-8">
        <Stepper current={step} done={done} onJump={setStep} />
      </div>

      {step === 0 && <StepStory onNext={() => setStep(1)} />}
      {step === 1 && <StepProduct onNext={() => setStep(2)} onBack={() => setStep(0)} />}
      {step === 2 && <StepStoryboard onBack={() => setStep(1)} onNext={() => setStep(3)} />}
      {step === 3 && <StepSocial onBack={() => setStep(2)} />}
    </div>
  );
}
