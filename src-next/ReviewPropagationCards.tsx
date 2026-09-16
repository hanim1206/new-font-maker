import { useMemo, useState } from 'react'
import { resolveContextBoxes } from '../src/services/contextBoxResolver'
import { notoOutlineGhostPath } from '../src/services/notoOutlineInk'
import type { BoxConfig, Part } from '../src/types'
import type { CorpusIdentity } from './notoCorpus'
import { fitComponentsForGlyph, renderComponentPart } from './notoComponentFitView'
import { fitMedialForGlyph, renderMedialPart } from './notoMedialFitView'
import type { EditableRail } from './notoMedialFitView'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'
import { useNotoGlyph } from './useNotoGlyph'
import { useFitInkStyle } from './useFitInkStyle'
import { applyFacesDelta, applyMedialDelta, editKindOf, hasLayoutEdit, hasShapeEdit, PROPAGATION_SCOPES, propagationCandidates, shapeDeltaToEm } from './reviewPropagation'
import type { CandidateScope, EditKind, PropagationEdit, PropagationScope } from './reviewPropagation'
import styles from './ReviewPropagationCards.module.css'

/**
 * 검수 글자 화면 아래 카드 묶음. 기준선을 잡으면 이 레이아웃(같은 문맥) 글자를 늘 띄워 두고, 옮긴 Δ만 얹는다. 저장이 아니라 미리보기.
 * 카드는 rail을 옮길 때가 아니라 잡을 때 정해진다. 옮기는 동안 후보가 안 바뀌어 번쩍이지 않는다.
 * - 배치 Δ(중심 rail·닿자 네 변): 기본 `이 레이아웃`, `전체`는 일부러 넓힐 때. em 그대로. 자모 하나만 고르는 칩은 없다(그건 형태).
 * - 형태 Δ(시작·끝 rail): `이 자모로 올리기`를 누르면 카드가 같은 자모 글자로 바뀌고 슬롯 비율로 얹는다. 본래 자소 탭 몫.
 * 카드 = Noto 고스트(회색) + Δ 적용한 내 획(검정) + Δ 전 내 획(주황 점선). Δ 없으면 내 획만.
 */

const VIEW_BOX = '-0.08 -0.08 1.16 1.16'
const CARD_COUNT = 8

interface CardBox { kind: 'medial' | 'component'; box: BoxConfig }
const BOX_COLOR: Record<CardBox['kind'], string> = { medial: '#3b6fd6', component: '#2f9a6a' }

function PropagationCard({ identity, bundle, edit, mode }: { identity: CorpusIdentity; bundle: NotoPresetModelBundle; edit: PropagationEdit; mode: EditKind }) {
  const { glyph, error } = useNotoGlyph(identity.codepoint)
  const inkStyle = useFitInkStyle()
  const view = useMemo(() => {
    if (!glyph) return null
    const ghost = notoOutlineGhostPath(glyph.outline)
    const context = resolveContextBoxes({ identity, model: bundle })
    const medialView = fitMedialForGlyph({ context, outline: glyph.outline, approved: null })
    const componentParts = fitComponentsForGlyph({ context, outline: glyph.outline, approved: null })
    const after: string[] = []
    const before: string[] = []
    const boxes: CardBox[] = []
    let skipped = 0
    let touched = 0
    for (const part of medialView.parts) {
      const base = renderMedialPart(part, undefined, inkStyle)
      // 배치는 em Δ 그대로, 형태는 이 글자 슬롯 길이에 비율을 곱해 em으로.
      const delta = !part.fit ? undefined : mode === 'layout' ? edit.layout.medial[part.part] : (() => { const ratios = edit.shape.medial[part.part]; return ratios && part.fit ? shapeDeltaToEm(ratios, part.fit.slot, part.fit.bindings) : undefined })()
      if (!delta || !part.fit) { if (base.path) after.push(base.path); continue }
      const applied = applyMedialDelta(part.fit, delta)
      skipped += applied.skipped
      if (applied.applied === 0) { if (base.path) after.push(base.path); continue }
      const moved = renderMedialPart(part, applied.rails, inkStyle)
      // 순서·간격 위반이면 이 글자는 Δ를 못 받는다(클램프 = 자동 예외).
      if (!moved.path) { if (base.path) after.push(base.path); skipped += applied.applied; continue }
      touched += 1
      after.push(moved.path)
      if (base.path) before.push(base.path)
      if (moved.slot) boxes.push({ kind: 'medial', box: moved.slot })
    }
    for (const part of componentParts) {
      const base = renderComponentPart(part, undefined, inkStyle)
      const delta = mode === 'layout' ? edit.layout.component[part.part] : undefined
      if (!delta || !part.faces) { if (base.path) after.push(base.path); continue }
      const moved = renderComponentPart(part, applyFacesDelta(part.faces, delta), inkStyle)
      if (!moved.path) { if (base.path) after.push(base.path); skipped += 1; continue }
      touched += 1
      after.push(moved.path)
      if (base.path) before.push(base.path)
      if (moved.faces) boxes.push({ kind: 'component', box: { x: moved.faces.left, y: moved.faces.top, width: moved.faces.right - moved.faces.left, height: moved.faces.bottom - moved.faces.top } })
    }
    return { ghost: 'path' in ghost ? ghost.path : null, after, before, boxes, skipped, touched }
  }, [glyph, identity, bundle, edit, mode, inkStyle])
  // Δ가 아직 없으면 그냥 내 획. '안 닿음' 표시도, 흐리게도 안 한다.
  const live = mode === 'layout' ? hasLayoutEdit(edit) : hasShapeEdit(edit)
  const note = !view ? (error || '읽는 중') : !live ? '' : view.touched === 0 ? 'Δ 안 닿음' : view.skipped > 0 ? '일부 Δ 미적용' : ''
  return <figure className={styles.card} data-testid="review-propagation-card" data-mode={mode} data-touched={view && live ? view.touched > 0 : undefined}>
    <svg viewBox={VIEW_BOX} role="img" aria-label={`${identity.character} 미리보기`}>
      <rect x="0" y="0" width="1" height="1" fill="#fff" />
      {view?.boxes.map((item, index) => <rect key={index} x={item.box.x} y={item.box.y} width={item.box.width} height={item.box.height} fill={BOX_COLOR[item.kind]} fillOpacity=".12" stroke={BOX_COLOR[item.kind]} strokeOpacity=".5" strokeWidth=".004" />)}
      {view?.ghost && <path d={view.ghost} fill="#3a3a36" fillOpacity=".35" fillRule="evenodd" />}
      {view?.after.map((path, index) => <path key={index} d={path} fill="#111" fillRule="evenodd" />)}
      {view?.before.map((path, index) => <path key={`b${index}`} d={path} fill="none" stroke="#f0561e" strokeWidth=".006" strokeDasharray=".012 .008" />)}
    </svg>
    <figcaption>
      <b>{identity.character}</b>
      {note && <small>{note}</small>}
    </figcaption>
  </figure>
}

function DeltaList({ rails, testId }: { rails: EditableRail[]; testId: string }) {
  return <div className={styles.deltas} data-testid={testId}>
    {rails.map((rail) => { const units = (rail.value - rail.original) * 1000; return <span key={rail.id}><i>{rail.label}</i>{units >= 0 ? '+' : ''}{units.toFixed(0)}u</span> })}
  </div>
}

function CardGrid({ candidates, bundle, edit, mode }: { candidates: CorpusIdentity[]; bundle: NotoPresetModelBundle | null; edit: PropagationEdit; mode: EditKind }) {
  if (!bundle) return <p className={styles.empty}>모델 읽는 중</p>
  return <div className={styles.cards}>
    {candidates.map((identity) => <PropagationCard key={identity.codepoint} identity={identity} bundle={bundle} edit={edit} mode={mode} />)}
  </div>
}

export function ReviewPropagationCards({ source, bundle, edit, changed, focus }: {
  source: CorpusIdentity
  bundle: NotoPresetModelBundle | null
  edit: PropagationEdit
  /** 모델 값에서 벗어난 rail. 머리에 이름과 Δ(u)를 보인다. */
  changed: EditableRail[]
  /** 지금 잡은 rail의 부품. 이게 있어야 카드가 뜬다. */
  focus?: Part
}) {
  const [scope, setScope] = useState<PropagationScope>('layer')
  const [page, setPage] = useState(0)
  const [promoted, setPromoted] = useState(false)
  const layoutActive = hasLayoutEdit(edit)
  const shapeActive = hasShapeEdit(edit)
  const layoutRails = changed.filter((rail) => editKindOf(rail) === 'layout')
  const shapeRails = changed.filter((rail) => editKindOf(rail) === 'shape')
  // 그리드는 하나. 형태 Δ를 올리면 같은 자모 카드에 형태 모드로 얹고, 아니면 배치 모드(Δ 없으면 내 획만).
  const mode: EditKind = shapeActive && promoted ? 'shape' : 'layout'
  const cardScope: CandidateScope = mode === 'shape' ? 'jamo' : scope
  const candidates = useMemo(() => focus ? propagationCandidates({ source, scope: cardScope, count: CARD_COUNT, page, focus }) : [], [focus, source, cardScope, page])
  const scopeHint = PROPAGATION_SCOPES.find((item) => item.id === scope)?.hint ?? ''
  const hint = layoutActive ? `배치 Δ · ${scopeHint} · 저장 안 됨` : shapeActive ? '배치 Δ 없음 · 아래 형태 Δ만' : focus ? `${scopeHint} · 기준선을 옮기면 Δ가 얹힙니다` : '기준선을 잡으면 여기 보입니다'
  return <section className={styles.section} aria-label="다른 글자에 적용하면" data-testid="review-propagation">
    <div className={styles.head}>
      <span>다른 글자에 적용하면<small>{hint}</small></span>
      {focus && <button type="button" onClick={() => setPage((current) => current + 1)} data-testid="review-propagation-next">다른 글자</button>}
    </div>
    <div className={styles.scopes} role="group" aria-label="배치 적용 범위">
      {PROPAGATION_SCOPES.map((item) => <button type="button" key={item.id} aria-pressed={item.id === scope} disabled={!focus || mode === 'shape'} onClick={() => { setScope(item.id); setPage(0) }}>{item.label}</button>)}
    </div>
    {/* Δ 줄은 늘 자리를 차지한다. 옮길 때 카드가 아래로 밀리지 않게. */}
    <DeltaList rails={layoutRails} testId="review-propagation-deltas" />
    {shapeActive && <div className={styles.shape} data-testid="review-propagation-shape">
      <div className={styles.head}>
        <span>자모 형태 Δ<small>시작·끝 = 획 길이 · 자소 탭 몫 · 같은 홀자에 슬롯 비율로</small></span>
        {!promoted && <button type="button" onClick={() => setPromoted(true)} data-testid="review-propagation-promote">이 자모로 올리기</button>}
      </div>
      <DeltaList rails={shapeRails} testId="review-propagation-shape-deltas" />
    </div>}
    {focus && <CardGrid candidates={candidates} bundle={bundle} edit={edit} mode={mode} />}
  </section>
}
