import { NextResponse } from 'next/server';
import { capabilities } from '@/lib/platform';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// บอกหน้าเว็บว่าเซิร์ฟเวอร์นี้ทำอะไรได้บ้าง (เครื่องผู้ใช้ vs คลาวด์)
// เพื่อซ่อน/ปิดปุ่มที่ใช้ไม่ได้ แทนที่จะปล่อยให้ผู้ใช้อัปคลิปแล้วพัง
export async function GET() {
  return NextResponse.json({ ok: true, ...capabilities() });
}
