import type { PointerEvent } from 'react'

/**
 * 채움 막대 슬라이더를 브라우저 기본 동작에 기대지 않고 끈다.
 * iOS 사파리의 기본 range는 손잡이를 정확히 잡아야만 끌리는데, 채움 막대는 손잡이가 막대 끝의 22px뿐이라 거의 못 잡는다.
 * 그래서 막대 어디를 눌러도 그 자리 값으로 가고, 누른 채 끌면 따라오게 직접 계산한다. `<input type="range">`는 그대로 둬서 키보드 · 접근성 · 테스트의 `fill()`은 전과 같다.
 */
const THUMB_HALF_PX = 11
const DRAG_FLAG = 'rangeDragging'

function valueAt(input: HTMLInputElement, clientX: number): number {
  const rect = input.getBoundingClientRect()
  const min = Number(input.min || 0)
  const max = Number(input.max || 100)
  const step = Number(input.step || 1) || 1
  const travel = Math.max(rect.width - THUMB_HALF_PX * 2, 1)
  const ratio = Math.max(0, Math.min(1, (clientX - rect.left - THUMB_HALF_PX) / travel))
  const stepped = min + Math.round(ratio * (max - min) / step) * step
  // 0.1 같은 step의 부동소수 꼬리를 자른다.
  const decimals = (String(step).split('.')[1] ?? '').length
  return Number(Math.max(min, Math.min(max, stepped)).toFixed(decimals))
}

/** 누른 자리의 값을 돌려준다. 마우스는 왼쪽 버튼만. 못 쓰는 막대면 null. */
export function startRangeDrag(event: PointerEvent<HTMLInputElement>): number | null {
  const input = event.currentTarget
  if (input.disabled || (event.pointerType === 'mouse' && event.button !== 0)) return null
  input.dataset[DRAG_FLAG] = '1'
  try { input.setPointerCapture(event.pointerId) } catch { /* 합성 이벤트에는 실제 포인터가 없다 */ }
  return valueAt(input, event.clientX)
}

/** 끄는 중이면 지금 자리의 값, 아니면 null. */
export function moveRangeDrag(event: PointerEvent<HTMLInputElement>): number | null {
  const input = event.currentTarget
  return input.dataset[DRAG_FLAG] ? valueAt(input, event.clientX) : null
}

export function endRangeDrag(event: PointerEvent<HTMLInputElement>): void {
  const input = event.currentTarget
  delete input.dataset[DRAG_FLAG]
  if (input.hasPointerCapture(event.pointerId)) input.releasePointerCapture(event.pointerId)
}
