import type { LlmRequest, ProviderId, ProviderMeta } from '@/lib/types';

/** เมตาดาทาผู้ให้บริการ LLM (ใช้บนหน้า settings) */
export const PROVIDERS: Record<ProviderId, ProviderMeta> = {
  puter: {
    id: 'puter',
    label: 'ฟรี ไม่ต้องใช้ key (Puter)',
    // Puter ให้ใช้โมเดลจริงผ่านคลาวด์ ฟรี ไม่ต้องมี key/รันในเครื่อง
    models: ['gpt-4o-mini', 'gpt-4o', 'claude-sonnet-4', 'gemini-2.0-flash', 'deepseek-chat'],
    defaultModel: 'gpt-4o-mini',
    keyHint: 'ไม่ต้องใช้ key · AI ทำงานบนคลาวด์ Puter ฟรี · เครื่องสเปคต่ำก็ใช้ได้ ต้องมีเน็ต',
    keyUrl: 'https://developer.puter.com/',
  },
  anthropic: {
    id: 'anthropic',
    label: 'Claude (Anthropic)',
    models: ['claude-sonnet-4-6', 'claude-opus-4-8', 'claude-haiku-4-5-20251001'],
    defaultModel: 'claude-sonnet-4-6',
    keyHint: 'ขึ้นต้นด้วย sk-ant-...',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  openai: {
    id: 'openai',
    label: 'ChatGPT (OpenAI)',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4.1'],
    defaultModel: 'gpt-4o',
    keyHint: 'ขึ้นต้นด้วย sk-...',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  gemini: {
    id: 'gemini',
    label: 'Gemini (Google)',
    // รุ่น flash = ใช้ได้ในแพลนฟรี · รุ่น pro = ต้องเปิด billing
    models: ['gemini-2.0-flash', 'gemini-2.5-flash', 'gemini-1.5-flash', 'gemini-2.5-pro', 'gemini-1.5-pro'],
    defaultModel: 'gemini-2.0-flash',
    keyHint: 'จาก Google AI Studio · แพลนฟรีให้ใช้รุ่น “flash” (รุ่น pro ต้องเปิด billing)',
    keyUrl: 'https://aistudio.google.com/app/apikey',
  },
  local: {
    id: 'local',
    label: 'เครื่องตัวเอง (Ollama/LM Studio)',
    // ชื่อรุ่นต้องตรงกับที่ pull ไว้ในเครื่อง · 3b = เบา เหมาะเครื่อง RAM น้อย, 7b/14b = ดีกว่าแต่หนัก
    models: ['qwen2.5:3b', 'qwen2.5:7b', 'gemma2:2b', 'llama3.1:8b', 'qwen2.5:14b'],
    defaultModel: 'qwen2.5:3b',
    keyHint: 'ไม่ต้องใช้ key · รัน AI บนเครื่องตัวเอง ฟรี ไม่มีโควตา · รุ่นเล็ก (3b) เหมาะเครื่อง RAM น้อย',
    keyUrl: 'https://ollama.com/download',
  },
};

/** แยก data URL -> { mediaType, base64 } */
function parseDataUrl(dataUrl: string): { mediaType: string; base64: string } | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  return { mediaType: m[1], base64: m[2] };
}

/** เรียก LLM ตาม provider แล้วคืน "ข้อความล้วน" (ฝั่ง server เท่านั้น) */
export async function callLLM(req: LlmRequest): Promise<string> {
  // provider 'local' ไม่ต้องใช้ key
  if (req.provider !== 'local' && !req.apiKey) {
    throw new Error('ยังไม่ได้ใส่ API key ของผู้ให้บริการที่เลือก (ไปที่หน้า "ตั้งค่า")');
  }
  switch (req.provider) {
    case 'anthropic':
      return callAnthropic(req);
    case 'openai':
      return callOpenAI(req);
    case 'gemini':
      return callGemini(req);
    case 'local':
      return callLocal(req);
    default:
      throw new Error(`ไม่รู้จักผู้ให้บริการ: ${req.provider}`);
  }
}

/** เรียก LLM ในเครื่อง (Ollama / LM Studio) ผ่าน endpoint แบบ OpenAI-compatible */
async function callLocal(req: LlmRequest): Promise<string> {
  // บังคับ IPv4: Ollama ฟังแค่ 127.0.0.1 แต่ Node อาจ resolve localhost เป็น IPv6 (::1) -> fetch failed
  const base = (req.baseUrl || 'http://127.0.0.1:11434/v1')
    .replace(/\/+$/, '')
    .replace(/\/\/localhost(:|\/|$)/, '//127.0.0.1$1');
  let res: Response;
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', Authorization: 'Bearer local' },
      body: JSON.stringify({
        model: req.model,
        // รุ่นเล็กในเครื่อง: ลดอุณหภูมิให้ผลนิ่ง/ต่อเนื่องขึ้น (ลดอาการมั่ว)
        temperature: Math.min(req.temperature ?? 0.7, 0.5),
        messages: [
          { role: 'system', content: req.system },
          { role: 'user', content: req.user },
        ],
        stream: false,
        ...(req.json ? { response_format: { type: 'json_object' } } : {}),
      }),
    });
  } catch (e: any) {
    throw new Error(
      `ต่อ AI ในเครื่องไม่ได้ (${base}) — เช็คว่าเปิดโปรแกรมไว้ไหม เช่นรัน "ollama serve" หรือเปิด LM Studio · ${String(e?.message ?? e)}`,
    );
  }
  if (!res.ok) throw await httpError('AI ในเครื่อง', res);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('AI ในเครื่องไม่ส่งข้อความกลับมา (ลองเช็คว่า pull รุ่นนี้ไว้แล้วด้วย "ollama pull ' + req.model + '")');
  return text;
}

async function callAnthropic(req: LlmRequest): Promise<string> {
  const content: unknown[] = [];
  for (const img of req.images ?? []) {
    const p = parseDataUrl(img);
    if (p && p.mediaType.startsWith('image/')) {
      content.push({ type: 'image', source: { type: 'base64', media_type: p.mediaType, data: p.base64 } });
    }
  }
  content.push({ type: 'text', text: req.user });

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': req.apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model: req.model,
      max_tokens: req.maxTokens ?? 4096,
      temperature: req.temperature ?? 0.7,
      system: req.system,
      messages: [{ role: 'user', content }],
    }),
  });
  if (!res.ok) throw await httpError('Claude (Anthropic)', res);
  const data = await res.json();
  const text = (data.content ?? []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
  if (!text) throw new Error('Anthropic ไม่ส่งข้อความกลับมา');
  return text;
}

async function callOpenAI(req: LlmRequest): Promise<string> {
  const userContent: unknown[] = [{ type: 'text', text: req.user }];
  for (const img of req.images ?? []) {
    const p = parseDataUrl(img);
    if (p && p.mediaType.startsWith('image/')) {
      userContent.push({ type: 'image_url', image_url: { url: img } });
    }
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${req.apiKey}`, 'content-type': 'application/json' },
    body: JSON.stringify({
      model: req.model,
      temperature: req.temperature ?? 0.7,
      max_tokens: req.maxTokens ?? 4096,
      messages: [
        { role: 'system', content: req.system },
        { role: 'user', content: userContent },
      ],
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    }),
  });
  if (!res.ok) throw await httpError('ChatGPT (OpenAI)', res);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new Error('OpenAI ไม่ส่งข้อความกลับมา');
  return text;
}

async function callGemini(req: LlmRequest): Promise<string> {
  const parts: unknown[] = [{ text: req.user }];
  for (const img of req.images ?? []) {
    const p = parseDataUrl(img);
    if (p && p.mediaType.startsWith('image/')) {
      parts.push({ inline_data: { mime_type: p.mediaType, data: p.base64 } });
    }
  }
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    req.model,
  )}:generateContent?key=${encodeURIComponent(req.apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: req.system }] },
      contents: [{ role: 'user', parts }],
      generationConfig: {
        temperature: req.temperature ?? 0.7,
        maxOutputTokens: req.maxTokens ?? 4096,
        ...(req.json ? { responseMimeType: 'application/json' } : {}),
      },
    }),
  });
  if (!res.ok) throw await httpError('Gemini (Google)', res);
  const data = await res.json();
  const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') ?? '';
  if (!text) throw new Error('Gemini ไม่ส่งข้อความกลับมา');
  return text;
}

async function safeText(res: Response): Promise<string> {
  try {
    return (await res.text()).slice(0, 600);
  } catch {
    return '(อ่าน error body ไม่ได้)';
  }
}

/** สร้างข้อความ error ที่อ่านเข้าใจง่าย (ภาษาไทย) ตาม HTTP status */
async function httpError(provider: string, res: Response): Promise<Error> {
  const body = await safeText(res);
  let hint = '';
  if (res.status === 429) {
    hint =
      ' — โควตา/เครดิตหมด หรือรุ่นที่เลือกไม่รองรับในแพลนฟรี · วิธีแก้: ไปหน้า "ตั้งค่า" เปลี่ยนรุ่นเป็นรุ่นฟรี (Gemini ใช้ gemini-2.0-flash), หรือเปิด billing ของผู้ให้บริการ, หรือรอโควตารีเซ็ต';
  } else if (res.status === 401 || res.status === 403) {
    hint = ' — API key ไม่ถูกต้องหรือไม่มีสิทธิ์ใช้รุ่นนี้ · ตรวจ key อีกครั้งในหน้า "ตั้งค่า"';
  } else if (res.status === 404) {
    hint = ' — ไม่พบรุ่นนี้ (ชื่อรุ่นอาจผิด) · เลือกรุ่นจากรายการในหน้า "ตั้งค่า"';
  } else if (res.status === 400) {
    hint = ' — คำขอไม่ถูกต้อง (อาจเป็นชื่อรุ่นผิด หรือรูปภาพใหญ่เกิน)';
  }
  return new Error(`${provider} ${res.status}${hint}\n${body}`);
}

/** ดึง JSON ออบเจกต์แรกจากข้อความ (เผื่อโมเดลใส่ code fence/ข้อความเกิน) */
export function extractJson<T = unknown>(text: string): T {
  let t = text.trim();
  // ตัด code fence
  const fence = /```(?:json)?\s*([\s\S]*?)```/i.exec(t);
  if (fence) t = fence[1].trim();
  // หา { ... } ก้อนแรกที่สมดุล
  const start = t.indexOf('{');
  if (start === -1) throw new Error('ไม่พบ JSON ในคำตอบของ AI');
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < t.length; i++) {
    const c = t[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
    } else {
      if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) {
          const slice = t.slice(start, i + 1);
          return JSON.parse(slice) as T;
        }
      }
    }
  }
  throw new Error('JSON ในคำตอบของ AI ไม่สมบูรณ์ (วงเล็บไม่ครบ)');
}
