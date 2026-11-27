import { flattenStrokeCenterline } from '../src/services/brushGeometry'
import { contrastWidthOf } from '../src/services/flatStrokeGeometry'
import { resolveGlyphInkPrimitives } from '../src/services/glyphInkResolver'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { DecomposedSyllable, StrokeDataV2 } from '../src/types'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'
import { HALO_ENGINE, haloCorrect, type HaloStroke } from './moldHalo'
import type { GlyphPlacement } from './notoModel'

/**
 * 흐림 선을 폰트 탭 · 검수 격자 · OTF에도(실험 6-앞 길 B, 하니무스 2026-11-25 "ㅇㅇ" · 11-27 "진행해줘").
 * 써 넣기는 흐림 선 **전** 칸을 굽고, 그려질 때마다 여기서 글자마다 다시 센다. 같은 첫닿자 · 홀자 · 받침 짜임이라도
 * 받침마다 보정이 달라(「단」 내림 · 「달」 그대로) 저장으로는 못 맞춘다 — 그래서 저장 대신 다시 셈.
 *
 * 손잡이(여유 · 넓어짐)는 `GlobalStyle.halo`. 없으면 엔진 처음 값(옛 폰트도 켬, 하니무스 2026-11-27).
 */

/** 빚기 처음 굵기(`moldLab.MOLD_BASE_WEIGHT`). 흐림 선 여유가 이 굵기의 기둥 두께에서 잰 값이다. */
const HALO_BASE_WEIGHT = 400
/**
 * 기둥이 처음 굵기보다 이만큼 넘게 굵으면 손대지 않는다. 굵은 쪽은 빚기 화면에서 자소마다 굵기 · 900 쌓임 점 옮김과 함께
 * 흐림 선을 푸는데, 파일에는 그 둘이 아직 없어 칸만 고치면 더 어긋난다(실험 6-앞 900: 「가」 15 → 25%). 900은 따로.
 */
const HEAVY_FROM = 1.02

type HaloStyle = Pick<GlobalStyle, 'weight' | 'linecap' | 'linejoin' | 'strokeStyle' | 'halo'>

/** 이 스타일로 그린 글자의 기둥이 처음 굵기 기둥의 몇 배인가(대비가 세로를 굵힌 몫까지). */
export function haloGrownOf(style: HaloStyle): number {
  const contrast = style.strokeStyle.mode === 'brush' ? style.strokeStyle.contrast ?? 0 : 0
  return weightToMultiplier(style.weight) * contrastWidthOf(contrast)({ x: 0, y: 1 }, false) / weightToMultiplier(HALO_BASE_WEIGHT)
}

/**
 * 한 글자 배치에 흐림 선을 입힌다. 칸으로 안 풀린 글자 · 범위 밖 · 굵은 글자는 받은 그대로 돌려준다.
 * `bodyRight`(글자 칸 좌표, 1 − 오른 여백): 글자 폭이 고정이라 기둥 밀기는 여기까지만 — 옆 글자와 안 겹치게.
 */
export function haloPlacementOf(syllable: DecomposedSyllable, placement: GlyphPlacement, style: HaloStyle, bodyRight?: number): GlyphPlacement {
  if (placement.kind !== 'boxes') return placement
  const grown = haloGrownOf(style)
  if (grown > HEAVY_FROM) return placement
  const contrast = style.strokeStyle.mode === 'brush' ? style.strokeStyle.contrast ?? 0 : 0
  const widthOf = contrastWidthOf(contrast)
  const thick = contrast === 0 ? undefined : { v: widthOf({ x: 0, y: 1 }, false), h: widthOf({ x: 1, y: 0 }, false) }
  const m = weightToMultiplier(style.weight)
  const strokesOn = (boxes: typeof placement.boxes): HaloStroke[] => resolveGlyphInkPrimitives({ syllable, placement: { kind: 'boxes', boxes }, weightMultiplier: 1, globalLinecap: style.linecap, globalLinejoin: style.linejoin, horizontalInkBounds: { min: 0, max: 1 } })
    .primitives.map((primitive) => ({ part: primitive.source.part, points: flattenStrokeCenterline(primitive.stroke as StrokeDataV2, primitive.box), thickness: primitive.stroke.thickness * m, closed: primitive.stroke.closed, cap: (primitive.stroke as StrokeDataV2).linecap ?? style.linecap, ...(thick ? { thick } : {}) }))
  const knobs = style.halo ?? HALO_ENGINE
  const out = haloCorrect({ syllable, boxes: placement.boxes, strokesOn, rule: { ease: knobs.ease, spread: knobs.spread, grown }, bodyRight })
  return out && out.boxes !== placement.boxes ? { kind: 'boxes', boxes: out.boxes } : placement
}
