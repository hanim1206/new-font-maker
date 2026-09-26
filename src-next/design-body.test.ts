import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_FONT_SPACE } from './calibrationProjectStore'
import { designBodyPaddingOfSize, paddingToDesignBody } from './designBody'

describe('Design Body', () => {
  it('네 방향 inset을 Font Space 안의 실제 네모꼴로 변환한다', () => {
    const body = paddingToDesignBody({ top: .1, right: .05, bottom: .1, left: .15 }, DEFAULT_FONT_SPACE)
    expect(body.x).toBeCloseTo(150)
    expect(body.y).toBeCloseTo(100)
    expect(body.width).toBeCloseTo(800)
    expect(body.height).toBeCloseTo(800)
  })

  it('폭과 높이를 여백으로 바꾼다. 남는 칸은 기본 네모꼴 비율(왼 50 : 오른 110, 위 50 : 아래 40)로 나눈다', () => {
    const padding = designBodyPaddingOfSize(680, 820, DEFAULT_FONT_SPACE)
    expect(padding.left).toBeCloseTo(.1, 9)
    expect(padding.right).toBeCloseTo(.22, 9)
    expect(padding.top).toBeCloseTo(.1, 9)
    expect(padding.bottom).toBeCloseTo(.08, 9)
  })

  it('기본 크기(840 × 910)면 정확히 기본 네모꼴이 된다', async () => {
    const { isReferenceBody } = await import('../src/services/designBodyPlacement')
    expect(isReferenceBody(designBodyPaddingOfSize(840, 910, DEFAULT_FONT_SPACE))).toBe(true)
  })

  it('저장한 글로벌 네모꼴을 실제 글리프 출력 데이터에도 적용한다', async () => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => memory.get(key) ?? null,
      setItem: (key: string, value: string) => memory.set(key, value),
      removeItem: (key: string) => memory.delete(key),
    })
    const [{ collectGlyphDataForChar }, { useLayoutStore }, { hangulAdvance }] = await Promise.all([
      import('../src/services/fontExportUtils'),
      import('../src/stores/layoutStore'),
      import('../src/services/fontMetrics'),
    ])
    const store = useLayoutStore.getState()
    const original = { ...store.globalPadding }
    try {
      const before = collectGlyphDataForChar('ㄱ')
      const padding = designBodyPaddingOfSize(600, 600, DEFAULT_FONT_SPACE)
      store.setGlobalPadding(padding)
      const glyph = collectGlyphDataForChar('ㄱ')
      expect(glyph?.advanceWidth).toBe(hangulAdvance(padding))
      expect(glyph!.strokes[0].box.width).toBeLessThan(before!.strokes[0].box.width)
      expect(glyph!.strokes[0].box.height).toBeLessThan(before!.strokes[0].box.height)
    } finally {
      useLayoutStore.getState().setGlobalPadding(original)
      vi.unstubAllGlobals()
    }
  })
})
