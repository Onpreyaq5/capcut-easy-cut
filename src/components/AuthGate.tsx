'use client';
// ประตูสมาชิก: ต้องสมัคร/เข้าสู่ระบบด้วยอีเมลก่อน ถึงจะใช้ฟังก์ชันได้
// เก็บอีเมลลูกค้าที่เข้ามาลองใช้ไว้ทำโปรโมชั่นในอนาคต (มี checkbox ยินยอมตาม PDPA)
import { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut, Loader2, Mail, Lock, Sparkles, UserPlus } from 'lucide-react';

type Mode = 'login' | 'signup';

interface Me {
  email: string;
  role: 'owner' | 'user';
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [consent, setConsent] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const check = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/me');
      if (r.ok) {
        const d = await r.json();
        setMe({ email: d.email, role: d.role });
      } else {
        setMe(null);
      }
    } catch {
      setMe(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const r = await fetch(mode === 'signup' ? '/api/auth/signup' : '/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(mode === 'signup' ? { email, password, consent } : { email, password }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'ไม่สำเร็จ');
      setMe({ email: d.email, role: d.role });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await fetch('/api/auth/logout', { method: 'POST' });
    setMe(null);
  };

  if (checking) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-text-muted">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="mx-auto flex min-h-[70vh] max-w-md flex-col justify-center px-4 py-10">
        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="mb-1 flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" />
            <span className="text-xs font-bold tracking-wide">CAPCUT EASY CUT</span>
          </div>
          <h1 className="text-xl font-bold text-text-primary">
            {mode === 'signup' ? 'สมัครใช้งานฟรี' : 'เข้าสู่ระบบ'}
          </h1>
          <p className="mb-5 mt-1 text-xs text-text-muted">
            {mode === 'signup'
              ? 'ใส่อีเมล + ตั้งรหัสผ่าน แล้วใช้ตัดคลิป/ทำซับอัตโนมัติได้เลย'
              : 'ยินดีต้อนรับกลับมา 👋'}
          </p>

          <form onSubmit={submit} className="space-y-3">
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-text-muted">
                <Mail className="h-3.5 w-3.5" /> อีเมล
              </span>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
              />
            </label>
            <label className="block">
              <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-text-muted">
                <Lock className="h-3.5 w-3.5" /> รหัสผ่าน {mode === 'signup' ? '(อย่างน้อย 6 ตัว)' : ''}
              </span>
              <input
                type="password"
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm text-text-primary focus:border-primary focus:outline-none"
              />
            </label>

            {mode === 'signup' && (
              <label className="flex cursor-pointer items-start gap-2 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 h-4 w-4 accent-primary"
                />
                <span>ยินยอมรับข่าวสาร ฟีเจอร์ใหม่ และโปรโมชั่นทางอีเมล (ยกเลิกได้ทุกเมื่อ)</span>
              </label>
            )}

            {error && <p className="text-xs font-semibold text-red-500">{error}</p>}

            <button
              type="submit"
              disabled={busy}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'signup' ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
              {mode === 'signup' ? 'สมัครใช้งาน' : 'เข้าสู่ระบบ'}
            </button>
          </form>

          <button
            onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); }}
            className="mt-4 w-full text-center text-xs font-semibold text-primary hover:underline"
          >
            {mode === 'signup' ? 'มีบัญชีแล้ว? เข้าสู่ระบบ' : 'ยังไม่มีบัญชี? สมัครใช้งานฟรี'}
          </button>
        </div>
        <p className="mt-3 text-center text-[11px] text-text-muted">
          ข้อมูลเก็บในเครื่องที่รันเว็บนี้เท่านั้น · รหัสผ่านถูกเข้ารหัส (scrypt)
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto flex max-w-6xl items-center justify-end gap-2 px-4 pt-3 text-xs">
        <span className="rounded-full border border-border bg-surface px-3 py-1 font-semibold text-text-secondary">
          👤 {me.email}
        </span>
        {me.role === 'owner' && (
          <a href="/admin" className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-semibold text-primary hover:bg-primary/20">
            หลังบ้าน
          </a>
        )}
        <button
          onClick={logout}
          className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 font-semibold text-text-muted hover:text-text-secondary"
        >
          <LogOut className="h-3 w-3" /> ออก
        </button>
      </div>
      {children}
    </div>
  );
}
