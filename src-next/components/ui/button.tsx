import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * shadcn Button. 색 · 크기는 앱 토큰(`src/index.css`)만 쓴다. 화면에서 `className`으로는 배치(여백 · 너비)만 바꾼다.
 * 공용 모양(10-03 G2): 크기 `sheet`(시트 아래 큰 단추) · `icon-md`(40 둥근 아이콘) · `block`(꽉 찬 큰 단추) · 강조 `chip` + 크기 `chip`/`chip-sm`(고르면 검정, aria-selected · aria-pressed · aria-checked 아무거나).
 * 우리 것: `plain`(투명 · 글자색 그대로) · `quiet`(투명 · 옅은 글자) · `link`(밑줄 글자) · `faint`(더 옅은 글자, 되돌리기) · `soft`(옅은 알약, `data-highlight`면 주색) / `icon-lg`(44 둥근 아이콘) · `row`(목록 줄).
 */
/* eslint-disable react-refresh/only-export-components -- 표와 cva는 검토판 · 확인 창이 같이 쓴다 */
/** 모든 단추에 붙는 바탕. 스타일가이드 검토판이 변형마다 이 값과 아래 표로 지문을 만든다. */
export const BUTTON_BASE = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 [&_svg]:size-4 [&_svg]:shrink-0'

/** 강조(색 · 글자). */
export const BUTTON_VARIANTS = {
  default: 'bg-foreground text-surface hover:bg-foreground/90 disabled:bg-surface-3 disabled:text-text-dim-5 disabled:opacity-100',
  primary: 'bg-primary text-primary-foreground hover:bg-primary-dark',
  secondary: 'bg-secondary text-secondary-foreground hover:bg-surface-4',
  outline: 'border border-border bg-surface text-text-dim-2 hover:bg-surface-hover',
  ghost: 'text-text-dim-3 hover:bg-surface-3 hover:text-foreground',
  destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive-dark',
  plain: 'bg-transparent text-foreground active:bg-surface-2',
  quiet: 'bg-transparent font-normal text-text-dim-4',
  link: 'bg-transparent font-semibold text-text-dim-4 underline underline-offset-[3px]',
  faint: 'bg-transparent font-medium text-text-dim-5',
  chip: 'rounded-full bg-surface-2 font-bold text-text-dim-3 aria-selected:bg-foreground aria-selected:text-surface aria-pressed:bg-foreground aria-pressed:text-surface aria-checked:bg-foreground aria-checked:text-surface',
  soft: 'rounded-full bg-surface-2 font-bold text-text-dim-2 data-[highlight]:bg-primary-light data-[highlight]:text-primary',
} as const

/** 크기(높이 · 여백 · 글자 크기 · 모서리). */
export const BUTTON_SIZES = {
  default: 'h-9 px-4',
  sm: 'h-8 gap-1.5 px-3 text-13 [&_svg]:size-3.5',
  lg: 'h-11 px-6',
  icon: 'h-9 w-9',
  'icon-md': 'size-10 rounded-full p-0 [&_svg]:size-5',
  'icon-lg': 'size-11 rounded-full [&_svg]:size-6',
  block: 'min-h-12 w-full rounded-md px-4 text-16 font-bold',
  sheet: 'min-h-14 rounded-xl px-4 text-18 font-bold transition-transform active:scale-[.97] [&_svg]:size-5',
  chip: 'h-[34px] px-[13px] text-13',
  'chip-sm': 'h-7 gap-1 px-2.5 text-11',
  row: 'min-h-14 w-full justify-start rounded-none px-0 text-left text-16 [&_svg]:size-5',
} as const

export const buttonVariants = cva(BUTTON_BASE, {
  variants: { variant: BUTTON_VARIANTS, size: BUTTON_SIZES },
  defaultVariants: { variant: 'default', size: 'default' },
})
/* eslint-enable react-refresh/only-export-components */

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  // data-slot · data-variant · data-size: 스타일가이드 미리보기가 화면에서 이 단추를 찾는 표시. 생김새와 무관.
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} data-slot="button" data-variant={variant ?? 'default'} data-size={size ?? 'default'} {...props} />
})
Button.displayName = 'Button'
