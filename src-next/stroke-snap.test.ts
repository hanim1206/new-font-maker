import { describe, expect, it } from 'vitest'
import type { StrokeDataV2 } from '../src/types'
import { faceSnapCandidates, jamoVertexCandidates, pointAnchors, snapStrokeDrag, strokeBodyAnchors, strokeSnapCandidates, withoutOwnCandidates } from './strokeSnap'

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

describe('같은 자소 꼭짓점 · 대칭 스냅', () => {
  // ㅁ의 왼쪽 기둥(0.1–0.9)과 오른쪽 기둥(0.85). 오른쪽 기둥의 위 끝(p0)을 끈다.
  const left = stroke('left', [[0.1, 0.1], [0.1, 0.9]])
  const right = stroke('right', [[0.85, 0.1], [0.85, 0.9]])
  const sources = [{ strokeId: 'left', label: 'ㅁ', stroke: left, box }, { strokeId: 'right', label: 'ㅁ', stroke: right, box }]

  it('끄는 점만 빼고 같은 자소 꼭짓점과 그 대칭 자리를 먼저 이기는 후보로 낸다', () => {
    const candidates = jamoVertexCandidates(sources, { strokeId: 'right', pointIndex: 0 })
    expect(candidates.every((candidate) => candidate.rank === 0)).toBe(true)
    expect(candidates.some((candidate) => candidate.id === 'vertex:right:p0')).toBe(false)
    expect(candidates.some((candidate) => candidate.id === 'vertex:right:p1')).toBe(true)
    // 왼쪽 기둥 x 0.1의 좌우 대칭은 0.9 → em으로 0.1 + 0.9 × 0.4
    expect(candidates.find((candidate) => candidate.id === 'mirror:left:p0' && candidate.axis === 'x')!.value).toBeCloseTo(0.46)
  })

  it('몸통을 끌면 그 획 점은 다 뺀다', () => {
    const candidates = jamoVertexCandidates(sources, { strokeId: 'right' })
    expect(candidates.some((candidate) => candidate.id.includes(':right:'))).toBe(false)
  })

  it('반경 안에 격자 · 다른 획보다 대칭 자리가 먼저 걸린다', () => {
    // 오른쪽 기둥 위 끝이 아직 0.7(em 0.38)에 있다. 오른쪽으로 끌어 대칭 자리(em 0.46) 근처로.
    const start = box.x + 0.7 * box.width
    const anchors = { x: [start], y: [box.y + 0.1 * box.height] }
    const mirrorX = box.x + 0.9 * box.width
    // 대칭 자리(0.46)보다 다른 기준선(0.455)이 더 가까워도 대칭이 이긴다.
    const other = { id: 'rail', label: '기준선', axis: 'x' as const, value: 0.455 }
    const snapped = snapStrokeDrag({ anchors, requested: { x: 0.457 - start, y: 0 }, candidates: [other, ...jamoVertexCandidates(sources, { strokeId: 'right', pointIndex: 0 })] })
    expect(snapped.hits.x?.label).toBe('ㅁ 대칭')
    expect(snapped.delta.x).toBeCloseTo(mirrorX - start)
  })
})
