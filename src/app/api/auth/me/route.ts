import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser, quotaOf } from '@/lib/authStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const user = await getSessionUser(req);
  if (!user) return NextResponse.json({ ok: false }, { status: 401 });
  const q = quotaOf(user);
  return NextResponse.json({
    ok: true,
    email: user.email,
    role: user.role,
    loginCount: user.loginCount,
    plan: q.plan,
    planLabel: q.limit.label,
    usedSeconds: q.usedSeconds,
    limitSeconds: q.limit.secondsPerMonth,
    remainingSeconds: q.remainingSeconds,
  });
}
