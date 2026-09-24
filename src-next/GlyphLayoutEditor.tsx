import { useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent, RefObject } from 'react'
import { notoOutlineGhostPath } from '../src/services/notoOutlineInk'
import { DevGhostToggle } from './DevGhostToggle'
import { DEV_TOOLS_ENABLED } from './devTools'
import { approvedInputFor } from './notoApprovedIndex'
import { editableComponentRailsOf, fitComponentsForGlyph, renderComponentPart } from './notoComponentFitView'
import type { ComponentFaces } from '../src/services/notoComponentFit'
import type { SlotFacesDelta } from '../src/services/notoMedialMasterFit'
import { resolveContextBoxes } from '../src/services/contextBoxResolver'
import type { BoxConfig, Part } from '../src/types'
import { editableRailsOf, editableSlotRailsOf, fitMedialForGlyph, renderMedialPart, withSlotFaces } from './notoMedialFitView'
import type { EditableRail } from './notoMedialFitView'
import { useNotoModel } from './notoModel'
import type { NotoPresetGlyph } from './notoPresetGlyphs'
import { LayoutContextCards } from './LayoutContextCards'
import { ReviewPropagationCards } from './ReviewPropagationCards'
import type { ReviewPropagationHandle, ScopeSelection } from './ReviewPropagationCards'
import { TouchedGlyphRow } from './TouchedGlyphRow'
import { ruleGlyphCount, ruleOfContext } from './scopeRule'
import type { ScopeRule } from './scopeRule'
import { seedRuleOf } from './layoutOverrides'
import { stackLabel } from './LayoutOptionStack'
import { useNotoGlyph } from './useNotoGlyph'
import { useLayoutDelta } from './layoutDeltaStore'
import type { LayoutDeltaSnapshot } from './layoutDeltaStore'
import { hasLayoutEdit, propagationEditOf, unreachedRailIds } from './reviewPropagation'
import { baselineRails } from './notoBaselineRails'
import type { BaselineRail } from './notoBaselineRails'
import { snapRail } from './railSnap'
import type { SnapHit } from './railSnap'
import { useFitInkStyle } from './useFitInkStyle'
import { layoutTypeOfSyllable } from '../src/utils/hangulUtils'
import { INACTIVE_PART_COLOR, PART_COLOR } from './partColors'
import styles from './GlyphLayoutEditor.module.css'

/**
 * 글자 하나의 배치를 기준선으로 고치는 편집부. 셸·제목이 없어 자소 탭 `레이아웃` 모드 안에 그대로 들어간다.
 * Noto 실측 윤곽을 고스트로 깔고, 그 위에 내 획(홀자 fit·닿자 박스 fit)과 기준선을 얹는다.
 * Noto 윤곽은 측정 원천·고스트·룩으로만 쓴다. 편집 대상이 아니고 잉크 union에도 들어가지 않는다.
 * 저장은 배치 Δ뿐이고 `layoutDeltaStore`로 간다. 이 컴포넌트는 값을 돌려주지 않는다.
 */

const VIEW_BOX = '-0.08 -0.08 1.16 1.16'
// export 기준선 id → 축·표시 이름. 길이(visibleLength) 타깃은 좌표가 아니라 그리지 않는다.
const VIEW_BOX_SIZE = 1.16
const GHOST_STORAGE_KEY = 'review-ghost-visible-v1'

function readGhostVisible(): boolean {
  // 끄는 버튼이 개발용이라 배포 빌드에서는 늘 꺼 둔다.
  if (!DEV_TOOLS_ENABLED) return false
  try { return localStorage.getItem(GHOST_STORAGE_KEY) !== 'off' } catch { return true }
}
function writeGhostVisible(visible: boolean) {
  try { localStorage.setItem(GHOST_STORAGE_KEY, visible ? 'on' : 'off') } catch { /* 저장 못 해도 화면은 동작 */ }
}

/** 기준선이 만드는 부품 상자. 홀자는 잉크 slot, 닿자는 네 변. 획 색이 아니라 상자 색으로 부품을 가른다. */
interface FitBox { id: string; kind: 'medial' | 'component'; part: Part; label: string; box: BoxConfig }

/** 부품 색. 상자·rail·라벨이 같은 색을 쓴다. 첫닿자 초록, 홀자 파랑, 받침 보라. 선택·스냅은 주황. */
const INACTIVE_COLOR = INACTIVE_PART_COLOR
const ACCENT = '#f0561e'
/** `이 자리에 맞추기`. 2026-09-24 사용자 요청으로 일단 끈다. 켜면 버튼과 `고정` 표지가 돌아온다. */
const FIX_RAIL_ENABLED = false
/** Noto 실측선 id 앞머리 → 부품. 혼합 홀자의 가로부·세로부는 둘 다 홀자 탭에 속한다. */
const measuredPartOf = (id: string): 'CH' | 'JU' | 'JO' => id.startsWith('initial.') ? 'CH' : id.startsWith('final.') ? 'JO' : 'JU'
const isMedialPart = (part: Part) => part === 'JU' || part === 'JU_H' || part === 'JU_V'
const samePartGroup = (a: Part, b: Part) => a === b || (isMedialPart(a) && isMedialPart(b))

/** `locked` = 옮겨도 글자에 안 닿는 rail. 보이기만 하고 손잡이가 없다. */
type CanvasRail = EditableRail & { part: Part; locked?: boolean }

// 방향키 → 축 방향 부호. 가로 위치(x)는 좌우, 세로 위치(y)는 상하(아래가 +).
const nudgeOf = (key: string, axis: 'x' | 'y'): number => axis === 'x' ? (key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0) : (key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0)

function GhostCanvas({ ghost, ghostVisible = true, measured, editable = [], activePart, selectedRail, snappedRail, snapHit, showDelta = true, onSelectRail, onDragRail, onDragState, onNudgeRail, onSelectPart, onEditPart, editLocked = false, onReleaseRail, label, overlays = [], componentOverlays = [], boxes = [] }: {
  ghost: string
  /** Noto 고스트를 끄면 내 획만 남아 어느 획을 바꿀지 보인다. */
  ghostVisible?: boolean
  /** Noto 실측 기준선. 참고용이라 옅은 점선, 조작 없음. */
  measured: BaselineRail[]
  /** 획 마스터 rail. 활성 부품 것만 잡고 끌 수 있다. */
  editable?: CanvasRail[]
  /** 활성 부품. 이 부품의 rail·상자만 제 색, 나머지는 회색으로 죽인다. 없으면 전부 활성. */
  activePart?: Part
  selectedRail?: string
  /** 드래그 중 붙은 다른 기준선 id. 그 선을 주황으로 켠다. */
  snappedRail?: string
  /** 끌다 걸린 자리. 글자 표지는 없고 잡은 rail이 주황이 된다. 종류는 캔버스 `data-snap`에. */
  snapHit?: SnapHit | null
  /** 기준값(지금은 모델, 저장이 생기면 마지막 저장값)에서 얼마나 옮겼는지 띠로 칠할지. */
  showDelta?: boolean
  /** 방향키 이동(em Δ). 손잡이에 초점을 두고 방향키 1u · Shift 10u. */
  onNudgeRail?: (id: string, delta: number) => void
  onSelectRail?: (id: string) => void
  /** 캔버스에서 rail을 직접 끈다. 값은 em 제안값, 호출자가 순서·간격을 판정한다. */
  onDragRail?: (id: string, value: number) => void
  /** 끌기가 시작되고(true) 끝날 때(false). 호출자가 끄는 동안 미뤄 둘 것을 안다. */
  onDragState?: (dragging: boolean) => void
  /** 부품 상자를 누르면 그 부품이 켜진다. 탭 대신 캔버스가 부품을 고른다. */
  onSelectPart?: (part: Part) => void
  /** 켜진 부품을 한 번 더 누르면 그 자소 획 편집으로 간다. */
  onEditPart?: (part: Part) => void
  /** 옮긴 보선을 아직 저장 안 했으면 획 편집으로 못 간다. */
  editLocked?: boolean
  /** 보선이 선택된 채 다른 곳을 누른 첫 탭. 선택만 풀고 그 탭은 다른 부품·보선에 넘기지 않는다. */
  onReleaseRail?: () => void
  label: string
  /** 내 홀자 획 마스터 잉크. 검정. */
  overlays?: string[]
  /** 닿자 박스 fit 잉크(앱 획). 검정. */
  componentOverlays?: string[]
  /** 획 뒤에 칠하는 부품 상자. */
  boxes?: FitBox[]
}) {
  const gesture = useRef<{ pointerId: number; id: string; axis: 'x' | 'y'; start: number; startValue: number } | null>(null)
  // 끄는 동안엔 선을 얇게 두고, 손을 떼야 굵어진다(확정). 주황도 끄는 동안 걸린 순간에만.
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const dragging = draggingId !== null
  // 잡은 보선의 처음 자리. 거기 겹친 실측 점선은 끄는 동안 뺀다 — 주황 띠가 이미 처음 자리를 보여 준다.
  const draggedFrom = editable.find((item) => item.id === draggingId)
  // 보선이 선택돼 있으면 다른 영역 · 빈 곳의 첫 탭은 선택 풀기에만 쓴다 — 고치자마자 다른 영역이 켜지면 어색하다.
  // 손잡이는 켠 영역 보선에만 있으니, 같은 영역의 다른 보선은 바로 잡는다.
  const releaseHold = (event: ReactPointerEvent<SVGSVGElement>) => {
    // 새 탭마다 먹을지 다시 정한다(끌다 끝나 클릭이 안 온 탭의 표시가 남지 않게).
    releasedByTap.current = false
    if (!selectedRail || !onReleaseRail) return
    if ((event.target as Element).closest('[data-rail-handle]')) return
    event.stopPropagation()
    event.preventDefault()
    // 보선을 놓으려고 누른 탭이 켜진 상자의 `획 고치기`로 새지 않게 이번 클릭은 먹는다(부품을 켠 탭도 같다 — 아래 상자 pointerdown).
    releasedByTap.current = true
    onReleaseRail()
  }
  const releasedByTap = useRef(false)
  const editPart = (part: Part) => {
    if (releasedByTap.current) { releasedByTap.current = false; return }
    onEditPart?.(part)
  }
  const startDrag = (rail: CanvasRail) => (event: ReactPointerEvent<SVGLineElement>) => {
    onSelectRail?.(rail.id)
    if (!onDragRail) return
    gesture.current = { pointerId: event.pointerId, id: rail.id, axis: rail.axis, start: rail.axis === 'x' ? event.clientX : event.clientY, startValue: rail.value }
    event.currentTarget.setPointerCapture(event.pointerId)
    setDraggingId(rail.id)
    onDragState?.(true)
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
    const current = gesture.current
    if (current?.pointerId !== event.pointerId) return
    gesture.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    setDraggingId(null)
    onDragState?.(false)
  }
  const geometryOf = (axis: 'x' | 'y', value: number) => axis === 'x' ? { x1: value, x2: value, y1: -0.06, y2: 1.02 } : { x1: -0.06, x2: 1.02, y1: value, y2: value }
  // 라벨은 글자 칸 밖 여백 띠에. x rail은 위(편집)·아래(실측) 띠 가운데, y rail은 오른 띠 끝 정렬. 호버 때만 보인다.
  const labelAt = (axis: 'x' | 'y', value: number, band: 'top' | 'bottom') => axis === 'x'
    ? { x: Math.min(0.92, Math.max(0.08, value)), y: band === 'top' ? -0.03 : 1.062, textAnchor: 'middle' as const }
    : { x: 1.07, y: value - 0.012, textAnchor: 'end' as const }
  return <svg className={styles.canvas} viewBox={VIEW_BOX} role="img" aria-label={label} data-testid="review-canvas" data-snap={snapHit?.kind} data-held={selectedRail} onPointerDownCapture={releaseHold}>
    <defs>
      {/* 자소 원형 캔버스와 같은 눈금: 1/16 잔선 + 1/4 굵은선 */}
      <pattern id="review-grid-fine" width=".0625" height=".0625" patternUnits="userSpaceOnUse"><path d="M.0625 0V.0625H0" fill="none" stroke="rgb(218 223 230 / .7)" strokeWidth=".002" /></pattern>
      <pattern id="review-grid-coarse" width=".25" height=".25" patternUnits="userSpaceOnUse"><path d="M.25 0V.25H0" fill="none" stroke="rgb(196 203 212 / .8)" strokeWidth=".003" /></pattern>
    </defs>
    <rect x="0" y="0" width="1" height="1" fill="#fff" />
    {/* 격자 · 글자몸 테두리 · Noto 실측선 · 다른 부품 보선은 끄는 동안에만 깐다(맞출 자리). 평소엔 켠 부품 보선과 베이스라인만. */}
    {dragging && <>
      <rect x="0" y="0" width="1" height="1" fill="url(#review-grid-fine)" data-testid="review-grid" />
      <rect x="0" y="0" width="1" height="1" fill="url(#review-grid-coarse)" />
      <rect x="0" y="0" width="1" height="1" fill="none" stroke="rgb(196 203 212)" strokeWidth=".004" />
    </>}
    <path d="M-.06 .88H1.02" stroke="#a6a297" strokeWidth=".003" />
    {/* 부품 상자. 획보다 아래, 고스트보다 아래. rail과 같은 부품 색. */}
    {boxes.map((item) => {
      const active = !activePart || samePartGroup(item.part, activePart)
      const color = PART_COLOR[item.part]
      return <g key={item.id} data-testid="review-fit-box" data-kind={item.kind} data-active={active}>
        {/* 켠 부품만 칠하고 테두리를 두른다. 안 켠 부품은 이름표만 남긴다 — 눌러서 바꿀 자리. */}
        {active && <rect x={item.box.x} y={item.box.y} width={item.box.width} height={item.box.height} fill={color} fillOpacity={0.36} stroke={color} strokeOpacity={0.85} strokeWidth={0.004} />}
        <text x={item.box.x + 0.008} y={item.box.y - 0.008} fontSize=".024" fill={color} fillOpacity={active ? 0.9 : 0.35}>{item.label}</text>
      </g>
    })}
    {/* Noto 고스트. 잉크가 아니라 비교용이라 반투명으로 깐다. 검정 획 아래에 두어 벗어난 곳만 회색으로 보인다. */}
    {ghostVisible && <path d={ghost} fill="#3a3a36" fillOpacity=".55" fillRule="evenodd" data-testid="review-ghost" />}
    {overlays.map((path, index) => <path key={index} d={path} fill="#1a1a1a" fillRule="evenodd" data-testid="review-fit-ink" />)}
    {componentOverlays.map((path, index) => <path key={`c${index}`} d={path} fill="#1a1a1a" fillRule="evenodd" data-testid="review-component-ink" />)}
    {/* Δ 띠. 켠 영역에서 옮긴 rail 전부: 기준값 자리와 지금 자리 사이를 주황 단색으로 칠한다. 선택을 풀어도 남는다. 잉크 위에 얹어 옮긴 구간이 바로 보인다.
        길이는 그 rail의 영역 상자 안으로만 — 캔버스 끝까지 그으면 다른 영역까지 덮는다. 상자가 없으면 캔버스 끝까지. */}
    {showDelta && editable.filter((rail) => (!activePart || samePartGroup(rail.part, activePart)) && Math.abs(rail.value - rail.original) > 1e-9).map((rail) => {
      const [from, to] = rail.value > rail.original ? [rail.original, rail.value] : [rail.value, rail.original]
      const area = boxes.find((item) => item.id === `${rail.id.startsWith('c') ? 'c' : 'm'}${rail.partIndex}`)?.box
      const band = rail.axis === 'x'
        ? { x: from, y: area?.y ?? -0.06, width: to - from, height: area?.height ?? 1.08 }
        : { x: area?.x ?? -0.06, y: from, width: area?.width ?? 1.08, height: to - from }
      return <rect key={`d${rail.id}`} {...band} fill={ACCENT} fillOpacity=".38" data-testid="review-delta-band" data-rail={rail.id} />
    })}
    {/* Noto 실측선. 활성 부품 것은 부품 색 점선, 나머지는 옅은 회색. 조작 없음. */}
    {dragging && measured.filter((rail) => !(draggedFrom && rail.axis === draggedFrom.axis && Math.abs(rail.value - draggedFrom.original) < 0.002)).map((rail) => {
      const snapped = rail.id === snappedRail
      const active = !activePart || samePartGroup(measuredPartOf(rail.id), activePart)
      const color = active ? PART_COLOR[measuredPartOf(rail.id)] : INACTIVE_COLOR
      const geometry = geometryOf(rail.axis, rail.value)
      return <g key={rail.id} className={styles.rail} data-rail={rail.id} data-snapped={snapped || undefined} data-active={active}>
        <line {...geometry} className={styles.railLine} stroke={color} strokeOpacity={active ? 0.7 : 0.6} strokeWidth={0.003} strokeDasharray=".012 .008" />
        {/* 호버용 히트 영역. 조작은 없고 라벨만 띄운다. */}
        <line {...geometry} className={styles.railHit} stroke="transparent" strokeWidth=".03" />
        <text {...labelAt(rail.axis, rail.value, 'bottom')} className={styles.railLabel} fontSize=".026" fill={color}>{rail.label}</text>
      </g>
    })}
    {/* 부품 고르기. 실측선 위·편집 rail 아래에 투명 히트 상자를 깔아 상자 안 아무 데나 누르면 그 부품이 켜진다. rail 손잡이가 뒤에 그려져 rail이 먼저 잡힌다.
        활성 상자는 이벤트를 통과시켜 그 안의 실측선 호버와 잉크가 그대로 살고, 겹친 자리에서 비활성 상자를 눌러 넘어갈 수 있다. */}
    {/* 켜진 상자를 한 번 더 누르면 획 편집(`onEditPart`). 올리거나 누르는 동안 상자가 부품 색으로 진해진다. 켜진 상자를 먼저 그려서 겹친 자리는 여전히 비활성 상자가 잡는다. */}
    {onSelectPart && [...boxes].sort((a, b) => Number(!activePart || !samePartGroup(a.part, activePart)) - Number(!activePart || !samePartGroup(b.part, activePart))).map((item) => {
      const active = !activePart || samePartGroup(item.part, activePart)
      const editable = active && !!onEditPart && !!activePart && !editLocked
      {/* pointer-events는 `auto`(투명 fill도 칠한 것으로 잡힘). `all`은 Chromium에서 rect 기하 밖까지 잡아 다른 상자를 가린다. */}
      return <rect key={`h${item.id}`} x={item.box.x} y={item.box.y} width={item.box.width} height={item.box.height} fill="transparent" pointerEvents={active && !editable ? 'none' : 'auto'} style={{ '--part': PART_COLOR[item.part] } as React.CSSProperties} className={styles.boxHit} data-testid="review-part-hit" data-part={item.part} data-active={active} role="button" tabIndex={0} aria-label={`${item.label} 선택`} data-edit-part={editable || undefined} aria-pressed={active}
        onPointerDown={() => { if (!active) { releasedByTap.current = true; onSelectPart(item.part) } }}
        onClick={() => { if (editable) editPart(item.part); else releasedByTap.current = false }}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (editable) onEditPart(item.part); else if (!active) onSelectPart(item.part) } }} />
    })}
    {/* 비활성 부품 rail은 먼저 그려 뒤로 보내고 손잡이도 없다. 활성 rail만 잡힌다. */}
    {[...editable].filter((rail) => dragging || !activePart || samePartGroup(rail.part, activePart)).sort((a, b) => Number(!activePart || samePartGroup(a.part, activePart)) - Number(!activePart || samePartGroup(b.part, activePart))).map((rail) => {
      const selected = rail.id === selectedRail
      // 걸린 상대 rail과, 걸린 채 잡고 있는 rail 둘 다(표지만). 모델·격자엔 상대 rail이 없어 잡은 rail에만 붙는다.
      const snapped = dragging && (rail.id === snappedRail || (!!snapHit && selected))
      const active = !activePart || samePartGroup(rail.part, activePart)
      // 끄는 중엔 부품 색 얇게, 손을 떼면 굵게. 걸려도 선 색은 안 바꾼다 — 번쩍여서 뺐다. 걸림은 진동과 `이 자리에 맞추기` 버튼으로.
      const stroke = active ? PART_COLOR[rail.part] : INACTIVE_COLOR
      const geometry = geometryOf(rail.axis, rail.value)
      return <g key={rail.id} className={active ? styles.rail : undefined} data-rail={rail.id} data-part={rail.part} data-active={active} data-locked={rail.locked || undefined} data-selected={selected || undefined} data-snapped={snapped || undefined} data-dragging={dragging || undefined}>
        {/* 후광. 선택이면 손 뗀 뒤에만, 활성 rail은 호버 때만(CSS). */}
        {active && <line {...geometry} className={styles.railHalo} stroke={stroke} strokeWidth=".032" strokeOpacity={selected && !dragging ? 0.2 : 0} strokeLinecap="round" />}
        <line {...geometry} className={styles.railLine} stroke={stroke} strokeWidth={dragging ? active ? 0.004 : 0.003 : selected ? 0.012 : active ? 0.004 : 0.003} strokeOpacity={rail.locked ? 0.45 : active ? 1 : 0.8} strokeDasharray={rail.locked ? '.02 .012' : undefined} />
        {onSelectRail && active && !rail.locked && <line {...geometry} className={styles.railButton} data-rail-handle={rail.id} stroke="transparent" strokeWidth=".08" role="button" tabIndex={0} aria-label={`${rail.label} 선택`} aria-pressed={selected} onPointerDown={startDrag(rail)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectRail(rail.id) } else if (onNudgeRail) { const nudge = nudgeOf(event.key, rail.axis); if (nudge !== 0) { event.preventDefault(); onSelectRail(rail.id); onNudgeRail(rail.id, nudge * (event.shiftKey ? 10 : 1) / 1000) } } }} />}
        {active && rail.locked && <line {...geometry} className={styles.railHit} stroke="transparent" strokeWidth=".03" />}
        {active && <text {...labelAt(rail.axis, rail.value, 'top')} className={styles.railLabel} fontSize=".03" fill={stroke}>{rail.label}{rail.locked ? ' · 글자에 안 닿음' : ''}</text>}
      </g>
    })}
    {/* Δ 수치. 선택한 rail은 크게, 나머지 바뀐 rail은 작고 옅게(저장 안 된 변경이 있다는 표시만). */}
    {showDelta && editable.filter((rail) => Math.abs(rail.value - rail.original) > 1e-9).map((rail) => {
      const active = rail.id === selectedRail
      const units = Math.round((rail.value - rail.original) * 1000)
      const mid = (rail.value + rail.original) / 2
      const at = rail.axis === 'x' ? { x: Math.min(0.92, Math.max(0.08, mid)), y: 1.066, textAnchor: 'middle' as const } : { x: 1.07, y: mid + 0.012, textAnchor: 'end' as const }
      return <text key={`u${rail.id}`} {...at} className={styles.deltaLabel} fontSize={active ? '.034' : '.024'} fill={PART_COLOR[rail.part]} fillOpacity={active ? 1 : 0.55} data-testid="review-delta-label" data-active={active}>{units > 0 ? '+' : ''}{units}u</text>
    })}
  </svg>
}

// 홀자 마스터 rail 키(core 역할 또는 보조 rail) → 세션에서 옮긴 em Δ.
type RailDeltaByPart = (Record<string, number> | undefined)[]

/** fit rail 값에 세션 Δ를 얹은 절대값. Δ가 없으면 undefined(= fit 그대로). */
function railsWithDelta(railsEm?: Readonly<Record<string, number>>, delta?: Readonly<Record<string, number>>): Record<string, number> | undefined {
  if (!railsEm || !delta) return undefined
  return Object.fromEntries(Object.entries(railsEm).map(([key, value]) => [key, value + (delta[key] ?? 0)]))
}

function GlyphLayoutBody({ glyph, initialPart, onCommitted, onEditStrokes, onPickCharacter, onScopeApplied, leaveGuardRef }: { glyph: NotoPresetGlyph; initialPart?: Part; onCommitted?: GlyphLayoutEditorProps['onCommitted']; onEditStrokes?: GlyphLayoutEditorProps['onEditStrokes']; onPickCharacter?: GlyphLayoutEditorProps['onPickCharacter']; onScopeApplied?: GlyphLayoutEditorProps['onScopeApplied']; leaveGuardRef?: GlyphLayoutEditorProps['leaveGuardRef'] }) {
  const codepoint = glyph.identity.codepoint
  const ghost = useMemo(() => notoOutlineGhostPath(glyph.outline), [glyph])
  const measured = useMemo(() => baselineRails(glyph), [glyph])
  const { bundle, error: modelError } = useNotoModel()
  // 칸 해석 함수 한 번 → 홀자 fit(rail)과 닿자 네 변. 렌더러와 같은 상자(저장된 배치 Δ 포함)다. 여기 값이 편집의 `original`.
  const savedDelta = useLayoutDelta(glyph.identity)
  const context = useMemo(() => bundle ? resolveContextBoxes({ identity: glyph.identity, model: bundle, delta: savedDelta }) : null, [bundle, glyph, savedDelta])
  const fitView = useMemo(() => context ? fitMedialForGlyph({ context, outline: glyph.outline, approved: approvedInputFor(codepoint) }) : null, [context, glyph, codepoint])
  const componentParts = useMemo(() => context ? fitComponentsForGlyph({ context, outline: glyph.outline, approved: approvedInputFor(codepoint) }) : [], [context, glyph, codepoint])
  const [facesByPart, setFacesByPart] = useState<(ComponentFaces | undefined)[]>([])
  // 화면 잉크는 자소 탭과 같은 글로벌 끝 모양으로. 측정·xor는 이 스타일을 안 탄다.
  const inkStyle = useFitInkStyle(layoutTypeOfSyllable(glyph.identity.medialJamo, glyph.identity.finalJamo !== null))
  const componentRendered = useMemo(() => componentParts.map((part, index) => renderComponentPart(part, facesByPart[index], inkStyle)), [componentParts, facesByPart, inkStyle])
  const componentOverlays = componentRendered.flatMap((part) => part.path ? [part.path] : [])
  // 홀자 편집은 세션 임시이고 칸 해석과 같은 순서로 쌓는다: 상자 변 Δ로 rail을 다시 놓고(`slotParts`), 그 위에 rail Δ를 얹는다.
  const [slotDeltaByPart, setSlotDeltaByPart] = useState<(SlotFacesDelta | undefined)[]>([])
  const [railDeltaByPart, setRailDeltaByPart] = useState<RailDeltaByPart>([])
  const slotParts = useMemo(() => fitView ? fitView.parts.map((part, index) => { const moved = withSlotFaces(part, slotDeltaByPart[index]); return moved.ok ? moved.part : part }) : [], [fitView, slotDeltaByPart])
  const railsByPart = useMemo(() => slotParts.map((part, index) => railsWithDelta(part.fit?.railsEm, railDeltaByPart[index])), [slotParts, railDeltaByPart])
  const [selectedRail, setSelectedRail] = useState<string | undefined>()
  const [error, setError] = useState('')
  // 손으로 끌다 걸린 자리. 자·방향키 이동엔 없다.
  const [snapHit, setSnapHit] = useState<SnapHit | null>(null)
  const rendered = useMemo(() => slotParts.map((part, index) => renderMedialPart(part, railsByPart[index], inkStyle)), [slotParts, railsByPart, inkStyle])
  // 홀자 마스터 rail(`<n>:<role>`), 홀자 상자 변(`s<n>:<side>`), 닿자 박스 변(`c<n>:<side>`)을 한 목록으로. 선택·자·드래그가 같은 경로를 탄다.
  const editable = useMemo(() => [
    // 중심 rail만. 시작·끝 rail(획 길이)은 앱 획에 안 닿고 저장도 안 돼서 레이아웃엔 안 내놓는다 — 획 길이는 `획 고치기`에서.
    ...editableRailsOf(slotParts, railsByPart).filter((item) => item.kind === 'center'),
    ...editableSlotRailsOf(slotParts, rendered.map((part) => part.slot), slotDeltaByPart),
    ...editableComponentRailsOf(componentParts, facesByPart),
  ], [slotParts, railsByPart, rendered, slotDeltaByPart, componentParts, facesByPart])
  const overlays = rendered.flatMap((part) => part.path ? [part.path] : [])
  // 앱 획이 slot에 안 맞는 홀자 part. 상자는 그대로 그리고 이유만 알린다.
  const inkIssue = rendered.find((part) => part.slot && !part.path)?.message
  // rail → 부품. 캔버스 색·탭 필터가 이걸로 가른다.
  // 옮겨도 글자에 안 닿는 배치 rail은 잠근다. 세션 편집과 무관하게 저장된 상자 기준으로 한 번만 본다.
  const lockedRails = useMemo(() => bundle && fitView ? unreachedRailIds({ identity: glyph.identity, model: bundle, delta: savedDelta, editable: editableRailsOf(fitView.parts, []), medialParts: fitView.parts }) : new Set<string>(), [bundle, fitView, glyph, savedDelta])
  const canvasRails = useMemo<CanvasRail[]>(() => editable.map((item) => ({ ...item, locked: lockedRails.has(item.id), part: item.id.startsWith('c') ? componentParts[item.partIndex]?.part ?? 'CH' : fitView?.parts[item.partIndex]?.part ?? 'JU' })), [editable, fitView, componentParts, lockedRails])
  // 상자 라벨이 부품 탭 노릇을 한다. 자모까지 붙여 어느 부품인지 캔버스만 보고 안다.
  const boxes = useMemo<FitBox[]>(() => [
    ...rendered.flatMap((part, index) => part.slot && fitView ? [{ id: `m${index}`, kind: 'medial' as const, part: fitView.parts[index].part, label: `${fitView.parts[index].role === 'JU_H' ? '홀자 가로부' : fitView.parts[index].role === 'JU_V' ? '홀자 세로부' : '홀자'} ${glyph.identity.medialJamo}`, box: part.slot }] : []),
    ...componentRendered.flatMap((part, index) => part.faces ? [{ id: `c${index}`, kind: 'component' as const, part: componentParts[index].part, label: `${componentParts[index].part === 'CH' ? '첫닿자' : '받침'} ${componentParts[index].jamoId}`, box: { x: part.faces.left, y: part.faces.top, width: part.faces.right - part.faces.left, height: part.faces.bottom - part.faces.top } }] : []),
  ], [rendered, fitView, componentRendered, componentParts, glyph])
  const [ghostVisible, setGhostVisible] = useState(readGhostVisible)
  const toggleGhost = () => setGhostVisible((current) => { writeGhostVisible(!current); return !current })
  // 켤 수 있는 부품. rail이 전부 보이면 잡기 어려워 한 부품씩 켠다. 캔버스의 부품 상자를 눌러 고르고, 기본은 첫닿자.
  const parts = useMemo<Part[]>(() => [
    ...(componentParts.some((part) => part.part === 'CH' && part.faces) ? ['CH' as Part] : []),
    ...(fitView?.parts.some((part) => part.fit) ? ['JU' as Part] : []),
    ...(componentParts.some((part) => part.part === 'JO' && part.faces) ? ['JO' as Part] : []),
  ], [componentParts, fitView])
  const [activePartState, setActivePartState] = useState<Part>(initialPart ?? 'CH')
  const activePart = parts.some((part) => samePartGroup(part, activePartState)) ? activePartState : parts[0]
  const activeRails = useMemo(() => activePart ? canvasRails.filter((item) => samePartGroup(item.part, activePart)) : canvasRails, [canvasRails, activePart])
  const rail = activeRails.find((item) => item.id === selectedRail && !item.locked) ?? activeRails.find((item) => !item.locked)
  const selectPart = (part: Part) => { setActivePartState(part); setSelectedRail(undefined); setError(''); setSnapHit(null) }
  // 고정한 변 rail. `이 자리에 맞추기`를 누르면 들어가고, 그 rail을 다시 옮기거나 복원하면 빠진다. 세션 상태.
  const [fixedRails, setFixedRails] = useState<Set<string>>(() => new Set())
  const isEdited = (item: EditableRail) => Math.abs(item.value - item.original) > 1e-9 || fixedRails.has(item.id)
  const editCount = editable.filter(isEdited).length
  // 다른 글자 카드에 얹을 Δ. 편집 상태에서 모델 값 대비 차이만 뽑는다(고정은 Δ 0이어도 든다).
  const propagationEdit = useMemo(() => propagationEditOf({ editable, medialParts: slotParts, componentParts, fixed: fixedRails }), [editable, slotParts, componentParts, fixedRails])
  const changedRails = useMemo(() => editable.filter((item) => Math.abs(item.value - item.original) > 1e-9 || fixedRails.has(item.id)), [editable, fixedRails])
  // 맞추기는 상자 변(닿자 `c*`, 홀자 `s*`)만. 중심 rail은 더하기뿐.
  const fixable = !!rail && rail.kind === 'face' && !fixedRails.has(rail.id)
  const fixRail = () => { if (rail && rail.kind === 'face') setFixedRails((current) => new Set(current).add(rail.id)) }
  const unfixRail = (id: string) => setFixedRails((current) => { if (!current.has(id)) return current; const next = new Set(current); next.delete(id); return next })
  const canApply = hasLayoutEdit(propagationEdit)
  // 하단 바는 끄는 동안 얼린다. 잡을 때의 상태로 서 있다가 손을 떼면 바뀐다 — 끄는 중에 버튼이 바뀌며 번쩍이지 않게. 방향키 이동은 끌기가 아니라 바로 바뀐다.
  const [heldBar, setHeldBar] = useState<{ editCount: number; canApply: boolean } | null>(null)
  const bar = heldBar ?? { editCount, canApply }
  const cardsRef = useRef<ReviewPropagationHandle>(null)
  const [scopeLabel, setScopeLabel] = useState('이 레이아웃')
  // 범위는 옵션 스택이 고른다. 상단 `닿는 글자` 줄과 캔버스 옆 여섯 칸 표지가 알아야 해서 여기로 올려 둔다.
  const [selection, setSelection] = useState<ScopeSelection>({ scope: 'layer', group: 'JU', jamos: [] })
  // `신규 옵션에 저장`이 미리 골라 둘 범위. 버튼 아랫줄에 적어 누르기 전에 어디에 몇 자인지 보인다.
  const seedRule = useMemo(() => seedRuleOf(glyph.identity, rail?.part).rule, [glyph.identity, rail?.part])

  // 값 하나를 놓아 본다. 순서·간격 위반이면 false, 호출자는 마지막 유효값을 지킨다.
  const tryPlace = (target: EditableRail, value: number): true | string => {
    const rounded = target.original + Math.round((value - target.original) * 1000) / 1000
    if (target.id.startsWith('c')) {
      const part = componentParts[target.partIndex]
      if (!part?.faces) return '박스가 없습니다.'
      const proposed = { ...(facesByPart[target.partIndex] ?? part.faces), [target.role]: rounded } as ComponentFaces
      const check = renderComponentPart(part, proposed)
      if (!check.path) return check.message ?? '박스 변을 그 자리에 둘 수 없습니다.'
      setFacesByPart((current) => { const copy = [...current]; copy[target.partIndex] = proposed; return copy })
      return true
    }
    if (target.id.startsWith('s')) {
      const base = fitView?.parts[target.partIndex]
      if (!base?.fit) return '획 마스터가 없습니다.'
      const proposed: SlotFacesDelta = { ...slotDeltaByPart[target.partIndex], [target.role]: rounded - target.original }
      const moved = withSlotFaces(base, proposed)
      if (!moved.ok) return moved.message
      const check = renderMedialPart(moved.part, railsWithDelta(moved.part.fit?.railsEm, railDeltaByPart[target.partIndex]))
      // 유효성은 rail 자리(slot)로 본다. 앱 획이 그 칸에 안 맞는 건 배치를 막을 이유가 아니다.
      if (!check.slot) return check.message ?? '홀자 상자를 그 자리에 둘 수 없습니다.'
      setSlotDeltaByPart((current) => { const copy = [...current]; copy[target.partIndex] = proposed; return copy })
      return true
    }
    const part = slotParts[target.partIndex]
    if (!part?.fit) return '획 마스터가 없습니다.'
    const proposed: Record<string, number> = { ...railDeltaByPart[target.partIndex], [target.role]: rounded - part.fit.railsEm[target.role] }
    const check = renderMedialPart(part, railsWithDelta(part.fit.railsEm, proposed))
    if (!check.slot) return check.message ?? '기준선을 그 자리에 둘 수 없습니다.'
    setRailDeltaByPart((current) => { const copy = [...current]; copy[target.partIndex] = proposed; return copy })
    return true
  }
  // 스냅 후보 = 같은 축의 Noto 실측선 + 다른 부품의 rail. 같은 부품 rail은 겹치면 순서 위반이라 뺀다.
  const snapCandidatesFor = (target: EditableRail) => [
    ...measured.map((rail) => ({ id: rail.id, label: rail.label, axis: rail.axis, value: rail.value })),
    ...editable.filter((rail) => rail.id !== target.id && !(rail.partIndex === target.partIndex && rail.id.startsWith('c') === target.id.startsWith('c'))).map((rail) => ({ id: rail.id, label: rail.label, axis: rail.axis, value: rail.value })),
  ]
  // 적용 직후 문장 줄 표시. 다음 편집이 시작되면 지운다.
  const applyMarked = useRef(false)
  const markApplied = (rules: readonly ScopeRule[]) => { applyMarked.current = rules.length > 0; onScopeApplied?.(rules) }
  const clearApplied = () => { if (!applyMarked.current) return; applyMarked.current = false; onScopeApplied?.([]) }
  // 캔버스 드래그·자·키보드가 모두 여기로 온다. 1u 격자는 모델 값에 맞추고, 손 조작(snap)엔 모델 → 다른 기준선 → 격자 순으로 걸린다.
  const changeRail = (id: string, requested: number, options?: { snap?: boolean }) => {
    const target = editable.find((item) => item.id === id)
    if (!target || lockedRails.has(target.id)) return
    // 보선은 글자 칸(0–1em) 안에서만 움직인다. 끌다가 캔버스 밖으로 빠져나가 못 잡는 일이 없게. 처음부터 칸 밖이던 보선은 그 자리까지 허용한다.
    const next = Math.min(Math.max(requested, Math.min(0, target.original)), Math.max(1, target.original))
    clearApplied()
    // 고정한 변을 다시 옮기면 더하기로 돌아간다.
    unfixRail(id)
    if (options?.snap) {
      const snapped = snapRail({ value: next, original: target.original, axis: target.axis, candidates: snapCandidatesFor(target) })
      if (snapped.hit && tryPlace(target, snapped.value) === true) {
        setError('')
        if (snapped.hit.kind !== snapHit?.kind || snapped.hit.id !== snapHit?.id || snapped.hit.value !== snapHit?.value) navigator.vibrate?.(8)
        setSnapHit(snapped.hit)
        return
      }
      // 걸린 자리에 못 놓으면 스냅을 풀고 원래 값으로.
    }
    setSnapHit(null)
    const placed = tryPlace(target, next)
    setError(placed === true ? '' : placed)
  }
  const resetRails = () => { setSlotDeltaByPart([]); setRailDeltaByPart([]); setFacesByPart([]); setFixedRails(new Set()); setError(''); setSnapHit(null) }
  // 보선 이동은 저장 버튼을 눌러야 남는다. 저장 안 한 채 떠나려 하면(다른 글자 · 되돌리기) 먼저 묻는다. 획 편집은 저장해야 갈 수 있어서 묻지 않는다.
  const [leaving, setLeaving] = useState<{ next: () => void; saveable: boolean } | null>(null)
  const guardLeave: LayoutLeaveGuard = (next, options) => { if (editCount > 0) setLeaving({ next, saveable: options?.saveable ?? true }); else next() }
  useEffect(() => {
    if (!leaveGuardRef) return
    leaveGuardRef.current = guardLeave
  })
  useEffect(() => () => { if (leaveGuardRef) leaveGuardRef.current = null }, [leaveGuardRef])
  // 새로고침 · 탭 이동(다른 주소)은 브라우저 확인 창으로 막는다.
  useEffect(() => {
    if (editCount === 0) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [editCount])
  const leave = (save: boolean) => {
    const next = leaving?.next
    setLeaving(null)
    if (save) cardsRef.current?.apply()
    else resetRails()
    next?.()
  }

  return <div className={styles.editor} data-testid="glyph-layout-editor">
      {/* 상단 두 줄의 아랫줄. 윗줄은 `내 문장`이라 이 편집부 바로 위에 있다. 글자 크기·칸 높이가 같고 줄 높이는 고정이다. */}
      <TouchedGlyphRow source={glyph.identity} bundle={bundle} edit={propagationEdit} ghostVisible={ghostVisible} focus={rail?.part} scope={selection.scope} group={selection.group} jamos={selection.jamos} rule={selection.rule} onPick={onPickCharacter && ((character) => guardLeave(() => onPickCharacter(character)))} />
      <section className={styles.canvasSection}>
        {/* 캔버스 왼쪽 세로 표지. 여섯 칸 중 지금 고치는 칸을 켜기만 한다 — 범위는 아래 옵션 스택에서 고른다. */}
        <LayoutContextCards activeContextId={glyph.identity.contextId} allActive={selection.scope === 'all'} />
        <div className={styles.canvasArea}>
        {'path' in ghost ? <GhostCanvas ghost={ghost.path} ghostVisible={ghostVisible} measured={measured} editable={canvasRails} activePart={activePart} selectedRail={rail && rail.id === selectedRail ? rail.id : undefined} snappedRail={snapHit?.id} snapHit={snapHit} onSelectRail={(id) => { if (id !== rail?.id) setSnapHit(null); setSelectedRail(id); setError('') }} onReleaseRail={() => { setSelectedRail(undefined); setSnapHit(null) }} onSelectPart={selectPart} onEditPart={onEditStrokes ? (part) => { if (editCount === 0) onEditStrokes(part) } : undefined} editLocked={editCount > 0} onDragRail={(id, value) => changeRail(id, value, { snap: true })} onDragState={(dragging) => setHeldBar(dragging ? { editCount, canApply } : null)} onNudgeRail={(id, delta) => { const target = editable.find((item) => item.id === id); if (target) changeRail(id, target.value + delta) }} label={`${glyph.identity.character} Noto 고스트`} overlays={overlays} componentOverlays={componentOverlays} boxes={boxes} /> : <p className={styles.warning} role="alert">{ghost.error}</p>}
        <DevGhostToggle pressed={ghostVisible} onToggle={toggleGhost} testId="review-ghost-toggle" />
        {/* 변 rail을 잡으면 `이 자리에 맞추기`. 누르면 범위 안 글자가 전부 이 자리(em)에 모인다. 탁 걸린 자리면 주황 테두리. 고정 뒤엔 `= 자리` 표지. */}
        {FIX_RAIL_ENABLED && rail && rail.kind === 'face' && (fixable
          ? <button type="button" className={styles.canvasFix} data-snapped={!!snapHit || undefined} onClick={fixRail} data-testid="review-fix-rail">이 자리에 맞추기</button>
          : <span className={styles.canvasFixed} data-testid="review-fixed-rail">{rail.label} = {Math.round(rail.value * 1000)} · 고정</span>)}
        {/* 자 도구는 없다. 캔버스 안에서 끌기·방향키(1u · Shift 10u)로 옮기고, 경고는 캔버스 위에 겹쳐 높이가 안 흔들린다. 복원은 하단 바. */}
        {(error || inkIssue) && <p className={styles.canvasWarning} role="alert" data-testid="review-canvas-warning">{error || `홀자 획이 상자에 안 맞습니다 · ${inkIssue}`}</p>}
        </div>
      </section>
      {modelError && <p className={styles.status} data-state="error" role="alert">{modelError}</p>}
      {/* 적용하면 Δ가 저장되고 context가 새 original로 다시 풀리므로 세션 편집은 비운다. */}
      <ReviewPropagationCards ref={cardsRef} source={glyph.identity} edit={propagationEdit} changed={changedRails} fixed={fixedRails} focus={rail?.part} railRole={rail?.role} onApplied={resetRails} onCommitted={onCommitted} onSelectPart={selectPart} onScopeLabel={setScopeLabel} onScopeChange={setSelection} onScopeApplied={markApplied} />
      {/* 하단 바는 보선을 옮겼을 때만 선다. 획 편집으로 가는 길은 캔버스(켜진 상자를 한 번 더 누르기 · 모서리 칩)다. Δ 있음 → `복원(아이콘) | 선택 옵션에 저장 | 신규 옵션에 저장`. 저장할 자리는 둘 — 라디오로 켠 옵션, 또는 범위를 새로 골라 만드는 새 옵션. 어느 옵션인지는 스택의 라디오가 말하므로 버튼에 이름을 안 적는다. 편집기가 내놓는 rail은 전부 배치라 Δ가 있으면 늘 적용할 수 있다. 끄는 동안에는 잡을 때 상태로 얼어 있다(`heldBar`). */}
      {bar.editCount > 0 ? <div className={styles.strokeCta} data-testid="jamo-stroke-cta-bar" data-held={heldBar ? true : undefined}>
        <div className={styles.ctaRow}>
          {/* 복원은 정사각 아이콘 버튼. 바뀐 보선 수는 모서리 숫자로, 말은 읽어 주는 글에만 싣는다. */}
          {bar.editCount > 0 && <button type="button" className={styles.resetCta} onClick={resetRails} data-testid="review-reset" title={`복원 · ${bar.editCount}개 변경`}>
            <svg viewBox="0 0 20 20" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4.2 8.2A6.3 6.3 0 1 1 3.8 11" /><path d="M3.6 4.2v4.2h4.2" /></svg>
            <em aria-hidden="true">{bar.editCount}</em>
            <span className={styles.srOnly}>복원 · {bar.editCount}개 변경</span>
          </button>}
          {bar.canApply
            ? <button type="button" className={styles.applyCta} onClick={() => cardsRef.current?.apply()} data-testid="review-propagation-apply" aria-label={`선택 옵션(${scopeLabel})에 저장`}>
              <span>선택 옵션에 저장</span><small data-testid="review-propagation-apply-scope">{scopeLabel} · {ruleGlyphCount(selection.rule ?? ruleOfContext(glyph.identity.contextId)).toLocaleString()}자</small>
            </button>
            : null}
          {/* 주 버튼은 신규다 — 보선을 끌 때의 뜻은 대개 `이 자모가 이상하다`고, 넓은 범위에 잘못 저장하는 쪽이 더 비싸다. 두 버튼 다 저장될 범위와 글자 수를 아랫줄에 적는다. */}
          {bar.canApply && <button type="button" className={styles.newCta} onClick={() => cardsRef.current?.applyAsNew()} data-testid="review-propagation-apply-new">
            <span>신규 옵션에 저장</span><small data-testid="review-propagation-apply-new-scope">{stackLabel(seedRule, glyph.identity.contextId)} · {ruleGlyphCount(seedRule).toLocaleString()}자</small>
          </button>}
        </div>
      </div> : null}
      {/* 취소 버튼은 따로 없다. 바깥을 누르면 닫히고 편집은 그대로 남는다. */}
      {leaving && <div className={styles.leaveBackdrop} onClick={() => setLeaving(null)} data-testid="layout-leave-backdrop">
        <div className={styles.leaveSheet} role="alertdialog" aria-modal="true" aria-label="저장 안 한 레이아웃" onClick={(event) => event.stopPropagation()} data-testid="layout-leave-dialog">
          <header>
            <b>옮긴 보선이 아직 저장되지 않았어요</b>
            <small>보선 {editCount}개 · 저장하지 않고 나가면 사라져요.</small>
          </header>
          <div className={styles.leaveActions}>
            {canApply && leaving.saveable && <button type="button" className={styles.leaveSave} onClick={() => leave(true)} data-testid="layout-leave-save">선택 옵션({scopeLabel})에 저장하고 계속</button>}
            <button type="button" onClick={() => leave(false)} data-testid="layout-leave-discard">저장하지 않고 계속</button>
          </div>
        </div>
      </div>}
  </div>
}

export interface GlyphLayoutEditorProps {
  /** 완성형 한글 codepoint. */
  codepoint: number
  /** 처음 켤 부품 탭. 없으면 첫닿자. */
  initialPart?: Part
  /** 배치 Δ를 적용하거나 지운 직후. 앞뒤 스냅샷으로 호출자가 Undo 기록을 남긴다. */
  onCommitted?: (before: LayoutDeltaSnapshot, after: LayoutDeltaSnapshot) => void
  /** 켠 부품의 획 편집으로 내려간다. 주면 켜진 상자를 한 번 더 누르면 간다(누르거나 올리면 상자가 진해진다). 버튼은 없다. 옮긴 보선을 저장해야 열린다. */
  onEditStrokes?: (part: Part) => void
  /** 예시 글자를 누르면 그 글자를 연다. */
  onPickCharacter?: (character: string) => void
  /** 방금 적용한 범위. 문장 줄이 그 범위에 든 글자를 잠깐 표시한다. 다음 편집이 시작되면 빈 목록으로 다시 부른다. */
  onScopeApplied?: (rules: readonly ScopeRule[]) => void
  /** 편집기가 여기에 `떠나기 전 묻기`를 걸어 둔다. 호출자는 글자를 바꾸거나 되돌리기 전에 이걸 거친다. */
  leaveGuardRef?: RefObject<LayoutLeaveGuard | null>
}

/** 저장 안 한 보선 이동이 있으면 묻고, 없으면 바로 `next`를 부른다. 되돌리기처럼 저장하면 곧바로 그 저장이 되돌려지는 길은 `saveable: false`. */
export type LayoutLeaveGuard = (next: () => void, options?: { saveable?: boolean }) => void

export function GlyphLayoutEditor({ codepoint, initialPart, onCommitted, onEditStrokes, onPickCharacter, onScopeApplied, leaveGuardRef }: GlyphLayoutEditorProps) {
  const { glyph, error } = useNotoGlyph(codepoint)
  if (glyph) return <GlyphLayoutBody key={codepoint} glyph={glyph} initialPart={initialPart} onCommitted={onCommitted} onEditStrokes={onEditStrokes} onPickCharacter={onPickCharacter} onScopeApplied={onScopeApplied} leaveGuardRef={leaveGuardRef} />
  return <p className={styles.status} data-state={error ? 'error' : 'loading'} role={error ? 'alert' : 'status'}>{error || 'Noto 윤곽 읽는 중'}</p>
}
