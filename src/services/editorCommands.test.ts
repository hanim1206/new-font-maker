import { describe, expect, it } from 'vitest'
import type { JamoData } from '../types'
import { moveStroke } from './editorCommands'

const baseJamo: JamoData = {
  char: 'ㄱ',
  type: 'choseong',
  strokes: [{
    id: 'ㄱ-1',
    points: [
      { x: 0.2, y: 0.2 },
      { x: 0.8, y: 0.2, handleOut: { x: 0.85, y: 0.25 } },
      { x: 0.8, y: 0.8 },
    ],
    closed: false,
    thickness: 0.07,
  }],
}

describe('moveStroke', () => {
  it('획의 모든 점과 핸들을 같은 거리만큼 이동한다', () => {
    const result = moveStroke(baseJamo, 'ㄱ-1', { x: 0.1, y: -0.1 })
    expect(result.changed).toBe(true)
    expect(result.delta).toEqual({ x: 0.1, y: -0.1 })
    expect(result.jamo.strokes?.[0].points[0].x).toBeCloseTo(0.3)
    expect(result.jamo.strokes?.[0].points[0].y).toBeCloseTo(0.1)
    expect(result.jamo.strokes?.[0].points[1].handleOut?.x).toBeCloseTo(0.95)
    expect(result.jamo.strokes?.[0].points[1].handleOut?.y).toBeCloseTo(0.15)
    expect(baseJamo.strokes?.[0].points[0]).toMatchObject({ x: 0.2, y: 0.2 })
  })

  it('앵커가 자모 박스 밖으로 나가지 않도록 이동량을 제한한다', () => {
    const result = moveStroke(baseJamo, 'ㄱ-1', { x: 0.9, y: -0.9 })
    expect(result.delta.x).toBeCloseTo(0.2)
    expect(result.delta.y).toBeCloseTo(-0.2)
    expect(Math.max(...(result.jamo.strokes?.[0].points.map((point) => point.x) ?? []))).toBeCloseTo(1)
    expect(Math.min(...(result.jamo.strokes?.[0].points.map((point) => point.y) ?? []))).toBeCloseTo(0)
  })

  it('존재하지 않는 획은 변경하지 않는다', () => {
    const result = moveStroke(baseJamo, '없는-획', { x: 0.1, y: 0.1 })
    expect(result.changed).toBe(false)
    expect(result.delta).toEqual({ x: 0, y: 0 })
  })

  it('글자 캔버스가 허용하는 확장 경계 안에서는 꽉 찬 획도 움직인다', () => {
    const fullJamo: JamoData = {
      ...baseJamo,
      strokes: [{ ...baseJamo.strokes![0], points: [{ x: 0, y: 0 }, { x: 1, y: 1 }] }],
    }
    const result = moveStroke(
      fullJamo,
      'ㄱ-1',
      { x: -0.1, y: 0.1 },
      { minX: -0.4, maxX: 1.4, minY: -0.4, maxY: 1.4 }
    )
    expect(result.changed).toBe(true)
    expect(result.delta).toEqual({ x: -0.1, y: 0.1 })
  })

  it('그리드가 설정되면 첫 앵커를 기준으로 이동량을 스냅한다', () => {
    const result = moveStroke(
      baseJamo,
      'ㄱ-1',
      { x: 0.038, y: -0.018 },
      { minX: 0, maxX: 1.2, minY: 0, maxY: 1 },
      0.025
    )
    expect(result.delta.x).toBeCloseTo(0.05)
    expect(result.delta.y).toBeCloseTo(-0.025)
    expect(result.jamo.strokes?.[0].points[0].x).toBeCloseTo(0.25)
    expect(result.jamo.strokes?.[0].points[0].y).toBeCloseTo(0.175)
  })
})
