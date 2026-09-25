import { requestStealAndReload } from './editLock'
import styles from './SafetyScreen.module.css'

/** 같은 폰트를 다른 탭이 편집 중일 때. `lost`면 이 탭이 쓰다가 다른 탭에 넘겨준 것. */
export function EditLockedPage({ lost }: { lost: boolean }) {
  return (
    <main className={styles.page} role="alert">
      <div className={styles.card} data-testid="edit-locked" data-lost={lost || undefined}>
        <header>
          <h1>{lost ? '다른 탭에서 이 폰트를 열었어요' : '다른 탭에서 편집 중이에요'}</h1>
          <p>같은 폰트는 한 탭에서만 고칠 수 있어요. 두 곳에서 고치면 한쪽 작업이 덮여요.</p>
        </header>
        <button type="button" className={styles.primary} onClick={requestStealAndReload} data-testid="edit-locked-take">여기서 열기</button>
        <p className={styles.note}>{lost ? '여기서 열면 다른 탭은 멈춰요.' : '여기서 열면 다른 탭은 멈추고, 거기서 고친 것도 이어져요.'}</p>
      </div>
    </main>
  )
}
