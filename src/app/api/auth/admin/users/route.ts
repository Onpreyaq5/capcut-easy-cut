import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, listUsers } from '@/lib/authStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// สถิติลูกค้า (เฉพาะเจ้าของเว็บ) — ใช้ดูจำนวนคนลองใช้ + รายชื่ออีเมลไว้ส่งโปรโมชั่น
export async function GET(req: NextRequest) {
  const me = await getSessionUser(req);
  if (!me || me.role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }
  const users = await listUsers();
  const rows = users.map((u) => ({
    email: u.email,
    role: u.role,
    consent: u.consent,
    createdAt: u.createdAt,
    loginCount: u.loginCount,
    lastLoginAt: u.lastLoginAt,
  }));

  // ?format=csv -> ดาวน์โหลดรายชื่ออีเมลไว้ทำแคมเปญ
  if (req.nextUrl.searchParams.get('format') === 'csv') {
    // กัน CSV injection (ค่าขึ้นต้นด้วย = + - @ อาจถูก Excel มองเป็นสูตร) + escape เครื่องหมายคำพูด
    const cell = (v: string | number) => {
      let s = String(v);
      if (/^[=+\-@]/.test(s)) s = `'${s}`;
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const head = 'email,consent,createdAt,loginCount,lastLoginAt';
    const csv = [head, ...rows.map((r) =>
      [r.email, r.consent ? 'yes' : 'no', r.createdAt, r.loginCount, r.lastLoginAt].map(cell).join(','),
    )].join('\n');
    return new NextResponse('﻿' + csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="customers.csv"',
      },
    });
  }

  return NextResponse.json({
    ok: true,
    totalUsers: rows.length,
    totalLogins: rows.reduce((s, r) => s + r.loginCount, 0),
    consented: rows.filter((r) => r.consent).length,
    users: rows,
  });
}
