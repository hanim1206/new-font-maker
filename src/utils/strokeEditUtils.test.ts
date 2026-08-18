import { describe, expect, it } from 'vitest'
import type { StrokeDataV2 } from '../types'
import { splitStroke } from './strokeEditUtils'

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
