import type { ComponentFaces } from '../src/services/notoComponentFit'
import type { StrokeRailBinding } from '../src/services/notoMedialMasterFit'
import { applyMedialDelta, resolveSemanticRail, semanticKeyOf } from '../src/services/medialRailDelta'
import type { SemanticDelta, SemanticRailKey } from '../src/services/medialRailDelta'
import { addContextBoxDelta, faceWithDelta, resolveContextBoxes } from '../src/services/contextBoxResolver'
import type { ContextBoxDelta, ContextModel, FacesDelta } from '../src/services/contextBoxResolver'
import type { BoxConfig, Part } from '../src/types'
import { CORPUS_FINALS, CORPUS_INITIALS, CORPUS_MEDIALS, CORPUS_TOTAL, corpusCodepoint, corpusIdentity } from './notoCorpus'
import type { CorpusIdentity } from './notoCorpus'
import { jamoPartOf } from './layoutDeltaStore'
import type { PropagationScope } from './layoutDeltaStore'
import type { ComponentFitPart } from './notoComponentFitView'
import type { EditableRail, MedialFitPart } from './notoMedialFitView'

/**
 * 검수 글자 화면의 rail 편집을 다른 글자에 퍼뜨려 보는 계산. 저장은 `layoutDeltaStore`가 맡고, 여기선 카드 미리보기용 Δ만 뽑는다.
 *
 * 편집은 두 종류로 가른다.
 * - 배치: 획 중심 rail, 닿자 네 변. 층 속성이라 기본 범위는 `이 레이아웃`(홀자 계열·받침 유무가 같은 글자), `전체`는 일부러 넓힐 때. em Δ 브로드캐스트.
 *   특정 자모만 옮기는 건 배치가 아니라 형태(자소 탭 몫)라 범위 칩에 없다.
 * - 형태: 획 길이의 시작·끝 rail. 자모의 속성이라 같은 자모 글자에만, 슬롯 안 비율로 옮긴다(em이 아니다).
 *
 * Δ는 획 역할 키(`primaryBeam.center`)로 든다 — 규칙은 `src/services/medialRailDelta.ts`. 여기서 재수출한다.
 */

export { applyMedialDelta, resolveSemanticRail, semanticKeyOf }
export type { SemanticDelta, SemanticRailKey }

export type MedialPartKey = MedialFitPart['part']
export type ComponentPartKey = ComponentFitPart['part']
export type EditKind = 'layout' | 'shape'

export const editKindOf = (rail: Pick<EditableRail, 'kind'>): EditKind => rail.kind === 'start' || rail.kind === 'end' ? 'shape' : 'layout'

export interface PropagationEdit {
  layout: {
    /** 홀자 part별 중심 rail Δ(em). 획 역할 키. */
    medial: Partial<Record<MedialPartKey, SemanticDelta>>
    /** 닿자 part별 네 변 Δ. 더하기(em) 또는 고정(`{ at }`). */
    component: Partial<Record<ComponentPartKey, FacesDelta>>
    /** 홀자 part별 상자 네 변 Δ. rail id가 `s`로 시작하는 변. 더하기 또는 고정. */
    slot: Partial<Record<MedialPartKey, FacesDelta>>
  }
  shape: {
    /** 홀자 part별 시작·끝 rail Δ를 그 축 슬롯 길이로 나눈 비율. 획 역할 키. */
    medial: Partial<Record<MedialPartKey, SemanticDelta>>
  }
}

/** 범위 칩. 기본 `이 레이아웃`(같은 문맥), `이 자모만`은 좁힐 때, `전체`는 일부러 넓힐 때. 자모 범위의 힌트는 고른 자모에 따라 카드가 만든다. */
export type { PropagationScope }
export const PROPAGATION_SCOPES: { id: PropagationScope; label: string; hint: string }[] = [
  { id: 'layer', label: '이 레이아웃', hint: '홀자 계열·받침 유무가 같은 글자' },
  { id: 'jamo', label: '이 자모만', hint: '이 레이아웃에서 잡은 부품의 자모가 같은 글자' },
  { id: 'all', label: '전체', hint: '모든 글자' },
]

/** 오버라이드 카드에 적는 닿는 글자 수. 11,172자 전수에서 센다. 문맥·자모별로 메모. */
const glyphCountCache = new Map<string, number>()
export function overrideGlyphCount(target: { scope: 'all' } | { scope: 'layer'; contextId: string } | { scope: 'jamo'; contextId: string; group: 'CH' | 'JU' | 'JO'; jamo: string }): number {
  if (target.scope === 'all') return CORPUS_TOTAL
  const key = target.scope === 'layer' ? `layer:${target.contextId}` : `jamo:${target.contextId}:${target.group}:${target.jamo}`
  const cached = glyphCountCache.get(key)
  if (cached !== undefined) return cached
  let count = 0
  for (let offset = 0; offset < CORPUS_TOTAL; offset += 1) {
    const identity = corpusIdentity(0xac00 + offset)
    if (identity.contextId !== target.contextId) continue
    if (target.scope === 'layer' || focusJamoOf(identity, target.group) === target.jamo) count += 1
  }
  glyphCountCache.set(key, count)
  return count
}

/** 부품 묶음 → 그 자리에 올 수 있는 자모 전부. `이 자모만`의 고르기 목록. */
export const jamoChoicesFor = (part: Part): readonly string[] => jamoPartOf(part) === 'CH' ? CORPUS_INITIALS : jamoPartOf(part) === 'JO' ? CORPUS_FINALS.filter((jamo): jamo is string => jamo !== null) : CORPUS_MEDIALS
export const PART_GROUP_LABEL: Record<'CH' | 'JU' | 'JO', string> = { CH: '첫닿자', JU: '홀자', JO: '받침' }

const EPSILON = 1e-9
const spanOf = (slot: BoxConfig, axis: 'x' | 'y') => axis === 'x' ? slot.width : slot.height

/**
 * 편집 가능한 rail 목록(값·모델 값)에서 Δ를 뽑아 배치·형태로 가른다. 바뀐 것만 남는다.
 * `fixed`에 든 변 rail은 Δ가 0이어도 고정(`{ at: 지금 값 }`)으로 든다 — 범위 안 글자를 전부 이 자리에 모으는 뜻.
 */
export function propagationEditOf(input: { editable: readonly EditableRail[]; medialParts: readonly MedialFitPart[]; componentParts: readonly ComponentFitPart[]; fixed?: ReadonlySet<string> }): PropagationEdit {
  const edit: PropagationEdit = { layout: { medial: {}, component: {}, slot: {} }, shape: { medial: {} } }
  for (const rail of input.editable) {
    const delta = rail.value - rail.original
    const fixed = rail.kind === 'face' && (input.fixed?.has(rail.id) ?? false)
    if (Math.abs(delta) <= EPSILON && !fixed) continue
    if (rail.kind === 'face' && rail.id.startsWith('s')) {
      const part = input.medialParts[rail.partIndex]
      if (!part) continue
      const faces = (edit.layout.slot[part.part] ??= {})
      faces[rail.role as keyof ComponentFaces] = fixed ? { at: rail.value } : delta
      continue
    }
    if (rail.kind === 'face') {
      const part = input.componentParts[rail.partIndex]
      if (!part) continue
      const faces = (edit.layout.component[part.part] ??= {})
      faces[rail.role as keyof ComponentFaces] = fixed ? { at: rail.value } : delta
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

const PROBE = 0.001
const sameBoxes = (a: Partial<Record<Part, BoxConfig>>, b: Partial<Record<Part, BoxConfig>>) => (Object.keys({ ...a, ...b }) as Part[]).every((part) => {
  const left = a[part]; const right = b[part]
  return !!left && !!right && (['x', 'y', 'width', 'height'] as const).every((key) => Math.abs(left[key] - right[key]) <= EPSILON)
})

/**
 * 옮겨도 글자에 안 닿는 배치 rail. 앱 렌더러는 홀자를 slot 상자에 스케일해 그리므로, slot 경계를 안 미는 안쪽 중심 rail은 상자를 못 바꾼다.
 * 규칙을 따로 두지 않고 1u를 양쪽으로 얹어 칸 해석을 다시 돌려 본다. 둘 다 상자가 그대로면 안 닿는 rail이다(한쪽만 막히면 순서 클램프일 수 있다).
 * 닿자 네 변은 상자 자체라 늘 닿고, 시작·끝 rail은 배치가 아니라 여기서 안 본다.
 */
export function unreachedRailIds(input: { identity: CorpusIdentity; model: ContextModel; delta?: ContextBoxDelta; editable: readonly EditableRail[]; medialParts: readonly MedialFitPart[] }): Set<string> {
  const base = resolveContextBoxes({ identity: input.identity, model: input.model, delta: input.delta }).boxes
  const unreached = new Set<string>()
  for (const rail of input.editable) {
    if (rail.kind !== 'center') continue
    const part = input.medialParts[rail.partIndex]
    const key = part?.fit ? semanticKeyOf(part.fit.bindings, rail.role) : null
    if (!part || !key) continue
    const moves = [PROBE, -PROBE].some((step) => !sameBoxes(base, resolveContextBoxes({ identity: input.identity, model: input.model, delta: addContextBoxDelta(input.delta, { medial: { [part.part]: { [key]: step } } }) }).boxes))
    if (!moves) unreached.add(rail.id)
  }
  return unreached
}

export const hasLayoutEdit = (edit: PropagationEdit) => Object.keys(edit.layout.medial).length > 0 || Object.keys(edit.layout.component).length > 0 || Object.keys(edit.layout.slot).length > 0

/** 배치 Δ를 저장 형태(`ContextBoxDelta`)로. 형태 Δ(시작·끝)는 자모 몫이라 여기 안 든다. */
export const layoutDeltaOf = (edit: PropagationEdit): ContextBoxDelta => ({ faces: { ...edit.layout.component, ...edit.layout.slot }, medial: edit.layout.medial })
export const hasShapeEdit = (edit: PropagationEdit) => Object.keys(edit.shape.medial).length > 0

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

/** 네 변에 Δ를 얹는다. 더하기는 더하고, 고정은 그 자리로. */
export function applyFacesDelta(faces: ComponentFaces, delta: FacesDelta): ComponentFaces {
  return { left: faceWithDelta(faces.left, delta.left), right: faceWithDelta(faces.right, delta.right), top: faceWithDelta(faces.top, delta.top), bottom: faceWithDelta(faces.bottom, delta.bottom) }
}

// 카드에 올릴 글자 표본. 초성·받침은 자주 쓰는 것 위주로 골라 문맥이 고루 섞이게 한다.
const SAMPLE_INITIALS = [...'ㄱㄴㅁㅅㅇㅈㅎㄹㅂㅋ']
const SAMPLE_FINALS: (string | null)[] = [null, ...'ㄴㄹㅁㅇㄱㅂ']

/**
 * 표본 묶음. `layer` = 같은 문맥, `jamo` = 같은 문맥에서 잡은 부품의 자모가 고른 것 중 하나, `all` = 전부.
 * `sameJamo` = 문맥 무관하게 잡은 부품의 자모가 같은 글자 — 형태 Δ 카드 전용, 범위 칩엔 없다.
 */
export type CandidateScope = PropagationScope | 'sameJamo'

/** 잡은 부품의 자모. 초성이면 첫닿자, 받침이면 받침, 홀자 계열은 홀자. */
export const focusJamoOf = (identity: CorpusIdentity, focus?: Part): string | null => focus === 'CH' ? identity.initialJamo : focus === 'JO' ? identity.finalJamo : identity.medialJamo

function scopeMatches(scope: CandidateScope, source: CorpusIdentity, target: CorpusIdentity, focus: Part | undefined, jamos: readonly string[]): boolean {
  if (scope === 'all') return true
  if (scope === 'layer') return target.contextId === source.contextId
  if (scope === 'jamo') { const jamo = focusJamoOf(target, focus); return target.contextId === source.contextId && jamo !== null && jamos.includes(jamo) }
  return focusJamoOf(target, focus) === focusJamoOf(source, focus)
}

/**
 * 범위에 드는 글자 중 count개. 전체 표본을 고른 간격으로 뽑아 초성·홀자·받침이 겹치지 않게 하고,
 * page를 올리면 다음 묶음으로 넘어간다. `jamo` 범위는 고른 자모가 표본 목록에 없어도 그 자모 글자를 넣는다.
 */
export function propagationCandidates(input: { source: CorpusIdentity; scope: CandidateScope; count: number; page?: number; /** 잡은 부품. `jamo`·`sameJamo` 범위에서 어느 부품 자모를 맞출지 정한다. */ focus?: Part; /** `jamo` 범위에서 고른 자모. */ jamos?: readonly string[] }): CorpusIdentity[] {
  const { source, scope, count, focus } = input
  const jamos = input.jamos ?? []
  const group = focus ? jamoPartOf(focus) : 'JU'
  // 고른 자모가 표본 목록 밖이면(ㅋ 받침 등) 그 자모를 목록에 보태 카드가 비지 않게 한다.
  const initials = scope === 'jamo' && group === 'CH' ? [...new Set([...SAMPLE_INITIALS, ...jamos])] : SAMPLE_INITIALS
  const finals = scope === 'jamo' && group === 'JO' ? [...new Set([...SAMPLE_FINALS, ...jamos])] : SAMPLE_FINALS
  const pool: CorpusIdentity[] = []
  for (const final of finals) for (const medial of CORPUS_MEDIALS) for (const initial of initials) {
    if (!CORPUS_FINALS.includes(final) || !CORPUS_INITIALS.includes(initial)) continue
    const codepoint = corpusCodepoint(initial, medial, final)
    if (codepoint === source.codepoint) continue
    const identity = corpusIdentity(codepoint)
    if (scopeMatches(scope, source, identity, focus, jamos)) pool.push(identity)
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
