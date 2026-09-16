import type { ComponentFaces } from '../src/services/notoComponentFit'
import type { MedialFitResult, StrokeRailBinding } from '../src/services/notoMedialMasterFit'
import type { BoxConfig, Part } from '../src/types'
import { CORPUS_FINALS, CORPUS_MEDIALS, corpusCodepoint, corpusIdentity } from './notoCorpus'
import type { CorpusIdentity } from './notoCorpus'
import type { ComponentFitPart } from './notoComponentFitView'
import type { EditableRail, MedialFitPart } from './notoMedialFitView'

/**
 * 검수 글자 화면의 rail 편집을 다른 글자에 퍼뜨려 보는 계산. 저장은 없다.
 *
 * 편집은 두 종류로 가른다.
 * - 배치: 획 중심 rail, 닿자 네 변. 층 속성이라 기본 범위는 `이 레이아웃`(홀자 계열·받침 유무가 같은 글자), `전체`는 일부러 넓힐 때. em Δ 브로드캐스트.
 *   특정 자모만 옮기는 건 배치가 아니라 형태(자소 탭 몫)라 범위 칩에 없다.
 * - 형태: 획 길이의 시작·끝 rail. 자모의 속성이라 같은 자모 글자에만, 슬롯 안 비율로 옮긴다(em이 아니다).
 *
 * Δ는 rail 키(`inner-bottom` 등)가 아니라 **획 역할 + 중심/시작/끝**(`primaryBeam.center`)으로 든다.
 * 같은 보라도 ㅐ는 `inner-bottom`, ㅏ는 `center-y`에 매여 있어 키로 얹으면 엉뚱한 rail이 움직이거나 아무것도 안 움직인다.
 */

export type MedialPartKey = MedialFitPart['part']
export type ComponentPartKey = ComponentFitPart['part']
export type EditKind = 'layout' | 'shape'

export const editKindOf = (rail: Pick<EditableRail, 'kind'>): EditKind => rail.kind === 'start' || rail.kind === 'end' ? 'shape' : 'layout'

/** 획 역할과 어느 rail인지. 예: `primaryBeam.center`, `outerPillar.end`. 글자가 달라도 같은 획을 가리킨다. */
export type SemanticRailKey = `${string}.${RailKind}`
export type RailKind = 'center' | 'start' | 'end'
export type SemanticDelta = Partial<Record<SemanticRailKey, number>>
type FitBindings = Pick<MedialFitResult, 'bindings'>

export interface PropagationEdit {
  layout: {
    /** 홀자 part별 중심 rail Δ(em). 획 역할 키. */
    medial: Partial<Record<MedialPartKey, SemanticDelta>>
    /** 닿자 part별 네 변 Δ(em). */
    component: Partial<Record<ComponentPartKey, Partial<ComponentFaces>>>
  }
  shape: {
    /** 홀자 part별 시작·끝 rail Δ를 그 축 슬롯 길이로 나눈 비율. 획 역할 키. */
    medial: Partial<Record<MedialPartKey, SemanticDelta>>
  }
}

/** rail 키가 어느 획의 중심/시작/끝인지. 편집 rail 목록과 같은 규칙: 중심으로 매인 획이 먼저. */
export function semanticKeyOf(bindings: readonly StrokeRailBinding[], railKey: string): SemanticRailKey | null {
  const center = bindings.find((b) => b.centerRail === railKey)
  if (center) return `${center.roleId}.center`
  const span = bindings.find((b) => b.fromRail === railKey || b.toRail === railKey)
  if (!span) return null
  return `${span.roleId}.${span.fromRail === railKey ? 'start' : 'end'}`
}

/** 획 역할 키를 이 글자의 rail 키와 축으로 푼다. 그 획이 없는 홀자면 null. */
export function resolveSemanticRail(bindings: readonly StrokeRailBinding[], key: string): { railKey: string; axis: 'x' | 'y' } | null {
  const dot = key.lastIndexOf('.')
  if (dot < 0) return null
  const roleId = key.slice(0, dot)
  const kind = key.slice(dot + 1) as RailKind
  const binding = bindings.find((b) => b.roleId === roleId)
  if (!binding) return null
  const centerAxis = binding.orientation === 'vertical' ? 'x' : 'y'
  if (kind === 'center') return { railKey: binding.centerRail, axis: centerAxis }
  const spanAxis = centerAxis === 'x' ? 'y' : 'x'
  if (kind === 'start') return { railKey: binding.fromRail, axis: spanAxis }
  if (kind === 'end') return { railKey: binding.toRail, axis: spanAxis }
  return null
}

/** 배치 Δ를 퍼뜨릴 범위. 기본 `이 레이아웃`(같은 문맥), `전체`는 일부러 넓히는 것. */
export type PropagationScope = 'layer' | 'all'
export const PROPAGATION_SCOPES: { id: PropagationScope; label: string; hint: string }[] = [
  { id: 'layer', label: '이 레이아웃', hint: '홀자 계열·받침 유무가 같은 글자' },
  { id: 'all', label: '전체', hint: '모든 글자' },
]

const EPSILON = 1e-9
const spanOf = (slot: BoxConfig, axis: 'x' | 'y') => axis === 'x' ? slot.width : slot.height

/** 편집 가능한 rail 목록(값·모델 값)에서 Δ를 뽑아 배치·형태로 가른다. 바뀐 것만 남는다. */
export function propagationEditOf(input: { editable: readonly EditableRail[]; medialParts: readonly MedialFitPart[]; componentParts: readonly ComponentFitPart[] }): PropagationEdit {
  const edit: PropagationEdit = { layout: { medial: {}, component: {} }, shape: { medial: {} } }
  for (const rail of input.editable) {
    const delta = rail.value - rail.original
    if (Math.abs(delta) <= EPSILON) continue
    if (rail.kind === 'face') {
      const part = input.componentParts[rail.partIndex]
      if (!part) continue
      const faces = (edit.layout.component[part.part] ??= {})
      faces[rail.role as keyof ComponentFaces] = delta
      continue
    }
    const part = input.medialParts[rail.partIndex]
    if (!part?.fit) continue
    const key = semanticKeyOf(part.fit.bindings, rail.role)
    if (!key) continue
    if (editKindOf(rail) === 'layout') {
      (edit.layout.medial[part.part] ??= {})[key] = delta
    } else {
      const span = spanOf(part.fit.slot, rail.axis)
      if (span <= EPSILON) continue
      (edit.shape.medial[part.part] ??= {})[key] = delta / span
    }
  }
  return edit
}

export const hasLayoutEdit = (edit: PropagationEdit) => Object.keys(edit.layout.medial).length > 0 || Object.keys(edit.layout.component).length > 0
export const hasShapeEdit = (edit: PropagationEdit) => Object.keys(edit.shape.medial).length > 0

/**
 * 획 역할 Δ(em)를 다른 글자의 rail 값에 얹는다. 그 획이 없는 홀자(ㅑ에 보 없음)는 건너뛰고 개수로 알려준다.
 * 두 역할 키가 이 글자에서 같은 rail로 풀리면(ㅏ의 기둥 중심 = 보 시작) 먼저 온 것만 얹는다.
 */
export function applyMedialDelta(fit: Pick<MedialFitResult, 'railsEm'> & FitBindings, delta: Readonly<SemanticDelta>): { rails: Record<string, number>; applied: number; skipped: number } {
  const rails: Record<string, number> = { ...fit.railsEm }
  const touched = new Set<string>()
  let applied = 0
  let skipped = 0
  for (const [key, value] of Object.entries(delta)) {
    if (value === undefined) continue
    const resolved = resolveSemanticRail(fit.bindings, key)
    if (!resolved || !(resolved.railKey in rails) || touched.has(resolved.railKey)) { skipped += 1; continue }
    rails[resolved.railKey] += value
    touched.add(resolved.railKey)
    applied += 1
  }
  return { rails, applied, skipped }
}

/** 비율 Δ를 대상 글자의 슬롯 길이(그 획 축)에 곱해 em Δ로 만든다. 없는 획은 그대로 둬서 applyMedialDelta가 건너뛰게 한다. */
export function shapeDeltaToEm(ratios: Readonly<SemanticDelta>, slot: BoxConfig, bindings: readonly StrokeRailBinding[]): SemanticDelta {
  const delta: SemanticDelta = {}
  for (const [key, ratio] of Object.entries(ratios)) {
    if (ratio === undefined) continue
    const resolved = resolveSemanticRail(bindings, key)
    delta[key as SemanticRailKey] = resolved ? ratio * spanOf(slot, resolved.axis) : ratio
  }
  return delta
}

export function applyFacesDelta(faces: ComponentFaces, delta: Partial<ComponentFaces>): ComponentFaces {
  return { left: faces.left + (delta.left ?? 0), right: faces.right + (delta.right ?? 0), top: faces.top + (delta.top ?? 0), bottom: faces.bottom + (delta.bottom ?? 0) }
}

// 카드에 올릴 글자 표본. 초성·받침은 자주 쓰는 것 위주로 골라 문맥이 고루 섞이게 한다.
const SAMPLE_INITIALS = [...'ㄱㄴㅁㅅㅇㅈㅎㄹㅂㅋ']
const SAMPLE_FINALS: (string | null)[] = [null, ...'ㄴㄹㅁㅇㄱㅂ']

/** 표본 묶음. `layer` = 같은 문맥, `all` = 전부, `jamo` = 잡은 부품(focus)의 자모가 같은 글자(없으면 같은 홀자) — 형태 Δ 카드 전용, 범위 칩엔 없다. */
export type CandidateScope = PropagationScope | 'jamo'

/** 잡은 부품의 자모. 초성이면 첫닿자, 받침이면 받침, 홀자 계열은 홀자. */
const focusJamoOf = (identity: CorpusIdentity, focus?: Part): string | null => focus === 'CH' ? identity.initialJamo : focus === 'JO' ? identity.finalJamo : identity.medialJamo

function scopeMatches(scope: CandidateScope, source: CorpusIdentity, target: CorpusIdentity, focus?: Part): boolean {
  if (scope === 'all') return true
  if (scope === 'layer') return target.contextId === source.contextId
  return focusJamoOf(target, focus) === focusJamoOf(source, focus)
}

/**
 * 범위에 드는 글자 중 count개. 전체 표본을 고른 간격으로 뽑아 초성·홀자·받침이 겹치지 않게 하고,
 * page를 올리면 다음 묶음으로 넘어간다.
 */
export function propagationCandidates(input: { source: CorpusIdentity; scope: CandidateScope; count: number; page?: number; /** 잡은 부품. `jamo` 범위에서 어느 부품 자모를 맞출지 정한다. */ focus?: Part }): CorpusIdentity[] {
  const { source, scope, count, focus } = input
  const pool: CorpusIdentity[] = []
  for (const final of SAMPLE_FINALS) for (const medial of CORPUS_MEDIALS) for (const initial of SAMPLE_INITIALS) {
    if (!CORPUS_FINALS.includes(final)) continue
    const codepoint = corpusCodepoint(initial, medial, final)
    if (codepoint === source.codepoint) continue
    const identity = corpusIdentity(codepoint)
    if (scopeMatches(scope, source, identity, focus)) pool.push(identity)
  }
  if (pool.length === 0) return []
  const pages = Math.max(1, Math.ceil(pool.length / count))
  const page = ((input.page ?? 0) % pages + pages) % pages
  const picked: CorpusIdentity[] = []
  for (let i = 0; i < count; i += 1) {
    const slot = i * pages + page
    if (slot >= pool.length) break
    picked.push(pool[slot])
  }
  return picked
}
