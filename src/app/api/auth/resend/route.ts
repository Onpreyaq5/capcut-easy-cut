import { NextRequest, NextResponse } from 'next/server';
import { issueOtp, listUsers, rateLimit, clientIp } from '@/lib/authStore';
import { sendOtpEmail, mailConfigured } from '@/lib/mailer';

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
      const sent = await sendOtpEmail(mail, otp.code);
      if (!sent.sent) {
        console.error(`[OTP] ส่งรหัสใหม่ไม่สำเร็จ -> ${mail}: ${sent.error || 'mail provider is not configured'}`);
        return NextResponse.json(
          { ok: false, error: 'ยังส่งรหัสยืนยันไม่ได้ กรุณาลองใหม่อีกครั้งภายหลัง' },
          { status: 503 },
        );
      }
    }
    return NextResponse.json({ ok: true, mailConfigured: mailConfigured() });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
