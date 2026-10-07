import * as React from 'react'
import { cn } from '@/lib/utils'

/**
 * 스위치(켬 · 끔). iOS 토글 크기(51 × 31). 켜면 주색, 끄면 옅은 회색. 우리 것(shadcn switch는 radix 의존성이 없어 안 들임).
 * `checked` · `onCheckedChange`로 쓴다. 모양은 여기서만, 화면에서는 `className`으로 자리만.
 */
export const Switch = React.forwardRef<HTMLButtonElement, Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> & { checked: boolean; onCheckedChange?: (checked: boolean) => void }>(
  ({ className, checked, onCheckedChange, disabled, onClick, ...props }, ref) => (
    <button // style-guard: allow 공용 부품 자체
      ref={ref}
      type="button"
      role="switch"
      aria-checked={checked}
      data-slot="switch"
      data-state={checked ? 'checked' : 'unchecked'}
      disabled={disabled}
      className={cn('relative inline-flex h-[31px] w-[51px] shrink-0 cursor-pointer items-center rounded-full bg-surface-4 p-0 transition-colors data-[state=checked]:bg-primary disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30', className)}
      onClick={(event) => { onClick?.(event); if (!event.defaultPrevented) onCheckedChange?.(!checked) }}
      {...props}
    >
      <span aria-hidden="true" className="block size-[27px] rounded-full bg-surface shadow-md transition-transform duration-200 data-[state=checked]:translate-x-[22px] data-[state=unchecked]:translate-x-[2px]" data-state={checked ? 'checked' : 'unchecked'} />
    </button>
  ),
)
Switch.displayName = 'Switch'
