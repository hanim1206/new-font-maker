import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * 조절 항목 한 줄과 채움 막대. shadcn Slider 대신 `<input type="range">`를 그대로 쓴다 — 끌기는 `rangeDrag.ts`가 직접 계산하고
 * (손잡이 너비 22px와 맞춘다), 키보드 · 접근성 · 테스트의 `fill()`은 기본 입력 그대로다.
 */

/** 항목 머리: 왼쪽 회색 이름, 오른쪽 굵은 값. 아래에 막대 · 각도판 같은 조절이 온다. 막대면 `<label>`, 아니면 `as="div"`. */
export function Field({ label, value, as = 'label', className, children, ...props }: {
  label: React.ReactNode
  value?: React.ReactNode
  as?: 'label' | 'div'
  className?: string
  children: React.ReactNode
} & Omit<React.HTMLAttributes<HTMLElement>, 'children'>) {
  const Comp = as
  return <Comp className={cn('flex min-w-0 flex-col gap-2 pb-0.5 pt-6', className)} data-slot="field" {...props}>
    <span className="flex items-baseline justify-between text-14 font-semibold text-text-dim-3">
      {label}{value !== undefined && value !== null && <output className="text-18 font-extrabold tabular-nums text-foreground">{value}</output>}
    </span>
    {children}
  </Comp>
}

/** 손잡이 없는 얇은 채움 막대. 보이는 길은 12px, 위아래 투명 테두리 10px까지 눌린다. */
export const RangeBar = React.forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, 'type'>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    type="range"
    data-slot="range-bar"
    className={cn(
      'm-0 box-content h-3 w-full cursor-ew-resize touch-none appearance-none overflow-hidden rounded-full border-y-[10px] border-transparent bg-surface-3 bg-clip-padding',
      'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:cursor-default disabled:opacity-35',
      '[&::-webkit-slider-runnable-track]:h-3 [&::-webkit-slider-runnable-track]:bg-transparent',
      '[&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-[22px] [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-r-full [&::-webkit-slider-thumb]:border-0 [&::-webkit-slider-thumb]:bg-foreground [&::-webkit-slider-thumb]:shadow-[-1000px_0_0_1000px_rgb(var(--color-foreground))]',
      '[&::-moz-range-track]:h-3 [&::-moz-range-track]:bg-transparent [&::-moz-range-progress]:h-3 [&::-moz-range-progress]:rounded-full [&::-moz-range-progress]:bg-foreground',
      '[&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-[22px] [&::-moz-range-thumb]:rounded-r-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-foreground',
      className,
    )}
    {...props}
  />
))
RangeBar.displayName = 'RangeBar'
