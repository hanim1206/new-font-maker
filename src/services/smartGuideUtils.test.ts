import { describe, expect, it } from 'vitest'
import { findSmartGuideSnap } from './smartGuideUtils'

describe('findSmartGuideSnap', () => {
  it('다른 자소의 같은 끝선에 가까워지면 가장 가까운 안내선을 선택한다', () => {
    const result = findSmartGuideSnap(
      {
        minX: 0.203,
        centerX: 0.303,
        maxX: 0.403,
        minY: 0.1,
        centerY: 0.2,
        maxY: 0.3,
      },
      [{
        label: 'ㅁ',
        bounds: {
          minX: 0.2,
          centerX: 0.5,
          maxX: 0.8,
          minY: 0.7,
          centerY: 0.8,
          maxY: 0.9,
        },
      }],
      0.01
    )

    expect(result.correctionX).toBeCloseTo(-0.003)
    expect(result.correctionY).toBeNull()
    expect(result.guides).toEqual([{ axis: 'x', position: 0.2, label: 'ㅁ 왼쪽 맞춤' }])
  })

  it('임계값 밖에서는 안내선과 보정을 만들지 않는다', () => {
    const result = findSmartGuideSnap(
      {
        minX: 0.1,
        centerX: 0.2,
        maxX: 0.3,
        minY: 0.1,
        centerY: 0.2,
        maxY: 0.3,
      },
      [{
        label: 'ㅗ',
        bounds: {
          minX: 0.5,
          centerX: 0.6,
          maxX: 0.7,
          minY: 0.5,
          centerY: 0.6,
          maxY: 0.7,
        },
      }],
      0.01
    )

    expect(result).toEqual({ correctionX: null, correctionY: null, guides: [] })
  })
})
