import { createRoot } from 'react-dom/client'
import { ScreenSpecButton } from './ScreenSpecButton'
import { parseScreenSpec } from './screenSpec'

/** 화면 명세 버튼을 앱과 따로 떨어진 루트에 붙인다. 랩을 포함한 모든 주소에서 같은 버튼이 뜬다. 개발 서버 전용. */
export function mountScreenSpecButton(): void {
  // `_트리.md`처럼 `_`로 시작하는 파일은 화면 하나의 명세가 아니다.
  const files = import.meta.glob<string>(['../docs/specs/화면/*.md', '!../docs/specs/화면/_*.md'], { query: '?raw', import: 'default', eager: true })
  const specs = Object.values(files).map(parseScreenSpec).filter((spec) => spec.route).sort((a, b) => a.route.localeCompare(b.route))
  const host = document.createElement('div')
  host.id = 'dev-screen-spec'
  document.body.appendChild(host)
  createRoot(host).render(<ScreenSpecButton specs={specs} pathname={window.location.pathname} />)
}
