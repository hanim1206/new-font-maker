import { describe, expect, it } from 'vitest'
import type { JamoData, StrokeDataV2 } from '../types'
import base from '../data/baseJamos.json'
import { strokeToFlatInkGroups } from './flatStrokeGeometry'
import { flatGroupsOverlap } from './flatStrokeSelfOverlap'
import { fitNotoComponent, inkOfComponentFit } from './notoComponentFit'

/** ㅎ의 ㅇ 위 점을 아래로 끌고 두 핸들을 위로 모은 모양(2026-09-28 사용자 화면). 곡선이 반폭보다 급하게 꺾인다. */
function pinchedHieut(): JamoData {
  const hieut = structuredClone((base as unknown as { choseong: Record<string, JamoData> }).choseong['ㅎ'])
  const circle = hieut.strokes!.find((stroke) => stroke.closed) as StrokeDataV2
  circle.points[0] = { x: 0.45, y: 0.62, handleIn: { x: 0.2, y: 0.25 }, handleOut: { x: 0.42, y: 0.35 } }
  return hieut
}

describe('일자 스트로커 · 스스로 겹친 윤곽', () => {
  const box = { x: 0.2, y: 0.15, width: 0.6, height: 0.7 }

  it('급하게 꺾인 닫힌 곡선도 겹치지 않는 윤곽으로 나온다(각진 끝 · 둥글기)', () => {
    const circle = pinchedHieut().strokes!.find((stroke) => stroke.closed) as StrokeDataV2
    for (const roundness of [0, 0.5]) {
      const groups = strokeToFlatInkGroups(circle, box, 1, 'butt', 'miter', 32, roundness, roundness)
      expect(groups.length).toBeGreaterThan(0)
      expect(flatGroupsOverlap(groups)).toBe(false)
    }
  })

  it('기본 자모 획은 대체 경로를 안 탄다 — 겹침 검사가 멀쩡한 윤곽에 안 걸린다', () => {
    const jamos = base as unknown as Record<'choseong' | 'jungseong' | 'jongseong', Record<string, JamoData>>
    const strokes = (['choseong', 'jungseong', 'jongseong'] as const).flatMap((type) => Object.values(jamos[type]).flatMap((jamo) => [...(jamo.strokes ?? []), ...(jamo.horizontalStrokes ?? []), ...(jamo.verticalStrokes ?? [])]))
    const overlapping = strokes.filter((stroke) => flatGroupsOverlap(strokeToFlatInkGroups(stroke as StrokeDataV2, box, 1, 'butt', 'miter', 32)))
    expect(overlapping).toEqual([])
  })

  it('닿는 글자 카드 · OTF가 쓰는 최종 잉크가 그 자소를 거부하지 않는다', () => {
    const fit = fitNotoComponent({ part: 'CH', jamo: pinchedHieut(), family: null, faces: { left: 0.2, right: 0.8, top: 0.15, bottom: 0.85 }, glyphId: 'test', globalLinecap: 'butt', globalLinejoin: 'miter' })
    expect(fit.ok).toBe(true)
    if (!fit.ok) return
    const ink = inkOfComponentFit(fit.fit)
    expect(ink.ok ? 'ok' : ink.message).toBe('ok')
  })
})
