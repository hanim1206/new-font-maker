import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import type { StrokeDataV2 } from '../src/types'

const STORAGE_KEY = 'font-maker-global-style'
const GRID_LAB_STORAGE_KEY = 'font-maker-grid-system-2-lab-v1'
const legacyStyle = {
  slant: 0,
  weight: 400,
  letterSpacing: 0,
  linecap: 'round',
  linejoin: 'round',
  brush: { tip: 'round', aspectRatio: 0.5, angle: 0 },
  strokeStyle: { mode: 'grid-system-2' },
}

function installStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
    removeItem: (key: string) => values.delete(key),
  }
  vi.stubGlobal('localStorage', storage)
  vi.stubGlobal('window', { localStorage: storage, addEventListener: vi.fn(), removeEventListener: vi.fn() })
  return values
}

beforeEach(() => vi.resetModules())

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('레거시 격자 중심선 mode 호환', () => {
  it('구형 localStorage를 canonical mode로 hydrate하고 다시 canonical 이름으로 저장한다', async () => {
    const values = installStorage({
      [STORAGE_KEY]: JSON.stringify({ state: { style: legacyStyle, exclusions: [] }, version: 0 }),
    })
    const { useGlobalStyleStore } = await import('../src/stores/globalStyleStore')

    expect(useGlobalStyleStore.getState().style.strokeStyle).toEqual({ mode: 'legacy-snapped-centerline' })
    const persisted = JSON.parse(values.get(STORAGE_KEY) ?? '{}') as { state?: { style?: { strokeStyle?: unknown } } }
    expect(persisted.state?.style?.strokeStyle).toEqual({ mode: 'legacy-snapped-centerline' })
  })

  it('구형 FontData load와 새 입력을 같은 normalize 함수로 canonicalize하고 collect한다', async () => {
    installStorage()
    const [{ useGlobalStyleStore, normalizeStrokeRenderStyle }, { collectFontData }] = await Promise.all([
      import('../src/stores/globalStyleStore'),
      import('../src/services/fontDataBridge'),
    ])
    useGlobalStyleStore.getState().loadFontData({
      style: legacyStyle as never,
      exclusions: [],
    })

    expect(normalizeStrokeRenderStyle({ mode: 'grid-system-2' })).toEqual({ mode: 'legacy-snapped-centerline' })
    expect(normalizeStrokeRenderStyle({ mode: 'legacy-snapped-centerline' })).toEqual({ mode: 'legacy-snapped-centerline' })
    expect(useGlobalStyleStore.getState().style.strokeStyle).toEqual({ mode: 'legacy-snapped-centerline' })
    expect(collectFontData().globalStyle.style.strokeStyle).toEqual({ mode: 'legacy-snapped-centerline' })
  })

  it('old/new mode가 같은 25/75/35 geometry를 정확히 사용한다', async () => {
    installStorage()
    const [{ normalizeStrokeRenderStyle }, geometry, renderer] = await Promise.all([
      import('../src/stores/globalStyleStore'),
      import('../src/services/gridSystem2Geometry'),
      import('../src/services/strokeRenderGeometry'),
    ])
    const stroke: StrokeDataV2 = {
      id: 'legacy-grid-line',
      closed: false,
      thickness: 0.07,
      points: [{ x: 0.013, y: 0.5 }, { x: 0.987, y: 0.5 }],
    }
    const box = { x: 0.075, y: 0.075, width: 0.85, height: 0.85 }
    const oldStyle = normalizeStrokeRenderStyle({ mode: 'grid-system-2' })
    const canonicalStyle = normalizeStrokeRenderStyle({ mode: 'legacy-snapped-centerline' })

    expect(geometry.GRID_SYSTEM_2_UNIT).toBe(0.025)
    expect(geometry.GRID_SYSTEM_2_STROKE_UNITS).toBe(3)
    expect(geometry.snapStrokeToGridSystem2(stroke, box, 1).thickness).toBe(
      geometry.GRID_SYSTEM_2_STROKE_UNITS * geometry.GRID_SYSTEM_2_UNIT,
    )
    expect(geometry.GRID_SYSTEM_2_CUT_ANGLE).toBe(35)
    expect(oldStyle).toEqual(canonicalStyle)
    expect(renderer.strokeToRenderInkGroups(stroke, box, 1, oldStyle)).toEqual(
      renderer.strokeToRenderInkGroups(stroke, box, 1, canonicalStyle),
    )
  })

  it('Grid Lab은 기존 저장 키와 별도 프로젝트 모델을 계속 사용한다', () => {
    const source = readFileSync(new URL('./GridSystem2LabPage.tsx', import.meta.url), 'utf8')
    expect(source).toContain(`const STORAGE_KEY = '${GRID_LAB_STORAGE_KEY}'`)
    expect(source).not.toContain('legacy-snapped-centerline')
  })
})
