'use client';
// ทรานสิชั่นเปลี่ยนหน้า — ใช้ CSS เพื่อลด bundle และไม่ผูกกับ animation runtime

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in">
      {children}
    </div>
  );
}
