import polygonClipping, { type MultiPolygon } from 'polygon-clipping'
import type { AnchorPoint, DeepReadonly, InkRegion, JamoData, MedialFamily, Part, StrokeDataV2 } from '../types'
import type { ContextFaces, ContextModel } from './contextBoxResolver'
import { fitContextMedial, predictComponentFaces, boxToFaces } from './contextBoxResolver'
import { fitNotoComponent, inkOfComponentFit } from './notoComponentFit'
import { multiPolygonArea, unionOf } from './notoFitReport'
import { notoOutlineToInkRegions } from './notoOutlineInk'
import type { NotoOutline } from './notoOutlineInk'
import type { ModelIdentity } from './notoVariationModel'
import { getStrokeCenterlineBounds } from '../utils/jamoGeometry'

/**
 * 2단계-b 골격 다듬기. 자모 하나의 기본 획(centerline 앵커·핸들)을 여러 문맥에서
 * 모델 상자에 놓았을 때 Noto 부품 잉크와의 xor가 가장 작아지도록 좌표를 움직인다.
 * 두께·획 수·앵커 수는 그대로다(획 우선 원칙: 두께는 별도 축). 결과는 기본 획 데이터로 돌아간다.
 *
 * Noto 부품 잉크는 글자 윤곽을 부품 네 변(모델 예측)으로 잘라 얻는다 — corpus는 글자 통짜 윤곽만 있고
 * 부품별 contour는 승인 57자에만 있다.
 */

export interface SkeletonSample {
  char: string
  identity: ModelIdentity
  part: Part
  /** 이 문맥의 부품 네 변(em). 잉크 바깥면. */
  faces: ContextFaces
  /** 네 변으로 자른 Noto 잉크. */
  ghost: MultiPolygon
  ghostArea: number
}

function rectPolygon(faces: ContextFaces, margin = 0): MultiPolygon {
  const l = faces.left - margin, r = faces.right + margin, t = faces.top - margin, b = faces.bottom + margin
  return [[[[l, t], [r, t], [r, b], [l, b], [l, t]]]]
}

/** 글자 윤곽에서 부품 네 변 안의 잉크만 남긴다. 다른 부품의 상자가 이 상자에 겹치면(과의 ㅗ 줄기 등) 그 잉크는 뺀다. */
export function clipGhostToFaces(outline: DeepReadonly<NotoOutline>, faces: ContextFaces, margin = 0.002, exclude: readonly ContextFaces[] = []): { ghost: MultiPolygon; area: number } | null {
  const regions = notoOutlineToInkRegions(outline)
  if (!regions.ok) return null
  let ghost = polygonClipping.intersection(unionOf(regions.regions), rectPolygon(faces, margin))
  for (const other of exclude) {
    try { ghost = polygonClipping.difference(ghost, rectPolygon(other, -margin)) } catch { /* 빼기 실패면 그대로 */ }
  }
  const area = multiPolygonArea(ghost)
  return area > 0 ? { ghost, area } : null
}

/** 부품 네 변: 닿자는 모델 예측, 홀자는 fit slot. */
export function partFacesOf(identity: ModelIdentity, model: ContextModel, part: Part): ContextFaces | null {
  if (part === 'CH' || part === 'JO') return predictComponentFaces(identity, model, part)
  const medial = fitContextMedial(identity, model).find((group) => group.part === part)
  return medial?.fit ? boxToFaces(medial.fit.slot) : null
}

export function buildSkeletonSample(input: { char: string; identity: ModelIdentity; part: Part; outline: DeepReadonly<NotoOutline>; model: ContextModel }): SkeletonSample | null {
  const faces = partFacesOf(input.identity, input.model, input.part)
  if (!faces) return null
  // 같은 글자의 다른 부품 상자(혼합 홀자의 줄기가 첫닿자 상자로 올라오는 경우 등)는 이 부품 잉크가 아니다.
  const others: Part[] = input.part === 'CH' || input.part === 'JO'
    ? ['JU', 'JU_H', 'JU_V', input.part === 'CH' ? 'JO' : 'CH']
    : ['CH', 'JO', ...(input.part === 'JU_H' ? ['JU_V' as Part] : input.part === 'JU_V' ? ['JU_H' as Part] : [])]
  const exclude = others.flatMap((part) => { const f = (part === 'JO' && !input.identity.finalJamo) ? null : partFacesOf(input.identity, input.model, part); return f ? [f] : [] })
  const clipped = clipGhostToFaces(input.outline, faces, 0.002, exclude)
  if (!clipped) return null
  return { char: input.char, identity: input.identity, part: input.part, faces, ghost: clipped.ghost, ghostArea: clipped.area }
}

/** 후보 획을 문맥 상자에 놓은 잉크. 실패하면 null. */
export function partInkRegions(jamo: DeepReadonly<JamoData>, sample: SkeletonSample, channel?: 'horizontalStrokes' | 'verticalStrokes'): readonly DeepReadonly<InkRegion>[] | null {
  const fit = fitNotoComponent({ part: sample.part, jamo, channel, faces: sample.faces, glyphId: `skeleton:${sample.char}:${sample.part}` })
  if (!fit.ok) return null
  const ink = inkOfComponentFit(fit.fit)
  return ink.ok ? ink.regions : null
}

export function sampleXor(jamo: DeepReadonly<JamoData>, sample: SkeletonSample, channel?: 'horizontalStrokes' | 'verticalStrokes'): number | null {
  const regions = partInkRegions(jamo, sample, channel)
  if (!regions) return null
  try {
    return multiPolygonArea(polygonClipping.xor(unionOf(regions), sample.ghost)) / sample.ghostArea
  } catch {
    return null
  }
}

/** 여러 문맥의 평균 xor. 하나라도 못 그리면 Infinity(그 후보는 버린다). */
export function meanXor(jamo: DeepReadonly<JamoData>, samples: readonly SkeletonSample[], channel?: 'horizontalStrokes' | 'verticalStrokes'): number {
  let total = 0
  for (const sample of samples) {
    const value = sampleXor(jamo, sample, channel)
    if (value === null || !Number.isFinite(value)) return Number.POSITIVE_INFINITY
    total += value
  }
  return samples.length ? total / samples.length : Number.POSITIVE_INFINITY
}

/** 자모 획의 자유 좌표 하나를 가리킨다. */
export interface SkeletonParam {
  strokeIndex: number
  pointIndex: number
  key: 'x' | 'y' | 'handleIn.x' | 'handleIn.y' | 'handleOut.x' | 'handleOut.y'
}

function strokeList(jamo: JamoData, channel?: 'horizontalStrokes' | 'verticalStrokes'): StrokeDataV2[] {
  if (channel) return (jamo[channel]?.length ? jamo[channel] : jamo.strokes) ?? []
  return jamo.strokes?.length ? jamo.strokes : [...(jamo.verticalStrokes ?? []), ...(jamo.horizontalStrokes ?? [])]
}

export function skeletonParams(jamo: JamoData, channel?: 'horizontalStrokes' | 'verticalStrokes'): SkeletonParam[] {
  const params: SkeletonParam[] = []
  strokeList(jamo, channel).forEach((stroke, strokeIndex) => stroke.points.forEach((point, pointIndex) => {
    params.push({ strokeIndex, pointIndex, key: 'x' }, { strokeIndex, pointIndex, key: 'y' })
    if (point.handleIn) params.push({ strokeIndex, pointIndex, key: 'handleIn.x' }, { strokeIndex, pointIndex, key: 'handleIn.y' })
    if (point.handleOut) params.push({ strokeIndex, pointIndex, key: 'handleOut.x' }, { strokeIndex, pointIndex, key: 'handleOut.y' })
  }))
  return params
}

function readParam(jamo: JamoData, param: SkeletonParam, channel?: 'horizontalStrokes' | 'verticalStrokes'): number {
  const point = strokeList(jamo, channel)[param.strokeIndex].points[param.pointIndex]
  const [group, axis] = param.key.includes('.') ? param.key.split('.') as ['handleIn' | 'handleOut', 'x' | 'y'] : [null, param.key as 'x' | 'y']
  return group ? point[group]![axis] : point[axis]
}

function writeParam(jamo: JamoData, param: SkeletonParam, value: number, channel?: 'horizontalStrokes' | 'verticalStrokes'): void {
  const point = strokeList(jamo, channel)[param.strokeIndex].points[param.pointIndex]
  const [group, axis] = param.key.includes('.') ? param.key.split('.') as ['handleIn' | 'handleOut', 'x' | 'y'] : [null, param.key as 'x' | 'y']
  if (group) point[group]![axis] = value
  else point[axis] = value
}

/** 앵커를 옮길 때 붙은 핸들도 같이 옮긴다(곡률 유지). 핸들 파라미터는 핸들만. */
function shift(jamo: JamoData, param: SkeletonParam, delta: number, channel?: 'horizontalStrokes' | 'verticalStrokes'): void {
  writeParam(jamo, param, readParam(jamo, param, channel) + delta, channel)
  if (param.key === 'x' || param.key === 'y') {
    const point: AnchorPoint = strokeList(jamo, channel)[param.strokeIndex].points[param.pointIndex]
    if (point.handleIn) point.handleIn[param.key] += delta
    if (point.handleOut) point.handleOut[param.key] += delta
  }
}

const LIMIT = { min: -0.2, max: 1.2 }

export interface SkeletonFitOptions {
  /**
   * 열린 획의 앵커에 길이 0 핸들을 심어 곡률도 자유 좌표로 둔다(처음엔 직선 그대로).
   * ㄱ·ㅋ처럼 Noto가 휘는데 앱 골격이 직선뿐인 자모가 이걸로 휜다. 닫힌 획은 안 건드린다.
   */
  seedHandles?: boolean
  /** 시작 보폭(박스 비율). 개선이 없으면 절반씩 줄인다. */
  step?: number
  /** 이보다 작아지면 멈춘다. */
  minStep?: number
  /** 한 보폭에서 도는 최대 회수. */
  maxRounds?: number
  /** 시간 예산(ms). 넘기면 그때까지 가장 좋은 골격으로 끝낸다. 획 많은 자모가 십수 분 도는 일을 막는다. */
  maxMillis?: number
  channel?: 'horizontalStrokes' | 'verticalStrokes'
}

export interface SkeletonFitResult {
  jamo: JamoData
  before: number
  after: number
  evaluations: number
  /** 파라미터별 이동량(절댓값 합). 어디가 움직였는지 보기용. */
  moved: number
}

/**
 * 좌표 하강. 파라미터마다 ±step을 시도해 평균 xor가 줄면 받아들이고, 한 바퀴 개선이 없으면 보폭을 반으로.
 * 20개 안팎 파라미터·문맥 6개면 자모당 수 초.
 */
export function fitSkeleton(seed: DeepReadonly<JamoData>, samples: readonly SkeletonSample[], options: SkeletonFitOptions = {}): SkeletonFitResult {
  const { step: startStep = 0.06, minStep = 0.004, maxRounds = 12, maxMillis = 45_000, channel, seedHandles = false } = options
  const jamo = structuredClone(seed) as JamoData
  if (seedHandles) seedOpenStrokeHandles(strokeList(jamo, channel))
  const params = skeletonParams(jamo, channel)
  let best = meanXor(jamo, samples, channel)
  const before = best
  let evaluations = 1
  let moved = 0
  let step = startStep
  const deadline = Date.now() + maxMillis
  const outOfTime = () => Date.now() > deadline
  while (step >= minStep && !outOfTime()) {
    let improvedAtStep = false
    for (let round = 0; round < maxRounds && !outOfTime(); round += 1) {
      let improved = false
      for (const param of params) {
        if (outOfTime()) break
        for (const direction of [1, -1]) {
          const current = readParam(jamo, param, channel)
          const next = current + direction * step
          if (next < LIMIT.min || next > LIMIT.max) continue
          shift(jamo, param, direction * step, channel)
          const value = meanXor(jamo, samples, channel)
          evaluations += 1
          if (value < best - 1e-6) { best = value; improved = true; moved += step; break }
          shift(jamo, param, -direction * step, channel)
        }
      }
      if (!improved) break
      improvedAtStep = true
    }
    if (!improvedAtStep) step /= 2
    else step = Math.max(step / 2, minStep * 0.999)
  }
  // 상자 fit은 축별로 중심선 범위를 네 변에 맞추므로 좌표의 축별 아핀은 결과를 안 바꾼다.
  // 편집 좌표를 0~1로 되돌리고 0.001 단위로 정리한다. 정리가 잉크를 깨면(드물게 Boolean 실패) 정리 전 결과를 돌려준다.
  const tidy = structuredClone(jamo) as JamoData
  normalizeSkeleton(strokeList(tidy, channel))
  if (seedHandles) pruneZeroHandles(strokeList(tidy, channel))
  for (const stroke of strokeList(tidy, channel)) for (const point of stroke.points) {
    point.x = round3(point.x); point.y = round3(point.y)
    if (point.handleIn) point.handleIn = { x: round3(point.handleIn.x), y: round3(point.handleIn.y) }
    if (point.handleOut) point.handleOut = { x: round3(point.handleOut.x), y: round3(point.handleOut.y) }
  }
  const tidyXor = meanXor(tidy, samples, channel)
  if (Number.isFinite(tidyXor) && tidyXor <= best + 0.005) return { jamo: tidy, before, after: tidyXor, evaluations: evaluations + 1, moved }
  return { jamo, before, after: best, evaluations: evaluations + 1, moved }
}

/** 열린 획의 앵커마다 없는 핸들을 앵커 자리에 심는다(길이 0 = 직선 유지). 첫 앵커는 out, 끝 앵커는 in, 안쪽은 둘 다. */
export function seedOpenStrokeHandles(strokes: StrokeDataV2[]): void {
  for (const stroke of strokes) {
    if (stroke.closed || stroke.points.length < 2) continue
    stroke.points.forEach((point, index) => {
      if (index > 0 && !point.handleIn) point.handleIn = { x: point.x, y: point.y }
      if (index < stroke.points.length - 1 && !point.handleOut) point.handleOut = { x: point.x, y: point.y }
    })
  }
}

/** fit 뒤 앵커와 같은 자리에 남은 핸들은 지운다(직선은 직선으로 저장). */
export function pruneZeroHandles(strokes: StrokeDataV2[], tolerance = 0.002): void {
  for (const stroke of strokes) for (const point of stroke.points) {
    if (point.handleIn && Math.hypot(point.handleIn.x - point.x, point.handleIn.y - point.y) <= tolerance) delete point.handleIn
    if (point.handleOut && Math.hypot(point.handleOut.x - point.x, point.handleOut.y - point.y) <= tolerance) delete point.handleOut
  }
}

/** 중심선 범위(곡선 포함)를 축별로 0~1에 맞춘다. 한 축으로 안 퍼진 획(ㅡ 한 줄)은 그 축을 그대로 둔다. */
export function normalizeSkeleton(strokes: StrokeDataV2[]): void {
  const bounds = getStrokeCenterlineBounds(strokes)
  if (!bounds) return
  const spanX = bounds.maxX - bounds.minX
  const spanY = bounds.maxY - bounds.minY
  const mapX = spanX > 1e-6 ? (x: number) => (x - bounds.minX) / spanX : (x: number) => x
  const mapY = spanY > 1e-6 ? (y: number) => (y - bounds.minY) / spanY : (y: number) => y
  for (const stroke of strokes) for (const point of stroke.points) {
    point.x = mapX(point.x); point.y = mapY(point.y)
    if (point.handleIn) point.handleIn = { x: mapX(point.handleIn.x), y: mapY(point.handleIn.y) }
    if (point.handleOut) point.handleOut = { x: mapX(point.handleOut.x), y: mapY(point.handleOut.y) }
  }
}

/**
 * 다른 출발점들. 좌표 하강은 국소 최소에 잘 걸린다 — ㄱ 다리처럼 끝점을 멀리(왼아래) 보내며 휘어야 할 때
 * 작은 걸음마다 xor가 안 줄어 못 간다. 열린 획마다 마지막 앵커를 왼·가운데·오른쪽으로 보내고
 * 직전 앵커 쪽에 handleIn을 심은 씨앗을 만든다.
 */
export function skeletonSeedVariants(seed: DeepReadonly<JamoData>, channel?: 'horizontalStrokes' | 'verticalStrokes'): JamoData[] {
  const variants: JamoData[] = []
  const base = structuredClone(seed) as JamoData
  const strokes = strokeList(base, channel)
  // 획이 많은 자모(ㅃ·ㅉ 등)는 씨앗이 획 수 × 3으로 불어 fit이 수십 분 걸린다. 다리 하나가 문제인 ㄱ·ㅋ·ㄴ 같은 2획 이하만 본다.
  if (strokes.filter((stroke) => !stroke.closed).length > 2) return variants
  strokes.forEach((stroke, strokeIndex) => {
    if (stroke.closed || stroke.points.length < 2) return
    for (const targetX of [0.05, 0.5, 0.95]) {
      const clone = structuredClone(base) as JamoData
      const target = strokeList(clone, channel)[strokeIndex]
      const last = target.points[target.points.length - 1]
      const prev = target.points[target.points.length - 2]
      if (Math.abs(last.x - targetX) < 0.1) continue
      last.x = targetX
      last.handleIn = { x: prev.x, y: prev.y + (last.y - prev.y) * 0.6 }
      variants.push(clone)
    }
  })
  return variants
}

/**
 * 여러 출발점에서 굵게 돌려 가장 좋은 것을 고른 뒤 그 자리에서 곱게 다듬는다.
 * 기본 출발점 결과가 threshold보다 나쁠 때만 대안 씨앗을 본다(대부분 자모는 한 번이면 충분하다).
 */
export function fitSkeletonMultiStart(seed: DeepReadonly<JamoData>, samples: readonly SkeletonSample[], options: SkeletonFitOptions & { threshold?: number; extraStarts?: readonly DeepReadonly<JamoData>[] } = {}): SkeletonFitResult {
  const { threshold = 0.3, extraStarts = [], ...rest } = options
  const first = fitSkeleton(seed, samples, rest)
  let best = first
  let evaluations = first.evaluations
  // 이미 다듬은 골격에서 다시 출발하면 그 골짜기에 갇힌다. 옛 직각 골격 같은 다른 출발점은 항상 같이 본다.
  const starts = [...extraStarts, ...(first.after <= threshold ? [] : skeletonSeedVariants(seed, rest.channel))].slice(0, 4)
  for (const start of starts) {
    const coarse = fitSkeleton(start, samples, { ...rest, minStep: 0.02, maxRounds: 4, maxMillis: (rest.maxMillis ?? 45_000) / 2 })
    evaluations += coarse.evaluations
    if (coarse.after >= best.after) continue
    const refined = fitSkeleton(coarse.jamo, samples, rest)
    evaluations += refined.evaluations
    if (refined.after < best.after) best = refined
  }
  return { ...best, before: first.before, evaluations }
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const MEDIALS = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
const FINALS = [null, ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']
const composeChar = (i: string, m: string, f: string | null) => String.fromCodePoint(0xac00 + (INITIALS.indexOf(i) * 21 + MEDIALS.indexOf(m)) * 28 + FINALS.indexOf(f))

/** 첫닿자의 계열별 변형을 볼 문맥 글자. 계열 안에서 홀자·받침 유무를 섞는다. */
export function skeletonFamilyChars(family: MedialFamily, jamo: string): string[] {
  if (family === 'right') return [composeChar(jamo, 'ㅏ', null), composeChar(jamo, 'ㅓ', null), composeChar(jamo, 'ㅣ', 'ㄴ'), composeChar(jamo, 'ㅐ', 'ㄹ'), composeChar(jamo, 'ㅕ', null)]
  if (family === 'bottom') return [composeChar(jamo, 'ㅗ', null), composeChar(jamo, 'ㅜ', null), composeChar(jamo, 'ㅡ', 'ㅇ'), composeChar(jamo, 'ㅛ', 'ㄴ'), composeChar(jamo, 'ㅠ', null)]
  return [composeChar(jamo, 'ㅘ', null), composeChar(jamo, 'ㅝ', null), composeChar(jamo, 'ㅢ', 'ㄴ'), composeChar(jamo, 'ㅟ', null), composeChar(jamo, 'ㅚ', 'ㅇ')]
}

/** 자모마다 골격을 볼 문맥 글자. 초성은 홀자 계열·받침 유무를 섞고, 받침은 초성·홀자를 섞는다. */
export function skeletonContextChars(part: 'CH' | 'JO' | 'JU', jamo: string): string[] {
  const compose = composeChar
  if (part === 'CH') return [compose(jamo, 'ㅏ', null), compose(jamo, 'ㅗ', null), compose(jamo, 'ㅘ', null), compose(jamo, 'ㅣ', 'ㄴ'), compose(jamo, 'ㅜ', 'ㅇ'), compose(jamo, 'ㅓ', 'ㄹ')]
  if (part === 'JU') return [compose('ㄱ', jamo, null), compose('ㅁ', jamo, null), compose('ㅅ', jamo, null), compose('ㄱ', jamo, 'ㄴ'), compose('ㅇ', jamo, 'ㄹ'), compose('ㅂ', jamo, 'ㅇ')]
  return [compose('ㄱ', 'ㅏ', jamo), compose('ㅁ', 'ㅗ', jamo), compose('ㅇ', 'ㅘ', jamo), compose('ㅅ', 'ㅣ', jamo), compose('ㅂ', 'ㅜ', jamo)]
}
