// ระบบสมาชิก (server-side): เก็บ users/sessions/otps เป็นไฟล์ JSON ใน data/
// ความปลอดภัย:
// - รหัสผ่าน hash ด้วย scrypt + salt (ไม่เก็บ plain text)
// - ยืนยันอีเมลจริงด้วยรหัส OTP 6 หลัก (กันอีเมลปลอม / สมัครมั่ว) — ใช้ฟังก์ชันไม่ได้จนกว่าจะยืนยัน
// - เขียนไฟล์แบบ atomic + คิว (mutex) กัน race condition ตอนหลายคนสมัคร/ล็อกอินพร้อมกัน
// - rate limit กัน brute-force รหัสผ่าน + สแปมส่ง OTP
import { randomBytes, randomInt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { NextRequest } from 'next/server';

export type Plan = 'free' | 'pro' | 'studio';

// ลิมิตต่อแพ็กเกจ (freemium) — วินาที/เดือน, ความละเอียดสูงสุด, ลายน้ำ
export interface PlanLimit { label: string; secondsPerMonth: number; maxHeight: number; watermark: boolean; capcutZip: boolean; }
export const PLAN_LIMITS: Record<Plan, PlanLimit> = {
  free:   { label: 'Free',   secondsPerMonth: 10 * 60,  maxHeight: 720,  watermark: true,  capcutZip: false },
  pro:    { label: 'Pro',    secondsPerMonth: 120 * 60, maxHeight: 1080, watermark: false, capcutZip: true  },
  studio: { label: 'Studio', secondsPerMonth: 500 * 60, maxHeight: 2160, watermark: false, capcutZip: true  },
};

export interface UserRec {
  email: string;
  hash: string;
  salt: string;
  role: 'owner' | 'user';
  consent: boolean;
  verified: boolean;      // ยืนยันอีเมลแล้วหรือยัง — false = ยังใช้ฟังก์ชันไม่ได้
  createdAt: string;
  loginCount: number;
  lastLoginAt: string;
  plan?: Plan;            // แพ็กเกจ (default free) — owner ถือเป็น studio เสมอ
  usedSeconds?: number;   // วินาทีที่ใช้เรนเดอร์/ถอดเสียงในเดือนนี้
  usageMonth?: string;    // เดือนของ usedSeconds (YYYY-MM) — เปลี่ยนเดือน = รีเซ็ต
}

// แพ็กเกจจริงที่มีผล (owner = studio เสมอ)
export function effectivePlan(u: UserRec): Plan {
  return u.role === 'owner' ? 'studio' : (u.plan || 'free');
}

function monthKey(): string {
  // YYYY-MM จาก ISO (เลี่ยง Date locale) — ใช้ substring ของ toISOString
  return new Date().toISOString().slice(0, 7);
}

// โควตาที่เหลือของ user (รีเซ็ตอัตโนมัติเมื่อขึ้นเดือนใหม่)
export function quotaOf(u: UserRec): { plan: Plan; limit: PlanLimit; usedSeconds: number; remainingSeconds: number } {
  const plan = effectivePlan(u);
  const limit = PLAN_LIMITS[plan];
  const used = u.usageMonth === monthKey() ? (u.usedSeconds || 0) : 0;
  return { plan, limit, usedSeconds: used, remainingSeconds: Math.max(0, limit.secondsPerMonth - used) };
}

/** เพิ่มการใช้งาน (วินาที) หลังเรนเดอร์/ถอดเสียงสำเร็จ — รีเซ็ตยอดเมื่อขึ้นเดือนใหม่ */
export async function addUsage(email: string, seconds: number): Promise<void> {
  email = email.trim().toLowerCase();
  await withLock(USERS_FILE, async () => {
    const users = await readJson<UserRec[]>(USERS_FILE, []);
    const u = users.find((x) => x.email === email);
    if (!u) return;
    const mk = monthKey();
    if (u.usageMonth !== mk) { u.usageMonth = mk; u.usedSeconds = 0; }
    u.usedSeconds = (u.usedSeconds || 0) + Math.max(0, Math.round(seconds));
    await writeJsonAtomic(USERS_FILE, users);
  });
}

/** ตั้งแพ็กเกจให้ user (ใช้ตอนสมัคร Pro สำเร็จ / แอดมินปรับ) */
export async function setPlan(email: string, plan: Plan): Promise<boolean> {
  email = email.trim().toLowerCase();
  return withLock(USERS_FILE, async () => {
    const users = await readJson<UserRec[]>(USERS_FILE, []);
    const u = users.find((x) => x.email === email);
    if (!u) return false;
    u.plan = plan;
    await writeJsonAtomic(USERS_FILE, users);
    return true;
  });
}

interface SessionRec {
  email: string;
  exp: number;
}

interface OtpRec {
  hash: string;           // hash ของรหัส OTP (ไม่เก็บตัวเลขตรง ๆ)
  salt: string;
  exp: number;            // หมดอายุ (epoch ms)
  attempts: number;       // ใส่ผิดกี่ครั้ง (เกิน 5 = ต้องขอใหม่)
  lastSentAt: number;     // กันสแปมกดส่งซ้ำ
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESS_FILE = path.join(DATA_DIR, 'sessions.json');
const OTP_FILE = path.join(DATA_DIR, 'otps.json');
export const SESSION_COOKIE = 'ec_session';
const SESSION_DAYS = 30;
const OTP_TTL_MS = 10 * 60_000;       // รหัส OTP อยู่ได้ 10 นาที
const OTP_RESEND_MS = 60_000;         // ขอรหัสใหม่ได้ทุก 60 วินาที
const OTP_MAX_ATTEMPTS = 5;

// ---------- atomic write + mutex กัน race condition ----------
const locks = new Map<string, Promise<unknown>>();
// ทำงานกับไฟล์แบบต่อคิว: อ่าน-แก้-เขียน ของไฟล์เดียวกันจะไม่ทับกัน
async function withLock<T>(file: string, fn: () => Promise<T>): Promise<T> {
  const prev = locks.get(file) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((r) => (release = r));
  locks.set(file, prev.then(() => next));
  try {
    await prev;
    return await fn();
  } finally {
    release();
    if (locks.get(file) === next) locks.delete(file);
  }
}

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

// เขียนแบบ atomic: เขียนไฟล์ชั่วคราวแล้ว rename (กันไฟล์พังถ้าดับกลางคัน)
async function writeJsonAtomic(file: string, data: unknown) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const tmp = `${file}.${randomBytes(6).toString('hex')}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), 'utf8');
  await fs.rename(tmp, file);
}

export async function listUsers(): Promise<UserRec[]> {
  return readJson<UserRec[]>(USERS_FILE, []);
}

function hashSecret(secret: string, salt: string): string {
  return scryptSync(secret, salt, 64).toString('hex');
}

function safeEqualHex(aHex: string, bHex: string): boolean {
  const a = Buffer.from(aHex, 'hex');
  const b = Buffer.from(bHex, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

// ---------- rate limit (in-memory) ----------
const hits = new Map<string, { n: number; reset: number }>();
export function rateLimit(key: string, max: number, windowMs: number): boolean {
  const now = Date.now();
  const rec = hits.get(key);
  if (!rec || rec.reset < now) {
    hits.set(key, { n: 1, reset: now + windowMs });
    return true;
  }
  if (rec.n >= max) return false;
  rec.n += 1;
  return true;
}

export function clientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'local'
  );
}

// ---------- OTP ----------
function genOtp(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}

/** สร้าง/รีเฟรช OTP ให้อีเมล — คืนรหัส (ไว้ส่งอีเมล) หรือ null ถ้าเพิ่งส่งไป (กันสแปม) */
export async function issueOtp(email: string): Promise<{ code: string } | { error: string }> {
  email = email.trim().toLowerCase();
  return withLock(OTP_FILE, async () => {
    const all = await readJson<Record<string, OtpRec>>(OTP_FILE, {});
    const now = Date.now();
    const existing = all[email];
    if (existing && now - existing.lastSentAt < OTP_RESEND_MS) {
      const wait = Math.ceil((OTP_RESEND_MS - (now - existing.lastSentAt)) / 1000);
      return { error: `กรุณารอ ${wait} วินาทีก่อนขอรหัสใหม่` };
    }
    const code = genOtp();
    const salt = randomBytes(16).toString('hex');
    all[email] = { hash: hashSecret(code, salt), salt, exp: now + OTP_TTL_MS, attempts: 0, lastSentAt: now };
    await writeJsonAtomic(OTP_FILE, all);
    return { code };
  });
}

/** ตรวจรหัส OTP — ถูก: ลบ OTP + set user.verified=true + คืน user */
export async function confirmOtp(email: string, code: string): Promise<{ ok: boolean; error?: string; user?: UserRec }> {
  email = email.trim().toLowerCase();
  const otpRes = await withLock(OTP_FILE, async () => {
    const all = await readJson<Record<string, OtpRec>>(OTP_FILE, {});
    const rec = all[email];
    if (!rec) return { ok: false as const, error: 'ยังไม่ได้ขอรหัส หรือรหัสหมดอายุแล้ว — กดขอรหัสใหม่' };
    if (Date.now() > rec.exp) {
      delete all[email];
      await writeJsonAtomic(OTP_FILE, all);
      return { ok: false as const, error: 'รหัสหมดอายุแล้ว — กดขอรหัสใหม่' };
    }
    if (rec.attempts >= OTP_MAX_ATTEMPTS) {
      delete all[email];
      await writeJsonAtomic(OTP_FILE, all);
      return { ok: false as const, error: 'ใส่รหัสผิดเกินกำหนด — กดขอรหัสใหม่' };
    }
    if (!safeEqualHex(hashSecret(String(code || ''), rec.salt), rec.hash)) {
      rec.attempts += 1;
      await writeJsonAtomic(OTP_FILE, all);
      return { ok: false as const, error: `รหัสไม่ถูกต้อง (เหลือ ${OTP_MAX_ATTEMPTS - rec.attempts} ครั้ง)` };
    }
    delete all[email];
    await writeJsonAtomic(OTP_FILE, all);
    return { ok: true as const };
  });
  if (!otpRes.ok) return otpRes;

  return withLock(USERS_FILE, async () => {
    const users = await readJson<UserRec[]>(USERS_FILE, []);
    const user = users.find((u) => u.email === email);
    if (!user) return { ok: false, error: 'ไม่พบบัญชี' };
    user.verified = true;
    user.loginCount += 1;
    user.lastLoginAt = new Date().toISOString();
    await writeJsonAtomic(USERS_FILE, users);
    return { ok: true, user };
  });
}

// ---------- users ----------
export async function createUser(
  email: string,
  password: string,
  consent: boolean,
): Promise<{ ok: boolean; error?: string; user?: UserRec; reused?: boolean }> {
  email = email.trim().toLowerCase();
  if (!validEmail(email)) return { ok: false, error: 'รูปแบบอีเมลไม่ถูกต้อง' };
  if ((password || '').length < 6) return { ok: false, error: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' };
  return withLock(USERS_FILE, async () => {
    const users = await readJson<UserRec[]>(USERS_FILE, []);
    const existing = users.find((u) => u.email === email);
    if (existing) {
      if (existing.verified) return { ok: false, error: 'อีเมลนี้สมัครไว้แล้ว — กด "เข้าสู่ระบบ"' };
      // สมัครค้างไว้ยังไม่ยืนยัน -> อัปเดตรหัสผ่าน/consent แล้วให้ขอ OTP ใหม่ได้
      existing.salt = randomBytes(16).toString('hex');
      existing.hash = hashSecret(password, existing.salt);
      existing.consent = !!consent;
      await writeJsonAtomic(USERS_FILE, users);
      return { ok: true, user: existing, reused: true };
    }
    const salt = randomBytes(16).toString('hex');
    const user: UserRec = {
      email,
      salt,
      hash: hashSecret(password, salt),
      role: users.some((u) => u.verified) ? 'user' : 'owner', // เจ้าของ = คน "ยืนยันแล้ว" คนแรก
      consent: !!consent,
      verified: false,
      createdAt: new Date().toISOString(),
      loginCount: 0,
      lastLoginAt: '',
    };
    users.push(user);
    await writeJsonAtomic(USERS_FILE, users);
    return { ok: true, user };
  });
}

export async function verifyLogin(
  email: string,
  password: string,
): Promise<{ ok: boolean; error?: string; user?: UserRec; needVerify?: boolean }> {
  email = email.trim().toLowerCase();
  return withLock(USERS_FILE, async () => {
    const users = await readJson<UserRec[]>(USERS_FILE, []);
    const user = users.find((u) => u.email === email);
    if (!user) return { ok: false, error: 'ไม่พบอีเมลนี้ — กด "สมัครใช้งาน" ก่อน' };
    if (!safeEqualHex(hashSecret(password || '', user.salt), user.hash)) {
      return { ok: false, error: 'รหัสผ่านไม่ถูกต้อง' };
    }
    if (!user.verified) {
      return { ok: false, needVerify: true, error: 'บัญชีนี้ยังไม่ได้ยืนยันอีเมล — กรุณายืนยันด้วยรหัสที่ส่งไปทางอีเมล' };
    }
    user.loginCount += 1;
    user.lastLoginAt = new Date().toISOString();
    await writeJsonAtomic(USERS_FILE, users);
    return { ok: true, user };
  });
}

// ---------- sessions ----------
export async function createSession(email: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  await withLock(SESS_FILE, async () => {
    const all = await readJson<Record<string, SessionRec>>(SESS_FILE, {});
    const now = Date.now();
    for (const k of Object.keys(all)) if (all[k].exp < now) delete all[k];
    all[token] = { email, exp: now + SESSION_DAYS * 86400_000 };
    await writeJsonAtomic(SESS_FILE, all);
  });
  return token;
}

export async function destroySession(token: string) {
  await withLock(SESS_FILE, async () => {
    const all = await readJson<Record<string, SessionRec>>(SESS_FILE, {});
    if (all[token]) {
      delete all[token];
      await writeJsonAtomic(SESS_FILE, all);
    }
  });
}

/** อ่าน session -> user (ต้องยืนยันอีเมลแล้ว) — ใช้ล็อกทุก API ที่ต้อง login */
export async function getSessionUser(req: NextRequest): Promise<UserRec | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const all = await readJson<Record<string, SessionRec>>(SESS_FILE, {});
  const sess = all[token];
  if (!sess || sess.exp < Date.now()) return null;
  const users = await listUsers();
  const user = users.find((u) => u.email === sess.email) || null;
  if (!user || !user.verified) return null; // ยังไม่ยืนยัน = ถือว่าไม่มีสิทธิ์
  return user;
}

export function sessionCookieOptions() {
  return {
    httpOnly: true,
    sameSite: 'lax' as const,
    path: '/',
    maxAge: SESSION_DAYS * 86400,
    secure: process.env.NODE_ENV === 'production', // บังคับ HTTPS ตอน deploy จริง
  };
}
