import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { BookOpenText, X } from 'lucide-react'
import { findReferences, resolveReference, screenSpecForPath } from './screenSpec'
import type { ScreenSpec, ScreenSpecBlock } from './screenSpec'
import styles from './ScreenSpecButton.module.css'

/**
 * 개발 서버 전용. 지금 주소의 화면 명세(`docs/specs/화면/`)를 그대로 띄우는 떠 있는 버튼.
 * 명세를 화면용으로 다시 쓰지 않는다. 다른 화면을 번호로 가리킨 줄은 그 자리에서 펼쳐 볼 수 있다.
 * `main.tsx`가 `import.meta.env.DEV`일 때만 불러오므로 배포 빌드에는 들어가지 않는다.
 */

const OPEN_STORAGE_KEY = 'dev-screen-spec-open-v1'

function readOpen(): boolean {
  try { return localStorage.getItem(OPEN_STORAGE_KEY) === 'on' } catch { return false }
}
function writeOpen(open: boolean) {
  try { localStorage.setItem(OPEN_STORAGE_KEY, open ? 'on' : 'off') } catch { /* 저장 못 해도 화면은 동작 */ }
}

/** `코드`와 **굵게**만 푼다. 명세가 쓰는 표시는 이 둘뿐이다. */
function inline(text: string): ReactNode[] {
  return text.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).filter(Boolean).map((piece, index) => piece.startsWith('`')
    ? <code key={index}>{piece.slice(1, -1)}</code>
    : piece.startsWith('**') ? <strong key={index}>{piece.slice(2, -2)}</strong> : piece)
}

function Feature({ block, specs, names }: { block: Extract<ScreenSpecBlock, { kind: 'feature' }>; specs: readonly ScreenSpec[]; names: readonly string[] }) {
  const references = findReferences(block.text, names)
  return <li className={styles.feature} data-numbered={block.number ? 'true' : 'false'} data-testid="screen-spec-feature">
    {block.number && <span className={styles.number}>{block.number}</span>}
    <span>{inline(block.text)}</span>
    {references.map((reference, index) => {
      const lines = resolveReference(specs, reference)
      if (lines.length === 0) return null
      const label = `${reference.name} ${reference.section}${reference.from === undefined ? '' : reference.from === reference.to ? `.${reference.from}` : `.${reference.from}~${reference.section}.${reference.to}`}`
      return <details key={index} className={styles.reference} data-testid="screen-spec-reference">
        <summary>{label} 펼치기 · {lines.length}줄</summary>
        <ul>{lines.map((line) => <li key={line.number ?? line.text} className={styles.feature} data-numbered={line.number ? 'true' : 'false'}>{line.number && <span className={styles.number}>{line.number}</span>}<span>{inline(line.text)}</span></li>)}</ul>
      </details>
    })}
  </li>
}

function SpecBody({ spec, specs, names }: { spec: ScreenSpec; specs: readonly ScreenSpec[]; names: readonly string[] }) {
  // 영역 제목 아래 기능 줄을 한 목록으로 묶는다.
  const groups: { head: ScreenSpecBlock | null; features: Extract<ScreenSpecBlock, { kind: 'feature' }>[] }[] = []
  for (const block of spec.blocks) {
    if (block.kind === 'feature' && groups.length > 0) groups[groups.length - 1].features.push(block)
    else groups.push({ head: block, features: [] })
  }
  return <>{groups.map((group, index) => <div key={index}>
    {group.head?.kind === 'title' && <h2 className={styles.title}>{group.head.text}</h2>}
    {group.head?.kind === 'section' && <h3 className={styles.section}><span>{group.head.number}</span>{group.head.title}</h3>}
    {group.head?.kind === 'note' && <p className={styles.note}>{inline(group.head.text)}</p>}
    {group.features.length > 0 && <ul className={styles.features}>{group.features.map((feature, featureIndex) => <Feature key={feature.number ?? featureIndex} block={feature} specs={specs} names={names} />)}</ul>}
  </div>)}</>
}

export function ScreenSpecButton({ specs, pathname }: { specs: readonly ScreenSpec[]; pathname: string }) {
  const [open, setOpen] = useState(readOpen)
  const spec = useMemo(() => screenSpecForPath(specs, pathname), [specs, pathname])
  const names = useMemo(() => specs.map((item) => item.name), [specs])
  const toggle = (next: boolean) => { writeOpen(next); setOpen(next) }
  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') { writeOpen(false); setOpen(false) } }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  return <>
    <button type="button" className={styles.button} aria-pressed={open} aria-label="화면 명세" title="화면 명세 (개발용)" data-has-spec={spec ? 'true' : 'false'} data-testid="screen-spec-button" onClick={() => toggle(!open)}>
      <span className={styles.tab}><BookOpenText size={18} /></span>
    </button>
    {open && <aside className={styles.panel} aria-label="화면 명세" data-testid="screen-spec-panel">
      <header className={styles.head}>
        <div>
          <strong>{spec ? spec.name : '명세 없음'}</strong>
          <span><code>{pathname}</code>{spec && <> · {spec.status} · {spec.updated}</>}</span>
        </div>
        <button type="button" onClick={() => toggle(false)} aria-label="화면 명세 닫기"><X size={18} /></button>
      </header>
      <div className={styles.body}>
        {spec ? <SpecBody spec={spec} specs={specs} names={names} /> : <p className={styles.note}>이 주소의 명세 파일이 <code>docs/specs/화면/</code>에 없습니다.</p>}
        <details className={styles.all} open={!spec}>
          <summary>전체 화면 · {specs.length}개</summary>
          <ul>{specs.map((item) => <li key={item.route}><a href={item.route} aria-current={item.route === spec?.route ? 'page' : undefined}><strong>{item.name}</strong><code>{item.route}</code><span>{item.status}</span></a></li>)}</ul>
        </details>
      </div>
    </aside>}
  </>
}
