import { describe, expect, it } from 'vitest'
import type { JamoData, StrokeDataV2 } from '../types'
import { migrateJamoMap } from './strokeMigration'

const v2: StrokeDataV2 = { id: 's1', points: [{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }], closed: false, thickness: 0.1, label: 'horizontal' }
// 옛 직각 획(중심 x,y + width + angle). 새 획은 points가 있다.
const oldRect = { id: 'old', x: 0.5, y: 0.5, width: 0.6, thickness: 0.1, angle: 0, direction: 'horizontal' }

const jamo = (strokes: unknown[]): JamoData => ({ id: 'ㄱ', strokes } as unknown as JamoData)

describe('migrateJamoMap — 옛 획 이전의 공용 입구', () => {
  it('옛 획이 없으면 같은 객체를 돌려준다(메모 · 변경 감지가 안 깨진다)', () => {
    const map = { ㄱ: jamo([v2]) }
    expect(migrateJamoMap(map)).toBe(map)
  })

  it('옛 획이 있으면 새 획(points)으로 옮기고, 원본은 건드리지 않는다', () => {
    const map = { ㄱ: jamo([v2, oldRect]), ㄴ: jamo([v2]) }
    const moved = migrateJamoMap(map)
    expect(moved).not.toBe(map)
    const strokes = moved.ㄱ.strokes as unknown as StrokeDataV2[]
    expect(strokes).toHaveLength(2)
    expect(strokes.every((stroke) => Array.isArray(stroke.points) && stroke.points.length >= 2)).toBe(true)
    // 가로 중심선: 중심 (0.5, 0.5)에서 좌우로 width/2.
    expect(strokes[1].points[0].x).toBeCloseTo(0.2, 6)
    expect(strokes[1].points[1].x).toBeCloseTo(0.8, 6)
    expect((map.ㄱ.strokes as unknown[])[1]).toBe(oldRect)
  })
})
