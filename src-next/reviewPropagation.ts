import type { ComponentFaces } from '../src/services/notoComponentFit'
import { applyMedialDelta, resolveSemanticRail, semanticKeyOf } from '../src/services/medialRailDelta'
import type { SemanticDelta, SemanticRailKey } from '../src/services/medialRailDelta'
import { addContextBoxDelta, faceWithDelta, resolveContextBoxes } from '../src/services/contextBoxResolver'
import type { ContextBoxDelta, ContextModel, FacesDelta } from '../src/services/contextBoxResolver'
import type { BoxConfig, Part } from '../src/types'
import { CORPUS_FINALS, CORPUS_INITIALS, CORPUS_MEDIALS, CORPUS_TOTAL, corpusCodepoint, corpusIdentity } from './notoCorpus'
import type { CorpusIdentity } from './notoCorpus'
import { jamoPartOf } from './layoutDeltaStore'
import type { ComponentFitPart } from './notoComponentFitView'
import type { EditableRail, MedialFitPart } from './notoMedialFitView'

/**
 * 검수 글자 화면의 rail 편집을 다른 글자에 퍼뜨려 보는 계산. 저장은 `layoutDeltaStore`가 맡고, 여기선 카드 미리보기용 Δ만 뽑는다.
 *
 * 다루는 편집은 배치뿐이다: 획 중심 rail, 홀자 상자 네 변, 닿자 네 변. 기본 범위는 `이 레이아웃`(홀자 계열·받침 유무가 같은 글자),
 * `이 자모만`은 잡은 부품의 자모로 좁힐 때, `전체`는 일부러 넓힐 때. em Δ(또는 변 고정)를 그대로 퍼뜨린다.
 * 획 길이(시작·끝 rail)는 앱 획에 안 닿아 레이아웃 편집기가 내놓지 않는다 — `획 고치기`의 몫. 들어와도 여기선 버린다.
 *
 * Δ는 획 역할 키(`primaryBeam.center`)로 든다 — 규칙은 `src/services/medialRailDelta.ts`. 여기서 재수출한다.
 */

export { applyMedialDelta, resolveSemanticRail, semanticKeyOf }
export type { SemanticDelta, SemanticRailKey }

export type MedialPartKey = MedialFitPart['part']
export type ComponentPartKey = ComponentFitPart['part']
export interface PropagationEdit {
  layout: {
    /** 홀자 part별 중심 rail Δ(em). 획 역할 키. */
    medial: Partial<Record<MedialPartKey, SemanticDelta>>
    /** 닿자 part별 네 변 Δ. 더하기(em) 또는 고정(`{ at }`). */
    component: Partial<Record<ComponentPartKey, FacesDelta>>
    /** 홀자 part별 상자 네 변 Δ. rail id가 `s`로 시작하는 변. 더하기 또는 고정. */
    slot: Partial<Record<MedialPartKey, FacesDelta>>
  }
}

/**
 * 범위 칩. 기본 `이 레이아웃`(같은 문맥), `이 자모만`은 좁힐 때. 자모 범위의 힌트는 고른 자모에 따라 카드가 만든다.
 * `전체`는 고르는 범위가 아니다(옛 저장분 이름용으로만 남는다) — 넓히기는 프리셋·기본값 쪽 일이고, 변 Δ는 홀자 계열을 건너면 뜻이 달라진다.
 */
/** 화면이 고르는 범위. 저장은 규칙식(`scopeRule.ts`)이 맡고, 이건 표본 묶음을 고르는 말이다. */
export type PropagationScope = 'layer' | 'jamo' | 'all'
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

/**
 * 편집 가능한 rail 목록(값·모델 값)에서 배치 Δ를 뽑는다. 바뀐 것만 남는다. 시작·끝 rail은 버린다.
 * `fixed`에 든 변 rail은 Δ가 0이어도 고정(`{ at: 지금 값 }`)으로 든다 — 범위 안 글자를 전부 이 자리에 모으는 뜻.
 */
export function propagationEditOf(input: { editable: readonly EditableRail[]; medialParts: readonly MedialFitPart[]; componentParts: readonly ComponentFitPart[]; fixed?: ReadonlySet<string> }): PropagationEdit {
  const edit: PropagationEdit = { layout: { medial: {}, component: {}, slot: {} } }
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
    if (rail.kind !== 'center') continue
    const part = input.medialParts[rail.partIndex]
    if (!part?.fit) continue
    const key = semanticKeyOf(part.fit.bindings, rail.role)
    if (!key) continue
    (edit.layout.medial[part.part] ??= {})[key] = delta
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


/** 네 변에 Δ를 얹는다. 더하기는 더하고, 고정은 그 자리로. */
export function applyFacesDelta(faces: ComponentFaces, delta: FacesDelta): ComponentFaces {
  return { left: faceWithDelta(faces.left, delta.left), right: faceWithDelta(faces.right, delta.right), top: faceWithDelta(faces.top, delta.top), bottom: faceWithDelta(faces.bottom, delta.bottom) }
}

// 카드에 먼저 올리는 글자. 우리말에서 자주 쓰는 글자를 레이아웃마다 사용자가 묶음(카드 한 장면)째 골랐다 — 묶음 안에서 초성·받침이 되도록 안 겹친다.
// 고른 기록은 옵시디언 `아이디어/2026-09-21_예시-글자-후보.md`. 드문 자모나 묶음이 다 돌고 나면 아래 기계 조합으로 채운다.
const SAMPLE_BATCHES: Readonly<Record<string, readonly string[]>> = {
  right: ['이처계때께하서녀', '에터키며가례대지', '피야배려다혜써게'],
  'right-final': ['한임명집실것없력', '있심년할책정법같', '일많겠성힘닭짧적'],
  bottom: ['고조수끄뿌요크효', '도구누유쓰보트표', '로뉴초교부무뜨으'],
  'bottom-final': ['는급꽃몫북들품용', '을죽놓숲뜻큼균통', '은를중습춤곧쪽높'],
  mixed: ['와뇌최쾌뭐뒤화궤', '의쉬죄과되뛰봐꽤', '위회귀쇠띄놔줘돼'],
  'mixed-final': ['됨쉽횟봤권뭘왕퀵', '원될줬광획쉰뛸놨', '된웠관훨꽝쫙'],
}
const identitiesOf = (text: string): CorpusIdentity[] => [...text].map((character) => corpusIdentity(character.codePointAt(0)!))

/** 레이아웃 여섯 칸. 홀자 계열(오른쪽·아래·섞임) × 받침 유무. `modelContextId`가 만드는 id와 같다. */
export const LAYOUT_CONTEXT_IDS = ['right', 'right-final', 'bottom', 'bottom-final', 'mixed', 'mixed-final'] as const
export const LAYOUT_CONTEXT_LABEL: Readonly<Record<string, string>> = {
  right: '오른쪽 홀자', 'right-final': '오른쪽 홀자 · 받침',
  bottom: '아래 홀자', 'bottom-final': '아래 홀자 · 받침',
  mixed: '섞임 홀자', 'mixed-final': '섞임 홀자 · 받침',
}
/**
 * 그 칸을 대표하는 글자. 여섯 칸 카드가 상자 모양을 뽑을 때 쓴다.
 * 고른 글자 묶음의 맨 앞을 그냥 쓰지 않는다 — ㅣ(기둥 하나)·ㅡ(가로보 하나)처럼 역할이 하나뿐인 홀자는
 * 상자가 선 하나로 납작해져서 칸이 어떻게 생겼는지 못 보여 준다. 칸마다 역할이 다 있는 흔한 글자를 하나씩 고정한다.
 */
const LAYOUT_SAMPLE_CHAR: Readonly<Record<string, string>> = {
  right: '가', 'right-final': '한', bottom: '고', 'bottom-final': '북', mixed: '와', 'mixed-final': '원',
}
export const layoutSampleCharOf = (contextId: string): string => LAYOUT_SAMPLE_CHAR[contextId] ?? '한'

// 고른 글자가 모자랄 때 채우는 기계 조합. 초성·받침은 자주 쓰는 것 위주로 골라 문맥이 고루 섞이게 한다.
const SAMPLE_INITIALS = [...'ㄱㄴㅁㅅㅇㅈㅎㄹㅂㅋ']
const SAMPLE_FINALS: (string | null)[] = [null, ...'ㄴㄹㅁㅇㄱㅂ']

/** 표본 묶음 = 범위 칩과 같다. `layer` = 같은 문맥, `jamo` = 같은 문맥에서 잡은 부품의 자모가 고른 것 중 하나, `all` = 전부. */

/** 잡은 부품의 자모. 초성이면 첫닿자, 받침이면 받침, 홀자 계열은 홀자. */
export const focusJamoOf = (identity: CorpusIdentity, focus?: Part): string | null => focus === 'CH' ? identity.initialJamo : focus === 'JO' ? identity.finalJamo : identity.medialJamo

function scopeMatches(scope: PropagationScope, source: CorpusIdentity, target: CorpusIdentity, focus: Part | undefined, jamos: readonly string[]): boolean {
  if (scope === 'all') return true
  if (scope === 'layer') return target.contextId === source.contextId
  const jamo = focusJamoOf(target, focus)
  return target.contextId === source.contextId && jamo !== null && jamos.includes(jamo)
}

/** 묶음에 없는 초성을 먼저 집는다. 없으면 맨 앞. */
const takeFresh = (rest: readonly CorpusIdentity[], page: readonly CorpusIdentity[]): CorpusIdentity | undefined => rest.find((item) => !page.some((other) => other.initialJamo === item.initialJamo)) ?? rest[0]

/**
 * 고른 글자로 짠 묶음들. `layer`는 그 레이아웃의 묶음 그대로, `jamo`는 그중 고른 자모만, `all`은 여섯 레이아웃을 한 묶음에 섞는다.
 * 원본 글자는 빠지고, 빠진 자리는 같은 레이아웃의 다른 고른 글자로 메운다.
 */
function curatedPages(source: CorpusIdentity, scope: PropagationScope, count: number, focus: Part | undefined, jamos: readonly string[]): CorpusIdentity[][] {
  const usable = (item: CorpusIdentity) => item.codepoint !== source.codepoint && scopeMatches(scope, source, item, focus, jamos)
  if (scope === 'all') {
    // 레이아웃마다 줄을 세우고 돌아가며 한 장씩 뽑는다. 뽑은 글자는 줄에서 빠져 다음 묶음에 다시 안 나온다.
    const queues = Object.values(SAMPLE_BATCHES).map((batches) => identitiesOf(batches.join('')).filter(usable))
    const pages: CorpusIdentity[][] = []
    while (queues.some((queue) => queue.length > 0)) {
      const page: CorpusIdentity[] = []
      for (let turn = 0; page.length < count && queues.some((queue) => queue.length > 0); turn += 1) {
        const queue = queues[turn % queues.length]
        const next = takeFresh(queue, page)
        if (!next) continue
        queue.splice(queue.indexOf(next), 1)
        page.push(next)
      }
      pages.push(page)
    }
    return pages
  }
  const batches = (SAMPLE_BATCHES[source.contextId] ?? []).map(identitiesOf)
  if (scope === 'jamo') {
    const matched = batches.flat().filter(usable)
    return Array.from({ length: Math.ceil(matched.length / count) }, (_, index) => matched.slice(index * count, (index + 1) * count))
  }
  return batches.map((batch) => {
    const page = batch.filter(usable).slice(0, count)
    const target = Math.min(count, batch.length)
    while (page.length < target) {
      const next = takeFresh(batches.flat().filter((item) => usable(item) && !page.includes(item)), page)
      if (!next) break
      page.push(next)
    }
    return page
  })
}

/**
 * 범위에 드는 글자 중 count개. 고른 글자 묶음이 먼저 나오고, 모자란 자리와 그 뒤 묶음은 기계 조합을 고른 간격으로 뽑아 채운다.
 * page를 올리면 다음 묶음으로 넘어간다. `jamo` 범위는 고른 자모가 표본 목록에 없어도 그 자모 글자를 넣는다.
 */
export function propagationCandidates(input: { source: CorpusIdentity; scope: PropagationScope; count: number; page?: number; /** 잡은 부품. `jamo` 범위에서 어느 부품 자모를 맞출지 정한다. */ focus?: Part; /** `jamo` 범위에서 고른 자모. */ jamos?: readonly string[] }): CorpusIdentity[] {
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
  const curated = curatedPages(source, scope, count, focus, jamos)
  const curatedCodepoints = new Set(curated.flat().map((item) => item.codepoint))
  const fill = pool.filter((item) => !curatedCodepoints.has(item.codepoint))
  const fillPages = Math.ceil(fill.length / count)
  // `jamo` 범위는 고른 자모 글자가 몇 없어서 고른 글자와 기계 조합을 한 묶음에 같이 올린다. 나머지 범위는 고른 묶음이 다 돈 뒤에 기계 조합이 나온다.
  const mixed = scope === 'jamo'
  const total = mixed ? Math.max(curated.length, fillPages) : curated.length + fillPages
  if (total === 0) return []
  const page = ((input.page ?? 0) % total + total) % total
  const picked = page < curated.length ? [...curated[page]] : []
  if (page < curated.length && !mixed) return picked
  // 기계 조합은 고른 간격으로 뽑는다.
  const stride = Math.max(1, fillPages)
  const offset = mixed ? page % stride : page - curated.length
  for (let i = 0; picked.length < count; i += 1) {
    const slot = i * stride + offset
    if (slot >= fill.length) break
    picked.push(fill[slot])
  }
  return picked
}
