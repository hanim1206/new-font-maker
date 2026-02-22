/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        background: '#0a0a0a',
        foreground: '#f5f5f5',
        border: '#2a2a2a',
        ring: '#7c3aed',
        surface: {
          DEFAULT: '#141414',
          2: '#1a1a1a',
          3: '#222222',
          4: '#2a2a2a',
          hover: '#252525',
        },
        primary: {
          DEFAULT: '#7c3aed',
          dark: '#6d28d9',
          light: '#a855f7',
          foreground: '#ffffff',
        },
        accent: {
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
          DEFAULT: '#888888',
          foreground: '#aaaaaa',
        },
        'text-dim': {
          1: '#cccccc',
          2: '#aaaaaa',
          3: '#999999',
          4: '#888888',
          5: '#666666',
          6: '#555555',
        },
        'border-light': '#3a3a3a',
        'border-lighter': '#333333',
        'border-subtle': '#1a1a1a',
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
        sm: '4px',
        DEFAULT: '6px',
        md: '8px',
        lg: '10px',
        xl: '12px',
      },
      fontSize: {
        'micro': '0.65rem',
        'xs': '0.75rem',
        'sm': '0.85rem',
        'base': '0.9rem',
        'lg': '1rem',
        'xl': '1.1rem',
        '2xl': '1.3rem',
        '3xl': '1.5rem',
      },
      spacing: {
        'safe-t': 'env(safe-area-inset-top)',
        'safe-b': 'env(safe-area-inset-bottom)',
        'safe-l': 'env(safe-area-inset-left)',
        'safe-r': 'env(safe-area-inset-right)',
      },
      minWidth: {
        'touch': '44px',
      },
      minHeight: {
        'touch': '44px',
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
  plugins: [require('tailwindcss-animate')],
}
