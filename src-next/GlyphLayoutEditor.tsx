import { useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { notoOutlineGhostPath } from '../src/services/notoOutlineInk'
import { DevGhostToggle } from './DevGhostToggle'
import { approvedInputFor, isApproved } from './notoApprovedIndex'
import { editableComponentRailsOf, fitComponentsForGlyph, renderComponentPart } from './notoComponentFitView'
import type { ComponentFaces } from '../src/services/notoComponentFit'
import type { SlotFacesDelta } from '../src/services/notoMedialMasterFit'
import { resolveContextBoxes } from '../src/services/contextBoxResolver'
import type { BoxConfig, Part } from '../src/types'
import { editableRailsOf, editableSlotRailsOf, fitMedialForGlyph, renderMedialPart, withSlotFaces } from './notoMedialFitView'
import type { EditableRail } from './notoMedialFitView'
import { useNotoModel } from './notoModel'
import type { NotoPresetGlyph } from './notoPresetGlyphs'
import { ReviewPropagationCards } from './ReviewPropagationCards'
import type { ReviewPropagationHandle } from './ReviewPropagationCards'
import { useNotoGlyph } from './useNotoGlyph'
import { useLayoutDelta } from './layoutDeltaStore'
import type { LayoutDeltaSnapshot } from './layoutDeltaStore'
import { hasLayoutEdit, propagationEditOf, unreachedRailIds } from './reviewPropagation'
import { snapRail } from './railSnap'
import type { SnapHit } from './railSnap'
import { useFitInkStyle } from './useFitInkStyle'
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
const BASELINE_RAILS: Record<string, { axis: 'x' | 'y'; label: string }> = {
  'initial.roleFaces.left': { axis: 'x', label: 'CH 왼선' }, 'initial.roleFaces.right': { axis: 'x', label: 'CH 오른선' },
  'initial.roleFaces.top': { axis: 'y', label: 'CH 윗선' }, 'initial.roleFaces.bottom': { axis: 'y', label: 'CH 밑선' },
  'final.roleFaces.right': { axis: 'x', label: 'JO 오른선' }, 'final.roleFaces.top': { axis: 'y', label: 'JO 윗선' },
  'medial.primaryBeam.face': { axis: 'y', label: 'JU 가로보' }, 'medial.upperBeam.face': { axis: 'y', label: 'JU 위보' }, 'medial.lowerBeam.face': { axis: 'y', label: 'JU 아래보' },
  'medial.baseStem.face': { axis: 'x', label: 'JU 줄기' }, 'medial.leftStem.face': { axis: 'x', label: 'JU 왼줄기' }, 'medial.rightStem.face': { axis: 'x', label: 'JU 오른줄기' },
}

interface Rail { id: string; axis: 'x' | 'y'; label: string; value: number }

/** 승인 측정 = 사용자가 확인한 기준선 입력. 획 마스터 fit의 출발점이 될 글자다. */
export function TierBadge({ approved, className }: { approved: boolean; className?: string }) {
  return <span className={`${styles.badge} ${className ?? ''}`} data-tier={approved ? 'approved' : 'measured'} data-testid="review-tier">{approved ? '승인 측정' : '실측만'}</span>
}

function baselineRails(glyph: NotoPresetGlyph): Rail[] {
  return Object.entries(glyph.baselines).flatMap(([id, value]) => {
    const spec = BASELINE_RAILS[id]
    return spec && Number.isFinite(value) ? [{ id, axis: spec.axis, label: spec.label, value }] : []
  })
}

const VIEW_BOX_SIZE = 1.16
const GHOST_STORAGE_KEY = 'review-ghost-visible-v1'

function readGhostVisible(): boolean {
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
/** Noto 실측선 id 앞머리 → 부품. 혼합 홀자의 가로부·세로부는 둘 다 홀자 탭에 속한다. */
const measuredPartOf = (id: string): 'CH' | 'JU' | 'JO' => id.startsWith('initial.') ? 'CH' : id.startsWith('final.') ? 'JO' : 'JU'
const isMedialPart = (part: Part) => part === 'JU' || part === 'JU_H' || part === 'JU_V'
const samePartGroup = (a: Part, b: Part) => a === b || (isMedialPart(a) && isMedialPart(b))

/** `locked` = 옮겨도 글자에 안 닿는 rail. 보이기만 하고 손잡이가 없다. */
type CanvasRail = EditableRail & { part: Part; locked?: boolean }

// 방향키 → 축 방향 부호. 가로 위치(x)는 좌우, 세로 위치(y)는 상하(아래가 +).
const nudgeOf = (key: string, axis: 'x' | 'y'): number => axis === 'x' ? (key === 'ArrowRight' ? 1 : key === 'ArrowLeft' ? -1 : 0) : (key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0)

function GhostCanvas({ ghost, ghostVisible = true, measured, editable = [], activePart, selectedRail, snappedRail, snapHit, showDelta = true, onSelectRail, onDragRail, onNudgeRail, onSelectPart, label, overlays = [], componentOverlays = [], boxes = [] }: {
  ghost: string
  /** Noto 고스트를 끄면 내 획만 남아 어느 획을 바꿀지 보인다. */
  ghostVisible?: boolean
  /** Noto 실측 기준선. 참고용이라 옅은 점선, 조작 없음. */
  measured: Rail[]
  /** 획 마스터 rail. 활성 부품 것만 잡고 끌 수 있다. */
  editable?: CanvasRail[]
  /** 활성 부품. 이 부품의 rail·상자만 제 색, 나머지는 회색으로 죽인다. 없으면 전부 활성. */
  activePart?: Part
  selectedRail?: string
  /** 드래그 중 붙은 다른 기준선 id. 그 선을 주황으로 켠다. */
  snappedRail?: string
  /** 끌다 걸린 자리. 캔버스 위쪽에 '탁 · 모델' 같은 표지로. */
  snapHit?: SnapHit | null
  /** 기준값(지금은 모델, 저장이 생기면 마지막 저장값)에서 얼마나 옮겼는지 띠로 칠할지. */
  showDelta?: boolean
  /** 방향키 이동(em Δ). 손잡이에 초점을 두고 방향키 1u · Shift 10u. */
  onNudgeRail?: (id: string, delta: number) => void
  onSelectRail?: (id: string) => void
  /** 캔버스에서 rail을 직접 끈다. 값은 em 제안값, 호출자가 순서·간격을 판정한다. */
  onDragRail?: (id: string, value: number) => void
  /** 부품 상자를 누르면 그 부품이 켜진다. 탭 대신 캔버스가 부품을 고른다. */
  onSelectPart?: (part: Part) => void
  label: string
  /** 내 홀자 획 마스터 잉크. 검정. */
  overlays?: string[]
  /** 닿자 박스 fit 잉크(앱 획). 검정. */
  componentOverlays?: string[]
  /** 획 뒤에 칠하는 부품 상자. */
  boxes?: FitBox[]
}) {
  const gesture = useRef<{ pointerId: number; id: string; axis: 'x' | 'y'; start: number; startValue: number } | null>(null)
  const startDrag = (rail: CanvasRail) => (event: ReactPointerEvent<SVGLineElement>) => {
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
  // 라벨은 글자 칸 밖 여백 띠에. x rail은 위(편집)·아래(실측) 띠 가운데, y rail은 오른 띠 끝 정렬. 호버 때만 보인다.
  const labelAt = (axis: 'x' | 'y', value: number, band: 'top' | 'bottom') => axis === 'x'
    ? { x: Math.min(0.92, Math.max(0.08, value)), y: band === 'top' ? -0.03 : 1.062, textAnchor: 'middle' as const }
    : { x: 1.07, y: value - 0.012, textAnchor: 'end' as const }
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
    {/* 부품 상자. 획보다 아래, 고스트보다 아래. rail과 같은 부품 색, 비활성 부품은 옅게. */}
    {boxes.map((item) => {
      const active = !activePart || samePartGroup(item.part, activePart)
      const color = PART_COLOR[item.part]
      return <g key={item.id} data-testid="review-fit-box" data-kind={item.kind} data-active={active}>
        <rect x={item.box.x} y={item.box.y} width={item.box.width} height={item.box.height} fill={color} fillOpacity={active ? 0.24 : 0.07} stroke={color} strokeOpacity={active ? 0.85 : 0.25} strokeWidth={active ? 0.004 : 0.003} />
        <text x={item.box.x + 0.008} y={item.box.y - 0.008} fontSize=".024" fill={color} fillOpacity={active ? 0.9 : 0.35}>{item.label}</text>
      </g>
    })}
    {/* Noto 고스트. 잉크가 아니라 비교용이라 반투명으로 깐다. 검정 획 아래에 두어 벗어난 곳만 회색으로 보인다. */}
    {ghostVisible && <path d={ghost} fill="#3a3a36" fillOpacity=".55" fillRule="evenodd" data-testid="review-ghost" />}
    {overlays.map((path, index) => <path key={index} d={path} fill="#1a1a1a" fillRule="evenodd" data-testid="review-fit-ink" />)}
    {componentOverlays.map((path, index) => <path key={`c${index}`} d={path} fill="#1a1a1a" fillRule="evenodd" data-testid="review-component-ink" />)}
    {/* Δ 띠. 지금 선택한 rail 하나만: 기준값 자리와 지금 자리 사이를 주황 단색으로 칠한다. 잉크 위에 얹어 옮긴 구간이 바로 보인다. */}
    {showDelta && editable.filter((rail) => rail.id === selectedRail && Math.abs(rail.value - rail.original) > 1e-9).map((rail) => {
      const [from, to] = rail.value > rail.original ? [rail.original, rail.value] : [rail.value, rail.original]
      const band = rail.axis === 'x' ? { x: from, y: -0.06, width: to - from, height: 1.08 } : { x: -0.06, y: from, width: 1.08, height: to - from }
      return <rect key={`d${rail.id}`} {...band} fill={ACCENT} fillOpacity=".38" data-testid="review-delta-band" data-rail={rail.id} />
    })}
    {/* Noto 실측선. 활성 부품 것은 부품 색 점선, 나머지는 옅은 회색. 조작 없음. */}
    {measured.map((rail) => {
      const snapped = rail.id === snappedRail
      const active = !activePart || samePartGroup(measuredPartOf(rail.id), activePart)
      const color = snapped ? ACCENT : active ? PART_COLOR[measuredPartOf(rail.id)] : INACTIVE_COLOR
      const geometry = geometryOf(rail.axis, rail.value)
      return <g key={rail.id} className={styles.rail} data-rail={rail.id} data-snapped={snapped || undefined} data-active={active}>
        <line {...geometry} className={styles.railLine} stroke={color} strokeOpacity={active || snapped ? 0.7 : 0.6} strokeWidth={snapped ? 0.006 : 0.003} strokeDasharray=".012 .008" />
        {/* 호버용 히트 영역. 조작은 없고 라벨만 띄운다. */}
        <line {...geometry} className={styles.railHit} stroke="transparent" strokeWidth=".03" />
        <text {...labelAt(rail.axis, rail.value, 'bottom')} className={styles.railLabel} fontSize=".026" fill={color}>{rail.label}</text>
      </g>
    })}
    {/* 부품 고르기. 실측선 위·편집 rail 아래에 투명 히트 상자를 깔아 상자 안 아무 데나 누르면 그 부품이 켜진다. rail 손잡이가 뒤에 그려져 rail이 먼저 잡힌다.
        활성 상자는 이벤트를 통과시켜 그 안의 실측선 호버와 잉크가 그대로 살고, 겹친 자리에서 비활성 상자를 눌러 넘어갈 수 있다. */}
    {onSelectPart && boxes.map((item) => {
      const active = !activePart || samePartGroup(item.part, activePart)
      {/* pointer-events는 `auto`(투명 fill도 칠한 것으로 잡힘). `all`은 Chromium에서 rect 기하 밖까지 잡아 다른 상자를 가린다. */}
      return <rect key={`h${item.id}`} x={item.box.x} y={item.box.y} width={item.box.width} height={item.box.height} fill="transparent" pointerEvents={active ? 'none' : 'auto'} style={{ '--part': PART_COLOR[item.part] } as React.CSSProperties} className={styles.boxHit} data-testid="review-part-hit" data-part={item.part} data-active={active} role="button" tabIndex={0} aria-label={`${item.label} 선택`} aria-pressed={active}
        onPointerDown={() => { if (!active) onSelectPart(item.part) }}
        onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); if (!active) onSelectPart(item.part) } }} />
    })}
    {/* 비활성 부품 rail은 먼저 그려 뒤로 보내고 손잡이도 없다. 활성 rail만 잡힌다. */}
    {[...editable].sort((a, b) => Number(!activePart || samePartGroup(a.part, activePart)) - Number(!activePart || samePartGroup(b.part, activePart))).map((rail) => {
      const selected = rail.id === selectedRail
      const snapped = rail.id === snappedRail
      const active = !activePart || samePartGroup(rail.part, activePart)
      const stroke = selected || snapped ? ACCENT : active ? PART_COLOR[rail.part] : INACTIVE_COLOR
      const geometry = geometryOf(rail.axis, rail.value)
      return <g key={rail.id} className={active ? styles.rail : undefined} data-rail={rail.id} data-part={rail.part} data-active={active} data-locked={rail.locked || undefined} data-selected={selected || undefined} data-snapped={snapped || undefined}>
        {/* 후광. 선택·스냅이면 항상, 활성 rail은 호버 때만(CSS). */}
        {active && <line {...geometry} className={styles.railHalo} stroke={stroke} strokeWidth=".032" strokeOpacity={selected || snapped ? 0.2 : 0} strokeLinecap="round" />}
        <line {...geometry} className={styles.railLine} stroke={stroke} strokeWidth={selected || snapped ? 0.012 : active ? 0.004 : 0.003} strokeOpacity={rail.locked ? 0.45 : active || snapped ? 1 : 0.8} strokeDasharray={rail.locked ? '.02 .012' : undefined} />
        {onSelectRail && active && !rail.locked && <line {...geometry} className={styles.railButton} data-rail-handle={rail.id} stroke="transparent" strokeWidth=".08" role="button" tabIndex={0} aria-label={`${rail.label} 선택`} aria-pressed={selected} onPointerDown={startDrag(rail)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onSelectRail(rail.id) } else if (onNudgeRail) { const nudge = nudgeOf(event.key, rail.axis); if (nudge !== 0) { event.preventDefault(); onSelectRail(rail.id); onNudgeRail(rail.id, nudge * (event.shiftKey ? 10 : 1) / 1000) } } }} />}
        {active && rail.locked && <line {...geometry} className={styles.railHit} stroke="transparent" strokeWidth=".03" />}
        {active && <text {...labelAt(rail.axis, rail.value, 'top')} className={styles.railLabel} fontSize=".03" fill={stroke}>{rail.label}{rail.locked ? ' · 글자에 안 닿음' : ''}</text>}
      </g>
    })}
    {/* 스냅 표지. 자 도구가 없으니 캔버스 안에서 알린다. */}
    {snapHit && <text x="0.5" y="-0.042" textAnchor="middle" className={styles.snapTag} fontSize=".03" fill={snapHit.kind === 'model' ? '#3b6fd6' : ACCENT} data-testid="review-snap" data-kind={snapHit.kind}>탁 · {snapHit.label}</text>}
    {/* Δ 수치. 선택한 rail은 크게, 나머지 바뀐 rail은 작고 옅게(저장 안 된 변경이 있다는 표시만). */}
    {showDelta && editable.filter((rail) => Math.abs(rail.value - rail.original) > 1e-9).map((rail) => {
      const active = rail.id === selectedRail
      const units = Math.round((rail.value - rail.original) * 1000)
      const mid = (rail.value + rail.original) / 2
      const at = rail.axis === 'x' ? { x: Math.min(0.92, Math.max(0.08, mid)), y: 1.066, textAnchor: 'middle' as const } : { x: 1.07, y: mid + 0.012, textAnchor: 'end' as const }
      return <text key={`u${rail.id}`} {...at} className={styles.deltaLabel} fontSize={active ? '.034' : '.024'} fill={active ? ACCENT : PART_COLOR[rail.part]} fillOpacity={active ? 1 : 0.55} data-testid="review-delta-label" data-active={active}>{units > 0 ? '+' : ''}{units}u</text>
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

function GlyphLayoutBody({ glyph, initialPart, onCommitted, onEditStrokes }: { glyph: NotoPresetGlyph; initialPart?: Part; onCommitted?: GlyphLayoutEditorProps['onCommitted']; onEditStrokes?: GlyphLayoutEditorProps['onEditStrokes'] }) {
  const codepoint = glyph.identity.codepoint
  const approved = isApproved(codepoint)
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
  const inkStyle = useFitInkStyle()
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
  // 켤 수 있는 부품. rail이 전부 보이면 잡기 어려워 한 부품씩 켠다. 캔버스의 부품 상자를 눌러 고르고, 기본은 홀자.
  const parts = useMemo<Part[]>(() => [
    ...(componentParts.some((part) => part.part === 'CH' && part.faces) ? ['CH' as Part] : []),
    ...(fitView?.parts.some((part) => part.fit) ? ['JU' as Part] : []),
    ...(componentParts.some((part) => part.part === 'JO' && part.faces) ? ['JO' as Part] : []),
  ], [componentParts, fitView])
  const [activePartState, setActivePartState] = useState<Part>(initialPart ?? 'JU')
  const activePart = parts.some((part) => samePartGroup(part, activePartState)) ? activePartState : parts[0]
  const activeRails = useMemo(() => activePart ? canvasRails.filter((item) => samePartGroup(item.part, activePart)) : canvasRails, [canvasRails, activePart])
  const rail = activeRails.find((item) => item.id === selectedRail && !item.locked) ?? activeRails.find((item) => !item.locked)
  const activeJamo = activePart === 'CH' ? glyph.identity.initialJamo : activePart === 'JO' ? glyph.identity.finalJamo ?? '' : glyph.identity.medialJamo
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
  const cardsRef = useRef<ReviewPropagationHandle>(null)
  const [scopeLabel, setScopeLabel] = useState('이 레이아웃')

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
  // 캔버스 드래그·자·키보드가 모두 여기로 온다. 1u 격자는 모델 값에 맞추고, 손 조작(snap)엔 모델 → 다른 기준선 → 격자 순으로 걸린다.
  const changeRail = (id: string, next: number, options?: { snap?: boolean }) => {
    const target = editable.find((item) => item.id === id)
    if (!target || lockedRails.has(target.id)) return
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

  return <div className={styles.editor} data-testid="glyph-layout-editor">
      <section className={styles.canvasSection}>
        {'path' in ghost ? <GhostCanvas ghost={ghost.path} ghostVisible={ghostVisible} measured={measured} editable={canvasRails} activePart={activePart} selectedRail={rail?.id} snappedRail={snapHit?.id} snapHit={snapHit} onSelectRail={(id) => { setSelectedRail(id); setError('') }} onSelectPart={selectPart} onDragRail={(id, value) => changeRail(id, value, { snap: true })} onNudgeRail={(id, delta) => { const target = editable.find((item) => item.id === id); if (target) changeRail(id, target.value + delta) }} label={`${glyph.identity.character} Noto 고스트`} overlays={overlays} componentOverlays={componentOverlays} boxes={boxes} /> : <p className={styles.warning} role="alert">{ghost.error}</p>}
        <DevGhostToggle pressed={ghostVisible} onToggle={toggleGhost} testId="review-ghost-toggle" />
        <TierBadge approved={approved} className={styles.canvasBadge} />
        {/* 변 rail을 잡으면 `이 자리에 맞추기`. 누르면 범위 안 글자가 전부 이 자리(em)에 모인다. 탁 걸린 자리면 표지 아래 바로. 고정 뒤엔 `= 자리` 표지. */}
        {rail && rail.kind === 'face' && (fixable
          ? <button type="button" className={styles.canvasFix} data-snapped={!!snapHit || undefined} onClick={fixRail} data-testid="review-fix-rail">이 자리에 맞추기</button>
          : <span className={styles.canvasFixed} data-testid="review-fixed-rail">{rail.label} = {Math.round(rail.value * 1000)} · 고정</span>)}
        {/* 자 도구는 없다. 캔버스 안에서 끌기·방향키(1u · Shift 10u)로 옮기고, 경고는 캔버스 위에 겹쳐 높이가 안 흔들린다. 복원은 하단 바. */}
        {(error || inkIssue) && <p className={styles.canvasWarning} role="alert" data-testid="review-canvas-warning">{error || `홀자 획이 상자에 안 맞습니다 · ${inkIssue}`}</p>}
      </section>
      {modelError && <p className={styles.status} data-state="error" role="alert">{modelError}</p>}
      {/* 적용하면 Δ가 저장되고 context가 새 original로 다시 풀리므로 세션 편집은 비운다. */}
      <ReviewPropagationCards ref={cardsRef} source={glyph.identity} bundle={bundle} edit={propagationEdit} changed={changedRails} fixed={fixedRails} focus={rail?.part} ghostVisible={ghostVisible} onApplied={resetRails} onCommitted={onCommitted} onSelectPart={selectPart} onScopeLabel={setScopeLabel} />
      {/* 하단 바는 한 줄짜리 상태 기계. Δ 없음 → `ㄱ 획 고치기`. Δ 있음 → `복원 | …에 적용`(범위는 카드가 앎). 편집기가 내놓는 rail은 전부 배치라 Δ가 있으면 늘 적용할 수 있다. */}
      {(onEditStrokes && activePart) || editCount > 0 ? <div className={styles.strokeCta} data-testid="jamo-stroke-cta-bar">
        <div className={styles.ctaRow}>
          {editCount > 0 && <button type="button" className={styles.resetCta} onClick={resetRails} data-testid="review-reset">복원 · {editCount}개 변경</button>}
          {canApply
            ? <button type="button" className={styles.applyCta} onClick={() => cardsRef.current?.apply()} data-testid="review-propagation-apply">{scopeLabel}에 적용</button>
            : <button type="button" onClick={() => activePart && onEditStrokes?.(activePart)} data-testid="jamo-stroke-cta">{activeJamo} 획 고치기</button>}
        </div>
      </div> : null}
  </div>
}

export interface GlyphLayoutEditorProps {
  /** 완성형 한글 codepoint. */
  codepoint: number
  /** 처음 켤 부품 탭. 없으면 홀자. */
  initialPart?: Part
  /** 배치 Δ를 적용하거나 지운 직후. 앞뒤 스냅샷으로 호출자가 Undo 기록을 남긴다. */
  onCommitted?: (before: LayoutDeltaSnapshot, after: LayoutDeltaSnapshot) => void
  /** 켠 부품의 획 편집으로 내려간다. 주면 하단에 `ㄱ 획 고치기`가 뜬다. */
  onEditStrokes?: (part: Part) => void
}

export function GlyphLayoutEditor({ codepoint, initialPart, onCommitted, onEditStrokes }: GlyphLayoutEditorProps) {
  const { glyph, error } = useNotoGlyph(codepoint)
  if (glyph) return <GlyphLayoutBody key={codepoint} glyph={glyph} initialPart={initialPart} onCommitted={onCommitted} onEditStrokes={onEditStrokes} />
  return <p className={styles.status} data-state={error ? 'error' : 'loading'} role={error ? 'alert' : 'status'}>{error || 'Noto 윤곽 읽는 중'}</p>
}
