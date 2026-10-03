import { registerSW } from 'virtual:pwa-register'
import { showAppNotice } from './appNotice'
import { useRouteStore } from './router'
import { flushWork } from './workGuard'

/**
 * 새 버전은 저절로 바꾸지 않는다(`registerType: 'prompt'`). 알림도 띄우지 않고 안전한 순간을 기다린다
 * (플랜 `2026-10-03_새-버전-조용히-적용`): 탭이 가려질 때 · 화면을 옮길 때 중 먼저 오는 때에 저장부터 한 뒤 바꾼다.
 * 끄는 중(포인터 눌림)이면 건너뛰고 다음 순간을 기다린다. 저장을 못 하면 오류 알림.
 * 옛 서비스 워커가 옛 조각을 계속 내주므로 편집 도중 추출이 끊기지 않는다. 그래도 조각을 못 받으면 화면이 깨진 것이라 바로 알린다.
 */

/** 기다리는 새 버전으로 바꾸는 함수. 새 버전이 없으면 null. */
let pendingReload: (() => Promise<void>) | null = null
let applying = false
/** 지금 눌린 포인터. 하나라도 있으면 끄는 중으로 본다. */
const pointersDown = new Set<number>()

async function applyUpdate(reload: () => Promise<void>): Promise<boolean> {
  if (!(await flushWork())) {
    showAppNotice('update', {
      tone: 'error',
      message: '저장 못 한 변경이 있어요. 인터넷 연결을 확인하고 다시 눌러 주세요.',
      actions: [{ label: '새로고침', run: () => void applyUpdate(reload) }],
      dismissable: true,
    })
    return false
  }
  await reload()
  return true
}

/** 새 버전이 준비됐다. 알림 없이 다음 안전한 순간을 기다린다. */
export function markUpdateReady(reload: () => Promise<void>): void {
  pendingReload = reload
}

/** 안전한 순간에 부른다. 새 버전이 있고 끄는 중이 아니면 저장 → 새로고침. 바꿨으면 true. */
export async function applyUpdateIfSafe(): Promise<boolean> {
  const reload = pendingReload
  if (!reload || applying || pointersDown.size > 0) return false
  applying = true
  try {
    return await applyUpdate(reload)
  } finally {
    applying = false
  }
}

function showBrokenChunkNotice(): void {
  showAppNotice('update', {
    tone: 'info',
    message: '새 버전이 있어요.',
    actions: [{ label: '새로고침', run: () => void applyUpdate(pendingReload ?? (async () => { window.location.reload() })) }],
    dismissable: true,
  }, { once: true })
}

/** 개발 서버 전용 새 버전 흉내(`?fakeUpdate=1`). 바꾸면 표시를 남기고 쿼리를 뗀 주소로 다시 연다. */
export const FAKE_UPDATE_APPLIED_KEY = 'font-maker:fake-update-applied'
function watchFakeUpdate(): void {
  const url = new URL(window.location.href)
  if (url.searchParams.get('fakeUpdate') !== '1') return
  url.searchParams.delete('fakeUpdate')
  markUpdateReady(async () => {
    window.sessionStorage.setItem(FAKE_UPDATE_APPLIED_KEY, String(Date.now()))
    window.location.replace(url.href)
  })
}

let watching = false

export function watchAppUpdate(): void {
  if (watching) return
  watching = true
  const updateSW = registerSW({
    onNeedRefresh() {
      // 기다리는 새 워커에게 자리를 넘기면 플러그인이 페이지를 새로 불러온다.
      markUpdateReady(() => updateSW(true))
    },
  })
  if (import.meta.env.DEV) watchFakeUpdate()

  window.addEventListener('pointerdown', (event) => { pointersDown.add(event.pointerId) }, { capture: true })
  const release = (event: PointerEvent) => { pointersDown.delete(event.pointerId) }
  window.addEventListener('pointerup', release, { capture: true })
  window.addEventListener('pointercancel', release, { capture: true })

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') void applyUpdateIfSafe()
  })
  useRouteStore.subscribe((state, prev) => {
    if (state.key !== prev.key) void applyUpdateIfSafe()
  })

  // 늦게 부르는 조각(추출 등)을 못 받았다. 배포 사이에 옛 조각이 사라진 경우.
  window.addEventListener('vite:preloadError', () => { showBrokenChunkNotice() })
}

export function resetAppUpdateForTest(): void {
  pendingReload = null
  applying = false
  pointersDown.clear()
}

export function setPointerDownForTest(pointerId: number, down: boolean): void {
  if (down) pointersDown.add(pointerId)
  else pointersDown.delete(pointerId)
}
