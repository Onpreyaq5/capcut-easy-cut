import { NextRequest } from 'next/server';
import { Readable } from 'node:stream';
import { getJob, openResultStream } from '@/lib/easycutJobs';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(_req: NextRequest, { params }: { params: { jobId: string } }) {
  const job = getJob(params.jobId);
  if (!job) return new Response('ไม่พบงานนี้', { status: 404 });
  if (job.status !== 'done' || !job.zipPath) return new Response('งานยังไม่เสร็จ', { status: 409 });

  const opened = openResultStream(params.jobId);
  if (!opened) return new Response('ไม่พบไฟล์ผลลัพธ์', { status: 404 });

  // สตรีมจากดิสก์ตรง ๆ (ไม่โหลด ZIP ทั้งก้อนเข้า RAM)
  const webStream = Readable.toWeb(opened.stream) as unknown as ReadableStream;
  return new Response(webStream, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${opened.name}"`,
      'Cache-Control': 'no-store',
    },
  });
}
