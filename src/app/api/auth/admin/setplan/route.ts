import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, setPlan, type Plan, PLAN_LIMITS } from '@/lib/authStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// แอดมินตั้งแพ็กเกจให้ลูกค้า (เช่น ยืนยันการจ่ายเงินด้วยมือ / ให้ทดลอง Pro)
export async function POST(req: NextRequest) {
  const me = await getSessionUser(req);
  if (!me || me.role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'เฉพาะเจ้าของเว็บเท่านั้น' }, { status: 403 });
  }
  const { email, plan } = await req.json();
  if (!(plan in PLAN_LIMITS)) return NextResponse.json({ ok: false, error: 'แพ็กเกจไม่ถูกต้อง' }, { status: 400 });
  const ok = await setPlan(String(email || ''), plan as Plan);
  if (!ok) return NextResponse.json({ ok: false, error: 'ไม่พบผู้ใช้' }, { status: 404 });
  return NextResponse.json({ ok: true, email, plan });
}
