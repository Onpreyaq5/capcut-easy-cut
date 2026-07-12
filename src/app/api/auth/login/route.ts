import { NextRequest, NextResponse } from 'next/server';
import { verifyLogin, createSession, SESSION_COOKIE, sessionCookieOptions } from '@/lib/authStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    const r = await verifyLogin(String(email || ''), String(password || ''));
    if (!r.ok || !r.user) return NextResponse.json({ ok: false, error: r.error }, { status: 401 });
    const token = await createSession(r.user.email);
    const res = NextResponse.json({ ok: true, email: r.user.email, role: r.user.role });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
    return res;
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
