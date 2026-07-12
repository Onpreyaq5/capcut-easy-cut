// ระบบสมาชิก (server-side เท่านั้น): เก็บ users/sessions เป็นไฟล์ JSON ใน data/
// - รหัสผ่าน hash ด้วย scrypt + salt (ไม่เก็บ plain text เด็ดขาด)
// - เก็บสถิติไว้ทำการตลาด: จำนวนคนสมัคร, ยอด login, ยินยอมรับโปรโมชั่น (PDPA)
// - user คนแรกที่สมัคร = เจ้าของเว็บ (role "owner") เข้า /admin ได้
import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { NextRequest } from 'next/server';

export interface UserRec {
  email: string;
  hash: string;          // scrypt hex
  salt: string;
  role: 'owner' | 'user';
  consent: boolean;      // ยินยอมรับข่าวสาร/โปรโมชั่น
  createdAt: string;     // ISO
  loginCount: number;
  lastLoginAt: string;
}

interface SessionRec {
  email: string;
  exp: number; // epoch ms
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');
const SESS_FILE = path.join(DATA_DIR, 'sessions.json');
export const SESSION_COOKIE = 'ec_session';
const SESSION_DAYS = 30;

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(file: string, data: unknown) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  await fs.writeFile(file, JSON.stringify(data, null, 2), 'utf8');
}

export async function listUsers(): Promise<UserRec[]> {
  return readJson<UserRec[]>(USERS_FILE, []);
}

function hashPassword(password: string, salt: string): string {
  return scryptSync(password, salt, 64).toString('hex');
}

export function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email);
}

export async function createUser(email: string, password: string, consent: boolean): Promise<{ ok: boolean; error?: string; user?: UserRec }> {
  email = email.trim().toLowerCase();
  if (!validEmail(email)) return { ok: false, error: 'รูปแบบอีเมลไม่ถูกต้อง' };
  if ((password || '').length < 6) return { ok: false, error: 'รหัสผ่านต้องยาวอย่างน้อย 6 ตัวอักษร' };
  const users = await listUsers();
  if (users.some((u) => u.email === email)) return { ok: false, error: 'อีเมลนี้สมัครไว้แล้ว — กด "เข้าสู่ระบบ" ได้เลย' };
  const salt = randomBytes(16).toString('hex');
  const user: UserRec = {
    email,
    salt,
    hash: hashPassword(password, salt),
    role: users.length === 0 ? 'owner' : 'user',   // คนแรก = เจ้าของเว็บ
    consent: !!consent,
    createdAt: new Date().toISOString(),
    loginCount: 1,
    lastLoginAt: new Date().toISOString(),
  };
  users.push(user);
  await writeJson(USERS_FILE, users);
  return { ok: true, user };
}

export async function verifyLogin(email: string, password: string): Promise<{ ok: boolean; error?: string; user?: UserRec }> {
  email = email.trim().toLowerCase();
  const users = await listUsers();
  const user = users.find((u) => u.email === email);
  if (!user) return { ok: false, error: 'ไม่พบอีเมลนี้ — กด "สมัครใช้งาน" ก่อนนะ' };
  const got = Buffer.from(hashPassword(password || '', user.salt), 'hex');
  const want = Buffer.from(user.hash, 'hex');
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return { ok: false, error: 'รหัสผ่านไม่ถูกต้อง' };
  }
  user.loginCount += 1;
  user.lastLoginAt = new Date().toISOString();
  await writeJson(USERS_FILE, users);
  return { ok: true, user };
}

// ---------- sessions ----------
async function readSessions(): Promise<Record<string, SessionRec>> {
  const all = await readJson<Record<string, SessionRec>>(SESS_FILE, {});
  // เก็บกวาด session หมดอายุ
  const now = Date.now();
  let dirty = false;
  for (const k of Object.keys(all)) {
    if (all[k].exp < now) {
      delete all[k];
      dirty = true;
    }
  }
  if (dirty) await writeJson(SESS_FILE, all);
  return all;
}

export async function createSession(email: string): Promise<string> {
  const token = randomBytes(32).toString('hex');
  const all = await readSessions();
  all[token] = { email, exp: Date.now() + SESSION_DAYS * 86400_000 };
  await writeJson(SESS_FILE, all);
  return token;
}

export async function destroySession(token: string) {
  const all = await readSessions();
  if (all[token]) {
    delete all[token];
    await writeJson(SESS_FILE, all);
  }
}

/** อ่าน session จาก cookie ของ request — คืน user หรือ null (ใช้ล็อกทุก API ที่ต้อง login) */
export async function getSessionUser(req: NextRequest): Promise<UserRec | null> {
  const token = req.cookies.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const all = await readSessions();
  const sess = all[token];
  if (!sess || sess.exp < Date.now()) return null;
  const users = await listUsers();
  return users.find((u) => u.email === sess.email) || null;
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  path: '/',
  maxAge: SESSION_DAYS * 86400,
};
