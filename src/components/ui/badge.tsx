import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center rounded px-2 py-0.5 text-micro font-medium uppercase tracking-wider',
  {
    variants: {
      variant: {
        default: 'bg-surface-3 text-text-dim-2',
        primary: 'bg-primary text-white',
        ch: 'bg-slot-bg-ch text-slot-ch',
        ju: 'bg-slot-bg-ju text-slot-ju',
        'ju-h': 'bg-slot-bg-ju-h text-slot-ju-h',
        'ju-v': 'bg-slot-bg-ju-v text-slot-ju-v',
        jo: 'bg-slot-bg-jo text-slot-jo',
        modified: 'bg-[rgba(255,193,7,0.12)] text-accent-yellow border border-[rgba(255,193,7,0.3)]',
        info: 'bg-[rgba(59,130,246,0.12)] text-accent-blue-tw border border-[rgba(59,130,246,0.3)]',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <span className={cn(badgeVariants({ variant }), className)} {...props} />
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export { Badge, badgeVariants }
