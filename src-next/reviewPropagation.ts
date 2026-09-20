import type { ComponentFaces } from '../src/services/notoComponentFit'
import type { StrokeRailBinding } from '../src/services/notoMedialMasterFit'
import { applyMedialDelta, resolveSemanticRail, semanticKeyOf } from '../src/services/medialRailDelta'
import type { SemanticDelta, SemanticRailKey } from '../src/services/medialRailDelta'
import { addContextBoxDelta, resolveContextBoxes } from '../src/services/contextBoxResolver'
import type { ContextBoxDelta, ContextModel } from '../src/services/contextBoxResolver'
import type { BoxConfig, Part } from '../src/types'
import { CORPUS_FINALS, CORPUS_MEDIALS, corpusCodepoint, corpusIdentity } from './notoCorpus'
import type { CorpusIdentity } from './notoCorpus'
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
    /** 닿자 part별 네 변 Δ(em). */
    component: Partial<Record<ComponentPartKey, Partial<ComponentFaces>>>
    /** 홀자 part별 상자 네 변 Δ(em). rail id가 `s`로 시작하는 변. */
    slot: Partial<Record<MedialPartKey, Partial<ComponentFaces>>>
  }
  shape: {
    /** 홀자 part별 시작·끝 rail Δ를 그 축 슬롯 길이로 나눈 비율. 획 역할 키. */
    medial: Partial<Record<MedialPartKey, SemanticDelta>>
  }
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
  const edit: PropagationEdit = { layout: { medial: {}, component: {}, slot: {} }, shape: { medial: {} } }
  for (const rail of input.editable) {
    const delta = rail.value - rail.original
    if (Math.abs(delta) <= EPSILON) continue
    if (rail.kind === 'face' && rail.id.startsWith('s')) {
      const part = input.medialParts[rail.partIndex]
      if (!part) continue
      const faces = (edit.layout.slot[part.part] ??= {})
      faces[rail.role as keyof ComponentFaces] = delta
      continue
    }
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
