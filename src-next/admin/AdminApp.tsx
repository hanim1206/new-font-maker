import { useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { Menu } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import { AccountsPage } from './AccountsPage'
import { AdminFeedback } from './AdminFeedback'
import { ADMIN_PATH, SECTIONS, sectionOf } from './adminSections'
import type { Section } from './adminSections'
import { InvitePage } from './InvitePage'
import { TriagePage } from './TriagePage'
import { useBetaInvites } from './useBetaInvites'

/**
 * 관리자 화면(shadcn 사이드바 틀). 넓으면 왼쪽 메뉴, 좁으면 ☰ 판.
 * 로컬 개발 서버에서만 열린다(`main.tsx`). 계정 목록은 초대 · 계정이 같이 쓰고, 의견은 다른 메뉴에서도 받아 두어 메뉴 옆 숫자를 채운다.
 */
export function AdminApp() {
  const [section, setSection] = useState<Section>(() => sectionOf(window.location.pathname))
  const [menuOpen, setMenuOpen] = useState(false)
  /** 답장 안 한 의견 수. */
  const [pending, setPending] = useState(0)
  const invites = useBetaInvites()

  useEffect(() => {
    const onPop = () => setSection(sectionOf(window.location.pathname))
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const go = (event: MouseEvent, key: Section) => {
    event.preventDefault()
    setMenuOpen(false)
    if (key === section) return
    window.history.pushState(null, '', `${ADMIN_PATH}/${key}`)
    setSection(key)
  }

  const current = SECTIONS.find((item) => item.key === section)!

  const nav = <nav className="flex flex-col gap-0.5" aria-label="관리 메뉴">
    {SECTIONS.map(({ key, label, icon: Icon }) => <a
      key={key}
      href={`${ADMIN_PATH}/${key}`}
      onClick={(event) => go(event, key)}
      aria-current={key === section ? 'page' : undefined}
      className={cn(
        'flex h-9 items-center gap-2.5 rounded-md px-2.5 text-sm font-medium text-text-dim-3 transition-colors hover:bg-surface-3 hover:text-foreground',
        key === section && 'bg-surface-3 font-semibold text-foreground'
      )}
      data-testid={`admin-nav-${key}`}
    >
      <Icon className="h-4 w-4" />
      <span className="flex-1">{label}</span>
      {key === 'feedback' && pending > 0 && <Badge variant="alert">{pending}</Badge>}
    </a>)}
  </nav>

  const brand = <div className="flex flex-col gap-0.5 px-2.5 pb-4 pt-1">
    <strong className="text-base font-extrabold">관리</strong>
    <span className="text-xs text-text-dim-5">이 맥에서만 열려요</span>
  </div>

  return <div className="flex min-h-dvh bg-background text-foreground">
    <aside className="sticky top-0 hidden h-dvh w-56 shrink-0 flex-col bg-surface-2 p-3 md:flex">
      {brand}
      {nav}
    </aside>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 bg-background/90 px-4 backdrop-blur md:px-8">
        <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
          <SheetTrigger className="-ml-2 rounded-md p-2 text-text-dim-3 hover:bg-surface-3 md:hidden" aria-label="메뉴">
            <Menu className="h-5 w-5" />
          </SheetTrigger>
          <SheetContent className="p-3">
            <SheetTitle className="sr-only">관리 메뉴</SheetTitle>
            {brand}
            {nav}
          </SheetContent>
        </Sheet>
        <h1 className="text-lg font-bold">{current.label}</h1>
        {section === 'feedback' && pending > 0 && <Badge variant="alert">{pending}</Badge>}
        <span className="hidden truncate text-sm text-text-dim-5 sm:inline">{current.hint}</span>
      </header>
      <main className="flex-1 px-4 pb-10 pt-2 md:px-8">
        {section === 'invite' && <InvitePage invites={invites} />}
        {section === 'accounts' && <AccountsPage invites={invites} />}
        <div className={section === 'feedback' ? 'max-w-2xl' : undefined} data-testid={section === 'feedback' ? 'admin-feedback' : undefined}>
          <AdminFeedback hidden={section !== 'feedback'} onPending={setPending} />
        </div>
        {section === 'triage' && <TriagePage />}
      </main>
    </div>
  </div>
}
