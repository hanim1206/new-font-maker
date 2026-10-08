import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { productFiles } from './styleGuard'

/**
 * 전역 기울기는 글자 잉크를 그리는 모든 제품 화면에 걸린다(10-07 사용자). 곧게 두는 것은 상자 · 보선뿐이다.
 * 한 화면만 곧게 남는 일이 두 번 있었다(획 편집의 닿는 글자 줄, 레이아웃 캔버스). 그래서 기울기를 빼는 길을 여기서 막는다.
 */
const sources = () => productFiles().map((file) => ({ file: file.slice(file.indexOf('src-next/')), text: readFileSync(file, 'utf8') }))

describe('기울기 가드', () => {
  it('제품 화면은 전역 스타일에서 기울기를 빼지 않는다(`slant: 0`, `upright`)', () => {
    const found = sources().flatMap(({ file, text }) => text.split('\n').flatMap((line, index) =>
      /slant:\s*0\b|<AppGlyph\b[^>]*\bupright\b/.test(line) ? [`${file}:${index + 1} ${line.trim().slice(0, 80)}`] : []))
    expect(found).toEqual([])
  })

  it('맞춤 잉크(`useFitInkStyle`, 기울기 없이 만든다)를 쓰는 화면은 그릴 때 기울기를 건다', () => {
    const missing = sources().filter(({ text }) => /=\s*useFitInkStyle\(/.test(text) && !/skewX\(/.test(text)).map(({ file }) => file)
    expect(missing).toEqual([])
  })
})
