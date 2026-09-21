import groups from '../src/data/jamoLiteratureGroups.json'

/**
 * 이용제 구조군. **출처는 이 레포의 `src/data/jamoLiteratureGroups.json` 하나다.**
 * 옵시디언 `자모 데이터/`는 거울이고(`scripts/jamo-groups-docs.mjs`가 표 한 장을 다시 쓴다) 앱은 볼트를 읽지 않는다.
 *
 * 닿자를 면적·시각 공간·홀자와의 상대 위치로 묶은 비교용 그룹이라 홀자 세부 형태와 끝맺음은 이 표로 설명되지 않는다.
 * 같은 자모라도 문맥마다 그룹이 다르다 — 받침 유무까지 나뉘어 기준이 여섯이다.
 * 받침 전용 자모(겹받침)에는 첫닿자 기준이 없고, ㄸ·ㅃ·ㅉ에는 받침 기준이 없다.
 */

export type LiteratureCriterion = 'initialHorizontal' | 'initialVertical' | 'initialHorizontalNoFinal' | 'initialVerticalNoFinal' | 'finalHorizontalMixed' | 'finalVertical'

export interface JamoLiteratureGroup {
  /** 가로모임꼴 받친글자 · 첫닿자 */
  initialHorizontal?: number
  /** 세로모임꼴 받친글자 · 첫닿자 */
  initialVertical?: number
  /** 가로모임꼴 민글자 · 첫닿자 */
  initialHorizontalNoFinal?: number
  /** 세로모임꼴 민글자 · 첫닿자 */
  initialVerticalNoFinal?: number
  /** 가로·섞임모임꼴 · 받침닿자 */
  finalHorizontalMixed?: number
  /** 세로모임꼴 · 받침닿자 */
  finalVertical?: number
  /** 속공간 층수. `2줄` · `3줄` */
  height?: string
  /** 속공간 묶음. `S1`… */
  inkSpaceGroup?: string
}

export const JAMO_LITERATURE_GROUPS: Readonly<Record<string, JamoLiteratureGroup>> = groups

/** 그 기준에서 자모 → 그룹 번호. 그 기준이 없는 자모는 빠진다. */
export function groupNumbersOf(criterion: LiteratureCriterion): Record<string, number> {
  const out: Record<string, number> = {}
  for (const [jamo, record] of Object.entries(JAMO_LITERATURE_GROUPS)) {
    const id = record[criterion]
    if (id !== undefined) out[jamo] = id
  }
  return out
}

/** 그 기준의 그룹 목록. 번호 순, 그룹 안은 자모 순(JSON 차례). */
export function groupsOf(criterion: LiteratureCriterion): { id: number; jamos: string[] }[] {
  const byId = new Map<number, string[]>()
  for (const [jamo, id] of Object.entries(groupNumbersOf(criterion))) {
    const list = byId.get(id) ?? []
    list.push(jamo)
    byId.set(id, list)
  }
  return [...byId.entries()].sort(([a], [b]) => a - b).map(([id, jamos]) => ({ id, jamos }))
}

/** 그 기준에서 이 자모와 같은 그룹인 자모 전부(자기 포함). 없으면 빈 배열 — 추천 칩이 안 선다. */
export function sameGroupJamos(criterion: LiteratureCriterion, jamo: string): string[] {
  const id = JAMO_LITERATURE_GROUPS[jamo]?.[criterion]
  if (id === undefined) return []
  return Object.entries(groupNumbersOf(criterion)).flatMap(([other, value]) => value === id ? [other] : [])
}

/** 속공간·높이가 같은 자모 전부(자기 포함). 추천 칩 재료. */
export function sameTraitJamos(trait: 'height' | 'inkSpaceGroup', jamo: string): string[] {
  const value = JAMO_LITERATURE_GROUPS[jamo]?.[trait]
  if (value === undefined) return []
  return Object.entries(JAMO_LITERATURE_GROUPS).flatMap(([other, record]) => record[trait] === value ? [other] : [])
}

/**
 * 글자 문맥 → 첫닿자·받침에 쓸 기준. 추천 칩이 이걸로 기준을 고른다.
 * 이용제의 `가로모임꼴`은 홀자가 오른쪽(`right`), `세로모임꼴`은 아래(`bottom`)다.
 * 섞임(`mixed`) 첫닿자 기준은 표에 없어 가로모임 것을 쓴다 — 받침은 `가로·섞임` 기준이 둘을 같이 덮는다.
 */
export function criterionFor(part: 'initial' | 'final', contextId: string): LiteratureCriterion {
  const vertical = contextId.startsWith('bottom')
  const hasFinal = contextId.endsWith('-final')
  if (part === 'final') return vertical ? 'finalVertical' : 'finalHorizontalMixed'
  return vertical
    ? (hasFinal ? 'initialVertical' : 'initialVerticalNoFinal')
    : (hasFinal ? 'initialHorizontal' : 'initialHorizontalNoFinal')
}
