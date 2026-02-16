import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium transition-all duration-150 ease-in-out cursor-pointer disabled:pointer-events-none disabled:opacity-50',
  {
    variants: {
      variant: {
        default:
          'bg-surface-2 text-text-dim-1 border border-border hover:bg-surface-hover hover:text-foreground',
        primary:
          'bg-primary text-primary-foreground border border-primary hover:bg-primary-dark',
        blue:
          'bg-accent-blue text-white border border-accent-blue hover:bg-accent-blue-hover',
        ghost:
          'bg-transparent text-text-dim-4 hover:bg-surface-2 hover:text-foreground border border-transparent',
        danger:
          'bg-danger-dark text-text-dim-1 border border-danger hover:bg-danger hover:text-foreground',
        green:
          'bg-accent-green-dark text-text-dim-1 border border-accent-green hover:bg-accent-green hover:text-foreground',
        outline:
          'bg-transparent text-text-dim-1 border border-border-light hover:bg-surface-3 hover:text-foreground',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-7 px-3 text-xs',
        lg: 'h-10 px-6',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

// eslint-disable-next-line react-refresh/only-export-components
export { Button, buttonVariants }
