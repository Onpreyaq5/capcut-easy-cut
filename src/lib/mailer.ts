// ส่งอีเมลรหัสยืนยัน (OTP) ผ่าน SMTP
// ตั้งค่าใน .env.local:  EASYCUT_SMTP_HOST, EASYCUT_SMTP_PORT, EASYCUT_SMTP_USER, EASYCUT_SMTP_PASS, EASYCUT_MAIL_FROM
// (เช่น Gmail: HOST=smtp.gmail.com PORT=465 USER=อีเมลคุณ PASS=App Password 16 หลัก)
import nodemailer from 'nodemailer';

export function smtpConfigured(): boolean {
  return !!(process.env.EASYCUT_SMTP_HOST && process.env.EASYCUT_SMTP_USER && process.env.EASYCUT_SMTP_PASS);
}

// Resend (resend.com) — ตั้งง่ายกว่า SMTP มาก: แค่ RESEND_API_KEY ตัวเดียว (ฟรี 100 ฉบับ/วัน)
export function resendConfigured(): boolean {
  return !!process.env.RESEND_API_KEY;
}

// มีช่องทางส่งอีเมลจริงอย่างน้อย 1 ทางไหม
export function mailConfigured(): boolean {
  return smtpConfigured() || resendConfigured();
}

async function sendViaResend(to: string, code: string): Promise<{ sent: boolean; error?: string }> {
  try {
    const from = process.env.EASYCUT_MAIL_FROM || 'CAPCUT Easy CUT <onboarding@resend.dev>';
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `รหัสยืนยันอีเมล: ${code}`,
        text: `รหัสยืนยันของคุณคือ ${code}\nรหัสนี้ใช้ได้ภายใน 10 นาที\n\nหากคุณไม่ได้สมัคร CAPCUT Easy CUT กรุณาละเว้นอีเมลนี้`,
        html: `<div style="font-family:sans-serif;max-width:420px;margin:auto">
          <h2 style="color:#3b82f6">CAPCUT Easy CUT</h2>
          <p>รหัสยืนยันอีเมลของคุณคือ</p>
          <div style="font-size:32px;font-weight:800;letter-spacing:6px;background:#f4f4fb;border-radius:12px;padding:16px;text-align:center;color:#111">${code}</div>
          <p style="color:#666;font-size:13px">รหัสนี้ใช้ได้ภายใน 10 นาที · หากคุณไม่ได้สมัคร กรุณาละเว้นอีเมลนี้</p>
        </div>`,
      }),
    });
    if (!r.ok) {
      const t = await r.text().catch(() => '');
      return { sent: false, error: `Resend ส่งไม่สำเร็จ (${r.status}) ${t.slice(0, 150)}` };
    }
    return { sent: true };
  } catch (e) {
    return { sent: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function sendOtpEmail(to: string, code: string): Promise<{ sent: boolean; error?: string }> {
  // ลำดับ: Resend (ง่ายสุด) -> SMTP -> ไม่มีทั้งคู่ = log ในคอนโซลเซิร์ฟเวอร์ (ไม่ส่งไป client เด็ดขาด)
  if (resendConfigured()) return sendViaResend(to, code);
  if (!smtpConfigured()) {
    console.log(`\n[OTP] ยังไม่ได้ตั้งระบบอีเมล — รหัสยืนยันสำหรับ ${to} คือ: ${code}\n(ตั้ง RESEND_API_KEY หรือ EASYCUT_SMTP_* เพื่อส่งอีเมลจริง — หรือให้แอดมินกดยืนยันในหลังบ้าน)\n`);
    return { sent: false };
  }
  try {
    const port = Number(process.env.EASYCUT_SMTP_PORT || 465);
    // App Password ของ Gmail เป็น 16 ตัวไม่มีช่องว่าง — ตัดช่องว่าง/ขึ้นบรรทัด/แท็บที่หลุดติดมาออกให้หมด
    // (กันเคสวางรหัสมาแล้วมีเว้นวรรค "xxxx xxxx xxxx xxxx" ทำให้ login ไม่ผ่าน)
    const smtpPass = (process.env.EASYCUT_SMTP_PASS || '').replace(/\s+/g, '');
    const smtpUser = (process.env.EASYCUT_SMTP_USER || '').trim();
    const transporter = nodemailer.createTransport({
      host: (process.env.EASYCUT_SMTP_HOST || '').trim(),
      port,
      secure: port === 465, // 465 = SSL, 587 = STARTTLS
      auth: { user: smtpUser, pass: smtpPass },
    });
    const from = (process.env.EASYCUT_MAIL_FROM || process.env.EASYCUT_SMTP_USER || '').trim();
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
    console.log(`[OTP] ส่งอีเมลสำเร็จผ่าน SMTP -> ${to}`);
    return { sent: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // log ออกมาให้เห็นสาเหตุจริง (เช่น 535 auth ไม่ผ่าน = App Password ผิด) — ไม่ส่ง error ไปหา client
    console.error(`[OTP] ส่งอีเมลไม่สำเร็จ (SMTP) -> ${to}: ${msg}`);
    return { sent: false, error: msg };
  }
}
