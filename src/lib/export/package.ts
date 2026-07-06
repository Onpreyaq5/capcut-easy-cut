import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { Project, Storyboard } from '@/lib/types';
import { scenesToSrt, secToSrtTime } from './srt';

const BEAT_TH: Record<string, string> = {
  problem: '1·ปัญหา',
  pain: '2·จุดเจ็บ',
  failed_attempts: '3·ลองแล้วพัง',
  turning_point: '4·จุดพลิก',
  result: '5·ผลลัพธ์',
};

function dataUrlToUint8(dataUrl: string): { bytes: Uint8Array; ext: string } | null {
  const m = /^data:([^;]+);base64,(.*)$/s.exec(dataUrl);
  if (!m) return null;
  const mime = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const ext = mime.includes('mpeg') || mime.includes('mp3') ? 'mp3' : mime.includes('wav') ? 'wav' : 'audio';
  return { bytes, ext };
}

function shotlistMd(project: Project, sb: Storyboard): string {
  const lines: string[] = [];
  lines.push(`# ${sb.videoTitle}`);
  lines.push('');
  lines.push(`- โครงเล่าเรื่อง: **${sb.storyFramework}**`);
  lines.push(`- อัตราส่วน: ${sb.aspectRatio} · ความยาวรวม: ${sb.totalDurationSec} วินาที · ${sb.scenes.length} ช็อต`);
  lines.push(`- ตัวละคร: ${sb.characterBible.name} — ${sb.characterBible.appearance}`);
  lines.push('');
  lines.push('| # | จังหวะ | เวลา | ภาพ | ซับบนจอ | บทพากย์ |');
  lines.push('|---|--------|------|-----|---------|---------|');
  sb.scenes.forEach((sc, i) => {
    const time = `${secToSrtTime(sc.startSec).slice(3, 8)}–${secToSrtTime(sc.endSec).slice(3, 8)}`;
    const esc = (s: string) => (s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
    lines.push(
      `| ${i + 1} | ${BEAT_TH[sc.beat] ?? sc.beat} | ${time} | ${esc(sc.shotDescription)} | ${esc(sc.onScreenText)} | ${esc(sc.voiceoverTH)} |`,
    );
  });
  lines.push('');
  lines.push('## เหตุผลการกำกับ');
  lines.push(sb.reasoning || '-');
  return lines.join('\n');
}

function veoPromptsTxt(sb: Storyboard): string {
  return sb.scenes
    .map(
      (sc, i) =>
        `### SCENE ${i + 1} [${sc.beat}] ${sc.startSec}-${sc.endSec}s\n${sc.veoPrompt}\n`,
    )
    .join('\n');
}

function characterPromptsTxt(sb: Storyboard): string {
  const head =
    `CHARACTER BIBLE (ใช้ซ้ำทุกช็อตเพื่อให้ตัวละครคงเดิม)\n` +
    `Name: ${sb.characterBible.name}\nAppearance: ${sb.characterBible.appearance}\n` +
    `Outfit: ${sb.characterBible.outfit}\nVoice: ${sb.characterBible.voiceProfile}\n\n`;
  const body = sb.scenes
    .filter((s) => s.characterSpeakingPrompt)
    .map(
      (sc, i) =>
        `### SCENE ${i + 1} (${sc.startSec}-${sc.endSec}s)\nPROMPT: ${sc.characterSpeakingPrompt}\nVOICEOVER(TH): ${sc.voiceoverTH}\nVOICE HINT: ${sc.ttsVoiceHint}\n`,
    )
    .join('\n');
  return head + body;
}

const RES: Record<string, string> = { '9:16': '1080×1920', '16:9': '1920×1080', '1:1': '1080×1080' };

const README = (sb: Storyboard) => `# วิธีนำไฟล์เข้า CapCut — ${sb.videoTitle}

โฟลเดอร์นี้คือชุดไฟล์พร้อมตัดต่อคลิปขายปุ๋ยของคุณ ทำตามนี้ทีละขั้น

## ในแพ็กเกจมีอะไรบ้าง
- **subtitles_voiceover.srt** — ซับไตเติลบทพากย์เต็ม (ตรงเวลาทุกช็อต)
- **subtitles_onscreen.srt** — ซับพาดหัวสั้นๆ บนจอ (hook/ตัวเลข)
- **veo_prompts.txt** — prompt สำหรับสร้างวิดีโอแต่ละช็อตใน Google Flow / Veo (1 ช็อต = 1 prompt)
- **character_prompts.txt** — prompt ตัวละครพูด + บทพากย์ + คำใบ้น้ำเสียง
- **voiceover/** — บทพากย์แยกช็อต (.txt) และไฟล์เสียง (.mp3) ถ้าสร้างไว้แล้ว
- **shotlist.md** — ตารางสตอรีบอร์ดอ่านง่าย
- **project.json** — ข้อมูลโปรเจกต์ทั้งหมด (เผื่อแก้/นำกลับเข้าเว็บ)

## ขั้นตอน
1) **สร้างวิดีโอแต่ละช็อต**: เปิด Google Flow (Veo) แล้ววาง prompt จาก \`veo_prompts.txt\` ทีละช็อต ตั้งค่าอัตราส่วน **${sb.aspectRatio}** ดาวน์โหลดคลิปมาเก็บ (ตั้งชื่อ scene1, scene2, ...)
2) **เปิด CapCut** สร้างโปรเจกต์ใหม่ อัตราส่วน **${sb.aspectRatio}**
3) ลากคลิปทุกช็อตเรียงตามลำดับบนไทม์ไลน์ (ดูเวลาในไฟล์ \`shotlist.md\`)
4) **ใส่เสียงพากย์**: ถ้ามีไฟล์ใน \`voiceover/*.mp3\` ลากวางตามเวลาแต่ละช็อต — ถ้าไม่มี ใช้ฟีเจอร์ "ข้อความเป็นเสียงพูด" ของ CapCut โดยก๊อปบทจาก \`voiceover/*.txt\`
5) **ใส่ซับ**: เมนู Captions/ข้อความ → Import → เลือก \`subtitles_voiceover.srt\` (หรือ onscreen) ซับจะวางตรงเวลาให้อัตโนมัติ
6) ใส่เพลงประกอบ + ปรับสีฟิล์มอุ่นๆ ตามต้องการ แล้ว Export ${RES[sb.aspectRatio] ?? '1080×1920'} (${sb.aspectRatio})

> เคล็ดลับความต่อเนื่องตัวละคร: ใน Flow ให้วางคำบรรยายหน้าตา/ชุดของตัวละคร (อยู่ต้นแต่ละ prompt อยู่แล้ว) เหมือนกันทุกช็อต ตัวละครจะหน้าเหมือนกันทั้งคลิป
`;

/** สร้าง zip แพ็กเกจ CapCut แล้วสั่งดาวน์โหลด */
export async function downloadCapcutPackage(project: Project): Promise<void> {
  const sb = project.storyboard;
  if (!sb) throw new Error('ยังไม่มี storyboard ให้ส่งออก');
  const zip = new JSZip();

  zip.file('subtitles_voiceover.srt', scenesToSrt(sb.scenes, 'voiceoverTH'));
  zip.file('subtitles_onscreen.srt', scenesToSrt(sb.scenes, 'onScreenText'));
  zip.file('veo_prompts.txt', veoPromptsTxt(sb));
  zip.file('character_prompts.txt', characterPromptsTxt(sb));
  zip.file('shotlist.md', shotlistMd(project, sb));
  zip.file('README_CapCut.md', README(sb));
  zip.file(
    'project.json',
    JSON.stringify(
      {
        name: project.name,
        story: project.story,
        productScripts: project.productScripts,
        storyboard: sb,
      },
      null,
      2,
    ),
  );

  if (project.socialPosts?.length) {
    const md =
      `# แคปชันพร้อมโพสต์ — ${sb.videoTitle}\n\n` +
      project.socialPosts
        .map(
          (p) =>
            `## ${p.platform}\n${p.hook ? p.hook + '\n\n' : ''}${p.caption}\n\n${p.hashtags.join(' ')}${p.cta ? '\n\n' + p.cta : ''}`,
        )
        .join('\n\n---\n\n');
    zip.file('social_captions.md', md);
  }

  const vo = zip.folder('voiceover')!;
  sb.scenes.forEach((sc, i) => {
    const base = `scene${String(i + 1).padStart(2, '0')}_${sc.beat}`;
    vo.file(`${base}.txt`, sc.voiceoverTH || '');
    const audio = project.audio?.[sc.id];
    if (audio) {
      const a = dataUrlToUint8(audio);
      if (a) vo.file(`${base}.${a.ext}`, a.bytes);
    }
  });

  const blob = await zip.generateAsync({ type: 'blob' });
  const safe = (sb.videoTitle || 'thanyakij_clip').replace(/[^\p{L}\p{N}_-]+/gu, '_').slice(0, 40);
  saveAs(blob, `${safe}_capcut.zip`);
}
