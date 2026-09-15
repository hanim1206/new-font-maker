import { expect, it } from 'vitest'
import { buildPresetCompositionBoard } from '../../src-next/presetCompositionInput'
import { generatePresetGuideGlyph, selectPresetGuideComponentPath } from './presetGuideGlyph'

it('21홀자의 역할면·전체 구간을 모두 생성한다', () => {
  for (const target of buildPresetCompositionBoard('ㄱ').filter((item) => item.finalJamo === null)) {
    const result = generatePresetGuideGlyph(target)!
    expect(result).not.toBeNull()
    expect(result.initialContourIds.length).toBeGreaterThan(0)
    for (const element of target.medial.source.elements) {
      if (element.face.status !== 'candidate') throw new Error('역할면 없음')
      const rect = result.rects.find((r) => r.id === `JU:${element.elementId}`)!
      expect((element.orientation === 'vertical' ? rect.x + rect.width : rect.y) * 1000).toBeCloseTo(element.face.value)
      if (element.face.referenceMode === 'start-side-local-tangent') {
        expect(result.inferred.some((text) => text.includes('미측정 끝'))).toBe(true)
      } else {
        const spans = element.componentSpans!
        expect((element.orientation === 'vertical' ? rect.y : rect.x) * 1000).toBeCloseTo(Math.min(...spans.map((s) => s.from)))
        expect((element.orientation === 'vertical' ? rect.y + rect.height : rect.x + rect.width) * 1000).toBeCloseTo(Math.max(...spans.map((s) => s.to)))
      }
    }
  }
})

it('투영 조합도 생성하고 받침 조합은 검수 전 생성하지 않는다', () => {
  expect(generatePresetGuideGlyph(buildPresetCompositionBoard('ㅍ').find((t) => t.character === '풔')!)).not.toBeNull()
  expect(generatePresetGuideGlyph(buildPresetCompositionBoard('ㄱ').find((t) => t.character === '각')!)).toBeNull()
})

it('추출 contour ID만 원본 path에서 선택한다', () => {
  expect(selectPresetGuideComponentPath('M0 0H1ZM2 2H3ZM4 4H5Z', [0, 2])).toBe('M0 0H1ZM4 4H5Z')
  expect(selectPresetGuideComponentPath('M0 0H1Z', [1])).toBeNull()
})
