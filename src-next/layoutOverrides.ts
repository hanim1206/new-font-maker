import { hasContextBoxDelta, isFixedFace, isZeroFace } from '../src/services/contextBoxResolver'
import type { ContextBoxDelta, FaceDelta } from '../src/services/contextBoxResolver'
import type { Part } from '../src/types'
import { jamoKeyOf } from './layoutDeltaStore'
import type { LayoutDeltaTarget } from './layoutDeltaStore'
import { roleLabel } from './notoMedialFitView'
import { jamoChoicesFor } from './reviewPropagation'

/**
 * 범위 띠의 계산부. 저장된 오버라이드 한 개 = `layoutDeltaStore` 항목 하나 = 띠의 찬 칩 하나.
 * 저장 목록 순서는 넓은 것부터: 전체 → 이 레이아웃 → 자모별(첫닿자·홀자·받침, 자모 순).
 * 프리셋 모델의 자동 보정(층 대표값·자모 효과·쌍 셀)은 저장소 밖이라 칩이 안 된다.
 */

export type OverrideGroup = 'CH' | 'JU' | 'JO'
export const partOfGroup: Record<OverrideGroup, Part> = { CH: 'CH', JU: 'JU', JO: 'JO' }
export type OverrideCard =
  | { kind: 'all'; delta: ContextBoxDelta }
  | { kind: 'layer'; delta: ContextBoxDelta }
  | { kind: 'jamo'; group: OverrideGroup; jamo: string; delta: ContextBoxDelta }

const SIDE_LABEL: Record<string, string> = { left: '왼변', right: '오른변', top: '윗변', bottom: '아랫변' }
const KIND_LABEL: Record<string, string> = { center: '중심', start: '시작', end: '끝' }
const PART_LABEL: Record<string, string> = { CH: '첫닿자', JU: '홀자', JU_H: '홀자 가로부', JU_V: '홀자 세로부', JO: '받침' }
const units = (value: number) => { const n = Math.round(value * 1000); return `${n > 0 ? '+' : ''}${n}u` }

/** Δ 한 항목 = 한 줄 요약. 자모 카드는 부품이 이름에 있어 변 이름만, 넓은 카드는 부품까지 붙인다. */
export function deltaSummary(delta: ContextBoxDelta, withPart: boolean): string[] {
  const lines: string[] = []
  for (const [part, faces] of Object.entries(delta.faces ?? {})) {
    if (!faces) continue
    for (const [side, value] of Object.entries(faces)) {
      if (isZeroFace(value as FaceDelta)) continue
      // 고정은 `= 718`(자리), 더하기는 `+12u`.
      const amount = isFixedFace(value as FaceDelta) ? `= ${Math.round((value as { at: number }).at * 1000)}` : units(value as number)
      lines.push(`${withPart ? `${PART_LABEL[part] ?? part} ` : ''}${SIDE_LABEL[side] ?? side} ${amount}`)
    }
  }
  for (const [part, rails] of Object.entries(delta.medial ?? {})) {
    if (!rails) continue
    const prefix = withPart ? `${PART_LABEL[part] ?? part} ` : part === 'JU_H' ? '가로부 ' : part === 'JU_V' ? '세로부 ' : ''
    for (const [key, value] of Object.entries(rails)) {
      if (typeof value !== 'number' || Math.abs(value) <= 1e-12) continue
      const [roleId, kind] = key.split('.')
      lines.push(`${prefix}${roleLabel(roleId)} ${KIND_LABEL[kind] ?? kind} ${units(value)}`)
    }
  }
  return lines
}

const GROUP_ORDER: OverrideGroup[] = ['CH', 'JU', 'JO']

/** 저장소에서 이 레이아웃에 쌓인 오버라이드를 뽑는다. 자모별은 부품 순, 그 안에서 자모 순. */
export function overrideCardsOf(state: { all: ContextBoxDelta; layers: Record<string, ContextBoxDelta>; jamo: Record<string, Record<string, ContextBoxDelta>> }, contextId: string): OverrideCard[] {
  const cards: OverrideCard[] = []
  if (hasContextBoxDelta(state.all)) cards.push({ kind: 'all', delta: state.all })
  const layer = state.layers[contextId]
  if (hasContextBoxDelta(layer)) cards.push({ kind: 'layer', delta: layer })
  const jamoLayer = state.jamo[contextId] ?? {}
  for (const group of GROUP_ORDER) {
    const order = jamoChoicesFor(partOfGroup[group])
    const entries = Object.entries(jamoLayer)
      .flatMap(([key, delta]) => key.startsWith(`${group}:`) && hasContextBoxDelta(delta) ? [{ jamo: key.slice(group.length + 1), delta }] : [])
      .sort((a, b) => order.indexOf(a.jamo) - order.indexOf(b.jamo))
    for (const entry of entries) cards.push({ kind: 'jamo', group, jamo: entry.jamo, delta: entry.delta })
  }
  return cards
}

export const targetOfCard = (card: OverrideCard, contextId: string): LayoutDeltaTarget =>
  card.kind === 'all' ? { scope: 'all' } : card.kind === 'layer' ? { scope: 'layer', contextId } : { scope: 'jamo', contextId, jamos: [jamoKeyOf(partOfGroup[card.group], card.jamo)] }

/**
 * 범위 띠의 칩. 앞의 둘은 늘 있다(`이 레이아웃` · `이 자모만`(자모 고르기 문)). 그 뒤에 자모 칩이 부품 순·자모 순으로 붙는다.
 * 자모 칩 = 저장된 것 + 지금 고른 것(아직 저장 전). `delta`가 있으면 찬 칩(요약·×), 없으면 빈 칩.
 * `전체`는 **고를 수 없다.** 한 문맥에서 잡은 변 Δ는 다른 홀자 계열에서 뜻이 달라진다(오른변이 홀자 경계이기도 글자 테두리이기도 하다).
 * 예전에 저장된 전체 Δ가 있을 때만 읽기 전용 칩으로 남아 무엇이 얹혀 있는지 보이고 ×로 지울 수 있다.
 */
export type ScopeChip =
  | { kind: 'layer'; delta: ContextBoxDelta | null }
  | { kind: 'all'; delta: ContextBoxDelta }
  | { kind: 'picker' }
  | { kind: 'jamo'; group: OverrideGroup; jamo: string; delta: ContextBoxDelta | null }

export function scopeChipsOf(cards: OverrideCard[], picked: { group: OverrideGroup; jamos: string[] } | null): ScopeChip[] {
  const storedAll = cards.find((card) => card.kind === 'all')?.delta ?? null
  const chips: ScopeChip[] = [
    { kind: 'layer', delta: cards.find((card) => card.kind === 'layer')?.delta ?? null },
    { kind: 'picker' },
    ...(storedAll ? [{ kind: 'all' as const, delta: storedAll }] : []),
  ]
  for (const group of GROUP_ORDER) {
    const saved = cards.flatMap((card) => card.kind === 'jamo' && card.group === group ? [card] : [])
    const extra = picked?.group === group ? picked.jamos.filter((jamo) => !saved.some((card) => card.jamo === jamo)) : []
    const order = jamoChoicesFor(partOfGroup[group])
    const merged = [...saved.map((card) => ({ jamo: card.jamo, delta: card.delta as ContextBoxDelta | null })), ...extra.map((jamo) => ({ jamo, delta: null }))]
      .sort((a, b) => order.indexOf(a.jamo) - order.indexOf(b.jamo))
    for (const entry of merged) chips.push({ kind: 'jamo', group, jamo: entry.jamo, delta: entry.delta })
  }
  return chips
}
