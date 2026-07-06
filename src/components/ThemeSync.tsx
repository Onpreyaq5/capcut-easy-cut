'use client';

import { useEffect } from 'react';
import { useApp } from '@/lib/store';

/** ซิงค์ธีม light/dark ลงบน <html class="dark"> ตามค่าใน store */
export function ThemeSync() {
  const theme = useApp((s) => s.settings.theme);
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
  }, [theme]);
  return null;
}
