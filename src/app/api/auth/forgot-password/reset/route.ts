import { NextRequest, NextResponse } from 'next/server';
import { clientIp, rateLimit, resetPassword } from '@/lib/authStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!rateLimit(`forgot-reset:${clientIp(req)}`, 8, 60_000)) return NextResponse.json({ ok: false, error: 'ลองใหม่ภายหลัง' }, { status: 429 });
  const { token, password, confirmPassword } = await req.json();
  if (password !== confirmPassword) return NextResponse.json({ ok: false, error: 'รหัสผ่านทั้งสองช่องไม่ตรงกัน' }, { status: 400 });
  const result = await resetPassword(String(token || ''), String(password || ''));
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
