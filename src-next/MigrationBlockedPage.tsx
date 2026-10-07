import { useState } from 'react'
import styles from './SafetyScreen.module.css'
import { Button } from './components/ui/button'
import { downloadWorkBackup } from './workGuard'

/** 옛 배치 데이터를 새 형식으로 못 옮겼다. 편집 화면은 열지 않고 원본은 이 기기에 그대로 둔다(`layoutProfileMigrationBootstrap`). */
export function MigrationBlockedPage({ detail }: { detail?: string }) {
  const [backup, setBackup] = useState<'idle' | 'done' | 'failed'>('idle')
  const takeBackup = () => {
    try {
      downloadWorkBackup()
      setBackup('done')
    } catch {
      setBackup('failed')
    }
  }
  return (
    <main className={styles.page} role="alert">
      <div className={styles.card} data-testid="migration-blocked">
        <header>
          <h1>작업을 여는 중에 멈췄어요</h1>
          <p>예전 작업을 새 형식으로 옮기지 못했어요. 원본은 이 기기에 그대로 있어요. 혹시 모르니 백업을 받아 두세요.</p>
        </header>
        <Button type="button" size="block" variant="default" onClick={takeBackup}>작업 백업 받기</Button>
        {backup === 'done' && <p className={styles.note}>백업 파일을 받았어요.</p>}
        {backup === 'failed' && <p className={styles.note}>백업을 만들지 못했어요. 이 화면을 캡처해 hangulkangul@gmail.com으로 보내 주세요.</p>}
        {detail && <details className={styles.details}><summary>자세히</summary><pre>{detail}</pre></details>}
      </div>
    </main>
  )
}
