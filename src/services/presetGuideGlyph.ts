import type { PresetCompositionTarget } from '../../src-next/presetCompositionInput'

export interface GuideGlyphRect {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export function selectPresetGuideComponentPath(path: string, contourIds: readonly number[]): string | null {
  const contours = path.match(/[Mm][^Mm]*/gu) ?? []
  if (contourIds.length === 0 || contourIds.some((id) => !Number.isInteger(id) || id < 0 || id >= contours.length)) return null
  return contourIds.map((id) => contours[id]).join('')
}

function sourceAnchor(element: PresetCompositionTarget['medial']['source']['elements'][number]): { x: number; y: number } | null {
  if (element.face.status !== 'candidate') return null
  if (element.face.anchor) return element.face.anchor
  const anchor = element.face.evidence?.anchor
  if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor)) return null
  const value = anchor as Record<string, unknown>
  return typeof value.x === 'number' && typeof value.y === 'number' ? { x: value.x, y: value.y } : null
}

/** 정규화된 면 원본. 두께 75 unit, 직각형은 측정값이 아닌 생성 스타일이다. */
export function generatePresetGuideGlyph(target: PresetCompositionTarget): {
  initialSourceCharacter: string
  initialContourIds: readonly number[]
  rects: GuideGlyphRect[]
  inferred: string[]
} | null {
  if (target.finalJamo !== null) return null
  const area = target.initial.source.selectionArea
  const group = target.initial.source.componentGroup
  if (area.status !== 'candidate' || group.status !== 'candidate') return null
  const thickness = 75
  const rects: GuideGlyphRect[] = []
  const inferred = ['홀자 획 두께 75 unit: 생성 스타일']
  for (const element of target.medial.source.elements) {
    if (element.face.status !== 'candidate' || element.visibleSpans.status !== 'candidate') return null
    const spans = element.componentSpans?.length ? element.componentSpans : element.visibleSpans.value
    if (!spans.length) return null
    let from = Math.min(...spans.map((span) => span.from))
    let to = Math.max(...spans.map((span) => span.to))
    let face = element.face.value
    if (element.face.referenceMode === 'start-side-local-tangent') {
      const anchor = sourceAnchor(element)
      const pillar = target.medial.source.elements.find((item) => item.elementId === 'outerPillar')
      if (!anchor || pillar?.face.status !== 'candidate' || element.orientation !== 'horizontal') return null
      from = anchor.x
      face = anchor.y
      to = pillar.face.value - thickness - 25
      inferred.push('아래 가로획: 시작 접선 고정, 미측정 끝은 오른쪽 기둥과 25 unit 간격으로 생성')
    }
    if (!Number.isFinite(to - from) || to <= from) return null
    const vertical = element.orientation === 'vertical'
    rects.push({
      id: `JU:${element.elementId}`,
      x: vertical ? face - (element.faceSide === 'right' ? thickness : 0) : from,
      y: vertical ? from : face - (element.faceSide === 'bottom' ? thickness : 0),
      width: vertical ? thickness : to - from,
      height: vertical ? to - from : thickness,
    })
  }
  return {
    initialSourceCharacter: target.initial.source.character,
    initialContourIds: group.value.contourIds,
    rects: rects.map((rect) => ({ ...rect, x: rect.x / 1000, y: rect.y / 1000, width: rect.width / 1000, height: rect.height / 1000 })),
    inferred,
  }
}
