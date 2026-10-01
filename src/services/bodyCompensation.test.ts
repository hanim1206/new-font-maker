import { describe, expect, it } from 'vitest'
import { DEFAULT_STYLE, loadedGlobalStyle, type GlobalStyle } from '../stores/globalStyleStore'
import type { StrokeDataV2 } from '../types'
import { stemScaleExponentFor, stemScaleForBody, withBodyCompensation } from './bodyCompensation'
import { REFERENCE_BODY_PADDING, designBodyPaddingForSize } from './designBodyPlacement'
import { strokeToFlatInkGroups } from './flatStrokeGeometry'
import { parseAndMigrateFontData } from './fontDataMigration'
import { stemScaleOf, verticalWidthFactorOf } from './strokeRenderGeometry'
import { weightToMultiplier } from '../utils/globalStyleUtils'

const narrow = designBodyPaddingForSize(600, 910, { width: 1000, height: 1000 })
const wide = designBodyPaddingForSize(1000, 910, { width: 1000, height: 1000 })
const style = (): GlobalStyle => structuredClone(DEFAULT_STYLE)

describe('네모꼴 자동 굵기 보정', () => {
  it('좁히면 세로줄기 배율이 가로 비율의 제곱근이고, 기본 · 넓힌 네모꼴에서는 1이다', () => {
    expect(stemScaleForBody(narrow)).toBeCloseTo(Math.sqrt(600 / 840), 9)
    expect(stemScaleForBody({ ...REFERENCE_BODY_PADDING })).toBe(1)
    expect(stemScaleForBody(undefined)).toBe(1)
    expect(stemScaleForBody(wide)).toBe(1)
  })

  it('굵을수록 세게 보정한다: 세기 = 0.5 × 굵기 배율, 최대 1', () => {
    // 굵기 배율 표는 따로 바뀔 수 있어 값을 박지 않는다 — 400이 기준(배율 1)이라는 것과 순서만 본다.
    expect(stemScaleExponentFor(400)).toBe(0.5)
    expect(stemScaleExponentFor(700)).toBeCloseTo(0.5 * weightToMultiplier(700), 12)
    expect(stemScaleExponentFor(200)).toBeLessThan(stemScaleExponentFor(400))
    expect(stemScaleExponentFor(700)).toBeGreaterThan(stemScaleExponentFor(400))
    expect(stemScaleExponentFor(900)).toBeGreaterThanOrEqual(stemScaleExponentFor(700))
    expect(stemScaleExponentFor(900)).toBeLessThanOrEqual(1)
    const scaleAt = (weight: number) => stemScaleOf(withBodyCompensation({ ...style(), weight }, narrow).strokeStyle)
    // 굵을수록 세로줄기가 더 준다. 아무리 굵어도 가로 비율(600/840)보다 더 줄지는 않는다.
    expect(scaleAt(700)).toBeLessThan(scaleAt(400))
    expect(scaleAt(200)).toBeGreaterThan(scaleAt(400))
    expect(scaleAt(900)).toBeGreaterThanOrEqual(600 / 840 - 1e-12)
  })

  it('보정은 실효 스타일에만 얹힌다: 기본 네모꼴 · 끔 · 넓힘이면 받은 객체 그대로다', () => {
    const base = style()
    expect(withBodyCompensation(base, { ...REFERENCE_BODY_PADDING })).toBe(base)
    expect(withBodyCompensation(base, wide)).toBe(base)
    const off = { ...base, autoCompensation: false }
    expect(withBodyCompensation(off, narrow)).toBe(off)
    const on = withBodyCompensation(base, narrow)
    expect(on).not.toBe(base)
    expect(stemScaleOf(on.strokeStyle)).toBeCloseTo(Math.sqrt(600 / 840), 9)
    // 저장되는 값(굵기 · 대비)은 그대로다.
    expect(on.weight).toBe(base.weight)
    expect(base.strokeStyle).toEqual(DEFAULT_STYLE.strokeStyle)
  })

  it('방향별 두께를 못 내는 스타일(둥근 끝 · 납작 붓)은 보정하지 않는다. 둥글기가 있으면 둥근 끝이어도 건다', () => {
    const roundEnds = { ...style(), linecap: 'round' as const, linejoin: 'round' as const }
    expect(withBodyCompensation(roundEnds, narrow)).toBe(roundEnds)
    const flatBrush = { ...style(), strokeStyle: { mode: 'brush' as const, brush: { tip: 'ellipse' as const, aspectRatio: 0.4, angle: 30 } } }
    expect(withBodyCompensation(flatBrush, narrow)).toBe(flatBrush)
    const rounded = { ...roundEnds, strokeStyle: { ...DEFAULT_STYLE.strokeStyle, roundness: 0.5 } }
    expect(stemScaleOf(withBodyCompensation(rounded, narrow).strokeStyle)).toBeLessThan(1)
  })

  it('세로줄기만 얇아진다: 세로 획의 잉크 폭은 두께 × 배율, 가로 획의 잉크 높이는 그대로', () => {
    const box = { x: 0, y: 0, width: 1, height: 1 }
    const stroke = (points: StrokeDataV2['points']): StrokeDataV2 => ({ id: 's', points, closed: false, thickness: 0.07 })
    const span = (groups: ReturnType<typeof strokeToFlatInkGroups>, axis: 'x' | 'y') => {
      const values = groups.flatMap((group) => group.flatMap((contour) => contour.map((point) => point[axis])))
      return Math.max(...values) - Math.min(...values)
    }
    const vertical = strokeToFlatInkGroups(stroke([{ x: 0.5, y: 0.1 }, { x: 0.5, y: 0.9 }]), box, 1, 'butt', 'miter', undefined, 0, undefined, 0, 0.8)
    const horizontal = strokeToFlatInkGroups(stroke([{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }]), box, 1, 'butt', 'miter', undefined, 0, undefined, 0, 0.8)
    expect(span(vertical, 'x')).toBeCloseTo(0.07 * 0.8, 9)
    expect(span(horizontal, 'y')).toBeCloseTo(0.07, 9)
    // 부리처럼 기둥 폭을 재는 쪽도 같은 배율을 읽는다.
    expect(verticalWidthFactorOf({ ...DEFAULT_STYLE.strokeStyle, stemScale: 0.8 } as GlobalStyle['strokeStyle'])).toBeCloseTo(0.8, 9)
  })

  it('완만한 곡선(ㅅ의 삐침)은 획 전체가 고르게 얇아진다 — 가파른 위만 얇고 발끝은 굵게 갈라지지 않는다', () => {
    const box = { x: 0, y: 0, width: 1, height: 1 }
    // 위는 거의 세로, 발끝은 45°로 눕는 삐침.
    const leg: StrokeDataV2 = { id: 'leg', closed: false, thickness: 0.07, points: [{ x: 0.5, y: 0.1, handleOut: { x: 0.5, y: 0.45 } }, { x: 0.15, y: 0.9, handleIn: { x: 0.4, y: 0.7 } }] }
    const groups = strokeToFlatInkGroups(leg, box, 1, 'butt', 'miter', undefined, 0, undefined, 0, 0.8)
    const outline = groups[0][0]
    // 잉크 윤곽에서 위 끝과 발끝의 자른 면 길이(= 그 자리의 두께)를 잰다. butt 끝이라 양 끝 변이 곧 두께다.
    const edges = outline.map((point, index) => { const next = outline[(index + 1) % outline.length]; return { length: Math.hypot(next.x - point.x, next.y - point.y), y: (point.y + next.y) / 2 } })
    const top = edges.filter((edge) => edge.y < 0.12).sort((a, b) => b.length - a.length)[0].length
    const foot = edges.filter((edge) => edge.y > 0.85).sort((a, b) => b.length - a.length)[0].length
    expect(top).toBeCloseTo(foot, 4)
    // 양 끝을 잇는 방향(약 66°)만큼 얇아졌다: 1 − 0.2 × sin²θ.
    const sin2 = 0.8 ** 2 / (0.35 ** 2 + 0.8 ** 2)
    expect(top).toBeCloseTo(0.07 * (1 - 0.2 * sin2), 4)
  })

  it('세로줄기 배율은 저장되지 않고, 끔(`false`)만 저장된다', () => {
    const compensated = withBodyCompensation(style(), narrow)
    // 실효 스타일이 저장소로 되돌아와도 정규화가 배율을 걷어 낸다.
    expect(stemScaleOf(loadedGlobalStyle(compensated).strokeStyle)).toBe(1)
    expect('stemScale' in loadedGlobalStyle(compensated).strokeStyle).toBe(false)
    expect('autoCompensation' in loadedGlobalStyle({ ...style(), autoCompensation: true })).toBe(false)
    expect(loadedGlobalStyle({ ...style(), autoCompensation: false }).autoCompensation).toBe(false)
  })
})

describe('폰트 데이터의 자동 보정 끔', () => {
  it('없으면 켜짐, `false`는 읽고 쓸 때 남는다. 다른 값은 거른다', async () => {
    const { useGlobalStyleStore } = await import('../stores/globalStyleStore')
    const { collectFontData } = await import('./fontDataBridge')
    useGlobalStyleStore.getState().setAutoCompensation(false)
    const off = collectFontData()
    expect(off.globalStyle.style.autoCompensation).toBe(false)
    expect(parseAndMigrateFontData(off).ok).toBe(true)
    useGlobalStyleStore.getState().setAutoCompensation(true)
    const on = collectFontData()
    expect('autoCompensation' in on.globalStyle.style).toBe(false)
    const broken = structuredClone(off) as unknown as { globalStyle: { style: Record<string, unknown> } }
    broken.globalStyle.style.autoCompensation = 'no'
    expect(parseAndMigrateFontData(broken).ok).toBe(false)
  })
})
