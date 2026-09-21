import { useMemo } from 'react'
import { resolveContextBoxes } from '../src/services/contextBoxResolver'
import type { BoxConfig, JamoData, MedialFamily, Part, StrokeDataV2 } from '../src/types'
import { medialFamilyOf, strokesForFamily } from '../src/utils/jamoContextStrokes'
import { pointsToSvgD } from '../src/utils/pathUtils'
import { effectiveLayoutDelta, useLayoutDeltaStore } from './layoutDeltaStore'
import { corpusIdentity } from './notoCorpus'
import { useNotoModel } from './notoModel'
import { PART_COLOR } from './partColors'
import { LAYOUT_CONTEXT_IDS, LAYOUT_CONTEXT_LABEL, layoutSampleCharOf } from './reviewPropagation'
import styles from './LayoutContextCards.module.css'

/**
 * 캔버스 왼쪽 세로 표지. 글자는 안 보이고 초·중·종 상자를 부품 색으로만 칠한다.
 * 보여주기만 한다 — 적용 범위를 고르는 곳은 아래 범위 띠(`LayoutScopeStrip`) 하나뿐이다.
 * 켜지는 칸: 범위가 `전체`면 여섯 다, `이 레이아웃`·`이 자모만`이면 지금 글자의 칸 하나.
 * 상자는 칸마다 대표 글자 하나의 모델 상자에 저장된 Δ를 얹은 값이다. 그래서 레이아웃을 고쳐 적용하면 표지 비례도 따라 바뀐다.
 * 고치는 글자로 그리지 않는다 — 상자는 칸만으로 안 정해지고(모델 = 칸 대표값 + 자모 효과) 글자를 옮길 때마다 칸 모양이 흔들리면 지도 노릇을 못 한다.
 * 그래서 켠 칸도 캔버스와 같은 그림은 아니다. 지금 글자의 실제 상자는 캔버스가 보여 준다.
 *
 * 획 편집(`ink`)에서는 같은 자리에 같은 여섯 칸이 서고, 맨 위에 `기본` 칸이 하나 더 온다. 고치는 자소가 나오는 칸에는 그 자소의 획을 제 상자 안에 그린다.
 * 획은 자모의 기본 획에 저장돼 모든 칸에 닿으므로 켜지는 건 `기본`이다. 자소가 안 나오는 칸(받침 없는 칸의 받침, 다른 계열의 홀자)은 자리를 지킨 채 더 흐리다.
 */

/** 편집 캔버스와 같은 대지. 글자 칸 바깥 8% 여백까지 같아서 상자 비례가 캔버스와 어긋나지 않는다. */
const VIEW_BOX = '-0.08 -0.08 1.16 1.16'
/** 겹칠 때 큰 상자가 먼저. 혼합 홀자는 가로부·세로부가 둘 다 온다. */
const PART_ORDER: Part[] = ['CH', 'JU', 'JU_H', 'JU_V', 'JO']

export interface LayoutContextBox { part: Part; box: BoxConfig }

/** 획 편집에서 고치는 자소. `part`는 편집 단위(홀자는 혼합이어도 `JU` 하나). */
export interface LayoutContextInk { part: 'CH' | 'JU' | 'JO'; jamo: JamoData }

/** `기본` 칸에서 닿자를 놓는 상자. 대지 가운데 정사각. */
const BASE_BOX: BoxConfig = { x: 0.14, y: 0.14, width: 0.72, height: 0.72 }
const familyOfContext = (contextId: string): MedialFamily => contextId.startsWith('mixed') ? 'mixed' : contextId.startsWith('bottom') ? 'bottom' : 'right'

/** 그 칸 상자 안에 놓인 자소의 획. 자소가 그 칸에 안 나오면 빈 배열. */
function inkStrokesOf(ink: LayoutContextInk, contextId: string, parts: LayoutContextBox[]): { stroke: StrokeDataV2; box: BoxConfig }[] {
  const boxOf = (part: Part) => parts.find((item) => item.part === part)?.box
  const family = familyOfContext(contextId)
  if (ink.part !== 'JU') {
    const box = boxOf(ink.part)
    return box ? (strokesForFamily(ink.jamo, family) ?? []).map((stroke) => ({ stroke, box })) : []
  }
  if (medialFamilyOf(ink.jamo.char) !== family) return []
  const whole = boxOf('JU')
  if (whole) return (ink.jamo.strokes ?? []).map((stroke) => ({ stroke, box: whole }))
  return (['JU_H', 'JU_V'] as const).flatMap((part) => {
    const box = boxOf(part)
    const strokes = part === 'JU_H' ? ink.jamo.horizontalStrokes : ink.jamo.verticalStrokes
    return box && strokes ? strokes.map((stroke) => ({ stroke, box })) : []
  })
}

/** 놓인 획들의 꼭짓점 상자를 대지 한가운데(0.5, 0.5)로 옮기는 이동. */
function centeringTransform(strokes: { stroke: StrokeDataV2; box: BoxConfig }[]): string | undefined {
  const xs = strokes.flatMap(({ stroke, box }) => stroke.points.map((point) => box.x + point.x * box.width))
  const ys = strokes.flatMap(({ stroke, box }) => stroke.points.map((point) => box.y + point.y * box.height))
  if (!xs.length) return undefined
  return `translate(${0.5 - (Math.min(...xs) + Math.max(...xs)) / 2} ${0.5 - (Math.min(...ys) + Math.max(...ys)) / 2})`
}

function InkPaths({ strokes }: { strokes: { stroke: StrokeDataV2; box: BoxConfig }[] }) {
  return <>{strokes.map(({ stroke, box }) => <path key={stroke.id} d={pointsToSvgD(stroke.points, stroke.closed, box, 1)} className={styles.ink} strokeWidth={Math.max(stroke.thickness, 0.06)} />)}</>
}

export function LayoutContextCards({ activeContextId, allActive, ink }: {
  /** 지금 고치는 글자의 칸. */
  activeContextId: string
  /** 범위가 `전체`일 때. 여섯 칸을 다 켠다. */
  allActive: boolean
  /** 획 편집에서만. 주면 `기본` 칸이 맨 위에 서고 칸마다 이 자소의 획이 그려진다. */
  ink?: LayoutContextInk
}) {
  const { bundle } = useNotoModel()
  const all = useLayoutDeltaStore((state) => state.all)
  const layers = useLayoutDeltaStore((state) => state.layers)
  const jamo = useLayoutDeltaStore((state) => state.jamo)
  // 칸마다 대표 글자. 저장된 Δ를 얹어야 적용한 수정이 표지에도 보인다.
  const sampleParts = useMemo(() => Object.fromEntries(LAYOUT_CONTEXT_IDS.map((contextId) => {
    const identity = corpusIdentity(layoutSampleCharOf(contextId).codePointAt(0)!)
    const delta = effectiveLayoutDelta({ all, layers, jamo }, identity)
    const boxes = bundle ? resolveContextBoxes({ identity, model: bundle, delta }).boxes : {}
    return [contextId, PART_ORDER.flatMap((part): LayoutContextBox[] => {
      const box = boxes[part]
      return box ? [{ part, box }] : []
    })] as const
  })), [bundle, all, layers, jamo])
  // `기본` 칸: 닿자는 대지 가운데 정사각에, 홀자는 제 계열(받침 없는 칸) 상자에 놓는다. 칸 전체를 그 자소의 부품 색으로 다른 칸처럼 옅게 칠하고 획은 칸 한가운데로 옮긴다.
  const baseStrokes = !ink ? [] : ink.part === 'JU'
    ? inkStrokesOf(ink, medialFamilyOf(ink.jamo.char) ?? 'right', sampleParts[medialFamilyOf(ink.jamo.char) ?? 'right'])
    : (ink.jamo.strokes ?? []).map((stroke) => ({ stroke, box: BASE_BOX }))
  return <ul className={styles.strip} aria-label={ink ? `${ink.jamo.char} 기본과 레이아웃 여섯 칸` : '레이아웃 여섯 칸'} data-dense={ink ? true : undefined} data-testid="layout-context-cards">
    {ink && <li className={styles.card} data-context="base" data-active>
      <svg viewBox={VIEW_BOX} role="img" aria-label={`${ink.jamo.char} 기본 · 고치는 중`}>
        <rect x={-0.08} y={-0.08} width={1.16} height={1.16} fill={PART_COLOR[ink.part]} className={styles.baseFill} />
        <g transform={centeringTransform(baseStrokes)}><InkPaths strokes={baseStrokes} /></g>
      </svg>
    </li>}
    {LAYOUT_CONTEXT_IDS.map((contextId) => {
      const on = !ink && (allActive || contextId === activeContextId)
      const parts = sampleParts[contextId]
      const strokes = ink ? inkStrokesOf(ink, contextId, parts) : []
      return <li key={contextId} className={styles.card} data-context={contextId} data-active={on || undefined} data-absent={ink && strokes.length === 0 ? true : undefined}>
        <svg viewBox={VIEW_BOX} role="img" aria-label={`${LAYOUT_CONTEXT_LABEL[contextId]}${on ? ' · 고치는 중' : ''}`}>
          {parts.map(({ part, box }) => <rect key={part} x={box.x} y={box.y} width={box.width} height={box.height} fill={PART_COLOR[part]} />)}
          <InkPaths strokes={strokes} />
        </svg>
      </li>
    })}
  </ul>
}
