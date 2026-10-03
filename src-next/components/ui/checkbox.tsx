import * as React from 'react'
import * as CheckboxPrimitive from '@radix-ui/react-checkbox'
import { Check } from 'lucide-react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const checkboxVariants = cva(
  'peer size-4 shrink-0 cursor-pointer rounded-xs border border-border-light bg-surface transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50',
  {
    variants: {
      tone: {
        primary: 'data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground',
        ink: 'data-[state=checked]:border-foreground data-[state=checked]:bg-foreground data-[state=checked]:text-surface',
      },
    },
    defaultVariants: { tone: 'primary' },
  }
)

/** shadcn Checkbox. 우리 것: `tone="ink"` — 켜면 검정(글로벌 스타일처럼 파랑을 안 쓰는 화면). */
export const Checkbox = React.forwardRef<
  React.ComponentRef<typeof CheckboxPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof CheckboxPrimitive.Root> & VariantProps<typeof checkboxVariants>
>(({ className, tone, ...props }, ref) => (
  <CheckboxPrimitive.Root
    ref={ref}
    className={cn(checkboxVariants({ tone }), className)}
    data-slot="checkbox"
    data-tone={tone ?? 'primary'}
    {...props}
  >
    <CheckboxPrimitive.Indicator className="flex items-center justify-center text-current">
      <Check className="size-3.5" strokeWidth={3} />
    </CheckboxPrimitive.Indicator>
  </CheckboxPrimitive.Root>
))
Checkbox.displayName = CheckboxPrimitive.Root.displayName
