import { quotaOf, type UserRec } from './authStore';

export type AccessFailure = {
  ok: false;
  status: 402 | 403;
  code: 'quota' | 'plan';
  error: string;
};

export type AccessSuccess = {
  ok: true;
  quota: ReturnType<typeof quotaOf>;
};

/** ตรวจสิทธิ์งานประมวลผลที่คิดตามนาทีของแพ็กเกจ */
export function processingAccess(user: UserRec): AccessSuccess | AccessFailure {
  const quota = quotaOf(user);
  if (quota.remainingSeconds <= 0) {
    return {
      ok: false,
      status: 402,
      code: 'quota',
      error: `ใช้โควตาแพ็กเกจ ${quota.limit.label} ครบเดือนนี้แล้ว — อัปเกรดแพ็กเกจเพื่อใช้งานต่อ`,
    };
  }
  return { ok: true, quota };
}

/** การสร้าง/ดาวน์โหลด CapCut Draft เป็นสิทธิ์ Pro ขึ้นไป */
export function capcutAccess(user: UserRec): AccessSuccess | AccessFailure {
  const base = processingAccess(user);
  if (!base.ok) return base;
  if (!base.quota.limit.capcutZip) {
    return {
      ok: false,
      status: 403,
      code: 'plan',
      error: 'การสร้างโปรเจกต์ CapCut ใช้ได้ในแพ็กเกจ Pro หรือ Studio',
    };
  }
  return base;
}

