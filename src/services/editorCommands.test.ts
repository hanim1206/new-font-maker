import { describe, expect, it } from 'vitest'
import type { JamoData } from '../types'
import { jamoCenterlineCenter, limitJamoMoveDelta, limitJamoScale, moveHandle, movePoint, moveStroke, scaleJamoStrokes, scaleStroke, scaleStrokes, snapWholeJamoDelta, translateJamoStrokes } from './editorCommands'

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

  it('점도 곡선 핸들도 한계 밖으로 나가지 않도록 이동량을 제한한다', () => {
    const result = moveStroke(baseJamo, 'ㄱ-1', { x: 0.9, y: -0.9 })
    // 가로는 핸들(0.85)이 점(0.8)보다 먼저 한계에 닿는다 — 핸들이 딸려 나가면 캔버스 밖에서 가려져 못 잡는다.
    expect(result.delta.x).toBeCloseTo(0.15)
    expect(result.delta.y).toBeCloseTo(-0.2)
    expect(result.jamo.strokes?.[0].points[1].handleOut?.x).toBeCloseTo(1)
    expect(Math.max(...(result.jamo.strokes?.[0].points.map((point) => point.x) ?? []))).toBeCloseTo(0.95)
    expect(Math.min(...(result.jamo.strokes?.[0].points.map((point) => point.y) ?? []))).toBeCloseTo(0)
  })

  it('점 하나를 옮길 때도 딸려 가는 핸들이 한계에서 멈춘다', () => {
    const result = movePoint(baseJamo, 'ㄱ-1', 1, { x: 0.9, y: 0 })
    expect(result.delta.x).toBeCloseTo(0.15)
    expect(result.jamo.strokes?.[0].points[1].handleOut?.x).toBeCloseTo(1)
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
    // 가로는 핸들(0.85)이 한계에 닿는 배율(0.5 ÷ 0.35 = 1.428…)을 눈금에 내려 맞춘다.
    expect(result.scale.x).toBeCloseTo(1.425)
    expect(result.scale.y).toBeCloseTo(0.275)
    expect(result.jamo.strokes![0].points[1].handleOut!.x).toBeLessThanOrEqual(1)
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

describe('scaleJamoStrokes', () => {
  const twoChannels: JamoData = {
    char: 'ㅘ',
    type: 'jungseong',
    horizontalStrokes: [{ id: 'h', points: [{ x: 0.2, y: 0.8 }, { x: 0.6, y: 0.8 }], closed: false, thickness: 0.07 }],
    verticalStrokes: [{ id: 'v', points: [{ x: 0.8, y: 0.2 }, { x: 0.8, y: 0.8 }], closed: false, thickness: 0.07 }],
  }

  it('자소 전체를 중심선 범위 가운데를 기준으로 키우고 두께는 그대로 둔다', () => {
    const scaled = scaleJamoStrokes(baseJamo, 1.5)
    const stroke = scaled.strokes![0]
    expect(stroke.points[0].x).toBeCloseTo(0.05)
    expect(stroke.points[0].y).toBeCloseTo(0.05)
    expect(stroke.points[2].x).toBeCloseTo(0.95)
    expect(stroke.points[2].y).toBeCloseTo(0.95)
    expect(stroke.points[1].handleOut!.x).toBeCloseTo(1.025)
    expect(stroke.thickness).toBe(0.07)
    expect(baseJamo.strokes![0].points[0].x).toBe(0.2)
  })

  it('가로 · 세로 채널을 한 가운데로 함께 키운다(이음새가 안 벌어진다)', () => {
    const scaled = scaleJamoStrokes(twoChannels, 2)
    expect(scaled.horizontalStrokes![0].points[1]).toMatchObject({ x: expect.closeTo(0.7), y: expect.closeTo(1.1) })
    expect(scaled.verticalStrokes![0].points[1]).toMatchObject({ x: expect.closeTo(1.1), y: expect.closeTo(1.1) })
  })

  it('상자 밖으로 넘쳐도 막지 않고, 틀은 건드리지 않는다', () => {
    const framed: JamoData = { ...baseJamo, frame: { strokes: structuredClone(baseJamo.strokes) } }
    const scaled = scaleJamoStrokes(framed, 2)
    expect(scaled.strokes![0].points[0].x).toBeCloseTo(-0.1)
    expect(scaled.frame!.strokes![0].points[0].x).toBe(0.2)
  })

  it('배율 1이나 잘못된 배율이면 그대로 돌려준다', () => {
    expect(scaleJamoStrokes(baseJamo, 1)).toEqual(baseJamo)
    expect(scaleJamoStrokes(baseJamo, 0)).toEqual(baseJamo)
  })
})

describe('translateJamoStrokes', () => {
  it('모든 채널의 점 · 핸들을 같은 만큼 옮기고 원본은 두며, 상자 밖으로도 간다', () => {
    const source: JamoData = {
      char: 'ㄱ', type: 'choseong',
      strokes: [{ id: 'a', points: [{ x: 0.9, y: 0.1, handleOut: { x: 0.95, y: 0.2 } }, { x: 0.9, y: 0.9 }], closed: false, thickness: 0.07 }],
      contextStrokes: { bottom: [{ id: 'a', points: [{ x: 0.5, y: 0.5 }], closed: false, thickness: 0.07 }] },
    }
    const moved = translateJamoStrokes(source, { x: 0.2, y: -0.05 })
    const [first] = moved.strokes![0].points
    expect([first.x, first.y, first.handleOut!.x, first.handleOut!.y].map((value) => Number(value.toFixed(6)))).toEqual([1.1, 0.05, 1.15, 0.15])
    const variant = moved.contextStrokes!.bottom![0].points[0]
    expect([variant.x, variant.y].map((value) => Number(value.toFixed(6)))).toEqual([0.7, 0.45])
    expect(source.strokes![0].points[0].x).toBe(0.9)
  })
})

describe('자소 통째 이동의 가운데 스냅', () => {
  it('중심선 범위 가운데가 상자 정가운데 반경 안이면 그 축만 딱 붙인다', () => {
    const center = jamoCenterlineCenter({ char: 'ㄱ', type: 'choseong', strokes: [{ id: 'a', points: [{ x: 0.1, y: 0.2 }, { x: 0.7, y: 0.9 }], closed: false, thickness: 0.07 }] })
    expect(center.x).toBeCloseTo(0.4)
    expect(center.y).toBeCloseTo(0.55)
    // x는 0.4 + 0.09 = 0.49 → 붙어서 0.1, y는 0.55 + 0.1 = 0.65 → 멀어서 그대로
    const snapped = snapWholeJamoDelta(center, { x: 0.09, y: 0.1 })
    expect(snapped.delta.x).toBeCloseTo(0.1)
    expect(snapped.delta.y).toBe(0.1)
    expect(snapped.centered).toEqual({ x: true, y: false })
  })
})

describe('scaleStrokes', () => {
  it('묶인 획을 전체 범위 가운데를 기준으로 한 덩어리로 늘린다(가로획 둘은 세로가 잠긴다)', () => {
    const source: JamoData = {
      char: 'ㄲ', type: 'choseong',
      strokes: [
        { id: 'top', points: [{ x: 0.2, y: 0.2 }, { x: 0.4, y: 0.2 }], closed: false, thickness: 0.07 },
        { id: 'bottom', points: [{ x: 0.6, y: 0.8 }, { x: 0.8, y: 0.8 }], closed: false, thickness: 0.07 },
        { id: 'other', points: [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.6 }], closed: false, thickness: 0.07 },
      ],
    }
    const result = scaleStrokes(source, ['top', 'bottom'], { x: 1.5, y: 1 })
    // 범위 0.2–0.8, 가운데 0.5 → 0.2는 0.05, 0.8은 0.95
    const xsOf = (id: string) => result.jamo.strokes!.find((stroke) => stroke.id === id)!.points.map((point) => Number(point.x.toFixed(6)))
    expect(xsOf('top')).toEqual([0.05, 0.35])
    expect(xsOf('bottom')).toEqual([0.65, 0.95])
    expect(xsOf('other')).toEqual([0.5, 0.5])
    expect(result.lockedAxes).toEqual({ x: false, y: false })
  })
})

describe('자소 통째 크기 · 이동은 글자 칸 안에서 멈춘다', () => {
  const square: JamoData = {
    char: 'ㅁ', type: 'choseong',
    strokes: [
      { id: 'a', points: [{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }], closed: false, thickness: 0.07 },
      { id: 'b', points: [{ x: 0.2, y: 0.2 }, { x: 0.2, y: 0.6 }], closed: false, thickness: 0.07 },
    ],
  }
  // 가운데는 (0.5, 0.4). 위쪽 한계가 가장 가깝다: 가운데 기준이면 0.2 → 0.1까지 = 배율 1.5.
  const bounds = { minX: -0.4, maxX: 1.4, minY: 0.1, maxY: 1.2 }
  const boundsOf = () => bounds

  const extentOf = (jamo: JamoData) => {
    const points = jamo.strokes!.flatMap((stroke) => stroke.points)
    const xs = points.map((point) => point.x)
    const ys = points.map((point) => point.y)
    return { left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys) }
  }
  const grown = (source: JamoData, requested: number, of: typeof boundsOf) => {
    const fit = limitJamoScale(source, requested, of)
    return { fit, extent: extentOf(scaleJamoStrokes(source, fit.factor, fit.shift)) }
  }

  it('한계에 안 닿으면 가운데 기준 그대로 커지고 밀지 않는다', () => {
    const { fit, extent } = grown(square, 1.2, boundsOf)
    expect(fit).toEqual({ factor: 1.2, shift: { x: 0, y: 0 } })
    expect(extent.top).toBeCloseTo(0.16, 9)
    expect(extent.bottom).toBeCloseTo(0.64, 9)
  })

  it('한쪽이 한계에 닿으면 그쪽을 붙잡고 반대쪽으로 더 커진다 — 가로 · 세로는 같은 비율 그대로', () => {
    // 가운데 기준이면 1.5에서 위(0.1)에 닿는다. 2배는 위를 0.1에 붙이고 아래로 자란다: 높이 0.4 → 0.8.
    const { fit, extent } = grown(square, 2, boundsOf)
    expect(fit.factor).toBe(2)
    expect(fit.shift.x).toBe(0)
    expect(fit.shift.y).toBeCloseTo(0.1, 9)
    expect(extent.top).toBeCloseTo(0.1, 9)
    expect(extent.bottom).toBeCloseTo(0.9, 9)
    expect((extent.right - extent.left) / 0.6).toBeCloseTo((extent.bottom - extent.top) / 0.4, 9)
    // 이미 한계에 붙어 있어도 반대쪽으로 커진다(전에는 안 커졌다).
    const stuck = grown(square, 2, () => ({ ...bounds, minY: 0.2 }))
    expect(stuck.fit.factor).toBe(2)
    expect(stuck.extent.top).toBeCloseTo(0.2, 9)
    expect(stuck.extent.bottom).toBeCloseTo(1, 9)
  })

  it('한 축의 양쪽이 다 닿으면 거기서 멈춘다', () => {
    // 세로 한계 0.1 ~ 0.7 = 0.6, 높이 0.4 → 1.5배. 위아래 모두 한계에 닿는다.
    const { fit, extent } = grown(square, 2, () => ({ ...bounds, maxY: 0.7 }))
    expect(fit.factor).toBeCloseTo(1.5, 9)
    expect(extent.top).toBeCloseTo(0.1, 9)
    expect(extent.bottom).toBeCloseTo(0.7, 9)
    // 양쪽이 이미 붙어 있으면 안 커진다.
    expect(limitJamoScale(square, 2, () => ({ ...bounds, minY: 0.2, maxY: 0.6 }))).toEqual({ factor: 1, shift: { x: 0, y: 0 } })
  })

  it('곡선 핸들이 먼저 닿으면 핸들을 한계에 붙이고 민다', () => {
    const curved: JamoData = { char: 'ㅇ', type: 'choseong', strokes: [{ id: 'a', points: [{ x: 0.2, y: 0.4, handleOut: { x: 0.2, y: 0.1 } }, { x: 0.8, y: 0.6 }], closed: false, thickness: 0.07 }] }
    const fit = limitJamoScale(curved, 1.5, () => ({ minX: -1, maxX: 2, minY: 0.1, maxY: 2 }))
    const scaled = scaleJamoStrokes(curved, fit.factor, fit.shift)
    expect(fit.factor).toBe(1.5)
    expect(scaled.strokes![0].points[0].handleOut!.y).toBeCloseTo(0.1, 9)
  })

  it('줄이는 쪽과 한계를 모르는 획은 막지도 밀지도 않는다', () => {
    expect(limitJamoScale(square, 0.5, boundsOf)).toEqual({ factor: 0.5, shift: { x: 0, y: 0 } })
    expect(limitJamoScale(square, 2, () => undefined)).toEqual({ factor: 2, shift: { x: 0, y: 0 } })
  })

  it('통째 이동도 어느 점이든 한계에 닿는 만큼까지만 간다(가로 · 세로 따로)', () => {
    expect(limitJamoMoveDelta(square, { x: 0.1, y: -0.3 }, boundsOf)).toEqual({ x: 0.1, y: expect.closeTo(-0.1, 9) })
    expect(limitJamoMoveDelta(square, { x: 2, y: 2 }, boundsOf)).toEqual({ x: expect.closeTo(0.6, 9), y: expect.closeTo(0.6, 9) })
    expect(limitJamoMoveDelta(square, { x: 2, y: 2 }, () => undefined)).toEqual({ x: 2, y: 2 })
  })
})
