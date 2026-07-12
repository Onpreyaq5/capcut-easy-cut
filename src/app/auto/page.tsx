import { EasyCutTool } from '@/components/EasyCutTool';
import { AuthGate } from '@/components/AuthGate';

export const metadata = {
  title: 'ตัดออโต้ — CAPCUT Easy CUT',
  description: 'อัปคลิปดิบ → ตัด Dead air + ถอดเสียงทำซับไทยอัตโนมัติ พร้อมส่งเข้า CapCut',
};

export default function AutoPage() {
  return (
    <AuthGate>
      <EasyCutTool />
    </AuthGate>
  );
}
