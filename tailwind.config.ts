import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: 'class',
  content: ['./src/**/*.{ts,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        bg: 'var(--bg)',
        'bg-subtle': 'var(--bg-subtle)',
        surface: 'var(--surface)',
        'surface-muted': 'var(--surface-muted)',
        'surface-glass': 'var(--surface-glass)',
        border: 'var(--border)',
        'border-strong': 'var(--border-strong)',
        overlay: 'var(--overlay)',
        'text-primary': 'var(--text-primary)',
        'text-secondary': 'var(--text-secondary)',
        'text-muted': 'var(--text-muted)',
        'text-inverse': 'var(--text-inverse)',
        primary: {
          DEFAULT: 'var(--primary)',
          hover: 'var(--primary-hover)',
          active: 'var(--primary-active)',
          soft: 'var(--primary-soft)',
          on: 'var(--on-primary)',
        },
        secondary: {
          DEFAULT: 'var(--secondary)',
          hover: 'var(--secondary-hover)',
          soft: 'var(--secondary-soft)',
          on: 'var(--on-secondary)',
        },
        accent: {
          DEFAULT: 'var(--accent)',
          soft: 'var(--accent-soft)',
          on: 'var(--on-accent)',
        },
        ai: {
          DEFAULT: 'var(--ai)',
          soft: 'var(--ai-soft)',
          on: 'var(--on-ai)',
        },
        success: 'var(--success)',
        warning: 'var(--warning)',
        danger: 'var(--danger)',
        info: 'var(--info)',
        ring: 'var(--ring)',
      },
      fontFamily: {
        sans: ['var(--font-body)', 'LINE Seed Sans TH', 'Noto Sans Thai', 'system-ui', 'sans-serif'],
        heading: ['var(--font-heading)', 'IBM Plex Sans Thai', 'Space Grotesk', 'sans-serif'],
        mono: ['JetBrains Mono', 'IBM Plex Mono', 'ui-monospace', 'monospace'],
      },
      borderRadius: {
        xs: '4px',
        sm: '6px',
        md: '8px',
        lg: '8px',
        xl: '8px',
      },
      boxShadow: {
        sm: '0 1px 2px rgba(15,23,42,.06)',
        md: '0 8px 24px rgba(15,23,42,.08)',
        lg: '0 18px 54px rgba(15,23,42,.10)',
        'glow-ai': '0 0 0 1px rgba(0,122,255,.18), 0 12px 36px rgba(0,122,255,.18)',
      },
      maxWidth: {
        container: '1200px',
        content: '720px',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        float: {
          '0%,100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-6px)' },
        },
      },
      animation: {
        'fade-up': 'fade-up .4s ease-out both',
        shimmer: 'shimmer 1.6s infinite',
        float: 'float 6s ease-in-out infinite',
      },
    },
  },
  plugins: [],
};

export default config;
