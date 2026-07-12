'use client';
// ทรานสิชั่นเปลี่ยนหน้า — เฟด/สไลด์เข้านุ่ม ๆ ทุกครั้งที่เปลี่ยนหน้า
import { motion } from 'framer-motion';

export default function Template({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 0.61, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}
