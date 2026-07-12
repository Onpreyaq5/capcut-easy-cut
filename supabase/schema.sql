-- ===== ตาราง Supabase สำหรับ CAPCUT Easy CUT (ระบบสมาชิก + โควตา) =====
-- วิธีใช้: เปิด Supabase -> โปรเจกต์ -> SQL Editor -> วางทั้งหมดนี้ -> กด Run
-- เก็บ users / sessions / otps เป็น JSON ในตาราง kv เดียว (เว็บอ่าน/เขียนผ่าน service key)

create table if not exists kv (
  key        text primary key,          -- 'users' | 'sessions' | 'otps'
  value      jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- เปิด Row Level Security แต่ไม่ตั้ง policy ใด ๆ
-- => ฝั่งเว็บใช้ service_role key (ข้าม RLS ได้) ส่วนคนอื่นเข้าถึงตารางนี้ตรง ๆ ไม่ได้ (ปลอดภัย)
alter table kv enable row level security;
