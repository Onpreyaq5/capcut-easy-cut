# CAPCUT Easy CUT

เว็บตัดคลิปอัตโนมัติสำหรับเอาคลิปดิบเข้า CapCut ให้เร็วขึ้น:

- ลากคลิปหลายไฟล์เข้าหน้าเว็บ
- วิเคราะห์เสียงจากคลิปด้วย `faster-whisper`
- ตัดช่วงเงียบ / Dead air ด้วย `ffmpeg`
- ถอดเสียงและสร้าง `subtitles.srt`
- ดาวน์โหลดแพ็กเกจ `.zip` ที่มีวิดีโอหลังตัด, ซับ, transcript และสรุปงาน
- หรือสร้าง draft ใน CapCut บนเครื่องโดยตรงด้วยเอนจิน `tools/capcut-auto`

## เปิดเว็บ

ดับเบิลคลิก:

```text
▶️ เปิดเว็บ CAPCUT Easy CUT.bat
```

หรือรันเอง:

```bash
npm install
npm run dev
```

แล้วเปิด `http://localhost:3000`

## ติดตั้งเอนจินตัดคลิปครั้งแรก

ฟีเจอร์ตัด Dead air / ถอดเสียงต้องมี Python และ ffmpeg:

```bash
winget install Gyan.FFmpeg
```

จากนั้นดับเบิลคลิก:

```text
tools/capcut-auto/⚙️ ติดตั้งครั้งแรก.bat
```

## โครงระบบหลัก

```text
src/app/page.tsx                    หน้าแรก CAPCUT Easy CUT
src/components/EasyCutTool.tsx      UI ลากคลิปและส่งออก
src/app/api/easycut/process/route.ts API สร้างแพ็กเกจ ZIP
tools/capcut-auto/process_easycut.py เอนจินตัด Dead air + ทำ SRT
tools/capcut-auto/build_capcut.py    เอนจินสร้างโปรเจกต์ CapCut โดยตรง
```
