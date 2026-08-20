import type { BoxConfig, LayoutSchema, Part, PartOverride, StrokeScale } from '../types'

const EMPTY_OVERRIDE: PartOverride = { top: 0, bottom: 0, left: 0, right: 0 }

function updateParts(
  source: LayoutSchema,
  parts: Part[],
  update: (part: Part, current: PartOverride) => PartOverride,
): LayoutSchema {
  const schema = structuredClone(source)
  schema.userPartOverrides ??= {}
  for (const part of parts) {
    const current = schema.userPartOverrides[part] ?? EMPTY_OVERRIDE
    schema.userPartOverrides[part] = update(part, current)
  }
  return schema
}

/** 자모 컴포넌트 이동을 같은 레이아웃 패턴의 파트 프로필로 기록한다. */
export function translateLayoutParts(
  schema: LayoutSchema,
  parts: Part[],
  delta: { x: number; y: number },
): LayoutSchema {
  return updateParts(schema, parts, (_part, current) => ({
    top: current.top + delta.y,
    bottom: current.bottom - delta.y,
    left: current.left + delta.x,
    right: current.right - delta.x,
  }))
}

/** 자모 컴포넌트 크기 조절을 중심 기준의 레이아웃 파트 프로필로 기록한다. */
export function scaleLayoutParts(
  schema: LayoutSchema,
  parts: Part[],
  boxes: Partial<Record<Part, BoxConfig>>,
  scale: StrokeScale,
): LayoutSchema {
  return updateParts(schema, parts, (part, current) => {
    const box = boxes[part]
    if (!box) return current
    const horizontal = box.width * (scale.x - 1) / 2
    const vertical = box.height * (scale.y - 1) / 2
    return {
      top: current.top - vertical,
      bottom: current.bottom - vertical,
      left: current.left - horizontal,
      right: current.right - horizontal,
    }
  })
}
