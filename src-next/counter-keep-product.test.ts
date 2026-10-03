import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { withCounterKeep } from '../src/services/inkCounterMeasure'
import { DEFAULT_BETWEEN_OPENING, DEFAULT_COUNTER_FLOOR, DEFAULT_TOTAL_MINSCALE } from '../src/services/counterKeep'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'

/**
 * 속공간 지키기 제품 부착 — 화면 · OTF가 지나는 resolver 입구가 실험실 셈(`withCounterKeep`)과 같은 두께를 내는지.
 * 플랜 `docs/plans/2026-10-01_속공간-지키기.md`. 손잡이는 눈 ②에서 확정한 `DEFAULT_*` 하나뿐이다.
 */

const MODEL = JSON.parse(readFileSync(fileURLToPath(new URL('../public/noto-preset/model.json', import.meta.url)), 'utf8')) as NotoPresetModelBundle
const FONT_SPACE = { width: 1000, height: 1000 }
const CHARS = ['빼', '를', '뷁', '이', '한', '웨', '쏟', '밭']

describe('속공간 지키기 — 제품 입구', () => {
  beforeAll(() => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) })
  })
  afterAll(() => { vi.unstubAllGlobals() })

  it('켜면 실험실 셈과 같은 두께를 낸다, 굵기 400 이하는 그대로', async () => {
    const [exportUtils, deltaStore, exportStore, layout, style, placement] = await Promise.all([
      import('../src/services/fontExportUtils'), import('./layoutDeltaStore'), import('./fontExportStore'),
      import('../src/stores/layoutStore'), import('../src/stores/globalStyleStore'), import('../src/services/designBodyPlacement'),
    ])
    const placementOf = exportStore.placementResolverOf(MODEL, deltaStore.layoutDeltaSnapshot())
    layout.useLayoutStore.getState().setGlobalPadding(placement.designBodyPaddingForSize(840, 910, FONT_SPACE))
    // 기본은 꺼짐(10-03, 개발 중). 이 테스트는 켠 상태의 셈을 본다.
    expect(style.isCounterKeepOn(style.useGlobalStyleStore.getState().style)).toBe(false)
    style.useGlobalStyleStore.getState().setCounterKeep(true)

    const collect = (char: string, weight: number, counterKeep?: boolean) => {
      style.useGlobalStyleStore.getState().updateStyle('weight', weight)
      return exportUtils.collectGlyphDataWithPlacement(char, placementOf, counterKeep === undefined ? undefined : { counterKeep })
    }

    // 제품 기본(10-02 눈 ③ 뒤집힘): 자소 안 층 끔(가로 몫 1 · 자소 바닥 1) + 자소 사이 떼기 + 합성 바닥.
    let thinnedSomewhere = false
    for (const char of CHARS) {
      // 굵기 400: 켜고 꺼도 점 하나까지 같다.
      const on400 = collect(char, 400)!
      const off400 = collect(char, 400, false)!
      on400.strokes.forEach((item, index) => expect(item.stroke.thickness).toBe(off400.strokes[index].stroke.thickness))

      // 굵기 900: 켜짐 = 보정 끈 수집에 실험실 셈(제품 손잡이)을 얹은 것. 상자가 원점만큼 평행이동해 있어 소수점 오차만 허용한다.
      const on900 = collect(char, 900)!
      const off900 = collect(char, 900, false)!
      const kept = withCounterKeep(off900, DEFAULT_COUNTER_FLOOR, 1, 1, DEFAULT_BETWEEN_OPENING, 0, DEFAULT_TOTAL_MINSCALE).data
      expect(on900.strokes.length).toBe(kept.strokes.length)
      on900.strokes.forEach((item, index) => expect(item.stroke.thickness).toBeCloseTo(kept.strokes[index].stroke.thickness, 12))
      if (on900.strokes.some((item, index) => item.stroke.thickness < off900.strokes[index].stroke.thickness)) thinnedSomewhere = true
    }
    // 자소 사이가 닿는 표본이 있으니 적어도 한 글자에서는 마주 본 획이 얇아져 있어야 한다.
    expect(thinnedSomewhere).toBe(true)

    // 스위치를 끄면 굵기 900도 보정 없이 그대로.
    style.useGlobalStyleStore.getState().setCounterKeep(false)
    const offByStore = collect('빼', 900)!
    const offByCondition = collect('빼', 900, false)!
    offByStore.strokes.forEach((item, index) => expect(item.stroke.thickness).toBe(offByCondition.strokes[index].stroke.thickness))
  })
})
