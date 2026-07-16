import { NextRequest, NextResponse } from 'next/server';
import { cancelJob, getJob } from '@/lib/easycutJobs';
import { getSessionUser } from '@/lib/authStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, { status: 401 });
  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job) return NextResponse.json({ ok: false, error: 'ไม่พบงานนี้' }, { status: 404 });
  if (job.ownerEmail !== user.email && user.role !== 'owner') {
    return NextResponse.json({ ok: false, error: 'ไม่มีสิทธิ์เข้าถึงงานนี้' }, { status: 403 });
  }
  const ok = await cancelJob(jobId);
  if (!ok) return NextResponse.json({ ok: false, error: 'ไม่พบงานนี้' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
