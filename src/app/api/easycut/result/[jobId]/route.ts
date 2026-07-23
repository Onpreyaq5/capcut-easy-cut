import { NextRequest } from 'next/server';
import { Readable } from 'node:stream';
import { getJob, openResultStream } from '@/lib/easycutJobs';
import { getSessionUser } from '@/lib/authStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

export async function GET(req: NextRequest, { params }: { params: Promise<{ jobId: string }> }) {
  const user = await getSessionUser(req);
  if (!user) return new Response('กรุณาเข้าสู่ระบบก่อนใช้งาน', { status: 401 });
  const { jobId } = await params;
  const job = await getJob(jobId);
  if (!job) return new Response('ไม่พบงานนี้', { status: 404 });
  if (job.ownerEmail !== user.email && user.role !== 'owner') return new Response('ไม่มีสิทธิ์เข้าถึงงานนี้', { status: 403 });
  if (job.status !== 'done' || !job.zipPath) return new Response('งานยังไม่เสร็จ', { status: 409 });

  const opened = openResultStream(job);
  if (!opened) return new Response('ไม่พบไฟล์ผลลัพธ์', { status: 404 });

  // สตรีมจากดิสก์ตรง ๆ (ไม่โหลด ZIP ทั้งก้อนเข้า RAM)
  const webStream = Readable.toWeb(opened.stream) as unknown as ReadableStream;
  // ชื่อไฟล์อาจเป็นภาษาไทย (ผู้ใช้ตั้งชื่อโปรเจกต์เอง) — header ต้องเป็น ASCII เท่านั้น (ByteString)
  // ไม่งั้น Response() จะ throw ("Cannot convert argument to a ByteString") ทำให้ดาวน์โหลดล้มเหลวทั้งก้อน
  // จึงส่งชื่อ ASCII สำรองคู่กับ filename* (RFC 5987) ที่เข้ารหัส UTF-8 ให้เบราว์เซอร์ใช้ชื่อจริงได้
  const asciiFallback = opened.name.replace(/[^\x20-\x7E]/g, '_') || 'download.zip';
  return new Response(webStream, {
    status: 200,
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodeURIComponent(opened.name)}`,
      'Cache-Control': 'no-store',
    },
  });
}
