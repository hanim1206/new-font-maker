import { JUNGSEONG_MAP } from '../data/Hangul'
import type { BoxConfig, JamoData, Part, StemRailTarget, StrokeDataV2 } from '../types'
import type { MedialFitResult } from './notoMedialMasterFit'

/**
 * 홀자 줄기 끝점 = 보선. 이름 있는 줄기는 세로 끝점과 높이를 보선에서 받고, 그 사이 모양만 획(줄기 마스터)에서 받는다.
 * 칸 해석(`resolveContextBoxes`)이 홀자 칸에 줄기별 목표를 칸 안 비율로 실어 보내고(`stemRailTargets`),
 * 렌더러와 편집기 겨냥이 같은 칸을 받아 저장 획의 끝점을 거기로 옮긴다(`stemEndsFor` → `placeStemStroke`).
 * 칸 안 비율이라 네모꼴 변환처럼 칸을 통째로 옮기는 선형 변환을 지나도 그대로 맞는다.
 *
 * - 바깥 변(칸 위 · 아래)에 매인 끝은 목표를 안 싣는다. 칸이 그 변을 따라가니 지금처럼 칸이 끝을 끈다.
 * - 짧은기둥이 보에 붙은 끝은 모델이 어느 보선에 맸든 늘 보 가운데를 따른다(D0 결정).
 * - 이번 범위는 세로만. 가로 자리는 저장 좌표 그대로다.
 *
 * 플랜: docs/plans/2026-09-29_홀자-줄기-끝점-보선.md
 */

type MedialPart = Extract<Part, 'JU' | 'JU_H' | 'JU_V'>

/** 획 id → (칸, 엔진 역할). 홀자 21자의 이름 있는 줄기 전부. D0 대응표. */
export const MEDIAL_STEM_ROLES: Readonly<Record<string, Readonly<Record<string, readonly [MedialPart, string]>>>> = {
  ㅏ: { 'ㅏ-1': ['JU', 'outerPillar'], 'ㅏ-2': ['JU', 'primaryBeam'] },
  ㅐ: { 'ㅐ-1': ['JU', 'innerPillar'], 'ㅐ-2': ['JU', 'primaryBeam'], 'ㅐ-3': ['JU', 'outerPillar'] },
  ㅑ: { 'ㅑ-1': ['JU', 'outerPillar'], 'ㅑ-2': ['JU', 'upperBeam'], 'ㅑ-3': ['JU', 'lowerBeam'] },
  ㅒ: { 'ㅒ-1': ['JU', 'innerPillar'], 'ㅒ-2': ['JU', 'upperBeam'], 'ㅒ-3': ['JU', 'lowerBeam'], 'ㅒ-4': ['JU', 'outerPillar'] },
  ㅓ: { 'ㅓ-1': ['JU', 'outerPillar'], 'ㅓ-2': ['JU', 'primaryBeam'] },
  ㅔ: { 'ㅔ-1': ['JU', 'innerPillar'], 'ㅔ-2': ['JU', 'primaryBeam'], 'ㅔ-3': ['JU', 'outerPillar'] },
  ㅕ: { 'ㅕ-1': ['JU', 'outerPillar'], 'ㅕ-2': ['JU', 'upperBeam'], 'ㅕ-3': ['JU', 'lowerBeam'] },
  ㅖ: { 'ㅖ-1': ['JU', 'innerPillar'], 'ㅖ-2': ['JU', 'upperBeam'], 'ㅖ-3': ['JU', 'lowerBeam'], 'ㅖ-4': ['JU', 'outerPillar'] },
  ㅗ: { 'ㅗ-1': ['JU', 'baseStem'], 'ㅗ-2': ['JU', 'primaryBeam'] },
  ㅘ: { 'ㅘ-1': ['JU_H', 'baseStem'], 'ㅘ-2': ['JU_H', 'lowerBeam'], 'ㅘ-3': ['JU_V', 'outerPillar'], 'ㅘ-4': ['JU_V', 'upperBeam'] },
  ㅙ: { 'ㅙ-1': ['JU_H', 'baseStem'], 'ㅙ-2': ['JU_H', 'lowerBeam'], 'ㅙ-3': ['JU_V', 'innerPillar'], 'ㅙ-4': ['JU_V', 'upperBeam'], 'ㅙ-5': ['JU_V', 'outerPillar'] },
  ㅚ: { 'ㅚ-1': ['JU_H', 'baseStem'], 'ㅚ-2': ['JU_H', 'primaryBeam'], 'ㅚ-3': ['JU_V', 'outerPillar'] },
  ㅛ: { 'ㅛ-1': ['JU', 'leftStem'], 'ㅛ-2': ['JU', 'rightStem'], 'ㅛ-3': ['JU', 'primaryBeam'] },
  ㅜ: { 'ㅜ-1': ['JU', 'primaryBeam'], 'ㅜ-2': ['JU', 'baseStem'] },
  ㅝ: { 'ㅝ-1': ['JU_H', 'upperBeam'], 'ㅝ-2': ['JU_H', 'baseStem'], 'ㅝ-3': ['JU_V', 'outerPillar'], 'ㅝ-4': ['JU_V', 'lowerBeam'] },
  ㅞ: { 'ㅞ-1': ['JU_H', 'upperBeam'], 'ㅞ-2': ['JU_H', 'baseStem'], 'ㅞ-3': ['JU_V', 'innerPillar'], 'ㅞ-4': ['JU_V', 'lowerBeam'], 'ㅞ-5': ['JU_V', 'outerPillar'] },
  ㅟ: { 'ㅟ-1': ['JU_H', 'primaryBeam'], 'ㅟ-2': ['JU_H', 'baseStem'], 'ㅟ-3': ['JU_V', 'outerPillar'] },
  ㅠ: { 'ㅠ-1': ['JU', 'primaryBeam'], 'ㅠ-2': ['JU', 'leftStem'], 'ㅠ-3': ['JU', 'rightStem'] },
  ㅡ: { 'ㅡ-1': ['JU', 'primaryBeam'] },
  ㅢ: { 'ㅢ-1': ['JU_H', 'primaryBeam'], 'ㅢ-2': ['JU_V', 'outerPillar'] },
  ㅣ: { 'ㅣ-1': ['JU', 'outerPillar'] },
}

/** 보에 한 끝이 붙는 짧은기둥 역할. */
const SHORT_STEMS: ReadonlySet<string> = new Set(['baseStem', 'leftStem', 'rightStem'])
/** 칸 변 자체인 세로 보선. 여기 매인 끝은 칸이 끈다. */
const OUTER_Y: ReadonlySet<string> = new Set(['outer-top', 'outer-bottom'])
/** 칸 높이가 이보다 얇으면(ㅡ · ㅢ 가로부) 칸 안 비율로 높이를 못 적는다. 칸이 곧 줄기 자리다. */
const THIN_BOX = 1e-3
const EPSILON = 1e-9

/** 이 홀자 칸에 실을 줄기별 세로 목표(칸 안 비율). 목표가 하나도 없으면 빈 표. */
export function stemRailTargets(medialJamo: string, part: Part, fit: Pick<MedialFitResult, 'railsEm' | 'bindings'>, box: BoxConfig): Record<string, StemRailTarget> {
  const roles = MEDIAL_STEM_ROLES[medialJamo]
  if (!roles || box.height < THIN_BOX) return {}
  const local = (railKey: string) => OUTER_Y.has(railKey) ? undefined : (fit.railsEm[railKey] - box.y) / box.height
  const beams = fit.bindings.filter((binding) => binding.orientation === 'horizontal')
  const targets: Record<string, StemRailTarget> = {}
  for (const [strokeId, [strokePart, role]] of Object.entries(roles)) {
    if (strokePart !== part) continue
    const binding = fit.bindings.find((item) => item.roleId === role)
    if (!binding) continue
    const target: StemRailTarget = {}
    if (binding.orientation === 'horizontal') {
      target.center = local(binding.centerRail)
    } else {
      target.top = local(binding.fromRail)
      target.bottom = local(binding.toRail)
      // 짧은기둥의 붙은 끝: 보 가운데. 모델 rail은 문맥마다 칸 위 변 · 안쪽 아래 등으로 흔들린다.
      if (SHORT_STEMS.has(role) && beams.length === 1) {
        const beamY = fit.railsEm[beams[0].centerRail]
        const topGap = Math.abs(fit.railsEm[binding.fromRail] - beamY)
        const bottomGap = Math.abs(fit.railsEm[binding.toRail] - beamY)
        const joined = local(beams[0].centerRail)
        if (topGap <= bottomGap) { target.top = joined; target.joined = 'top' }
        else { target.bottom = joined; target.joined = 'bottom' }
      }
    }
    const entries = Object.entries(target).filter(([, value]) => typeof value === 'string' || (value !== undefined && Number.isFinite(value)))
    if (entries.length) targets[strokeId] = Object.fromEntries(entries) as StemRailTarget
  }
  return targets
}

function baseStrokeOf(char: string, strokeId: string): StrokeDataV2 | null {
  const base = JUNGSEONG_MAP[char]
  if (!base) return null
  return [...(base.strokes ?? []), ...(base.horizontalStrokes ?? []), ...(base.verticalStrokes ?? [])].find((stroke) => stroke.id === strokeId) ?? null
}

type Vec = { x: number; y: number }

/**
 * 저장 획의 두 끝점을 칸에 실린 목표로 옮긴 자리(칸 안 비율). 목표가 없거나 안 움직이면 null.
 * 저장 획이 기본 획에서 옮겨진 만큼은 목표 위에 얹는다 — 획 편집으로 고친 폰트가 그대로 남는다.
 */
export function stemEndsFor(jamo: Pick<JamoData, 'type' | 'char'>, stroke: StrokeDataV2, box: BoxConfig): { start: Vec; end: Vec } | null {
  const target = box.stems?.[stroke.id]
  const last = stroke.points.length - 1
  if (jamo.type !== 'jungseong' || !target || last < 1) return null
  const base = baseStrokeOf(jamo.char, stroke.id)
  if (!base || base.points.length < 2) return null
  const baseStart = base.points[0]
  const baseEnd = base.points[base.points.length - 1]
  let startShift = 0
  let endShift = 0
  if (target.center !== undefined) {
    startShift = endShift = target.center - (baseStart.y + baseEnd.y) / 2
  } else {
    const startIsTop = baseStart.y <= baseEnd.y
    const startTarget = startIsTop ? target.top : target.bottom
    const endTarget = startIsTop ? target.bottom : target.top
    if (startTarget !== undefined) startShift = startTarget - baseStart.y
    if (endTarget !== undefined) endShift = endTarget - baseEnd.y
  }
  const start = stroke.points[0]
  const end = stroke.points[last]
  let startY = start.y + startShift
  let endY = end.y + endShift
  // 보에 붙은 끝은 저장 획이 옮겨져 있어도 보 가운데에 둔다.
  if (target.joined) {
    const startIsTop = baseStart.y <= baseEnd.y
    const joinedY = target.joined === 'top' ? target.top : target.bottom
    if (joinedY !== undefined) {
      if ((target.joined === 'top') === startIsTop) startY = joinedY
      else endY = joinedY
    }
  }
  if (Math.abs(startY - start.y) < EPSILON && Math.abs(endY - end.y) < EPSILON) return null
  return { start: { x: start.x, y: startY }, end: { x: end.x, y: endY } }
}

/** 보에 매달린 쪽(아래에서 올라오는 짧은기둥)이 위쪽 끝인 홀자. 나머지 짧은기둥은 아래 끝이 보에 붙는다. */
const STEM_JOINED_TOP = 'ㅜㅠㅝㅞㅟ'

/** 획 편집에서 줄기를 끌 때 세로 이동이 옮기는 보선(획 역할 키). 빈 목록이면 세로로는 안 움직인다(짧은기둥의 붙은 끝 · 칸 테두리). */
export interface StemRailDrag {
  part: MedialPart
  keys: string[]
  /** 칸 테두리에 매인 끝이라 세로로 잠겼다. 칸 끝은 레이아웃 편집에서만 옮긴다. */
  border?: boolean
}

/** 보 중심이 칸 끝(0 · 1)에 있다고 보는 거리(칸 안 비율). 앱 획 두께와 모델 두께가 조금 달라 딱 0 · 1은 아니다(기본 폰트 최대 0.011). */
const BORDER_TOLERANCE = 0.015

/**
 * 줄기의 이 끝이 칸 테두리인가 — 끌면 홀자 칸 네 변이 바뀌는 끝. 획 편집에서는 세로로 잠근다.
 * 기둥 끝은 칸 변에 매이면 목표가 없다(`stemRailTargets`가 안 싣는다). 안 기둥 끝은 칸 끝 가까이(0.02~)에 있어도 목표가 있어 테두리가 아니다.
 * 보는 칸을 만들면(ㅗ ㅜ ㅡ) 중심 목표가 칸 끝에 있다. 칸이 얇아 목표가 없는 홀자(ㅡ · ㅢ 가로부)는 칸이 곧 줄기라 테두리다.
 */
export function stemEndOnBorder(box: BoxConfig | undefined, strokeId: string, end: 'top' | 'bottom' | 'center'): boolean {
  const value = box?.stems?.[strokeId]?.[end]
  if (value === undefined) return true
  return end === 'center' && (value <= BORDER_TOLERANCE || value >= 1 - BORDER_TOLERANCE)
}

const endOfKey = (key: string): 'top' | 'bottom' | 'center' => key.endsWith('.center') ? 'center' : key.endsWith('.start') ? 'top' : 'bottom'

/** 획 편집 캔버스에 길게 그릴 이 줄기의 보선: 끌면 움직이는 끝(짧은기둥의 붙은 끝은 빼고)과 그 끝이 테두리인지. */
export function stemRailGuides(input: { jamo: Pick<JamoData, 'type' | 'char'>; stroke: StrokeDataV2; part: Part; box?: BoxConfig }): { key: string; end: 'top' | 'bottom' | 'center'; border: boolean }[] {
  const { jamo, stroke } = input
  if (jamo.type !== 'jungseong' || stroke.points.length < 2) return []
  const entry = MEDIAL_STEM_ROLES[jamo.char]?.[stroke.id]
  if (!entry || entry[0] !== input.part) return []
  const [, role] = entry
  const keys = role.endsWith('Beam') ? [`${role}.center`]
    : SHORT_STEMS.has(role) ? [`${role}.${STEM_JOINED_TOP.includes(jamo.char) ? 'end' : 'start'}`]
    : [`${role}.start`, `${role}.end`]
  return keys.map((key) => ({ key, end: endOfKey(key), border: stemEndOnBorder(input.box, stroke.id, endOfKey(key)) }))
}

/**
 * 이 끌기의 세로 이동이 보선이 되는가. `box`(놓인 홀자 칸)를 주면 칸 테두리에 매인 끝은 세로로 잠근다. 이름 있는 줄기의 세로 끝(기둥 위 · 아래 끝, 짧은기둥의 빈 끝)이나
 * 가로 줄기 통째 끌기가 대상이다. 가로 이동, 꺾인 점, 핸들, 짧은기둥 통째 끌기, 가로 줄기 끝점은 null — 지금처럼 획 모양을 고친다.
 */
export function stemRailDragOf(input: { jamo: Pick<JamoData, 'type' | 'char'>; stroke: StrokeDataV2; kind: 'stroke' | 'point' | 'handle'; pointIndex?: number; part: Part; box?: BoxConfig }): StemRailDrag | null {
  const drag = railDragOf(input)
  // 칸 테두리에 매인 끝이 하나라도 있으면 세로로 잠근다(기둥 통째 끌기도). 칸 끝은 레이아웃 편집에서만.
  if (drag && input.box && drag.keys.some((key) => stemEndOnBorder(input.box, input.stroke.id, endOfKey(key)))) return { part: drag.part, keys: [], border: true }
  return drag
}

function railDragOf(input: { jamo: Pick<JamoData, 'type' | 'char'>; stroke: StrokeDataV2; kind: 'stroke' | 'point' | 'handle'; pointIndex?: number; part: Part }): StemRailDrag | null {
  const { jamo, stroke, kind } = input
  if (jamo.type !== 'jungseong' || kind === 'handle') return null
  const entry = MEDIAL_STEM_ROLES[jamo.char]?.[stroke.id]
  if (!entry || entry[0] !== input.part || stroke.points.length < 2) return null
  const [part, role] = entry
  const last = stroke.points.length - 1
  if (role.endsWith('Beam')) return kind === 'stroke' ? { part, keys: [`${role}.center`] } : null
  const short = SHORT_STEMS.has(role)
  if (kind === 'stroke') return short ? null : { part, keys: [`${role}.start`, `${role}.end`] }
  if (input.pointIndex !== 0 && input.pointIndex !== last) return null
  const self = stroke.points[input.pointIndex]
  const other = stroke.points[input.pointIndex === 0 ? last : 0]
  const isTop = self.y <= other.y
  if (short && isTop === STEM_JOINED_TOP.includes(jamo.char)) return { part, keys: [] }
  return { part, keys: [`${role}.${isTop ? 'start' : 'end'}`] }
}
