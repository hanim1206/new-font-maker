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
import { ADMIN_PATH, SECTIONS, accountOf, accountPathOf, canonicalPathOf, labOf, labPathOf, sectionOf } from './adminSections'
import type { Section } from './adminSections'
import { LABS } from '../labCatalog'
import type { LabEntry } from '../labCatalog'
import { LabFrame, LabNewTabLink, LabsList } from './LabsPage'
import { TriagePage } from './TriagePage'
import { useBetaInvites } from './useBetaInvites'

/** 폰트 미리보기는 렌더러 · 노토 모델을 끌고 와서 들어갈 때만 불러온다. */
const AccountFontsPage = lazy(() => import('./AccountFontsPage').then((module) => ({ default: module.AccountFontsPage })))

function AdminSidebar({ section, lab, pending, onGo, onLab }: {
  section: Section
  lab: LabEntry | null
  pending: number
  onGo: (event: MouseEvent, key: Section) => void
  onLab: (event: MouseEvent, lab: LabEntry) => void
}) {
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
            <SidebarMenuButton asChild isActive={key === section && !(key === 'labs' && lab)} tooltip={label}>
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
            {/* 실험실은 아래에 랩 이름을 늘어놓아 바로 옮겨 다닌다. 접으면 숨기고 아이콘은 목록으로. */}
            {key === 'labs' && <ul className="ml-4 mt-0.5 flex flex-col gap-0.5 border-l border-border-subtle pl-2 group-data-[collapsible=icon]:hidden" aria-label="실험실">
              {LABS.map((item) => <li key={item.route}>
                <a
                  href={labPathOf(item)}
                  onClick={(event) => {
                    onLab(event, item)
                    if (isMobile) setOpenMobile(false)
                  }}
                  aria-current={item.route === lab?.route ? 'page' : undefined}
                  data-active={item.route === lab?.route}
                  className="flex h-8 items-center truncate rounded-md px-2.5 text-[13px] text-text-dim-4 transition-colors hover:bg-surface-3 hover:text-foreground data-[active=true]:bg-surface-3 data-[active=true]:font-semibold data-[active=true]:text-foreground"
                  data-testid={`admin-lab-${item.slug}`}
                >
                  {item.name}
                </a>
              </li>)}
            </ul>}
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
  /** 실험실 메뉴에서 연 랩. 목록이면 null. */
  const [lab, setLab] = useState<LabEntry | null>(() => labOf(window.location.pathname))
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
      setLab(labOf(window.location.pathname))
    }
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  }, [])

  const go = (event: MouseEvent, key: Section) => {
    event.preventDefault()
    if (key === section && !account && !lab) return
    window.history.pushState(null, '', `${ADMIN_PATH}/${key}`)
    setSection(key)
    setAccount(null)
    setLab(null)
  }

  const openLab = (event: MouseEvent, next: LabEntry) => {
    event.preventDefault()
    if (next.route === lab?.route) return
    window.history.pushState(null, '', labPathOf(next))
    setSection('labs')
    setAccount(null)
    setLab(next)
  }

  const openAccount = (email: string | null) => {
    window.history.pushState(null, '', email ? accountPathOf(email) : `${ADMIN_PATH}/accounts`)
    setAccount(email)
  }

  const current = SECTIONS.find((item) => item.key === section)!

  return <SidebarProvider className="bg-background text-foreground">
    <AdminSidebar section={section} lab={lab} pending={pending} onGo={go} onLab={openLab} />
    <SidebarInset>
      <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 bg-background/90 px-4 backdrop-blur md:px-6">
        <SidebarTrigger className="-ml-1" />
        <Separator orientation="vertical" className="mr-1 h-4" />
        <h1 className="truncate text-lg font-bold">{lab ? lab.name : current.label}</h1>
        {section === 'feedback' && pending > 0 && <Badge variant="alert">{pending}</Badge>}
        <span className="hidden truncate text-sm text-text-dim-5 sm:inline">{lab ? lab.route : current.hint}</span>
        {lab && <LabNewTabLink lab={lab} />}
      </header>
      <main className={lab ? 'flex-1' : 'flex-1 px-4 pb-10 pt-2 md:px-6'}>
        {section === 'accounts' && !account && <AccountsPage invites={invites} onOpen={openAccount} view={accountsView} onView={setAccountsView} />}
        {section === 'accounts' && account && <Suspense fallback={<p className="text-sm text-text-dim-4">불러오는 중…</p>}>
          <AccountFontsPage email={account} invites={invites} onBack={() => openAccount(null)} />
        </Suspense>}
        <AdminFeedback hidden={section !== 'feedback'} onPending={setPending} />
        {section === 'triage' && <TriagePage />}
        {section === 'labs' && !lab && <LabsList onOpen={openLab} />}
        {section === 'labs' && lab && <LabFrame lab={lab} />}
      </main>
    </SidebarInset>
  </SidebarProvider>
}
