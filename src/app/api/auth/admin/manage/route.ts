import { NextRequest, NextResponse } from 'next/server';
import {
  adminCredentialsValid,
  deleteUser,
  getSessionUser,
  setUsage,
  setUserRole,
  updatePayment,
  type PaymentStatus,
} from '@/lib/authStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  const me = await getSessionUser(req);
  if (!me || me.role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }
  const body = await req.json();
  const action = String(body.action || '');

  if (action === 'setUsage') {
    const ok = await setUsage(String(body.email || ''), Number(body.usedMinutes || 0) * 60);
    return ok
      ? NextResponse.json({ ok: true })
      : NextResponse.json({ ok: false, error: 'ไม่พบบัญชี' }, { status: 404 });
  }

  if (!adminCredentialsValid(String(body.adminEmail || ''), String(body.adminPassword || ''))) {
    return NextResponse.json({ ok: false, error: 'ข้อมูลยืนยัน ADMIN ไม่ถูกต้อง' }, { status: 401 });
  }

  if (action === 'setRole') {
    const role = body.role === 'owner' ? 'owner' : 'user';
    const result = await setUserRole(String(body.email || ''), role);
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (action === 'deleteUser') {
    if (String(body.email || '').toLowerCase() === me.email.toLowerCase()) {
      return NextResponse.json({ ok: false, error: 'ลบบัญชีที่กำลังใช้งานไม่ได้' }, { status: 400 });
    }
    const result = await deleteUser(String(body.email || ''));
    return NextResponse.json(result, { status: result.ok ? 200 : 400 });
  }
  if (action === 'payment') {
    const allowed: PaymentStatus[] = ['pending', 'paid', 'rejected'];
    const status = String(body.status || '') as PaymentStatus;
    if (!allowed.includes(status)) return NextResponse.json({ ok: false, error: 'สถานะไม่ถูกต้อง' }, { status: 400 });
    const payment = await updatePayment(String(body.id || ''), status, String(body.note || ''));
    if (!payment) return NextResponse.json({ ok: false, error: 'ไม่พบรายการชำระเงิน' }, { status: 404 });
    return NextResponse.json({ ok: true, payment });
  }
  return NextResponse.json({ ok: false, error: 'คำสั่งไม่ถูกต้อง' }, { status: 400 });
}
