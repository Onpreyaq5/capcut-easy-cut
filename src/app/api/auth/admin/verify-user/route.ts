import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, adminVerifyUser } from '@/lib/authStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// แอดมินยืนยันบัญชีให้ลูกค้า — สำหรับตอนระบบส่งอีเมลยังไม่เปิด หรือลูกค้าไม่ได้รับรหัส
export async function POST(req: NextRequest) {
  const me = await getSessionUser(req);
  if (!me || me.role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }
  const { email } = await req.json();
  const ok = await adminVerifyUser(String(email || ''));
  if (!ok) return NextResponse.json({ ok: false, error: 'ไม่พบผู้ใช้' }, { status: 404 });
  return NextResponse.json({ ok: true, email });
}
