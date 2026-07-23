import AudioCleanupTool from '@/components/AudioCleanupTool';
import { AuthGate } from '@/components/AuthGate';

export const metadata = {
  title: 'ทำความสะอาดไฟล์เสียง — CAPCUT Easy CUT',
  description: 'ตัดคำพูดติดขัด/พูดซ้ำ + ตัดช่วงเงียบ ออกจากไฟล์เสียงล้วน (ไม่ต้องมีวิดีโอ)',
};

export default function AudioPage() {
  return (
    <AuthGate>
      <AudioCleanupTool />
    </AuthGate>
  );
}
