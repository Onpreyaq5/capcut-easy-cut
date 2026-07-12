// สร้างบัญชีแอดมิน DEMO (ยืนยันอีเมลแล้ว role owner) — login เข้าหลังบ้านได้ทันทีไม่ต้องรอ OTP
// รัน:  node scripts/seed-admin.mjs  [email]  [password]
// ค่าเริ่มต้น: admin@demo.com / demo1234
import { randomBytes, scryptSync } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const EMAIL = (process.argv[2] || 'admin@demo.com').trim().toLowerCase();
const PASSWORD = process.argv[3] || 'demo1234';

const DATA_DIR = path.resolve(process.cwd(), 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

const hashSecret = (secret, salt) => scryptSync(secret, salt, 64).toString('hex');

async function main() {
  await fs.mkdir(DATA_DIR, { recursive: true });
  let users = [];
  try {
    users = JSON.parse(await fs.readFile(USERS_FILE, 'utf8'));
  } catch {
    users = [];
  }

  const salt = randomBytes(16).toString('hex');
  const now = new Date().toISOString();
  const rec = {
    email: EMAIL,
    salt,
    hash: hashSecret(PASSWORD, salt),
    role: 'owner',       // เข้าหลังบ้าน /admin ได้
    consent: false,
    verified: true,      // ยืนยันแล้ว -> ไม่ต้องรอ OTP
    createdAt: now,
    loginCount: 0,
    lastLoginAt: '',
  };

  const idx = users.findIndex((u) => u.email === EMAIL);
  if (idx >= 0) users[idx] = { ...users[idx], ...rec };
  else users.push(rec);

  await fs.writeFile(USERS_FILE, JSON.stringify(users, null, 2), 'utf8');
  console.log('สร้างบัญชีแอดมิน DEMO แล้ว');
  console.log('  อีเมล   :', EMAIL);
  console.log('  รหัสผ่าน:', PASSWORD);
  console.log('  role    : owner (เข้า /admin ได้)');
}

main().catch((e) => {
  console.error('ผิดพลาด:', e);
  process.exit(1);
});
