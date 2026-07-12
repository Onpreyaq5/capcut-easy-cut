// ถอดเสียงแบบ pluggable:
// - ถ้าตั้ง GROQ_API_KEY (.env.local) -> ใช้ Groq Whisper API (ไม่ต้องมี Python = deploy คลาวด์ได้)
// - ถ้าไม่ตั้ง -> fallback ไปรัน faster-whisper ในเครื่อง (transcribe_only.py)
import { spawn } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

export interface SubWord { word: string; start: number; end: number; }

export function groqEnabled(): boolean {
  return !!process.env.GROQ_API_KEY;
}

// Groq: OpenAI-compatible /audio/transcriptions รองรับ mp4 ตรง ๆ (ไม่ต้องแยกเสียงก่อน)
export async function transcribeGroq(filePath: string): Promise<SubWord[]> {
  const key = process.env.GROQ_API_KEY!;
  const model = process.env.GROQ_WHISPER_MODEL || 'whisper-large-v3';
  const buf = await readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([buf]), path.basename(filePath) || 'clip.mp4');
  form.append('model', model);
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'word');
  form.append('language', 'th');
  form.append('temperature', '0');

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
