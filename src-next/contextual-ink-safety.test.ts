import { describe, expect, it, vi } from 'vitest'
import type { BoxConfig, DecomposedSyllable, JamoData, Part } from '../src/types'
import {
  resolveSyllableContextualInkSafety,
  withContextualInkSafety,
} from '../src/utils/contextualInkSafety'

const choseong: JamoData = {
  char: 'ㄱ',
  type: 'choseong',
  strokes: [{ id: 'ch', points: [{ x: 1, y: 0 }, { x: 1, y: 1 }], closed: false, thickness: 0.05 }],
}

function medial(x: number): JamoData {
  return {
    char: 'ㅏ',
    type: 'jungseong',
    strokes: [{ id: 'ju', points: [{ x, y: 0 }, { x, y: 1 }], closed: false, thickness: 0.05 }],
  }
}

function syllable(jungseong: JamoData): DecomposedSyllable {
  return {
    char: '가',
    choseong,
    jungseong,
    jongseong: null,
    layoutType: 'choseong-jungseong-vertical',
  }
}

const spaciousBoxes: Partial<Record<Part, BoxConfig>> = {
  CH: { x: 0, y: 0, width: 0.2, height: 1 },
  JU: { x: 0.8, y: 0, width: 0.2, height: 1 },
}

const tightBoxes: Partial<Record<Part, BoxConfig>> = {
  CH: { x: 0, y: 0, width: 0.4, height: 1 },
  JU: { x: 0.6, y: 0, width: 0.4, height: 1 },
}

describe('문맥별 잉크 안전 적용', () => {
  it('같은 자소 목표를 여유 있는 글자에는 전부, 좁은 글자에는 안전한 만큼 적용한다', () => {
    const origin = medial(0)
    const target = withContextualInkSafety(origin, origin, medial(-0.5), 0.1)

    const spacious = resolveSyllableContextualInkSafety(syllable(target), spaciousBoxes)
    const tight = resolveSyllableContextualInkSafety(syllable(target), tightBoxes)

    expect(spacious.syllable.jungseong?.strokes?.[0].points[0].x).toBeCloseTo(-0.5)
    expect(spacious.limitedParts).toEqual([])
    expect(tight.syllable.jungseong?.strokes?.[0].points[0].x).toBeGreaterThan(-0.5)
    expect(tight.limitedParts).toEqual(['JU'])
  })

  it('연속 편집에서도 최초 안전 보정 시작 형태를 유지한다', () => {
    const origin = medial(0)
    const first = withContextualInkSafety(origin, origin, medial(-0.2), 0.1)
    const second = withContextualInkSafety(first, medial(-0.1), medial(-0.3), 0.1)

    expect(second.contextualInkSafety?.origin.strokes?.[0].points[0].x).toBe(0)
  })

  it('폰트 출력도 화면과 같은 문맥별 안전 형태를 사용한다', async () => {
    const values = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    })
    const [{ collectGlyphDataForChar }, { useJamoStore }] = await Promise.all([
      import('../src/services/fontExportUtils'),
      import('../src/stores/jamoStore'),
    ])
    const stored = structuredClone(useJamoStore.getState().jungseong['ㅏ'])
    const target = structuredClone(stored)
    const verticalStroke = target.strokes?.[0]
    if (!verticalStroke) throw new Error('ㅏ 세로획이 없습니다')
    verticalStroke.points = verticalStroke.points.map((point) => ({
      ...point,
      y: point.y + 0.12,
      ...(point.handleIn && { handleIn: { ...point.handleIn, y: point.handleIn.y + 0.12 } }),
      ...(point.handleOut && { handleOut: { ...point.handleOut, y: point.handleOut.y + 0.12 } }),
    }))
    useJamoStore.getState().updateJungseong('ㅏ', withContextualInkSafety(stored, stored, target, 0.025))

    try {
      const openGlyph = collectGlyphDataForChar('가')
      const tightGlyph = collectGlyphDataForChar('각')
      const openStroke = openGlyph?.strokes.find((item) => item.stroke.id === verticalStroke.id)?.stroke
      const tightStroke = tightGlyph?.strokes.find((item) => item.stroke.id === verticalStroke.id)?.stroke
      expect(openStroke?.points.at(-1)?.y).toBeCloseTo(verticalStroke.points.at(-1)!.y)
      expect(tightStroke?.points.at(-1)?.y).toBeLessThan(verticalStroke.points.at(-1)!.y)
    } finally {
      useJamoStore.getState().updateJungseong('ㅏ', stored)
      vi.unstubAllGlobals()
    }
  })
})
