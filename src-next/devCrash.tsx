import { useEffect } from 'react'

/**
 * 개발 서버 전용 강제 오류(G0 확인용). `?crash=render` 그리다 던짐, `?crash=event` 이벤트 속 예외, `?crash=promise` 잡히지 않은 거절.
 * 배포 빌드에서는 `main.tsx`의 `import.meta.env.DEV` 분기와 함께 빠진다.
 */
export function DevCrashProbe() {
  const mode = new URLSearchParams(window.location.search).get('crash')
  useEffect(() => {
    if (mode === 'event') setTimeout(() => { throw new Error('개발용 강제 오류(event)') }, 0)
    if (mode === 'promise') void Promise.reject(new Error('개발용 강제 오류(promise)'))
  }, [mode])
  if (mode === 'render') throw new Error('개발용 강제 오류(render)')
  return null
}
