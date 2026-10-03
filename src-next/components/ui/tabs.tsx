import * as React from 'react'
import * as TabsPrimitive from '@radix-ui/react-tabs'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

/**
 * shadcn Tabs. 변형은 `TabsList`에 한 번 주면 안의 `TabsTrigger`가 따른다.
 * 우리 것: `underline`(글자만, 고른 것에 밑줄) · `dock`(화면 바닥에 붙은 회색 길 위 흰 알약, 그림 위 · 이름 아래, 잠긴 탭은 `<small>` 안내).
 */
export const Tabs = TabsPrimitive.Root

const listVariants = cva('', {
  variants: {
    variant: {
      default: 'inline-flex h-9 items-center justify-center rounded-lg bg-surface-3 p-1 text-text-dim-4',
      underline: 'flex gap-[18px] border-b border-border-subtle',
      dock: 'fixed bottom-[calc(env(safe-area-inset-bottom)+12px)] left-1/2 z-20 flex w-[min(calc(100%-48px),432px)] -translate-x-1/2 rounded-xl bg-surface-3 p-[3px] shadow-[0_-12px_24px_8px_rgb(var(--color-surface))]',
    },
  },
  defaultVariants: { variant: 'default' },
})

const triggerVariants = cva(
  'cursor-pointer whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30',
  {
    variants: {
      variant: {
        default: 'inline-flex h-7 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold disabled:pointer-events-none disabled:opacity-50 data-[state=active]:bg-surface data-[state=active]:text-foreground data-[state=active]:shadow-sm',
        underline: '-mb-px min-h-11 flex-none border-b-2 border-transparent text-13 font-semibold text-text-dim-5 data-[state=active]:border-foreground data-[state=active]:text-foreground',
        dock: 'flex min-h-[72px] flex-1 flex-col items-center justify-center gap-1 rounded-lg text-13 font-semibold text-text-dim-4 [&_svg]:size-7 [&_svg]:opacity-[.45] data-[state=active]:bg-surface data-[state=active]:font-bold data-[state=active]:text-foreground data-[state=active]:shadow-[0_1px_3px_rgb(0_0_0/0.1)] [&[data-state=active]_svg]:opacity-100 disabled:cursor-not-allowed disabled:text-text-dim-6 [&:disabled_svg]:opacity-25 [&_small]:text-10 [&_small]:font-medium [&_small]:leading-none [&_small]:text-text-dim-5',
      },
    },
    defaultVariants: { variant: 'default' },
  }
)

type TabsVariant = NonNullable<VariantProps<typeof listVariants>['variant']>
const TabsVariantContext = React.createContext<TabsVariant>('default')

export const TabsList = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & VariantProps<typeof listVariants>
>(({ className, variant, ...props }, ref) => (
  <TabsVariantContext.Provider value={variant ?? 'default'}>
    <TabsPrimitive.List ref={ref} className={cn(listVariants({ variant }), className)} data-slot="tabs" data-variant={variant ?? 'default'} {...props} />
  </TabsVariantContext.Provider>
))
TabsList.displayName = TabsPrimitive.List.displayName

export const TabsTrigger = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(({ className, ...props }, ref) => {
  const variant = React.useContext(TabsVariantContext)
  return <TabsPrimitive.Trigger ref={ref} className={cn(triggerVariants({ variant }), className)} {...props} />
})
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName

export const TabsContent = React.forwardRef<
  React.ComponentRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content ref={ref} className={cn('focus-visible:outline-none', className)} {...props} />
))
TabsContent.displayName = TabsPrimitive.Content.displayName
