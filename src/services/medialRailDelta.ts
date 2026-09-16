import type { MedialFitResult, StrokeRailBinding } from './notoMedialMasterFit'

/**
 * 홀자 획 역할 rail Δ. 검수 글자 화면의 rail 편집을 다른 글자에 얹을 때 쓴다.
 *
 * Δ는 rail 키(`inner-bottom` 등)가 아니라 **획 역할 + 중심/시작/끝**(`primaryBeam.center`)으로 든다.
 * 같은 보라도 ㅐ는 `inner-bottom`, ㅏ는 `center-y`에 매여 있어 키로 얹으면 엉뚱한 rail이 움직이거나 아무것도 안 움직인다.
 * 칸 해석 함수(`resolveContextBoxes`)와 검수 화면이 같은 규칙으로 얹는다.
 */

export type RailKind = 'center' | 'start' | 'end'
/** 획 역할과 어느 rail인지. 예: `primaryBeam.center`, `outerPillar.end`. 글자가 달라도 같은 획을 가리킨다. */
export type SemanticRailKey = `${string}.${RailKind}`
export type SemanticDelta = Partial<Record<SemanticRailKey, number>>

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

/**
 * 획 역할 Δ(em)를 다른 글자의 rail 값에 얹는다. 그 획이 없는 홀자(ㅑ에 보 없음)는 건너뛰고 개수로 알려준다.
 * 두 역할 키가 이 글자에서 같은 rail로 풀리면(ㅏ의 기둥 중심 = 보 시작) 먼저 온 것만 얹는다.
 */
export function applyMedialDelta(fit: Pick<MedialFitResult, 'railsEm' | 'bindings'>, delta: Readonly<SemanticDelta>): { rails: Record<string, number>; applied: number; skipped: number } {
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
