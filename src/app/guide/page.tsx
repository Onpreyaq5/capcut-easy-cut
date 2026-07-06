import Link from 'next/link';
import { Settings, PenLine, Users, Clapperboard, Mic, Combine, ArrowRight, Lightbulb, ExternalLink } from 'lucide-react';
import { Card, Badge } from '@/components/ui';

export const metadata = { title: 'วิธีใช้ — ธัญกิจ ปุ๋ยภัณฑ์ AI WEB' };

function Step({
  n,
  icon: Icon,
  title,
  children,
}: {
  n: number;
  icon: any;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <Card className="p-6">
      <div className="mb-3 flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-primary-soft text-primary"><Icon className="h-5 w-5" /></span>
        <h2 className="font-heading text-lg font-bold">
          <span className="text-primary">ขั้นที่ {n}</span> · {title}
        </h2>
      </div>
      <div className="space-y-2 text-[15px] leading-relaxed text-text-secondary">{children}</div>
    </Card>
  );
}

function Tip({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 flex items-start gap-2 rounded-md bg-secondary-soft/50 p-3 text-sm text-text-primary">
      <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-warning" /> <span>{children}</span>
    </p>
  );
}

export default function GuidePage() {
  return (
    <div className="container-page max-w-content py-10">
      <div className="mb-8 text-center">
        <Badge tone="ai" className="mx-auto mb-3">คู่มือฉบับเต็ม</Badge>
        <h1 className="font-heading text-3xl font-bold sm:text-4xl">วิธีทำคลิปขายปุ๋ย ตั้งแต่ต้นจนจบ</h1>
        <p className="mt-2 text-text-secondary">ทำตาม 6 ขั้นนี้ ได้คลิปพร้อมลงจริง — ประหยัดเวลาที่สุด</p>
      </div>

      <div className="mb-6 rounded-lg border border-border bg-surface-muted/40 p-5 text-sm text-text-secondary">
        <b className="text-text-primary">ภาพรวม:</b> เว็บนี้ช่วย <b>คิดเรื่อง → เขียนบท → ทำ storyboard + prompt</b> ให้ ·
        ส่วนวิดีโอสร้างใน <b>Google Flow</b> · เสียงพากย์ใช้ <b>Botnoi Voice</b> · แล้วเอาไฟล์มา <b>รวม/จัดเรียง</b> ในเว็บ → ตัดต่อจบใน <b>CapCut</b>
      </div>

      <div className="space-y-5">
        <Step n={1} icon={Settings} title="ตั้งค่า AI (ครั้งเดียว)">
          <p>ไปหน้า <Link href="/settings" className="text-accent hover:underline">ตั้งค่า</Link> → เลือกสมอง AI</p>
          <p>• <b>ฟรี ไม่ต้องใช้ key (Puter)</b> — แนะนำ เริ่มได้เลย (ครั้งแรกเด้งให้ล็อกอิน Puter ฟรี)</p>
          <p>• หรือใส่ API key ของ Claude/ChatGPT/Gemini ถ้ามี · หรือรันในเครื่อง (Ollama)</p>
        </Step>

        <Step n={2} icon={PenLine} title="สตูดิโอ — สั่ง AI ทำบท (4 ขั้นย่อย)">
          <p>ไปหน้า <Link href="/studio" className="text-accent hover:underline">สตูดิโอ</Link> ทำทีละขั้น แต่ละขั้นส่งงานให้ขั้นถัดไปเอง:</p>
          <p>1️⃣ <b>เนื้อเรื่อง</b> — พิมพ์โครงคร่าวๆ + แนบรูป/วิดีโอตัวอย่าง → AI แต่งเรื่อง 5 จังหวะ</p>
          <p>2️⃣ <b>บทขาย</b> — ใส่ข้อมูลปุ๋ย → AI เขียนบทขายเนียนเข้ากับเรื่อง</p>
          <p>3️⃣ <b>Storyboard</b> — เลือก 9:16/16:9 + 10วิ/ช็อต → ได้ช็อต + prompt Flow + บทพากย์ + ซับ</p>
          <p>4️⃣ <b>แคปชันโพสต์</b> — ได้แคปชัน+แฮชแท็กทุกแพลตฟอร์ม</p>
        </Step>

        <Step n={3} icon={Users} title="ทำให้ตัวละคร “เหมือนกันทุกช็อต” (สำคัญ)">
          <p>Flow สร้างคลิปทีละช็อต ถ้าไม่คุม ตัวละครจะหน้าเปลี่ยนทุกช็อต วิธีคุมให้เหมือนกัน:</p>
          <p><b>1)</b> ในขั้น Storyboard กดปุ่ม <b>“สร้างตัวละครพูด”</b> — ระบบล็อกลักษณะตัวละคร (Character Bible) แล้วแปะคำบรรยายตัวละคร <u>เดิมซ้ำทุก prompt</u> ให้อัตโนมัติ</p>
          <p><b>2)</b> ใน Flow: สร้าง <b>ภาพตัวละครต้นแบบ 1 รูป</b> ก่อน (จากคำบรรยายตัวละคร) → แล้วใช้รูปนั้นเป็น <b>“Ingredients / reference image”</b> ในทุกช็อต</p>
          <p><b>3)</b> ใส่รายละเอียดเดิมเป๊ะทุกครั้ง: อายุ ผิว ทรงผม เสื้อผ้า (เช่น “เสื้อม่อฮ่อมคราม หมวกฟาง”)</p>
          <Tip>ภาพ reference เดิม + คำบรรยายเดิม = ตัวละครหน้าเหมือนกันทั้งคลิป นี่คือเคล็ดลับที่ทีมโปรใช้</Tip>
        </Step>

        <Step n={4} icon={Clapperboard} title="สร้างวิดีโอใน Google Flow (PRO)">
          <p>ในขั้น Storyboard → การ์ด <b>“เปิดสร้างวิดีโอใน Google Flow”</b>:</p>
          <p>• กด <b>“เปิด Flow”</b> ที่แต่ละช็อต (คัดลอก prompt + เปิด Flow ให้)</p>
          <p>• ตั้งค่าใน Flow ให้ตรง: <b>Video · Omni Flash · 9:16 หรือ 16:9 · 10s</b> → วาง prompt → Generate</p>
          <p>• ทำทีละช็อต <b>หรือ</b> กด “คัดลอก Bulk Prompts” แล้วใช้ส่วนเสริมอัตโนมัติ (ดู tools/flow-queue.user.js)</p>
          <p>• โหลดคลิปทุกช็อตเก็บไว้ (ตั้งชื่อ scene1, scene2, …)</p>
        </Step>

        <Step n={5} icon={Mic} title="พากย์เสียงด้วย Botnoi Voice">
          <p>เปิด <a href="https://voice.botnoi.ai" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">voice.botnoi.ai <ExternalLink className="h-3 w-3" /></a></p>
          <p>• ก๊อปบทพากย์ของแต่ละช็อต (อยู่ในการ์ดช็อตที่ขั้น Storyboard) ไปวางใน Botnoi</p>
          <p>• เลือกเสียงไทยที่ชอบ → สร้าง → โหลดไฟล์เสียงมาทีละช็อต (ตั้งชื่อ voice1, voice2, …)</p>
          <Tip>พากย์ทีละช็อตตามลำดับ จะเอาไปวางใน CapCut ให้ตรงคลิปง่ายกว่า</Tip>
        </Step>

        <Step n={6} icon={Combine} title="รวม & จัดเรียงไฟล์ → ตัดต่อใน CapCut">
          <p>ไปหน้า <Link href="/assemble" className="text-accent hover:underline">รวมไฟล์</Link>:</p>
          <p>• อัปโหลดคลิปจาก Flow + เสียงจาก Botnoi ที่โหลดมา</p>
          <p>• จัดลำดับ (เลื่อนขึ้น/ลง) ให้ตรงเรื่อง</p>
          <p>• กด <b>“ดาวน์โหลด .zip”</b> → ได้ไฟล์เรียงเลข 01,02,03 + เสียง + <b>subtitles.srt</b> + คู่มือ</p>
          <p>• เปิด CapCut → ลากไฟล์ตามเลข → Import subtitles.srt → ใส่เพลง → Export เสร็จ!</p>
          <Tip>อยากได้คลิปร่างไว้ดูก่อน กด “รวมเป็น .mp4 เดียว” ได้ (รวมในเบราว์เซอร์ ฟรี)</Tip>
        </Step>
      </div>

      <div className="mt-8 text-center">
        <Link href="/studio" className="inline-flex h-12 items-center gap-2 rounded-md grad-hero px-7 font-semibold text-white shadow-glow-ai hover:-translate-y-0.5 transition-transform">
          เริ่มทำคลิปเลย <ArrowRight className="h-5 w-5" />
        </Link>
      </div>
    </div>
  );
}
