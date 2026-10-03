import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronDown, ChevronRight, Copy } from 'lucide-react'
import { Button } from './components/ui/button'
import { FILE_SCREEN, LIBRARY_GROUPS, libraryItems } from './styleLibrary'
import type { LibraryGroup, LibraryItem, LibraryScreen } from './styleLibrary'
import { applyThemePreview, readThemePreview, writeThemePreview } from './themePreview'
import type { ThemePreview } from './themePreview'

/**
 * 스타일가이드 라이브러리(docs/plans/2026-10-03_스타일가이드-검토판.md). Storybook처럼 세 칸 — 왼쪽 부품 목록, 가운데 고른 부품의 실물,
 * 오른쪽 폰 미리보기. 보기만 한다: 의견은 번호를 복사해 채팅으로 준다. `쓰는 화면`을 누르면 미리보기가 그 화면으로 가서 부품을 깜빡인다.
 * 위 주색 손잡이는 이 브라우저의 다른 화면에도 덮인다(`themePreview.ts`).
 */

const PRIMARY_CHOICES: { label: string; hex: string | null }[] = [
  { label: '파랑', hex: null }, { label: '초록', hex: '#1f9d55' }, { label: '주황', hex: '#e8590c' }, { label: '보라', hex: '#7048e8' }, { label: '검정', hex: '#212529' },
]

interface Use { file: string; line: number }
type Usage = { variant: Record<string, Use[]>; size: Record<string, Use[]> }

function useButtonUsage(): Usage | null {
  const [usage, setUsage] = useState<Usage | null>(null)
  useEffect(() => {
    fetch('/api/style-library', { headers: { 'x-beta-admin': '1' } })
      .then((response) => response.ok ? response.json() as Promise<{ button: Usage }> : null)
      .then((body) => { if (body) setUsage(body.button) })
      .catch(() => undefined)
  }, [])
  return usage
}

/** 항목이 쓰이는 화면. 단추는 코드에서 센 파일을 화면으로 바꾸고, 같은 화면은 한 번만. */
function screensOf(item: LibraryItem, usage: Usage | null): (LibraryScreen & { count?: number })[] {
  if (!item.usage) return item.screens ?? []
  const uses = usage?.[item.usage.kind][item.usage.name] ?? []
  const byName = new Map<string, LibraryScreen & { count: number }>()
  for (const use of uses) {
    const screen = FILE_SCREEN[use.file] ?? { name: use.file.replace('src-next/', ''), route: '' }
    const known = byName.get(screen.name)
    if (known) known.count++
    else byName.set(screen.name, { ...screen, count: 1 })
  }
  return [...byName.values()]
}

const idOfHash = () => decodeURIComponent(window.location.hash.slice(1))

/** 미리보기 문서에 깜빡임 모양을 한 번 넣는다. */
function ensureFlashStyle(doc: Document) {
  if (doc.getElementById('style-guide-flash')) return
  const style = doc.createElement('style')
  style.id = 'style-guide-flash'
  style.textContent = '[data-style-guide-flash]{outline:3px solid rgb(var(--color-edit-select))!important;outline-offset:3px!important;animation:style-guide-flash .6s ease-in-out 4 alternate}@keyframes style-guide-flash{from{outline-color:rgb(var(--color-edit-select))}to{outline-color:rgb(var(--color-edit-select)/.15)}}'
  doc.head.append(style)
}

const visible = (element: Element) => {
  const rect = element.getBoundingClientRect()
  return rect.width > 0 && rect.height > 0 && getComputedStyle(element).visibility !== 'hidden'
}

export function StyleGuideLabPage() {
  const [preview, setPreview] = useState<ThemePreview>(() => readThemePreview(window.localStorage))
  const [, setTick] = useState(0)
  useEffect(() => {
    applyThemePreview(document.documentElement, preview)
    writeThemePreview(window.localStorage, preview)
    setTick((tick) => tick + 1)
  }, [preview])

  const items = useMemo(() => libraryItems(), [])
  const usage = useButtonUsage()
  // 보는 것: 묶음 한눈 보기(`#group.<id>`) 또는 항목 하나(`#<번호>`).
  const [selectedId, setSelectedId] = useState(() => {
    const hash = idOfHash()
    return items.some((item) => item.id === hash) || LIBRARY_GROUPS.some((group) => `group.${group.id}` === hash) ? hash : 'group.button-variant'
  })
  const viewGroup = LIBRARY_GROUPS.find((group) => `group.${group.id}` === selectedId) ?? null
  const item = viewGroup ? items[0] : items.find((entry) => entry.id === selectedId) ?? items[0]
  const groupOf = (entry: LibraryItem) => LIBRARY_GROUPS.find((group) => group.label === entry.group)!
  const currentGroup = viewGroup ?? groupOf(item)
  const [openGroup, setOpenGroup] = useState<string | null>(currentGroup.id)
  const select = (id: string) => { setSelectedId(id); window.history.replaceState(null, '', `#${id}`) }
  const pickGroup = (group: LibraryGroup) => {
    // 이미 보고 있는 묶음을 다시 누르면 접기만 한다.
    if (viewGroup?.id === group.id && openGroup === group.id) { setOpenGroup(null); return }
    setOpenGroup(group.id)
    select(`group.${group.id}`)
  }

  const [copied, setCopied] = useState(false)
  const copy = () => { navigator.clipboard?.writeText(item.id).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200) }).catch(() => undefined) }

  // 미리보기: 화면으로 가서 부품을 찾아 깜빡인다. 못 찾으면 안내.
  const frame = useRef<HTMLIFrameElement>(null)
  const [frameSrc, setFrameSrc] = useState('/dashboard')
  const [found, setFound] = useState<string | null>(null)
  const pending = useRef<{ screen: LibraryScreen; selector?: string; token: number } | null>(null)
  const findIn = useCallback(async (screen: LibraryScreen, selector: string | undefined, token: number) => {
    const win = frame.current?.contentWindow as (Window & { document: Document }) | null
    if (!win) return
    if (screen.show) {
      const card = screen.show === 'notice-card'
      // 미리보기 문서의 알림 저장소에 넣어야 해서 그 문서 안에서 불러온다(같은 출처).
      const notice = card
        ? "{ message: '다른 기기에서 먼저 저장했어요', tone: 'error', actions: [{ label: '그걸 불러오기', run: () => {} }, { label: '내 것으로 덮기', run: () => {} }] }"
        : "{ message: '새 버전이 있어요', tone: 'info', actions: [{ label: '새로고침', run: () => {} }], dismissable: true }"
      await (win as unknown as { eval: (code: string) => Promise<void> }).eval(`import('/src-next/appNotice.ts').then((m) => { m.clearAppNotice('update'); m.clearAppNotice('conflict'); m.showAppNotice('${card ? 'conflict' : 'update'}', ${notice}) })`)
    }
    if (!selector) { setFound(null); return }
    for (let attempt = 0; attempt < 30; attempt++) {
      if (pending.current?.token !== token) return
      const doc = win.document
      const matches = [...doc.querySelectorAll(selector)].filter(visible)
      if (matches.length) {
        ensureFlashStyle(doc)
        doc.querySelectorAll('[data-style-guide-flash]').forEach((element) => element.removeAttribute('data-style-guide-flash'))
        matches.forEach((element) => element.setAttribute('data-style-guide-flash', ''))
        matches[0].scrollIntoView({ block: 'center', behavior: 'smooth' })
        setFound(`이 화면에서 ${matches.length}곳`)
        window.setTimeout(() => matches.forEach((element) => element.removeAttribute('data-style-guide-flash')), 2600)
        return
      }
      await new Promise((resolve) => window.setTimeout(resolve, 150))
    }
    setFound(screen.hint ? `안 보여요 — ${screen.hint}` : '이 화면에서 지금은 안 보여요')
  }, [])
  const go = (screen: LibraryScreen) => {
    if (!screen.route) return
    const token = Date.now()
    pending.current = { screen, selector: item.selector, token }
    setFound('찾는 중…')
    const sameRoute = frame.current?.contentWindow?.location.pathname + (frame.current?.contentWindow?.location.search ?? '') === screen.route
    if (sameRoute) void findIn(screen, item.selector, token)
    else setFrameSrc(screen.route)
  }
  const onFrameLoad = () => {
    const job = pending.current
    if (job) window.setTimeout(() => void findIn(job.screen, job.selector, job.token), 600)
  }
  useEffect(() => { setFound(null); pending.current = null }, [selectedId])

  const screens = screensOf(item, usage)

  return <main className="grid h-dvh grid-cols-[220px_minmax(0,1fr)_420px] bg-background text-foreground" data-testid="style-guide-lab">
    <nav className="flex min-h-0 flex-col gap-5 overflow-y-auto border-r border-border-subtle bg-surface px-3 py-5" aria-label="부품 목록">
      <div className="px-2"><h1 className="text-18 font-extrabold">스타일가이드</h1><p className="text-12 text-text-dim-5">보기 전용 · 번호로 말해 주세요</p></div>
      {(['토큰', '부품'] as const).map((section) => <div key={section} className="flex flex-col gap-0.5">
        <span className="px-2 pb-1 text-11 font-bold text-text-dim-5">{section}</span>
        {LIBRARY_GROUPS.filter((group) => group.section === section).map((group) => {
          const open = openGroup === group.id
          const members = items.filter((entry) => entry.group === group.label)
          return <div key={group.id} className="flex flex-col">
            <button type="button" onClick={() => pickGroup(group)} aria-expanded={open} aria-current={viewGroup?.id === group.id || undefined}
              className="flex items-center gap-1.5 rounded-sm px-2 py-1.5 text-left text-14 font-semibold hover:bg-surface-3 aria-[current]:bg-surface-3">
              {open ? <ChevronDown className="size-4 text-text-dim-5" aria-hidden="true" /> : <ChevronRight className="size-4 text-text-dim-5" aria-hidden="true" />}
              <span className="flex-1">{group.label}</span><span className="text-12 font-normal text-text-dim-5">{members.length}</span>
            </button>
            {open && <div className="ml-[15px] flex flex-col gap-0.5 border-l border-border-subtle py-0.5 pl-2">
              {members.map((entry) => <button key={entry.id} type="button" onClick={() => select(entry.id)} aria-current={(!viewGroup && entry.id === item.id) || undefined}
                className="rounded-sm px-2 py-1 text-left text-13 text-text-dim-3 hover:bg-surface-3 aria-[current]:bg-foreground aria-[current]:font-semibold aria-[current]:text-surface">{entry.title}</button>)}
            </div>}
          </div>
        })}
      </div>)}
    </nav>

    <section className="flex min-h-0 min-w-0 flex-col overflow-y-auto">
      <div className="flex flex-wrap items-center gap-2 border-b border-border-subtle px-8 py-3 text-12">
        <span className="font-semibold text-text-dim-4">주색 미리 보기</span>
        {PRIMARY_CHOICES.map((choice) => <button key={choice.label} type="button" aria-pressed={(preview.primary ?? null) === choice.hex} onClick={() => setPreview({ ...preview, primary: choice.hex ?? undefined })}
          className="flex h-7 items-center gap-1.5 rounded-full border border-border px-2.5 font-semibold aria-pressed:border-foreground">
          <span className="size-3 rounded-full" style={{ background: choice.hex ?? 'rgb(var(--palette-blue-500))' }} />{choice.label}
        </button>)}
        <span className="text-text-dim-5">이 브라우저에만 · 미리보기 화면에도 덮인다</span>
      </div>

      {viewGroup ? <div className="flex flex-col gap-6 px-8 py-8">
        <header className="flex flex-col gap-2">
          <span className="text-12 font-bold text-text-dim-5">{viewGroup.section}</span>
          <h2 className="text-28 font-extrabold">{viewGroup.label}</h2>
          <p className="max-w-[65ch] text-14 text-text-dim-3">{viewGroup.note} 하나를 누르면 자세히 · 쓰는 화면이 나온다.</p>
        </header>
        <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-4">
          {items.filter((entry) => entry.group === viewGroup.label).map((entry) => <button key={entry.id} type="button" onClick={() => select(entry.id)}
            className="flex min-w-0 flex-col gap-3 rounded-xl border border-border-subtle bg-surface p-4 text-left hover:border-foreground" data-testid="style-guide-tile">
            <div className="pointer-events-none flex h-[120px] w-full items-center overflow-hidden" inert>{entry.story()}</div>
            <span className="flex flex-col"><strong className="text-14">{entry.title}</strong><code className="truncate text-11 text-text-dim-5">{entry.id}</code></span>
          </button>)}
        </div>
      </div> :       <div className="flex flex-col gap-6 px-8 py-8">
        <header className="flex flex-col gap-2">
          <button type="button" onClick={() => pickGroup(groupOf(item))} className="w-fit text-12 font-bold text-text-dim-5 hover:text-foreground">{item.group} ›</button>
          <h2 className="text-28 font-extrabold">{item.title}</h2>
          <button type="button" onClick={copy} className="inline-flex w-fit items-center gap-1.5 rounded-md bg-surface-3 px-2.5 py-1 text-13 hover:bg-surface-4" title="번호 복사" data-testid="style-guide-copy">
            <code>{item.id}</code>{copied ? <Check className="size-4" aria-hidden="true" /> : <Copy className="size-4" aria-hidden="true" />}
          </button>
          {item.note && <p className="max-w-[65ch] text-14 text-text-dim-3">{item.note}</p>}
        </header>

        <div className="rounded-xl border border-border-subtle bg-surface p-8" data-testid="style-guide-story">{item.story()}</div>

        <div className="flex flex-col gap-2">
          <h3 className="text-14 font-bold">쓰는 화면</h3>
          {screens.length === 0
            ? <p className="text-13 text-text-dim-4">{item.selector ? '앱 화면에서 아직 안 쓴다.' : '토큰 — 모든 화면이 쓴다.'}</p>
            : <div className="flex flex-wrap gap-2">{screens.map((screen) => <Button key={screen.name} type="button" variant="outline" size="sm" disabled={!screen.route} onClick={() => go(screen)} title={screen.hint}>
              {screen.name}{'count' in screen && screen.count ? <span className="text-text-dim-5">{screen.count}</span> : null}
            </Button>)}</div>}
          {found && <p className="text-13 font-semibold text-text-dim-3" data-testid="style-guide-found">{found}</p>}
        </div>
      </div>}
    </section>

    <aside className="flex min-h-0 flex-col items-center gap-2 border-l border-border-subtle bg-surface-3 px-4 py-5">
      <span className="text-12 font-semibold text-text-dim-4">미리보기 · <code>{frameSrc}</code></span>
      <iframe ref={frame} src={frameSrc} onLoad={onFrameLoad} title="미리보기" className="w-[390px] flex-1 rounded-xl border border-border bg-card shadow-md" data-testid="style-guide-preview" />
    </aside>
  </main>
}
