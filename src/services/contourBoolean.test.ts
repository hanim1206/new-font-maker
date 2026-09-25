import { describe, expect, it } from 'vitest'
import type { StrokeDataV2 } from '../types'
import { mergeStrokeContourGroupsForCff } from './contourBoolean'
import { ASCENDER, UPM } from './fontExportUtils'
import { strokeToContours } from './strokeToOutline'

/** 피드백 35: 사용자가 ㄱ 끝점을 (0, 1)로 끌고 크게 휘게 고친 획. 곡선이 두께보다 급해 안쪽 윤곽이 제 몸을 지난다. */
const CURLED_GIYEOK: StrokeDataV2 = {
  id: 'ㄱ-1',
  closed: false,
  thickness: 0.07,
  points: [{ x: 0, y: 0 }, { x: 0.976, y: 0 }, { x: 0, y: 1, handleIn: { x: 0.9877404343469773, y: 0.8926536491341394 } }],
}

function areaOf(contour: { x: number; y: number }[]): number {
  let area = 0
  for (let index = 0; index < contour.length; index += 1) {
    const current = contour[index]
    const next = contour[(index + 1) % contour.length]
    area += current.x * next.y - next.x * current.y
  }
  return Math.abs(area / 2)
}

describe('OTF 획 윤곽 합치기', () => {
  it('스스로 겹친 획 윤곽도 멈추지 않고 풀어서 합친다', () => {
    const contours = strokeToContours(CURLED_GIYEOK, { x: 0.05, y: 0.05, width: 0.9, height: 0.9 }, UPM, {
      weightMultiplier: 1, slant: 0, globalLinecap: 'butt', globalLinejoin: 'miter', ascender: ASCENDER,
    })
    const merged = mergeStrokeContourGroupsForCff([contours])
    expect(merged.length).toBeGreaterThan(0)
    // 획 길이 × 두께 정도의 면적이 남는다(빈 윤곽이나 조각만 남지 않는다).
    const total = merged.reduce((sum, contour) => sum + areaOf(contour), 0)
    expect(total).toBeGreaterThan(0.07 * 0.9 * UPM * 1.5 * UPM * 0.5)
  })
})
