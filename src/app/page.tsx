import { EasyCutTool } from '@/components/EasyCutTool';
import { AuthGate } from '@/components/AuthGate';

export default function HomePage() {
  return (
    <AuthGate>
      <EasyCutTool />
    </AuthGate>
  );
}
