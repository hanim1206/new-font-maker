import * as React from 'react'
import { cn } from '@/lib/utils'

/** shadcn Input. 틀린 칸은 `aria-invalid`로 빨간 테두리. */
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    ref={ref}
    className={cn(
      'flex h-9 w-full min-w-0 rounded-md border border-border bg-surface px-3 text-sm text-foreground transition-colors placeholder:text-text-dim-5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 aria-[invalid=true]:border-[rgb(214_69_65)] [&::-webkit-search-cancel-button]:hidden',
      className
    )}
    {...props}
  />
))
Input.displayName = 'Input'
