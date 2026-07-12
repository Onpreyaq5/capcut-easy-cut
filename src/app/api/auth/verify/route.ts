import { NextRequest, NextResponse } from 'next/server';
import { confirmOtp, createSession, rateLimit, clientIp, SESSION_COOKIE, sessionCookieOptions } from '@/lib/authStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ยืนยันอีเมลด้วยรหัส OTP -> เปิดใช้งานบัญชี + ให้ session
export async function POST(req: NextRequest) {
  try {
    if (!rateLimit(`verify:${clientIp(req)}`, 20, 60_000)) {
      return NextResponse.json({ ok: false, error: 'ลองถี่เกินไป รอสักครู่' }, { status: 429 });
    }
    const { email, code } = await req.json();
    const r = await confirmOtp(String(email || ''), String(code || ''));
    if (!r.ok || !r.user) return NextResponse.json({ ok: false, error: r.error }, { status: 400 });
    const token = await createSession(r.user.email);
    const res = NextResponse.json({ ok: true, email: r.user.email, role: r.user.role });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
