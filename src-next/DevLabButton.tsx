import { useEffect, useState } from 'react'
import { FlaskConical, X } from 'lucide-react'
import { LAB_SCREEN_ROUTES } from './screenRoutes'
import styles from './DevLabButton.module.css'

/** 랩 주소의 이름. 목록은 `screenRoutes.ts`가 정하고 여기선 이름만 붙인다. 이름이 없으면 주소 그대로. */
const LAB_NAMES: Record<string, string> = {
  '/grid-lab': '형태 그리드',
  '/rule-lab': '규칙',
  '/noto-corpus-lab': '노토 코퍼스',
  '/reference-lab': '레퍼런스',
  '/reference-group-lab': '레퍼런스 묶음',
  '/stroke-grammar-lab': '획 문법',
  '/preset-candidate-lab': '프리셋 후보',
  '/font-guide-lab': '기준선(Font Guide)',
  '/five-guide-lab': '다섯 보선',
  '/global-style-preview': '글로벌 스타일 미리보기',
}

/** 개발 서버에서만 뜨는 개발용 주소(`main.tsx`의 `import.meta.env.DEV` 분기). */
const DEV_ONLY_ROUTES = ['/global-style-preview'] as const

/** 개발 서버 전용 실험실 목록. 화면 명세 탭 바로 아래 탭. */
export function DevLabButton({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false)
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])
  const routes = [...LAB_SCREEN_ROUTES, ...DEV_ONLY_ROUTES]

  return <>
    <button type="button" className={styles.button} aria-pressed={open} aria-label="실험실 목록" title="실험실 목록 (개발용)" data-testid="dev-lab-button" onClick={() => setOpen((value) => !value)}>
      <span className={styles.tab}><FlaskConical size={18} /></span>
    </button>
    {open && <>
      <div className={styles.backdrop} onClick={() => setOpen(false)} aria-hidden="true" />
      <nav className={styles.panel} aria-label="실험실 목록" data-testid="dev-lab-panel">
        <header>
          <strong>실험실</strong>
          <button type="button" onClick={() => setOpen(false)} aria-label="실험실 목록 닫기"><X size={18} /></button>
        </header>
        <ul>
          {routes.map((route) => <li key={route}>
            <a href={route} aria-current={route === pathname ? 'page' : undefined}>
              <span>{LAB_NAMES[route] ?? route}</span>
              <code>{route}</code>
            </a>
          </li>)}
        </ul>
        <a className={styles.home} href="/workspace/jamo">앱으로 (자소 편집)</a>
      </nav>
    </>}
  </>
}
