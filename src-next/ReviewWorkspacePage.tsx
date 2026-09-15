import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { finalGlyphInkToSvgPath, materializeFinalGlyphInk } from '../src/services/finalGlyphInk'
import { notoOutlineToInkPrimitives } from '../src/services/notoOutlineInk'
import type { NotoOutline } from '../src/services/notoOutlineInk'
import type { StrokeRenderStyle } from '../src/types'
import { approvedNotoInputs, createNotoBoundMaster, railEditRange, renderNotoBoundMaster } from './notoBoundMaster'
import type { ApprovedNotoInput, BoundMaster, RailEdits } from './notoBoundMaster'
import { allCorpusRows, CORPUS_TOTAL, corpusIdentity, parseCorpusReviews, REVIEW_STORAGE_KEY } from './notoCorpus'
import type { CorpusReviews, CorpusSnapshot } from './notoCorpus'
import { NotoCorpusMatrix } from './NotoCorpusMatrix'
import { notoPresetGlyphs } from './notoPresetGlyphs'
import type { NotoPresetGlyph } from './notoPresetGlyphs'
import { RulerStrip } from './workspace/RulerStrip'
import { MobileWorkspaceShell } from './workspace/WorkspaceChrome'
import styles from './ReviewWorkspacePage.module.css'

/**
 * 검수 탭. 글자 격자에서 고른 글자를 Noto 실측 윤곽으로 보여준다.
 * 승인 추출이 있는 글자(57자)는 기준선 결속 마스터로 편집하고, 나머지는 윤곽과 실측 기준선만 읽는다.
 * 윤곽은 두 층 모두 `InkRegion` union 파이프라인을 지나므로 화면과 OTF가 같은 면을 본다.
 */

// 면(region) primitive만 넘기므로 중심선 스타일은 쓰이지 않지만 계약상 필요하다.
const NOTO_INK_STYLE: StrokeRenderStyle = { mode: 'brush', brush: { tip: 'round', aspectRatio: 1, angle: 0 } }
const INK_OPTIONS = { unitsPerEm: 1000, maxCurveErrorFontUnits: 0.5 }
const VIEW_BOX = '-0.08 -0.08 1.16 1.16'
const GRID_PATH = '/workspace/review'
const GLYPH_PATH = '/workspace/review/glyph'
// export 기준선 id → 축·표시 이름. 길이(visibleLength) 타깃은 좌표가 아니라 그리지 않는다.
const BASELINE_RAILS: Record<string, { axis: 'x' | 'y'; label: string }> = {
  'initial.roleFaces.left': { axis: 'x', label: 'CH 왼선' }, 'initial.roleFaces.right': { axis: 'x', label: 'CH 오른선' },
  'initial.roleFaces.top': { axis: 'y', label: 'CH 윗선' }, 'initial.roleFaces.bottom': { axis: 'y', label: 'CH 밑선' },
  'final.roleFaces.right': { axis: 'x', label: 'JO 오른선' }, 'final.roleFaces.top': { axis: 'y', label: 'JO 윗선' },
  'medial.primaryBeam.face': { axis: 'y', label: 'JU 가로보' }, 'medial.upperBeam.face': { axis: 'y', label: 'JU 위보' }, 'medial.lowerBeam.face': { axis: 'y', label: 'JU 아래보' },
  'medial.baseStem.face': { axis: 'x', label: 'JU 줄기' }, 'medial.leftStem.face': { axis: 'x', label: 'JU 왼줄기' }, 'medial.rightStem.face': { axis: 'x', label: 'JU 오른줄기' },
}

interface Rail { id: string; axis: 'x' | 'y'; label: string; value: number }

// 마스터 rail 이름을 캔버스·칩·슬라이더가 같은 짧은 이름으로 부른다.
const shortLabel = (label: string) => label.replace('첫닿자 ', 'CH ').replace('홀자 ', 'JU ')

function inkPathOf(outline: NotoOutline, codepoint: number): { path: string } | { error: string } {
  const primitives = notoOutlineToInkPrimitives({ glyphId: `review:${codepoint}`, codepoint, outline })
  if (!primitives.ok) return { error: primitives.message }
  const ink = materializeFinalGlyphInk(primitives.primitives, NOTO_INK_STYLE, INK_OPTIONS)
  return ink.ok ? { path: finalGlyphInkToSvgPath(ink.ink, 1) } : { error: ink.message }
}

function codepointFromUrl(): number {
  const character = new URLSearchParams(window.location.search).get('char') ?? ''
  const codepoint = character.codePointAt(0) ?? 0
  return codepoint >= 0xac00 && codepoint < 0xac00 + CORPUS_TOTAL ? codepoint : 0xac00
}

function glyphHref(codepoint: number): string {
  return `${GLYPH_PATH}?char=${encodeURIComponent(String.fromCodePoint(codepoint))}`
}

function loadReviews(): CorpusReviews {
  try { return parseCorpusReviews(localStorage.getItem(REVIEW_STORAGE_KEY)) } catch { return {} }
}

async function getJson<T>(url: string, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal, cache: 'no-store' })
  const value = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error((value as { error?: string }).error ?? '자료를 읽지 못했습니다.')
  return value as T
}

function useNotoGlyph(codepoint: number): { glyph: NotoPresetGlyph | null; error: string } {
  const [state, setState] = useState<{ codepoint: number; glyph: NotoPresetGlyph | null; error: string }>({ codepoint, glyph: null, error: '' })
  useEffect(() => {
    const controller = new AbortController()
    setState({ codepoint, glyph: null, error: '' })
    notoPresetGlyphs.glyph(codepoint, controller.signal)
      .then((glyph) => setState({ codepoint, glyph, error: '' }))
      .catch((failure: Error) => { if (!controller.signal.aborted) setState({ codepoint, glyph: null, error: failure.message }) })
    return () => controller.abort()
  }, [codepoint])
  return state.codepoint === codepoint ? state : { glyph: null, error: '' }
}

// 승인 번들은 모듈 상수라 codepoint 인덱스를 한 번만 만든다. 번들이 깨졌으면 전부 보기 전용으로 둔다.
const approvedByCodepoint: ReadonlyMap<number, ApprovedNotoInput> = (() => {
  try { return new Map(approvedNotoInputs().map((entry) => [entry.identity.codepoint, entry])) } catch { return new Map() }
})()
const approvedCount = approvedByCodepoint.size

function approvedInputFor(codepoint: number): ApprovedNotoInput | null {
  return approvedByCodepoint.get(codepoint) ?? null
}

function TierBadge({ editable, className }: { editable: boolean; className?: string }) {
  return <span className={`${styles.badge} ${className ?? ''}`} data-tier={editable ? 'editable' : 'readonly'} data-testid="review-tier">{editable ? '편집 가능' : '보기 전용'}</span>
}

const VIEW_BOX_SIZE = 1.16

function GlyphCanvas({ path, rails, ghost = false, selectedRail, onSelectRail, onDragRail, label }: {
  path: string
  rails: Rail[]
  ghost?: boolean
  selectedRail?: string
  onSelectRail?: (id: string) => void
  /** 캔버스에서 기준선을 직접 끈다. 값은 클램프 전 제안값, 호출자가 범위·순서를 판정한다. */
  onDragRail?: (id: string, value: number) => void
  label: string
}) {
  const gesture = useRef<{ pointerId: number; id: string; axis: 'x' | 'y'; start: number; startValue: number } | null>(null)
  const startDrag = (rail: Rail) => (event: ReactPointerEvent<SVGLineElement>) => {
    onSelectRail?.(rail.id)
    if (!onDragRail) return
    gesture.current = { pointerId: event.pointerId, id: rail.id, axis: rail.axis, start: rail.axis === 'x' ? event.clientX : event.clientY, startValue: rail.value }
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const moveDrag = (event: ReactPointerEvent<SVGLineElement>) => {
    const current = gesture.current
    if (!current || current.pointerId !== event.pointerId) return
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    // viewBox 1.16 단위를 화면 px로 환산해 1:1로 옮긴다.
    const rect = svg.getBoundingClientRect()
    const unitsPerPixel = VIEW_BOX_SIZE / (current.axis === 'x' ? rect.width : rect.height)
    const delta = ((current.axis === 'x' ? event.clientX : event.clientY) - current.start) * unitsPerPixel
    onDragRail?.(current.id, current.startValue + delta)
  }
  const endDrag = (event: ReactPointerEvent<SVGLineElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return
    gesture.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  return <svg className={styles.canvas} viewBox={VIEW_BOX} role="img" aria-label={label} data-testid="review-canvas">
    <defs>
      {/* 자소 원형 캔버스와 같은 눈금: 1/16 잔선 + 1/4 굵은선 */}
      <pattern id="review-grid-fine" width=".0625" height=".0625" patternUnits="userSpaceOnUse"><path d="M.0625 0V.0625H0" fill="none" stroke="rgb(218 223 230 / .7)" strokeWidth=".002" /></pattern>
      <pattern id="review-grid-coarse" width=".25" height=".25" patternUnits="userSpaceOnUse"><path d="M.25 0V.25H0" fill="none" stroke="rgb(196 203 212 / .8)" strokeWidth=".003" /></pattern>
    </defs>
    <rect x="0" y="0" width="1" height="1" fill="#fff" />
    <rect x="0" y="0" width="1" height="1" fill="url(#review-grid-fine)" data-testid="review-grid" />
    <rect x="0" y="0" width="1" height="1" fill="url(#review-grid-coarse)" />
    <rect x="0" y="0" width="1" height="1" fill="none" stroke="rgb(196 203 212)" strokeWidth=".004" />
    <path d="M-.06 .88H1.02" stroke="#a6a297" strokeWidth=".003" />
    {rails.map((rail) => {
      const selected = rail.id === selectedRail
      const stroke = ghost ? '#b8b4a8' : selected ? '#f0561e' : '#3b6fd6'
      const geometry = rail.axis === 'x' ? { x1: rail.value, x2: rail.value, y1: -0.06, y2: 1.02 } : { x1: -0.06, x2: 1.02, y1: rail.value, y2: rail.value }
      const text = rail.axis === 'x' ? { x: rail.value + 0.012, y: -0.025 } : { x: -0.05, y: rail.value - 0.012 }
      return <g key={rail.id} data-rail={rail.id} data-selected={selected || undefined}>
        <line {...geometry} stroke={stroke} strokeWidth={selected ? 0.01 : 0.004} strokeDasharray={ghost ? '.012 .008' : undefined} />
        {onSelectRail && <line {...geometry} className={styles.railButton} data-rail-handle={rail.id} stroke="transparent" strokeWidth=".08" role="button" tabIndex={0} aria-label={`${rail.label} 선택`} aria-pressed={selected} onPointerDown={startDrag(rail)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectRail(rail.id) } }} />}
        <text {...text} fontSize=".032" fill={stroke}>{rail.label}</text>
        {selected && !ghost && <circle cx={rail.axis === 'x' ? rail.value : 1} cy={rail.axis === 'x' ? 1 : rail.value} r=".03" fill="#fff" stroke="#f0561e" strokeWidth=".01" />}
      </g>
    })}
    <path d={path} fill={ghost ? '#3a3a36' : 'rgb(var(--color-foreground))'} fillRule="evenodd" data-testid="review-ink" />
  </svg>
}

function baselineRails(glyph: NotoPresetGlyph): Rail[] {
  return Object.entries(glyph.baselines).flatMap(([id, value]) => {
    const spec = BASELINE_RAILS[id]
    return spec && Number.isFinite(value) ? [{ id, axis: spec.axis, label: spec.label, value }] : []
  })
}

function GlyphMini({ codepoint }: { codepoint: number }) {
  const { glyph, error } = useNotoGlyph(codepoint)
  const ink = useMemo(() => glyph ? inkPathOf(glyph.outline, codepoint) : null, [glyph, codepoint])
  if (!ink) return <svg viewBox={VIEW_BOX} role="img" aria-label={error || '읽는 중'}><rect x="0" y="0" width="1" height="1" fill="#fff" /></svg>
  return <svg viewBox={VIEW_BOX} role="img" aria-label={String.fromCodePoint(codepoint)}>
    <rect x="0" y="0" width="1" height="1" fill="#fff" />
    {'path' in ink && <path d={ink.path} fill="rgb(var(--color-foreground))" fillRule="evenodd" />}
  </svg>
}

function GridScreen() {
  const [snapshot, setSnapshot] = useState<CorpusSnapshot | null>(null)
  const [error, setError] = useState('')
  const [reviews, setReviews] = useState<CorpusReviews>(loadReviews)
  const [selected, setSelected] = useState(codepointFromUrl)

  useEffect(() => {
    const controller = new AbortController()
    void getJson<CorpusSnapshot>('/api/noto-corpus', controller.signal).then(setSnapshot).catch((failure: Error) => { if (!controller.signal.aborted) setError(failure.message) })
    return () => controller.abort()
  }, [])
  useEffect(() => {
    const onStorage = (event: StorageEvent) => { if (event.key === REVIEW_STORAGE_KEY) setReviews(loadReviews()) }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const rows = useMemo(() => snapshot ? allCorpusRows(snapshot) : [], [snapshot])
  const identity = corpusIdentity(selected)
  const editable = approvedInputFor(selected) !== null

  return <MobileWorkspaceShell activeArea="review" statusLabel="검수 · 글자 격자">
    <section className={styles.titleSection}>
      <span className={styles.screenId}>R-01 · 검수</span>
      <h1>글자 격자<small>Noto 윤곽 · {snapshot ? `${snapshot.rows.length.toLocaleString()}자 추출` : '읽는 중'}</small></h1>
      <nav className={styles.segment} aria-label="검수 보기"><a href="/">문장</a><span aria-current="page">격자</span></nav>
    </section>
    <div className={styles.scroll}>
      {error && <p className={styles.status} data-state="error" role="alert">{error}</p>}
      {/* 칸 탭 = 선택, 선택된 칸 다시 탭 = 글자 화면. 키보드 화살표 이동은 선택만 바꾼다. */}
      {rows.length > 0 && <div className={styles.matrixSection}><NotoCorpusMatrix rows={rows} reviews={reviews} selected={selected} onSelect={(codepoint) => { if (codepoint === selected) window.location.assign(glyphHref(codepoint)); else setSelected(codepoint) }} isHighlighted={() => true} noFinal={false} tierOf={(row) => approvedInputFor(row.identity.codepoint) ? 'editable' : 'readonly'} /><p className={styles.status}>파란 테두리 칸 = 기준선 편집 가능(승인 추출 {approvedCount}자). 나머지는 윤곽·실측 보기.</p></div>}
      <a className={styles.pick} href={glyphHref(selected)} data-testid="review-pick">
        <GlyphMini codepoint={selected} />
        <span className={styles.pickBody}>
          <strong>선택 · {identity.character}</strong>
          <small>{identity.initialJamo} + {identity.medialJamo}{identity.finalJamo ? ` + ${identity.finalJamo}` : ' · 받침 없음'}</small>
          <TierBadge editable={editable} />
          <small className={styles.hint}>카드 탭 또는 같은 칸 다시 탭 → 글자 열기</small>
        </span>
        <span aria-hidden="true">›</span>
      </a>
    </div>
  </MobileWorkspaceShell>
}

function GlyphTitle({ codepoint, editable }: { codepoint: number; editable: boolean }) {
  const character = String.fromCodePoint(codepoint)
  return <section className={styles.titleSection}>
    <span className={styles.screenId}>R-02 · 검수 › 글자</span>
    <h1>{character}<small>{editable ? '기준선 편집' : '윤곽만'}</small></h1>
    <nav className={styles.segment} aria-label="검수 보기"><a href={`${GRID_PATH}?char=${encodeURIComponent(character)}`}>‹ 격자</a><span aria-current="page">글자</span></nav>
  </section>
}

function ReadOnlyGlyph({ glyph }: { glyph: NotoPresetGlyph }) {
  const codepoint = glyph.identity.codepoint
  const ink = useMemo(() => inkPathOf(glyph.outline, codepoint), [glyph, codepoint])
  const rails = useMemo(() => baselineRails(glyph), [glyph])
  return <MobileWorkspaceShell activeArea="review" statusLabel="검수 · 윤곽 보기">
    <GlyphTitle codepoint={codepoint} editable={false} />
    <div className={styles.scroll}>
    <p className={styles.context}>{glyph.identity.initialJamo} + {glyph.identity.medialJamo}{glyph.identity.finalJamo ? ` + ${glyph.identity.finalJamo}` : ''} · <b>승인 추출 없음</b> · 기준선 실측만</p>
    <section className={styles.canvasSection}>
      {'path' in ink ? <GlyphCanvas path={ink.path} rails={rails} ghost label={`${glyph.identity.character} Noto 윤곽`} /> : <p className={styles.warning} role="alert">{ink.error}</p>}
      <TierBadge editable={false} className={styles.canvasBadge} />
    </section>
    <div className={styles.head}><span>기준선 실측<small>Noto · 1000 u</small></span><span>{rails.length}개</span></div>
    <div className={styles.values} data-testid="review-values">
      {rails.map((rail) => <div className={styles.cell} key={rail.id}><span><span className={styles.key}>{rail.label}</span><span className={styles.value}>{(rail.value * 1000).toFixed(1)}<small>u</small></span></span><i className={styles.bar} style={{ '--p': `${Math.round(rail.value * 100)}%` } as React.CSSProperties} /></div>)}
    </div>
    <p className={styles.locked}>기준선 편집 · 추출 승인 뒤 열림</p>
    </div>
  </MobileWorkspaceShell>
}

function EditableGlyph({ input }: { input: ApprovedNotoInput }) {
  const master = useMemo<BoundMaster>(() => createNotoBoundMaster(input), [input])
  const editableRails = useMemo(() => master.rails.filter((rail) => rail.editable), [master])
  const [edits, setEdits] = useState<RailEdits>({})
  const [selected, setSelected] = useState(() => editableRails[0]?.id ?? '')
  const [error, setError] = useState('')
  const drawing = useMemo(() => renderNotoBoundMaster(master, edits), [master, edits])
  const codepoint = input.identity.codepoint
  const ink = useMemo(() => inkPathOf({
    unitsPerEm: 1000,
    // renderNotoBoundMaster는 이미 0~1 좌표를 주므로 항등 변환으로 잉크 파이프라인에 넣는다.
    fontToGlyphNormalized: [1, 0, 0, 1, 0, 0],
    operations: [...drawing.operations.initial, ...drawing.operations.medial],
  }, codepoint), [drawing, codepoint])
  const rails: Rail[] = editableRails.map((rail) => ({ id: rail.id, axis: rail.axis, label: shortLabel(rail.label), value: edits[rail.id] ?? rail.value }))
  const rail = rails.find((item) => item.id === selected) ?? rails[0]
  const original = rail ? master.rails.find((item) => item.id === rail.id)!.value : 0
  const range = rail ? railEditRange(master, rail.id) : { min: 0, max: 1 }
  const value = rail?.value ?? 0
  const editCount = Object.keys(edits).length

  // 캔버스 드래그·자·키보드가 모두 여기로 온다. 범위는 클램프하고 순서 위반은 마지막 유효값을 지킨다.
  const changeRail = (id: string, next: number) => {
    const source = master.rails.find((item) => item.id === id)
    if (!source) return
    const limit = railEditRange(master, id)
    // 1u 격자는 승인 원본에 맞춘다. 원본 자리로 돌아오면 edits에서 빠져 '변경 없음'이 된다.
    const snapped = source.value + Math.round((next - source.value) * 1000) / 1000
    const clamped = Math.min(limit.max, Math.max(limit.min, snapped))
    const proposed = { ...edits, [id]: clamped }
    if (Math.abs(clamped - source.value) < 1e-12) delete proposed[id]
    try { renderNotoBoundMaster(master, proposed); setEdits(proposed); setError('') }
    catch (failure) { setError(failure instanceof Error ? failure.message : '기준선 변경을 적용할 수 없습니다.') }
  }
  const change = (next: number) => { if (rail) changeRail(rail.id, next) }

  // 자 도구는 스크롤 밖, 탭 바로 위에 고정. 눈금 창 = 허용 범위 ±60u.
  const ruler = rail && <section className={styles.dialDock} aria-label="기준선 조절">
    <div className={styles.editorHeading}>
      <span>{rail.label}<small data-testid="review-edit-status">{editCount ? ` · ${editCount}개 변경 · 저장 안 됨` : ' · 승인 원본'}</small></span>
      <output aria-live="polite" data-testid="review-rail-value">{(value * 1000).toFixed(1)}<small>u</small><em>Δ {((value - original) * 1000).toFixed(1)}</em></output>
    </div>
    <RulerStrip value={value} min={range.min} max={range.max} step={0.001} base={original} baseLabel="Noto" unitScale={1000} unit="u" axis={rail.axis} label={`${rail.label} 위치`} onChange={change} />
    <div className={styles.editorMeta}>
      <span>캔버스 선 끌기 · 자 탭·끌기 1 u · 방향키 1 u · Shift 10 u</span>
      <button type="button" disabled={!editCount} onClick={() => { setEdits({}); setError('') }}>승인 원본으로 복원</button>
    </div>
    {error && <p className={styles.warning} role="alert">{error}</p>}
  </section>

  return <MobileWorkspaceShell activeArea="review" statusLabel="검수 · 기준선 편집" drawer={ruler || undefined}>
    <GlyphTitle codepoint={codepoint} editable />
    <div className={styles.scroll}>
    <p className={styles.context}>{rail?.label} · <b>Noto 승인값 {rail ? (original * 1000).toFixed(1) : '—'}</b> · 펜스 이 글자만</p>
    <section className={styles.canvasSection}>
      {'path' in ink ? <GlyphCanvas path={ink.path} rails={rails} selectedRail={rail?.id} onSelectRail={(id) => { setSelected(id); setError('') }} onDragRail={changeRail} label={`${input.identity.character} 기준선 결속 마스터`} /> : <p className={styles.warning} role="alert">{ink.error}</p>}
      <TierBadge editable className={styles.canvasBadge} />
    </section>
    <div className={styles.chips} role="group" aria-label="편집할 기준선">
      {rails.map((item) => <button type="button" key={item.id} aria-pressed={item.id === rail?.id} onClick={() => { setSelected(item.id); setError('') }}>{item.label}</button>)}
    </div>
    </div>
  </MobileWorkspaceShell>
}

function GlyphScreen() {
  const codepoint = codepointFromUrl()
  const input = useMemo(() => approvedInputFor(codepoint), [codepoint])
  const { glyph, error } = useNotoGlyph(codepoint)
  if (input) return <EditableGlyph key={codepoint} input={input} />
  if (glyph) return <ReadOnlyGlyph glyph={glyph} />
  return <MobileWorkspaceShell activeArea="review" statusLabel="검수 · 윤곽 보기">
    <GlyphTitle codepoint={codepoint} editable={false} />
    <p className={styles.status} data-state={error ? 'error' : 'loading'} role={error ? 'alert' : 'status'}>{error || 'Noto 윤곽 읽는 중'}</p>
  </MobileWorkspaceShell>
}

export function ReviewWorkspacePage() {
  return window.location.pathname === GLYPH_PATH ? <GlyphScreen /> : <GridScreen />
}
