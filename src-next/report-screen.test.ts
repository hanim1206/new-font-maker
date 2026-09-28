import { describe, expect, it } from 'vitest'
import { screenOf } from './feedback'

describe('제보 판 화면 이름', () => {
  it('경로 → 화면 이름', () => {
    expect(screenOf('/dashboard')).toBe('대시보드')
    expect(screenOf('/dashboard/jungseong')).toBe('고칠 중성')
    expect(screenOf('/workspace/review/ㄱ')).toBe('검수')
    expect(screenOf('/workspace/font')).toBe('스타일')
    expect(screenOf('/workspace/font/export')).toBe('폰트 완성')
    expect(screenOf('/workspace/jamo')).toBe('자소 편집')
    expect(screenOf('/')).toBe('문장 보정')
  })
})
