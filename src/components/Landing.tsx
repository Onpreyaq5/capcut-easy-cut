'use client';
// หน้า Landing (สาธารณะ) สไตล์ dark futuristic — เนื้อหา CAPCUT Easy CUT จริง
// ทรานสิชั่น CSS + hover glow
import { useState } from 'react';
import Link from 'next/link';
import {
  Sparkles, ArrowRight, UploadCloud, AudioLines, Type, Wand2, Download, Film,
  Scissors, Palette, Zap, Check, Star, Plus, Minus, ShieldCheck, Clock,
} from 'lucide-react';
import { PLANS } from '@/lib/planInfo';

function Reveal({ children, delay = 0, className = '' }: { children: React.ReactNode; delay?: number; className?: string }) {
  return (
    <div className={`animate-in ${className}`} style={{ animationDelay: `${delay}s` }}>
      {children}
    </div>
  );
}

function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface/60 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-primary backdrop-blur">
      <Sparkles className="h-3 w-3" /> {children}
    </span>
  );
}

const STEPS = [
  { icon: UploadCloud, t: 'อัปโหลดคลิป', d: 'ลากคลิปดิบใส่ (MP4/MOV) รองรับหลายคลิป' },
  { icon: AudioLines, t: 'AI ถอดเสียงทำซับ', d: 'Whisper ถอดเสียงไทยแม่น ตัด Dead air ให้อัตโนมัติ' },
  { icon: Type, t: 'แก้คำ + เลือกสไตล์', d: 'แก้ทีละคำ เลือกฟอนต์/เทมเพลต/สี ในเว็บ' },
  { icon: Wand2, t: 'คาราโอเกะไล่สี', d: 'ซับไล่สีทีละคำตามจังหวะพูด อัตโนมัติ' },
  { icon: Download, t: 'ดาวน์โหลด / เข้า CapCut', d: 'ได้วิดีโอฝังซับ หรือส่งเข้า CapCut แก้ต่อ' },
];

const FEATURES = [
  { icon: Scissors, t: 'ตัด Dead air อัตโนมัติ', d: 'ตัดช่วงเงียบ/หายใจออก คลิปกระชับขึ้นเอง' },
  { icon: Wand2, t: 'ตัดคำพูดติดขัด/พูดซ้ำ', d: 'เอ่อ อ่า พูดผิดแล้วพูดใหม่ ตัดให้ลื่นไหล' },
  { icon: Sparkles, t: 'ซับคาราโอเกะไล่สี', d: 'ไฮไลต์ทีละคำแบบครีเอเตอร์ดัง ๆ' },
  { icon: Palette, t: 'ฟอนต์ / เทมเพลต / สไตล์', d: '8 ฟอนต์ไทย + 9 เทมเพลตแอนิเมชัน' },
  { icon: Film, t: 'เรนเดอร์วิดีโอฝังซับ', d: 'ได้ .mp4 พร้อมลง TikTok/Reels ทันที' },
  { icon: Zap, t: 'ส่งเข้า CapCut', d: 'เปิดในแอปแก้ต่อได้ ฟอนต์ติดตั้งให้อัตโนมัติ' },
];

const RESULTS = [
  { n: '10×', l: 'เร็วกว่าตัด/พิมพ์ซับเอง' },
  { n: '90%', l: 'ลดเวลาทำซับต่อคลิป' },
  { n: '8+9', l: 'ฟอนต์ไทย + เทมเพลตคาราโอเกะ' },
  { n: '฿0', l: 'เริ่มใช้ฟรี ไม่ต้องลงโปรแกรม' },
];

const TESTI = [
  { name: 'พีท ครีเอเตอร์', role: 'สายรีวิว TikTok', text: 'เมื่อก่อนพิมพ์ซับเองครึ่งชม./คลิป ตอนนี้ 3 นาทีเสร็จ คาราโอเกะสวยเหมือนช่องดัง' },
  { name: 'มายด์', role: 'ฟรีแลนซ์ตัดต่อ', text: 'ชอบที่แก้คำในเว็บได้ แล้วส่งเข้า CapCut ต่อได้เลย ไม่ต้องพิมพ์ใหม่' },
  { name: 'โอ๊ต', role: 'เจ้าของเพจสอนขาย', text: 'ตัด เอ่อ อ่า ออกให้อัตโนมัติ คลิปดูโปรขึ้นเยอะ ลูกค้าทักมาเพิ่ม' },
];

const FAQ = [
  { q: 'ใช้ฟรีได้จริงไหม?', a: 'ได้ครับ แพ็กเกจ Free ให้ทำซับ + แก้ในเว็บ + ดาวน์โหลด SRT ฟรี และเรนเดอร์วิดีโอได้ 10 นาที/เดือน (มีลายน้ำเล็ก ๆ)' },
  { q: 'ต้องลงโปรแกรมอะไรไหม?', a: 'ไม่ต้องครับ ใช้ผ่านเว็บได้เลย ทั้งบนคอมและมือถือ — ยกเว้นถ้าจะ "ส่งเข้า CapCut" ต้องมี CapCut ในเครื่อง' },
  { q: 'ซับไทยแม่นแค่ไหน?', a: 'ใช้ AI Whisper large-v3 ถอดเสียงไทยได้แม่น และยังแก้ทีละคำในเว็บได้ พร้อมระบบตัดคำพูดผิด/ซ้ำให้อัตโนมัติ' },
  { q: 'คาราโอเกะไล่สีทำยังไง?', a: 'ระบบจับจังหวะพูดแต่ละคำ แล้วไล่ไฮไลต์สีทีละคำให้อัตโนมัติ เลือกสี/ฟอนต์/เทมเพลตได้ในแท็บสไตล์' },
  { q: 'อัปเกรดเป็น Pro ได้อะไรเพิ่ม?', a: 'ปลดลายน้ำ, วิดีโอ 1080p, โควตา 120 นาที/เดือน, ดาวน์โหลดโปรเจกต์ CapCut และฟอนต์/เทมเพลต/เสียงครบ' },
];

function Orb({ className = '' }: { className?: string }) {
  return (
    <div className={`pointer-events-none relative ${className}`} aria-hidden>
      <div className="orb-glow absolute inset-0 rounded-full" />
      <div
        className="relative aspect-square w-full rounded-full"
        style={{
          background:
            'radial-gradient(circle at 38% 32%, #7aa8ff 0%, #3b82f6 26%, #2138a8 52%, #0a1030 78%, #05060d 100%)',
          boxShadow: '0 0 120px -10px rgba(59,130,246,0.7), inset -30px -24px 80px rgba(0,0,0,0.6), inset 24px 18px 60px rgba(122,168,255,0.35)',
        }}
      />
      <div className="absolute inset-[-8%] rounded-full border border-primary/20" />
      <div className="absolute inset-[-18%] rounded-full border border-primary/10" />
    </div>
  );
}

export default function Landing() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div className="overflow-hidden">
      {/* ===== HERO ===== */}
      <section className="container-page relative pt-10 sm:pt-16">
        <div className="grid items-center gap-10 lg:grid-cols-[1.1fr_0.9fr]">
          <Reveal>
            <Eyebrow>AI ทำซับ + ตัดคลิปอัตโนมัติ</Eyebrow>
            <h1 className="mt-5 text-4xl font-extrabold leading-[1.08] tracking-tight text-text-primary sm:text-5xl lg:text-6xl">
              ทำซับคลิปของคุณ
              <br />
              <span className="text-gradient">อัตโนมัติเต็มรูปแบบ</span>
            </h1>
            <p className="mt-5 max-w-xl text-base leading-relaxed text-text-secondary sm:text-lg">
              อัปคลิปดิบ → ตัด Dead air + ถอดเสียงทำซับไทย + คาราโอเกะไล่สี →
              ดาวน์โหลดวิดีโอ หรือส่งเข้า CapCut ในไม่กี่นาที
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-3">
              <Link href="/auto" className="glow-primary flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-bold text-white transition-transform hover:-translate-y-0.5">
                เริ่มใช้ฟรี <ArrowRight className="h-4 w-4" />
              </Link>
              <Link href="/pricing" className="rounded-xl border border-border bg-surface/60 px-6 py-3 text-sm font-semibold text-text-secondary backdrop-blur transition-colors hover:border-primary/50 hover:text-text-primary">
                ดูแพ็กเกจ
              </Link>
            </div>
            <div className="mt-6 flex items-center gap-4 text-xs text-text-muted">
              <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> ไม่ต้องลงโปรแกรม</span>
              <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5 text-primary" /> เสร็จในไม่กี่นาที</span>
            </div>
          </Reveal>

          <Reveal delay={0.15} className="relative mx-auto w-full max-w-sm">
            <Orb className="w-full" />
          </Reveal>
        </div>

        {/* stat strip */}
        <Reveal delay={0.1}>
          <div className="mt-14 grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-4">
            {RESULTS.map((r) => (
              <div key={r.l} className="bg-surface/80 p-5 text-center backdrop-blur">
                <div className="text-2xl font-extrabold text-text-primary sm:text-3xl">{r.n}</div>
                <div className="mt-1 text-[11px] text-text-muted">{r.l}</div>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ===== STEPS ===== */}
      <section className="container-page mt-28">
        <Reveal className="text-center">
          <Eyebrow>ขั้นตอน</Eyebrow>
          <h2 className="mt-4 text-3xl font-extrabold text-text-primary sm:text-4xl">จากคลิปดิบ สู่คลิปมีซับ ใน 5 ขั้น</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-text-muted">ทุกขั้นตอนอัตโนมัติ — คุณแค่กดไม่กี่ปุ่ม</p>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-3 lg:grid-cols-5">
          {STEPS.map((s, i) => (
            <Reveal key={s.t} delay={i * 0.06}>
              <div className="hover-glow h-full rounded-2xl border border-border bg-surface/70 p-5 backdrop-blur">
                <div className="mb-3 flex items-center justify-between">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary-soft text-primary"><s.icon className="h-5 w-5" /></span>
                  <span className="text-2xl font-black text-border">{i + 1}</span>
                </div>
                <h3 className="text-sm font-bold text-text-primary">{s.t}</h3>
                <p className="mt-1.5 text-xs leading-relaxed text-text-muted">{s.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== FEATURES ===== */}
      <section className="container-page mt-28">
        <Reveal className="text-center">
          <Eyebrow>ฟีเจอร์</Eyebrow>
          <h2 className="mt-4 text-3xl font-extrabold text-text-primary sm:text-4xl">เครื่องมือที่ทำงานได้จริง</h2>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <Reveal key={f.t} delay={i * 0.05}>
              <div className="hover-glow group h-full rounded-2xl border border-border bg-surface/70 p-6 backdrop-blur">
                <span className="grid h-11 w-11 place-items-center rounded-xl bg-primary-soft text-primary transition-transform group-hover:scale-110">
                  <f.icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-base font-bold text-text-primary">{f.t}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-text-muted">{f.d}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== MODES: มือถือ vs คอม ===== */}
      <section className="container-page mt-28">
        <Reveal className="text-center">
          <Eyebrow>เลือกวิธีใช้</Eyebrow>
          <h2 className="mt-4 text-3xl font-extrabold text-text-primary sm:text-4xl">ใช้ได้ทั้งมือถือ และคอม</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-text-muted">คลิปเดียวกัน เลือกได้ว่าจะเอาไปโพสต์เลย หรือเปิดแก้ต่อใน CapCut</p>
        </Reveal>
        <div className="mx-auto mt-12 grid max-w-3xl gap-5 md:grid-cols-2">
          <Reveal>
            <div className="hover-glow flex h-full flex-col rounded-2xl border border-primary/40 bg-surface/70 p-7 backdrop-blur">
              <span className="text-4xl">📱</span>
              <h3 className="mt-4 text-lg font-bold text-text-primary">โหมดมือถือ — ได้วิดีโอเสร็จ</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                อัปคลิปบนมือถือ → ถอดเสียง ทำซับคาราโอเกะ ตัดช่วงเงียบ → <b className="text-text-secondary">ดาวน์โหลดวิดีโอซับฝัง</b> โพสต์ TikTok/Reels ได้เลย ไม่ต้องเปิด CapCut
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-text-muted">
                <li>✓ เรนเดอร์บนเครื่องคุณเอง เร็ว ไม่ต้องรอคิว</li>
                <li>✓ ไล่สีทีละคำ + ฟอนต์/สไตล์ครบ</li>
                <li>✓ ตัดเดดแอร์อัตโนมัติ</li>
              </ul>
              <a href="/editor" className="mt-6 inline-flex items-center justify-center rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-white transition-opacity hover:opacity-90">
                เริ่มบนมือถือ →
              </a>
            </div>
          </Reveal>
          <Reveal delay={0.08}>
            <div className="hover-glow flex h-full flex-col rounded-2xl border border-border bg-surface/70 p-7 backdrop-blur">
              <span className="text-4xl">💻</span>
              <h3 className="mt-4 text-lg font-bold text-text-primary">โหมดคอม — เปิดใน CapCut</h3>
              <p className="mt-2 text-sm leading-relaxed text-text-muted">
                บนคอม (Windows/Mac) ส่งเข้า <b className="text-text-secondary">โปรเจกต์ CapCut</b> ได้เลย — เปิดแอปแล้วแก้ต่อ ปรับซับ ไล่สีทีละคำ ย้ายตำแหน่งได้อิสระ
              </p>
              <ul className="mt-4 space-y-1.5 text-xs text-text-muted">
                <li>✓ ตัดเดดแอร์ + ทำซับให้อัตโนมัติ</li>
                <li>✓ เปิดเป็นร่าง CapCut แก้ต่อได้เต็มที่</li>
                <li>✓ ซับไล่สีทีละคำในแอป CapCut</li>
              </ul>
              <a href="/auto" className="mt-6 inline-flex items-center justify-center rounded-xl border border-border bg-surface px-5 py-2.5 text-sm font-semibold text-text-secondary transition-colors hover:border-primary/50">
                เริ่มบนคอม →
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* ===== RESULTS BANNER ===== */}
      <section className="container-page mt-28">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-border bg-surface/60 p-10 text-center backdrop-blur">
            <div className="orb-glow absolute -top-24 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full opacity-60" />
            <div className="relative">
              <h2 className="text-2xl font-extrabold text-text-primary sm:text-3xl">ผลลัพธ์ที่พูดแทนคำโฆษณา</h2>
              <div className="mx-auto mt-8 grid max-w-2xl grid-cols-2 gap-8 sm:grid-cols-4">
                {RESULTS.map((r) => (
                  <div key={r.l}>
                    <div className="text-gradient text-3xl font-black sm:text-4xl">{r.n}</div>
                    <div className="mt-1 text-[11px] text-text-muted">{r.l}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Reveal>
      </section>

      {/* ===== PRICING ===== */}
      <section className="container-page mt-28">
        <Reveal className="text-center">
          <Eyebrow>ราคา</Eyebrow>
          <h2 className="mt-4 text-3xl font-extrabold text-text-primary sm:text-4xl">ราคาเรียบง่าย ทรงพลัง</h2>
          <p className="mx-auto mt-3 max-w-lg text-sm text-text-muted">เริ่มฟรี อัปเกรดเมื่อพร้อม</p>
        </Reveal>
        <div className="mt-12 grid gap-5 md:grid-cols-3">
          {PLANS.map((p, i) => (
            <Reveal key={p.id} delay={i * 0.08}>
              <div className={`hover-glow relative flex h-full flex-col rounded-2xl border bg-surface/70 p-6 backdrop-blur ${p.highlight ? 'border-primary' : 'border-border'}`}>
                {p.highlight && <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-[11px] font-bold text-white">แนะนำ</span>}
                <span className="text-sm font-extrabold uppercase tracking-wide text-text-secondary">{p.name}</span>
                <div className="mt-3 flex items-baseline gap-1">
                  <span className="text-3xl font-extrabold text-text-primary">{p.price}</span>
                  <span className="text-sm text-text-muted">{p.period}</span>
                </div>
                <div className="mt-3 rounded-lg bg-primary-soft px-3 py-1.5 text-center text-xs font-bold text-primary">{p.minutes} นาที/เดือน</div>
                <ul className="mt-4 flex flex-1 flex-col gap-2.5 border-t border-border pt-4">
                  {p.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-[13px] text-text-secondary">
                      <Check className="mt-0.5 h-3.5 w-3.5 flex-none text-success" /> {f}
                    </li>
                  ))}
                </ul>
                <Link href="/auto" className={`mt-5 rounded-lg py-2.5 text-center text-sm font-semibold transition-colors ${p.highlight ? 'glow-primary bg-primary text-white' : 'border border-border text-text-secondary hover:border-primary/50'}`}>
                  {p.id === 'free' ? 'เริ่มใช้ฟรี' : p.cta}
                </Link>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== TESTIMONIALS ===== */}
      <section className="container-page mt-28">
        <Reveal className="text-center">
          <Eyebrow>เสียงจากผู้ใช้</Eyebrow>
          <h2 className="mt-4 text-3xl font-extrabold text-text-primary sm:text-4xl">ครีเอเตอร์พูดถึงเรายังไง</h2>
          <p className="mx-auto mt-2 max-w-lg text-[11px] text-text-muted">* ตัวอย่างรีวิว</p>
        </Reveal>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {TESTI.map((t, i) => (
            <Reveal key={t.name} delay={i * 0.07}>
              <div className="hover-glow h-full rounded-2xl border border-border bg-surface/70 p-6 backdrop-blur">
                <div className="mb-3 flex gap-0.5 text-primary">{[...Array(5)].map((_, k) => <Star key={k} className="h-3.5 w-3.5 fill-current" />)}</div>
                <p className="text-sm leading-relaxed text-text-secondary">“{t.text}”</p>
                <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
                  <span className="grid h-9 w-9 place-items-center rounded-full grad-hero text-xs font-bold text-white">{t.name.charAt(0)}</span>
                  <div>
                    <div className="text-sm font-bold text-text-primary">{t.name}</div>
                    <div className="text-[11px] text-text-muted">{t.role}</div>
                  </div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== FAQ ===== */}
      <section className="container-page mt-28">
        <Reveal className="text-center">
          <Eyebrow>คำถามที่พบบ่อย</Eyebrow>
          <h2 className="mt-4 text-3xl font-extrabold text-text-primary sm:text-4xl">ทุกอย่างที่คุณอยากรู้</h2>
        </Reveal>
        <div className="mx-auto mt-10 max-w-2xl space-y-3">
          {FAQ.map((f, i) => (
            <Reveal key={f.q} delay={i * 0.04}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                className="w-full rounded-xl border border-border bg-surface/70 p-5 text-left backdrop-blur transition-colors hover:border-primary/40"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="text-sm font-bold text-text-primary">{f.q}</span>
                  {openFaq === i ? <Minus className="h-4 w-4 flex-none text-primary" /> : <Plus className="h-4 w-4 flex-none text-text-muted" />}
                </div>
                <div className={`overflow-hidden transition-all duration-300 ${openFaq === i ? 'max-h-64 opacity-100' : 'max-h-0 opacity-0'}`}>
                  <p className="pt-3 text-sm leading-relaxed text-text-muted">{f.a}</p>
                </div>
              </button>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ===== CTA ===== */}
      <section className="container-page mb-24 mt-28">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl border border-primary/30 p-12 text-center">
            <div className="absolute inset-0 grad-hero opacity-[0.12]" />
            <div className="orb-glow absolute left-1/2 top-0 h-72 w-72 -translate-x-1/2 rounded-full" />
            <div className="relative">
              <h2 className="text-3xl font-extrabold text-text-primary sm:text-4xl">พร้อมทำซับคลิปแบบมือโปรหรือยัง?</h2>
              <p className="mx-auto mt-3 max-w-md text-sm text-text-secondary">เริ่มฟรีวันนี้ ไม่ต้องใช้บัตร ไม่ต้องลงโปรแกรม</p>
              <Link href="/auto" className="glow-primary mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-8 py-3.5 text-sm font-bold text-white transition-transform hover:-translate-y-0.5">
                เริ่มใช้ฟรี <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </Reveal>
      </section>
    </div>
  );
}
