import type { JamoShapeFeatures } from './jamoShapeFeatures'

/**
 * 배치 규칙 "표를 공식으로" G0 — 자모별로 외운 값 대신 생김새 특징에서 자리를 낸다.
 * 계수는 `layoutRuleTargets.ts` 표(모델 잉크 가운데값)에 최소제곱으로 맞춘 것이다(`scripts/layout-rules/measure-shape-fit.ts`).
 * 588자 채점에서 표와 같은 점수를 낸 열만 여기 둔다. 윗면 · 두 기둥 옆 폭 · 틈 · 받침 아랫면 · 받침 윗면 치우침은 자모 하나씩 빼고 맞혀 보면 괜찮았지만
 * 588자에서는 표의 다른 잔차와 겹쳐 ±0.02를 넘는 글자가 늘어 아직 표다(2026-11-09 진행 기록).
 */

/** 첫닿자가 받침 없을 때 앉는 아래(몸 em). 바닥이 평평하면(ㄴ ㄷ ㅁ ㅂ ㅌ ㅍ) 낮게 앉고, 뾰족하거나 둥글면(ㄱ ㅅ ㅈ ㅇ) 조금 띄운다. 표본 안 오차 가운데 0.006, 최대 0.019. */
export const choBottomNoFinal = (cho: JamoShapeFeatures): number => 0.811 - 0.0738 * cho.bottomFlat

/**
 * 받침이 없을 때 첫닿자 윗면이 표(받침 있는 글자에서 잰 윗면)보다 내려오는 양(몸 em, + = 아래).
 * 받침이 없으면 첫닿자가 아래로 길어지는데(아래는 `choBottomNoFinal`) 위는 같이 안 올라가고 조금 내려온다.
 * 꼭지가 있으면(ㅊ ㅎ) 덜 내려오고, 바닥이 평평할수록 덜 내려온다(ㅋ 0.049 · ㄱ 0.043 · ㅁ 0.032 · ㅎ 0.013).
 * 받침 없는 95자(첫닿자 19 × ㅏㅑㅓㅕㅣ) 모델 잉크 가운데값에 맞춤. 자모 하나 빼고 맞히면 19/19가 ±0.01 안(최대 0.009).
 */
export const choTopDropNoFinal = (cho: JamoShapeFeatures): number => 0.0436 - 0.0211 * (cho.topDot ? 1 : 0) - 0.0111 * cho.bottomFlat
/** 생김새 특징이 없을 때 쓰는 내려오는 양(열아홉 자 가운데값). */
export const CHO_TOP_DROP_NO_FINAL = 0.0335

/**
 * 홀자 가로 자리(2026-11-09, 사용자 관찰 "가로줄기가 뻗은 쪽으로 홀자가 간다"에서).
 * 홀자를 가지 모양 넷으로 나누면 아홉 홀자 표가 갈래 넷으로 줄어든다. 문장으로는
 * "기둥이 하나면 가지 반대쪽으로 조금 비켜서고, 기둥이 둘이면 기둥 틀은 그대로 두고 가지만 밖으로 나간다".
 * (노토 588자: 오른 기둥 오른면 ㅐㅒ 0.814 · ㅔㅖ 0.813 · ㅓㅕ 0.790 — ㅔㅖ는 왼끝만 왼가지처럼 0.10 더 나간다.)
 * ㅣ(가지 없음) 기둥 오른면 0.778을 기준으로 오른가지(ㅏ ㅑ)는 −0.040, 왼가지(ㅓ ㅕ)는 +0.012, 두 기둥(ㅐ ㅒ ㅔ ㅖ)은 오른 기둥이 +0.036.
 * 값(몸 em)은 표의 같은 갈래 가운데값이다 — 방향은 우리 관찰, 양은 아직 노토에서 잰 값.
 */
export type VowelBranchKind = 'right' | 'none' | 'left' | 'twoStem'
export const vowelBranchKindOf = (jung: string): VowelBranchKind | null =>
  'ㅏㅑ'.includes(jung) ? 'right' : jung === 'ㅣ' ? 'none' : 'ㅓㅕ'.includes(jung) ? 'left' : 'ㅐㅒㅔㅖ'.includes(jung) ? 'twoStem' : null
/** 가장 오른 기둥의 오른면. */
export const PILLAR_RIGHT: Record<VowelBranchKind, number> = { none: 0.778, right: 0.738, left: 0.790, twoStem: 0.814 }
/** 오른가지가 기둥 밖으로 나오는 길이. */
export const RIGHT_BRANCH_OUT = 0.144
/** 두 기둥 홀자(가지가 오른쪽인 ㅐ ㅒ)의 왼 기둥 왼면 ~ 오른 기둥 오른면 폭. */
export const TWO_STEM_SPAN = 0.276
/** 쌍자음 옆에서 홀자 왼면이 오른쪽으로 비켜서는 양 — 기둥 하나면 조금, 기둥 둘이면 더. */
export const DOUBLE_CHO_SHIFT: Record<VowelBranchKind, number> = { none: 0.007, right: 0.007, left: 0.045, twoStem: 0.032 }
/** ㅔ ㅖ: 왼 기둥이 밀린 만큼 오른 기둥이 따라가는 비율. */
export const TWO_STEM_FOLLOW = 0.11

/**
 * 왼가지 끝 자리(2026-11-09, 사용자 관찰 "닿자 오른쪽이 막혔으면 붙고, 뚫렸으면 띄운다"에서).
 * 가지 끝 − 첫닿자 오른면(몸 em). 오른쪽이 위부터 막힌 자음(ㄱ ㅁ ㅂ ㅇ ㄷ …)은 가지가 오른면에 살짝 걸치고,
 * 오른쪽 위가 빈 자음(ㄴ ㅅ)은 가지가 그 빈 자리로 더 파고든다 — 그래도 같은 높이에 잉크가 없어 틈은 크게 남는다.
 * 19 첫닿자 하나 빼고 맞추기 ±0.02 안 13/19. 남는 것: ㄹ ㅌ(가로줄기 끝과 맞서 띄움) · ㅆ.
 */
export const BRANCH_INSET_BASE = -0.0243
export const BRANCH_INSET_SKY = -0.0778
export const branchInsetOf = (f: Pick<JamoShapeFeatures, 'rightTop'>): number => BRANCH_INSET_BASE + BRANCH_INSET_SKY * f.rightTop

/**
 * 두 기둥 홀자 옆 첫닿자 폭(2026-11-09, 사용자 관찰 "ㅔ ㅖ는 홀자 왼면이 더 왼쪽"에서).
 * 홀자 기둥이 둘(ㅐ ㅒ ㅔ ㅖ)이면 홀자가 자리를 더 차지해 첫닿자 오른면이 이만큼(몸 em) 안으로 들어온다.
 * ㅔ ㅖ의 가지는 첫닿자 오른면을 따라가므로 같이 왼쪽으로 간다. 양은 외운 표의 두 기둥 가운데값.
 */
export const TWO_STEM_CHO_NARROW = 0.093

/**
 * 첫닿자 양옆 들임(2026-11-09, 사용자 질문 "ㅓㅕㅔㅖ 왼면 오차는 홀자만의 것인가"에서 — 답은 첫닿자 폭이었다).
 * 가장자리에 세로벽이 선 홑닿자(ㄱ ㄴ ㄷ ㄹ ㅁ ㅂ ㅋ ㅌ)는 꽉 차 보여 왼면을 `CHO_WALL_LEFT`만큼 들이고,
 * 오른쪽이 위부터 막혔으면 오른면도 `CHO_WALL_RIGHT`만큼 들인다(오른쪽 위가 빈 ㄴ은 오른면을 두고 홀자 가지가 파고든다).
 * 빗줄기 · 꼭지 · 동그라미 닿자(ㅅ ㅈ ㅊ ㅎ ㅇ)와 ㅍ은 그대로. 쌍닿자는 두 자모가 나눠 쓰느라 오른면을 `CHO_DOUBLE_RIGHT`만큼 더 낸다.
 * 19 첫닿자 표 잔차(가운데값)에서 벽 있는 10자는 양면 모두 ±0.02 안.
 */
export const CHO_WALL_LEFT = 0.045
export const CHO_WALL_RIGHT = 0.055
export const CHO_DOUBLE_LEFT = 0.015
export const CHO_DOUBLE_RIGHT = 0.045
const DOUBLE_CHO: ReadonlySet<string> = new Set(['ㄲ', 'ㄸ', 'ㅃ', 'ㅆ', 'ㅉ'])
/** 세로벽: 왼띠나 오른띠 절반 넘게 잉크가 서 있고 동그라미가 아니다(ㅁ은 벽, ㅇ은 아님). */
export const hasChoWall = (f: Pick<JamoShapeFeatures, 'leftClosed' | 'rightClosed' | 'round'>): boolean => !f.round && Math.max(f.leftClosed, f.rightClosed) >= 0.5
/** 첫닿자 왼면 · 오른면을 안으로 들일 양(몸 em, +면 안쪽). */
export function choSideInsetOf(cho: string, f: Pick<JamoShapeFeatures, 'leftClosed' | 'rightClosed' | 'round' | 'rightTop'>): { left: number; right: number } {
  if (DOUBLE_CHO.has(cho)) return { left: CHO_DOUBLE_LEFT, right: -CHO_DOUBLE_RIGHT }
  if (!hasChoWall(f)) return { left: 0, right: 0 }
  return { left: CHO_WALL_LEFT, right: CHO_WALL_RIGHT * (1 - f.rightTop) }
}

/**
 * 첫닿자 아랫면을 바닥 모양으로 올리기(2026-11-09, 사용자 관찰 "하단이 막혀 있는 닿자와 뚫려 있는 닿자의 높이 차이"에서).
 * 바닥이 가로줄기로 막힌 닿자(ㄴ ㄷ ㄹ ㅁ ㅂ ㅌ ㅍ)는 노토가 더 위에서 끝내고, 세로줄기 끝만 내려오는 ㄱ ㅋ ㄲ은 거의 그대로 둔다.
 * 올림(몸 em) = 받침 없으면 0.015 + 0.077 × 바닥 너비(bottomFlat, 19/19 ±0.02), 받침 있으면 바닥 너비 몫 0.061 × 바닥 너비만(받침별 몫은 아직).
 */
export const CHO_LIFT_NO_FINAL_BASE = 0.015
export const CHO_LIFT_NO_FINAL_FLAT = 0.077
export const CHO_LIFT_FINAL_FLAT = 0.061
export const choBottomLiftOf = (f: Pick<JamoShapeFeatures, 'bottomFlat'>, hasFinal: boolean): number =>
  hasFinal ? CHO_LIFT_FINAL_FLAT * f.bottomFlat : CHO_LIFT_NO_FINAL_BASE + CHO_LIFT_NO_FINAL_FLAT * f.bottomFlat
