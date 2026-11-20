import type { LayoutType } from '../src/types'
import type { PartShift } from './AppGlyph'

/**
 * 울타리 실험지(12문항)의 계산. 배치 값 넷을 폰트 분포로 정한 울타리의 가운데 · 끝 · 두 배 밖에 두고, 한 글줄씩 보여 준다.
 * 값은 고딕 프리셋 기준(거북이 `engine-vs-gothic-2026-11-20.txt`, 문서 "망가지지 않는 범위, 다시 정하기"). 단위는 글자 높이 비율.
 * 지금 엔진 값에서 목표 값까지의 차이만큼 부위 상자를 옮겨 흔든다. 저장하지 않고 제품 값도 안 바꾼다.
 */

export type FenceValue = 'finalBottom' | 'topLine' | 'gap' | 'centroid'
/** 가운데에서 울타리 끝까지 거리의 몇 배인가. 0 가운데 · 1 울타리 끝 · 2 두 배 밖 … (확인 12문항은 0 · 1 · 2, 한계선 문항은 3 · 4 · 6). */
export type FenceLevel = number
/** 흔드는 쪽. 기본은 값마다 정한 쪽, `wide`는 반대쪽(윗선 차이를 넓히는 쪽). */
export type FenceSide = 'default' | 'wide'

export interface FenceValueInfo {
  value: FenceValue
  name: string
  /** 흔든 것을 풀어 쓴 말(답한 뒤 보여 준다) */
  detail: string
  sentence: string
}

export const FENCE_VALUES: readonly FenceValueInfo[] = [
  { value: 'finalBottom', name: '받침 밑선 흔들림', detail: '받침 글자들의 밑선이 들쭉날쭉한 정도', sentence: '늦은 밤 골목길 끝 작은 빵집' },
  { value: 'topLine', name: '받침 유무 윗선 차이', detail: '가로홀자 글자에서 받침 있는 글자가 없는 글자보다 위로 올라가는 정도', sentence: '보름 소풍 두 그릇 국수' },
  { value: 'gap', name: '획 사이 틈', detail: '첫닿자와 세로홀자 사이 틈', sentence: '아버지가 바다 너머 저기 산다' },
  { value: 'centroid', name: '무게중심', detail: '받침 글자의 위아래 무게중심', sentence: '맑은 하늘 밑 넓은 들판' },
]

const TIMES: Record<number, string> = { 2: '두', 3: '세', 4: '네', 5: '다섯', 6: '여섯' }
export function levelName(level: FenceLevel, side: FenceSide = 'default'): string {
  const base = level === 0 ? '가운데' : level === 1 ? '울타리 끝' : `울타리 ${TIMES[level] ?? level} 배 밖`
  return side === 'wide' ? `${base}(넓은 쪽)` : base
}

/** 울타리: 가운데와 이번에 쓰는 끝. 목표 = 가운데 + 단계 × (끝 − 가운데). */
interface Fence { engine: number; center: number; end: number }
const targetOf = (fence: Fence, level: FenceLevel, side: FenceSide = 'default') => fence.center + (side === 'wide' ? -1 : 1) * level * (fence.end - fence.center)

/** 받침 밑선 흩어짐(표준편차). 엔진 0.008, 고딕 0.009 [0.006~0.013] — 넓은 쪽 끝을 쓴다. */
const FINAL_BOTTOM: Fence = { engine: 0.008, center: 0.009, end: 0.013 }
/** 윗선 차(가로 무받침 − 받침). 엔진 0.057, 고딕 0.048 [0.039~0.058] — 좁은 쪽 끝(받침 글자가 덜 올라감)을 쓴다. */
const TOP_LINE: Fence = { engine: 0.057, center: 0.048, end: 0.039 }
/** 세로 틈(첫닿 ↔ 세로홀자). 엔진 0.192, 기대 0.198, 울타리 ±10% → 좁은 쪽 끝 0.178. */
const GAP: Fence = { engine: 0.192, center: 0.198, end: 0.178 }
/** 무게중심(받침 글자, 위→아래 비율). 엔진 쪽 끝(아래)을 쓴다. */
const CENTROID: Partial<Record<LayoutType, Fence>> = {
  'choseong-jungseong-vertical-jongseong': { engine: 0.522, center: 0.4995, end: 0.508 },
  'choseong-jungseong-horizontal-jongseong': { engine: 0.514, center: 0.507, end: 0.514 },
  'choseong-jungseong-mixed-jongseong': { engine: 0.503, center: 0.494, end: 0.504 },
}
/** 받침 글자에서 첫닿 · 홀자가 잉크에서 차지하는 몫(어림). 위 부위를 dy 옮기면 무게중심은 이 몫만큼 움직인다. */
const UPPER_INK_SHARE = 0.7

/** 받침 밑선을 흔드는 무늬(글자 순서대로, 평균 0 · 표준편차 1). */
const JITTER = [1, -1, 1, 1, -1, -1, 1, -1, -1, 1, 1, -1]

const hasFinal = (layout: LayoutType) => layout.endsWith('-jongseong')
const isVertical = (layout: LayoutType) => layout === 'choseong-jungseong-vertical' || layout === 'choseong-jungseong-vertical-jongseong'
const upper = (dy: number): PartShift => ({ CH: { dy }, JU: { dy }, JU_H: { dy }, JU_V: { dy } })

/**
 * 이 문항에서 글자 하나(글줄 안 `index`번째 받침 글자 등)의 부위 이동.
 * - 받침 밑선: 엔진 흩어짐 위에 더할 흔들림 J — √(엔진² + J²) = 목표.
 * - 윗선 차: 가로 + 받침 글자의 윗부분을 (엔진 − 목표)만큼 내린다.
 * - 틈: 세로 짜임에서 첫닿을 (엔진 − 목표)만큼 홀자 쪽으로.
 * - 무게중심: 받침 글자의 윗부분을 (목표 − 엔진) ÷ 몫만큼 옮긴다.
 */
export function fenceShift(value: FenceValue, level: FenceLevel, layout: LayoutType, finalIndex: number, side: FenceSide = 'default'): PartShift | undefined {
  switch (value) {
    case 'finalBottom': {
      if (!hasFinal(layout)) return undefined
      const target = targetOf(FINAL_BOTTOM, level)
      const jitter = Math.sqrt(Math.max(0, target ** 2 - FINAL_BOTTOM.engine ** 2))
      return { JO: { dy: jitter * JITTER[finalIndex % JITTER.length] } }
    }
    case 'topLine': {
      if (layout !== 'choseong-jungseong-horizontal-jongseong') return undefined
      // 윗선 차이는 0 아래로 안 간다(받침 글자가 받침 없는 글자보다 낮게 시작하면 다른 규칙이 깨진다) — 0에서 멈춘다.
      return upper(TOP_LINE.engine - Math.max(0, targetOf(TOP_LINE, level, side)))
    }
    case 'gap': {
      if (!isVertical(layout)) return undefined
      return { CH: { dx: GAP.engine - targetOf(GAP, level) } }
    }
    case 'centroid': {
      const fence = CENTROID[layout]
      if (!fence) return undefined
      return upper((targetOf(fence, level) - fence.engine) / UPPER_INK_SHARE)
    }
  }
}

export interface FenceItem { value: FenceValue; level: FenceLevel; side?: FenceSide }

/** 12문항. 같은 값이 붙어 나오지 않게 섞은 고정 순서(사람마다 같은 순서라 답을 견주기 쉽다). */
export const FENCE_ITEMS: readonly FenceItem[] = [
  { value: 'finalBottom', level: 1 }, { value: 'gap', level: 0 }, { value: 'topLine', level: 2 }, { value: 'centroid', level: 1 },
  { value: 'finalBottom', level: 2 }, { value: 'topLine', level: 0 }, { value: 'centroid', level: 2 }, { value: 'gap', level: 1 },
  { value: 'topLine', level: 1 }, { value: 'finalBottom', level: 0 }, { value: 'gap', level: 2 }, { value: 'centroid', level: 0 },
]

/**
 * 한계선 10문항(거북이 설계, 하니무스 "둘로 나눈다" 21:06). 확인 12문항에서 두 배 밖도 괜찮았던 셋을 세 · 네 · 여섯 배 밖까지 흔든다.
 * 윗선 차이는 다섯 배쯤에서 0에 닿아 여섯 배는 0에서 멈추고, 넓은 쪽으로 여섯 배도 한 문항. 무게중심은 울타리 가운데 기준이다(엔진 값이 이미 밖이라).
 * 처음 어색하다고 답한 단계가 한계선이다.
 */
export const LIMIT_ITEMS: readonly FenceItem[] = [
  { value: 'topLine', level: 3 }, { value: 'gap', level: 4 }, { value: 'centroid', level: 6 }, { value: 'topLine', level: 6, side: 'wide' }, { value: 'gap', level: 3 },
  { value: 'centroid', level: 3 }, { value: 'topLine', level: 4 }, { value: 'gap', level: 6 }, { value: 'centroid', level: 4 }, { value: 'topLine', level: 6 },
]

/** 값 · 쪽마다 처음 어색하다고 답한 단계(작은 단계부터). 다 괜찮으면 null — 한계선은 그보다 밖. */
export function limitOf(items: readonly FenceItem[], answers: readonly (Answer | undefined)[], value: FenceValue, side: FenceSide = 'default'): FenceLevel | null | undefined {
  const asked = items.map((item, index) => ({ item, answer: answers[index] })).filter(({ item }) => item.value === value && (item.side ?? 'default') === side)
  if (!asked.length || asked.some(({ answer }) => !answer)) return undefined
  const awkward = asked.filter(({ answer }) => answer === 'awkward').map(({ item }) => item.level).sort((a, b) => a - b)
  return awkward.length ? awkward[0] : null
}

export const fenceInfo = (value: FenceValue) => FENCE_VALUES.find((info) => info.value === value)!

/** 기대 답: 가운데 · 끝은 괜찮다, 두 배 밖은 어색하다. */
export const expectedAnswer = (level: FenceLevel): Answer => (level === 2 ? 'awkward' : 'ok')
export type Answer = 'ok' | 'awkward'

/** 결과를 붙여 넣기 좋은 글로. */
export function answersText(answers: readonly (Answer | undefined)[], items: readonly FenceItem[] = FENCE_ITEMS): string {
  const limit = items !== FENCE_ITEMS
  const lines = items.map((item, index) => {
    const answer = answers[index]
    const said = answer === 'ok' ? '괜찮다' : answer === 'awkward' ? '어색하다' : '—'
    const match = !limit && answer ? (answer === expectedAnswer(item.level) ? '기대대로' : '기대와 다름') : ''
    return `${index + 1}. ${fenceInfo(item.value).name} · ${levelName(item.level, item.side)} → ${said} ${match}`.trim()
  })
  return [limit ? `한계선 ${items.length}문항` : '울타리 실험지 12문항', ...lines].join('\n')
}
