import { describe, expect, it } from 'vitest'
import type { JamoData } from '../types'
import { moveHandle, movePoint, moveStroke, scaleStroke } from './editorCommands'

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

  it('혼합 중성의 가로·세로 획도 같은 방식으로 이동한다', () => {
    const mixedJamo: JamoData = {
      char: 'ㅘ',
      type: 'jungseong',
      horizontalStrokes: [{ ...baseJamo.strokes![0], id: 'ㅘ-h-1' }],
      verticalStrokes: [{ ...baseJamo.strokes![0], id: 'ㅘ-v-1' }],
    }

    const horizontal = moveStroke(mixedJamo, 'ㅘ-h-1', { x: 0.05, y: 0 })
    const vertical = moveStroke(mixedJamo, 'ㅘ-v-1', { x: 0, y: 0.05 })

    expect(horizontal.jamo.horizontalStrokes?.[0].points[0].x).toBeCloseTo(0.25)
    expect(vertical.jamo.verticalStrokes?.[0].points[0].y).toBeCloseTo(0.25)
    expect(mixedJamo.horizontalStrokes?.[0].points[0].x).toBeCloseTo(0.2)
  })

  it('선택한 점과 해당 핸들만 이동한다', () => {
    const result = movePoint(baseJamo, 'ㄱ-1', 1, { x: 0.05, y: 0.1 })
    expect(result.changed).toBe(true)
    expect(result.jamo.strokes?.[0].points[0]).toMatchObject({ x: 0.2, y: 0.2 })
    expect(result.jamo.strokes?.[0].points[1].x).toBeCloseTo(0.85)
    expect(result.jamo.strokes?.[0].points[1].y).toBeCloseTo(0.3)
    expect(result.jamo.strokes?.[0].points[1].handleOut?.x).toBeCloseTo(0.9)
  })

  it('곡선 손잡이만 이동하고 꼭짓점은 유지한다', () => {
    const result = moveHandle(baseJamo, 'ㄱ-1', 1, 'out', { x: -0.05, y: 0.1 }, { minX: 0, maxX: 1, minY: 0, maxY: 1 }, 0.005)
    expect(result.changed).toBe(true)
    expect(result.jamo.strokes?.[0].points[1]).toMatchObject({ x: 0.8, y: 0.2 })
    expect(result.jamo.strokes?.[0].points[1].handleOut?.x).toBeCloseTo(0.8)
    expect(result.jamo.strokes?.[0].points[1].handleOut?.y).toBeCloseTo(0.35)
  })
})

describe('scaleStroke', () => {
  it('중심을 고정하고 두 축과 베지어 핸들을 독립적으로 변환한다', () => {
    const result = scaleStroke(baseJamo, 'ㄱ-1', { x: 1.5, y: 0.5 }, { minX: -1, maxX: 2, minY: -1, maxY: 2 })
    expect(result.changed).toBe(true)
    expect(result.scale).toEqual({ x: 1.5, y: 0.5 })
    expect(result.jamo.strokes?.[0].points[0].x).toBeCloseTo(0.05)
    expect(result.jamo.strokes?.[0].points[0].y).toBeCloseTo(0.35)
    expect(result.jamo.strokes?.[0].points[2].x).toBeCloseTo(0.95)
    expect(result.jamo.strokes?.[0].points[2].y).toBeCloseTo(0.65)
    expect(result.jamo.strokes?.[0].points[1].handleOut?.x).toBeCloseTo(1.025)
    expect(result.jamo.strokes?.[0].points[1].handleOut?.y).toBeCloseTo(0.375)
    expect(result.jamo.strokes?.[0].thickness).toBe(baseJamo.strokes?.[0].thickness)
  })

  it('비율 범위와 이동 경계를 제한하고 지정 단위로 스냅한다', () => {
    const result = scaleStroke(baseJamo, 'ㄱ-1', { x: 3.91, y: 0.263 }, { minX: 0, maxX: 1, minY: 0, maxY: 1 }, 0.025)
    expect(result.scale.x).toBeCloseTo(1.65)
    expect(result.scale.y).toBeCloseTo(0.275)
    expect(Math.min(...result.jamo.strokes![0].points.map((point) => point.x))).toBeGreaterThanOrEqual(0)
    expect(Math.max(...result.jamo.strokes![0].points.map((point) => point.x))).toBeLessThanOrEqual(1)
  })

  it('길이가 0인 축은 잠그고 혼합중성 획도 변환한다', () => {
    const line: JamoData = { char: 'ㅘ', type: 'jungseong', horizontalStrokes: [{ ...baseJamo.strokes![0], id: 'h', points: [{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }] }] }
    const result = scaleStroke(line, 'h', { x: 1.25, y: 2 }, { minX: 0, maxX: 1, minY: 0, maxY: 1 }, 0.025)
    expect(result.lockedAxes).toEqual({ x: false, y: true })
    expect(result.scale).toEqual({ x: 1.25, y: 1 })
    expect(result.jamo.horizontalStrokes?.[0].points[0].x).toBeCloseTo(0.125)
  })

  it('100% 요청은 변경을 만들지 않는다', () => {
    expect(scaleStroke(baseJamo, 'ㄱ-1', { x: 1, y: 1 }).changed).toBe(false)
  })
})
