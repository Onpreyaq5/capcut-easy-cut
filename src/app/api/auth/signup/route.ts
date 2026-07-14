import { NextRequest, NextResponse } from 'next/server';
import { createUser, issueOtp, rateLimit, clientIp, validEmail, createSession, SESSION_COOKIE, sessionCookieOptions, REQUIRE_EMAIL_VERIFY } from '@/lib/authStore';
import { sendOtpEmail, mailConfigured } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    if (!rateLimit(`signup:${clientIp(req)}`, 8, 60_000)) {
      return NextResponse.json({ ok: false, error: 'สมัครถี่เกินไป ลองใหม่ในอีกสักครู่' }, { status: 429 });
    }
    const { email, password, consent } = await req.json();
    const mail = String(email || '').trim().toLowerCase();
    if (!validEmail(mail)) return NextResponse.json({ ok: false, error: 'รูปแบบอีเมลไม่ถูกต้อง' }, { status: 400 });

    const created = await createUser(mail, String(password || ''), !!consent);
    if (!created.ok) return NextResponse.json({ ok: false, error: created.error }, { status: 400 });

    // โหมดพับ OTP (ค่าเริ่มต้น): สมัครแล้วเข้าใช้งานได้เลย — ออก session ทันที
    if (!REQUIRE_EMAIL_VERIFY) {
      const token = await createSession(mail);
      const res = NextResponse.json({ ok: true, email: mail, role: created.user?.role || 'user' });
      res.cookies.set(SESSION_COOKIE, token, sessionCookieOptions());
      return res;
    }

    // โหมดยืนยันอีเมล: ออกรหัส OTP แล้วส่งอีเมล — ยังไม่ให้ session จนกว่าจะยืนยัน
    const otp = await issueOtp(mail);
    if ('error' in otp) return NextResponse.json({ ok: false, error: otp.error }, { status: 429 });
    const res = await sendOtpEmail(mail, otp.code);

    if (!res.sent) {
      console.error(`[OTP] สมัครบัญชีแล้วแต่ส่งอีเมลไม่สำเร็จ -> ${mail}: ${res.error || 'mail provider is not configured'}`);
      return NextResponse.json(
        { ok: false, error: 'ยังส่งรหัสยืนยันไม่ได้ กรุณาลองใหม่อีกครั้งภายหลัง' },
        { status: 503 },
      );
    }

    return NextResponse.json({
      ok: true,
      needVerify: true,
      email: mail,
      emailSent: res.sent,
      mailConfigured: mailConfigured(),
      note: 'ส่งรหัสยืนยันไปที่อีเมลแล้ว (เช็คกล่องสแปมด้วยนะ)',
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
