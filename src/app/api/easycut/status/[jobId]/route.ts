import { NextRequest, NextResponse } from 'next/server';
import { getJob, publicStatus } from '@/lib/easycutJobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest, { params }: { params: { jobId: string } }) {
  const job = getJob(params.jobId);
  if (!job) {
    return NextResponse.json({ ok: false, error: 'ไม่พบงานนี้ (อาจหมดอายุหรือรีสตาร์ตเซิร์ฟเวอร์)' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...publicStatus(job) }, { headers: { 'Cache-Control': 'no-store' } });
}
