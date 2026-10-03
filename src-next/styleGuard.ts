import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'

/**
 * 스타일 가드(docs/plans/2026-10-03_스타일-공통화.md 6단계). 제품 화면 파일에서
 * 날 색 · 날 `<button>` · 단계 밖 글자 크기 · 모서리 · 굵기를 찾는다. 테스트(`style-guard.test.ts`)와 집계 스크립트가 같이 쓴다.
 *
 * 제품 화면 = `main.tsx`에서 import로 닿는 `src-next` 파일. 실험실 · 관리자 · 개발 도구 입구에서 끊는다.
 * 캔버스(SVG) 안 색은 편집 색 토큰으로만 옮기고 `<button>` 검사에서는 뺄 수 없으니, 예외는 줄 끝 `style-guard: allow` 주석으로 적는다.
 */

const ROOT = resolve(dirname(new URL(import.meta.url).pathname), '..')
const SRC = join(ROOT, 'src-next')

/** 여기서 그래프를 끊는다 — 개발 서버 전용이거나 관리자 화면. */
/** 토큰 거울(SVG 속성용 값). `edit-colors.test.ts`가 `src/index.css`와 맞춘다. */
const TOKEN_MIRRORS = [/\/editColors\.ts$/]
const CUT = [/\/devLabs\.tsx$/, /\/devPages\.tsx$/, /\/admin\//, /\/mountScreenSpecButton/, /\/ScreenSpecButton/, /\/devCrash\.tsx$/, /\/DevGhostToggle/, /\/components\/ui\//]

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : spec.startsWith('.') ? resolve(dirname(from), spec) : null
  if (!base) return null
  for (const candidate of [base, `${base}.tsx`, `${base}.ts`, join(base, 'index.tsx'), join(base, 'index.ts')]) {
    if (existsSync(candidate) && /\.(tsx?|css)$/.test(candidate)) return candidate
  }
  return null
}

export function productFiles(): string[] {
  const seen = new Set<string>()
  const queue = [join(SRC, 'main.tsx')]
  while (queue.length) {
    const file = queue.pop()!
    if (seen.has(file) || !file.startsWith(SRC) || CUT.some((cut) => cut.test(file))) continue
    seen.add(file)
    if (file.endsWith('.css')) continue
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/(?:import|export)[^'"]*?from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g)) {
      const target = resolveImport(file, match[1] ?? match[2] ?? match[3])
      if (target) queue.push(target)
    }
  }
  return [...seen].filter((file) => !/\.test\.tsx?$/.test(file)).sort()
}

export interface Finding { file: string; line: number; kind: 'color' | 'button' | 'font-size' | 'radius' | 'weight'; text: string }

const FONT_STEPS = new Set([10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 36])
const RADIUS_STEPS = new Set([0, 4, 6, 10, 14, 18, 999, 9999])
const WEIGHT_STEPS = new Set([400, 500, 600, 700, 800])
const ALLOW = /style-guard:\s*allow/
/** 없는 토큰이면 대체값이 그대로 보인다 — 색 토큰에는 대체값을 달지 않는다. */
const FALLBACK = /var\(--color-[\w-]+\s*,/
/** 이름 색. 마스크(알파만 씀)의 black은 괜찮다. */
const NAMED = /(?:^|[;{\s])(?:color|background(?:-color)?|fill|stroke|border(?:-color)?|outline-color):\s*(?:white|black)\b/
const COLOR = /#[0-9a-fA-F]{3,8}\b|\brgba?\(\s*\d|\bhsla?\(\s*\d/

export function scan(files = productFiles()): Finding[] {
  const findings: Finding[] = []
  for (const file of files) {
    if (TOKEN_MIRRORS.some((mirror) => mirror.test(file))) continue
    const rel = relative(ROOT, file)
    const css = file.endsWith('.css')
    readFileSync(file, 'utf8').split('\n').forEach((text, index) => {
      if (ALLOW.test(text)) return
      const line = index + 1
      const push = (kind: Finding['kind']) => findings.push({ file: rel, line, kind, text: text.trim().slice(0, 160) })
      // 색: 토큰(`var(--…)`)을 거치지 않은 값. `rgb(var(--x) / .5)`는 토큰이라 괜찮다.
      if (COLOR.test(text.replace(/rgba?\(\s*var\([^)]*\)[^)]*\)/g, '')) || FALLBACK.test(text) || (css && NAMED.test(text))) push('color')
      if (!css && /<button[\s>]/.test(text)) push('button')
      if (css) {
        for (const m of text.matchAll(/font-size:\s*([\d.]+)px/g)) if (!FONT_STEPS.has(Number(m[1]))) push('font-size')
        for (const m of text.matchAll(/border-radius:\s*([^;}]+)/g)) {
          if (m[1].split(/\s+/).some((part) => /^[\d.]+px$/.test(part) && !RADIUS_STEPS.has(parseFloat(part)))) push('radius')
        }
        for (const m of text.matchAll(/font-weight:\s*(\d+)/g)) if (!WEIGHT_STEPS.has(Number(m[1]))) push('weight')
      }
    })
  }
  return findings
}
