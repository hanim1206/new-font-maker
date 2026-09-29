import { lazy, Suspense, useEffect, useState } from 'react'
import type { MouseEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarHeader, SidebarInset, SidebarMenu, SidebarMenuBadge, SidebarMenuButton, SidebarMenuItem,
  SidebarProvider, SidebarTrigger, useSidebar,
} from '@/components/ui/sidebar'
import { AccountsPage } from './AccountsPage'
import { INITIAL_ACCOUNTS_VIEW } from './accountFilter'
import type { AccountsView } from './accountFilter'
import { AdminFeedback } from './AdminFeedback'
import { ADMIN_PATH, SECTIONS, accountOf, accountPathOf, canonicalPathOf, sectionOf } from './adminSections'
import type { Section } from './adminSections'
import { TriagePage } from './TriagePage'
import { useBetaInvites } from './useBetaInvites'

/** 폰트 미리보기는 렌더러 · 노토 모델을 끌고 와서 들어갈 때만 불러온다. */
const AccountFontsPage = lazy(() => import('./AccountFontsPage').then((module) => ({ default: module.AccountFontsPage })))

function AdminSidebar({ section, pending, onGo }: { section: Section; pending: number; onGo: (event: MouseEvent, key: Section) => void }) {
  const { isMobile, setOpenMobile } = useSidebar()
  return <Sidebar>
    <SidebarHeader className="h-14 flex-row items-center gap-2.5 px-3.5 group-data-[collapsible=icon]:px-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md bg-foreground text-sm font-extrabold text-surface" aria-hidden>한</span>
      <span className="flex min-w-0 flex-col leading-tight group-data-[collapsible=icon]:hidden">
        <strong className="truncate text-sm font-extrabold">한글 폰트 메이커</strong>
        <span className="truncate text-xs text-text-dim-5">관리</span>
      </span>
    </SidebarHeader>
    <SidebarContent>
      <SidebarGroup>
        <SidebarMenu aria-label="관리 메뉴">
          {SECTIONS.map(({ key, label, icon: Icon }) => <SidebarMenuItem key={key}>
            <SidebarMenuButton asChild isActive={key === section} tooltip={label}>
              <a
                href={`${ADMIN_PATH}/${key}`}
                onClick={(event) => {
                  onGo(event, key)
                  if (isMobile) setOpenMobile(false)
                }}
                aria-current={key === section ? 'page' : undefined}
                data-testid={`admin-nav-${key}`}
              >
                <Icon />
                <span>{label}</span>
              </a>
            </SidebarMenuButton>
            {key === 'feedback' && pending > 0 && <SidebarMenuBadge>{pending}</SidebarMenuBadge>}
          </SidebarMenuItem>)}
        </SidebarMenu>
      </SidebarGroup>
    </SidebarContent>
    <SidebarFooter className="px-4 pb-4 text-xs text-text-dim-5 group-data-[collapsible=icon]:hidden">이 맥에서만 열려요</SidebarFooter>
  </Sidebar>
}

/**
 * 관리자 화면(shadcn 사이드바 틀). 왼쪽 메뉴는 접으면 아이콘만, 좁으면 시트로 연다.
 * 로컬 개발 서버에서만 열린다(`main.tsx`). 계정 목록은 계정 화면과 초대 패널이 같이 쓰고, 의견은 다른 메뉴에서도 받아 두어 메뉴 옆 숫자를 채운다.
 */
export function AdminApp() {
  const [section, setSection] = useState<Section>(() => sectionOf(window.location.pathname))
  /** 계정 메뉴에서 연 계정(폰트 미리보기). 목록이면 null. */
  const [account, setAccount] = useState<string | null>(() => accountOf(window.location.pathname))
  /** 계정 표 거르기 · 정렬 · 쪽. 폰트 상세에 다녀와도 남게 여기 둔다. */
  const [accountsView, setAccountsView] = useState<AccountsView>(INITIAL_ACCOUNTS_VIEW)
  /** 답장 안 한 의견 수. */
  const [pending, setPending] = useState(0)
  const invites = useBetaInvites()

  useEffect(() => {
    /** `/admin` · 옛 `/admin/invite` → `/admin/accounts`. */
    const canonical = canonicalPathOf(window.location.pathname)
    if (canonical) window.history.replaceState(null, '', canonical)
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

  return <SidebarProvider className="bg-background text-foreground">
    <AdminSidebar section={section} pending={pending} onGo={go} />
    <SidebarInset>
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 bg-background/90 px-4 backdrop-blur md:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <h1 className="text-lg font-bold">{current.label}</h1>
        {section === 'feedback' && pending > 0 && <Badge variant="alert">{pending}</Badge>}
        <span className="hidden truncate text-sm text-text-dim-5 sm:inline">{current.hint}</span>
      </header>
      <main className="flex-1 px-4 pb-10 pt-2 md:px-6">
        {section === 'accounts' && !account && <AccountsPage invites={invites} onOpen={openAccount} view={accountsView} onView={setAccountsView} />}
        {section === 'accounts' && account && <Suspense fallback={<p className="text-sm text-text-dim-4">불러오는 중…</p>}>
          <AccountFontsPage email={account} account={invites.accounts?.find((item) => item.email === account)} onBack={() => openAccount(null)} />
        </Suspense>}
        <AdminFeedback hidden={section !== 'feedback'} onPending={setPending} />
        {section === 'triage' && <TriagePage />}
      </main>
    </SidebarInset>
  </SidebarProvider>
}
