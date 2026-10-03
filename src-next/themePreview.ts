/**
 * 스타일가이드 미리보기(docs/plans/2026-10-03_스타일-공통화.md). 주색 · 테마를 이 브라우저에만 저장하고
 * 개발 서버의 모든 화면이 열릴 때 덮어 쓴다. 정해지면 `src/index.css` 토큰에 굳히고 여기 값은 지운다.
 * 프로덕션은 부르지 않는다(`main.tsx`가 DEV일 때만).
 */

export const THEME_PREVIEW_KEY = 'font-maker-theme-preview-v1'

export interface ThemePreview {
  /** `#rrggbb`. 없으면 토큰 기본값. */
  primary?: string
  theme?: 'light' | 'dark'
}

type Rgb = [number, number, number]

export function hexToRgb(hex: string): Rgb | null {
  const match = /^#?([0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  const n = parseInt(match[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** a를 b 쪽으로 t만큼. */
const mix = (a: Rgb, b: Rgb, t: number): Rgb => a.map((v, i) => Math.round(v + (b[i] - v) * t)) as Rgb
const triplet = (rgb: Rgb) => rgb.join(' ')

/**
 * 주색 하나에서 짝 셋을 만든다. 비율은 지금 기본 파랑(47 111 237)의 짝에 맞췄다:
 * 진한 짝 = 검정 쪽 15%(→ 40 94 201, 지금 35 88 201), 옅은 짝 = 흰색 쪽 90%(→ 234 241 253, 지금 232 240 255).
 */
export function primaryTokens(hex: string): Record<string, string> | null {
  const rgb = hexToRgb(hex)
  if (!rgb) return null
  return {
    '--color-primary': triplet(rgb),
    '--color-primary-dark': triplet(mix(rgb, [0, 0, 0], 0.15)),
    '--color-primary-light': triplet(mix(rgb, [255, 255, 255], 0.9)),
  }
}

export function readThemePreview(storage: Pick<Storage, 'getItem'>): ThemePreview {
  try {
    const value = JSON.parse(storage.getItem(THEME_PREVIEW_KEY) ?? '{}') as unknown
    return value && typeof value === 'object' ? value as ThemePreview : {}
  } catch { return {} }
}

export function writeThemePreview(storage: Pick<Storage, 'setItem' | 'removeItem'>, preview: ThemePreview) {
  const empty = !preview.primary && (!preview.theme || preview.theme === 'light')
  try {
    if (empty) storage.removeItem(THEME_PREVIEW_KEY)
    else storage.setItem(THEME_PREVIEW_KEY, JSON.stringify(preview))
  } catch { /* 저장 못 해도 이 화면엔 이미 칠했다 */ }
}

const PRIMARY_KEYS = ['--color-primary', '--color-primary-dark', '--color-primary-light']

export function applyThemePreview(root: HTMLElement, preview: ThemePreview) {
  const tokens = preview.primary ? primaryTokens(preview.primary) : null
  for (const key of PRIMARY_KEYS) {
    if (tokens) root.style.setProperty(key, tokens[key])
    else root.style.removeProperty(key)
  }
  if (preview.theme === 'dark') root.dataset.theme = 'dark'
  else delete root.dataset.theme
}

/** 열 때 한 번 칠하고, 다른 탭(스타일가이드)에서 바꾸면 따라 칠한다. */
export function startThemePreview() {
  const paint = () => applyThemePreview(document.documentElement, readThemePreview(window.localStorage))
  paint()
  window.addEventListener('storage', (event) => { if (event.key === THEME_PREVIEW_KEY || event.key === null) paint() })
}
