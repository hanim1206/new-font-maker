import polygonClipping, { type MultiPolygon } from 'polygon-clipping'
import type { AnchorPoint, DeepReadonly, InkRegion, JamoData, Part, StrokeDataV2 } from '../types'
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

/** 글자 윤곽에서 부품 네 변 안의 잉크만 남긴다. */
export function clipGhostToFaces(outline: DeepReadonly<NotoOutline>, faces: ContextFaces, margin = 0.002): { ghost: MultiPolygon; area: number } | null {
  const regions = notoOutlineToInkRegions(outline)
  if (!regions.ok) return null
  const ghost = polygonClipping.intersection(unionOf(regions.regions), rectPolygon(faces, margin))
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
  const clipped = clipGhostToFaces(input.outline, faces)
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
  /** 시작 보폭(박스 비율). 개선이 없으면 절반씩 줄인다. */
  step?: number
  /** 이보다 작아지면 멈춘다. */
  minStep?: number
  /** 한 보폭에서 도는 최대 회수. */
  maxRounds?: number
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
  const { step: startStep = 0.06, minStep = 0.004, maxRounds = 12, channel } = options
  const jamo = structuredClone(seed) as JamoData
  const params = skeletonParams(jamo, channel)
  let best = meanXor(jamo, samples, channel)
  const before = best
  let evaluations = 1
  let moved = 0
  let step = startStep
  while (step >= minStep) {
    let improvedAtStep = false
    for (let round = 0; round < maxRounds; round += 1) {
      let improved = false
      for (const param of params) {
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
  // 편집 좌표를 0~1로 되돌리고 0.001 단위로 정리한다.
  normalizeSkeleton(strokeList(jamo, channel))
  for (const stroke of strokeList(jamo, channel)) for (const point of stroke.points) {
    point.x = round3(point.x); point.y = round3(point.y)
    if (point.handleIn) point.handleIn = { x: round3(point.handleIn.x), y: round3(point.handleIn.y) }
    if (point.handleOut) point.handleOut = { x: round3(point.handleOut.x), y: round3(point.handleOut.y) }
  }
  return { jamo, before, after: meanXor(jamo, samples, channel), evaluations, moved }
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

function round3(value: number): number {
  return Math.round(value * 1000) / 1000
}

/** 자모마다 골격을 볼 문맥 글자. 초성은 홀자 계열·받침 유무를 섞고, 받침은 초성·홀자를 섞는다. */
export function skeletonContextChars(part: 'CH' | 'JO', jamo: string): string[] {
  const initials = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
  const medials = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
  const finals = [null, ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']
  const compose = (i: string, m: string, f: string | null) => String.fromCodePoint(0xac00 + (initials.indexOf(i) * 21 + medials.indexOf(m)) * 28 + finals.indexOf(f))
  if (part === 'CH') return [compose(jamo, 'ㅏ', null), compose(jamo, 'ㅗ', null), compose(jamo, 'ㅘ', null), compose(jamo, 'ㅣ', 'ㄴ'), compose(jamo, 'ㅜ', 'ㅇ'), compose(jamo, 'ㅓ', 'ㄹ')]
  return [compose('ㄱ', 'ㅏ', jamo), compose('ㅁ', 'ㅗ', jamo), compose('ㅇ', 'ㅘ', jamo), compose('ㅅ', 'ㅣ', jamo), compose('ㅂ', 'ㅜ', jamo)]
}
