import type { PresetCompositionTarget } from '../../src-next/presetCompositionInput'
import type { PresetSourceElement } from '../../src-next/presetCandidateSource'
import {
  PRESET_MEDIAL_ROLE_BINDINGS,
  type PresetCandidateJamoMaps,
} from './presetCandidateCompiler'
import {
  measurePresetSquarePrimitiveBounds,
  type PresetInkBounds,
} from './presetJointInkMeasurement'
import { resolveGlyphInkPrimitives } from './glyphInkResolver'
import type {
  BoxConfig,
  LayoutSchema,
  Part,
  ResolvedCenterlinePrimitive,
} from '../types'
import { decomposeSyllable } from '../utils/hangulUtils'
import { calculateBoxes } from '../utils/layoutCalculator'

export const PRESET_COMPOSITION_FITTER_VERSION = 'joint-layout-fitter-r4-v1' as const
export const PRESET_COMPOSITION_FITTER_GRID = 0.005 as const
export const PRESET_COMPOSITION_MINIMUM_GAP = 0.025 as const

type FitPart = 'CH' | 'JU' | 'JU_H' | 'JU_V'
type BoundsMetric = 'minX' | 'maxX' | 'minY' | 'maxY'
type ObservationMetric = BoundsMetric | 'tangentX' | 'tangentY'

interface FitObservation {
  part: FitPart
  strokeId: string | null
  metric: ObservationMetric
  target: number
  weight: number
  referenceSide?: 'left' | 'right'
  faceSide?: PresetSourceElement['faceSide']
}

export interface PresetCompositionFitResult {
  fitterVersion: typeof PRESET_COMPOSITION_FITTER_VERSION
  character: string
  layoutType: PresetCompositionTarget['structure']
  boxes: Partial<Record<Part, BoxConfig>>
  status: 'ready-user-review' | 'blocked-collision' | 'blocked-no-improvement'
  productionEligible: false
  currentRmse: number
  candidateRmse: number
  improvement: number
  collision: {
    safe: boolean
    axis: 'x' | 'y'
    gap: number
    minimumGap: typeof PRESET_COMPOSITION_MINIMUM_GAP
  }
}

const FIT_STEPS = [0.08, 0.04, 0.02, 0.01, PRESET_COMPOSITION_FITTER_GRID] as const
const FIT_PASSES_PER_STEP = 3
const REGULARIZATION_WEIGHT = 0.0005
const COLLISION_GAP_PENALTY_WEIGHT = 500 as const
const EPSILON = 1e-10

function fail(message: string): never {
  throw new Error(`r4 공동 fitter 실패: ${message}`)
}

function snap(value: number): number {
  return Math.round(value / PRESET_COMPOSITION_FITTER_GRID) * PRESET_COMPOSITION_FITTER_GRID
}

function cloneBoxes(boxes: Partial<Record<Part, BoxConfig>>): Partial<Record<Part, BoxConfig>> {
  return Object.fromEntries(Object.entries(boxes).map(([part, box]) => [part, { ...box }]))
}

function validBox(box: BoxConfig): boolean {
  return [box.x, box.y, box.width, box.height].every(Number.isFinite)
    && box.x >= -0.15
    && box.y >= -0.15
    && box.width >= 0.05
    && box.height >= 0.05
    && box.x + box.width <= 1.15
    && box.y + box.height <= 1.15
}

function sourceAnchor(element: PresetSourceElement): { x: number; y: number } | null {
  if (element.face.status !== 'candidate') return null
  if (element.face.anchor) return element.face.anchor
  const anchor = element.face.evidence?.anchor
  if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor)) return null
  const record = anchor as Record<string, unknown>
  return typeof record.x === 'number' && typeof record.y === 'number'
    ? { x: record.x, y: record.y }
    : null
}

function initialObservations(target: PresetCompositionTarget): FitObservation[] {
  const selectionArea = target.initial.source.selectionArea
  if (selectionArea.status !== 'candidate') fail(`${target.character} 초성 선택 영역 없음`)
  const area = selectionArea.value
  return [
    { part: 'CH', strokeId: null, metric: 'minX', target: area.x / 1000, weight: 1 },
    { part: 'CH', strokeId: null, metric: 'maxX', target: (area.x + area.width) / 1000, weight: 1 },
    { part: 'CH', strokeId: null, metric: 'minY', target: area.y / 1000, weight: 1 },
    { part: 'CH', strokeId: null, metric: 'maxY', target: (area.y + area.height) / 1000, weight: 1 },
  ]
}

function axisMetric(element: PresetSourceElement, edge: 'start' | 'end'): BoundsMetric {
  if (element.orientation === 'vertical') return edge === 'start' ? 'minY' : 'maxY'
  return edge === 'start' ? 'minX' : 'maxX'
}

function faceMetric(side: PresetSourceElement['faceSide']): BoundsMetric {
  if (side === 'left') return 'minX'
  if (side === 'right') return 'maxX'
  if (side === 'top') return 'minY'
  return 'maxY'
}

function medialObservations(target: PresetCompositionTarget): FitObservation[] {
  return target.medial.source.elements.flatMap((element): FitObservation[] => {
    if (element.face.status !== 'candidate') return []
    const binding = PRESET_MEDIAL_ROLE_BINDINGS[target.medialJamo]?.[element.elementId]
    if (!binding) fail(`${target.character}/${element.elementId} 획 결속 없음`)
    if (element.face.referenceMode === 'start-side-local-tangent') {
      const anchor = sourceAnchor(element)
      if (!anchor) fail(`${target.character}/${element.elementId} 국소 접선 anchor 없음`)
      return [
        {
          part: binding.part,
          strokeId: binding.strokeId,
          metric: 'tangentX',
          target: anchor.x / 1000,
          weight: 1,
          referenceSide: element.face.referenceSide,
          faceSide: element.faceSide,
        },
        {
          part: binding.part,
          strokeId: binding.strokeId,
          metric: 'tangentY',
          target: anchor.y / 1000,
          weight: 1,
          referenceSide: element.face.referenceSide,
          faceSide: element.faceSide,
        },
      ]
    }
    const observations: FitObservation[] = [{
      part: binding.part,
      strokeId: binding.strokeId,
      metric: faceMetric(element.faceSide),
      target: element.face.value / 1000,
      weight: 1,
    }]
    const spans = element.componentSpans ?? []
    if (spans.length > 0) {
      observations.push(
        {
          part: binding.part,
          strokeId: binding.strokeId,
          metric: axisMetric(element, 'start'),
          target: Math.min(...spans.map(({ from }) => from)) / 1000,
          weight: 0.35,
        },
        {
          part: binding.part,
          strokeId: binding.strokeId,
          metric: axisMetric(element, 'end'),
          target: Math.max(...spans.map(({ to }) => to)) / 1000,
          weight: 0.35,
        },
      )
    }
    return observations
  })
}

function resolveCandidate(
  target: PresetCompositionTarget,
  boxes: Partial<Record<Part, BoxConfig>>,
  jamos: PresetCandidateJamoMaps,
) {
  const syllable = decomposeSyllable(target.character, jamos.choseong, jamos.jungseong, jamos.jongseong)
  return resolveGlyphInkPrimitives({
    syllable,
    placement: { kind: 'boxes', boxes },
    weightMultiplier: 1,
    globalLinecap: 'square',
    globalLinejoin: 'round',
  })
}

function boundsUnion(bounds: readonly PresetInkBounds[]): PresetInkBounds | null {
  if (bounds.length === 0) return null
  return bounds.reduce((result, current) => ({
    minX: Math.min(result.minX, current.minX),
    maxX: Math.max(result.maxX, current.maxX),
    minY: Math.min(result.minY, current.minY),
    maxY: Math.max(result.maxY, current.maxY),
  }))
}

function partBounds(
  primitives: readonly ResolvedCenterlinePrimitive[],
  part: Part,
): PresetInkBounds | null {
  return boundsUnion(primitives
    .filter((primitive) => primitive.source.part === part)
    .map(measurePresetSquarePrimitiveBounds))
}

function observationPrimitive(
  observation: FitObservation,
  primitives: readonly ResolvedCenterlinePrimitive[],
): ResolvedCenterlinePrimitive | null {
  if (observation.strokeId === null) return null
  return primitives.find((primitive) => (
    primitive.source.part === observation.part
    && primitive.source.kind === 'stroke'
    && primitive.source.strokeId === observation.strokeId
  )) ?? fail(`${observation.part}/${observation.strokeId} 실제 획 없음`)
}

function tangentPoint(primitive: ResolvedCenterlinePrimitive, side: 'left' | 'right' | undefined) {
  const points = primitive.stroke.points
  if (points.length === 0) fail(`${primitive.id} 국소 접선 점 없음`)
  const direction = side === 'right' ? -1 : 1
  return points.reduce((selected, point) => (
    (point.x - selected.x) * direction < 0 ? point : selected
  ))
}

function tangentValue(observation: FitObservation, primitive: ResolvedCenterlinePrimitive): number {
  const point = tangentPoint(primitive, observation.referenceSide)
  const halfThickness = primitive.stroke.thickness * primitive.weightMultiplier / 2
  if (observation.metric === 'tangentX') {
    const faceOffset = observation.faceSide === 'left' ? -halfThickness : observation.faceSide === 'right' ? halfThickness : 0
    return primitive.box.x + point.x * primitive.box.width + faceOffset
  }
  const faceOffset = observation.faceSide === 'top' ? -halfThickness : observation.faceSide === 'bottom' ? halfThickness : 0
  return primitive.box.y + point.y * primitive.box.height + faceOffset
}

function measuredValue(
  observation: FitObservation,
  primitives: readonly ResolvedCenterlinePrimitive[],
): number {
  const primitive = observationPrimitive(observation, primitives)
  if (observation.metric === 'tangentX' || observation.metric === 'tangentY') {
    if (!primitive) fail(`${observation.part} 국소 접선 획 없음`)
    return tangentValue(observation, primitive)
  }
  const bounds = primitive
    ? measurePresetSquarePrimitiveBounds(primitive)
    : partBounds(primitives, observation.part)
  if (!bounds) fail(`${observation.part} 실제 잉크 경계 없음`)
  return bounds[observation.metric]
}

function dataScore(
  target: PresetCompositionTarget,
  boxes: Partial<Record<Part, BoxConfig>>,
  observations: readonly FitObservation[],
  jamos: PresetCandidateJamoMaps,
): number {
  const primitives = resolveCandidate(target, boxes, jamos).primitives
  const result = observations.reduce((score, observation) => {
    const error = measuredValue(observation, primitives) - observation.target
    score.squared += error * error * observation.weight
    score.weight += observation.weight
    return score
  }, { squared: 0, weight: 0 })
  return result.weight > 0 ? result.squared / result.weight : Number.POSITIVE_INFINITY
}

function collisionPenalty(gap: number): number {
  const shortfall = Math.max(0, PRESET_COMPOSITION_MINIMUM_GAP - gap)
  return shortfall * shortfall * COLLISION_GAP_PENALTY_WEIGHT
}

function optimizePart(
  target: PresetCompositionTarget,
  boxes: Partial<Record<Part, BoxConfig>>,
  part: FitPart,
  observations: readonly FitObservation[],
  jamos: PresetCandidateJamoMaps,
  options: {
    mode?: 'fit' | 'collision'
    minimumGap?: number
  } = {},
): void {
  const partObservations = observations.filter((observation) => observation.part === part)
  const mode = options.mode ?? 'fit'
  const start = boxes[part]
  if (!start || (mode === 'fit' && partObservations.length === 0)) return
  const keys = ['x', 'y', 'width', 'height'] as const
  for (const step of FIT_STEPS) {
    for (let pass = 0; pass < FIT_PASSES_PER_STEP; pass += 1) {
      let changed = false
      for (const key of keys) {
        const current = boxes[part]
        if (!current) fail(`${target.character}/${part} 박스 소실`)
        const currentCollision = collision(target, boxes, jamos)
        const collisionFloor = options.minimumGap ?? (currentCollision.gap < PRESET_COMPOSITION_MINIMUM_GAP ? currentCollision.gap : Number.NEGATIVE_INFINITY)
        let best = current
        let bestScore = mode === 'collision'
          ? collisionPenalty(currentCollision.gap)
          : dataScore(target, boxes, partObservations, jamos)
            + REGULARIZATION_WEIGHT * (current[key] - start[key]) ** 2
            + collisionPenalty(currentCollision.gap)
        for (const direction of [-1, 1] as const) {
          const trial = { ...current, [key]: snap(current[key] + direction * step) }
          if (!validBox(trial)) continue
          boxes[part] = trial
          const trialCollision = collision(target, boxes, jamos)
          if (trialCollision.gap + EPSILON < collisionFloor) {
            boxes[part] = current
            continue
          }
          const score = mode === 'collision'
            ? collisionPenalty(trialCollision.gap)
            : dataScore(target, boxes, partObservations, jamos)
              + REGULARIZATION_WEIGHT * (trial[key] - start[key]) ** 2
              + collisionPenalty(trialCollision.gap)
          if (score < bestScore - EPSILON) {
            best = trial
            bestScore = score
            boxes[part] = best
          }
          boxes[part] = current
        }
        boxes[part] = best
        if (best !== current) changed = true
      }
      if (!changed) break
    }
  }
}

function collision(
  target: PresetCompositionTarget,
  boxes: Partial<Record<Part, BoxConfig>>,
  jamos: PresetCandidateJamoMaps,
): PresetCompositionFitResult['collision'] {
  const primitives = resolveCandidate(target, boxes, jamos).primitives
  const initial = partBounds(primitives, 'CH') ?? fail(`${target.character} 초성 잉크 없음`)
  const gapResult = target.structure === 'right'
    ? { axis: 'x' as const, gap: (partBounds(primitives, 'JU') ?? fail(`${target.character} 홀자 잉크 없음`)).minX - initial.maxX }
    : target.structure === 'bottom'
      ? { axis: 'y' as const, gap: (partBounds(primitives, 'JU') ?? fail(`${target.character} 홀자 잉크 없음`)).minY - initial.maxY }
      : (() => {
          const horizontal = partBounds(primitives, 'JU_H') ?? fail(`${target.character} 혼합 홀자 가로부 잉크 없음`)
          const vertical = partBounds(primitives, 'JU_V') ?? fail(`${target.character} 혼합 홀자 세로부 잉크 없음`)
          const verticalGap = horizontal.minY - initial.maxY
          const horizontalGap = vertical.minX - initial.maxX
          return verticalGap <= horizontalGap
            ? { axis: 'y' as const, gap: verticalGap }
            : { axis: 'x' as const, gap: horizontalGap }
        })()
  return {
    ...gapResult,
    safe: gapResult.gap + EPSILON >= PRESET_COMPOSITION_MINIMUM_GAP,
    minimumGap: PRESET_COMPOSITION_MINIMUM_GAP,
  }
}

function rmseUnits(score: number): number {
  return Math.sqrt(Math.max(0, score)) * 1000
}

export function fitPresetCompositionNoFinal(input: {
  target: PresetCompositionTarget
  baseSchema: LayoutSchema
  jamos: PresetCandidateJamoMaps
}): PresetCompositionFitResult {
  const { target, baseSchema, jamos } = input
  if (target.finalJamo !== null || target.gate !== 'ready-for-layout-fit') {
    fail(`${target.character} 무받침 layout fit 대상 아님`)
  }
  const syllable = decomposeSyllable(target.character, jamos.choseong, jamos.jungseong, jamos.jongseong)
  if (syllable.layoutType !== baseSchema.id) fail(`${target.character} 레이아웃 불일치`)
  const boxes = cloneBoxes(calculateBoxes(baseSchema, {
    cho: target.initialJamo,
    jung: target.medialJamo,
    jong: '',
  }))
  const observations = [...initialObservations(target), ...medialObservations(target)]
  const currentScore = dataScore(target, boxes, observations, jamos)
  for (const part of ['CH', 'JU', 'JU_H', 'JU_V'] as const) {
    optimizePart(target, boxes, part, observations, jamos)
  }
  let candidateCollision = collision(target, boxes, jamos)
  if (!candidateCollision.safe) {
    const collisionParts = target.structure === 'mixed'
      ? ['CH', 'JU_H', 'JU_V'] as const
      : ['CH', 'JU'] as const
    for (let pass = 0; pass < 2; pass += 1) {
      if (candidateCollision.safe) break
      for (const part of collisionParts) {
        optimizePart(target, boxes, part, [], jamos, { mode: 'collision' })
      }
      candidateCollision = collision(target, boxes, jamos)
    }
  }
  if (candidateCollision.safe) {
    const minimumCollisionGap = candidateCollision.gap
    for (const part of ['CH', 'JU', 'JU_H', 'JU_V'] as const) {
      optimizePart(target, boxes, part, observations, jamos, { minimumGap: minimumCollisionGap })
    }
  }
  for (const [part, box] of Object.entries(boxes)) {
    boxes[part as Part] = {
      x: snap(box.x), y: snap(box.y), width: snap(box.width), height: snap(box.height),
    }
  }
  const candidateScore = dataScore(target, boxes, observations, jamos)
  const currentRmse = rmseUnits(currentScore)
  const candidateRmse = rmseUnits(candidateScore)
  candidateCollision = collision(target, boxes, jamos)
  const improved = candidateRmse < currentRmse - EPSILON
  return {
    fitterVersion: PRESET_COMPOSITION_FITTER_VERSION,
    character: target.character,
    layoutType: target.structure,
    boxes,
    status: !improved ? 'blocked-no-improvement' : candidateCollision.safe ? 'ready-user-review' : 'blocked-collision',
    productionEligible: false,
    currentRmse,
    candidateRmse,
    improvement: currentRmse - candidateRmse,
    collision: candidateCollision,
  }
}
