import type { ComponentFaces } from '../src/services/notoComponentFit'
import type { BoxConfig } from '../src/types'
import { CORPUS_FINALS, CORPUS_MEDIALS, corpusCodepoint, corpusIdentity } from './notoCorpus'
import type { CorpusIdentity } from './notoCorpus'
import type { ComponentFitPart } from './notoComponentFitView'
import type { EditableRail, MedialFitPart } from './notoMedialFitView'

/**
 * 검수 글자 화면의 rail 편집을 다른 글자에 퍼뜨려 보는 계산. 저장은 없다.
 *
 * 편집은 두 종류로 가른다(탭=범위 원칙).
 * - 배치: 획 중심 rail, 닿자 네 변. 문맥 칸(층)의 속성이라 범위는 `이 층 · 전체`. em Δ 브로드캐스트.
 * - 형태: 획 길이의 시작·끝 rail. 자모의 속성이라 범위는 `이 자모`. 슬롯 안 비율로 옮긴다(em이 아니다).
 */

export type MedialPartKey = MedialFitPart['part']
export type ComponentPartKey = ComponentFitPart['part']
export type EditKind = 'layout' | 'shape'

export const editKindOf = (rail: Pick<EditableRail, 'kind'>): EditKind => rail.kind === 'start' || rail.kind === 'end' ? 'shape' : 'layout'

export interface PropagationEdit {
  layout: {
    /** 홀자 part별 중심 rail Δ(em). */
    medial: Partial<Record<MedialPartKey, Record<string, number>>>
    /** 닿자 part별 네 변 Δ(em). */
    component: Partial<Record<ComponentPartKey, Partial<ComponentFaces>>>
  }
  shape: {
    /** 홀자 part별 시작·끝 rail Δ를 그 축 슬롯 길이로 나눈 비율. */
    medial: Partial<Record<MedialPartKey, Record<string, number>>>
  }
}

/** 배치 Δ를 퍼뜨릴 범위. 글자보다 넓고 자모는 아니다. */
export type PropagationScope = 'layer' | 'all'
export const PROPAGATION_SCOPES: { id: PropagationScope; label: string; hint: string }[] = [
  { id: 'layer', label: '이 층', hint: '홀자 계열·받침 유무가 같은 글자' },
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
    if (editKindOf(rail) === 'layout') {
      (edit.layout.medial[part.part] ??= {})[rail.role] = delta
    } else {
      const span = spanOf(part.fit.slot, rail.axis)
      if (span <= EPSILON) continue
      (edit.shape.medial[part.part] ??= {})[rail.role] = delta / span
    }
  }
  return edit
}

export const hasLayoutEdit = (edit: PropagationEdit) => Object.keys(edit.layout.medial).length > 0 || Object.keys(edit.layout.component).length > 0
export const hasShapeEdit = (edit: PropagationEdit) => Object.keys(edit.shape.medial).length > 0

/** Δ(em)를 다른 글자의 rail 값에 얹는다. 역할이 다른 홀자에는 없는 키가 있어 얹은 개수를 같이 준다. */
export function applyMedialDelta(railsEm: Readonly<Record<string, number>>, delta: Readonly<Record<string, number>>): { rails: Record<string, number>; applied: number; skipped: number } {
  const rails: Record<string, number> = { ...railsEm }
  let applied = 0
  let skipped = 0
  for (const [key, value] of Object.entries(delta)) {
    if (key in rails) { rails[key] += value; applied += 1 } else skipped += 1
  }
  return { rails, applied, skipped }
}

/** 비율 Δ를 대상 글자의 슬롯 길이에 곱해 em Δ로 만든다. */
export function shapeDeltaToEm(ratios: Readonly<Record<string, number>>, slot: BoxConfig, axisOf: (key: string) => 'x' | 'y'): Record<string, number> {
  const delta: Record<string, number> = {}
  for (const [key, ratio] of Object.entries(ratios)) delta[key] = ratio * spanOf(slot, axisOf(key))
  return delta
}

export function applyFacesDelta(faces: ComponentFaces, delta: Partial<ComponentFaces>): ComponentFaces {
  return { left: faces.left + (delta.left ?? 0), right: faces.right + (delta.right ?? 0), top: faces.top + (delta.top ?? 0), bottom: faces.bottom + (delta.bottom ?? 0) }
}

// 카드에 올릴 글자 표본. 초성·받침은 자주 쓰는 것 위주로 골라 문맥이 고루 섞이게 한다.
const SAMPLE_INITIALS = [...'ㄱㄴㅁㅅㅇㅈㅎㄹㅂㅋ']
const SAMPLE_FINALS: (string | null)[] = [null, ...'ㄴㄹㅁㅇㄱㅂ']

/** 표본 묶음. `jamo` = 같은 홀자(형태 Δ용), `layer` = 같은 문맥, `all` = 전부. */
export type CandidateScope = PropagationScope | 'jamo'

function scopeMatches(scope: CandidateScope, source: CorpusIdentity, target: CorpusIdentity): boolean {
  if (scope === 'all') return true
  if (scope === 'layer') return target.contextId === source.contextId
  return target.medialJamo === source.medialJamo
}

/**
 * 범위에 드는 글자 중 count개. 전체 표본을 고른 간격으로 뽑아 초성·홀자·받침이 겹치지 않게 하고,
 * page를 올리면 다음 묶음으로 넘어간다.
 */
export function propagationCandidates(input: { source: CorpusIdentity; scope: CandidateScope; count: number; page?: number }): CorpusIdentity[] {
  const { source, scope, count } = input
  const pool: CorpusIdentity[] = []
  for (const final of SAMPLE_FINALS) for (const medial of CORPUS_MEDIALS) for (const initial of SAMPLE_INITIALS) {
    if (!CORPUS_FINALS.includes(final)) continue
    const codepoint = corpusCodepoint(initial, medial, final)
    if (codepoint === source.codepoint) continue
    const identity = corpusIdentity(codepoint)
    if (scopeMatches(scope, source, identity)) pool.push(identity)
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
