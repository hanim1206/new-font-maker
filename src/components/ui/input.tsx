import * as React from 'react'
import { cn } from '@/lib/utils'

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          'flex w-full rounded-md bg-surface border border-border px-3 py-2 text-sm text-foreground shadow-sm transition-colors duration-fast ease-standard',
          'placeholder:text-text-dim-5',
          'focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/10',
          'disabled:cursor-not-allowed disabled:opacity-50',
          type === 'number' && 'font-mono text-sm',
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Input.displayName = 'Input'

export { Input }
