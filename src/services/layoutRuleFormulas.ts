import type { JamoShapeFeatures } from './jamoShapeFeatures'

/**
 * 배치 규칙 "표를 공식으로" G0 — 자모별로 외운 값 대신 생김새 특징에서 자리를 낸다.
 * 계수는 `layoutRuleTargets.ts` 표(모델 잉크 가운데값)에 최소제곱으로 맞춘 것이다(`scripts/layout-rules/measure-shape-fit.ts`).
 * 588자 채점에서 표와 같은 점수를 낸 열만 여기 둔다. 윗면 · 두 기둥 옆 폭 · 틈 · 받침 아랫면 · 받침 윗면 치우침은 자모 하나씩 빼고 맞혀 보면 괜찮았지만
 * 588자에서는 표의 다른 잔차와 겹쳐 ±0.02를 넘는 글자가 늘어 아직 표다(2026-11-09 진행 기록).
 */

/** 첫닿자가 받침 없을 때 앉는 아래(몸 em). 바닥이 평평하면(ㄴ ㄷ ㅁ ㅂ ㅌ ㅍ) 낮게 앉고, 뾰족하거나 둥글면(ㄱ ㅅ ㅈ ㅇ) 조금 띄운다. 표본 안 오차 가운데 0.006, 최대 0.019. */
export const choBottomNoFinal = (cho: JamoShapeFeatures): number => 0.811 - 0.0738 * cho.bottomFlat
