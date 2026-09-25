import { registerSW } from 'virtual:pwa-register'
import { showAppNotice } from './appNotice'
import { flushWork } from './workGuard'

/**
 * 새 버전은 저절로 바꾸지 않는다(`registerType: 'prompt'`). 알림을 띄우고, 누르면 저장부터 한 뒤 바꾼다.
 * 옛 서비스 워커가 옛 조각을 계속 내주므로 편집 도중 추출이 끊기지 않는다. 그래도 조각을 못 받으면 같은 알림.
 */

let reloadApp: () => Promise<void> = async () => { window.location.reload() }

async function applyUpdate(): Promise<void> {
  if (!(await flushWork())) {
    showAppNotice('update', {
      tone: 'error',
      message: '저장 못 한 변경이 있어요. 인터넷 연결을 확인하고 다시 눌러 주세요.',
      actions: [{ label: '새로고침', run: () => void applyUpdate() }],
      dismissable: true,
    })
    return
  }
  await reloadApp()
}

function showUpdateNotice(): void {
  showAppNotice('update', {
    tone: 'info',
    message: '새 버전이 있어요.',
    actions: [{ label: '새로고침', run: () => void applyUpdate() }],
    dismissable: true,
  }, { once: true })
}

let watching = false

export function watchAppUpdate(): void {
  if (watching) return
  watching = true
  const updateSW = registerSW({
    onNeedRefresh() {
      // 기다리는 새 워커에게 자리를 넘기면 플러그인이 페이지를 새로 불러온다.
      reloadApp = () => updateSW(true)
      showUpdateNotice()
    },
  })
  // 늦게 부르는 조각(추출 등)을 못 받았다. 배포 사이에 옛 조각이 사라진 경우.
  window.addEventListener('vite:preloadError', () => { showUpdateNotice() })
}
