import type { AlignmentReference, BoxConfig, GlyphBounds, JamoData, SmartGuide } from '../types'

export interface SmartGuideSnap {
  correctionX: number | null
  correctionY: number | null
  guides: SmartGuide[]
}

export function getStrokeBoundsInGlyph(
  jamo: JamoData,
  strokeId: string,
  box: BoxConfig
): GlyphBounds | null {
  const stroke = jamo.strokes?.find((item) => item.id === strokeId)
  if (!stroke || stroke.points.length === 0) return null
  const halfThickness = stroke.thickness / 2
  const xs = stroke.points.map((point) => box.x + point.x * box.width)
  const ys = stroke.points.map((point) => box.y + point.y * box.height)
  const minX = Math.min(...xs) - halfThickness
  const maxX = Math.max(...xs) + halfThickness
  const minY = Math.min(...ys) - halfThickness
  const maxY = Math.max(...ys) + halfThickness
  return {
    minX,
    centerX: (minX + maxX) / 2,
    maxX,
    minY,
    centerY: (minY + maxY) / 2,
    maxY,
  }
}

export function createAlignmentReference(
  jamo: JamoData | undefined,
  box: BoxConfig | undefined,
  label: string
): AlignmentReference | null {
  if (!jamo || !box || !jamo.strokes?.length) return null
  const bounds = jamo.strokes
    .map((stroke) => getStrokeBoundsInGlyph(jamo, stroke.id, box))
    .filter((value): value is GlyphBounds => value !== null)
  if (bounds.length === 0) return null
  const minX = Math.min(...bounds.map((value) => value.minX))
  const maxX = Math.max(...bounds.map((value) => value.maxX))
  const minY = Math.min(...bounds.map((value) => value.minY))
  const maxY = Math.max(...bounds.map((value) => value.maxY))
  return {
    label,
    bounds: {
      minX,
      centerX: (minX + maxX) / 2,
      maxX,
      minY,
      centerY: (minY + maxY) / 2,
      maxY,
    },
  }
}

export function findSmartGuideSnap(
  moving: GlyphBounds,
  references: AlignmentReference[],
  threshold: number
): SmartGuideSnap {
  const xKinds = [
    ['minX', '왼쪽'],
    ['centerX', '세로 중앙'],
    ['maxX', '오른쪽'],
  ] as const
  const yKinds = [
    ['minY', '위'],
    ['centerY', '가로 중앙'],
    ['maxY', '아래'],
  ] as const

  const closest = <K extends keyof GlyphBounds>(kinds: ReadonlyArray<readonly [K, string]>) => {
    let match: { correction: number; position: number; label: string } | null = null
    for (const reference of references) {
      for (const [key, kindLabel] of kinds) {
        const correction = reference.bounds[key] - moving[key]
        if (Math.abs(correction) > threshold) continue
        if (!match || Math.abs(correction) < Math.abs(match.correction)) {
          match = {
            correction,
            position: reference.bounds[key],
            label: `${reference.label} ${kindLabel} 맞춤`,
          }
        }
      }
    }
    return match
  }

  const xMatch = closest(xKinds)
  const yMatch = closest(yKinds)
  const guides: SmartGuide[] = []
  if (xMatch) guides.push({ axis: 'x', position: xMatch.position, label: xMatch.label })
  if (yMatch) guides.push({ axis: 'y', position: yMatch.position, label: yMatch.label })
  return {
    correctionX: xMatch?.correction ?? null,
    correctionY: yMatch?.correction ?? null,
    guides,
  }
}
