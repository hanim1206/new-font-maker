import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import { withCounterKeep } from '../src/services/inkCounterMeasure'
import { DEFAULT_BETWEEN_OPENING, DEFAULT_COUNTER_FLOOR, DEFAULT_COUNTER_MINSCALE, DEFAULT_HORIZONTAL_SHARE, DEFAULT_TOTAL_MINSCALE } from '../src/services/counterKeep'
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

  it('기본 켜짐이 실험실 셈과 같은 두께를 낸다, 굵기 400 이하는 그대로', async () => {
    const [exportUtils, deltaStore, exportStore, layout, style, placement] = await Promise.all([
      import('../src/services/fontExportUtils'), import('./layoutDeltaStore'), import('./fontExportStore'),
      import('../src/stores/layoutStore'), import('../src/stores/globalStyleStore'), import('../src/services/designBodyPlacement'),
    ])
    const placementOf = exportStore.placementResolverOf(MODEL, deltaStore.layoutDeltaSnapshot())
    layout.useLayoutStore.getState().setGlobalPadding(placement.designBodyPaddingForSize(840, 910, FONT_SPACE))

    const collect = (char: string, weight: number, counterKeep?: boolean) => {
      style.useGlobalStyleStore.getState().updateStyle('weight', weight)
      return exportUtils.collectGlyphDataWithPlacement(char, placementOf, counterKeep === undefined ? undefined : { counterKeep })
    }

    for (const char of CHARS) {
      // 굵기 400: 켜고 꺼도 점 하나까지 같다.
      const on400 = collect(char, 400)!
      const off400 = collect(char, 400, false)!
      on400.strokes.forEach((item, index) => expect(item.stroke.thickness).toBe(off400.strokes[index].stroke.thickness))

      // 굵기 900: 기본(켜짐) = 보정 끈 수집에 실험실 셈을 얹은 것. 상자가 원점만큼 평행이동해 있어 소수점 오차만 허용한다.
      const on900 = collect(char, 900)!
      const off900 = collect(char, 900, false)!
      const kept = withCounterKeep(off900, DEFAULT_COUNTER_FLOOR, DEFAULT_HORIZONTAL_SHARE, DEFAULT_COUNTER_MINSCALE, DEFAULT_BETWEEN_OPENING, 0, DEFAULT_TOTAL_MINSCALE).data
      expect(on900.strokes.length).toBe(kept.strokes.length)
      on900.strokes.forEach((item, index) => expect(item.stroke.thickness).toBeCloseTo(kept.strokes[index].stroke.thickness, 12))
      // 빽빽한 표본이라 적어도 한 획은 얇아져 있어야 한다.
      expect(on900.strokes.some((item, index) => item.stroke.thickness < off900.strokes[index].stroke.thickness)).toBe(true)
    }

    // 스위치를 끄면 굵기 900도 보정 없이 그대로.
    style.useGlobalStyleStore.getState().setCounterKeep(false)
    const offByStore = collect('빼', 900)!
    const offByCondition = collect('빼', 900, false)!
    offByStore.strokes.forEach((item, index) => expect(item.stroke.thickness).toBe(offByCondition.strokes[index].stroke.thickness))
    style.useGlobalStyleStore.getState().setCounterKeep(true)
  })
})
