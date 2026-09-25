import { Component, useState } from 'react'
import type { ErrorInfo, ReactNode } from 'react'
import { recentErrors, recordError } from './errorLog'
import styles from './SafetyScreen.module.css'
import { downloadWorkBackup, flushWork } from './workGuard'

/**
 * 모든 화면의 뿌리(`main.tsx`). 그리다 던지면 흰 화면 대신 오류 화면을 띄운다.
 * 이벤트 · `await` 속 예외는 여기로 오지 않는다 — `errorLog`가 기록만 한다.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: unknown }> {
  state: { error: unknown } = { error: null }

  static getDerivedStateFromError(error: unknown): { error: unknown } {
    return { error: error ?? new Error('알 수 없는 오류') }
  }

  componentDidCatch(error: unknown, info: ErrorInfo): void {
    recordError(error, 'render', info.componentStack ?? undefined)
  }

  render(): ReactNode {
    if (this.state.error) return <AppErrorScreen />
    return this.props.children
  }
}

/** 다시 불러올 주소. 개발용 강제 오류(`?crash=`)는 떼어 낸다. */
function reloadUrl(): string {
  const url = new URL(window.location.href)
  url.searchParams.delete('crash')
  return url.toString()
}

export function AppErrorScreen() {
  const [backup, setBackup] = useState<'idle' | 'done' | 'raw' | 'failed'>('idle')
  const [reloading, setReloading] = useState(false)
  const details = recentErrors().map((entry) => `[${entry.at} · ${entry.source}] ${entry.message}${entry.stack ? `\n${entry.stack}` : ''}`).join('\n\n')

  const takeBackup = () => {
    try {
      setBackup(downloadWorkBackup().raw ? 'raw' : 'done')
    } catch {
      setBackup('failed')
    }
  }
  const reload = async () => {
    setReloading(true)
    // 못 올린 변경은 먼저 올려 본다. 못 올려도 브라우저 사본에 남아 다시 열 때 올린다.
    await flushWork()
    window.location.replace(reloadUrl())
  }

  return (
    <main className={styles.page} role="alert">
      <div className={styles.card} data-testid="app-error-screen">
        <header>
          <h1>문제가 생겼어요</h1>
          <p>화면을 그리다 멈췄어요. 작업은 이 기기와 계정에 남아 있어요. 걱정되면 먼저 백업을 받아 두세요.</p>
        </header>
        <button type="button" className={styles.secondary} onClick={takeBackup} data-testid="app-error-backup">작업 백업 받기</button>
        {backup === 'done' && <p className={styles.note}>백업 파일을 받았어요.</p>}
        {backup === 'raw' && <p className={styles.note}>백업 파일을 받았어요(브라우저에 남은 원본 그대로).</p>}
        {backup === 'failed' && <p className={styles.note}>백업을 만들지 못했어요. 이 화면을 캡처해 초대한 사람에게 보내 주세요.</p>}
        <button type="button" className={styles.primary} onClick={() => void reload()} disabled={reloading} data-testid="app-error-reload">다시 불러오기</button>
        <details className={styles.details}>
          <summary>자세히</summary>
          <pre data-testid="app-error-details">{details || '기록 없음'}</pre>
        </details>
      </div>
    </main>
  )
}
