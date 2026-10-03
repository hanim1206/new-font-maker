import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { EDIT_COLOR } from './editColors'

/** `--color-x: var(--palette-y)` 사슬을 따라가 `R G B`를 얻는다. */
function tokenRgb(css: string, name: string): string {
  const value = new RegExp(`${name}:\\s*([^;]+);`).exec(css)?.[1].trim()
  if (!value) throw new Error(`${name} 없음`)
  const ref = /^var\((--[\w-]+)\)$/.exec(value)
  return ref ? tokenRgb(css, ref[1]) : value
}

const hexRgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(' ')
const tokenOf = (key: string) => `--color-${key.replace(/([A-Z0-9])/g, (c) => `-${c.toLowerCase()}`).replace(/-(\d)/, '-$1')}`

describe('캔버스 색 = 토큰', () => {
  const css = readFileSync(new URL('../src/index.css', import.meta.url), 'utf8')
  for (const [key, hex] of Object.entries(EDIT_COLOR)) {
    it(`${key} = ${tokenOf(key)}`, () => expect(hexRgb(hex)).toBe(tokenRgb(css, tokenOf(key))))
  }
})
