import { afterEach, describe, expect, it, vi } from 'vitest'

const STORAGE_KEY = 'font-maker-calibration-project'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length(): number {
    return this.values.size
  }

  clear(): void {
    this.values.clear()
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string): void {
    this.values.delete(key)
  }

  setItem(key: string, value: string): void {
    this.values.set(key, value)
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('Calibration project persistence contraction', () => {
  it('legacy layoutProfile을 hydration state와 다음 저장 payload에서 제외한다', async () => {
    const storage = new MemoryStorage()
    storage.setItem(STORAGE_KEY, JSON.stringify({
      state: {
        fontSpace: { unitsPerEm: 1000, width: 1000, height: 1000 },
        grid: { majorDivisions: 8, minorInterval: 25, snapInterval: 5 },
        designBody: { x: 75, y: 75, width: 850, height: 850 },
        metrics: {
          hangulAdvance: 1000,
          spaceAdvance: 500,
          punctuationAdvance: 500,
          lineHeight: 1200,
        },
        layoutProfile: {
          'choseong-jungseong-vertical': {
            CH: { top: 0, bottom: 0, left: .08, right: -.08 },
          },
        },
        sampleGlyphEdits: [],
        unknownLegacyField: { shouldNotHydrate: true },
      },
      version: 0,
    }))
    vi.stubGlobal('localStorage', storage)
    vi.resetModules()

    const { useCalibrationProjectStore } = await import('./calibrationProjectStore')
    const hydrated = useCalibrationProjectStore.getState() as unknown as Record<string, unknown>
    expect(hydrated).not.toHaveProperty('layoutProfile')
    expect(hydrated).not.toHaveProperty('setLayoutProfile')
    expect(hydrated).not.toHaveProperty('unknownLegacyField')

    useCalibrationProjectStore.getState().addSampleGlyphEdit({
      id: 'persist-without-profile',
      createdAt: '2026-08-24T00:00:00.000Z',
      raw: {
        kind: 'component-move',
        glyph: '가',
        component: { id: '가:initial:ㄱ', role: 'initial', jamoId: 'ㄱ' },
        layoutType: 'choseong-jungseong-vertical',
        parts: ['CH'],
        delta: { x: .01, y: 0 },
      },
      inferredRule: {
        kind: 'layout-profile',
        layoutType: 'choseong-jungseong-vertical',
        parts: ['CH'],
      },
    })

    const persisted = JSON.parse(storage.getItem(STORAGE_KEY)!) as {
      state: Record<string, unknown>
    }
    expect(persisted.state).not.toHaveProperty('layoutProfile')
    expect(persisted.state).not.toHaveProperty('unknownLegacyField')
    expect(persisted.state.sampleGlyphEdits).toHaveLength(1)
    expect(Object.keys(persisted.state).sort()).toEqual([
      'designBody',
      'fontSpace',
      'grid',
      'metrics',
      'sampleGlyphEdits',
    ])
  })
})
