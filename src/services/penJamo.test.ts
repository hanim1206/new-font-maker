import { describe, expect, it } from 'vitest'
import type { JamoData, StrokeDataV2 } from '../types'
import { addPenStroke, clearPenJamo, fitJamoToCell, penJamoState, presetChannelOf, recognizePenJamo, sameStrokePlaces, viewBoxToJamoBox } from './penJamo'

const stroke = (id: string, points: [number, number][]): StrokeDataV2 => ({
  id, closed: false, thickness: .07, points: points.map(([x, y]) => ({ x, y })),
})
const ㄱ: JamoData = { char: 'ㄱ', type: 'choseong', strokes: [stroke('ㄱ-1', [[0, 0], [.98, 0], [.98, 1]])] }
const ㅏ: JamoData = { char: 'ㅏ', type: 'jungseong', strokes: [stroke('ㅏ-1', [[0, 0], [0, 1]]), stroke('ㅏ-2', [[0, .5], [1, .5]])] }

describe('펜 자모', () => {
  it('viewBox 좌표를 자모 상자 0–1로 옮긴다', () => {
    const box = { x: .2, y: .1, width: .5, height: .6 }
    const [a, b] = viewBoxToJamoBox([{ x: 20, y: 10 }, { x: 70, y: 70 }], box)
    expect(a.x).toBeCloseTo(0)
    expect(a.y).toBeCloseTo(0)
    expect(b.x).toBeCloseTo(1)
    expect(b.y).toBeCloseTo(1)
    // 상자 밖은 잘라 내지 않는다
    expect(viewBoxToJamoBox([{ x: 10, y: 10 }], box)[0].x).toBeLessThan(0)
  })

  it('프리셋 채널: 기본 획 → 세로부 → 가로부', () => {
    expect(presetChannelOf(ㄱ)).toBe('strokes')
    expect(presetChannelOf({ verticalStrokes: ㅏ.strokes })).toBe('verticalStrokes')
    expect(presetChannelOf({ horizontalStrokes: ㅏ.strokes })).toBe('horizontalStrokes')
    expect(presetChannelOf({ strokes: [], verticalStrokes: ㅏ.strokes })).toBe('verticalStrokes')
  })

  it('ㄱ을 한 획으로 그으면 인식되고 ㄱ-1이 된다', () => {
    const raw = [{ x: .05, y: .08 }, { x: .5, y: .06 }, { x: .9, y: .05 }, { x: .92, y: .5 }, { x: .92, y: .95 }]
    const result = recognizePenJamo({ strokes: [raw] }, ㄱ)
    expect(result.state).toBe('recognized')
    expect(result.byChannel.strokes?.strokes.map((item) => item.id)).toEqual(['ㄱ-1'])
    expect(result.byChannel.strokes?.missing).toEqual([])
  })

  it('ㅏ의 기둥만 그으면 일부 자유가 되고 안 그린 획을 알린다', () => {
    const raw = [{ x: .5, y: .05 }, { x: .5, y: .5 }, { x: .5, y: .95 }]
    const result = recognizePenJamo({ strokes: [raw] }, ㅏ, { fill: false })
    expect(result.state).not.toBe('recognized')
    expect(result.byChannel.strokes?.missing.length).toBeGreaterThan(0)
  })

  // ㄱ 꼴 한 획. `at`으로 자리와 크기를 옮긴다.
  const ㄱRaw = (at = { x: 0, y: 0, size: 1 }) => [[.05, .08], [.5, .06], [.9, .05], [.92, .5], [.92, .95]].map(([x, y]) => ({ x: at.x + x * at.size, y: at.y + y * at.size }))
  const boundsOf = (item: StrokeDataV2) => ({
    maxX: Math.max(...item.points.map((point) => point.x)),
    maxY: Math.max(...item.points.map((point) => point.y)),
  })

  it('빈 자모에 작게 · 치우쳐 그은 ㄱ도 역할을 받고, 좌표는 그은 자리 그대로다', () => {
    const empty: JamoData = { ...ㄱ, strokes: [] }
    const result = addPenStroke(empty, 'strokes', ㄱRaw({ x: .05, y: .05, size: .4 }), ㄱ)
    expect(result?.strokeId).toBe('ㄱ-1')
    expect(result?.jamo.strokes?.map((item) => item.id)).toEqual(['ㄱ-1'])
    const bounds = boundsOf(result!.jamo.strokes![0])
    expect(bounds.maxX).toBeLessThan(.5)
    expect(bounds.maxY).toBeLessThan(.5)
    expect(penJamoState(result!.jamo, 'strokes', ㄱ).state).toBe('recognized')
  })

  it('역할 자리가 차 있으면 또 그은 ㄱ은 자유 획이고 기존 획은 그대로다', () => {
    const result = addPenStroke(ㄱ, 'strokes', ㄱRaw(), ㄱ)
    expect(result?.strokeId).toBe('pen-ㄱ-1')
    expect(result?.jamo.strokes?.map((item) => item.id)).toEqual(['ㄱ-1', 'pen-ㄱ-1'])
    expect(result?.jamo.strokes?.[0]).toEqual(ㄱ.strokes![0])
    expect(penJamoState(result!.jamo, 'strokes', ㄱ).state).toBe('partial')
    // 원본은 건드리지 않는다
    expect(ㄱ.strokes).toHaveLength(1)
  })

  // 손으로 그은 것처럼 촘촘한 직선.
  const line = (from: [number, number], to: [number, number], count = 24) => Array.from({ length: count + 1 }, (_, index) => ({ x: from[0] + (to[0] - from[0]) * index / count, y: from[1] + (to[1] - from[1]) * index / count }))
  // 펜을 켠 뒤 그은 획 = 켜기 전 자모에 없던 획.
  const drawnSince = (base: JamoData) => (item: StrokeDataV2) => !(base.strokes ?? []).some((old) => JSON.stringify(old.points) === JSON.stringify(item.points))

  it('손으로 넣은 획은 다시 판정하지 않는다', () => {
    const manual: JamoData = { ...ㄱ, strokes: [stroke('stroke-1', [[.05, .06], [.9, .05], [.92, .95]])] }
    const result = addPenStroke(manual, 'strokes', line([.2, .5], [.8, .5]), ㄱ)
    expect(result?.jamo.strokes?.find((item) => item.id === 'stroke-1')).toEqual(manual.strokes![0])
    expect(result?.jamo.strokes).toHaveLength(2)
  })

  it('나눠 그은 ㄱ: 가로만 그으면 자유, 끝에 이어 세로를 그으면 한 획으로 이어져 역할을 받는다', () => {
    const empty: JamoData = { ...ㄱ, strokes: [] }
    const drawn = drawnSince(empty)
    const first = addPenStroke(empty, 'strokes', line([.05, .05], [.95, .05]), ㄱ, { drawn })
    expect(first?.jamo.strokes).toHaveLength(1)
    const second = addPenStroke(first!.jamo, 'strokes', line([.95, .07], [.95, .95]), ㄱ, { drawn })
    expect(second?.jamo.strokes?.map((item) => item.id)).toEqual(['ㄱ-1'])
    expect(second?.strokeId).toBe('ㄱ-1')
    // 이어진 획은 가로에서 세로로 꺾인다
    expect(second!.jamo.strokes![0].points.length).toBeGreaterThanOrEqual(3)
  })

  it('ㅏ: 기둥을 긋고 곁줄기를 그으면 둘 다 역할을 받는다', () => {
    const empty: JamoData = { ...ㅏ, strokes: [] }
    const drawn = drawnSince(empty)
    const pillar = addPenStroke(empty, 'strokes', line([.3, .1], [.3, .9]), ㅏ, { drawn })
    const branch = addPenStroke(pillar!.jamo, 'strokes', line([.32, .5], [.7, .5]), ㅏ, { drawn })
    expect(branch?.jamo.strokes?.map((item) => item.id)).toEqual(['ㅏ-1', 'ㅏ-2'])
    expect(penJamoState(branch!.jamo, 'strokes', ㅏ)).toEqual({ state: 'recognized', missing: [] })
  })

  it('ㅎ의 동그라미는 끝이 덜 닿게 · 찌그러지게 그어도 역할을 받는다 — 닫지 않고 그은 그대로', () => {
    const ㅎ: JamoData = { char: 'ㅎ', type: 'choseong', strokes: [
      stroke('ㅎ-1', [[.5, 0], [.5, .21]]),
      stroke('ㅎ-2', [[0, .21], [1, .21]]),
      { ...stroke('ㅎ-circle', [[.5, .45], [.83, .72], [.5, 1], [.17, .72]]), closed: true },
    ] }
    const empty: JamoData = { ...ㅎ, strokes: [] }
    const drawn = drawnSince(empty)
    // 납작한 타원을 한 바퀴 못 채우고(320도) 뗀다 — 끝이 시작에서 굵기의 몇 배 떨어져 있다.
    const loop = Array.from({ length: 41 }, (_, index) => {
      const angle = (-90 + 320 * index / 40) * Math.PI / 180
      return { x: .5 + .36 * Math.cos(angle), y: .72 + .2 * Math.sin(angle) }
    })
    let jamo = addPenStroke(empty, 'strokes', line([.5, .02], [.5, .2]), ㅎ, { drawn })!.jamo
    jamo = addPenStroke(jamo, 'strokes', line([.05, .22], [.95, .22]), ㅎ, { drawn })!.jamo
    const result = addPenStroke(jamo, 'strokes', loop, ㅎ, { drawn })
    expect(result?.strokeId).toBe('ㅎ-circle')
    expect(result?.jamo.strokes?.map((item) => item.id)).toEqual(['ㅎ-1', 'ㅎ-2', 'ㅎ-circle'])
    expect(penJamoState(result!.jamo, 'strokes', ㅎ).state).toBe('recognized')
    // 열린 채 그대로다 — 끝이 시작에 안 닿은 틈이 남는다.
    const circle = result!.jamo.strokes![2]
    expect(circle.closed).toBe(false)
    const first = circle.points[0], last = circle.points[circle.points.length - 1]
    expect(Math.hypot(first.x - last.x, first.y - last.y)).toBeGreaterThan(.15)
    // 끝이 두께 안으로 만나게 한 바퀴 돈 획은 닫는다
    const full = Array.from({ length: 41 }, (_, index) => {
      const angle = (-90 + 357 * index / 40) * Math.PI / 180
      return { x: .5 + .36 * Math.cos(angle), y: .72 + .2 * Math.sin(angle) }
    })
    expect(addPenStroke(jamo, 'strokes', full, ㅎ, { drawn })?.jamo.strokes?.[2]).toMatchObject({ id: 'ㅎ-circle', closed: true })
    // 벌어진 획(ㄷ 꼴)은 동그라미 역할을 못 받는다
    const open = addPenStroke(jamo, 'strokes', [...line([.8, .5], [.2, .5]), ...line([.2, .52], [.2, .95]), ...line([.22, .95], [.8, .95])], ㅎ, { drawn })
    expect(open?.strokeId).not.toBe('ㅎ-circle')
  })

  it('비우기: 펜이 꺼져 있으면 전부 지우고, 켜져 있으면 그은 획만 남겨 역할을 다시 붙인다', () => {
    expect(clearPenJamo(ㄱ, 'strokes', ㄱ).strokes).toEqual([])
    // 기존 ㄱ 위에 작게 따라 그으면 자유 획이다. 비우면 기존 획이 사라지고 그은 획이 ㄱ 역할을 받는다 — 자리는 그대로.
    const traced = addPenStroke(ㄱ, 'strokes', ㄱRaw({ x: .1, y: .1, size: .5 }), ㄱ, { drawn: drawnSince(ㄱ) })!.jamo
    expect(traced.strokes?.map((item) => item.id)).toEqual(['ㄱ-1', 'pen-ㄱ-1'])
    const cleared = clearPenJamo(traced, 'strokes', ㄱ, { drawn: drawnSince(ㄱ) })
    expect(cleared.strokes?.map((item) => item.id)).toEqual(['ㄱ-1'])
    expect(boundsOf(cleared.strokes![0]).maxX).toBeLessThan(.65)
    // 원본은 건드리지 않는다
    expect(traced.strokes).toHaveLength(2)
  })

  it('맞춤은 잉크(굵기 · 끝 모양 포함)가 칸 네 변에 닿게 채운다 — 굵기 0.07 · 정사각 칸 · 평평한 끝', () => {
    const ink = { half: { x: .035, y: .035 }, linecap: 'butt' as const }
    const small = addPenStroke({ ...ㄱ, strokes: [] }, 'strokes', ㄱRaw({ x: .05, y: .05, size: .4 }), ㄱ)!.jamo
    const fitted = fitJamoToCell(small, 'strokes', ink)
    expect(sameStrokePlaces(small, fitted, 'strokes')).toBe(false)
    // ㄱ: 가로줄기 왼쪽 끝은 평평해 중심선이 왼 변에 닿고(0), 위는 굵기 반만큼 안쪽(.035). 기둥 오른쪽은 굵기 반 안쪽(.965), 아래 끝은 평평해 아래 변에 닿는다(1).
    const xs = fitted.strokes![0].points.map((point) => point.x), ys = fitted.strokes![0].points.map((point) => point.y)
    expect(Math.min(...xs)).toBeCloseTo(0, 2)
    expect(Math.max(...xs)).toBeCloseTo(.965, 2)
    expect(Math.min(...ys)).toBeCloseTo(.035, 2)
    expect(Math.max(...ys)).toBeCloseTo(1, 2)
    // 한 번 맞춘 것은 다시 맞춰도 같다 — 단추가 꺼진다
    expect(sameStrokePlaces(fitted, fitJamoToCell(fitted, 'strokes', ink), 'strokes')).toBe(true)
    // 둥근 끝이면 끝도 굵기 반만큼 앞으로 나와 네 변 다 안쪽이다
    const round = fitJamoToCell(small, 'strokes', { ...ink, linecap: 'round' })
    const rx = round.strokes![0].points.map((point) => point.x), ry = round.strokes![0].points.map((point) => point.y)
    expect(Math.min(...rx)).toBeCloseTo(.035, 2)
    expect(Math.max(...ry)).toBeCloseTo(.965, 2)
  })
})
