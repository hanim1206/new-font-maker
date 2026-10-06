import baseJamos from '../src/data/baseJamos.json'
import { brushInkGroupsToSvgPaths, flattenStrokeCenterlineWithAnchors } from '../src/services/brushGeometry'
import { centerlineInkGroups } from '../src/services/finalGlyphInk'
import { inflateFlatCenterline } from '../src/services/flatStrokeSelfOverlap'
import * as polygonBoolean from '../src/services/polygonBoolean'
import type { MultiPolygon, Ring } from '../src/services/polygonBoolean'
import { DEFAULT_MITER_LIMIT } from '../src/services/strokeJoin'
import type { BoxConfig, JamoData, StrokeDataV2, StrokeLinecap, StrokeLinejoin, StrokeRenderStyle } from '../src/types'
import { pointsToSvgD } from '../src/utils/pathUtils'

/**
 * 선 그리기(브라우저 SVG stroke)와 면 그리기(`centerlineInkGroups` — 레이아웃 · 추출과 같은 길)를 같은 획으로 견주는 견본과 재는 함수.
 * 실험실 그림표(`InkParityLabPage`)와 단위 테스트가 같이 쓴다. 플랜 `2026-10-06_획-편집-캔버스-면-그리기`.
 */

export const INK_CAPS: readonly StrokeLinecap[] = ['butt', 'round', 'square']
export const INK_JOINS: readonly StrokeLinejoin[] = ['miter', 'round', 'bevel']
/** 견본을 놓는 칸(글자 칸 0~1 안). */
export const INK_SAMPLE_BOX: BoxConfig = { x: 0.15, y: 0.15, width: 0.7, height: 0.7 }
/** 기본 스타일: 둥근 붓촉, 둥글기 · 대비 없음. 기본 폰트의 획 편집 캔버스가 선 그리기로 가는 바로 그 스타일. */
export const INK_DEFAULT_STYLE: StrokeRenderStyle = { mode: 'brush', brush: { tip: 'round', aspectRatio: 1, angle: 0 } }

export interface InkSample { name: string; stroke: StrokeDataV2 }

type Point = { x: number; y: number }
const arc = (cx: number, cy: number, rx: number, ry: number, from: number, to: number, steps: number): Point[] =>
  Array.from({ length: steps + 1 }, (_, index) => { const angle = from + (to - from) * index / steps; return { x: cx + rx * Math.cos(angle), y: cy + ry * Math.sin(angle) } })
const sample = (name: string, points: StrokeDataV2['points'], closed = false): InkSample => ({ name, stroke: { id: name, points, closed, thickness: 0.07 } })

/** 펜으로 흘려 그으면 나오는 모양들. 면 그리기가 전부 받아야 한다(실패 0). */
export const PEN_INK_SAMPLES: readonly InkSample[] = [
  sample('고리', [...Array.from({ length: 13 }, (_, index) => ({ x: 0.8 - 0.045 * index, y: 0.1 + 0.055 * index })), ...arc(0.2, 0.8, 0.2, 0.12, -0.6, Math.PI * 2 - 1.2, 40), { x: 0.6, y: 0.86 }, { x: 0.95, y: 0.8 }]),
  sample('8자(고리 둘)', [...arc(0.3, 0.5, 0.2, 0.2, 0, Math.PI * 2, 40), ...arc(0.7, 0.5, 0.2, 0.2, Math.PI, -Math.PI, 40)]),
  sample('급한 굽이(반지름 < 반폭)', [{ x: 0.9, y: 0.3 }, ...arc(0.4, 0.5, 0.02, 0.02, -Math.PI / 2, -Math.PI * 1.5, 24), { x: 0.9, y: 0.7 }]),
  sample('좁은 U자(둥글게 접힘)', [{ x: 0.9, y: 0.48 }, ...arc(0.4, 0.5, 0.02, 0.02, -Math.PI / 2, -Math.PI * 1.5, 24), { x: 0.9, y: 0.52 }]),
  sample('좁은 U자(각지게 접힘)', [{ x: 0.9, y: 0.48 }, { x: 0.4, y: 0.48 }, { x: 0.4, y: 0.52 }, { x: 0.9, y: 0.52 }]),
  sample('되돌아 꺾임(머리핀)', [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }, { x: 0.15, y: 0.56 }]),
  sample('제자리 되돌아옴', [{ x: 0.1, y: 0.5 }, { x: 0.9, y: 0.5 }, { x: 0.3, y: 0.5 }]),
  sample('갈지자', [{ x: 0.1, y: 0.2 }, { x: 0.9, y: 0.25 }, { x: 0.15, y: 0.4 }, { x: 0.9, y: 0.5 }, { x: 0.1, y: 0.7 }, { x: 0.9, y: 0.85 }]),
  sample('소용돌이', Array.from({ length: 121 }, (_, index) => { const angle = index * 0.16, radius = 0.42 - index * 0.0031; return { x: 0.5 + radius * Math.cos(angle), y: 0.5 + radius * Math.sin(angle) } })),
  sample('6자(끝이 몸에 닿음)', [{ x: 0.75, y: 0.1 }, ...arc(0.5, 0.65, 0.28, 0.25, Math.PI * 1.25, Math.PI * 1.25 - Math.PI * 1.95, 50)]),
  sample('아주 짧은 획', [{ x: 0.5, y: 0.5 }, { x: 0.505, y: 0.502 }]),
  sample('작은 닫힌 원(반지름 < 반폭)', arc(0.5, 0.5, 0.03, 0.03, 0, Math.PI * 2, 24).slice(0, -1), true),
  sample('곡선 핸들 고리', [{ x: 0.8, y: 0.1, handleOut: { x: 0.8, y: 0.9 } }, { x: 0.15, y: 0.8, handleIn: { x: -0.2, y: 1.1 }, handleOut: { x: 0.5, y: 0.5 } }, { x: 0.95, y: 0.85, handleIn: { x: 0.6, y: 1.0 } }]),
]

function strokesIn(node: unknown, out: StrokeDataV2[]): StrokeDataV2[] {
  if (Array.isArray(node)) { for (const item of node) strokesIn(item, out); return out }
  if (node && typeof node === 'object') {
    const record = node as Record<string, unknown>
    if (Array.isArray(record.points) && typeof record.thickness === 'number') out.push(record as unknown as StrokeDataV2)
    else for (const value of Object.values(record)) strokesIn(value, out)
  }
  return out
}

const PRESET = baseJamos as unknown as { choseong: Record<string, JamoData>; jungseong: Record<string, JamoData>; jongseong: Record<string, JamoData> }

/** 기본 프리셋(`baseJamos`)의 모든 획. 여기서는 두 그리기가 눈에 안 띄게 같아야 한다. */
export const PRESET_INK_SAMPLES: readonly InkSample[] = (['choseong', 'jungseong', 'jongseong'] as const).flatMap((type) =>
  Object.entries(PRESET[type]).flatMap(([char, jamo]) => strokesIn(jamo, []).map((stroke) => ({ name: `${type === 'choseong' ? '첫' : type === 'jungseong' ? '홀' : '받침'} ${char} · ${stroke.id}`, stroke }))))

/** 그림표에 그릴 대표 자모(첫닿자). 획이 여럿이면 획마다 한 줄. */
export const PRESET_INK_FEATURED: readonly InkSample[] = ['ㄱ', 'ㄹ', 'ㅇ', 'ㅎ', 'ㅍ'].flatMap((char) =>
  (PRESET.choseong[char]?.strokes ?? []).map((stroke) => ({ name: `${char} · ${stroke.id}`, stroke: stroke as StrokeDataV2 })))

export interface InkCell {
  /** 면 그리기가 면을 만들었는지. */
  ok: boolean
  message?: string
  /** 선 그리기: 중심선 경로와 선 굵기(뷰박스 `viewBoxSize` 기준). */
  nativeD: string
  nativeWidth: number
  /** 면 그리기: evenodd로 칠하는 경로들. */
  filledPaths: string[]
  /** 두 그림의 다른 면적 / 선 그리기 면적. 견줄 수 없으면 null. */
  diffRatio: number | null
}

type Groups = readonly (readonly Point[])[][]
const toMulti = (groups: Groups): MultiPolygon[] => groups.map((group) => [group.map((ring) => ring.map((point) => [point.x, point.y] as [number, number]) as Ring)])
const ringArea = (ring: Ring): number => { let sum = 0; for (let index = 0; index < ring.length; index += 1) { const a = ring[index], b = ring[(index + 1) % ring.length]; sum += a[0] * b[1] - b[0] * a[1] } return Math.abs(sum) / 2 }
const areaOf = (multi: MultiPolygon): number => multi.reduce((sum, polygon) => sum + ringArea(polygon[0]) - polygon.slice(1).reduce((holes, ring) => holes + ringArea(ring), 0), 0)
const unionOf = (groups: Groups): MultiPolygon => { const parts = toMulti(groups); return parts.length ? polygonBoolean.union(parts[0], ...parts.slice(1)) : [] }

/**
 * 획 하나를 두 길로 만들어 견준다.
 * 선 그리기의 면은 브라우저 대신 Clipper2 오프셋(같은 끝 · 꺾임 · 뾰족 한계)으로 계산한다 — 화면 픽셀이 아니라 같은 뜻의 기하다.
 */
export function measureInkCell(stroke: StrokeDataV2, cap: StrokeLinecap, join: StrokeLinejoin, style: StrokeRenderStyle = INK_DEFAULT_STYLE, box: BoxConfig = INK_SAMPLE_BOX, viewBoxSize = 100): InkCell {
  const nativeD = pointsToSvgD(stroke.points, stroke.closed, box, viewBoxSize) ?? ''
  const nativeWidth = stroke.thickness * viewBoxSize
  const made = centerlineInkGroups({ id: stroke.id, stroke, box, weightMultiplier: 1, effectiveLinecap: cap, effectiveLinejoin: join }, style)
  if (!made.ok) return { ok: false, message: made.message, nativeD, nativeWidth, filledPaths: [], diffRatio: null }
  const filledPaths = brushInkGroupsToSvgPaths(made.groups, viewBoxSize)
  let diffRatio: number | null = null
  let message: string | undefined
  let ok = made.groups.length > 0
  try {
    const filled = unionOf(made.groups)
    const reference = unionOf(inflateFlatCenterline(flattenStrokeCenterlineWithAnchors(stroke, box).points, stroke.closed, Math.max(stroke.thickness, 0.001), cap, join, false, DEFAULT_MITER_LIMIT))
    const referenceArea = areaOf(reference)
    if (referenceArea > 0) diffRatio = areaOf(polygonBoolean.xor(filled, reference)) / referenceArea
  } catch (error) {
    // 면 묶음이 합쳐지지 않으면 최종 잉크(레이아웃 · 추출)도 이 획을 못 그린다.
    ok = false
    message = error instanceof Error ? error.message : String(error)
  }
  return { ok, message, nativeD, nativeWidth, filledPaths, diffRatio }
}
