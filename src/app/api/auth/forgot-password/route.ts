import { NextRequest, NextResponse } from 'next/server';
import { clientIp, issuePasswordResetOtp, rateLimit, validEmail } from '@/lib/authStore';
import { sendOtpEmail } from '@/lib/mailer';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  if (!rateLimit(`forgot:${clientIp(req)}`, 5, 60_000)) return NextResponse.json({ ok: false, error: 'ลองใหม่ภายหลัง' }, { status: 429 });
  const { email } = await req.json();
  const mail = String(email || '').trim().toLowerCase();
  if (validEmail(mail)) {
    const issued = await issuePasswordResetOtp(mail);
    if (issued.code) await sendOtpEmail(mail, issued.code);
  }
  return NextResponse.json({ ok: true, note: 'หากอีเมลนี้มีบัญชี ระบบได้ส่งรหัสยืนยันให้แล้ว' });
}
