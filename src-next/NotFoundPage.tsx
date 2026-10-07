import styles from './NotFoundPage.module.css'
import { Button } from './components/ui/button'
import { usePageTitle } from './pageTitle'
import { navigate, onLinkClick } from './router'

/** 없는 주소. 어느 화면 아래든 같은 전체 화면 한 장. */
export function NotFoundPage() {
  usePageTitle('없는 페이지')
  return (
    <main className={styles.page} data-testid="not-found">
      <a className={styles.top} href="/dashboard" onClick={onLinkClick}>
        <img src="/favicon.svg" alt="" />한글칸글
      </a>
      <div className={styles.body}>
        <svg className={styles.mark} viewBox="0 0 273 273" aria-hidden="true">
          <path className={styles.ch} d="M84.5 22A50 50 0 0 1 134.5 72A50 50 0 0 1 84.5 122A50 50 0 0 1 34.5 72A50 50 0 0 1 84.5 22Z" />
          <path className={styles.jo} d="M64.5 151H104.5A30 30 0 0 1 134.5 181V221A30 30 0 0 1 104.5 251H64.5A30 30 0 0 1 34.5 221V181A30 30 0 0 1 64.5 151Z" />
          <path className={styles.ju} d="M186 22H238.5V228.5A22.5 22.5 0 0 1 216 251H163.5V44.5A22.5 22.5 0 0 1 186 22Z" />
        </svg>
        <h1>404</h1>
        <p>없는 페이지예요. 주소가 바뀌었거나 사라졌어요.<br />만들던 폰트는 그대로 있어요.</p>
        <Button type="button" size="sheet" variant="default" className={styles.action} onClick={() => navigate('/dashboard')}>내 폰트로 가기</Button>
      </div>
    </main>
  )
}
