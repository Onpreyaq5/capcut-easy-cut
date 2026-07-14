'use client';
// ประตูสมาชิก: สมัคร -> ยืนยันอีเมลด้วยรหัส OTP -> ถึงจะใช้ฟังก์ชันได้
// เก็บเฉพาะอีเมล "จริง" ที่ยืนยันแล้ว ไว้ทำโปรโมชั่น (กันอีเมลปลอม)
import { useCallback, useEffect, useState } from 'react';
import { LogIn, LogOut, Loader2, Mail, Lock, Sparkles, UserPlus, ShieldCheck, ArrowLeft, Eye, EyeOff } from 'lucide-react';
import { fmtMinutes } from '@/lib/planInfo';

type Mode = 'login' | 'signup' | 'verify' | 'forgot' | 'forgotVerify' | 'newPassword';

interface Me {
  email: string;
  role: 'owner' | 'user';
  planLabel?: string;
  remainingSeconds?: number;
}

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [checking, setChecking] = useState(true);
  const [mode, setMode] = useState<Mode>('signup');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [consent, setConsent] = useState(true);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');

  const check = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/me');
      if (r.ok) {
        const d = await r.json();
        setMe({ email: d.email, role: d.role, planLabel: d.planLabel, remainingSeconds: d.remainingSeconds });
      } else setMe(null);
    } catch {
      setMe(null);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    check();
  }, [check]);

  const doSignup = async () => {
    const r = await fetch('/api/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, consent }),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'สมัครไม่สำเร็จ');
    // โหมดพับ OTP: สมัครเสร็จได้ session เลย -> เข้าใช้งานทันที
    if (!d.needVerify) { await check(); return; }
    setMode('verify');
    setNote(d.note || 'ส่งรหัสยืนยันไปที่อีเมลแล้ว');
  };

  const doLogin = async () => {
    const r = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const d = await r.json();
    if (d.needVerify) {
      setMode('verify');
      setNote('บัญชีนี้ยังไม่ได้ยืนยัน — ส่งรหัสใหม่ไปที่อีเมลแล้ว');
      return;
    }
    if (!d.ok) throw new Error(d.error || 'เข้าสู่ระบบไม่สำเร็จ');
    await check();
  };

  const doVerify = async () => {
    const r = await fetch('/api/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, code }),
    });
    const d = await r.json();
    if (!d.ok) throw new Error(d.error || 'ยืนยันไม่สำเร็จ');
    await check();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      if (mode === 'signup') await doSignup();
      else if (mode === 'login') await doLogin();
      else await doVerify();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const resend = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await fetch('/api/auth/resend', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const d = await r.json();
      if (!d.ok) throw new Error(d.error || 'ส่งรหัสใหม่ไม่สำเร็จ');
      setNote('ส่งรหัสใหม่ไปที่อีเมลแล้ว');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const forgot = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await fetch('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
      const d = await r.json(); if (!d.ok) throw new Error(d.error || 'ส่งรหัสไม่สำเร็จ');
      setNote(d.note); setCode(''); setMode('forgotVerify');
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };

  const verifyForgot = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setError('');
    try {
      const r = await fetch('/api/auth/forgot-password/verify', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, code }) });
      const d = await r.json(); if (!d.ok) throw new Error(d.error || 'รหัสไม่ถูกต้อง');
      setResetToken(d.token); setMode('newPassword');
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
  };

  const saveNewPassword = async (e: React.FormEvent) => {
    e.preventDefault(); setError('');
    if (newPassword !== confirmPassword) { setError('รหัสผ่านทั้งสองช่องไม่ตรงกัน'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/auth/forgot-password/reset', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: resetToken, password: newPassword, confirmPassword }) });
      const d = await r.json(); if (!d.ok) throw new Error(d.error || 'เปลี่ยนรหัสไม่สำเร็จ');
      setPassword(''); setNewPassword(''); setConfirmPassword(''); setNote('เปลี่ยนรหัสผ่านแล้ว กรุณาเข้าสู่ระบบ'); setMode('login');
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); } finally { setBusy(false); }
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
        <div className="animate-in rounded-2xl border border-border bg-surface p-6 shadow-sm">
          <div className="mb-1 flex items-center gap-2 text-primary">
            <Sparkles className="h-5 w-5" />
            <span className="text-xs font-bold tracking-wide">CAPCUT EASY CUT</span>
          </div>

          {mode === 'forgot' ? (
            <ResetShell title="ลืมรหัสผ่าน" subtitle="ใส่อีเมลที่ใช้สมัคร เราจะส่งรหัส OTP เพื่อยืนยันว่าเป็นเจ้าของบัญชี">
              <form onSubmit={forgot} className="space-y-3">
                <label className="block text-xs font-semibold text-text-secondary">อีเมล
                  <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="mt-1 w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-base text-slate-950 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
                </label>
                {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
                <PrimaryButton busy={busy} label="ส่งรหัส OTP" />
              </form>
              <BackButton onClick={() => setMode('login')} />
            </ResetShell>
          ) : mode === 'forgotVerify' ? (
            <ResetShell title="ยืนยัน OTP" subtitle={`ใส่รหัส 6 หลักที่ส่งไปยัง ${email}`}>
              {note && <p className="mb-3 rounded-lg bg-primary/10 px-3 py-2 text-xs text-primary">{note}</p>}
              <form onSubmit={verifyForgot} className="space-y-3">
                <input aria-label="OTP สำหรับเปลี่ยนรหัสผ่าน" inputMode="numeric" autoComplete="one-time-code" required maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} placeholder="______" className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-center text-2xl font-bold tracking-[0.4em] text-slate-950 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
                {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
                <PrimaryButton busy={busy} disabled={code.length !== 6} label="ยืนยัน OTP" />
              </form>
              <BackButton onClick={() => setMode('forgot')} />
            </ResetShell>
          ) : mode === 'newPassword' ? (
            <ResetShell title="ตั้งรหัสผ่านใหม่" subtitle="รหัสผ่านใหม่ทั้งสองช่องต้องตรงกันและยาวอย่างน้อย 8 ตัวอักษร">
              <form onSubmit={saveNewPassword} className="space-y-3">
                <PasswordField label="รหัสผ่านใหม่" value={newPassword} onChange={setNewPassword} />
                <PasswordField label="ยืนยันรหัสผ่านใหม่" value={confirmPassword} onChange={setConfirmPassword} />
                {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
                <PrimaryButton busy={busy} disabled={newPassword.length < 8 || confirmPassword.length < 8} label="บันทึกรหัสผ่านใหม่" />
              </form>
            </ResetShell>
          ) : mode === 'verify' ? (
            <>
              <h1 className="flex items-center gap-2 text-xl font-bold text-text-primary">
                <ShieldCheck className="h-5 w-5 text-primary" /> ยืนยันอีเมล
              </h1>
              <p className="mb-2 mt-1 text-xs text-text-muted">
                ใส่รหัส 6 หลักที่ส่งไปที่ <span className="font-semibold text-text-secondary">{email}</span>
              </p>
              {note && <p className="mb-3 rounded-lg bg-primary/10 px-3 py-2 text-[11px] text-primary">{note}</p>}
              <form onSubmit={submit} className="space-y-3">
                <input
                  inputMode="numeric"
                  autoFocus
                  required
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="______"
                  aria-label="รหัสยืนยัน 6 หลัก"
                  autoComplete="one-time-code"
                  className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-center text-2xl font-bold tracking-[0.4em] text-slate-950 caret-blue-600 shadow-inner placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white"
                />
                {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
                <button type="submit" disabled={busy || code.length !== 6} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />} ยืนยัน
                </button>
              </form>
              <div className="mt-4 flex items-center justify-between text-xs">
                <button onClick={() => { setMode('signup'); setError(''); setNote(''); }} className="flex items-center gap-1 text-text-muted hover:text-text-secondary">
                  <ArrowLeft className="h-3 w-3" /> กลับ
                </button>
                <button onClick={resend} disabled={busy} className="font-semibold text-primary hover:underline disabled:opacity-50">
                  ขอรหัสใหม่
                </button>
              </div>
              <p className="mt-3 text-center text-[11px] text-text-muted">
                ไม่ได้รับอีเมล? เช็คกล่องสแปม หรือติดต่อแอดมินให้กดยืนยันบัญชีให้ แล้วกลับมาเข้าสู่ระบบได้เลย
              </p>
            </>
          ) : (
            <>
              <h1 className="text-xl font-bold text-text-primary">
                {mode === 'signup' ? 'สมัครใช้งานฟรี' : 'เข้าสู่ระบบ'}
              </h1>
              <p className="mb-5 mt-1 text-xs text-text-muted">
                {mode === 'signup' ? 'ใส่อีเมล + รหัสผ่าน แล้วเริ่มใช้งานได้เลย (ไม่ต้องยืนยันอีเมล)' : 'ยินดีต้อนรับกลับมา 👋'}
              </p>
              <form onSubmit={submit} className="space-y-3">
                <label className="block">
                  <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-text-muted"><Mail className="h-3.5 w-3.5" /> อีเมล</span>
                  <input type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 text-base text-slate-950 caret-blue-600 shadow-inner placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
                </label>
                <label className="block">
                  <span className="mb-1 flex items-center gap-1 text-xs font-semibold text-text-muted"><Lock className="h-3.5 w-3.5" /> รหัสผ่าน {mode === 'signup' ? '(อย่างน้อย 6 ตัว)' : ''}</span>
                  <div className="relative">
                    <input type={showPassword ? 'text' : 'password'} required minLength={6} autoComplete={mode === 'signup' ? 'new-password' : 'current-password'} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="อย่างน้อย 6 ตัวอักษร" className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 pr-12 text-base text-slate-950 caret-blue-600 shadow-inner placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white" />
                    <button type="button" onClick={() => setShowPassword((shown) => !shown)} aria-label={showPassword ? 'ซ่อนรหัสผ่าน' : 'แสดงรหัสผ่าน'} aria-pressed={showPassword} className="absolute inset-y-0 right-0 flex min-h-11 min-w-11 items-center justify-center rounded-r-xl text-slate-600 hover:bg-slate-100 hover:text-slate-950 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white">
                      {showPassword ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
                    </button>
                  </div>
                </label>
                {mode === 'signup' && (
                  <label className="flex cursor-pointer items-start gap-2 text-xs text-text-secondary">
                    <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
                    <span>ยินยอมรับข่าวสาร ฟีเจอร์ใหม่ และโปรโมชั่นทางอีเมล (ยกเลิกได้ทุกเมื่อ)</span>
                  </label>
                )}
                {error && <p className="text-xs font-semibold text-red-500">{error}</p>}
                <button type="submit" disabled={busy} className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-60">
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : mode === 'signup' ? <UserPlus className="h-4 w-4" /> : <LogIn className="h-4 w-4" />}
                  {mode === 'signup' ? 'สมัครใช้งาน' : 'เข้าสู่ระบบ'}
                </button>
              </form>
              <button onClick={() => { setMode(mode === 'signup' ? 'login' : 'signup'); setError(''); }} className="mt-4 w-full text-center text-xs font-semibold text-primary hover:underline">
                {mode === 'signup' ? 'มีบัญชีแล้ว? เข้าสู่ระบบ' : 'ยังไม่มีบัญชี? สมัครใช้งานฟรี'}
              </button>
              {mode === 'login' && <button onClick={() => { setMode('forgot'); setError(''); setNote(''); }} className="mt-3 w-full text-center text-xs font-semibold text-text-secondary hover:text-primary hover:underline">ลืมรหัสผ่าน?</button>}
            </>
          )}
        </div>
        <p className="mt-3 text-center text-[11px] text-text-muted">
          สมัครแล้วใช้งานได้ทันที · รหัสผ่านถูกเข้ารหัส (scrypt)
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-end gap-2 px-4 pt-3 text-xs">
        <span className="rounded-full border border-border bg-surface px-3 py-1 font-semibold text-text-secondary">👤 {me.email}</span>
        <a href="/pricing" className="rounded-full border border-primary/30 bg-primary-soft px-3 py-1 font-semibold text-primary hover:bg-primary/10" title="ดูแพ็กเกจ / อัปเกรด">
          {me.planLabel || 'Free'}
          {me.remainingSeconds != null && <span className="ml-1 font-normal opacity-80">· เหลือ {fmtMinutes(me.remainingSeconds)}</span>}
        </a>
        {me.role === 'owner' && (
          <a href="/admin" className="rounded-full border border-primary/30 bg-primary/10 px-3 py-1 font-semibold text-primary hover:bg-primary/20">หลังบ้าน</a>
        )}
        <button onClick={logout} className="flex items-center gap-1 rounded-full border border-border bg-surface px-3 py-1 font-semibold text-text-muted hover:text-text-secondary">
          <LogOut className="h-3 w-3" /> ออก
        </button>
      </div>
      {children}
    </div>
  );
}

function ResetShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <><h1 className="text-xl font-bold text-text-primary">{title}</h1><p className="mb-5 mt-1 text-xs text-text-secondary">{subtitle}</p>{children}</>;
}
function PrimaryButton({ busy, disabled, label }: { busy: boolean; disabled?: boolean; label: string }) {
  return <button type="submit" disabled={busy || disabled} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-white hover:bg-primary-hover disabled:opacity-50">{busy && <Loader2 className="h-4 w-4 animate-spin" />}{label}</button>;
}
function BackButton({ onClick }: { onClick: () => void }) { return <button type="button" onClick={onClick} className="mt-4 inline-flex min-h-11 items-center gap-1 text-xs font-semibold text-text-secondary hover:text-primary"><ArrowLeft className="h-4 w-4" /> กลับ</button>; }
function PasswordField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [shown, setShown] = useState(false);
  return <label className="block text-xs font-semibold text-text-secondary">{label}<div className="relative mt-1"><input type={shown ? 'text' : 'password'} required minLength={8} autoComplete="new-password" value={value} onChange={(e) => onChange(e.target.value)} placeholder="อย่างน้อย 8 ตัวอักษร" className="w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-3 pr-12 text-base text-slate-950 placeholder:text-slate-400 focus:border-blue-600 focus:outline-none focus:ring-4 focus:ring-blue-500/20 dark:border-slate-600 dark:bg-slate-950 dark:text-white" /><button type="button" onClick={() => setShown(!shown)} aria-label={shown ? `ซ่อน${label}` : `แสดง${label}`} className="absolute inset-y-0 right-0 min-h-11 min-w-11 text-slate-600 dark:text-slate-300">{shown ? <EyeOff className="mx-auto h-5 w-5" /> : <Eye className="mx-auto h-5 w-5" />}</button></div></label>;
}
