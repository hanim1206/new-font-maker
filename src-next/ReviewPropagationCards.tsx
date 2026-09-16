import { useMemo, useState } from 'react'
import { resolveContextBoxes } from '../src/services/contextBoxResolver'
import { fitRailAxis } from '../src/services/notoMedialMasterFit'
import { notoOutlineGhostPath } from '../src/services/notoOutlineInk'
import type { BoxConfig } from '../src/types'
import type { CorpusIdentity } from './notoCorpus'
import { fitComponentsForGlyph, renderComponentPart } from './notoComponentFitView'
import { fitMedialForGlyph, renderMedialPart } from './notoMedialFitView'
import type { EditableRail } from './notoMedialFitView'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'
import { useNotoGlyph } from './useNotoGlyph'
import { applyFacesDelta, applyMedialDelta, editKindOf, hasLayoutEdit, hasShapeEdit, PROPAGATION_SCOPES, propagationCandidates, shapeDeltaToEm } from './reviewPropagation'
import type { EditKind, PropagationEdit, PropagationScope } from './reviewPropagation'
import styles from './ReviewPropagationCards.module.css'

/**
 * 검수 글자 화면 아래 카드 묶음. 지금 옮긴 기준선 Δ를 다른 글자에 얹어 보여준다. 저장이 아니라 미리보기.
 * - 배치 Δ(중심 rail·닿자 네 변): 범위 `이 층 · 전체`, em 그대로.
 * - 형태 Δ(시작·끝 rail): `이 자모로 올리기`를 누르면 같은 홀자 글자에 슬롯 비율로. 본래 자소 탭 몫.
 * 카드 = Noto 고스트(회색) + Δ 적용한 내 획(검정) + Δ 전 내 획(주황 점선).
 */

const VIEW_BOX = '-0.08 -0.08 1.16 1.16'
const CARD_COUNT = 8

interface CardBox { kind: 'medial' | 'component'; box: BoxConfig }
const BOX_COLOR: Record<CardBox['kind'], string> = { medial: '#3b6fd6', component: '#2f9a6a' }

function PropagationCard({ identity, bundle, edit, mode }: { identity: CorpusIdentity; bundle: NotoPresetModelBundle; edit: PropagationEdit; mode: EditKind }) {
  const { glyph, error } = useNotoGlyph(identity.codepoint)
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
      const base = renderMedialPart(part)
      // 배치는 em Δ 그대로, 형태는 이 글자 슬롯 길이에 비율을 곱해 em으로.
      const delta = !part.fit ? undefined : mode === 'layout' ? edit.layout.medial[part.part] : (() => { const ratios = edit.shape.medial[part.part]; return ratios && part.fit ? shapeDeltaToEm(ratios, part.fit.slot, fitRailAxis) : undefined })()
      if (!delta || !part.fit) { if (base.path) after.push(base.path); continue }
      const applied = applyMedialDelta(part.fit.railsEm, delta)
      skipped += applied.skipped
      if (applied.applied === 0) { if (base.path) after.push(base.path); continue }
      const moved = renderMedialPart(part, applied.rails)
      // 순서·간격 위반이면 이 글자는 Δ를 못 받는다(클램프 = 자동 예외).
      if (!moved.path) { if (base.path) after.push(base.path); skipped += applied.applied; continue }
      touched += 1
      after.push(moved.path)
      if (base.path) before.push(base.path)
      if (moved.slot) boxes.push({ kind: 'medial', box: moved.slot })
    }
    for (const part of componentParts) {
      const base = renderComponentPart(part)
      const delta = mode === 'layout' ? edit.layout.component[part.part] : undefined
      if (!delta || !part.faces) { if (base.path) after.push(base.path); continue }
      const moved = renderComponentPart(part, applyFacesDelta(part.faces, delta))
      if (!moved.path) { if (base.path) after.push(base.path); skipped += 1; continue }
      touched += 1
      after.push(moved.path)
      if (base.path) before.push(base.path)
      if (moved.faces) boxes.push({ kind: 'component', box: { x: moved.faces.left, y: moved.faces.top, width: moved.faces.right - moved.faces.left, height: moved.faces.bottom - moved.faces.top } })
    }
    return { ghost: 'path' in ghost ? ghost.path : null, after, before, boxes, skipped, touched }
  }, [glyph, identity, bundle, edit, mode])
  const note = !view ? (error || '읽는 중') : view.touched === 0 ? 'Δ 안 닿음' : view.skipped > 0 ? '일부 Δ 미적용' : ''
  return <figure className={styles.card} data-testid="review-propagation-card" data-mode={mode} data-touched={view ? view.touched > 0 : undefined}>
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

export function ReviewPropagationCards({ source, bundle, edit, changed }: {
  source: CorpusIdentity
  bundle: NotoPresetModelBundle | null
  edit: PropagationEdit
  /** 모델 값에서 벗어난 rail. 머리에 이름과 Δ(u)를 보인다. */
  changed: EditableRail[]
}) {
  const [scope, setScope] = useState<PropagationScope>('layer')
  const [layoutPage, setLayoutPage] = useState(0)
  const [shapePage, setShapePage] = useState(0)
  const [promoted, setPromoted] = useState(false)
  const layoutActive = hasLayoutEdit(edit)
  const shapeActive = hasShapeEdit(edit)
  const layoutRails = changed.filter((rail) => editKindOf(rail) === 'layout')
  const shapeRails = changed.filter((rail) => editKindOf(rail) === 'shape')
  const layoutCandidates = useMemo(() => layoutActive ? propagationCandidates({ source, scope, count: CARD_COUNT, page: layoutPage }) : [], [layoutActive, source, scope, layoutPage])
  const shapeCandidates = useMemo(() => shapeActive && promoted ? propagationCandidates({ source, scope: 'jamo', count: CARD_COUNT, page: shapePage }) : [], [shapeActive, promoted, source, shapePage])
  const scopeHint = PROPAGATION_SCOPES.find((item) => item.id === scope)?.hint ?? ''
  return <section className={styles.section} aria-label="다른 글자에 적용하면" data-testid="review-propagation">
    <div className={styles.head}>
      <span>다른 글자에 적용하면<small>{layoutActive ? `배치 Δ · ${scopeHint} · 저장 안 됨` : shapeActive ? '배치 Δ 없음 · 아래 형태 Δ만' : '기준선을 옮기면 여기 보입니다'}</small></span>
      {layoutActive && <button type="button" onClick={() => setLayoutPage((current) => current + 1)} data-testid="review-propagation-next">다른 글자</button>}
    </div>
    <div className={styles.scopes} role="group" aria-label="배치 적용 범위">
      {PROPAGATION_SCOPES.map((item) => <button type="button" key={item.id} aria-pressed={item.id === scope} disabled={!layoutActive} onClick={() => { setScope(item.id); setLayoutPage(0) }}>{item.label}</button>)}
    </div>
    {layoutActive && <>
      <DeltaList rails={layoutRails} testId="review-propagation-deltas" />
      <CardGrid candidates={layoutCandidates} bundle={bundle} edit={edit} mode="layout" />
    </>}
    {shapeActive && <div className={styles.shape} data-testid="review-propagation-shape">
      <div className={styles.head}>
        <span>자모 형태 Δ<small>시작·끝 = 획 길이 · 자소 탭 몫 · 같은 홀자에 슬롯 비율로</small></span>
        {promoted
          ? <button type="button" onClick={() => setShapePage((current) => current + 1)} data-testid="review-propagation-shape-next">다른 글자</button>
          : <button type="button" onClick={() => setPromoted(true)} data-testid="review-propagation-promote">이 자모로 올리기</button>}
      </div>
      <DeltaList rails={shapeRails} testId="review-propagation-shape-deltas" />
      {promoted && <CardGrid candidates={shapeCandidates} bundle={bundle} edit={edit} mode="shape" />}
    </div>}
    {(layoutActive || (shapeActive && promoted)) && <p className={styles.legend}>검정 = Δ 적용한 내 획 · 주황 점선 = Δ 전 · 회색 = Noto 고스트 · 'Δ 안 닿음' = 역할이 달라 그대로</p>}
  </section>
}
