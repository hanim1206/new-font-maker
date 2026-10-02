import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * 하나만 고르는 단추 묶음(`role="radiogroup"` · `role="radio"`). shadcn ToggleGroup은 `aria-pressed`라서 고르기 의미가 다르다 — 그래서 우리 것.
 * `tile`: 그림 + 이름 칸(붓 · 부리 모양), 크기 `default` · `sm`. `segment`: 회색 길 위 흰 알약. `pill`: 고른 것만 검정 알약.
 * 배치(열 수 · 간격)는 화면이 `className`으로 정한다.
 */
const groupVariants = cva('', {
  variants: {
    variant: {
      tile: '',
      segment: 'flex gap-0.5 rounded-md bg-surface-3 p-0.5',
      pill: 'flex gap-1',
    },
  },
  defaultVariants: { variant: 'tile' },
})

const itemVariants = cva('min-w-0 cursor-pointer border-0 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-default disabled:opacity-50', {
  variants: {
    variant: {
      tile: 'flex flex-col items-center justify-center bg-transparent aria-checked:text-foreground',
      segment: 'flex-1 min-h-8 rounded-sm bg-transparent text-11 font-semibold text-text-dim-4 aria-checked:bg-surface aria-checked:text-foreground aria-checked:shadow-[0_1px_2px_rgb(15_23_42/0.12)]',
      pill: 'min-h-[25px] truncate rounded-full bg-transparent px-2.5 text-11 font-bold text-text-dim-4 aria-checked:bg-foreground aria-checked:text-surface',
    },
    size: {
      default: '',
      sm: '',
    },
  },
  compoundVariants: [
    {
      variant: 'tile', size: 'default',
      className: 'gap-1.5 rounded-lg pb-2.5 pt-3 text-text-dim-5 aria-checked:bg-surface-2 [&_strong]:text-13 [&_strong]:font-semibold [&_strong]:text-text-dim-4 [&[aria-checked=true]_strong]:font-extrabold [&[aria-checked=true]_strong]:text-foreground',
    },
    {
      variant: 'tile', size: 'sm',
      className: 'min-h-[72px] gap-0.5 rounded-md px-0.5 py-1 text-10 font-semibold text-text-dim-4 aria-checked:bg-surface-3 [&_svg]:size-[38px] [&_svg]:fill-text-dim-4 [&[aria-checked=true]_svg]:fill-foreground [&_span]:max-w-full [&_span]:truncate',
    },
  ],
  defaultVariants: { variant: 'tile', size: 'default' },
})

type ChoiceVariants = VariantProps<typeof itemVariants>
const ChoiceContext = React.createContext<ChoiceVariants>({})

export function ChoiceGroup({ variant, size, className, ...props }: React.HTMLAttributes<HTMLDivElement> & ChoiceVariants & { 'aria-label': string }) {
  return <ChoiceContext.Provider value={{ variant, size }}>
    <div role="radiogroup" className={cn(groupVariants({ variant }), className)} {...props} />
  </ChoiceContext.Provider>
}

export const ChoiceItem = React.forwardRef<HTMLButtonElement, Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'role'> & { checked: boolean }>(
  ({ checked, className, ...props }, ref) => {
    const variants = React.useContext(ChoiceContext)
    return <button ref={ref} type="button" role="radio" aria-checked={checked} className={cn(itemVariants(variants), className)} {...props} />
  },
)
ChoiceItem.displayName = 'ChoiceItem'
