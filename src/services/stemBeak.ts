import type { BoxConfig, ResolvedInkSource, StrokeDataV2, StrokeRenderStyle } from '../types'
import { createBrushTipPolygon, type BrushInkGroup, type BrushPoint } from './brushGeometry'
import { describeStrokeGeometry } from './strokeGrammar'

/**
 * 세로줄기 일괄 부리. 전역 스타일의 한 겹이라 획 데이터에 굽지 않는다 — 끄면 통째로 사라진다.
 *
 * 대상은 세로줄기 마디의 위 끝이 획의 끝이고 열려 있는 자리 전부다(홀자 · 닿자 · 받침, 귀속 · 자유 획 가리지 않음).
 * 모양과 열림만 보므로 줄기 이름표(`strokeGrammar.json`)는 읽지 않는다.
 * 화면(`SvgRenderer`)과 추출(`fontGenerator`)이 이 함수 하나를 같이 쓴다. 좌표는 글자 칸 0–1, 기울기는 그 뒤에 걸린다.
 */

/** 부리 모양. 고르면 폰트 전체의 부리가 한 번에 바뀐다. */
export type StemBeakShape = 'angled' | 'slab' | 'round' | 'bar' | 'flare'

export const STEM_BEAK_SHAPES: ReadonlyArray<{ id: StemBeakShape; label: string; note: string }> = [
  { id: 'angled', label: '각진 부리', note: '명조처럼 왼쪽 위로 뾰족하게' },
  { id: 'slab', label: '사각 부리', note: '왼쪽으로 네모나게' },
  { id: 'round', label: '원형 부리', note: '머리에 둥근 맺힘' },
  { id: 'bar', label: '양쪽 받침', note: '좌우로 네모난 머리' },
  { id: 'flare', label: '나팔 머리', note: '머리로 갈수록 양쪽으로 넓어짐' },
]

export interface StemBeakStyle {
  enabled: boolean
  shape: StemBeakShape
  /** 획 굵기의 배수. 0.5–2 */
  size: number
  /** 각진 부리의 윗변이 가로에서 기운 각(도). +면 왼쪽 끝이 올라간다. −60–60. 다른 모양은 안 쓴다. */
  angle: number
}

export const DEFAULT_STEM_BEAK: StemBeakStyle = { enabled: false, shape: 'angled', size: 1, angle: 25 }

export function normalizeStemBeak(value: unknown): StemBeakStyle {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  const number = (raw: unknown, min: number, max: number, fallback: number) => (
    typeof raw === 'number' && Number.isFinite(raw) ? Math.max(min, Math.min(max, raw)) : fallback
  )
  return {
    enabled: input.enabled === true,
    shape: STEM_BEAK_SHAPES.some(({ id }) => id === input.shape) ? input.shape as StemBeakShape : DEFAULT_STEM_BEAK.shape,
    size: number(input.size, 0.5, 2, DEFAULT_STEM_BEAK.size),
    angle: number(input.angle, -60, 60, DEFAULT_STEM_BEAK.angle),
  }
}

/** 한 획과 그 획이 놓인 상자. `group`이 같은 획끼리만 닿음을 본다(같은 자소의 같은 채널). */
export interface StemBeakSource {
  stroke: StrokeDataV2
  box: BoxConfig
  weightMultiplier: number
  group: string
}

/** 닿음을 같이 볼 묶음 이름: 같은 자소의 같은 채널. */
export function stemBeakGroupOf(source: ResolvedInkSource): string {
  return `${source.part}:${source.kind === 'stroke' ? source.channel : 'part-grid'}`
}

/** 부리가 줄기 왼쪽 밖으로 나가는 길이 = 크기 × 굵기 × 이 값. */
const REACH_RATIO = 0.6
/** 부리 아랫변이 줄기 왼쪽 면에 닿는 깊이 = 크기 × 굵기 × 이 값. */
const DEPTH_RATIO = 0.9

/**
 * 획마다 부리 면을 돌려준다. 순서는 `sources`와 같고, 부리가 없는 획은 빈 배열.
 * `renderStyle`이 납작 · 네모 붓촉이면 줄기 폭을 그 붓촉이 실제로 남기는 폭으로 잰다(굵기 그대로 쓰면 부리가 줄기보다 넓다).
 */
export function stemBeakInkGroups(sources: readonly StemBeakSource[], style: StemBeakStyle | undefined, renderStyle?: StrokeRenderStyle): BrushInkGroup[][] {
  if (!style?.enabled) return sources.map(() => [])
  return sources.map((source) => {
    const others = sources.filter((other) => other !== source && other.group === source.group).map(({ stroke }) => stroke)
    const { segments } = describeStrokeGeometry(source.stroke, others)
    return segments.flatMap((segment) => {
      if (segment.shape !== 'serojulgi' || !segment.head || segment.head.kind !== 'end' || !segment.head.open || !segment.tail) return []
      const contour = beakContour(source, segment.head, segment.tail, style, renderStyle)
      return contour ? [[contour]] : []
    })
  })
}

function toGlyph(point: { x: number; y: number }, box: BoxConfig): BrushPoint {
  return { x: box.x + point.x * box.width, y: box.y + point.y * box.height }
}

const ROUND_STEPS = 24

/** 줄기를 가로지르는 방향으로 잰 잉크 폭. 원형 붓촉과 붓촉이 아닌 방식은 굵기 그대로다. */
function stemWidthAcross(thickness: number, across: BrushPoint, renderStyle: StrokeRenderStyle | undefined): number {
  if (!renderStyle || renderStyle.mode !== 'brush' || renderStyle.brush.tip === 'round') return thickness
  const reach = createBrushTipPolygon(renderStyle.brush, thickness).map((corner) => corner.x * across.x + corner.y * across.y)
  return Math.max(...reach) - Math.min(...reach)
}

/**
 * 부리 면 하나. 줄기 머리에서 `u`는 왼쪽(+), `v`는 줄기를 따라 아래(+)인 좌표로 그린다.
 * 어느 모양이든 줄기 머리를 덮도록 닫아서 줄기 잉크와 틈 없이 합쳐진다.
 */
function beakContour(source: StemBeakSource, head: { x: number; y: number }, tail: { x: number; y: number }, style: StemBeakStyle, renderStyle: StrokeRenderStyle | undefined): BrushPoint[] | null {
  const top = toGlyph(head, source.box)
  const bottom = toGlyph(tail, source.box)
  const length = Math.hypot(bottom.x - top.x, bottom.y - top.y)
  const thickness = source.stroke.thickness * source.weightMultiplier
  if (length === 0 || thickness <= 0) return null

  // along: 줄기를 따라 아래로, left: 그 왼쪽(화면 기준).
  const along = { x: (bottom.x - top.x) / length, y: (bottom.y - top.y) / length }
  const left = { x: -along.y, y: along.x }
  const width = stemWidthAcross(thickness, left, renderStyle)
  const at = (u: number, v: number): BrushPoint => ({ x: top.x + left.x * u + along.x * v, y: top.y + left.y * u + along.y * v })

  const half = width / 2
  const reach = REACH_RATIO * style.size * width
  const depth = Math.min(DEPTH_RATIO * style.size * width, length)
  switch (style.shape) {
    case 'slab': {
      const slab = Math.min(depth * 0.6, length)
      return [at(-half, 0), at(half + reach, 0), at(half + reach, slab), at(half, slab), at(half, depth), at(-half, depth)]
    }
    case 'bar': {
      const slab = Math.min(depth * 0.6, length)
      return [at(-half - reach, 0), at(half + reach, 0), at(half + reach, slab), at(-half - reach, slab)]
    }
    case 'flare':
      return [at(-half - reach, 0), at(half + reach, 0), at(half, depth), at(-half, depth)]
    case 'round': {
      // 줄기 축에서 왼쪽으로 조금 치우친 원. 반지름이 줄기 반폭보다 커서 머리를 덮는다.
      const radius = half + reach * 0.5
      const centerU = reach * 0.5
      const centerV = radius * 0.35
      return Array.from({ length: ROUND_STEPS }, (_, step) => {
        const turn = step / ROUND_STEPS * Math.PI * 2
        return at(centerU + Math.cos(turn) * radius, centerV + Math.sin(turn) * radius)
      })
    }
    default: {
      // 명조식: 머리 오른쪽 위 모서리 → 왼쪽 밖 뾰족한 끝 → 줄기 왼쪽 면.
      const rise = (width + reach) * Math.tan(style.angle * Math.PI / 180)
      return [at(-half, 0), at(half + reach, -rise), at(half, depth), at(-half, depth)]
    }
  }
}
