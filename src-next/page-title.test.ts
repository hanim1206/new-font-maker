import { describe, expect, it } from 'vitest'
import { pageTitleOf } from './pageTitle'

describe('pageTitleOf', () => {
  it('화면 이름 뒤에 서비스 이름을 붙인다', () => {
    expect(pageTitleOf('자소 편집')).toBe('자소 편집 · 한글칸글')
  })
  it('이름이 없거나 비면 서비스 이름만', () => {
    expect(pageTitleOf(null)).toBe('한글칸글')
    expect(pageTitleOf('  ')).toBe('한글칸글')
  })
})
