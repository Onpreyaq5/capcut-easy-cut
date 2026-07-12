import { NextRequest, NextResponse } from 'next/server';
import { issueOtp, listUsers, rateLimit, clientIp } from '@/lib/authStore';
import { sendOtpEmail, smtpConfigured } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ขอรหัส OTP ใหม่ (เฉพาะบัญชีที่ยังไม่ยืนยัน)
export async function POST(req: NextRequest) {
  try {
    if (!rateLimit(`resend:${clientIp(req)}`, 5, 60_000)) {
      return NextResponse.json({ ok: false, error: 'ขอรหัสถี่เกินไป รอสักครู่' }, { status: 429 });
    }
    const { email } = await req.json();
    const mail = String(email || '').trim().toLowerCase();
    const user = (await listUsers()).find((u) => u.email === mail);
    // ตอบเหมือนกันไม่ว่ามีบัญชีหรือไม่ (กันคนสุ่มเดาว่าอีเมลไหนสมัครไว้)
    if (user && !user.verified) {
      const otp = await issueOtp(mail);
      if ('error' in otp) return NextResponse.json({ ok: false, error: otp.error }, { status: 429 });
      await sendOtpEmail(mail, otp.code);
    }
    return NextResponse.json({ ok: true, smtpConfigured: smtpConfigured() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
