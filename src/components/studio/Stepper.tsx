'use client';

import { Check } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = ['เนื้อเรื่อง', 'บทขาย', 'Storyboard', 'โพสต์'];

export function Stepper({
  current,
  done,
  onJump,
}: {
  current: number;
  done: boolean[];
  onJump: (i: number) => void;
}) {
  return (
    <div className="flex items-center justify-center gap-1 sm:gap-2">
      {STEPS.map((label, i) => {
        const active = i === current;
        const isDone = done[i];
        return (
          <div key={label} className="flex items-center">
            <button
              onClick={() => onJump(i)}
              className={cn(
                'flex items-center gap-2 rounded-full px-3 py-2 text-sm font-medium transition-colors',
                active ? 'bg-primary text-primary-on shadow-sm' : isDone ? 'text-primary hover:bg-primary-soft' : 'text-text-muted hover:bg-surface-muted',
              )}
            >
              <span
                className={cn(
                  'grid h-6 w-6 place-items-center rounded-full text-xs font-bold',
                  active ? 'bg-white/25' : isDone ? 'bg-primary text-primary-on' : 'border border-border-strong',
                )}
              >
                {isDone && !active ? <Check className="h-3.5 w-3.5" /> : i + 1}
              </span>
              <span className="hidden sm:inline">{label}</span>
            </button>
            {i < STEPS.length - 1 && <div className={cn('h-0.5 w-4 sm:w-10', done[i] ? 'bg-primary' : 'bg-border')} />}
          </div>
        );
      })}
    </div>
  );
}
