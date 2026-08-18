import { describe, expect, it } from 'vitest'
import { detectScaleAxis } from './useUnifiedTrackpad'

describe('detectScaleAxis', () => {
  it('데드존 전에는 축을 정하지 않는다', () => {
    expect(detectScaleAxis(5, 3, 8)).toBeNull()
  })

  it('우세한 간격 변화 방향으로 축을 잠근다', () => {
    expect(detectScaleAxis(12, 3, 8)).toBe('x')
    expect(detectScaleAxis(2, -11, 8)).toBe('y')
  })

  it('거의 대각선인 입력은 더 움직인 뒤 가까운 축을 선택한다', () => {
    expect(detectScaleAxis(9, 8, 8)).toBeNull()
    expect(detectScaleAxis(18, 16, 8)).toBe('x')
  })
})
