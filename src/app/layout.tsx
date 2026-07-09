import type { Metadata, Viewport } from 'next';
import { Noto_Sans_Thai, IBM_Plex_Sans_Thai, Inter, Space_Grotesk } from 'next/font/google';
import './globals.css';
import { Navbar } from '@/components/Navbar';
import { ThemeSync } from '@/components/ThemeSync';

const notoThai = Noto_Sans_Thai({ subsets: ['thai'], weight: ['400', '500', '600', '700'], variable: '--font-noto-thai', display: 'swap' });
const plexThai = IBM_Plex_Sans_Thai({ subsets: ['thai'], weight: ['400', '500', '600', '700'], variable: '--font-plex-thai', display: 'swap' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });
const space = Space_Grotesk({ subsets: ['latin'], variable: '--font-space', display: 'swap' });

export const metadata: Metadata = {
  title: 'CAPCUT Easy CUT — ลากคลิปใส่ ตัด Dead air + ทำซับอัตโนมัติ',
  description: 'ลากคลิปใส่เว็บ ระบบวิเคราะห์เสียง ตัดช่วงเงียบออก ทำซับไตเติ้ล .srt และดาวน์โหลดไฟล์ไปใช้ต่อใน CapCut',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#2e7d3e',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="th" className={`${notoThai.variable} ${plexThai.variable} ${inter.variable} ${space.variable}`} suppressHydrationWarning>
      <body className="h-screen w-screen overflow-hidden flex flex-col">
        <ThemeSync />
        <Navbar />
        <main className="flex-1 overflow-hidden">{children}</main>
      </body>
    </html>
  );
}
