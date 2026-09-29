import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { PanelLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from './button'
import { Sheet, SheetContent, SheetDescription, SheetTitle } from './sheet'

/**
 * shadcn Sidebar를 줄인 것. 넓으면 왼쪽에 붙어 있고 접으면 아이콘만(`collapsible=icon`), 좁으면(768px 아래) 왼쪽 시트로 연다.
 * 접힘은 이 브라우저에 남긴다. ⌘B / Ctrl+B로 접고 편다.
 */
const OPEN_KEY = 'sidebar:open'
const MOBILE_BELOW = 768

type SidebarContextValue = {
  state: 'expanded' | 'collapsed'
  open: boolean
  setOpen: (open: boolean) => void
  openMobile: boolean
  setOpenMobile: (open: boolean) => void
  isMobile: boolean
  toggleSidebar: () => void
}

const SidebarContext = React.createContext<SidebarContextValue | null>(null)

// eslint-disable-next-line react-refresh/only-export-components
export function useSidebar() {
  const context = React.useContext(SidebarContext)
  if (!context) throw new Error('useSidebar는 SidebarProvider 안에서만 쓴다.')
  return context
}

function useIsMobile() {
  const query = `(max-width: ${MOBILE_BELOW - 1}px)`
  const [mobile, setMobile] = React.useState(() => window.matchMedia(query).matches)
  React.useEffect(() => {
    const list = window.matchMedia(query)
    const change = () => setMobile(list.matches)
    list.addEventListener('change', change)
    return () => list.removeEventListener('change', change)
  }, [query])
  return mobile
}

function readOpen(): boolean {
  try {
    return window.localStorage.getItem(OPEN_KEY) !== 'false'
  } catch {
    return true
  }
}

export function SidebarProvider({ className, style, children, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const isMobile = useIsMobile()
  const [open, setOpenState] = React.useState(readOpen)
  const [openMobile, setOpenMobile] = React.useState(false)

  const setOpen = React.useCallback((next: boolean) => {
    setOpenState(next)
    try {
      window.localStorage.setItem(OPEN_KEY, String(next))
    } catch {
      // 저장이 막힌 브라우저면 이번 창에서만 기억한다.
    }
  }, [])

  const toggleSidebar = React.useCallback(() => {
    if (isMobile) setOpenMobile((current) => !current)
    else setOpen(!open)
  }, [isMobile, open, setOpen])

  React.useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'b' || !(event.metaKey || event.ctrlKey)) return
      event.preventDefault()
      toggleSidebar()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleSidebar])

  const value = React.useMemo<SidebarContextValue>(() => ({
    state: open ? 'expanded' : 'collapsed', open, setOpen, openMobile, setOpenMobile, isMobile, toggleSidebar,
  }), [open, setOpen, openMobile, isMobile, toggleSidebar])

  return <SidebarContext.Provider value={value}>
    <div
      style={{ '--sidebar-width': '14rem', '--sidebar-width-icon': '3.5rem', ...style } as React.CSSProperties}
      className={cn('flex min-h-dvh w-full', className)}
      {...props}
    >
      {children}
    </div>
  </SidebarContext.Provider>
}

export function Sidebar({ className, children, ...props }: React.HTMLAttributes<HTMLElement>) {
  const { isMobile, state, openMobile, setOpenMobile } = useSidebar()
  if (isMobile) return <Sheet open={openMobile} onOpenChange={setOpenMobile}>
    <SheetContent side="left" className="w-[--sidebar-width] bg-surface-2 p-0 sm:max-w-[--sidebar-width]">
      <SheetTitle className="sr-only">메뉴</SheetTitle>
      <SheetDescription className="sr-only">관리 메뉴</SheetDescription>
      <div className="flex h-full flex-col">{children}</div>
    </SheetContent>
  </Sheet>
  return <aside
    data-state={state}
    data-collapsible={state === 'collapsed' ? 'icon' : ''}
    className={cn(
      'group sticky top-0 flex h-dvh w-[--sidebar-width] shrink-0 flex-col bg-surface-2 transition-[width] duration-200 ease-standard data-[collapsible=icon]:w-[--sidebar-width-icon]',
      className
    )}
    {...props}
  >
    {children}
  </aside>
}

export function SidebarTrigger({ className, onClick, ...props }: React.ComponentProps<typeof Button>) {
  const { toggleSidebar } = useSidebar()
  return <Button
    variant="ghost"
    size="icon"
    className={cn('size-8', className)}
    onClick={(event) => {
      onClick?.(event)
      toggleSidebar()
    }}
    aria-label="메뉴 접기 · 펴기"
    title="메뉴 접기 · 펴기 (⌘B)"
    {...props}
  >
    <PanelLeft />
  </Button>
}

export const SidebarInset = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex min-w-0 flex-1 flex-col bg-background', className)} {...props} />
)

export const SidebarHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex flex-col gap-2 p-2', className)} {...props} />
)

export const SidebarFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('mt-auto flex flex-col gap-2 p-2', className)} {...props} />
)

export const SidebarContent = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex min-h-0 flex-1 flex-col gap-2 overflow-auto group-data-[collapsible=icon]:overflow-hidden', className)} {...props} />
)

export const SidebarGroup = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex w-full min-w-0 flex-col p-2', className)} {...props} />
)

export const SidebarGroupLabel = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex h-8 shrink-0 items-center px-2.5 text-xs font-medium text-text-dim-5 group-data-[collapsible=icon]:hidden', className)} {...props} />
)

export const SidebarMenu = ({ className, ...props }: React.HTMLAttributes<HTMLUListElement>) => (
  <ul className={cn('flex w-full min-w-0 flex-col gap-0.5', className)} {...props} />
)

export const SidebarMenuItem = ({ className, ...props }: React.LiHTMLAttributes<HTMLLIElement>) => (
  <li className={cn('relative', className)} {...props} />
)

export const SidebarMenuButton = React.forwardRef<
  HTMLButtonElement,
  React.ButtonHTMLAttributes<HTMLButtonElement> & { asChild?: boolean; isActive?: boolean; tooltip?: string }
>(({ asChild = false, isActive = false, tooltip, className, ...props }, ref) => {
  const { state, isMobile } = useSidebar()
  const Comp = asChild ? Slot : 'button'
  return <Comp
    ref={ref}
    data-active={isActive}
    title={state === 'collapsed' && !isMobile ? tooltip : undefined}
    className={cn(
      'flex h-9 w-full cursor-pointer items-center gap-2.5 overflow-hidden rounded-md px-2.5 text-left text-sm font-medium text-text-dim-3 outline-none transition-colors hover:bg-surface-3 hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30 data-[active=true]:bg-surface-3 data-[active=true]:font-semibold data-[active=true]:text-foreground group-data-[collapsible=icon]:size-9 group-data-[collapsible=icon]:px-2.5 [&>span]:truncate [&>svg]:size-4 [&>svg]:shrink-0',
      className
    )}
    {...props}
  />
})
SidebarMenuButton.displayName = 'SidebarMenuButton'

/** 메뉴 오른쪽 숫자. 접으면 아이콘 오른쪽 위 작은 점 숫자. */
export const SidebarMenuBadge = ({ className, ...props }: React.HTMLAttributes<HTMLSpanElement>) => (
  <span
    className={cn(
      'pointer-events-none absolute right-2 top-1/2 flex h-5 min-w-5 -translate-y-1/2 items-center justify-center rounded-full bg-[rgb(240_68_82)] px-1.5 text-[11px] font-semibold tabular-nums text-white group-data-[collapsible=icon]:right-0.5 group-data-[collapsible=icon]:top-0.5 group-data-[collapsible=icon]:h-4 group-data-[collapsible=icon]:min-w-4 group-data-[collapsible=icon]:translate-y-0 group-data-[collapsible=icon]:px-1 group-data-[collapsible=icon]:text-[10px]',
      className
    )}
    {...props}
  />
)
