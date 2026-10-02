import tailwindAnimate from 'tailwindcss-animate'

/** @type {import('tailwindcss').Config} */
export default {
  // 제품 화면도 Tailwind 클래스를 쓴다(스타일 공통화). 색 · 크기는 `src/index.css` 토큰만 가리킨다.
  content: ['./index.html', './src/**/*.{ts,tsx}', './src-next/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: 'rgb(var(--color-background) / <alpha-value>)',
        foreground: 'rgb(var(--color-foreground) / <alpha-value>)',
        border: 'rgb(var(--color-border) / <alpha-value>)',
        input: 'rgb(var(--color-input) / <alpha-value>)',
        ring: 'rgb(var(--color-ring) / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(var(--color-card) / <alpha-value>)',
          foreground: 'rgb(var(--color-card-foreground) / <alpha-value>)',
        },
        popover: {
          DEFAULT: 'rgb(var(--color-popover) / <alpha-value>)',
          foreground: 'rgb(var(--color-popover-foreground) / <alpha-value>)',
        },
        secondary: {
          DEFAULT: 'rgb(var(--color-secondary) / <alpha-value>)',
          foreground: 'rgb(var(--color-secondary-foreground) / <alpha-value>)',
        },
        destructive: {
          DEFAULT: 'rgb(var(--color-destructive) / <alpha-value>)',
          foreground: 'rgb(var(--color-destructive-foreground) / <alpha-value>)',
          dark: 'rgb(var(--color-destructive-dark) / <alpha-value>)',
          soft: 'rgb(var(--color-destructive-soft) / <alpha-value>)',
        },
        success: {
          DEFAULT: 'rgb(var(--color-success) / <alpha-value>)',
          soft: 'rgb(var(--color-success-soft) / <alpha-value>)',
        },
        warning: {
          DEFAULT: 'rgb(var(--color-warning) / <alpha-value>)',
          soft: 'rgb(var(--color-warning-soft) / <alpha-value>)',
        },
        edit: {
          select: 'rgb(var(--color-edit-select) / <alpha-value>)',
          'slot-ch': 'rgb(var(--color-edit-slot-ch) / <alpha-value>)',
          'slot-ju': 'rgb(var(--color-edit-slot-ju) / <alpha-value>)',
          'slot-jo': 'rgb(var(--color-edit-slot-jo) / <alpha-value>)',
          'slot-off': 'rgb(var(--color-edit-slot-off) / <alpha-value>)',
          ghost: 'rgb(var(--color-edit-ghost) / <alpha-value>)',
          guide: 'rgb(var(--color-edit-guide) / <alpha-value>)',
          baseline: 'rgb(var(--color-edit-baseline) / <alpha-value>)',
        },
        surface: {
          DEFAULT: 'rgb(var(--color-surface) / <alpha-value>)',
          2: 'rgb(var(--color-surface-2) / <alpha-value>)',
          3: 'rgb(var(--color-surface-3) / <alpha-value>)',
          4: 'rgb(var(--color-surface-4) / <alpha-value>)',
          hover: 'rgb(var(--color-surface-hover) / <alpha-value>)',
        },
        primary: {
          DEFAULT: 'rgb(var(--color-primary) / <alpha-value>)',
          dark: 'rgb(var(--color-primary-dark) / <alpha-value>)',
          light: 'rgb(var(--color-primary-light) / <alpha-value>)',
          foreground: 'rgb(var(--color-primary-foreground) / <alpha-value>)',
        },
        // shadcn `accent`(옅은 hover 바탕). 아래 날 색 묶음은 죽은 `src/components/`만 쓴다 — 지우면서 같이 뺀다.
        accent: {
          DEFAULT: 'rgb(var(--color-accent) / <alpha-value>)',
          foreground: 'rgb(var(--color-accent-foreground) / <alpha-value>)',
          blue: '#2a5cb8',
          'blue-hover': '#3a6cc8',
          'blue-light': '#4a9eff',
          'blue-lighter': '#5aafff',
          'blue-tw': '#3b82f6',
          cyan: '#4ecdc4',
          'cyan-light': '#6de0d8',
          red: '#ff6b6b',
          'red-light': '#ff8585',
          orange: '#ff9500',
          'orange-light': '#ffaa33',
          gold: '#ffd700',
          yellow: '#ffc107',
          royal: '#4169e1',
          purple: '#9b59b6',
          'purple-light': '#a569c6',
          green: '#2a7c4e',
          'green-dark': '#1a5c3e',
          pink: '#ec4899',
        },
        muted: {
          DEFAULT: 'rgb(var(--color-muted) / <alpha-value>)',
          foreground: 'rgb(var(--color-muted-foreground) / <alpha-value>)',
        },
        'text-dim': {
          1: 'rgb(var(--color-text-1) / <alpha-value>)',
          2: 'rgb(var(--color-text-2) / <alpha-value>)',
          3: 'rgb(var(--color-text-3) / <alpha-value>)',
          4: 'rgb(var(--color-text-4) / <alpha-value>)',
          5: 'rgb(var(--color-text-5) / <alpha-value>)',
          6: 'rgb(var(--color-text-6) / <alpha-value>)',
        },
        'border-light': 'rgb(var(--color-border-light) / <alpha-value>)',
        'border-lighter': 'rgb(var(--color-border-lighter) / <alpha-value>)',
        'border-subtle': 'rgb(var(--color-border-subtle) / <alpha-value>)',
        // 슬롯 색상 (CH, JU, JO 등)
        slot: {
          ch: '#ff6b6b',
          ju: '#4ecdc4',
          'ju-h': '#ff9500',
          'ju-v': '#ffd700',
          jo: '#4169e1',
        },
        // 상태별 배경색 (rgba 대응)
        'slot-bg': {
          ch: 'rgba(255, 107, 107, 0.2)',
          ju: 'rgba(78, 205, 196, 0.2)',
          'ju-h': 'rgba(255, 149, 0, 0.2)',
          'ju-v': 'rgba(255, 215, 0, 0.2)',
          jo: 'rgba(65, 105, 225, 0.2)',
        },
        // 위험/경고 상태
        danger: {
          DEFAULT: '#7c2a2a',
          dark: '#5c1a1a',
        },
      },
      fontFamily: {
        sans: ['Pretendard', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'sans-serif'],
        mono: ['SF Mono', 'Monaco', 'Menlo', 'Consolas', 'monospace'],
      },
      borderRadius: {
        xs: 'var(--radius-xs)',
        sm: 'var(--radius-sm)',
        DEFAULT: 'var(--radius-sm)',
        md: 'var(--radius-md)',
        lg: 'var(--radius-lg)',
        xl: 'var(--radius-xl)',
        full: 'var(--radius-full)',
      },
      boxShadow: {
        sm: 'var(--shadow-sm)',
        md: 'var(--shadow-md)',
        overlay: 'var(--shadow-overlay)',
      },
      // 글자 크기 단계(`--font-*`). 옛 rem 이름은 가까운 단계로 모았다(0.85rem → 14 등).
      fontSize: {
        '10': 'var(--font-10)',
        '11': 'var(--font-11)',
        '12': 'var(--font-12)',
        '13': 'var(--font-13)',
        '14': 'var(--font-14)',
        '16': 'var(--font-16)',
        '18': 'var(--font-18)',
        '20': 'var(--font-20)',
        '24': 'var(--font-24)',
        '28': 'var(--font-28)',
        'micro': 'var(--font-10)',
        'xs': 'var(--font-12)',
        'sm': 'var(--font-14)',
        'base': 'var(--font-14)',
        'lg': 'var(--font-16)',
        'xl': 'var(--font-18)',
        '2xl': 'var(--font-20)',
        '3xl': 'var(--font-24)',
      },
      fontWeight: {
        medium: 'var(--weight-medium)',
        semibold: 'var(--weight-semibold)',
        bold: 'var(--weight-bold)',
        extrabold: 'var(--weight-heavy)',
      },
      spacing: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-l': 'env(safe-area-inset-left)',
        'safe-r': 'env(safe-area-inset-right)',
      },
      minWidth: {
        'touch': 'var(--touch-target)',
      },
      minHeight: {
        'touch': 'var(--touch-target)',
      },
      transitionDuration: {
        fast: 'var(--motion-fast)',
        normal: 'var(--motion-normal)',
        slow: 'var(--motion-slow)',
      },
      transitionTimingFunction: {
        standard: 'var(--ease-standard)',
      },
      keyframes: {
        'pulse-dot': {
          '0%, 100%': { opacity: '1', transform: 'scale(1)' },
          '50%': { opacity: '0.5', transform: 'scale(0.9)' },
        },
        'glyph-fade-in': {
          '0%': { opacity: '0', transform: 'scale(0.5)' },
          '60%': { opacity: '1', transform: 'scale(1.05)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'accordion-down': {
          from: { height: '0' },
          to: { height: 'var(--radix-accordion-content-height)' },
        },
        'accordion-up': {
          from: { height: 'var(--radix-accordion-content-height)' },
          to: { height: '0' },
        },
      },
      animation: {
        'pulse-dot': 'pulse-dot 1.5s ease-in-out infinite',
        'glyph-fade-in': 'glyph-fade-in 1.2s cubic-bezier(0.22, 1, 0.36, 1)',
        'accordion-down': 'accordion-down 0.2s ease-out',
        'accordion-up': 'accordion-up 0.2s ease-out',
      },
    },
  },
  plugins: [tailwindAnimate],
}
