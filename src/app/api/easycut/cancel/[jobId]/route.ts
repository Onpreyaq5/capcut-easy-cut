import { NextRequest, NextResponse } from 'next/server';
import { cancelJob } from '@/lib/easycutJobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(_req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = await params;
  const ok = cancelJob(jobId);
  if (!ok) return NextResponse.json({ ok: false, error: 'ไม่พบงานนี้' }, { status: 404 });
  return NextResponse.json({ ok: true });
}
