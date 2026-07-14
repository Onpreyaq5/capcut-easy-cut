import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/authStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

// ✨ AI แก้คำผิดทั้งคลิป — ส่งรายการคำ (ตามลำดับเวลา) ให้ LLM ตรวจแก้
// กติกาสำคัญ: คืน array ยาวเท่าเดิมเป๊ะ (คำต่อคำ) เพื่อคงจังหวะเวลาเดิมทุกคำ
// แก้: คำไทยสะกดผิด, ไทยปนอังกฤษที่ถอดมั่ว (เช่น "แชทจีบีที" -> "ChatGPT"), คำเพี้ยนจากเสียง
interface InWord { text: string; start: number; end: number }

const BATCH = 80; // คำต่อรอบ — กัน context ยาวเกิน + ตอบไว

async function refineBatch(texts: string[], keyterms: string, key: string, model: string): Promise<string[]> {
  const sys = [
    'คุณคือผู้ตรวจแก้ซับวิดีโอภาษาไทย (พูดไทยปนอังกฤษ)',
    'ผู้ใช้ส่ง JSON array ของ "คำ" เรียงตามเวลาที่พูด ให้แก้เฉพาะคำที่ถอดเสียงผิด:',
    '- คำไทยสะกดผิด/เพี้ยนจากเสียง -> แก้ให้ถูก',
    '- คำอังกฤษที่ถูกถอดเป็นไทยมั่ว ๆ (ทับศัพท์เพี้ยน) -> เขียนเป็นคำอังกฤษที่ถูกต้อง',
    '- ห้ามรวมคำ ห้ามแยกคำ ห้ามสลับลำดับ ห้ามเพิ่ม/ลบ — จำนวนสมาชิกต้องเท่าเดิมเป๊ะ',
    '- คำที่ถูกอยู่แล้วให้คงเดิมทุกตัวอักษร',
    keyterms ? `ศัพท์เฉพาะ/แบรนด์ที่พูดในคลิป (ใช้สะกดตามนี้): ${keyterms}` : '',
    'ตอบเป็น JSON object เท่านั้น: {"words": ["คำ1", "คำ2", ...]} ความยาวเท่ากับ input',
  ].filter(Boolean).join('\n');

  const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      temperature: 0,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: sys },
        { role: 'user', content: JSON.stringify(texts) },
      ],
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`AI แก้คำไม่สำเร็จ (${res.status}) ${t.slice(0, 150)}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content || '{}';
  const parsed = JSON.parse(content) as { words?: unknown };
  const out = Array.isArray(parsed.words) ? parsed.words.map((w) => String(w ?? '')) : null;
  // สัญญาความยาวเท่าเดิม — ถ้า LLM เพี้ยนให้คงข้อความเดิมของ batch นั้น (ปลอดภัยกว่าเดา)
  if (!out || out.length !== texts.length) return texts;
  return out;
}

export async function POST(req: NextRequest) {
  if (!(await getSessionUser(req))) {
    return NextResponse.json({ ok: false, error: 'กรุณาเข้าสู่ระบบก่อนใช้งาน' }, { status: 401 });
  }
  const key = process.env.GROQ_API_KEY;
  if (!key) {
    return NextResponse.json({ ok: false, error: 'AI แก้คำยังไม่พร้อม — ผู้ดูแลต้องตั้งค่า GROQ_API_KEY' }, { status: 503 });
  }
  try {
    const { words, keyterms } = (await req.json()) as { words: InWord[]; keyterms?: string };
    if (!Array.isArray(words) || !words.length) return NextResponse.json({ ok: false, error: 'ไม่มีคำให้แก้' }, { status: 400 });
    if (words.length > 3000) return NextResponse.json({ ok: false, error: 'คลิปยาวเกินไปสำหรับ AI แก้คำครั้งเดียว' }, { status: 400 });

    const model = process.env.GROQ_LLM_MODEL || 'llama-3.3-70b-versatile';
    const kt = String(keyterms || '').slice(0, 500);
    const texts = words.map((w) => String(w.text || ''));
    const fixed: string[] = [];
    for (let i = 0; i < texts.length; i += BATCH) {
      fixed.push(...(await refineBatch(texts.slice(i, i + BATCH), kt, key, model)));
    }
    const changed = fixed.reduce((n, t, i) => n + (t !== texts[i] ? 1 : 0), 0);
    return NextResponse.json({ ok: true, texts: fixed, changed });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
