import { lazy, Suspense, useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'
import { AccountsPage } from './AccountsPage'
import type { AccountFilter } from './accountFilter'
import { AdminFeedback } from './AdminFeedback'
import { ADMIN_PATH, SECTIONS, accountOf, accountPathOf, sectionOf } from './adminSections'
import type { Section } from './adminSections'
import { InvitePage } from './InvitePage'
import { TriagePage } from './TriagePage'
import { useBetaInvites } from './useBetaInvites'

/** 폰트 미리보기는 렌더러 · 노토 모델을 끌고 와서 들어갈 때만 불러온다. */
const AccountFontsPage = lazy(() => import('./AccountFontsPage').then((module) => ({ default: module.AccountFontsPage })))

/**
 * 관리자 화면(shadcn 사이드바 틀). 왼쪽 메뉴는 늘 열려 있다 — 좁으면 아이콘 아래 이름만.
 * 로컬 개발 서버에서만 열린다(`main.tsx`). 계정 목록은 초대 · 계정이 같이 쓰고, 의견은 다른 메뉴에서도 받아 두어 메뉴 옆 숫자를 채운다.
 */
export function AdminApp() {
  const [section, setSection] = useState<Section>(() => sectionOf(window.location.pathname))
  /** 계정 메뉴에서 연 계정(폰트 미리보기). 목록이면 null. */
  const [account, setAccount] = useState<string | null>(() => accountOf(window.location.pathname))
  /** 계정 표 거르기. 폰트 상세에 다녀와도 남게 여기 둔다. */
  const [accountFilter, setAccountFilter] = useState<AccountFilter>('all')
  /** 답장 안 한 의견 수. */
  const [pending, setPending] = useState(0)
  const invites = useBetaInvites()

  useEffect(() => {
    const onPop = () => {
      setSection(sectionOf(window.location.pathname))
      setAccount(accountOf(window.location.pathname))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const go = (event: MouseEvent, key: Section) => {
    event.preventDefault()
    if (key === section && !account) return
    window.history.pushState(null, '', `${ADMIN_PATH}/${key}`)
    setSection(key)
    setAccount(null)
  }

  const openAccount = (email: string | null) => {
    window.history.pushState(null, '', email ? accountPathOf(email) : `${ADMIN_PATH}/accounts`)
    setAccount(email)
  }

  const current = SECTIONS.find((item) => item.key === section)!

  const nav = <nav className="flex flex-col gap-0.5" aria-label="관리 메뉴">
    {SECTIONS.map(({ key, label, icon: Icon }) => <a
      key={key}
      href={`${ADMIN_PATH}/${key}`}
      onClick={(event) => go(event, key)}
      aria-current={key === section ? 'page' : undefined}
      className={cn(
        'relative flex flex-col items-center gap-1 rounded-md px-1 py-2 text-[11px] font-medium text-text-dim-3 transition-colors hover:bg-surface-3 hover:text-foreground md:h-9 md:flex-row md:gap-2.5 md:px-2.5 md:py-0 md:text-sm',
        key === section && 'bg-surface-3 font-semibold text-foreground'
      )}
      data-testid={`admin-nav-${key}`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="md:flex-1">{label}</span>
      {key === 'feedback' && pending > 0 && <Badge variant="alert" className="absolute right-0.5 top-0.5 px-1.5 md:static">{pending}</Badge>}
    </a>)}
  </nav>

  return <div className="flex min-h-dvh bg-background text-foreground">
    <aside className="sticky top-0 flex h-dvh w-16 shrink-0 flex-col bg-surface-2 p-1.5 md:w-56 md:p-3">
      <div className="hidden flex-col gap-0.5 px-2.5 pb-4 pt-1 md:flex">
        <strong className="text-base font-extrabold">관리</strong>
        <span className="text-xs text-text-dim-5">이 맥에서만 열려요</span>
      </div>
      {nav}
    </aside>
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-2 bg-background/90 px-4 backdrop-blur md:px-8">
        <h1 className="text-lg font-bold">{current.label}</h1>
        {section === 'feedback' && pending > 0 && <Badge variant="alert">{pending}</Badge>}
        <span className="hidden truncate text-sm text-text-dim-5 sm:inline">{current.hint}</span>
      </header>
      <main className="flex-1 px-4 pb-10 pt-2 md:px-8">
        {section === 'invite' && <InvitePage invites={invites} />}
        {section === 'accounts' && !account && <AccountsPage invites={invites} onOpen={openAccount} filter={accountFilter} onFilter={setAccountFilter} />}
        {section === 'accounts' && account && <Suspense fallback={<p className="text-sm text-text-dim-4">불러오는 중…</p>}>
          <AccountFontsPage email={account} account={invites.accounts?.find((item) => item.email === account)} onBack={() => openAccount(null)} />
        </Suspense>}
        <div className={section === 'feedback' ? 'max-w-2xl' : undefined} data-testid={section === 'feedback' ? 'admin-feedback' : undefined}>
          <AdminFeedback hidden={section !== 'feedback'} onPending={setPending} />
        </div>
        {section === 'triage' && <TriagePage />}
      </main>
    </div>
  </div>
}
