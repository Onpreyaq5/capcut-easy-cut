'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Moon, Sun, Scissors, Sparkles } from 'lucide-react';
import { useApp } from '@/lib/store';
import { cn } from '@/lib/utils';

const links = [
  { href: '/', label: 'ตัดออโต้' },
];

export function Navbar() {
  const pathname = usePathname();
  const theme = useApp((s) => s.settings.theme);
  const toggleTheme = useApp((s) => s.toggleTheme);

  return (
    <header className="sticky top-0 z-50 border-b border-border/80 glass">
      <nav className="container-page flex h-[68px] items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="grid h-10 w-10 place-items-center rounded-lg grad-hero text-white shadow-glow-ai transition-transform group-hover:scale-105">
            <Scissors className="h-5 w-5" />
          </span>
          <span className="flex flex-col leading-none">
            <span className="font-heading text-[15px] font-bold text-text-primary sm:text-base">CAPCUT Easy CUT</span>
            <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold tracking-normal text-ai">
              <Sparkles className="h-3 w-3" /> AUTO SUBTITLE
            </span>
          </span>
        </Link>

        <div className="hidden items-center gap-1 md:flex">
          {links.map((l) => {
            const active = l.href === '/' ? pathname === '/' : pathname.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={cn(
                  'rounded-sm px-3.5 py-2 text-sm font-medium transition-colors',
                  active ? 'bg-primary-soft text-primary' : 'text-text-secondary hover:bg-surface-muted',
                )}
              >
                {l.label}
              </Link>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <span className="hidden items-center gap-1.5 rounded-md border border-primary/15 bg-primary-soft px-3 py-1.5 text-xs font-semibold text-primary sm:inline-flex">
            <span className="h-2 w-2 rounded-full bg-success" />
            พร้อมตัดคลิป
          </span>
          <button
            onClick={toggleTheme}
            className="grid h-10 w-10 place-items-center rounded-md border border-border bg-surface text-text-secondary shadow-sm transition-colors hover:bg-surface-muted"
            aria-label="สลับธีม"
          >
            {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>
        </div>
      </nav>
    </header>
  );
}
