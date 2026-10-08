import { describe, expect, it } from 'vitest'
import baseJamos from '../data/baseJamos.json'
import { instanceInJamo, masterFromStroke } from '../services/stemMaster'
import type { JamoData, StrokeDataV2 } from '../types'
import { mergeStrokes, splitStroke, withUniqueIds } from './strokeEditUtils'

const strokeById = (jamo: JamoData, id: string) => jamo.strokes!.find((stroke) => stroke.id === id)!

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

describe('splitStroke id', () => {
  const line = (id: string, count: number): StrokeDataV2 => ({ id, points: Array.from({ length: count }, (_, index) => ({ x: index / (count - 1), y: .5 })), closed: false, thickness: .07 })

  it('같은 획을 두 번 끊어도 새 획 id가 겹치지 않는다 (10-08 ㅁ 버그)', () => {
    const [first, second] = splitStroke(line('ㅁ-1', 5), 2, ['ㅁ-1'])!
    expect([first.id, second.id]).toEqual(['ㅁ-1', 'ㅁ-1-b'])
    const [again, third] = splitStroke(first, 1, [first.id, second.id])!
    expect(new Set([again.id, second.id, third.id]).size).toBe(3)
  })

  it('겹친 id는 뒤에 나온 것만 새 id로 바꾸고, 겹친 것이 없으면 같은 배열을 돌려준다', () => {
    const strokes = [line('a', 2), line('a-b', 2), line('a-b', 2)]
    const [fixed] = withUniqueIds([strokes])
    expect(fixed!.map((stroke) => stroke.id)).toEqual(['a', 'a-b', 'a-b-2'])
    const [same] = withUniqueIds([fixed])
    expect(same).toBe(fixed)
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

describe('잇기는 남는 획의 방향을 지킨다', () => {
  const pillar: StrokeDataV2 = { id: 'ㅕ-1', points: [{ x: 1, y: 0 }, { x: 1, y: 1 }], closed: false, thickness: 0.07, label: 'vertical' }

  it('기둥 위 끝에 이어도 기둥은 위 → 아래 그대로, 조각은 앞에 붙는다', () => {
    // 조각을 기둥 위 끝 쪽으로 그렸다(끝이 기둥 위 끝).
    const piece: StrokeDataV2 = { id: 'n', points: [{ x: 0.85, y: 0.1, handleOut: { x: 0.9, y: 0.02 } }, { x: 1, y: 0, handleIn: { x: 0.95, y: 0 } }], closed: false, thickness: 0.07 }
    const merged = mergeStrokes(pillar, piece)!
    expect(merged.points.map(({ x, y }) => ({ x, y }))).toEqual([{ x: 0.85, y: 0.1 }, { x: 1, y: 0 }, { x: 1, y: 1 }])
    // 이음매에는 조각에서 들어오던 손잡이가 남는다.
    expect(merged.points[1].handleIn).toEqual({ x: 0.95, y: 0 })
    expect(merged.points[0].handleOut).toEqual({ x: 0.9, y: 0.02 })
  })

  it('조각을 기둥 쪽에서 밖으로 그려도(시작이 기둥 위 끝) 조각만 뒤집어 앞에 붙인다', () => {
    const piece: StrokeDataV2 = { id: 'n', points: [{ x: 1, y: 0 }, { x: 0.85, y: 0.1 }], closed: false, thickness: 0.07 }
    const merged = mergeStrokes(pillar, piece)!
    expect(merged.points.map(({ x, y }) => ({ x, y }))).toEqual([{ x: 0.85, y: 0.1 }, { x: 1, y: 0 }, { x: 1, y: 1 }])
  })

  it('잇기 → 전파: ㅕ 기둥 위에 이은 꺾임이 ㅓ 기둥에도 위에 놓인다(위아래 거꾸로 안 감)', () => {
    const jung = (baseJamos as unknown as { jungseong: Record<string, JamoData> }).jungseong
    const yeo = structuredClone(jung['ㅕ'])
    const piece: StrokeDataV2 = { id: 'n', points: [{ x: 0.85, y: 0.1 }, { x: 1, y: 0 }], closed: false, thickness: 0.07 }
    const merged = mergeStrokes(strokeById(yeo, 'ㅕ-1'), piece)!
    const edited: JamoData = { ...yeo, strokes: yeo.strokes!.map((stroke) => stroke.id === 'ㅕ-1' ? merged : stroke) }
    const master = masterFromStroke(edited, 'strokes', 'ㅕ-1')!
    const eo = structuredClone(jung['ㅓ'])
    const placed = instanceInJamo(eo, 'strokes', strokeById(eo, 'ㅓ-1'), master)
    const [tip, corner, foot] = placed.points
    // 꺾임은 기둥 위 끝에 있다: 꺾임 끝은 꺾이는 점 왼쪽 아래로 짧게, 기둥은 꺾이는 점에서 길게 내려간다.
    expect(tip.x).toBeLessThan(corner.x)
    expect(tip.y - corner.y).toBeGreaterThan(0)
    expect(tip.y - corner.y).toBeLessThan(0.2)
    expect(foot.y - corner.y).toBeGreaterThan(0.5)
  })
})

