import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

/**
 * สร้างเสียงพากย์ไทย (TTS) ผ่าน ElevenLabs หรือ Google Cloud TTS
 * คืน data URL (audio/mpeg) ให้ฝั่ง client เล่น/ใส่ในแพ็กเกจ export
 * หมายเหตุ: provider 'browser' จัดการฝั่ง client (ไม่เรียก route นี้)
 */
export async function POST(req: NextRequest) {
  try {
    const { provider, apiKey, text, voiceId } = (await req.json()) as {
      provider: 'elevenlabs' | 'google';
      apiKey: string;
      text: string;
      voiceId?: string;
    };
    if (!text?.trim()) return NextResponse.json({ error: 'ไม่มีข้อความให้พากย์' }, { status: 400 });
    if (!apiKey) return NextResponse.json({ error: 'ยังไม่ได้ใส่ API key ของบริการเสียง' }, { status: 400 });

    if (provider === 'elevenlabs') {
      const voice = voiceId || 'JBFqnCBsd6RMkjVDRZzb';
      const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
        method: 'POST',
        headers: { 'xi-api-key': apiKey, 'content-type': 'application/json', accept: 'audio/mpeg' },
        body: JSON.stringify({ text, model_id: 'eleven_multilingual_v2', voice_settings: { stability: 0.5, similarity_boost: 0.75 } }),
      });
      if (!res.ok) return NextResponse.json({ error: `ElevenLabs ${res.status}`, detail: (await res.text()).slice(0, 400) }, { status: 500 });
      const buf = Buffer.from(await res.arrayBuffer());
      return NextResponse.json({ dataUrl: `data:audio/mpeg;base64,${buf.toString('base64')}` });
    }

    if (provider === 'google') {
      const res = await fetch(`https://texttospeech.googleapis.com/v1/text:synthesize?key=${encodeURIComponent(apiKey)}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'th-TH', name: voiceId || 'th-TH-Neural2-C' },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 0.95 },
        }),
      });
      if (!res.ok) return NextResponse.json({ error: `Google TTS ${res.status}`, detail: (await res.text()).slice(0, 400) }, { status: 500 });
      const data = await res.json();
      if (!data.audioContent) return NextResponse.json({ error: 'Google TTS ไม่ส่งเสียงกลับมา' }, { status: 500 });
      return NextResponse.json({ dataUrl: `data:audio/mpeg;base64,${data.audioContent}` });
    }

    return NextResponse.json({ error: 'ไม่รู้จักบริการเสียงนี้' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: 'สร้างเสียงไม่สำเร็จ', detail: String(e?.message ?? e) }, { status: 500 });
  }
}
