import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * shadcn Button. 색 · 크기는 앱 토큰(`src/index.css`)만 쓴다. 화면에서 `className`으로는 배치(여백 · 너비)만 바꾼다.
 * 우리 것: `plain`(투명 · 글자색 그대로) · `quiet`(투명 · 옅은 글자) · `link`(밑줄 글자) · `faint`(더 옅은 글자, 되돌리기) · `soft`(옅은 알약, `data-highlight`면 주색) / `icon-lg`(44 둥근 아이콘) · `row`(목록 줄).
 */
// eslint-disable-next-line react-refresh/only-export-components -- 확인 창 단추가 같은 모양을 쓴다
export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-semibold transition-colors cursor-pointer disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default: 'bg-foreground text-surface hover:bg-foreground/90',
        primary: 'bg-primary text-primary-foreground hover:bg-primary-dark',
        secondary: 'bg-secondary text-secondary-foreground hover:bg-surface-4',
        outline: 'border border-border bg-surface text-text-dim-2 hover:bg-surface-hover',
        ghost: 'text-text-dim-3 hover:bg-surface-3 hover:text-foreground',
        destructive: 'bg-destructive text-destructive-foreground hover:bg-destructive-dark',
        plain: 'bg-transparent text-foreground active:bg-surface-2',
        quiet: 'bg-transparent font-normal text-text-dim-4',
        link: 'bg-transparent font-semibold text-text-dim-4 underline underline-offset-[3px]',
        faint: 'bg-transparent font-medium text-text-dim-5',
        soft: 'rounded-full bg-surface-2 font-bold text-text-dim-2 data-[highlight]:bg-primary-light data-[highlight]:text-primary',
      },
      size: {
        default: 'h-9 px-4',
        sm: 'h-8 gap-1.5 px-3 text-13 [&_svg]:size-3.5',
        lg: 'h-11 px-6',
        icon: 'h-9 w-9',
        'icon-lg': 'size-11 rounded-full [&_svg]:size-6',
        row: 'min-h-14 w-full justify-start rounded-none px-0 text-left text-16 [&_svg]:size-5',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild = false, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size, className }))} ref={ref} {...props} />
})
Button.displayName = 'Button'
