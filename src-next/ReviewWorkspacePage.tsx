import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { notoOutlineGhostPath } from '../src/services/notoOutlineInk'
import { approvedNotoInputs } from './notoBoundMaster'
import type { ApprovedNotoInput } from './notoBoundMaster'
import { allCorpusRows, CORPUS_TOTAL, corpusIdentity, parseCorpusReviews, REVIEW_STORAGE_KEY } from './notoCorpus'
import type { CorpusReviews, CorpusSnapshot } from './notoCorpus'
import { NotoCorpusMatrix } from './NotoCorpusMatrix'
import { editableComponentRailsOf, fitComponentsForGlyph, renderComponentPart } from './notoComponentFitView'
import type { ComponentFitPart, RenderedComponentPart } from './notoComponentFitView'
import type { ComponentFaces } from '../src/services/notoComponentFit'
import { editableRailsOf, fitMedialForGlyph, renderMedialPart, roleLabel } from './notoMedialFitView'
import type { EditableRail, MedialFitView, RenderedMedialPart } from './notoMedialFitView'
import type { CoreRailRole } from '../src/services/notoMedialMasterFit'
import { notoPresetGlyphs } from './notoPresetGlyphs'
import type { NotoPresetGlyph, NotoPresetModelBundle, NotoPresetXorMap } from './notoPresetGlyphs'
import { RulerStrip } from './workspace/RulerStrip'
import { MobileWorkspaceShell } from './workspace/WorkspaceChrome'
import styles from './ReviewWorkspacePage.module.css'

/**
 * 검수 탭. 글자 격자에서 고른 글자의 Noto 실측 윤곽을 고스트로 깔고 역할면 기준선을 검수한다.
 * Noto 윤곽은 측정 원천·고스트·룩으로만 쓴다. 편집 대상이 아니고 잉크 union에도 들어가지 않는다.
 * 획(centerline) 마스터가 붙으면 이 고스트 위에 내 획을 겹쳐 편차를 본다.
 */

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

function useNotoModel(): { bundle: NotoPresetModelBundle | null; error: string } {
  const [state, setState] = useState<{ bundle: NotoPresetModelBundle | null; error: string }>({ bundle: null, error: '' })
  useEffect(() => {
    const controller = new AbortController()
    notoPresetGlyphs.model(controller.signal)
      .then((bundle) => setState({ bundle, error: '' }))
      .catch((failure: Error) => { if (!controller.signal.aborted) setState({ bundle: null, error: failure.message }) })
    return () => controller.abort()
  }, [])
  return state
}

function useNotoXorMap(): { xorMap: NotoPresetXorMap | null; error: string } {
  const [state, setState] = useState<{ xorMap: NotoPresetXorMap | null; error: string }>({ xorMap: null, error: '' })
  useEffect(() => {
    const controller = new AbortController()
    notoPresetGlyphs.xor(controller.signal)
      .then((xorMap) => setState({ xorMap, error: '' }))
      .catch((failure: Error) => { if (!controller.signal.aborted) setState({ xorMap: null, error: failure.message }) })
    return () => controller.abort()
  }, [])
  return state
}

/** xor 비율 → 격자 색 단계. 게이트가 아니라 눈에 띄게 하는 용도. */
const XOR_TONES: { max: number; tone: 'good' | 'mid' | 'far' | 'bad'; label: string }[] = [
  { max: 0.15, tone: 'good', label: '15% 미만' }, { max: 0.3, tone: 'mid', label: '30% 미만' }, { max: 0.6, tone: 'far', label: '60% 미만' }, { max: Infinity, tone: 'bad', label: '60% 이상' },
]
const xorTone = (xor: number) => XOR_TONES.find((entry) => xor < entry.max)!.tone

// 승인 번들은 모듈 상수라 codepoint 인덱스를 한 번만 만든다. 번들이 깨졌으면 전부 실측만으로 둔다.
const approvedByCodepoint: ReadonlyMap<number, ApprovedNotoInput> = (() => {
  try { return new Map(approvedNotoInputs().map((entry) => [entry.identity.codepoint, entry])) } catch { return new Map() }
})()
const approvedCount = approvedByCodepoint.size
const isApproved = (codepoint: number) => approvedByCodepoint.has(codepoint)
const approvedInputFor = (codepoint: number): ApprovedNotoInput | null => approvedByCodepoint.get(codepoint) ?? null

/** 승인 측정 = 사용자가 확인한 기준선 입력. 획 마스터 fit의 출발점이 될 글자다. */
function TierBadge({ approved, className }: { approved: boolean; className?: string }) {
  return <span className={`${styles.badge} ${className ?? ''}`} data-tier={approved ? 'approved' : 'measured'} data-testid="review-tier">{approved ? '승인 측정' : '실측만'}</span>
}

function baselineRails(glyph: NotoPresetGlyph): Rail[] {
  return Object.entries(glyph.baselines).flatMap(([id, value]) => {
    const spec = BASELINE_RAILS[id]
    return spec && Number.isFinite(value) ? [{ id, axis: spec.axis, label: spec.label, value }] : []
  })
}

const VIEW_BOX_SIZE = 1.16

function GhostCanvas({ ghost, measured, editable = [], selectedRail, onSelectRail, onDragRail, label, overlays = [], componentOverlays = [] }: {
  ghost: string
  /** Noto 실측 기준선. 참고용이라 옅은 점선, 조작 없음. */
  measured: Rail[]
  /** 획 마스터 rail. 잡고 끌 수 있다. */
  editable?: EditableRail[]
  selectedRail?: string
  onSelectRail?: (id: string) => void
  /** 캔버스에서 rail을 직접 끈다. 값은 em 제안값, 호출자가 순서·간격을 판정한다. */
  onDragRail?: (id: string, value: number) => void
  label: string
  /** 내 획 마스터 잉크. 고스트 위에 파랗게 겹친다. */
  overlays?: string[]
  /** 닿자 박스 fit 잉크(앱 획). 초록으로 구분한다. */
  componentOverlays?: string[]
}) {
  const gesture = useRef<{ pointerId: number; id: string; axis: 'x' | 'y'; start: number; startValue: number } | null>(null)
  const startDrag = (rail: EditableRail) => (event: ReactPointerEvent<SVGLineElement>) => {
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
    onDragRail?.(current.id, current.startValue + ((current.axis === 'x' ? event.clientX : event.clientY) - current.start) * unitsPerPixel)
  }
  const endDrag = (event: ReactPointerEvent<SVGLineElement>) => {
    if (gesture.current?.pointerId !== event.pointerId) return
    gesture.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
  }
  const geometryOf = (axis: 'x' | 'y', value: number) => axis === 'x' ? { x1: value, x2: value, y1: -0.06, y2: 1.02 } : { x1: -0.06, x2: 1.02, y1: value, y2: value }
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
    {/* Noto 고스트. 잉크가 아니라 비교용이라 반투명으로 깐다. */}
    <path d={ghost} fill="#3a3a36" fillOpacity=".55" fillRule="evenodd" data-testid="review-ghost" />
    {overlays.map((path, index) => <path key={index} d={path} fill="#3b6fd6" fillOpacity=".45" fillRule="evenodd" data-testid="review-fit-ink" />)}
    {componentOverlays.map((path, index) => <path key={`c${index}`} d={path} fill="#2f9a6a" fillOpacity=".4" fillRule="evenodd" data-testid="review-component-ink" />)}
    {measured.map((rail) => <g key={rail.id} data-rail={rail.id}>
      <line {...geometryOf(rail.axis, rail.value)} stroke="#b8b4a8" strokeWidth=".003" strokeDasharray=".012 .008" />
      <text {...(rail.axis === 'x' ? { x: rail.value + 0.012, y: 1.01 } : { x: 0.96, y: rail.value - 0.008 })} fontSize=".026" fill="#b8b4a8">{rail.label}</text>
    </g>)}
    {editable.map((rail) => {
      const selected = rail.id === selectedRail
      const stroke = selected ? '#f0561e' : '#3b6fd6'
      const geometry = geometryOf(rail.axis, rail.value)
      return <g key={rail.id} data-rail={rail.id} data-selected={selected || undefined}>
        <line {...geometry} stroke={stroke} strokeWidth={selected ? 0.008 : 0.004} />
        {onSelectRail && <line {...geometry} className={styles.railButton} data-rail-handle={rail.id} stroke="transparent" strokeWidth=".08" role="button" tabIndex={0} aria-label={`${rail.label} 선택`} aria-pressed={selected} onPointerDown={startDrag(rail)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectRail(rail.id) } }} />}
        <text {...(rail.axis === 'x' ? { x: rail.value + 0.012, y: -0.025 } : { x: -0.05, y: rail.value - 0.012 })} fontSize=".03" fill={stroke}>{rail.label}</text>
        {selected && <circle cx={rail.axis === 'x' ? rail.value : 1} cy={rail.axis === 'x' ? 1 : rail.value} r=".03" fill="#fff" stroke="#f0561e" strokeWidth=".01" />}
      </g>
    })}
  </svg>
}

function GlyphMini({ codepoint }: { codepoint: number }) {
  const { glyph, error } = useNotoGlyph(codepoint)
  const ghost = useMemo(() => glyph ? notoOutlineGhostPath(glyph.outline) : null, [glyph])
  return <svg viewBox={VIEW_BOX} role="img" aria-label={ghost ? String.fromCodePoint(codepoint) : error || '읽는 중'}>
    <rect x="0" y="0" width="1" height="1" fill="#fff" />
    {ghost && 'path' in ghost && <path d={ghost.path} fill="#3a3a36" fillOpacity=".7" fillRule="evenodd" />}
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
  const { xorMap, error: xorError } = useNotoXorMap()
  const [colorBy, setColorBy] = useState<'xor' | 'status'>('xor')
  const xorOf = (character: string) => xorMap?.characters[character]?.xor
  const selectedXor = xorOf(identity.character)

  return <MobileWorkspaceShell activeArea="review" statusLabel="검수 · 글자 격자">
    <section className={styles.titleSection}>
      <span className={styles.screenId}>R-01 · 검수</span>
      <h1>글자 격자<small>Noto 고스트 · {snapshot ? `${snapshot.rows.length.toLocaleString()}자 추출` : '읽는 중'}</small></h1>
      <nav className={styles.segment} aria-label="검수 보기"><a href="/">문장</a><span aria-current="page">격자</span></nav>
    </section>
    <div className={styles.scroll}>
      {error && <p className={styles.status} data-state="error" role="alert">{error}</p>}
      {/* 칸 탭 = 선택, 선택된 칸 다시 탭 = 글자 화면. 키보드 화살표 이동은 선택만 바꾼다. */}
      {rows.length > 0 && <div className={styles.matrixSection}><NotoCorpusMatrix rows={rows} reviews={reviews} selected={selected} onSelect={(codepoint) => { if (codepoint === selected) window.location.assign(glyphHref(codepoint)); else setSelected(codepoint) }} isHighlighted={() => true} noFinal={false} tierOf={(row) => isApproved(row.identity.codepoint) ? 'editable' : 'readonly'} toneOf={colorBy === 'xor' && xorMap ? (row) => { const xor = xorOf(row.identity.character); return xor === undefined ? undefined : xorTone(xor) } : undefined} /></div>}
      <div className={styles.colorBar}>
        <div className={styles.segment} role="group" aria-label="칸 색 기준">
          <button type="button" aria-current={colorBy === 'xor' ? 'page' : undefined} onClick={() => setColorBy('xor')} disabled={!xorMap}>Noto 대비 xor</button>
          <button type="button" aria-current={colorBy === 'status' ? 'page' : undefined} onClick={() => setColorBy('status')}>추출 상태</button>
        </div>
        {colorBy === 'xor' && xorMap && <div className={styles.toneLegend} data-testid="review-xor-legend">{XOR_TONES.map((entry) => <span key={entry.tone} data-tone={entry.tone}>{entry.label}</span>)}<small>앱 기본 획 기준 · {new Date(xorMap.generatedAt).toLocaleDateString('ko-KR')}</small></div>}
        {colorBy === 'xor' && xorError && <p className={styles.status} data-state="error">{xorError}</p>}
      </div>
      <p className={styles.status}>파란 테두리 칸 = 승인 측정 {approvedCount}자(획 마스터 fit 출발점). 나머지는 실측 기준선만.</p>
      <a className={styles.pick} href={glyphHref(selected)} data-testid="review-pick">
        <GlyphMini codepoint={selected} />
        <span className={styles.pickBody}>
          <strong>선택 · {identity.character}{selectedXor !== undefined && <em className={styles.pickXor} data-tone={xorTone(selectedXor)} data-testid="review-pick-xor"> xor {(selectedXor * 100).toFixed(0)}%</em>}</strong>
          <small>{identity.initialJamo} + {identity.medialJamo}{identity.finalJamo ? ` + ${identity.finalJamo}` : ' · 받침 없음'}</small>
          <TierBadge approved={isApproved(selected)} />
          <small className={styles.hint}>카드 탭 또는 같은 칸 다시 탭 → 글자 열기</small>
        </span>
        <span aria-hidden="true">›</span>
      </a>
    </div>
  </MobileWorkspaceShell>
}

function GlyphTitle({ codepoint, approved }: { codepoint: number; approved: boolean }) {
  const character = String.fromCodePoint(codepoint)
  return <section className={styles.titleSection}>
    <span className={styles.screenId}>R-02 · 검수 › 글자</span>
    <h1>{character}<small>{approved ? '승인 측정 검수' : '실측 보기'}</small></h1>
    <nav className={styles.segment} aria-label="검수 보기"><a href={`${GRID_PATH}?char=${encodeURIComponent(character)}`}>‹ 격자</a><span aria-current="page">글자</span></nav>
  </section>
}

/** 획 마스터 수치. 승인 글자는 xor·rail 오차, 나머지는 겹쳐 보기만. */
function FitStats({ view, rendered, approved }: { view: MedialFitView; rendered: RenderedMedialPart[]; approved: boolean }) {
  return <div className={styles.fitStats} data-testid="review-fit-stats">
    {view.message && <p className={styles.warning} role="alert">{view.message}</p>}
    {view.parts.map((part, index) => {
      const out = rendered[index]
      return <div key={part.role} className={styles.fitPart}>
        <div className={styles.fitHead}><span>홀자 획 마스터 · {part.role === 'JU_H' ? '가로부' : part.role === 'JU_V' ? '세로부' : '모델 rail'}</span>
          {out?.xorRatio !== undefined ? <strong data-testid="review-fit-xor">xor {(out.xorRatio * 100).toFixed(1)}%<small> · 잉크 {((out.inkRatio ?? 0) * 100).toFixed(0)}%</small></strong> : <small>{approved ? out?.message ?? part.message ?? '' : '겹쳐 보기만 · 승인 측정 없음'}</small>}
        </div>
        {out && out.railErrors.length > 0 && <div className={styles.railErrors}>{out.railErrors.map((rail) => <span key={rail.roleId} data-large={Math.abs(rail.errorUnits) > 10 || undefined}><i>{roleLabel(rail.roleId)}</i>{rail.errorUnits >= 0 ? '+' : ''}{rail.errorUnits.toFixed(1)}u</span>)}</div>}
        {(out?.message ?? part.message) && out?.xorRatio === undefined && approved && <p className={styles.warning}>{out?.message ?? part.message}</p>}
      </div>
    })}
  </div>
}

const SIDE_LABEL: Record<string, string> = { left: '왼', right: '오른', top: '위', bottom: '아래' }

/** 닿자 박스 fit 수치. 앱 획 골격이 Noto와 얼마나 다른지 — 승인 글자는 xor·네 변 오차. */
function ComponentStats({ parts, rendered, approved }: { parts: ComponentFitPart[]; rendered: RenderedComponentPart[]; approved: boolean }) {
  return <div className={styles.fitStats} data-testid="review-component-stats">
    {parts.map((part, index) => {
      const out = rendered[index]
      return <div key={part.part} className={`${styles.fitPart} ${styles.componentPart}`}>
        <div className={styles.fitHead}><span>{part.part === 'CH' ? '첫닿자' : '받침'} {part.jamoId} · 앱 획 · 모델 박스</span>
          {out?.xorRatio !== undefined ? <strong data-testid="review-component-xor">xor {(out.xorRatio * 100).toFixed(1)}%<small> · 잉크 {((out.inkRatio ?? 0) * 100).toFixed(0)}%</small></strong> : <small>{out?.message ?? part.message ?? (approved ? '' : '겹쳐 보기만 · 승인 측정 없음')}</small>}
        </div>
        {out && out.faceErrors.length > 0 && <div className={styles.railErrors}>{out.faceErrors.map((face) => <span key={face.side} data-large={Math.abs(face.errorUnits) > 10 || undefined}><i>{SIDE_LABEL[face.side]}</i>{face.errorUnits >= 0 ? '+' : ''}{face.errorUnits.toFixed(1)}u</span>)}</div>}
      </div>
    })}
  </div>
}

type RailsByPart = (Record<CoreRailRole, number> | undefined)[]

function GlyphView({ glyph }: { glyph: NotoPresetGlyph }) {
  const codepoint = glyph.identity.codepoint
  const approved = isApproved(codepoint)
  const ghost = useMemo(() => notoOutlineGhostPath(glyph.outline), [glyph])
  const measured = useMemo(() => baselineRails(glyph), [glyph])
  const { bundle, error: modelError } = useNotoModel()
  const fitView = useMemo(() => bundle ? fitMedialForGlyph({ identity: glyph.identity, bundle, outline: glyph.outline, approved: approvedInputFor(codepoint) }) : null, [bundle, glyph, codepoint])
  const componentParts = useMemo(() => bundle ? fitComponentsForGlyph({ identity: glyph.identity, bundle, outline: glyph.outline, approved: approvedInputFor(codepoint) }) : [], [bundle, glyph, codepoint])
  const [facesByPart, setFacesByPart] = useState<(ComponentFaces | undefined)[]>([])
  const componentRendered = useMemo(() => componentParts.map((part, index) => renderComponentPart(part, facesByPart[index])), [componentParts, facesByPart])
  const componentOverlays = componentRendered.flatMap((part) => part.path ? [part.path] : [])
  // rail 편집은 세션 임시. part별 em 값. undefined = 모델 rail 그대로.
  const [railsByPart, setRailsByPart] = useState<RailsByPart>([])
  const [selectedRail, setSelectedRail] = useState<string | undefined>()
  const [error, setError] = useState('')
  const rendered = useMemo(() => fitView ? fitView.parts.map((part, index) => renderMedialPart(part, railsByPart[index])) : [], [fitView, railsByPart])
  // 홀자 마스터 rail(`<n>:<role>`)과 닿자 박스 변(`c<n>:<side>`)을 한 목록으로. 선택·자·드래그가 같은 경로를 탄다.
  const editable = useMemo(() => [
    ...(fitView ? editableRailsOf(fitView.parts, railsByPart) : []),
    ...editableComponentRailsOf(componentParts, facesByPart),
  ], [fitView, railsByPart, componentParts, facesByPart])
  const overlays = rendered.flatMap((part) => part.path ? [part.path] : [])
  const rail = editable.find((item) => item.id === selectedRail) ?? editable[0]
  const editCount = editable.filter((item) => Math.abs(item.value - item.original) > 1e-9).length

  // 캔버스 드래그·자·키보드가 모두 여기로 온다. 1u 격자는 모델 값에 맞추고, 순서·간격 위반은 마지막 유효값을 지킨다.
  const changeRail = (id: string, next: number) => {
    const target = editable.find((item) => item.id === id)
    if (!target) return
    const snapped = target.original + Math.round((next - target.original) * 1000) / 1000
    if (id.startsWith('c')) {
      const part = componentParts[target.partIndex]
      if (!part?.faces) return
      const proposed = { ...(facesByPart[target.partIndex] ?? part.faces), [target.role]: snapped } as ComponentFaces
      const check = renderComponentPart(part, proposed)
      if (!check.path) { setError(check.message ?? '박스 변을 그 자리에 둘 수 없습니다.'); return }
      setError('')
      setFacesByPart((current) => { const copy = [...current]; copy[target.partIndex] = proposed; return copy })
      return
    }
    const part = fitView?.parts[target.partIndex]
    if (!part?.fit) return
    const proposed = { ...(railsByPart[target.partIndex] ?? part.fit.railsEm), [target.role]: snapped } as Record<CoreRailRole, number>
    const check = renderMedialPart(part, proposed)
    if (!check.path) { setError(check.message ?? '기준선을 그 자리에 둘 수 없습니다.'); return }
    setError('')
    setRailsByPart((current) => { const copy = [...current]; copy[target.partIndex] = proposed; return copy })
  }
  const resetRails = () => { setRailsByPart([]); setFacesByPart([]); setError('') }

  // 자 도구: 스크롤 밖, 탭 바로 위. 눈금 창 = 모델 값 ±100u.
  const ruler = rail && <section className={styles.dialDock} aria-label="기준선 조절">
    <div className={styles.editorHeading}>
      <span>{rail.label}<small data-testid="review-edit-status">{editCount ? ` · ${editCount}개 변경 · 저장 안 됨` : ' · 모델 rail'}</small></span>
      <output aria-live="polite" data-testid="review-rail-value">{(rail.value * 1000).toFixed(1)}<small>u</small><em>Δ {((rail.value - rail.original) * 1000).toFixed(1)}</em></output>
    </div>
    <RulerStrip value={rail.value} min={rail.original - 0.1} max={rail.original + 0.1} step={0.001} base={rail.original} baseLabel="모델" unitScale={1000} unit="u" axis={rail.axis} label={`${rail.label} 위치`} onChange={(value) => changeRail(rail.id, value)} />
    <div className={styles.editorMeta}>
      <span>캔버스 선 끌기 · 자 탭·끌기 1 u · 방향키 1 u · Shift 10 u · 두께 고정</span>
      <button type="button" disabled={!editCount} onClick={resetRails}>모델 rail로 복원</button>
    </div>
    {error && <p className={styles.warning} role="alert">{error}</p>}
  </section>

  return <MobileWorkspaceShell activeArea="review" statusLabel={approved ? '검수 · 승인 측정' : '검수 · 실측 보기'} drawer={ruler || undefined}>
    <GlyphTitle codepoint={codepoint} approved={approved} />
    <div className={styles.scroll}>
      <p className={styles.context}>{glyph.identity.initialJamo} + {glyph.identity.medialJamo}{glyph.identity.finalJamo ? ` + ${glyph.identity.finalJamo}` : ''} · <b>{approved ? '승인 측정 있음' : '승인 추출 없음'}</b> · 회색 고스트 위 파랑 = 홀자 획, 초록 = 닿자 획</p>
      <section className={styles.canvasSection}>
        {'path' in ghost ? <GhostCanvas ghost={ghost.path} measured={measured} editable={editable} selectedRail={rail?.id} onSelectRail={(id) => { setSelectedRail(id); setError('') }} onDragRail={changeRail} label={`${glyph.identity.character} Noto 고스트`} overlays={overlays} componentOverlays={componentOverlays} /> : <p className={styles.warning} role="alert">{ghost.error}</p>}
        <TierBadge approved={approved} className={styles.canvasBadge} />
      </section>
      {editable.length > 0 && <div className={styles.chips} role="group" aria-label="편집할 기준선">
        {editable.map((item) => <button type="button" key={item.id} aria-pressed={item.id === rail?.id} onClick={() => { setSelectedRail(item.id); setError('') }}>{item.label}</button>)}
      </div>}
      {modelError ? <p className={styles.status} data-state="error" role="alert">{modelError}</p> : fitView ? <><FitStats view={fitView} rendered={rendered} approved={approved} /><ComponentStats parts={componentParts} rendered={componentRendered} approved={approved} /></> : <p className={styles.status} role="status">모델 읽는 중</p>}
      <div className={styles.head}><span>기준선 실측<small>Noto · 1000 u</small></span><span>{measured.length}개</span></div>
      <div className={styles.values} data-testid="review-values">
        {measured.map((item) => <div className={styles.cell} key={item.id}><span><span className={styles.key}>{item.label}</span><span className={styles.value}>{(item.value * 1000).toFixed(1)}<small>u</small></span></span><i className={styles.bar} style={{ '--p': `${Math.round(item.value * 100)}%` } as React.CSSProperties} /></div>)}
      </div>
    </div>
  </MobileWorkspaceShell>
}

function GlyphScreen() {
  const codepoint = codepointFromUrl()
  const { glyph, error } = useNotoGlyph(codepoint)
  if (glyph) return <GlyphView key={codepoint} glyph={glyph} />
  return <MobileWorkspaceShell activeArea="review" statusLabel="검수 · 실측 보기">
    <GlyphTitle codepoint={codepoint} approved={isApproved(codepoint)} />
    <p className={styles.status} data-state={error ? 'error' : 'loading'} role={error ? 'alert' : 'status'}>{error || 'Noto 윤곽 읽는 중'}</p>
  </MobileWorkspaceShell>
}

export function ReviewWorkspacePage() {
  return window.location.pathname === GLYPH_PATH ? <GlyphScreen /> : <GridScreen />
}
