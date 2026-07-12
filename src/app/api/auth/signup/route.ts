import { NextRequest, NextResponse } from 'next/server';
import { createUser, issueOtp, rateLimit, clientIp, validEmail } from '@/lib/authStore';
import { sendOtpEmail, smtpConfigured } from '@/lib/mailer';

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

    // ออกรหัส OTP แล้วส่งอีเมล — ยังไม่ให้ session จนกว่าจะยืนยัน
    const otp = await issueOtp(mail);
    if ('error' in otp) return NextResponse.json({ ok: false, error: otp.error }, { status: 429 });
    const res = await sendOtpEmail(mail, otp.code);

    return NextResponse.json({
      ok: true,
      needVerify: true,
      email: mail,
      emailSent: res.sent,
      smtpConfigured: smtpConfigured(),
      note: res.sent
        ? 'ส่งรหัสยืนยันไปที่อีเมลแล้ว'
        : 'ยังไม่ได้ตั้งค่าอีเมล (SMTP) — ดูรหัสยืนยันได้ในคอนโซลของเซิร์ฟเวอร์',
    });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
