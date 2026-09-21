import { describe, expect, it } from 'vitest'
import type { StrokeDataV2 } from '../src/types'
import { faceSnapCandidates, pointAnchors, snapStrokeDrag, strokeBodyAnchors, strokeSnapCandidates, withoutOwnCandidates } from './strokeSnap'

const box = { x: 0.1, y: 0.1, width: 0.4, height: 0.5 }
const stroke = (id: string, points: [number, number][]): StrokeDataV2 => ({ id, points: points.map(([x, y]) => ({ x, y })), closed: false, thickness: 0.07 })

describe('획 끌기 스냅', () => {
  it('가로로 끄는 동안 y는 처음 자리에 붙고, 반경을 넘게 벗어나면 풀린다', () => {
    const anchors = pointAnchors({ x: 0.5, y: 0.5 }, box)
    const wobble = snapStrokeDrag({ anchors, requested: { x: 0.11, y: 0.012 }, candidates: [] })
    expect(wobble.delta.y).toBe(0)
    expect(wobble.hits.y?.label).toBe('처음 자리')
    expect(wobble.delta.x).toBeCloseTo(0.11, 9)
    const diagonal = snapStrokeDrag({ anchors, requested: { x: 0.11, y: 0.047 }, candidates: [] })
    expect(diagonal.delta.y).toBeCloseTo(0.047, 9)
  })

  it('기준선 · 상자 변이 격자보다 먼저 걸린다', () => {
    const anchors = pointAnchors({ x: 0.5, y: 1 }, box) // em (0.3, 0.6)
    const candidates = faceSnapCandidates([{ part: 'JO', faces: { left: 0.12, right: 0.88, top: 0.69, bottom: 0.93 } }])
    const result = snapStrokeDrag({ anchors, requested: { x: 0, y: 0.081 }, candidates })
    expect(result.delta.y).toBeCloseTo(0.09, 9)
    expect(result.hits.y?.label).toBe('받침 윗변')
  })

  it('곧은 가로획 몸통은 중심선(y)과 두 끝(x)으로 걸리고, 자기 후보는 빠진다', () => {
    const bar = stroke('bar', [[0.2, 0.5], [1, 0.5]])
    const stem = stroke('stem', [[1, 0], [1, 1]])
    expect(strokeBodyAnchors(bar, box)).toEqual({ x: [0.1 + 0.2 * 0.4, 0.5], y: [0.35] })
    const all = strokeSnapCandidates([{ strokeId: 'bar', label: 'ㅓ 획', stroke: bar, box }, { strokeId: 'stem', label: 'ㅓ 획', stroke: stem, box }])
    expect(all.filter((item) => item.id === 'stroke:stem:center')).toEqual([{ id: 'stroke:stem:center', label: 'ㅓ 획 중심', axis: 'x', value: 0.5 }])
    expect(withoutOwnCandidates(all, { strokeId: 'bar' }).some((item) => item.id.startsWith('stroke:bar:'))).toBe(false)
    const forPoint = withoutOwnCandidates(all, { strokeId: 'bar', pointIndex: 0 })
    expect(forPoint.some((item) => item.id === 'stroke:bar:p0')).toBe(false)
    expect(forPoint.some((item) => item.id === 'stroke:bar:p1')).toBe(true)
    // 몸통을 위로 끌면 x는 처음 자리에 붙어 위아래로만 간다.
    const moved = snapStrokeDrag({ anchors: strokeBodyAnchors(bar, box), requested: { x: 0.008, y: -0.1 }, candidates: withoutOwnCandidates(all, { strokeId: 'bar' }) })
    expect(moved.delta.x).toBe(0)
  })

  it('비스듬한 획 몸통은 꼭짓점 전부가 닻이다', () => {
    expect(strokeBodyAnchors(stroke('slant', [[0, 0], [1, 1]]), box)).toEqual({ x: [0.1, 0.5], y: [0.1, 0.6] })
  })
})
