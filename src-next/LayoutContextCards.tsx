import { useMemo } from 'react'
import { resolveContextBoxes } from '../src/services/contextBoxResolver'
import type { BoxConfig, Part } from '../src/types'
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
 */

/** 편집 캔버스와 같은 대지. 글자 칸 바깥 8% 여백까지 같아서 상자 비례가 캔버스와 어긋나지 않는다. */
const VIEW_BOX = '-0.08 -0.08 1.16 1.16'
/** 겹칠 때 큰 상자가 먼저. 혼합 홀자는 가로부·세로부가 둘 다 온다. */
const PART_ORDER: Part[] = ['CH', 'JU', 'JU_H', 'JU_V', 'JO']

export interface LayoutContextBox { part: Part; box: BoxConfig }

export function LayoutContextCards({ activeContextId, allActive }: {
  /** 지금 고치는 글자의 칸. */
  activeContextId: string
  /** 범위가 `전체`일 때. 여섯 칸을 다 켠다. */
  allActive: boolean
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
  return <ul className={styles.strip} aria-label="레이아웃 여섯 칸" data-testid="layout-context-cards">
    {LAYOUT_CONTEXT_IDS.map((contextId) => {
      const on = allActive || contextId === activeContextId
      const parts = sampleParts[contextId]
      return <li key={contextId} className={styles.card} data-context={contextId} data-active={on || undefined}>
        <svg viewBox={VIEW_BOX} role="img" aria-label={`${LAYOUT_CONTEXT_LABEL[contextId]}${on ? ' · 고치는 중' : ''}`}>
          {parts.map(({ part, box }) => <rect key={part} x={box.x} y={box.y} width={box.width} height={box.height} fill={PART_COLOR[part]} />)}
        </svg>
      </li>
    })}
  </ul>
}
