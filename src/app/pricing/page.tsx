'use client';
// หน้าราคา (freemium) — โชว์ 3 แพ็กเกจ + ไฮไลต์แพ็กเกจปัจจุบัน + แถบโควตาที่ใช้ไป
import { useEffect, useState } from 'react';
import { Check, Sparkles, Loader2, Crown } from 'lucide-react';
import { PLANS, fmtMinutes, type PlanId } from '@/lib/planInfo';

interface Me {
  ok: boolean;
  plan?: PlanId;
  usedSeconds?: number;
  limitSeconds?: number;
  remainingSeconds?: number;
}

export default function PricingPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<PlanId | null>(null);

  useEffect(() => {
    fetch('/api/auth/me')
      .then((r) => (r.ok ? r.json() : { ok: false }))
      .then(setMe)
      .catch(() => setMe({ ok: false }))
      .finally(() => setLoading(false));
  }, []);

  const current = me?.plan;
  const usedPct =
    me?.limitSeconds && me.limitSeconds > 0
      ? Math.min(100, Math.round(((me.usedSeconds || 0) / me.limitSeconds) * 100))
      : 0;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10">
      <div className="text-center">
        <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-primary-soft px-3 py-1 text-xs font-bold text-primary">
          <Sparkles className="h-3.5 w-3.5" /> แพ็กเกจ
        </div>
        <h1 className="text-2xl font-bold text-text-primary sm:text-3xl">เลือกแพ็กเกจที่ใช่สำหรับคุณ</h1>
        <p className="mt-2 text-sm text-text-muted">เริ่มฟรี อัปเกรดเมื่อพร้อม — ปลดลายน้ำ เพิ่มความยาว คุณภาพสูงขึ้น</p>
      </div>

      {/* แถบโควตาปัจจุบัน */}
      {me?.ok && me.limitSeconds != null && (
        <div className="mx-auto mt-6 max-w-md rounded-xl border border-border bg-surface p-4">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="font-semibold text-text-secondary">
              แพ็กเกจปัจจุบัน:{' '}
              <span className="text-primary">{PLANS.find((p) => p.id === current)?.name || current}</span>
            </span>
            <span className="text-text-muted">
              ใช้ไป {fmtMinutes(me.usedSeconds || 0)} / {fmtMinutes(me.limitSeconds)}
            </span>
          </div>
          <div className="h-2 overflow-hidden rounded-full bg-background">
            <div
              className={`h-full rounded-full transition-all ${usedPct >= 100 ? 'bg-red-500' : 'bg-primary'}`}
              style={{ width: `${usedPct}%` }}
            />
          </div>
          <p className="mt-1.5 text-right text-[11px] text-text-muted">
            เหลือ {fmtMinutes(me.remainingSeconds || 0)} เดือนนี้
          </p>
        </div>
      )}

      {/* การ์ดแพ็กเกจ */}
      <div className="mt-8 grid gap-5 md:grid-cols-3">
        {PLANS.map((p) => {
          const isCurrent = current === p.id;
          return (
            <div
              key={p.id}
              className={`hover-glow animate-in relative flex flex-col rounded-2xl border bg-surface p-6 shadow-sm ${
                p.highlight ? 'border-primary shadow-md' : 'border-border'
              }`}
            >
              {p.highlight && (
                <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-white">
                  แนะนำ
                </span>
              )}
              <div className="flex items-center gap-2">
                {p.id !== 'free' && <Crown className={`h-4 w-4 ${p.highlight ? 'text-primary' : 'text-text-muted'}`} />}
                <span className="text-sm font-extrabold uppercase tracking-wide text-text-secondary">{p.name}</span>
              </div>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-3xl font-extrabold text-text-primary">{p.price}</span>
                <span className="text-sm font-medium text-text-muted">{p.period}</span>
              </div>
              <p className="mt-1 min-h-[34px] text-xs text-text-muted">{p.who}</p>
              <div className="mt-2 rounded-lg bg-primary-soft px-3 py-1.5 text-center text-xs font-bold text-primary">
                {p.minutes} นาที/เดือน
              </div>

              <ul className="mt-4 flex flex-1 flex-col gap-2.5 border-t border-border pt-4">
                {p.features.map((f) => (
                  <li key={f} className="flex items-start gap-2 text-[13px] text-text-secondary">
                    <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-success" />
                    {f}
                  </li>
                ))}
              </ul>

              <button
                disabled={loading || isCurrent || upgrading !== null || p.id === 'free'}
                onClick={() => setUpgrading(p.id)}
                className={`mt-5 flex items-center justify-center gap-2 rounded-lg py-2.5 text-sm font-semibold transition-colors disabled:opacity-60 ${
                  p.highlight
                    ? 'bg-primary text-white hover:bg-primary-hover'
                    : 'border border-border bg-surface text-text-secondary hover:border-primary/50'
                }`}
              >
                {isCurrent ? 'แพ็กเกจปัจจุบัน' : p.id === 'free' ? 'ฟรีอยู่แล้ว' : p.cta}
              </button>
            </div>
          );
        })}
      </div>

      {/* แจ้งเตือนอัปเกรด (ยังไม่มีระบบจ่ายเงินจริง) */}
      {upgrading && (
        <div className="mx-auto mt-6 max-w-lg rounded-xl border border-primary/30 bg-primary-soft p-4 text-center text-sm text-text-secondary">
          <p className="font-semibold text-text-primary">ระบบชำระเงินกำลังจะเปิดเร็ว ๆ นี้ 🚀</p>
          <p className="mt-1 text-xs">
            ตอนนี้อัปเกรดแพ็กเกจ <b>{PLANS.find((p) => p.id === upgrading)?.name}</b> ได้โดยติดต่อแอดมินโดยตรง —
            เมื่อต่อระบบจ่ายเงิน (บัตร/PromptPay) เสร็จ ปุ่มนี้จะกดจ่ายได้ทันที
          </p>
          <button onClick={() => setUpgrading(null)} className="mt-2 text-xs font-semibold text-primary hover:underline">
            ปิด
          </button>
        </div>
      )}

      {!loading && !me?.ok && (
        <p className="mt-6 text-center text-xs text-text-muted">
          <a href="/" className="font-semibold text-primary hover:underline">เข้าสู่ระบบ</a> เพื่อดูโควตาและอัปเกรดแพ็กเกจ
        </p>
      )}
    </div>
  );
}
