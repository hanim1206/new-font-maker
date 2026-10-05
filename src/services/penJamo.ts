import type { BoxConfig, JamoData, StrokeDataV2 } from '../types'
import { fitPenStroke, PEN_FIT_EPSILON } from './penStrokeFit'
import type { PenPoint } from './penStrokeFit'
import { adoptStrokeRoles, fitStrokesToPresetBounds, joinStrokesAtEnds, matchStrokeRoles, ROLE_MATCH_TAU } from './strokeRoleMatch'
import type { JamoRecognition, RoleMatch } from './strokeRoleMatch'

/**
 * 편집기 펜 도구의 순수 부분(플랜 2026-10-05 고스트 따라 긋기, 2덩이).
 * 화면에서 그은 점을 자모 상자의 0–1로 옮기고, 맞춤 → 이어 붙이기 → 꽉 채우기 → 역할 판정을 거쳐 자모에 끼운다.
 * 실험실(`PenLabPage`)도 같은 `recognizePenJamo`를 부른다.
 */

export type PenChannel = 'strokes' | 'horizontalStrokes' | 'verticalStrokes'

/** 프리셋 첫 획에 두께가 없을 때. */
export const PEN_DEFAULT_THICKNESS = 0.07

/**
 * 그은 점(viewBox 좌표, 0–`viewBoxSize`) → 자모 상자 안 0–1. 상자 밖으로 나간 점도 잘라 내지 않고 0–1 밖 값 그대로 둔다.
 * 편집기 캔버스는 글자 칸 밖 여백까지 보이므로 칸 밖에서 시작해도 점은 살아 있다.
 */
export function viewBoxToJamoBox(points: readonly PenPoint[], box: BoxConfig, viewBoxSize = 100): PenPoint[] {
  return points.map((point) => ({
    x: (point.x / viewBoxSize - box.x) / box.width,
    y: (point.y / viewBoxSize - box.y) / box.height,
  }))
}

/**
 * 상자 하나에 통째로 놓이는 자모의 프리셋 채널. 기본 획이 있으면 그것, 비었으면 세로부 · 가로부 차례(`wholeJamoStrokes`와 같다).
 * ㅒ · ㅖ는 획을 `verticalStrokes`에만 두므로 거기로 간다.
 */
export function presetChannelOf(jamo: Pick<JamoData, 'strokes' | 'horizontalStrokes' | 'verticalStrokes'>): PenChannel {
  if (jamo.strokes && jamo.strokes.length > 0) return 'strokes'
  if (jamo.verticalStrokes && jamo.verticalStrokes.length > 0) return 'verticalStrokes'
  if (jamo.horizontalStrokes && jamo.horizontalStrokes.length > 0) return 'horizontalStrokes'
  return 'strokes'
}

export interface PenRecognizeOptions {
  /** 역할 문턱. */
  tau?: number
  /** 맞춤 허용오차. */
  epsilon?: number
  /** 그린 묶음을 프리셋 범위에 꽉 채운다(기본 켬). */
  fill?: boolean
  /** 끝점이 두께 안인 연달아 그은 획을 한 획으로 잇는다(기본 켬). */
  join?: boolean
}

export interface PenChannelResult {
  /** 판정을 거친 획. 프리셋 순서로 승계한 획 뒤에 자유 획이 붙는다. */
  strokes: StrokeDataV2[]
  state: JamoRecognition
  /** 안 그린 프리셋 획 id. */
  missing: string[]
  /** 맞춤 · 잇기 · 채우기까지 거친 그린 획(판정 전). 실험실 표가 문턱 후보별 짝을 낼 때 쓴다. */
  drawn: StrokeDataV2[]
  match: RoleMatch
}

/** 채널마다 그은 점 묶음 → 맞춤 → 잇기 → 채우기 → 판정. 채널이 둘 이상이면 전체 상태는 가장 나쁜 쪽에 맞춘다. */
export function recognizePenJamo(
  raw: Partial<Record<PenChannel, PenPoint[][]>>,
  preset: Pick<JamoData, 'char' | 'strokes' | 'horizontalStrokes' | 'verticalStrokes'>,
  options: PenRecognizeOptions = {},
): { byChannel: Partial<Record<PenChannel, PenChannelResult>>; state: JamoRecognition } {
  const tau = options.tau ?? ROLE_MATCH_TAU
  const epsilon = options.epsilon ?? PEN_FIT_EPSILON
  const byChannel: Partial<Record<PenChannel, PenChannelResult>> = {}
  for (const channel of Object.keys(raw) as PenChannel[]) {
    const presets = preset[channel] ?? []
    const thickness = presets[0]?.thickness ?? PEN_DEFAULT_THICKNESS
    const fitted = (raw[channel] ?? [])
      .map((points, index) => fitPenStroke(points, { epsilon, thickness, id: `pen-${index}` })?.stroke ?? null)
      .filter((stroke): stroke is StrokeDataV2 => stroke !== null)
    const joined = options.join === false ? fitted : joinStrokesAtEnds(fitted, thickness)
    const drawn = options.fill === false ? joined : fitStrokesToPresetBounds(joined, presets)
    const match = matchStrokeRoles(drawn, presets, { tau })
    const adopted = adoptStrokeRoles(drawn, presets, match, { jamoKey: preset.char })
    byChannel[channel] = { strokes: adopted.strokes, state: adopted.state, missing: match.missing.map((index) => presets[index].id), drawn, match }
  }
  const states = Object.values(byChannel).map((result) => result.state)
  const state: JamoRecognition = states.length === 0 || states.every((item) => item === 'free') ? 'free' : states.every((item) => item === 'recognized') ? 'recognized' : 'partial'
  return { byChannel, state }
}

/**
 * 그린 획으로 채널을 통째 바꾼 자모. 그린 채널만 바꾼다(없으면 그대로).
 * 사용자가 쓴 조건부 변형(`overrides`)은 옛 획 기준이라 비운다 — 문맥 계열 변형(`contextStrokes`)도 같다.
 * 잉크 안전 보정은 저장 길(`pastGapLimit`)이 지운다.
 */
export function applyPenToJamo(before: JamoData, drawn: Partial<Record<PenChannel, StrokeDataV2[]>>): JamoData {
  const after = structuredClone(before)
  for (const channel of Object.keys(drawn) as PenChannel[]) {
    const strokes = drawn[channel]
    if (strokes && strokes.length > 0) after[channel] = structuredClone(strokes)
  }
  delete after.overrides
  delete after.contextStrokes
  return after
}

/** 펜으로 들어갈 때 사라지는 것의 수. 조건부 변형 + 문맥 계열 변형 + 문맥 잉크 보정 하나. */
export function penResetCount(jamo: Pick<JamoData, 'overrides' | 'contextStrokes' | 'contextualInkSafety'> | undefined): number {
  if (!jamo) return 0
  return (jamo.overrides?.length ?? 0) + Object.keys(jamo.contextStrokes ?? {}).length + (jamo.contextualInkSafety ? 1 : 0)
}
