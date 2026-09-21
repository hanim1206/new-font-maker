import { useEffect, useImperativeHandle, useMemo, useState } from 'react'
import type { Ref } from 'react'
import { boxToFaces, facesOffsets, resolveContextBoxes } from '../src/services/contextBoxResolver'
import { notoOutlineGhostPath } from '../src/services/notoOutlineInk'
import type { BoxConfig, Part } from '../src/types'
import type { CorpusIdentity } from './notoCorpus'
import { fitComponentsForGlyph, renderComponentPart } from './notoComponentFitView'
import { fitMedialForGlyph, renderMedialPart, withSlotFaces } from './notoMedialFitView'
import type { EditableRail } from './notoMedialFitView'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'
import { useNotoGlyph } from './useNotoGlyph'
import { useFitInkStyle } from './useFitInkStyle'
import { jamoPartOf, layoutDeltaSnapshot, useLayoutDelta, useLayoutDeltaStore } from './layoutDeltaStore'
import { LayoutScopeStrip } from './LayoutScopeStrip'
import type { OverrideGroup } from './layoutOverrides'
import type { LayoutDeltaSnapshot } from './layoutDeltaStore'
import { ruleOfContext, withJamos } from './scopeRule'
import type { RuleJamoPart, ScopeRule } from './scopeRule'
import { applyFacesDelta, applyMedialDelta, focusJamoOf, hasLayoutEdit, jamoChoicesFor, layoutDeltaOf, PART_GROUP_LABEL, PROPAGATION_SCOPES, propagationCandidates } from './reviewPropagation'
import type { PropagationEdit, PropagationScope } from './reviewPropagation'
import styles from './ReviewPropagationCards.module.css'

/**
 * 검수 글자 화면 아래 카드 묶음. 기준선을 잡으면 이 레이아웃(같은 문맥) 글자를 늘 띄워 두고, 옮긴 Δ만 얹는다.
 * 카드는 미리보기, `적용`을 누르면 배치 Δ가 `layoutDeltaStore`에 범위대로 저장돼 앱 전체 배치에 얹힌다. 획 길이(형태)는 여기서 안 다룬다 — `획 고치기`의 몫.
 * 카드는 rail을 옮길 때가 아니라 잡을 때 정해진다. 옮기는 동안 후보가 안 바뀌어 번쩍이지 않는다.
 * - 배치 Δ(중심 rail·홀자 상자 변·닿자 네 변): 기본 `이 레이아웃`, `이 자모만`은 잡은 부품의 자모로 좁힐 때(여러 자모 가능), `전체`는 일부러 넓힐 때. em 그대로.
 * 카드 = Noto 고스트(회색) + Δ 적용한 내 획(검정) + Δ 전 내 획(주황 점선). Δ 없으면 내 획만.
 */

const VIEW_BOX = '-0.08 -0.08 1.16 1.16'
const CARD_COUNT = 8
const RULE_PART: Record<OverrideGroup, RuleJamoPart> = { CH: 'initial', JU: 'medial', JO: 'final' }

interface CardBox { kind: 'medial' | 'component'; box: BoxConfig }
const BOX_COLOR: Record<CardBox['kind'], string> = { medial: '#3b6fd6', component: '#2f9a6a' }

function PropagationCard({ identity, bundle, edit, ghostVisible, onPick }: { identity: CorpusIdentity; bundle: NotoPresetModelBundle; edit: PropagationEdit; ghostVisible: boolean; onPick?: (character: string) => void }) {
  const { glyph, error } = useNotoGlyph(identity.codepoint)
  const inkStyle = useFitInkStyle()
  // 이 글자에 이미 저장된 Δ 위에 지금 편집 Δ를 얹는다. 렌더러가 보는 상자와 같은 출발점.
  const savedDelta = useLayoutDelta(identity)
  const view = useMemo(() => {
    if (!glyph) return null
    const ghost = notoOutlineGhostPath(glyph.outline)
    const context = resolveContextBoxes({ identity, model: bundle, delta: savedDelta })
    const medialView = fitMedialForGlyph({ context, outline: glyph.outline, approved: null })
    const componentParts = fitComponentsForGlyph({ context, outline: glyph.outline, approved: null })
    const after: string[] = []
    const before: string[] = []
    const boxes: CardBox[] = []
    let skipped = 0
    let touched = 0
    for (const modelPart of medialView.parts) {
      const base = renderMedialPart(modelPart, undefined, inkStyle)
      // 홀자 상자 변 Δ. 칸 해석과 같은 순서로 rail Δ보다 먼저 얹는다. 못 놓는 글자는 Δ를 안 받는다.
      // 고정은 이 글자의 slot 변 기준 오프셋으로 풀어 아핀에 넘긴다(칸 해석과 같은 규칙).
      const slotDelta = modelPart.fit ? facesOffsets(boxToFaces(modelPart.fit.slot), edit.layout.slot[modelPart.part]) : undefined
      const slotMoved = withSlotFaces(modelPart, slotDelta)
      const part = slotMoved.ok ? slotMoved.part : modelPart
      const slotTouched = slotMoved.ok && part !== modelPart
      if (slotDelta && !slotMoved.ok) skipped += 1
      // 중심 rail Δ는 em 그대로.
      const delta = part.fit ? edit.layout.medial[part.part] : undefined
      const applied = delta && part.fit ? applyMedialDelta(part.fit, delta) : null
      if (applied) skipped += applied.skipped
      if (!slotTouched && !(applied && applied.applied > 0)) { if (base.path) after.push(base.path); continue }
      const moved = renderMedialPart(part, applied && applied.applied > 0 ? applied.rails : undefined, inkStyle)
      // 순서·간격 위반이면 이 글자는 Δ를 못 받는다(클램프 = 자동 예외).
      // rail을 못 놓으면(slot 없음) 이 글자는 Δ를 못 받는다. 앱 획이 칸에 안 맞는 건(잉크 없음) Δ 문제가 아니라 상자만 보인다.
      if (!moved.slot) { if (base.path) after.push(base.path); skipped += applied?.applied ?? 0; continue }
      touched += 1
      if (moved.path) after.push(moved.path)
      if (base.path) before.push(base.path)
      if (moved.slot) boxes.push({ kind: 'medial', box: moved.slot })
    }
    for (const part of componentParts) {
      const base = renderComponentPart(part, undefined, inkStyle)
      const delta = edit.layout.component[part.part]
      if (!delta || !part.faces) { if (base.path) after.push(base.path); continue }
      const moved = renderComponentPart(part, applyFacesDelta(part.faces, delta), inkStyle)
      if (!moved.path) { if (base.path) after.push(base.path); skipped += 1; continue }
      touched += 1
      after.push(moved.path)
      if (base.path) before.push(base.path)
      if (moved.faces) boxes.push({ kind: 'component', box: { x: moved.faces.left, y: moved.faces.top, width: moved.faces.right - moved.faces.left, height: moved.faces.bottom - moved.faces.top } })
    }
    return { ghost: 'path' in ghost ? ghost.path : null, after, before, boxes, skipped, touched }
  }, [glyph, identity, bundle, edit, inkStyle, savedDelta])
  // Δ가 아직 없으면 그냥 내 획. '안 닿음' 표시도, 흐리게도 안 한다.
  const live = hasLayoutEdit(edit)
  const note = !view ? (error || '읽는 중') : !live ? '' : view.touched === 0 ? 'Δ 안 닿음' : view.skipped > 0 ? '일부 Δ 미적용' : ''
  return <figure className={styles.card} data-testid="review-propagation-card" data-touched={view && live ? view.touched > 0 : undefined}>
    {/* 카드를 누르면 그 글자를 연다. 안 끝난 Δ가 있으면 잠근다 — 글자를 바꾸면 편집이 날아가서다(`획 고치기`와 같은 규칙). */}
    <button type="button" disabled={!onPick || live} onClick={() => onPick?.(identity.character)} aria-label={`${identity.character} 열기`} data-testid="review-propagation-open">
    <svg viewBox={VIEW_BOX} role="img" aria-label={`${identity.character} 미리보기`}>
      <rect x="0" y="0" width="1" height="1" fill="#fff" />
      {view?.boxes.map((item, index) => <rect key={index} x={item.box.x} y={item.box.y} width={item.box.width} height={item.box.height} fill={BOX_COLOR[item.kind]} fillOpacity=".12" stroke={BOX_COLOR[item.kind]} strokeOpacity=".5" strokeWidth=".004" />)}
      {ghostVisible && view?.ghost && <path d={view.ghost} fill="#3a3a36" fillOpacity=".35" fillRule="evenodd" data-testid="review-propagation-ghost" />}
      {view?.after.map((path, index) => <path key={index} d={path} fill="#111" fillRule="evenodd" />)}
      {view?.before.map((path, index) => <path key={`b${index}`} d={path} fill="none" stroke="#f0561e" strokeWidth=".006" strokeDasharray=".012 .008" />)}
    </svg>
    </button>
    <figcaption>
      <b>{identity.character}</b>
      {note && <small>{note}</small>}
    </figcaption>
  </figure>
}

/** Δ 줄. 더하기는 `+10u`, 고정은 `= 718`(em×1000 자리). */
function DeltaList({ rails, fixed, testId }: { rails: EditableRail[]; fixed?: ReadonlySet<string>; testId: string }) {
  return <div className={styles.deltas} data-testid={testId}>
    {rails.map((rail) => {
      if (fixed?.has(rail.id)) return <span key={rail.id} data-fixed="true"><i>{rail.label}</i>= {Math.round(rail.value * 1000)}</span>
      const units = (rail.value - rail.original) * 1000
      return <span key={rail.id}><i>{rail.label}</i>{units >= 0 ? '+' : ''}{units.toFixed(0)}u</span>
    })}
  </div>
}

function CardGrid({ candidates, bundle, edit, ghostVisible, onNearEnd, onPick }: { candidates: CorpusIdentity[]; bundle: NotoPresetModelBundle | null; edit: PropagationEdit; ghostVisible: boolean; onPick?: (character: string) => void; /** 오른쪽 끝 가까이 밀었을 때. 다음 묶음을 붙인다. */ onNearEnd: () => void }) {
  if (!bundle) return <p className={styles.empty}>모델 읽는 중</p>
  return <div className={styles.cards} data-testid="review-propagation-cards" onScroll={(event) => { const el = event.currentTarget; if (el.scrollLeft + el.clientWidth * 2 >= el.scrollWidth) onNearEnd() }}>
    {candidates.map((identity) => <PropagationCard key={identity.codepoint} identity={identity} bundle={bundle} edit={edit} ghostVisible={ghostVisible} onPick={onPick} />)}
  </div>
}

/** 편집기 하단 바가 `적용`을 누를 때 쓰는 손잡이. 범위·고른 자모는 카드가 들고 있어서 여기로 판다. */
export interface ReviewPropagationHandle { apply: () => void }

export function ReviewPropagationCards({ source, bundle, edit, changed, fixed, focus, ghostVisible = true, onApplied, onCommitted, onSelectPart, onScopeLabel, onScope, onPickCharacter, ref }: {
  source: CorpusIdentity
  bundle: NotoPresetModelBundle | null
  edit: PropagationEdit
  /** 모델 값에서 벗어난 rail(고정된 rail 포함). 머리에 이름과 Δ(u)를 보인다. */
  changed: EditableRail[]
  /** 고정(`= 자리`)한 변 rail id. Δ 줄 표시용. */
  fixed?: ReadonlySet<string>
  /** 지금 잡은 rail의 부품. 이게 있어야 카드가 뜬다. */
  focus?: Part
  /** 배치 Δ를 저장한 뒤. 호출자는 세션 편집을 비워 새 original에서 다시 시작한다. */
  onApplied?: () => void
  /** 저장소가 바뀐 직후(적용·지우기). 앞뒤 스냅샷을 넘겨 호출자가 Undo 기록을 남긴다. */
  onCommitted?: (before: LayoutDeltaSnapshot, after: LayoutDeltaSnapshot) => void
  /** 오버라이드 카드(자모별)를 누르면 그 부품을 켠다. 캔버스의 부품 고르기와 같은 경로. */
  onSelectPart?: (part: Part) => void
  /** 편집 캔버스의 `Noto 고스트` 토글을 따른다. 끄면 카드에서도 고스트를 뺀다. */
  ghostVisible?: boolean
  /** 지금 범위 이름(`이 레이아웃` · `ㄱ·ㅋ` · `전체`). 하단 바의 `…에 적용` 글씨용. */
  onScopeLabel?: (label: string) => void
  /** 지금 범위. 캔버스 옆 레이아웃 여섯 칸 표지가 어느 칸을 켤지 정할 때 쓴다. */
  onScope?: (scope: PropagationScope) => void
  /** 예시 글자 카드를 눌렀을 때. 호출자가 그 글자를 연다. */
  onPickCharacter?: (character: string) => void
  ref?: Ref<ReviewPropagationHandle>
}) {
  const [scope, setScope] = useState<PropagationScope>('layer')
  const applyDelta = useLayoutDeltaStore((state) => state.apply)
  const clearDelta = useLayoutDeltaStore((state) => state.clear)
  // `이 자모만`에서 고른 자모. 기본은 잡은 자모 하나. 부품이 바뀌면 고른 것을 버린다. 최소 하나는 남는다.
  const focusJamo = focusJamoOf(source, focus)
  const group = focus ? jamoPartOf(focus) : 'JU'
  const [picked, setPicked] = useState<{ group: OverrideGroup; jamos: string[] } | null>(null)
  const jamos = useMemo(() => picked?.group === group && picked.jamos.length > 0 ? picked.jamos : focusJamo ? [focusJamo] : [], [focusJamo, picked, group])
  const togglePicked = (jamo: string) => setPicked(jamos.includes(jamo) ? (jamos.length > 1 ? { group, jamos: jamos.filter((item) => item !== jamo) } : { group, jamos }) : { group, jamos: [...jamos, jamo] })
  // 고른 범위 = 규칙식. `이 레이아웃`은 문맥만, `이 자모만`은 거기에 잡은 부품의 자모 목록을 얹은 것.
  const target = useMemo<ScopeRule>(() => {
    if (scope === 'all') return {}
    const base = ruleOfContext(source.contextId)
    return scope === 'layer' ? base : withJamos(base, RULE_PART[group], jamos)
  }, [scope, source.contextId, jamos, group])
  // 저장은 자모마다 규칙 하나씩이다. 칩 ×가 고른 자모 중 하나만 지울 수 있어야 해서 — 목록 하나로 합치는 건 옵션 박스(B)에서 정한다.
  const saveTargets = useMemo<ScopeRule[]>(() => {
    if (scope !== 'jamo') return [target]
    const base = ruleOfContext(source.contextId)
    return jamos.map((jamo) => withJamos(base, RULE_PART[group], [jamo]))
  }, [scope, target, source.contextId, jamos, group])
  const commit = (change: () => void) => { const before = layoutDeltaSnapshot(); change(); onCommitted?.(before, layoutDeltaSnapshot()); onApplied?.() }
  // 자모 칩을 누르면 그 부품이 켜지고 고른 자모는 그 하나가 돼 표본이 그 글자로 바뀐다. 여러 자모는 시트에서 고른다.
  const pickJamo = (jamoGroup: OverrideGroup, jamo: string) => { onSelectPart?.(jamoGroup); setPicked({ group: jamoGroup, jamos: [jamo] }); setScope('jamo') }
  // `이 자모만`의 자모 고르기 시트. 고르는 즉시 표본이 바뀌고 `완료`는 닫기만 한다.
  const [pickerOpen, setPickerOpen] = useState(false)
  useEffect(() => {
    if (!pickerOpen) return
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setPickerOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [pickerOpen])
  // 표본은 지금 범위의 글자. Δ 없으면 내 획만. 한 묶음(8장)으로 시작하고, 옆으로 밀어 끝에 가까워지면 다음 묶음을 붙인다. 한 바퀴 돌아 새 글자가 없으면 멈춘다.
  // 글자·범위·고른 자모가 바뀌면 줄을 새로 만들고(key) 한 묶음으로 돌아간다.
  const rowKey = `${source.codepoint}:${scope}:${group}:${jamos.join('')}`
  const [loaded, setLoaded] = useState({ rowKey, batches: 1 })
  const batches = loaded.rowKey === rowKey ? loaded.batches : 1
  const { candidates, exhausted } = useMemo(() => {
    const list: CorpusIdentity[] = []
    if (!focus) return { candidates: list, exhausted: true }
    const seen = new Set<number>()
    for (let page = 0; page < batches; page += 1) {
      const fresh = propagationCandidates({ source, scope, count: CARD_COUNT, page, focus, jamos }).filter((item) => !seen.has(item.codepoint))
      if (fresh.length === 0) return { candidates: list, exhausted: true }
      for (const item of fresh) { seen.add(item.codepoint); list.push(item) }
    }
    return { candidates: list, exhausted: false }
  }, [focus, source, scope, batches, jamos])
  const loadNextBatch = () => { if (!exhausted) setLoaded((current) => (current.rowKey === rowKey ? current.batches : 1) === batches ? { rowKey, batches: batches + 1 } : current) }
  const scopeLabel = scope === 'jamo' ? jamos.join('·') : PROPAGATION_SCOPES.find((item) => item.id === scope)?.label ?? ''
  useEffect(() => { onScopeLabel?.(scopeLabel) }, [onScopeLabel, scopeLabel])
  useEffect(() => { onScope?.(scope) }, [onScope, scope])
  // 적용 = 지금 범위에 Δ 저장. 하단 바가 ref로 부른다. 닫힘값은 렌더마다 새로 잡는다(ref 갱신은 값싸다).
  useImperativeHandle(ref, () => ({ apply: () => commit(() => { for (const rule of saveTargets) applyDelta(rule, layoutDeltaOf(edit)) }) }))
  return <section className={styles.section} aria-label="다른 글자에 적용하면" data-testid="review-propagation">
    {/* 범위 띠 = 적용 범위 고르기 + 쌓인 오버라이드. 저장된 Δ는 이미 캔버스 original에 들어 있고, 지우기는 칩 ×로(Undo 됨). */}
    <LayoutScopeStrip source={source} selected={target} pickerOn={scope === 'jamo'} picked={scope === 'jamo' ? { group, jamos } : null} fixedDisabled={!focus} jamoDisabled={false}
      onScope={setScope} onPickJamo={pickJamo} onOpenPicker={() => { setScope('jamo'); setPickerOpen(true) }} onRemove={(removed) => commit(() => clearDelta(removed))} />
    {/* Δ 줄은 늘 자리를 차지한다. 옮길 때 카드가 아래로 밀리지 않게. */}
    <div className={styles.deltaRow}>
      <DeltaList rails={changed} fixed={fixed} testId="review-propagation-deltas" />
    </div>
    {focus && <CardGrid key={rowKey} candidates={candidates} bundle={bundle} edit={edit} ghostVisible={ghostVisible} onNearEnd={loadNextBatch} onPick={onPickCharacter} />}
    {/* 자모 고르기 시트. 잡은 부품 자리에 올 수 있는 자모 전부. 기본은 잡은 자모 하나, 마지막 하나는 못 끈다. 여러 개를 켜면 같은 Δ가 자모마다 따로 저장된다. */}
    {pickerOpen && focus && <div className={styles.sheetBackdrop} onClick={() => setPickerOpen(false)}>
      <div className={styles.sheet} role="dialog" aria-modal="true" aria-label={`${PART_GROUP_LABEL[group]} 자모 고르기`} onClick={(event) => event.stopPropagation()}>
        <header>
          <span><b>{PART_GROUP_LABEL[group]} 자모 고르기</b><small>이 레이아웃에서 {PART_GROUP_LABEL[group]}{group === 'JO' ? '이' : '가'} 고른 자모인 글자에만 · 자모마다 따로 저장</small></span>
          <button type="button" onClick={() => setPickerOpen(false)} data-testid="review-propagation-jamos-done">완료</button>
        </header>
        <div className={styles.jamos} role="group" aria-label={`${PART_GROUP_LABEL[group]} 자모`} data-testid="review-propagation-jamos">
          {jamoChoicesFor(focus).map((jamo) => { const on = jamos.includes(jamo); return <button type="button" key={jamo} aria-pressed={on} disabled={on && jamos.length === 1} data-jamo={jamo} onClick={() => togglePicked(jamo)}>{jamo}</button> })}
        </div>
      </div>
    </div>}
  </section>
}
