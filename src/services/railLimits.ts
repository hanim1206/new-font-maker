import { REFERENCE_BODY_PADDING } from './designBodyPlacement'
import type { ComponentFaces } from './notoComponentFit'
import type { MedialFitResult } from './notoMedialMasterFit'

/**
 * 보선 한계. 어느 화면에서 옮기든(획 편집 끌기 · 레이아웃 편집 끌기 · 칸 풀기) 같은 판정을 지난다.
 * - 글자 몸 안: 잉크 칸이 기본 네모꼴(노토 몸통 840 × 910) 밖으로 못 나간다. 모델이 이미 몸 밖에 둔 자리는 거기까지 둔다.
 * - 순서: 서로 닿을 수 있는 보선끼리 자리가 뒤집히지 않는다.
 * - 두께 간격: 그 보선끼리 획 두께만큼 떨어진다. 모델이 원래 더 가깝게 둔 쌍은 그 거리까지.
 * 판정을 못 지나는 값은 버리지 않고 `furthestValid`로 경계까지 줄인다 — 튀어 나간 저장 Δ도 경계에서 멈춰 보인다.
 *
 * 플랜: docs/plans/2026-09-29_홀자-줄기-끝점-보선.md (보선 한계 · 역할)
 */

/** 글자 몸(모델 em 좌표). 모델 좌표가 곧 기본 네모꼴 기준이다(`designBodyPlacement`). */
export const GLYPH_BODY: ComponentFaces = {
  left: REFERENCE_BODY_PADDING.left,
  right: 1 - REFERENCE_BODY_PADDING.right,
  top: REFERENCE_BODY_PADDING.top,
  bottom: 1 - REFERENCE_BODY_PADDING.bottom,
}

const EPSILON = 1e-6
/** 같은 자리로 보는 보선(0.1u). */
const TIE = 1e-4

/** 글자 몸을 모델 자리까지 넓힌다. 모델이 이미 몸 밖이면 그 자리는 허용한다. */
export function bodyAround(faces?: ComponentFaces): ComponentFaces {
  if (!faces) return { ...GLYPH_BODY }
  return {
    left: Math.min(GLYPH_BODY.left, faces.left),
    right: Math.max(GLYPH_BODY.right, faces.right),
    top: Math.min(GLYPH_BODY.top, faces.top),
    bottom: Math.max(GLYPH_BODY.bottom, faces.bottom),
  }
}

/** 네 변이 몸 안인지. */
export function facesInside(faces: ComponentFaces, body: ComponentFaces): boolean {
  return faces.left >= body.left - EPSILON && faces.right <= body.right + EPSILON && faces.top >= body.top - EPSILON && faces.bottom <= body.bottom + EPSILON
}

/** 닿자 상자 네 변의 한계. 몸 안이고 폭 · 높이가 남는다. `model`은 Δ 없는 모델 변(몸 밖 허용 범위). */
export function faceLimitIssue(model: ComponentFaces, moved: ComponentFaces): string | null {
  if (!facesInside(moved, bodyAround(model))) return '글자 몸 밖으로 나갈 수 없습니다.'
  if (moved.right - moved.left <= EPSILON || moved.bottom - moved.top <= EPSILON) return '상자 변이 뒤집힙니다.'
  return null
}

/**
 * 홀자 fit의 한계. `base`는 Δ 전 fit(순서 · 간격의 기준), `moved`는 Δ를 얹어 다시 놓은 fit(`applyRailEdits` 결과).
 * 순서 · 간격은 서로 닿을 수 있는 보선 쌍만 본다 — 나란한 두 획의 중심, 획 중심과 그 축을 가로지르는 획의 끝, 한 획의 두 끝.
 * 서로 다른 기둥의 끝끼리(계의 안 · 바깥 기둥 아래 끝)는 잉크가 안 만나 보지 않는다. 간격은 그 쌍에 든 획의 두께다.
 * 보선 값은 기준 틀 em이다. 사용자 네모꼴이 기준과 다르면 `bodyScale`(축마다 기준 1em이 화면에서 몇 em인지)을 준다 —
 * 두께는 네모꼴을 따라 줄지 않으니, 화면에서 두께만큼 떨어지려면 기준 틀에서는 `두께 ÷ 배율`만큼 떨어져야 한다.
 * 통과하면 null, 아니면 이유.
 */
export function medialLimitIssue(base: MedialFitResult, moved: MedialFitResult, bodyScale?: { x: number; y: number }): string | null {
  const slot = (fit: MedialFitResult): ComponentFaces => ({ left: fit.slot.x, right: fit.slot.x + fit.slot.width, top: fit.slot.y, bottom: fit.slot.y + fit.slot.height })
  if (!facesInside(slot(moved), bodyAround(slot(base)))) return '글자 몸 밖으로 나갈 수 없습니다.'
  for (const [first, second, thickness, axis] of limitPairs(base)) {
    if (!(first in moved.railsEm) || !(second in moved.railsEm)) continue
    const baseGap = base.railsEm[second] - base.railsEm[first]
    // 모델이 같은 자리에 둔 쌍(보에 붙은 끝 등)은 순서가 없다 — 겹침만 막을 이유가 없다.
    if (baseGap <= TIE) continue
    const gap = moved.railsEm[second] - moved.railsEm[first]
    if (gap < Math.min(baseGap, thickness / (bodyScale?.[axis] ?? 1)) - EPSILON) return gap < 0 ? `${first}와 ${second}의 순서가 뒤집힙니다.` : `${first}와 ${second} 사이가 두께보다 좁습니다.`
  }
  return null
}

/** 서로 닿을 수 있는 보선 쌍(모델 자리 순서로 앞 · 뒤)과 지켜야 할 두께, 그 쌍이 놓인 축. */
function limitPairs(base: MedialFitResult): [string, string, number, 'x' | 'y'][] {
  const pairs = new Map<string, [string, string, number, 'x' | 'y']>()
  const add = (a: string, b: string, thickness: number, axis: 'x' | 'y') => {
    if (a === b) return
    const [first, second] = base.railsEm[a] <= base.railsEm[b] ? [a, b] : [b, a]
    const key = `${first}|${second}`
    const current = pairs.get(key)
    if (!current || current[2] < thickness) pairs.set(key, [first, second, thickness, axis])
  }
  const bindings = base.bindings
  for (const one of bindings) {
    // 세로 획은 중심이 가로 자리(x), 두 끝이 세로 자리(y)다. 가로 획은 거꾸로.
    const centerAxis = one.orientation === 'vertical' ? 'x' : 'y'
    const lengthAxis = one.orientation === 'vertical' ? 'y' : 'x'
    add(one.fromRail, one.toRail, one.thickness, lengthAxis)
    for (const other of bindings) {
      if (other === one) continue
      // 나란한 두 획(두 보 · 두 기둥)의 중심.
      if (other.orientation === one.orientation) add(one.centerRail, other.centerRail, Math.max(one.thickness, other.thickness), centerAxis)
      // 한 획의 중심과 가로지르는 획의 두 끝(곁줄기 높이 ↔ 기둥 위 · 아래 끝).
      else { add(one.centerRail, other.fromRail, one.thickness, centerAxis); add(one.centerRail, other.toRail, one.thickness, centerAxis) }
    }
  }
  return [...pairs.values()]
}

/**
 * `from`(한계 안)에서 `to` 쪽으로 갈 수 있는 가장 먼 값. 한계는 한 방향으로 넘으면 계속 넘는다고 보고 반씩 좁혀 찾는다.
 * `to`가 한계 안이면 그대로.
 */
export function furthestValid(from: number, to: number, valid: (value: number) => boolean, tolerance = 1e-5): number {
  if (valid(to)) return to
  let inside = from
  let outside = to
  for (let round = 0; round < 40 && Math.abs(outside - inside) > tolerance; round += 1) {
    const middle = (inside + outside) / 2
    if (valid(middle)) inside = middle
    else outside = middle
  }
  return inside
}
