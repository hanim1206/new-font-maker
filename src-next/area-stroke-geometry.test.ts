import { describe, expect, it } from 'vitest'
import type { AngledAreaStrokeRenderStyle, DotPatternStrokeRenderStyle, StrokeDataV2 } from '../src/types'
import { strokeToAngledAreaInkGroups } from '../src/services/areaStrokeGeometry'
import { strokeToDotPatternInkGroups, strokeToRenderInkGroups } from '../src/services/strokeRenderGeometry'
import { brushInkGroupsToFontContours } from '../src/services/brushGeometry'

const box = { x: 0, y: 0, width: 1, height: 1 }
const area: AngledAreaStrokeRenderStyle = { mode: 'angled-area', cutAngle: 35, cornerRadius: 0.2 }
const dots: DotPatternStrokeRenderStyle = { mode: 'dot-pattern', dotSize: 1, gap: 0.5, rows: 1, stagger: false, omitEvery: 0 }

function stroke(points: StrokeDataV2['points'], closed = false): StrokeDataV2 {
  return { id: 'test', points, closed, thickness: 0.1 }
}

describe('공통 절단각 면적형 획', () => {
  it('수평·수직 획의 열린 끝면이 같은 화면 각도를 유지한다', () => {
    const horizontal = strokeToAngledAreaInkGroups(stroke([{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }]), box, 1, area)[0][0]
    const vertical = strokeToAngledAreaInkGroups(stroke([{ x: 0.5, y: 0.2 }, { x: 0.5, y: 0.8 }]), box, 1, area)[0][0]
    const angleOf = (first: typeof horizontal[number], second: typeof horizontal[number]) => {
      const raw = Math.atan2(second.y - first.y, second.x - first.x) * 180 / Math.PI
      return ((raw % 180) + 180) % 180
    }
    expect(angleOf(horizontal[0], horizontal.at(-1)!)).toBeCloseTo(35, 5)
    expect(angleOf(vertical[0], vertical.at(-1)!)).toBeCloseTo(35, 5)
  })

  it('굵기 변화가 중심선 위치를 바꾸지 않고 닫힌 컨투어만 만든다', () => {
    const source = stroke([{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }])
    const thin = strokeToAngledAreaInkGroups(source, box, 0.5, area)[0][0]
    const thick = strokeToAngledAreaInkGroups(source, box, 2, area)[0][0]
    const centerY = (contour: typeof thin) => (Math.min(...contour.map((point) => point.y)) + Math.max(...contour.map((point) => point.y))) / 2
    expect(centerY(thin)).toBeCloseTo(0.5, 8)
    expect(centerY(thick)).toBeCloseTo(0.5, 8)
    expect([...thin, ...thick].every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
  })

  it('모서리 곡률이 꺾인 획의 실제 offset 윤곽을 둥글게 바꾼다', () => {
    const corner = stroke([{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 0.8 }])
    const sharp = strokeToAngledAreaInkGroups(corner, box, 1, { ...area, cornerRadius: 0 })[0][0]
    const rounded = strokeToAngledAreaInkGroups(corner, box, 1, { ...area, cornerRadius: 1 })[0][0]
    expect(rounded.length).toBeGreaterThan(sharp.length)
    expect(rounded).not.toEqual(sharp)
  })

  it('매끄러운 베지어는 곡률 슬라이더와 무관하게 중심선의 연속 offset을 따른다', () => {
    const curve = stroke([
      { x: 0.1, y: 0.8, handleOut: { x: 0.1, y: 0.1 } },
      { x: 0.9, y: 0.8, handleIn: { x: 0.9, y: 0.1 } },
    ])
    const sharp = strokeToAngledAreaInkGroups(curve, box, 1, { ...area, cornerRadius: 0 })[0][0]
    const rounded = strokeToAngledAreaInkGroups(curve, box, 1, { ...area, cornerRadius: 1 })[0][0]
    // 곡률은 끝면의 네 모서리만 굴린다. 곡선의 옆면(끝 모서리를 뺀 나머지 점)은 그대로다.
    const half = sharp.length / 2
    const ends = new Set([0, half - 1, half, sharp.length - 1])
    const sides = sharp.filter((_, index) => !ends.has(index))
    for (const point of sides) expect(rounded).toContainEqual(point)
    expect(rounded.length).toBe(sharp.length + 4 * 4)
  })

  it('꺾임 없는 직선 줄기(홀자)도 끝 모서리가 굴려진다 — 곡률 0이면 네 점 그대로', () => {
    const stem = stroke([{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 }])
    const sharp = strokeToAngledAreaInkGroups(stem, box, 1, { ...area, cornerRadius: 0 })[0][0]
    const rounded = strokeToAngledAreaInkGroups(stem, box, 1, { ...area, cornerRadius: 0.6 })[0][0]
    expect(sharp).toHaveLength(4)
    expect(rounded).toHaveLength(20)
    // 굴린 윤곽은 각진 윤곽 밖으로 나가지 않는다.
    const xs = sharp.map((point) => point.x), ys = sharp.map((point) => point.y)
    for (const point of rounded) {
      expect(point.x).toBeGreaterThanOrEqual(Math.min(...xs) - 1e-9)
      expect(point.x).toBeLessThanOrEqual(Math.max(...xs) + 1e-9)
      expect(point.y).toBeGreaterThanOrEqual(Math.min(...ys) - 1e-9)
      expect(point.y).toBeLessThanOrEqual(Math.max(...ys) + 1e-9)
    }
  })

  it('짧은 획·중복점·베지어·닫힌 곡선에서 빈 값이나 NaN을 만들지 않는다', () => {
    const samples = [
      stroke([{ x: 0.5, y: 0.5 }, { x: 0.50001, y: 0.50001 }]),
      stroke([{ x: 0.1, y: 0.8, handleOut: { x: 0.1, y: 0.1 } }, { x: 0.9, y: 0.8, handleIn: { x: 0.9, y: 0.1 } }]),
      stroke([{ x: 0.2, y: 0.2 }, { x: 0.8, y: 0.2 }, { x: 0.8, y: 0.8 }, { x: 0.2, y: 0.8 }], true),
    ]
    for (const sample of samples) {
      const groups = strokeToRenderInkGroups(sample, box, 1, area)
      expect(groups.length).toBeGreaterThan(0)
      expect(groups.flat(2).every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))).toBe(true)
    }
  })

  it('닫힌 곡선을 바깥 윤곽과 내부 공간의 두 링으로 만든다', () => {
    const closed = stroke([
      { x: 0.5, y: 0.15, handleOut: { x: 0.75, y: 0.15 }, handleIn: { x: 0.25, y: 0.15 } },
      { x: 0.85, y: 0.5, handleOut: { x: 0.85, y: 0.75 }, handleIn: { x: 0.85, y: 0.25 } },
      { x: 0.5, y: 0.85, handleOut: { x: 0.25, y: 0.85 }, handleIn: { x: 0.75, y: 0.85 } },
      { x: 0.15, y: 0.5, handleOut: { x: 0.15, y: 0.25 }, handleIn: { x: 0.15, y: 0.75 } },
    ], true)
    const groups = strokeToAngledAreaInkGroups(closed, box, 1, area)
    expect(groups[0]).toHaveLength(2)
    const [outer, inner] = groups[0]
    const extent = (contour: typeof outer) => Math.max(...contour.map((point) => point.x)) - Math.min(...contour.map((point) => point.x))
    expect(extent(outer)).toBeGreaterThan(extent(inner))
  })

  it('폰트 좌표 투영 후에도 유효한 닫힌 컨투어를 유지한다', () => {
    const groups = strokeToAngledAreaInkGroups(stroke([{ x: 0.2, y: 0.5 }, { x: 0.8, y: 0.5 }]), box, 1, area)
    const contours = brushInkGroupsToFontContours(groups, 1000, 880, 0)
    expect(contours.flat(2).every((point) => Number.isFinite(point.x) && Number.isFinite(point.y) && point.onCurve)).toBe(true)
  })
})

describe('원형 점 반복 획', () => {
  it('점 크기·간격·열 수·교차 배열·생략 주기를 공통 규칙으로 적용한다', () => {
    const source = stroke([{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }])
    const single = strokeToDotPatternInkGroups(source, box, 1, dots)
    const patterned = strokeToDotPatternInkGroups(source, box, 1, { ...dots, rows: 2, stagger: true, omitEvery: 3 })
    expect(single.length).toBeGreaterThan(1)
    expect(patterned.length).toBeGreaterThan(single.length)
    expect(patterned.every((group) => group[0].length === 16)).toBe(true)
  })
})
