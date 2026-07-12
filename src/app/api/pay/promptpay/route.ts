import { NextRequest, NextResponse } from 'next/server';
import QRCode from 'qrcode';
import { getSessionUser } from '@/lib/authStore';
import { promptPayPayload, promptPayConfigured, promptPayInfo } from '@/lib/promptpay';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// ราคาแพ็กเกจ (ต้องตรงกับ planInfo.ts ฝั่งหน้าเว็บ)
const PRICES: Record<string, number> = { pro: 159, studio: 449 };

// สร้าง QR พร้อมเพย์ (EMVCo) สำหรับจ่ายค่าแพ็กเกจ — ลูกค้าสแกนโอนเข้าบัญชีเจ้าของเว็บ
// การเปิดแพ็กเกจยังเป็นขั้นตอนแอดมินยืนยัน (ดูสลิปแล้วกดอัปเกรดในหลังบ้าน)
export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อน' }, { status: 401 });
  if (!promptPayConfigured()) {
    return NextResponse.json({ ok: false, error: 'ผู้ดูแลยังไม่ได้ตั้งค่าบัญชีพร้อมเพย์ (EASYCUT_PROMPTPAY_ID)' }, { status: 503 });
  }
  const plan = (req.nextUrl.searchParams.get('plan') || 'pro').toLowerCase();
  const amount = PRICES[plan];
  if (!amount) return NextResponse.json({ ok: false, error: 'แพ็กเกจไม่ถูกต้อง' }, { status: 400 });

  const { id, name } = promptPayInfo();
  const payload = promptPayPayload(id, amount);
  const qr = await QRCode.toDataURL(payload, { width: 480, margin: 2 });
  return NextResponse.json({ ok: true, plan, amount, name, qr });
}
