# CAPCUT Easy CUT

ลากคลิปดิบใส่เว็บ ตัด Dead air + ทำซับไทยอัตโนมัติ พร้อมส่งเข้า CapCut ให้ทันที — ไม่ต้องตัดต่อเอง

**แค่อยากใช้งาน (ไม่ต้องเขียนโค้ด)?** โหลดแพ็กเกจพร้อมใช้ + คู่มือฉบับเต็มได้ที่
👉 **[หน้า Release ล่าสุด](../../releases/latest)**

## ฟีเจอร์

- ลากคลิปหลายไฟล์เข้าหน้าเว็บ เรียงตามลำดับที่อัปโหลด
- วิเคราะห์เสียงด้วย `faster-whisper` แล้วตัดช่วงเงียบ / Dead air ด้วย `ffmpeg`
- ถอดเสียงไทยและจัดเป็นซับสไตล์ Smart Karaoke ตรงจังหวะพูด (`subtitles.srt` / `.ass`)
- ใส่ข้อความ Hook สีเขียวตัวใหญ่ช่วงเปิดคลิป
- (ไม่บังคับ) ให้ AI ตรวจแก้คำที่ถอดเสียงผิดในซับ — รองรับ Groq / Cerebras / OpenRouter / Gemini / OpenAI / Claude
- ดาวน์โหลดแพ็กเกจ `.zip` ที่มีวิดีโอหลังตัด, ซับ, transcript และสรุปงาน
- หรือสร้าง draft ใน CapCut บนเครื่องโดยตรงด้วยเอนจิน `tools/capcut-auto` (มีเทมเพลตสำเร็จรูปติดมา ไม่ต้องมีโปรเจกต์ CapCut เดิม)
- ประมวลผลบนเครื่องผู้ใช้ 100% ไม่มีการอัปโหลดวิดีโอขึ้นเซิร์ฟเวอร์ภายนอก

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
