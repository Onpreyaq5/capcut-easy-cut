import { NextRequest, NextResponse } from 'next/server';
import { verifyLogin, createSession, issueOtp, rateLimit, clientIp, SESSION_COOKIE, sessionCookieOptions } from '@/lib/authStore';
import { sendOtpEmail, mailConfigured } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json();
    const mail = String(email || '').trim().toLowerCase();
    // rate limit กัน brute-force รหัสผ่าน (ต่อ IP + ต่ออีเมล)
    if (!rateLimit(`login:${clientIp(req)}`, 10, 60_000) || !rateLimit(`login:${mail}`, 8, 60_000)) {
      return NextResponse.json({ ok: false, error: 'ลองเข้าสู่ระบบผิดหลายครั้ง กรุณารอสักครู่' }, { status: 429 });
    }
    const r = await verifyLogin(mail, String(password || ''));
    if (!r.ok || !r.user) {
      // บัญชียังไม่ยืนยันอีเมล -> ส่งรหัสใหม่แล้วให้ไปหน้ายืนยัน
      if (r.needVerify) {
        const otp = await issueOtp(mail);
        if (!('error' in otp)) await sendOtpEmail(mail, otp.code);
        return NextResponse.json({ ok: false, needVerify: true, email: mail, mailConfigured: mailConfigured(), error: r.error }, { status: 403 });
      }
      return NextResponse.json({ ok: false, error: r.error }, { status: 401 });
    }
    const token = await createSession(r.user.email);
    const res = NextResponse.json({ ok: true, email: r.user.email, role: r.user.role });
    res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
    return res;
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
