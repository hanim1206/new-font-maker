import type { MouseEvent } from 'react'
import { create } from 'zustand'

/**
 * 얇은 라우터. 화면 이동을 `pushState`로 해서 앱이 새로고침 없이 화면만 바꾼다.
 * 되돌리기 기록 · Noto 모델처럼 메모리에 든 것이 화면을 오가도 남는다.
 *
 * 주소의 쿼리(`?char=`)는 여기서 들지 않는다 — 화면이 열릴 때 `window.location.search`를 직접 읽고,
 * 읽은 뒤 `replaceState`로 지우는 지금 방식 그대로다. `key`는 이동마다 바뀌어 같은 경로로 다시 들어와도 화면이 새로 열리게 한다.
 */
interface RouteState {
  pathname: string
  /** 이동마다 바뀌는 열쇠. 화면 `key`로 쓰면 같은 경로라도 새 주소로 들어올 때 다시 연다. */
  key: string
}

const readLocation = (): RouteState => ({
  pathname: window.location.pathname,
  key: `${window.location.pathname}${window.location.search}`,
})

export const useRouteStore = create<RouteState>(() => (typeof window === 'undefined' ? { pathname: '/', key: '/' } : readLocation()))

/** 바로 앞 화면의 경로. 의견을 보낼 때 어디서 왔는지 적는다(계정 페이지는 거쳐 가는 곳이라 건너뛴다). */
let previousPath: string | null = null
function moved(): void {
  const from = useRouteStore.getState().pathname
  if (!from.startsWith('/account')) previousPath = from
  useRouteStore.setState(readLocation())
}
export function previousPathname(): string | null {
  return previousPath
}

if (typeof window !== 'undefined') {
  window.addEventListener('popstate', moved)
}

/**
 * 떠나기 전에 묻는 문. 저장 안 한 초안이 있는 화면이 건다(레이아웃 초안의 `저장하고 계속` 시트).
 * 새로고침은 `beforeunload`가 맡지만 `pushState` 이동은 브라우저가 안 물어서 여기서 같은 시트를 거친다.
 */
type NavigationGuard = (proceed: () => void) => void
let navigationGuard: NavigationGuard | null = null
export function setNavigationGuard(guard: NavigationGuard | null): void {
  navigationGuard = guard
}

/** 같은 앱 안의 주소로 간다. 다른 출처면 브라우저에 맡긴다. `replace`(옛 주소 넘기기)는 묻지 않는다. */
export function navigate(to: string, options: { replace?: boolean } = {}): void {
  const url = new URL(to, window.location.href)
  if (url.origin !== window.location.origin) { window.location.assign(url.href); return }
  const go = () => {
    if (options.replace) window.history.replaceState(null, '', url)
    else window.history.pushState(null, '', url)
    moved()
  }
  if (navigationGuard && !options.replace) navigationGuard(go)
  else go()
}

export function usePathname(): string {
  return useRouteStore((state) => state.pathname)
}

export function useRouteKey(): string {
  return useRouteStore((state) => state.key)
}

/**
 * `<a href>`의 클릭을 라우터로 돌린다. `href`는 남겨 두어 새 탭 · 복사 · 접근성은 그대로다.
 * 보조키(⌘ · Ctrl · Shift)를 누른 클릭은 브라우저에 맡긴다.
 */
export function onLinkClick(event: MouseEvent<HTMLAnchorElement>): void {
  if (event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
  const href = event.currentTarget.getAttribute('href')
  if (!href) return
  event.preventDefault()
  navigate(href)
}
