'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';
import { Check, Copy, Loader2 } from 'lucide-react';

/* ---------------- Button ---------------- */
type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: 'primary' | 'secondary' | 'ghost' | 'ai' | 'outline' | 'danger';
  size?: 'sm' | 'md' | 'lg';
  loading?: boolean;
};
export function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...props }: ButtonProps) {
  const base =
    'inline-flex items-center justify-center gap-2 rounded-md font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-bg disabled:pointer-events-none disabled:opacity-45 select-none';
  const sizes = { sm: 'h-9 px-3 text-sm', md: 'h-11 px-5 text-[15px]', lg: 'h-12 px-7 text-base' };
  const variants = {
    primary: 'bg-primary text-primary-on shadow-sm hover:bg-primary-hover active:bg-primary-active hover:-translate-y-px',
    secondary: 'border border-secondary/20 bg-secondary-soft text-secondary hover:bg-secondary/10',
    ghost: 'bg-transparent text-text-secondary hover:bg-surface-muted',
    outline: 'border border-border-strong bg-surface text-text-secondary shadow-sm hover:bg-surface-muted',
    ai: 'grad-hero text-white shadow-glow-ai hover:-translate-y-px',
    danger: 'bg-danger text-white hover:opacity-90',
  };
  return (
    <button className={cn(base, sizes[size], variants[variant], className)} disabled={disabled || loading} {...props}>
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  );
}

/* ---------------- Card ---------------- */
export function Card({ className, hover, ...props }: React.HTMLAttributes<HTMLDivElement> & { hover?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-lg border border-border bg-surface shadow-md',
        hover && 'transition-all duration-200 hover:-translate-y-0.5 hover:border-border-strong hover:shadow-lg',
        className,
      )}
      {...props}
    />
  );
}

/* ---------------- Badge ---------------- */
export function Badge({
  className,
  tone = 'muted',
  ...props
}: React.HTMLAttributes<HTMLSpanElement> & { tone?: 'primary' | 'secondary' | 'ai' | 'accent' | 'success' | 'warning' | 'danger' | 'muted' }) {
  const tones = {
    primary: 'bg-primary-soft text-primary',
    secondary: 'bg-secondary-soft text-secondary',
    ai: 'bg-ai-soft text-ai',
    accent: 'bg-accent-soft text-accent',
    success: 'bg-primary-soft text-success',
    warning: 'bg-secondary-soft text-warning',
    danger: 'bg-danger/10 text-danger',
    muted: 'bg-surface-muted text-text-muted',
  };
  return <span className={cn('inline-flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-semibold', tones[tone], className)} {...props} />;
}

/* ---------------- Form fields ---------------- */
export function Label({ className, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) {
  return <label className={cn('block text-sm font-medium text-text-secondary mb-1.5', className)} {...props} />;
}

const fieldBase =
  'w-full rounded-md border border-border bg-surface px-3.5 py-2.5 text-[15px] text-text-primary shadow-sm placeholder:text-text-muted transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-ring';

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(fieldBase, className)} {...props} />;
  },
);

export const Textarea = React.forwardRef<HTMLTextAreaElement, React.TextareaHTMLAttributes<HTMLTextAreaElement>>(
  function Textarea({ className, ...props }, ref) {
    return <textarea ref={ref} className={cn(fieldBase, 'min-h-[120px] resize-y leading-relaxed', className)} {...props} />;
  },
);

export const Select = React.forwardRef<HTMLSelectElement, React.SelectHTMLAttributes<HTMLSelectElement>>(
  function Select({ className, children, ...props }, ref) {
    return (
      <select ref={ref} className={cn(fieldBase, 'cursor-pointer pr-8', className)} {...props}>
        {children}
      </select>
    );
  },
);

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label>{label}</Label>
      {children}
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </div>
  );
}

/* ---------------- CopyButton ---------------- */
export function CopyButton({ text, label = 'คัดลอก', className }: { text: string; label?: string; className?: string }) {
  const [done, setDone] = React.useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* ignore */
        }
      }}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:bg-surface-muted transition-colors',
        className,
      )}
    >
      {done ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
      {done ? 'คัดลอกแล้ว' : label}
    </button>
  );
}

/* ---------------- Spinner / skeleton ---------------- */
export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-5 w-5 animate-spin text-primary', className)} />;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('shimmer rounded-md', className)} />;
}

/* ---------------- Alert ---------------- */
export function Alert({ tone = 'info', children }: { tone?: 'info' | 'warning' | 'danger' | 'success'; children: React.ReactNode }) {
  const tones = {
    info: 'bg-accent-soft text-accent border-accent/30',
    warning: 'bg-secondary-soft text-warning border-warning/30',
    danger: 'bg-danger/10 text-danger border-danger/30',
    success: 'bg-primary-soft text-success border-success/30',
  };
  return <div className={cn('rounded-md border px-4 py-3 text-sm leading-relaxed', tones[tone])}>{children}</div>;
}
