export interface AIInsightsResult {
  chapters: Array<{ time: string; title: string }>;
  highlights: Array<{ start: string; end: string; duration: string; score: number; reason: string }>;
  hookAnalysis: { score: number; whyLow: string; howToImprove: string };
  fillerWordsRemoved: number;
}

export async function generateAIInsights(
  transcriptText: string,
  provider: string,
  apiKey: string,
  baseUrl: string = ''
): Promise<AIInsightsResult | null> {
  if (!transcriptText || !provider || !apiKey) {
    return null;
  }

  const prompt = `
You are an expert AI Video Editor. Analyze the following video transcript (with timestamps).
Perform the following tasks:
1. Generate YouTube Chapters (e.g. 00:00 Intro, 01:20 Problem, etc).
2. Detect Highlights: Find 2-3 most interesting or emotional moments in the video. Give start, end, duration, score (0-100), and reason.
3. Viral Hook Analysis: Analyze the first 30 seconds. Give a score (0-100), explain why it's good or bad, and how to improve curiosity/energy.

Format your response exactly as valid JSON:
{
  "chapters": [ {"time": "00:00", "title": "Intro"} ],
  "highlights": [ {"start": "01:20", "end": "01:45", "duration": "25s", "score": 85, "reason": "Laughed really hard"} ],
  "hookAnalysis": { "score": 60, "whyLow": "Slow start", "howToImprove": "Start with a question" },
  "fillerWordsRemoved": 15
}

Transcript:
${transcriptText}
`;

  try {
    let url = '';
    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
    let body: any = {
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.2,
      response_format: { type: "json_object" },
    };

    if (provider === 'groq') {
      url = 'https://api.groq.com/openai/v1/chat/completions';
      body.model = 'llama-3.1-8b-instant';
    } else if (provider === 'cerebras') {
      url = 'https://api.cerebras.ai/v1/chat/completions';
      body.model = 'llama3.1-8b';
    } else if (provider === 'openrouter') {
      url = 'https://openrouter.ai/api/v1/chat/completions';
      body.model = 'meta-llama/llama-3.1-8b-instruct';
    } else if (provider === 'openai') {
      url = 'https://api.openai.com/v1/chat/completions';
      body.model = 'gpt-4o-mini';
    } else {
      url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
      body.model = 'qwen2.5:3b'; // Or generic
    }

    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      console.error('LLM API Error:', await res.text());
      return null;
    }

    const data = await res.json();
    const content = data.choices?.[0]?.message?.content;
    if (!content) return null;

    // Safely parse JSON from LLM
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]) as AIInsightsResult;
    }
    return JSON.parse(content) as AIInsightsResult;
  } catch (err) {
    console.error('Failed to generate AI insights:', err);
    return null;
  }
}
