import type { BoxConfig, JamoData, StrokeDataV2, StrokeLinecap } from '../types'
import { fitPenStroke, PEN_FIT_EPSILON, penClosesOnItself } from './penStrokeFit'
import type { PenPoint } from './penStrokeFit'
import { adoptStrokeRoles, fitStrokesInkToUnitBox, flattenCenterline, fitStrokesToPresetBounds, joinStrokesAtEnds, matchStrokeRoles, ROLE_MATCH_TAU } from './strokeRoleMatch'
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
  /**
   * 주면 판정 뒤 잉크(굵기 · 끝 모양 포함)가 자모 상자 0–1 안에 들도록 맞춘다(채우기가 켜졌을 때만).
   * `half`는 굵기 반을 상자 좌표로 옮긴 축별 값 — 상자 크기를 아는 쪽(편집기)이 정한다.
   */
  inkBox?: { half: { x: number; y: number }; linecap?: StrokeLinecap }
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
    const strokes = options.inkBox && options.fill !== false ? fitStrokesInkToUnitBox(adopted.strokes, options.inkBox.half, options.inkBox.linecap) : adopted.strokes
    byChannel[channel] = { strokes, state: adopted.state, missing: match.missing.map((index) => presets[index].id), drawn, match }
  }
  const states = Object.values(byChannel).map((result) => result.state)
  const state: JamoRecognition = states.length === 0 || states.every((item) => item === 'free') ? 'free' : states.every((item) => item === 'recognized') ? 'recognized' : 'partial'
  return { byChannel, state }
}

/** 펜으로 그었지만 역할을 못 받은 획의 id 머리. */
const PEN_FREE_PREFIX = 'pen-'

export interface PenStrokeOptions extends Pick<PenRecognizeOptions, 'tau' | 'epsilon'> {
  /** 예각 꺾임을 둥글게 돌린다 — 끝이 둥근 글씨일 때. */
  roundAcute?: boolean
  /**
   * 이번에 펜을 켠 뒤 그은 획인지. 그런 획은 새 획과 함께 다시 판정한다 — 기둥만 그었을 때의 판정이 곁줄기를 그은 뒤 바뀔 수 있다.
   * 안 주면 새 획만 판정한다. 펜을 켜기 전부터 있던 획은 역할도 자리도 건드리지 않는다.
   */
  drawn?: (stroke: StrokeDataV2) => boolean
}

export interface PenStrokeResult {
  jamo: JamoData
  /** 방금 그은 획이 받은 id(역할을 받았으면 프리셋 id, 아니면 `pen-…`). 앞 획에 이어졌으면 그 이어진 획의 id. */
  strokeId: string
}

/**
 * 닫으려던 획인지. 손으로 그은 ㅇ은 끝이 시작에 딱 안 닿거나 지나친다 — 두께 안으로 만나야만 닫힌 역할을 주면 너무 박하다(10-06 사용자).
 * ㄱ · ㄷ처럼 벌어진 획은 틈이 제 크기와 비슷해 여기 안 든다.
 */
function looksClosed(stroke: StrokeDataV2): boolean {
  // 크기는 곡선을 편 점으로 잰다 — 둥근 획은 앵커가 서넛뿐이라 앵커만 보면 작게 나온다.
  return stroke.closed || penClosesOnItself(flattenCenterline(stroke))
}

/**
 * 그은 획(`candidates`)을 빈 역할(`freeIndexes`)에 붙인다. 판정은 자모 전체를 프리셋 범위에 채운 좌표로, 승계(방향 · 닫기)는 프리셋을 그은 범위로 옮겨 그은 좌표로 한다.
 * 닫으려던 획은 닫힌 획으로 보고 견준다. 닫힌 역할과 짝이 되면 **열린 채 그대로** 역할만 붙인다 — 안 닫은 것도 그린 사람의 멋이다(10-06 사용자). 끝이 두께 안으로 만난 획만 닫는다.
 */
function judgePenRoles(kept: readonly StrokeDataV2[], candidates: readonly StrokeDataV2[], presets: readonly StrokeDataV2[], freeIndexes: readonly number[], jamoKey: string, tau: number) {
  const group = [...kept, ...candidates]
  const freePresets = freeIndexes.map((index) => presets[index])
  const filled = fitStrokesToPresetBounds(group, presets).slice(kept.length).map((stroke, index) => (looksClosed(candidates[index]) ? { ...stroke, closed: true } : stroke))
  const match = matchStrokeRoles(filled, freePresets, { tau })
  const placed = fitStrokesToPresetBounds(presets, group)
  const adopted = adoptStrokeRoles(candidates, freeIndexes.map((index) => placed[index]), match, { jamoKey, openAsClosed: (index) => looksClosed(candidates[index]) })
  return { adopted, score: match.pairs.reduce((sum, pair) => sum + pair.score, 0) }
}

const endGap = (a: StrokeDataV2, b: StrokeDataV2) => {
  const ends = (stroke: StrokeDataV2) => [stroke.points[0], stroke.points[stroke.points.length - 1]]
  return Math.min(...ends(a).flatMap((p) => ends(b).map((q) => Math.hypot(p.x - q.x, p.y - q.y))))
}

/**
 * 펜으로 그은 한 획을 자모에 더한다(플랜 2026-10-05, 10-06 결정). 그은 자리 그대로 둔다 — 칸에 채우지 않는다.
 * 늘 새 획이다. 프리셋 역할 중 **비어 있는 자리**(펜을 켜기 전부터 있던 획이 안 가진 자리)와 닮았으면 역할을 받고, 아니면 자유 획(`pen-…`)으로 남는다.
 * 닮았는지는 속으로만 자모 전체를 프리셋 범위에 채워 견준다 — 작게 · 치우쳐 그어도 모양이 맞으면 인식된다.
 * 방금 그은 획의 끝이 이번에 그은 다른 획의 끝에 닿으면(두께 안) 이은 쪽과 안 이은 쪽을 둘 다 판정해 자유 획이 적은 쪽을 고른다 — 나눠 그은 ㄱ은 이어지고, ㅂ의 밑 보는 기둥에 안 붙는다.
 */
export function addPenStroke(
  before: JamoData,
  channel: PenChannel,
  points: readonly PenPoint[],
  preset: Pick<JamoData, 'char' | 'strokes' | 'horizontalStrokes' | 'verticalStrokes'>,
  options: PenStrokeOptions = {},
): PenStrokeResult | null {
  const presets = preset[channel] ?? []
  const existing = before[channel] ?? []
  const thickness = presets[0]?.thickness ?? existing[0]?.thickness ?? PEN_DEFAULT_THICKNESS
  const fitted = fitPenStroke([...points], { epsilon: options.epsilon ?? PEN_FIT_EPSILON, thickness, id: `${PEN_FREE_PREFIX}new`, roundAcute: options.roundAcute })?.stroke
  if (!fitted) return null
  const presetIds = new Set(presets.map((stroke) => stroke.id))
  const earlier = existing.filter((stroke) => options.drawn?.(stroke))
  const kept = existing.filter((stroke) => !options.drawn?.(stroke))
  const holders = kept.filter((stroke) => presetIds.has(stroke.id))
  const others = kept.filter((stroke) => !presetIds.has(stroke.id))
  const heldIds = new Set(holders.map((stroke) => stroke.id))
  const freeIndexes = presets.map((_, index) => index).filter((index) => !heldIds.has(presets[index].id))
  // 새 획은 늘 후보의 마지막이다.
  const judge = (candidates: StrokeDataV2[]) => judgePenRoles(kept, candidates, presets, freeIndexes, preset.char, options.tau ?? ROLE_MATCH_TAU)
  const variants = [judge([...earlier, fitted])]
  const near = earlier
    .map((stroke, index) => ({ index, gap: stroke.closed || fitted.closed ? Infinity : endGap(stroke, fitted) }))
    .filter((item) => item.gap <= thickness)
    .sort((a, b) => a.gap - b.gap)[0]
  if (near) {
    const joined = joinStrokesAtEnds([earlier[near.index], fitted], thickness)
    if (joined.length === 1) variants.push(judge([...earlier.filter((_, index) => index !== near.index), joined[0]]))
  }
  const best = variants.reduce((pick, item) => (
    item.adopted.freeIds.length < pick.adopted.freeIds.length || (item.adopted.freeIds.length === pick.adopted.freeIds.length && item.score > pick.score) ? item : pick
  ))
  // 자유 획 id가 앞서 있던 획과 겹치지 않게 번호를 다시 매긴다.
  const taken = new Set(kept.map((stroke) => stroke.id))
  const renamed = new Map<string, string>()
  let n = 1
  for (const id of best.adopted.freeIds) {
    while (taken.has(`${PEN_FREE_PREFIX}${preset.char}-${n}`)) n++
    const next = `${PEN_FREE_PREFIX}${preset.char}-${n}`
    taken.add(next)
    renamed.set(id, next)
  }
  const strokes = best.adopted.strokes.map((stroke) => (renamed.has(stroke.id) ? { ...stroke, id: renamed.get(stroke.id)! } : stroke))
  const lastId = best.adopted.ids[best.adopted.ids.length - 1]
  // 역할 획은 프리셋 순서로(엔진이 순서로 짝 짓는 곳이 있다), 손으로 넣은 획, 자유 획 차례.
  const order = new Map(presets.map((stroke, index) => [stroke.id, index]))
  const roles = [...holders, ...strokes.filter((stroke) => presetIds.has(stroke.id))].sort((a, b) => order.get(a.id)! - order.get(b.id)!)
  const jamo = structuredClone(before)
  jamo[channel] = structuredClone([...roles, ...others, ...strokes.filter((stroke) => !presetIds.has(stroke.id))])
  return { jamo, strokeId: renamed.get(lastId) ?? lastId }
}

/**
 * `비우기`: 자모의 획을 지운다. `drawn`을 주면(펜이 켜진 동안) 이번에 그은 획은 남기고 전부터 있던 획만 지운다.
 * 역할 자리가 다 비므로 남은 획을 처음부터 다시 판정한다 — 옅은 획을 따라 그은 뒤 비우면 그은 획이 그 역할을 받는다. 좌표는 그대로다.
 */
export function clearPenJamo(
  before: JamoData,
  channel: PenChannel,
  preset: Pick<JamoData, 'char' | 'strokes' | 'horizontalStrokes' | 'verticalStrokes'>,
  options: PenStrokeOptions = {},
): JamoData {
  const presets = preset[channel] ?? []
  const left = (before[channel] ?? []).filter((stroke) => options.drawn?.(stroke))
  const jamo = structuredClone(before)
  if (left.length === 0) { jamo[channel] = []; return jamo }
  const { adopted } = judgePenRoles([], left, presets, presets.map((_, index) => index), preset.char, options.tau ?? ROLE_MATCH_TAU)
  jamo[channel] = structuredClone(adopted.strokes)
  return jamo
}

/** 자모가 프리셋 역할을 얼마나 갖췄는지. 역할이 다 있고 자유 획이 없으면 인식됨, 역할이 하나도 없으면 자유. */
export function penJamoState(jamo: Pick<JamoData, PenChannel>, channel: PenChannel, preset: Pick<JamoData, PenChannel>): { state: JamoRecognition; missing: string[] } {
  const presets = preset[channel] ?? []
  const strokes = jamo[channel] ?? []
  const ids = new Set(strokes.map((stroke) => stroke.id))
  const missing = presets.filter((stroke) => !ids.has(stroke.id)).map((stroke) => stroke.id)
  const free = strokes.some((stroke) => stroke.id.startsWith(PEN_FREE_PREFIX))
  const state: JamoRecognition = missing.length === presets.length ? 'free' : missing.length === 0 && !free ? 'recognized' : 'partial'
  return { state, missing }
}

/**
 * `맞춤`: 자모의 획 묶음을 기본 프리셋이 놓이는 자리와 똑같이 채운다(중심선 범위를 프리셋의 중심선 범위에). 획 사이 비율은 지킨다.
 * 그러면 굵기는 칸(윤곽 기준) 안에 들고, 획이 시작하고 끝나는 자리는 프리셋처럼 테두리에 닿는다 — 끝 모양은 세지 않는다(10-06 사용자 결정).
 * 맞춘 자소와 손 안 댄 기본 자소의 크기가 같고, 기본 자소는 맞춰도 그대로다.
 */
export function fitJamoToCell(jamo: JamoData, channel: PenChannel, preset: Pick<JamoData, PenChannel>): JamoData {
  const strokes = jamo[channel] ?? []
  if (strokes.length === 0) return jamo
  const next = structuredClone(jamo)
  next[channel] = fitStrokesToPresetBounds(strokes, preset[channel] ?? [])
  return next
}

/** 두 자모의 그 채널 획이 같은 자리인지(`맞춤`을 눌러도 달라질 게 없는지). */
export function sameStrokePlaces(a: Pick<JamoData, PenChannel>, b: Pick<JamoData, PenChannel>, channel: PenChannel, tolerance = 1e-3): boolean {
  const left = a[channel] ?? []
  const right = b[channel] ?? []
  if (left.length !== right.length) return false
  return left.every((stroke, index) => {
    const other = right[index]
    return stroke.points.length === other.points.length
      && stroke.points.every((point, at) => Math.abs(point.x - other.points[at].x) <= tolerance && Math.abs(point.y - other.points[at].y) <= tolerance)
  })
}
