import { describe, expect, it } from 'vitest'
import { THEME_PREVIEW_KEY, applyThemePreview, hexToRgb, primaryTokens, readThemePreview, writeThemePreview } from './themePreview'

const memory = () => {
  const map = new Map<string, string>()
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k), map }
}

describe('스타일가이드 주색 미리보기', () => {
  it('기본 파랑을 넣으면 짝 둘이 지금 토큰과 6 안쪽으로 맞는다', () => {
    const tokens = primaryTokens('#2f6fed')!
    expect(tokens['--color-primary']).toBe('47 111 237')
    const near = (got: string, want: number[]) => got.split(' ').map(Number).forEach((v, i) => expect(Math.abs(v - want[i])).toBeLessThanOrEqual(6))
    near(tokens['--color-primary-dark'], [35, 88, 201])
    near(tokens['--color-primary-light'], [232, 240, 255])
  })

  it('잘못된 색은 무시한다', () => {
    expect(hexToRgb('blue')).toBeNull()
    expect(primaryTokens('#12')).toBeNull()
  })

  it('기본값으로 돌리면 저장 키를 지우고 덮은 값을 걷어 낸다', () => {
    const storage = memory()
    writeThemePreview(storage, { primary: '#e8590c' })
    expect(readThemePreview(storage).primary).toBe('#e8590c')
    const props = new Map<string, string>()
    const style = { setProperty: (k: string, v: string) => void props.set(k, v), removeProperty: (k: string) => void props.delete(k), getPropertyValue: (k: string) => props.get(k) ?? '' }
    const root = { style, dataset: {} as DOMStringMap } as unknown as HTMLElement
    applyThemePreview(root, readThemePreview(storage))
    expect(root.style.getPropertyValue('--color-primary')).toBe('232 89 12')
    writeThemePreview(storage, {})
    expect(storage.map.has(THEME_PREVIEW_KEY)).toBe(false)
    applyThemePreview(root, readThemePreview(storage))
    expect(root.style.getPropertyValue('--color-primary')).toBe('')
    expect(root.dataset.theme).toBeUndefined()
  })
})
