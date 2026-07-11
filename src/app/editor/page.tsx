import SubtitleEditor from '@/components/editor/SubtitleEditor';

export const metadata = {
  title: 'ตัวแก้ซับ — CAPCUT Easy CUT',
  description: 'แก้ซับ เลือกฟอนต์/เทมเพลต/สไตล์ พร้อมพรีวิวสด แล้วส่งออก SRT หรือเข้า CapCut',
};

export default function EditorPage() {
  return <SubtitleEditor />;
}
