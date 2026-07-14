// ถอดเสียงแบบ pluggable:
// - ถ้าตั้ง GROQ_API_KEY (.env.local) -> ใช้ Groq Whisper API (ไม่ต้องมี Python = deploy คลาวด์ได้)
// - ถ้าไม่ตั้ง -> fallback ไปรัน faster-whisper ในเครื่อง (transcribe_only.py)
import { spawn } from 'node:child_process';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';

export interface SubWord { word: string; start: number; end: number; }

export function groqEnabled(): boolean {
  return !!process.env.GROQ_API_KEY;
}

const GROQ_MAX_BYTES = 24 * 1024 * 1024; // ลิมิตไฟล์ของ Groq ~25MB — กันเหลื่อมไว้ที่ 24MB

// แยกเสียงจากวิดีโอเป็น m4a โมโน 16kHz — เล็กลง ~20 เท่า ทำให้คลิปยาวส่ง Groq ได้ + อัปโหลดเร็วขึ้น
// คืน path ไฟล์เสียง หรือ null ถ้า ffmpeg ใช้ไม่ได้ (จะ fallback ส่งไฟล์เดิม)
function extractAudio(filePath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const out = path.join(os.tmpdir(), `ec_audio_${Date.now()}.m4a`);
    const ff = process.env.EASYCUT_FFMPEG || 'ffmpeg';
    const child = spawn(ff, ['-y', '-i', filePath, '-vn', '-ac', '1', '-ar', '16000', '-b:a', '64k', out]);
    child.on('error', () => resolve(null));
    child.on('close', (code) => resolve(code === 0 ? out : null));
  });
}

// Groq: OpenAI-compatible /audio/transcriptions — ส่งไฟล์เสียงที่บีบแล้ว (หรือไฟล์เดิมถ้าแยกเสียงไม่ได้)
// keyterms = "คลังคำ" ที่ผู้ใช้พิมพ์ (ศัพท์อังกฤษ/แบรนด์/ชื่อเฉพาะที่พูดในคลิป) — ใส่เป็น prompt เพื่อให้
// Whisper ถอดคำพวกนี้แม่นขึ้น แก้ปัญหาพูดไทยปนอังกฤษแล้วถอดมั่ว (code-switching)
export async function transcribeGroq(filePath: string, keyterms?: string): Promise<SubWord[]> {
  const key = process.env.GROQ_API_KEY!;
  const model = process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3';
  const audioPath = (await extractAudio(filePath)) || filePath;
  const size = (await stat(audioPath)).size;
  if (size > GROQ_MAX_BYTES) {
    throw new Error('คลิปยาวเกินไปสำหรับการถอดเสียงครั้งเดียว (~เกิน 1 ชั่วโมง) — ลองตัดคลิปให้สั้นลงก่อน');
  }
  const buf = await readFile(audioPath);
  // ลบไฟล์เสียงชั่วคราวหลังอ่านเข้าหน่วยความจำแล้ว (ถ้าแยกเสียงสำเร็จ)
  if (audioPath !== filePath) {
    const { rm } = await import('node:fs/promises');
    rm(audioPath, { force: true }).catch(() => undefined);
  }
  const form = new FormData();
  form.append('file', new Blob([buf]), path.basename(audioPath) || 'clip.m4a');
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('language', 'th');
  form.append('temperature', '0');
  // prompt = คลังคำ ช่วยให้ถอดศัพท์เฉพาะ/อังกฤษที่พูดในคลิปแม่นขึ้น (จำกัดความยาวกัน error)
  const kt = (keyterms || '').trim();
  if (kt) form.append('prompt', kt.slice(0, 800));

  const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  });
  if (!res.ok) {
    const t = await res.text().catch(() => '');
    throw new Error(`Groq ถอดเสียงไม่สำเร็จ (${res.status}) ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { words?: { word: string; start: number; end: number }[]; segments?: { text: string; start: number; end: number }[] };
  const words = (data.words || [])
    .map((w) => ({ word: (w.word || '').trim(), start: Number(w.start), end: Number(w.end) }))
    .filter((w) => w.word && Number.isFinite(w.start) && Number.isFinite(w.end))
    .sort((a, b) => a.start - b.start);
  return words;
}

// fallback: รัน faster-whisper ในเครื่องผ่าน transcribe_only.py
export function transcribeLocal(filePath: string, toolDir: string): Promise<SubWord[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('python', ['-u', 'transcribe_only.py', filePath], {
      cwd: toolDir,
      env: { ...process.env, PYTHONIOENCODING: 'utf-8' },
    });
    let out = '';
    let err = '';
    child.stdout.on('data', (d) => { out += d.toString(); });
    child.stderr.on('data', (d) => { err += d.toString(); });
    child.on('error', (e) => reject(new Error('รัน python ไม่ได้: ' + e.message)));
    child.on('close', (code) => {
      const m = out.lastIndexOf('__RESULT__');
      if (m >= 0) {
        try {
          const j = JSON.parse(out.slice(m + '__RESULT__'.length).trim());
          if (j.ok) return resolve((j.words || []) as SubWord[]);
          return reject(new Error(j.error || 'ถอดเสียงไม่สำเร็จ'));
        } catch { /* fall through */ }
      }
      reject(new Error(`ถอดเสียงไม่สำเร็จ (code ${code}) ${err.slice(-300)}`));
    });
  });
}
