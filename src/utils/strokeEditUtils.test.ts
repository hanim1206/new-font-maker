import { describe, expect, it } from 'vitest'
import type { StrokeDataV2 } from '../types'
import { mergeStrokes, splitStroke } from './strokeEditUtils'

describe('splitStroke', () => {
  it('분리된 두 획이 연결점과 곡선 손잡이 객체를 공유하지 않는다', () => {
    const stroke: StrokeDataV2 = {
      id: 'stroke-1',
      points: [
        { x: 0.1, y: 0.2 },
        { x: 0.5, y: 0.5, handleIn: { x: 0.4, y: 0.5 }, handleOut: { x: 0.6, y: 0.5 } },
        { x: 0.9, y: 0.8 },
      ],
      closed: false,
      thickness: 0.07,
    }

    const result = splitStroke(stroke, 1)
    expect(result).not.toBeNull()
    const [first, second] = result!
    const firstJunction = first.points[first.points.length - 1]
    const secondJunction = second.points[0]

    expect(firstJunction).toEqual(secondJunction)
    expect(firstJunction).not.toBe(secondJunction)
    expect(firstJunction.handleIn).not.toBe(secondJunction.handleIn)
    expect(firstJunction.handleOut).not.toBe(secondJunction.handleOut)

    secondJunction.x += 0.1
    secondJunction.handleOut!.x += 0.1
    expect(firstJunction.x).toBe(0.5)
    expect(firstJunction.handleOut?.x).toBe(0.6)
  })
})

describe('mergeStrokes', () => {
  // A: 곡선 하나(0,0 → 0.5,0), 나가는 손잡이가 위로 휜다.
  const curveA: StrokeDataV2 = {
    id: 'a',
    points: [{ x: 0, y: 0, handleOut: { x: 0.2, y: -0.2 } }, { x: 0.5, y: 0, handleIn: { x: 0.3, y: -0.2 } }],
    closed: false,
    thickness: 0.07,
    linecap: 'round',
  }

  it('끝끼리 이을 때 두 획의 곡선 손잡이를 그대로 둔다', () => {
    const b: StrokeDataV2 = { id: 'b', points: [{ x: 0.5, y: 0, handleOut: { x: 0.6, y: 0.2 } }, { x: 1, y: 0, handleIn: { x: 0.9, y: 0.2 } }], closed: false, thickness: 0.07 }
    const merged = mergeStrokes(curveA, b)!
    expect(merged.points).toEqual([
      { x: 0, y: 0, handleOut: { x: 0.2, y: -0.2 } },
      // 이음매: A 쪽 들어오는 손잡이 + 지운 B 첫 점의 나가는 손잡이
      { x: 0.5, y: 0, handleIn: { x: 0.3, y: -0.2 }, handleOut: { x: 0.6, y: 0.2 } },
      { x: 1, y: 0, handleIn: { x: 0.9, y: 0.2 } },
    ])
  })

  it('뒤집어 이을 때 점마다 들어오는 · 나가는 손잡이를 바꾼다', () => {
    // B를 거꾸로 그렸다: 1,0 → 0.5,0. A 끝(0.5,0)과 B 끝이 만난다.
    const b: StrokeDataV2 = { id: 'b', points: [{ x: 1, y: 0, handleOut: { x: 0.9, y: 0.2 } }, { x: 0.5, y: 0, handleIn: { x: 0.6, y: 0.2 } }], closed: false, thickness: 0.07 }
    const merged = mergeStrokes(curveA, b)!
    expect(merged.points.map((point) => point.x)).toEqual([0, 0.5, 1])
    expect(merged.points[1].handleOut).toEqual({ x: 0.6, y: 0.2 })
    expect(merged.points[2]).toEqual({ x: 1, y: 0, handleIn: { x: 0.9, y: 0.2 } })
  })

  it('획 설정(끝 모양)은 남기고 원본은 건드리지 않는다', () => {
    const b: StrokeDataV2 = { id: 'b', points: [{ x: 0.5, y: 0 }, { x: 1, y: 0 }], closed: false, thickness: 0.07 }
    const before = structuredClone(curveA)
    const merged = mergeStrokes(curveA, b)!
    expect(merged.linecap).toBe('round')
    merged.points[1].handleOut = { x: 9, y: 9 }
    expect(curveA).toEqual(before)
  })
})
