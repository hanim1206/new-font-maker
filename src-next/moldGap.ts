/**
 * 엔진 전체의 획 사이 틈 바닥 — 하나(하니무스 2026-11-22 "획과 획 사이가 붙는 것은 막아야", 바닥 셋 합치기 "ㅇㅇ").
 * 틈 ≥ max(0.025em, 0.2 × 획 굵기). 자소 안 · 자소 사이 · 막힌 속(ㅇ · ㅁ) · 쌓인 획 · 좁은 칸 예산 · 굵기 1 이하 엔진이 모두 이 값을 쓴다.
 * 0.2는 노토 산스 KR 700에서 잰 가장 좁은 틈 ÷ 획 굵기(「늘」 0.21 · 「를」 0.20 · 「빼」 0.16 · 「뿐」 0.15, p5)와 거북이 0.16T 사이,
 * 0.025em은 글줄 42px에서도 흰 틈이 보이는 끝(하니무스 2026-11-21 폰 캡처: 0.02에서 덩어리).
 */
export const ENGINE_GAP_RULE = { least: 0.025, ratio: 0.2 } as const
/** 굵기 `stroke`(em)인 획 사이에 남길 가장 좁은 틈(em). */
export const engineGapOf = (stroke: number) => Math.max(ENGINE_GAP_RULE.least, ENGINE_GAP_RULE.ratio * stroke)
