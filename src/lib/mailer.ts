// ส่งอีเมลรหัสยืนยัน (OTP) ผ่าน SMTP
// ตั้งค่าใน .env.local:  EASYCUT_SMTP_HOST, EASYCUT_SMTP_PORT, EASYCUT_SMTP_USER, EASYCUT_SMTP_PASS, EASYCUT_MAIL_FROM
// (เช่น Gmail: HOST=smtp.gmail.com PORT=465 USER=อีเมลคุณ PASS=App Password 16 หลัก)
import nodemailer from 'nodemailer';

export function smtpConfigured(): boolean {
  return !!(process.env.EASYCUT_SMTP_HOST && process.env.EASYCUT_SMTP_USER && process.env.EASYCUT_SMTP_PASS);
}

export async function sendOtpEmail(to: string, code: string): Promise<{ sent: boolean; error?: string }> {
  // ยังไม่ได้ตั้ง SMTP: log รหัสในคอนโซลเซิร์ฟเวอร์ (เจ้าของเครื่องเห็นได้) — ไม่ส่งออกไปที่ client เด็ดขาด
  if (!smtpConfigured()) {
    console.log(`\n[OTP] ยังไม่ได้ตั้ง SMTP — รหัสยืนยันสำหรับ ${to} คือ: ${code}\n(ตั้ง EASYCUT_SMTP_* ใน .env.local เพื่อส่งอีเมลจริง)\n`);
    return { sent: false };
  }
  try {
    const port = Number(process.env.EASYCUT_SMTP_PORT || 465);
    const transporter = nodemailer.createTransport({
      host: process.env.EASYCUT_SMTP_HOST,
      port,
      secure: port === 465, // 465 = SSL, 587 = STARTTLS
      auth: { user: process.env.EASYCUT_SMTP_USER, pass: process.env.EASYCUT_SMTP_PASS },
    });
    const from = process.env.EASYCUT_MAIL_FROM || process.env.EASYCUT_SMTP_USER;
    await transporter.sendMail({
      from: `CAPCUT Easy CUT <${from}>`,
      to,
      subject: `รหัสยืนยันอีเมล: ${code}`,
      text: `รหัสยืนยันของคุณคือ ${code}\nรหัสนี้ใช้ได้ภายใน 10 นาที\n\nหากคุณไม่ได้สมัคร CAPCUT Easy CUT กรุณาละเว้นอีเมลนี้`,
      html: `<div style="font-family:sans-serif;max-width:420px;margin:auto">
        <h2 style="color:#5b5bd6">CAPCUT Easy CUT</h2>
        <p>รหัสยืนยันอีเมลของคุณคือ</p>
        <div style="font-size:32px;font-weight:800;letter-spacing:6px;background:#f4f4fb;border-radius:12px;padding:16px;text-align:center;color:#111">${code}</div>
        <p style="color:#666;font-size:13px">รหัสนี้ใช้ได้ภายใน 10 นาที · หากคุณไม่ได้สมัคร กรุณาละเว้นอีเมลนี้</p>
      </div>`,
    });
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}
