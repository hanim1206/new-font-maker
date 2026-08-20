import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_FONT_SPACE } from './calibrationProjectStore'
import { centeredDesignBodyPadding, paddingToDesignBody } from './designBody'

describe('Design Body', () => {
  it('네 방향 inset을 Font Space 안의 실제 네모꼴로 변환한다', () => {
    const body = paddingToDesignBody({ top: .1, right: .05, bottom: .1, left: .15 }, DEFAULT_FONT_SPACE)
    expect(body.x).toBeCloseTo(150)
    expect(body.y).toBeCloseTo(100)
    expect(body.width).toBeCloseTo(800)
    expect(body.height).toBeCloseTo(800)
  })

  it('폭과 높이를 가운데 정렬된 inset으로 변환한다', () => {
    expect(centeredDesignBodyPadding(880, 900, DEFAULT_FONT_SPACE)).toEqual({
      top: .05,
      right: .06,
      bottom: .05,
      left: .06,
    })
  })

  it('저장한 글로벌 네모꼴을 실제 글리프 출력 데이터에도 적용한다', async () => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    })
    const [{ collectGlyphDataForChar }, { useLayoutStore }] = await Promise.all([
      import('../src/services/fontExportUtils'),
      import('../src/stores/layoutStore'),
    ])
    const store = useLayoutStore.getState()
    const original = { ...store.globalPadding }
    try {
      const before = collectGlyphDataForChar('ㄱ')
      store.setGlobalPadding(centeredDesignBodyPadding(600, 600, DEFAULT_FONT_SPACE))
      const glyph = collectGlyphDataForChar('ㄱ')
      expect(glyph?.advanceWidth).toBe(600)
      expect(glyph!.strokes[0].box.width).toBeLessThan(before!.strokes[0].box.width)
      expect(glyph!.strokes[0].box.height).toBeLessThan(before!.strokes[0].box.height)
    } finally {
      useLayoutStore.getState().setGlobalPadding(original)
      vi.unstubAllGlobals()
    }
  })
})
