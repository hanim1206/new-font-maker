import { describe, expect, it } from 'vitest'
import baseJamos from '../src/data/baseJamos.json'
import type { JamoData, StrokeDataV2 } from '../src/types'
import { applyComponentPlacementProfile } from '../src/data/componentPlacementProfiles'
import { fitStrokesToBox, getJamoRenderBox, measureJamoGeometry } from '../src/utils/jamoGeometry'

const jamos = baseJamos as unknown as {
  choseong: Record<string, JamoData>
  jungseong: Record<string, JamoData>
  jongseong: Record<string, JamoData>
}

describe('잉크 마스터 지오메트리', () => {
  it('세로획의 실제 잉크 비율을 획 두께까지 포함해 계산한다', () => {
    const strokes = jamos.jungseong['ㅣ'].strokes!
    const geometry = measureJamoGeometry(strokes)!
    expect(geometry.width).toBeCloseTo(0.07)
    expect(geometry.height).toBeCloseTo(1.07)
    expect(geometry.aspectRatio).toBeCloseTo(0.07 / 1.07)
  })

  it('곡선은 핸들 상자가 아니라 실제 베지어 곡선의 극값으로 측정한다', () => {
    const curve: StrokeDataV2 = {
      id: 'curve',
      closed: false,
      thickness: 0.1,
      points: [
        { x: 0, y: 0, handleOut: { x: 0, y: 1 } },
        { x: 1, y: 0, handleIn: { x: 1, y: 1 } },
      ],
    }
    const geometry = measureJamoGeometry([curve])!
    expect(geometry.centerlineBounds.maxY).toBeCloseTo(0.75)
  })

  it('직사각형 슬롯에서도 ㄱ의 원본 가로세로 비율을 유지한다', () => {
    const strokes = jamos.choseong['ㄱ'].strokes!
    const fitted = fitStrokesToBox(strokes, { x: 0.1, y: 0.1, width: 0.25, height: 0.7 })
    expect(fitted.width).toBeCloseTo(fitted.height)
    expect(fitted.width).toBeCloseTo(0.18)
  })

  it('기존 ㅏ는 좁은 슬롯의 세로 높이를 그대로 사용한다', () => {
    const jamo = jamos.jungseong['ㅏ']
    const target = { x: 0.68, y: 0.1, width: 0.18, height: 0.8 }
    expect(getJamoRenderBox(jamo, jamo.strokes!, target)).toEqual(target)
  })

  it('슬롯 밖 획은 고정폭 EM의 실제 잉크 경계 안에서만 뻗는다', () => {
    const source = jamos.jungseong['ㅏ']
    const jamo: JamoData = {
      ...source,
      strokes: source.strokes!.map((stroke) => stroke.id === 'ㅏ-2'
        ? { ...stroke, points: stroke.points.map((point, index) => index === stroke.points.length - 1 ? { ...point, x: 1.345 } : point) }
        : stroke),
    }
    const target = { x: 0.750625, y: 0.075, width: 0.174375, height: 0.85 }
    const fitted = getJamoRenderBox(jamo, jamo.strokes!, target)
    const geometry = measureJamoGeometry(jamo.strokes!)!
    const inkMin = fitted.x
      + geometry.centerlineBounds.minX * fitted.width
      - jamo.strokes![0].thickness / 2
    const inkMax = fitted.x
      + geometry.centerlineBounds.maxX * fitted.width
      + jamo.strokes![0].thickness / 2
    expect(fitted.width).toBeLessThanOrEqual(target.width)
    expect(inkMin).toBeGreaterThanOrEqual(0)
    expect(inkMax).toBeLessThanOrEqual(1)
  })

  it('왼쪽으로 조금 돌출된 ㅜ의 가로획을 점으로 축소하지 않는다', () => {
    const source = jamos.jungseong['ㅜ']
    const jamo: JamoData = {
      ...source,
      strokes: source.strokes!.map((stroke) => stroke.id === 'ㅜ-1'
        ? { ...stroke, points: [{ x: -.01, y: .125 }, { x: .99, y: .125 }] }
        : stroke),
    }
    const target = { x: .085, y: .375, width: .85, height: .25 }
    const fitted = getJamoRenderBox(jamo, jamo.strokes!, target, 1, { min: .075, max: .925 })
    expect(fitted.width).toBeGreaterThan(.7)
    expect(fitted.x + -.01 * fitted.width - .035).toBeGreaterThanOrEqual(.075 - .000001)
    expect(fitted.x + .99 * fitted.width + .035).toBeLessThanOrEqual(.925 + .000001)
  })

  it('잉크 정규화로 표시한 신규 마스터에만 균일 스케일을 적용한다', () => {
    const base = jamos.choseong['ㄱ']
    const jamo: JamoData = { ...base, geometryMode: 'ink-normalized' }
    const target = { x: 0.1, y: 0.1, width: 0.25, height: 0.7 }
    const fitted = getJamoRenderBox(jamo, jamo.strokes!, target)
    expect(fitted.width).toBeCloseTo(fitted.height)
    expect(fitted).not.toEqual(target)
  })
})

describe('조합 배치 프로필', () => {
  it('기존 ㅏ padding을 자모가 아닌 JU 레이아웃 영역에 동일하게 적용한다', () => {
    const boxes = applyComponentPlacementProfile(
      { JU: { x: 0.6, y: 0.1, width: 0.325, height: 0.8 } },
      'ㅏ',
    )
    expect(boxes.JU).toEqual({ x: 0.673125, y: 0.1, width: 0.251875, height: 0.8 })
  })
})
