import { NextRequest, NextResponse } from 'next/server';
import { clientIp, rateLimit, verifyPasswordResetOtp } from '@/lib/authStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!rateLimit(`forgot-verify:${clientIp(req)}`, 15, 60_000)) return NextResponse.json({ ok: false, error: 'ลองใหม่ภายหลัง' }, { status: 429 });
  const { email, code } = await req.json();
  const result = await verifyPasswordResetOtp(String(email || ''), String(code || ''));
  return NextResponse.json(result, { status: result.ok ? 200 : 400 });
}
