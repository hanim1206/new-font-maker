import { useEffect, useRef, useState } from 'react'
import { AppGlyph } from './AppGlyph'
import { allCorpusRows, CORPUS_TOTAL, corpusIdentity } from './notoCorpus'
import type { CorpusRow, CorpusSnapshot } from './notoCorpus'
import { NotoCorpusMatrix } from './NotoCorpusMatrix'
import { MobileWorkspaceShell } from './workspace/WorkspaceChrome'
import styles from './ReviewWorkspacePage.module.css'

/**
 * 검수 탭. 지금 프로젝트의 글자를 격자(표)로 한눈에 훑는 뷰어다.
 * 칸은 프로젝트 획으로 그린다(`AppGlyph`). Noto 추출 결과·xor·승인 측정은 여기서 안 읽는다 — 그건 랩(`/noto-corpus-lab`) 몫.
 * 글자를 열면 자소 탭의 `레이아웃` 모드로 간다. 기준선 편집부는 `GlyphLayoutEditor`.
 * 옛 글자 화면 주소(`/workspace/review/glyph`)는 같은 글자의 자소 탭으로 넘긴다.
 */

const GLYPH_PATH = '/workspace/review/glyph'

function codepointFromUrl(): number {
  const character = new URLSearchParams(window.location.search).get('char') ?? ''
  const codepoint = character.codePointAt(0) ?? 0
  return codepoint >= 0xac00 && codepoint < 0xac00 + CORPUS_TOTAL ? codepoint : 0xac00
}

function glyphHref(codepoint: number): string {
  return `/workspace/jamo?char=${encodeURIComponent(String.fromCodePoint(codepoint))}&mode=layout&solo=1`
}

// 글자 목록은 앱이 만든다. 추출 결과가 없는 빈 snapshot이면 11,172자가 전부 빈 행으로 나온다.
const ROWS: CorpusRow[] = allCorpusRows({ rows: [] } as unknown as CorpusSnapshot)
const NO_REVIEWS = {}

/**
 * 화면에 들어온 칸만 그린다. 시트 하나가 최대 588칸인데 글자 하나가 칸 해석 + 획 렌더라,
 * 한꺼번에 그리면 시트를 바꿀 때마다 1초 넘게 멈춘다(9/21 측정). 한 번 그린 칸은 그대로 둔다.
 */
const CELL_GLYPH_SIZE = 32
const visibleCallbacks = new WeakMap<Element, () => void>()
let cellObserver: IntersectionObserver | null = null
function observeCell(element: Element, onVisible: () => void): () => void {
  cellObserver ??= new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue
      visibleCallbacks.get(entry.target)?.()
      visibleCallbacks.delete(entry.target)
      cellObserver?.unobserve(entry.target)
    }
  }, { rootMargin: '160px' })
  visibleCallbacks.set(element, onVisible)
  cellObserver.observe(element)
  return () => { visibleCallbacks.delete(element); cellObserver?.unobserve(element) }
}

function LazyCellGlyph({ char }: { char: string }) {
  const holder = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => holder.current && !visible ? observeCell(holder.current, () => setVisible(true)) : undefined, [visible])
  return visible
    ? <AppGlyph char={char} size={CELL_GLYPH_SIZE} />
    : <span ref={holder} className={styles.cellHolder} aria-hidden="true" />
}

const renderCell = (row: CorpusRow) => <LazyCellGlyph char={row.identity.character} />

function GridScreen() {
  const [selected, setSelected] = useState(codepointFromUrl)
  const identity = corpusIdentity(selected)

  return <MobileWorkspaceShell activeArea="review" statusLabel="검수 · 글자 격자">
    <div className={styles.scroll}>
      {/* 칸 탭 = 선택, 선택된 칸 다시 탭 = 글자 화면. 키보드 화살표 이동은 선택만 바꾼다. */}
      <div className={styles.matrixSection}><NotoCorpusMatrix rows={ROWS} reviews={NO_REVIEWS} selected={selected} onSelect={(codepoint) => { if (codepoint === selected) window.location.assign(glyphHref(codepoint)); else setSelected(codepoint) }} isHighlighted={() => true} noFinal={false} renderCell={renderCell} variant="viewer" /></div>
      <a className={styles.pick} href={glyphHref(selected)} data-testid="review-pick">
        <AppGlyph char={identity.character} size={76} />
        <span className={styles.pickBody}>
          <strong>선택 · {identity.character}</strong>
          <small>{identity.initialJamo} + {identity.medialJamo}{identity.finalJamo ? ` + ${identity.finalJamo}` : ' · 받침 없음'}</small>
          <small className={styles.hint}>카드 탭 또는 같은 칸 다시 탭 → 글자 열기</small>
        </span>
        <span aria-hidden="true">›</span>
      </a>
    </div>
  </MobileWorkspaceShell>
}


export function ReviewWorkspacePage() {
  const legacyGlyph = window.location.pathname === GLYPH_PATH
  useEffect(() => { if (legacyGlyph) window.location.replace(glyphHref(codepointFromUrl())) }, [legacyGlyph])
  return legacyGlyph ? null : <GridScreen />
}
