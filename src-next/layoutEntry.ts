/**
 * 레이아웃 화면에 들어올 때 보선 자리와 그 뒤 손댄 rail.
 * 상시 저장이라 편집기의 `original`은 놓을 때마다 방금 자리로 바뀐다. 주황 띠 · Δ 숫자는 여기 적힌 들어올 때 자리에서 재고,
 * 손댄 rail에만 그린다(저장으로 따라 움직인 변은 안 그린다). 호출자가 글자 · 모드마다 새 것을 주면 되돌리기로 편집기가 다시 열려도 기준이 남는다.
 */
export interface LayoutEntry {
  baseline: Map<string, number>
  touched: Set<string>
}

export const newLayoutEntry = (): LayoutEntry => ({ baseline: new Map(), touched: new Set() })
