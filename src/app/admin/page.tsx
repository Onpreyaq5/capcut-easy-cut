'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ArrowLeft, Banknote, Crown, Loader2, LogIn, MailCheck, ShieldCheck, Trash2, Users } from 'lucide-react';

interface UserRow {
  email: string; role: 'owner' | 'user'; consent: boolean; verified: boolean; plan: string;
  createdAt: string; loginCount: number; lastLoginAt: string; usedSeconds: number; limitSeconds: number; revenue: number;
}
interface PaymentRow { id: string; email: string; plan: string; amount: number; status: 'pending' | 'paid' | 'rejected'; createdAt: string; paidAt?: string; note?: string; }
interface Stats {
  totalUsers: number; totalLogins: number; consented: number; totalRevenue: number; monthlyRevenue: number;
  pendingPayments: number; users: UserRow[]; payments: PaymentRow[];
}

const money = (value: number) => new Intl.NumberFormat('th-TH', { style: 'currency', currency: 'THB', maximumFractionDigits: 0 }).format(value || 0);
const date = (value?: string) => value ? new Date(value).toLocaleString('th-TH') : '—';

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState('');
  const [adminEmail, setAdminEmail] = useState('ADMIN');
  const [adminPassword, setAdminPassword] = useState('');

  const reload = useCallback(async () => {
    const response = await fetch('/api/auth/admin/users', { cache: 'no-store' });
    const data = await response.json();
    if (!data.ok) throw new Error(data.error || 'โหลดข้อมูลไม่สำเร็จ');
    setStats(data);
  }, []);

  useEffect(() => { reload().catch((e) => setError(String(e))); }, [reload]);

  const post = async (url: string, body: Record<string, unknown>, key: string) => {
    setBusy(key); setError(''); setNotice('');
    try {
      const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await response.json();
      if (!data.ok) throw new Error(data.error || 'ดำเนินการไม่สำเร็จ');
      setNotice('บันทึกเรียบร้อยแล้ว');
      await reload();
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(''); }
  };

  const protectedPost = (body: Record<string, unknown>, key: string) => {
    if (!adminPassword) { setError('กรุณาใส่รหัสผ่าน ADMIN ก่อน'); return; }
    return post('/api/auth/admin/manage', { ...body, adminEmail, adminPassword }, key);
  };

  if (error && !stats) return <StateMessage message={error} />;
  if (!stats) return <div className="flex min-h-[60vh] items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-primary" /></div>;

  return (
    <main className="mx-auto max-w-7xl px-4 py-8 text-text-primary">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-wider text-primary">Owner console</p><h1 className="text-2xl font-bold">ระบบหลังบ้าน</h1></div>
        <Link href="/" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-surface px-4 text-sm font-semibold"><ArrowLeft className="h-4 w-4" /> กลับหน้าหลัก</Link>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <Stat icon={<Users />} label="สมาชิก" value={String(stats.totalUsers)} />
        <Stat icon={<LogIn />} label="เข้าสู่ระบบ" value={String(stats.totalLogins)} />
        <Stat icon={<MailCheck />} label="รับข่าวสาร" value={String(stats.consented)} />
        <Stat icon={<Banknote />} label="รายได้เดือนนี้" value={money(stats.monthlyRevenue)} />
        <Stat icon={<Banknote />} label="รายได้รวม" value={money(stats.totalRevenue)} />
        <Stat icon={<ShieldCheck />} label="รอตรวจชำระ" value={String(stats.pendingPayments)} />
      </section>

      <section className="mt-6 rounded-2xl border border-amber-400/40 bg-amber-400/10 p-4">
        <div className="mb-3"><h2 className="font-bold">ปลดล็อกคำสั่งสำคัญ</h2><p className="text-xs text-text-secondary">ใช้สำหรับลบบัญชี เปลี่ยนเจ้าของ และยืนยันการชำระเงิน รหัสไม่ถูกบันทึกในเบราว์เซอร์</p></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-xs font-semibold">ชื่อ ADMIN<input value={adminEmail} onChange={(e) => setAdminEmail(e.target.value)} autoComplete="username" className="mt-1 w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2.5 text-base text-slate-950 focus:border-blue-600 focus:outline-none dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label>
          <label className="text-xs font-semibold">รหัสผ่าน ADMIN<input type="password" value={adminPassword} onChange={(e) => setAdminPassword(e.target.value)} autoComplete="current-password" placeholder="ใส่เมื่อจะใช้คำสั่งสำคัญ" className="mt-1 w-full rounded-xl border-2 border-slate-300 bg-white px-3 py-2.5 text-base text-slate-950 focus:border-blue-600 focus:outline-none dark:border-slate-600 dark:bg-slate-950 dark:text-white" /></label>
        </div>
      </section>

      {(error || notice) && <p aria-live="polite" className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${error ? 'bg-red-500/10 text-red-500' : 'bg-green-500/10 text-success'}`}>{error || notice}</p>}

      <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="border-b border-border p-4"><h2 className="font-bold">บัญชีและโควตา</h2><p className="text-xs text-text-muted">แก้แพ็กเกจ นาทีที่ใช้ไป และสิทธิ์เจ้าของ</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[1050px] text-left text-xs"><thead className="bg-surface-muted text-text-secondary"><tr><Th>บัญชี</Th><Th>สถานะ</Th><Th>แพ็กเกจ</Th><Th>ใช้ไป/ลิมิต</Th><Th>รายได้</Th><Th>เข้าใช้</Th><Th>จัดการ</Th></tr></thead><tbody>
          {stats.users.map((user) => <tr key={user.email} className="border-t border-border/60 align-top">
            <Td><p className="font-semibold text-text-primary">{user.email}</p><p className="mt-1 text-text-muted">สมัคร {date(user.createdAt)}</p></Td>
            <Td><span className={`rounded-full px-2 py-1 font-bold ${user.verified ? 'bg-green-500/10 text-success' : 'bg-amber-500/10 text-warning'}`}>{user.verified ? 'ยืนยันแล้ว' : 'รอยืนยัน'}</span><p className="mt-2">{user.role === 'owner' ? 'เจ้าของ' : 'สมาชิก'}</p></Td>
            <Td><select value={user.plan} disabled={busy === user.email} onChange={(e) => post('/api/auth/admin/setplan', { email: user.email, plan: e.target.value }, user.email)} className="min-h-11 rounded-lg border-2 border-slate-300 bg-white px-2 font-semibold text-slate-950 focus:border-blue-600 focus:outline-none dark:border-slate-600 dark:bg-slate-950 dark:text-white"><option value="free">Free</option><option value="pro">Pro</option><option value="studio">Studio</option></select></Td>
            <Td><div className="flex items-center gap-2"><input type="number" min="0" defaultValue={Math.round(user.usedSeconds / 60)} id={`usage-${user.email}`} className="h-11 w-20 rounded-lg border-2 border-slate-300 bg-white px-2 font-semibold text-slate-950 focus:border-blue-600 focus:outline-none dark:border-slate-600 dark:bg-slate-950 dark:text-white" /><button onClick={() => { const el = document.getElementById(`usage-${user.email}`) as HTMLInputElement; post('/api/auth/admin/manage', { action: 'setUsage', email: user.email, usedMinutes: Number(el.value) }, `usage-${user.email}`); }} className="min-h-11 rounded-lg bg-blue-600 px-3 font-bold text-white hover:bg-blue-500">บันทึก</button></div><p className="mt-1 text-text-muted">ลิมิต {Math.round(user.limitSeconds / 60)} นาที</p></Td>
            <Td className="font-bold">{money(user.revenue)}</Td><Td>{user.loginCount} ครั้ง<p className="mt-1 text-text-muted">{date(user.lastLoginAt)}</p></Td>
            <Td><div className="flex flex-wrap gap-2">{!user.verified && <button onClick={() => post('/api/auth/admin/verify-user', { email: user.email }, `verify-${user.email}`)} className="min-h-11 rounded-lg bg-green-500/10 px-3 font-bold text-success">ยืนยัน</button>}<button onClick={() => protectedPost({ action: 'setRole', email: user.email, role: user.role === 'owner' ? 'user' : 'owner' }, `role-${user.email}`)} className="min-h-11 rounded-lg bg-amber-500/10 px-3 font-bold text-warning"><Crown className="mr-1 inline h-3.5 w-3.5" />{user.role === 'owner' ? 'ลดสิทธิ์' : 'ตั้งเจ้าของ'}</button><button onClick={() => confirm(`ลบบัญชี ${user.email} ถาวร?`) && protectedPost({ action: 'deleteUser', email: user.email }, `delete-${user.email}`)} className="min-h-11 rounded-lg bg-red-500/10 px-3 font-bold text-red-500"><Trash2 className="mr-1 inline h-3.5 w-3.5" />ลบ</button></div></Td>
          </tr>)}
        </tbody></table></div>
      </section>

      <section className="mt-6 overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="border-b border-border p-4"><h2 className="font-bold">รายการชำระเงิน</h2><p className="text-xs text-text-muted">รายการเกิดเมื่อสมาชิกสร้าง QR พร้อมเพย์ รายได้จะนับหลังตั้งสถานะ “รับชำระ”</p></div>
        <div className="overflow-x-auto"><table className="w-full min-w-[850px] text-left text-xs"><thead className="bg-surface-muted"><tr><Th>วันที่</Th><Th>อีเมล</Th><Th>แพ็กเกจ</Th><Th>ยอด</Th><Th>สถานะ</Th><Th>ดำเนินการ</Th></tr></thead><tbody>
          {stats.payments.length === 0 ? <tr><Td colSpan={6}>ยังไม่มีรายการชำระเงิน</Td></tr> : stats.payments.map((payment) => <tr key={payment.id} className="border-t border-border/60"><Td>{date(payment.createdAt)}</Td><Td>{payment.email}</Td><Td className="uppercase">{payment.plan}</Td><Td className="font-bold">{money(payment.amount)}</Td><Td><span className="font-bold">{payment.status === 'paid' ? 'รับชำระแล้ว' : payment.status === 'rejected' ? 'ปฏิเสธ' : 'รอตรวจ'}</span>{payment.paidAt && <p className="text-text-muted">{date(payment.paidAt)}</p>}</Td><Td><div className="flex gap-2"><button disabled={payment.status === 'paid'} onClick={() => protectedPost({ action: 'payment', id: payment.id, status: 'paid' }, `pay-${payment.id}`)} className="min-h-11 rounded-lg bg-green-500/10 px-3 font-bold text-success disabled:opacity-40">รับชำระ</button><button disabled={payment.status === 'rejected'} onClick={() => protectedPost({ action: 'payment', id: payment.id, status: 'rejected' }, `reject-${payment.id}`)} className="min-h-11 rounded-lg bg-red-500/10 px-3 font-bold text-red-500 disabled:opacity-40">ปฏิเสธ</button></div></Td></tr>)}
        </tbody></table></div>
      </section>
    </main>
  );
}

function StateMessage({ message }: { message: string }) { return <div className="mx-auto max-w-xl px-4 py-16 text-center"><p className="text-red-500">{message}</p><Link href="/" className="mt-4 inline-flex items-center gap-1 text-primary"><ArrowLeft className="h-4 w-4" /> กลับหน้าหลัก</Link></div>; }
function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) { return <div className="rounded-2xl border border-border bg-surface p-4"><div className="mb-2 flex items-center gap-2 text-text-muted">{<span className="[&>svg]:h-4 [&>svg]:w-4">{icon}</span>}<span className="text-xs font-semibold">{label}</span></div><p className="text-xl font-bold">{value}</p></div>; }
function Th({ children }: { children: React.ReactNode }) { return <th className="px-4 py-3 font-bold">{children}</th>; }
function Td({ children, className = '', colSpan }: { children: React.ReactNode; className?: string; colSpan?: number }) { return <td colSpan={colSpan} className={`px-4 py-4 ${className}`}>{children}</td>; }
