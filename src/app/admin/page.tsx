'use client';
// หลังบ้าน (เฉพาะเจ้าของเว็บ): ดูจำนวนคนลองใช้ + รายชื่ออีเมลลูกค้า + โหลด CSV ไว้ส่งโปรโมชั่น
import { useEffect, useState } from 'react';
import { Users, LogIn, MailCheck, Download, Loader2, ArrowLeft } from 'lucide-react';

interface Row {
  email: string;
  role: string;
  consent: boolean;
  createdAt: string;
  loginCount: number;
  lastLoginAt: string;
}

interface Stats {
  totalUsers: number;
  totalLogins: number;
  consented: number;
  users: Row[];
}

export default function AdminPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/auth/admin/users')
      .then((r) => r.json())
      .then((d) => (d.ok ? setStats(d) : setError(d.error || 'โหลดไม่สำเร็จ')))
      .catch((e) => setError(String(e)));
  }, []);

  if (error) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16 text-center">
        <p className="text-sm font-semibold text-red-500">{error}</p>
        <a href="/" className="mt-3 inline-flex items-center gap-1 text-xs text-primary hover:underline">
          <ArrowLeft className="h-3 w-3" /> กลับหน้าหลัก
        </a>
      </div>
    );
  }
  if (!stats) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center text-text-muted">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }

  const fmt = (iso: string) => (iso ? new Date(iso).toLocaleString('th-TH', { dateStyle: 'short', timeStyle: 'short' }) : '-');

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-text-primary">หลังบ้าน — ข้อมูลลูกค้า</h1>
          <p className="text-xs text-text-muted">คนที่สมัครเข้ามาลองใช้เว็บ · เอาอีเมลไว้ส่งข่าวสาร/โปรโมชั่น</p>
        </div>
        <a
          href="/api/auth/admin/users?format=csv"
          className="flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90"
        >
          <Download className="h-3.5 w-3.5" /> ดาวน์โหลดรายชื่อ (CSV)
        </a>
      </div>

      <div className="mb-6 grid grid-cols-3 gap-3">
        <StatCard icon={<Users className="h-4 w-4" />} label="คนสมัครทั้งหมด" value={stats.totalUsers} />
        <StatCard icon={<LogIn className="h-4 w-4" />} label="ยอดเข้าใช้รวม (ครั้ง)" value={stats.totalLogins} />
        <StatCard icon={<MailCheck className="h-4 w-4" />} label="ยินยอมรับโปรโมชั่น" value={stats.consented} />
      </div>

      <div className="overflow-x-auto rounded-xl border border-border bg-surface">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-border text-text-muted">
              <th className="px-3 py-2.5 font-semibold">อีเมล</th>
              <th className="px-3 py-2.5 font-semibold">สมัครเมื่อ</th>
              <th className="px-3 py-2.5 font-semibold">เข้าใช้ (ครั้ง)</th>
              <th className="px-3 py-2.5 font-semibold">ล่าสุด</th>
              <th className="px-3 py-2.5 font-semibold">รับโปรโมชั่น</th>
            </tr>
          </thead>
          <tbody>
            {stats.users.map((u) => (
              <tr key={u.email} className="border-b border-border/50 text-text-secondary">
                <td className="px-3 py-2 font-semibold text-text-primary">
                  {u.email} {u.role === 'owner' && <span className="ml-1 rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">เจ้าของ</span>}
                </td>
                <td className="px-3 py-2">{fmt(u.createdAt)}</td>
                <td className="px-3 py-2">{u.loginCount}</td>
                <td className="px-3 py-2">{fmt(u.lastLoginAt)}</td>
                <td className="px-3 py-2">{u.consent ? '✅' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[11px] text-text-muted">
        💡 ตอนนี้ยังไม่ส่งอีเมลอัตโนมัติ — ใช้ปุ่ม CSV โหลดรายชื่อ (เฉพาะคนที่ยินยอม) ไปใส่บริการส่งเมลอย่าง Brevo/Mailchimp ได้เลย
      </p>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="rounded-xl border border-border bg-surface p-4">
      <div className="mb-1 flex items-center gap-1.5 text-text-muted">{icon}<span className="text-[11px] font-semibold">{label}</span></div>
      <div className="text-2xl font-bold text-text-primary">{value}</div>
    </div>
  );
}
