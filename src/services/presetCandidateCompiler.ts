import type { LegacyCalibrationLayoutProfileV1 } from '../data/legacyCalibrationLayoutProfileV1'
import { CHOSEONG_LIST, JUNGSEONG_LIST } from '../data/Hangul'
import type {
  BoxConfig,
  JamoData,
  LayoutOverride,
  LayoutSchema,
  LayoutType,
  Part,
  PartOverride,
  ResolvedCenterlinePrimitive,
  StrokeDataV2,
} from '../types'
import { decomposeSyllable } from '../utils/hangulUtils'
import { getStrokeCenterlineBounds } from '../utils/jamoGeometry'
import { resolveGlyphInkPrimitives } from './glyphInkResolver'
import type {
  PresetSourceCase,
  PresetSourceElement,
  PresetSourceManifest,
} from '../../src-next/presetCandidateSource'

export const PRESET_CANDIDATE_COMPILER_VERSION = 'layout-role-fit-v3'
export const PRESET_CANDIDATE_GRID = 0.005

export const PRESET_CANDIDATE_LAYOUT_TYPES = [
  'choseong-jungseong-vertical',
  'choseong-jungseong-horizontal',
  'choseong-jungseong-mixed',
  'choseong-jungseong-vertical-jongseong',
  'choseong-jungseong-horizontal-jongseong',
  'choseong-jungseong-mixed-jongseong',
] as const satisfies readonly LayoutType[]

export const PRESET_CANDIDATE_FROZEN_LAYOUT_TYPES = [
  'choseong-only',
  'jungseong-vertical-only',
  'jungseong-horizontal-only',
  'jungseong-mixed-only',
] as const satisfies readonly LayoutType[]

type CandidateLayoutType = (typeof PRESET_CANDIDATE_LAYOUT_TYPES)[number]
type ObservationAxis = 'x' | 'y'
type OverrideSide = keyof PartOverride
type SourceElementId = PresetSourceElement['elementId']

const OVERRIDE_SIDES = ['top', 'bottom', 'left', 'right'] as const satisfies readonly OverrideSide[]
const X_SIDES = ['left', 'right'] as const satisfies readonly OverrideSide[]
const Y_SIDES = ['top', 'bottom'] as const satisfies readonly OverrideSide[]
const SEARCH_RADIUS_TICKS = 50
const MIN_OVERRIDE_TICK = -80
const MAX_OVERRIDE_TICK = 100
const COMMON_PASSES = 3
const PER_JUNGSEONG_PASSES = 3
const PER_JUNGSEONG_THRESHOLD_UNITS = 8
const REGULARIZATION_WEIGHT = 0.002
const EPSILON = 1e-9

export interface PresetCandidateJamoMaps {
  choseong: Record<string, JamoData>
  jungseong: Record<string, JamoData>
  jongseong: Record<string, JamoData>
}

interface LegacyGuideContext {
  id: string
  guideOrder: readonly string[]
}

export type PresetCandidateCompilerSource = Pick<
  PresetSourceManifest,
  'id' | 'inputDigest' | 'productionEligible' | 'cases'
> & {
  legacyConsonants: {
    sourceId: string
    sourceClass: 'provisional-legacy'
    reviewStatus: 'provisional'
    initialJamos: readonly string[]
    contextOrder: readonly LegacyGuideContext[]
    values: Readonly<Record<string, readonly (readonly number[])[]>>
  }
}

export interface PresetMedialRoleBinding {
  part: 'JU' | 'JU_H' | 'JU_V'
  strokeId: string
}

export const PRESET_MEDIAL_ROLE_BINDINGS: Readonly<Record<string, Readonly<Partial<Record<SourceElementId, PresetMedialRoleBinding>>>>> = {
  'ㅏ': { outerPillar: { part: 'JU', strokeId: 'ㅏ-1' }, primaryBeam: { part: 'JU', strokeId: 'ㅏ-2' } },
  'ㅐ': {
    innerPillar: { part: 'JU', strokeId: 'ㅐ-1' },
    outerPillar: { part: 'JU', strokeId: 'ㅐ-3' },
    primaryBeam: { part: 'JU', strokeId: 'ㅐ-2' },
  },
  'ㅑ': {
    outerPillar: { part: 'JU', strokeId: 'ㅑ-1' },
    upperBeam: { part: 'JU', strokeId: 'ㅑ-2' },
    lowerBeam: { part: 'JU', strokeId: 'ㅑ-3' },
  },
  'ㅒ': {
    innerPillar: { part: 'JU', strokeId: 'ㅒ-1' },
    outerPillar: { part: 'JU', strokeId: 'ㅒ-4' },
    upperBeam: { part: 'JU', strokeId: 'ㅒ-2' },
    lowerBeam: { part: 'JU', strokeId: 'ㅒ-3' },
  },
  'ㅓ': { outerPillar: { part: 'JU', strokeId: 'ㅓ-1' }, primaryBeam: { part: 'JU', strokeId: 'ㅓ-2' } },
  'ㅔ': {
    innerPillar: { part: 'JU', strokeId: 'ㅔ-1' },
    outerPillar: { part: 'JU', strokeId: 'ㅔ-3' },
    primaryBeam: { part: 'JU', strokeId: 'ㅔ-2' },
  },
  'ㅕ': {
    outerPillar: { part: 'JU', strokeId: 'ㅕ-1' },
    upperBeam: { part: 'JU', strokeId: 'ㅕ-2' },
    lowerBeam: { part: 'JU', strokeId: 'ㅕ-3' },
  },
  'ㅖ': {
    innerPillar: { part: 'JU', strokeId: 'ㅖ-1' },
    outerPillar: { part: 'JU', strokeId: 'ㅖ-4' },
    upperBeam: { part: 'JU', strokeId: 'ㅖ-2' },
    lowerBeam: { part: 'JU', strokeId: 'ㅖ-3' },
  },
  'ㅗ': {
    baseStem: { part: 'JU', strokeId: 'ㅗ-1' },
    primaryBeam: { part: 'JU', strokeId: 'ㅗ-2' },
  },
  'ㅘ': {
    baseStem: { part: 'JU_H', strokeId: 'ㅘ-1' },
    lowerBeam: { part: 'JU_H', strokeId: 'ㅘ-2' },
    outerPillar: { part: 'JU_V', strokeId: 'ㅘ-3' },
    upperBeam: { part: 'JU_V', strokeId: 'ㅘ-4' },
  },
  'ㅙ': {
    baseStem: { part: 'JU_H', strokeId: 'ㅙ-1' },
    lowerBeam: { part: 'JU_H', strokeId: 'ㅙ-2' },
    innerPillar: { part: 'JU_V', strokeId: 'ㅙ-3' },
    outerPillar: { part: 'JU_V', strokeId: 'ㅙ-5' },
    upperBeam: { part: 'JU_V', strokeId: 'ㅙ-4' },
  },
  'ㅚ': {
    baseStem: { part: 'JU_H', strokeId: 'ㅚ-1' },
    primaryBeam: { part: 'JU_H', strokeId: 'ㅚ-2' },
    outerPillar: { part: 'JU_V', strokeId: 'ㅚ-3' },
  },
  'ㅛ': {
    leftStem: { part: 'JU', strokeId: 'ㅛ-1' },
    rightStem: { part: 'JU', strokeId: 'ㅛ-2' },
    primaryBeam: { part: 'JU', strokeId: 'ㅛ-3' },
  },
  'ㅜ': {
    baseStem: { part: 'JU', strokeId: 'ㅜ-2' },
    primaryBeam: { part: 'JU', strokeId: 'ㅜ-1' },
  },
  'ㅝ': {
    upperBeam: { part: 'JU_H', strokeId: 'ㅝ-1' },
    baseStem: { part: 'JU_H', strokeId: 'ㅝ-2' },
    outerPillar: { part: 'JU_V', strokeId: 'ㅝ-3' },
    lowerBeam: { part: 'JU_V', strokeId: 'ㅝ-4' },
  },
  'ㅞ': {
    upperBeam: { part: 'JU_H', strokeId: 'ㅞ-1' },
    baseStem: { part: 'JU_H', strokeId: 'ㅞ-2' },
    innerPillar: { part: 'JU_V', strokeId: 'ㅞ-3' },
    outerPillar: { part: 'JU_V', strokeId: 'ㅞ-5' },
    lowerBeam: { part: 'JU_V', strokeId: 'ㅞ-4' },
  },
  'ㅟ': {
    primaryBeam: { part: 'JU_H', strokeId: 'ㅟ-1' },
    baseStem: { part: 'JU_H', strokeId: 'ㅟ-2' },
    outerPillar: { part: 'JU_V', strokeId: 'ㅟ-3' },
  },
  'ㅠ': {
    leftStem: { part: 'JU', strokeId: 'ㅠ-2' },
    rightStem: { part: 'JU', strokeId: 'ㅠ-3' },
    primaryBeam: { part: 'JU', strokeId: 'ㅠ-1' },
  },
  'ㅡ': { primaryBeam: { part: 'JU', strokeId: 'ㅡ-1' } },
  'ㅢ': {
    primaryBeam: { part: 'JU_H', strokeId: 'ㅢ-1' },
    outerPillar: { part: 'JU_V', strokeId: 'ㅢ-2' },
  },
  'ㅣ': { outerPillar: { part: 'JU', strokeId: 'ㅣ-1' } },
}

const LEGACY_CONTEXT_LAYOUTS: Readonly<Record<string, CandidateLayoutType>> = {
  'initial-horizontal': 'choseong-jungseong-vertical',
  'initial-horizontal-final': 'choseong-jungseong-vertical-jongseong',
  'initial-mixed': 'choseong-jungseong-mixed',
  'initial-mixed-final': 'choseong-jungseong-mixed-jongseong',
  'initial-vertical': 'choseong-jungseong-horizontal',
  'initial-vertical-final': 'choseong-jungseong-horizontal-jongseong',
}

const LEGACY_CONTEXT_SYLLABLES: Readonly<Record<string, { medialJamo: string; finalJamo: null | 'ㄱ' }>> = {
  'initial-horizontal': { medialJamo: 'ㅏ', finalJamo: null },
  'initial-horizontal-final': { medialJamo: 'ㅏ', finalJamo: 'ㄱ' },
  'initial-mixed': { medialJamo: 'ㅘ', finalJamo: null },
  'initial-mixed-final': { medialJamo: 'ㅘ', finalJamo: 'ㄱ' },
  'initial-vertical': { medialJamo: 'ㅗ', finalJamo: null },
  'initial-vertical-final': { medialJamo: 'ㅗ', finalJamo: 'ㄱ' },
}

type RoleObservationKind = 'face' | 'span-start' | 'span-end' | 'anchor-x' | 'anchor-y'

interface PreparedRoleObservation {
  elementId: SourceElementId
  part: PresetMedialRoleBinding['part']
  strokeId: string
  kind: RoleObservationKind
  axis: ObservationAxis
  target: number
  weight: number
  referenceMode: 'axis-aligned-face' | 'start-side-local-tangent'
  orientation: PresetSourceElement['orientation']
  faceSide: PresetSourceElement['faceSide']
  referenceSide?: 'left' | 'right'
}

interface PreparedCase {
  source: PresetSourceCase
  layoutType: CandidateLayoutType
  observations: PreparedRoleObservation[]
}

interface PreparedLegacyObservation {
  character: string
  initialJamo: string
  contextId: string
  layoutType: CandidateLayoutType
  part: 'CH' | 'JO'
  kind: 'component-top' | 'component-bottom'
  axis: 'y'
  target: number
  weight: number
}

export interface PresetRoleObservationComparison {
  elementId: SourceElementId
  part: PresetMedialRoleBinding['part']
  kind: RoleObservationKind
  referenceMode: 'axis-aligned-face' | 'start-side-local-tangent'
  target: number
  current: number
  candidate: number
  currentError: number
  candidateError: number
}

export interface PresetCandidateCaseComparison {
  character: string
  medialJamo: string
  finalJamo: null | 'ㄱ'
  layoutType: CandidateLayoutType
  sourceClass: PresetSourceCase['sourceClass']
  observationCount: number
  currentRmse: number
  candidateRmse: number
  improvement: number
  observations: PresetRoleObservationComparison[]
}

export interface PresetLegacyLayoutComparison {
  character: string
  initialJamo: string
  contextId: string
  layoutType: CandidateLayoutType
  guide: 'initialTop' | 'initialBottom' | 'finalTop' | 'finalBottom'
  target: number
  current: number
  candidate: number
  currentError: number
  candidateError: number
}

export interface PresetLayoutNumericDiff {
  layoutType: CandidateLayoutType
  path: string
  current: number
  candidate: number
  delta: number
}

export interface PresetCandidateCompilation {
  compilerVersion: typeof PRESET_CANDIDATE_COMPILER_VERSION
  grid: typeof PRESET_CANDIDATE_GRID
  layoutSchemas: Record<LayoutType, LayoutSchema>
  changedLayoutTypes: readonly CandidateLayoutType[]
  frozenLayoutTypes: readonly (typeof PRESET_CANDIDATE_FROZEN_LAYOUT_TYPES)[number][]
  invariants: {
    productionEligible: false
    jamoMutationCount: 0
    globalStyleMutationCount: number
    frozenLayoutMutationCount: 0
    userPartOverrideCount: 0
    legacyConsonantOverrideCount: number
    invalidBoxCount: number
    offGridParameterCount: number
    localTangentShapeMutationCount: 0
  }
  comparison: {
    roleObservationCount: number
    legacyConsonantObservationCount: number
    currentRmse: number
    candidateRmse: number
    improvement: number
    regressionCharacters: string[]
    legacyCurrentRmse: number
    legacyCandidateRmse: number
    legacyImprovement: number
    legacyRegressionCharacters: string[]
    cases: PresetCandidateCaseComparison[]
    legacy: PresetLegacyLayoutComparison[]
  }
  layoutDiffs: PresetLayoutNumericDiff[]
}

function fail(message: string): never {
  throw new Error(`기본 고딕 r1 컴파일 실패: ${message}`)
}

function finite(value: unknown, location: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(`${location} 값이 유한수가 아님`)
  return value
}

function round(value: number, digits = 3): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}

function snap(value: number): number {
  return Math.round(value / PRESET_CANDIDATE_GRID) * PRESET_CANDIDATE_GRID
}

function normalizeOverride(value?: Partial<PartOverride>): PartOverride {
  return {
    top: value?.top ?? 0,
    bottom: value?.bottom ?? 0,
    left: value?.left ?? 0,
    right: value?.right ?? 0,
  }
}

function addOverrides(first?: Partial<PartOverride>, second?: Partial<PartOverride>): PartOverride {
  const left = normalizeOverride(first)
  const right = normalizeOverride(second)
  return {
    top: left.top + right.top,
    bottom: left.bottom + right.bottom,
    left: left.left + right.left,
    right: left.right + right.right,
  }
}

function snapOverride(value: Partial<PartOverride>): PartOverride {
  const normalized = normalizeOverride(value)
  return Object.fromEntries(
    OVERRIDE_SIDES.map((side) => [side, snap(normalized[side])]),
  ) as unknown as PartOverride
}

function snapSchemaParameters(schema: LayoutSchema): LayoutSchema {
  const result = structuredClone(schema)
  if (result.padding) {
    result.padding = Object.fromEntries(
      Object.entries(result.padding).map(([side, value]) => [side, snap(value)]),
    ) as unknown as LayoutSchema['padding']
  }
  if (result.designBodyPadding) {
    result.designBodyPadding = Object.fromEntries(
      Object.entries(result.designBodyPadding).map(([side, value]) => [side, snap(value)]),
    ) as unknown as LayoutSchema['designBodyPadding']
  }
  if (result.splits) result.splits = result.splits.map((split) => ({ ...split, value: snap(split.value) }))
  if (result.gaps) {
    result.gaps = result.gaps.map((gap) => ({
      ...gap,
      size: snap(gap.size),
      ...(gap.beforeInset === undefined ? {} : { beforeInset: snap(gap.beforeInset) }),
      ...(gap.afterInset === undefined ? {} : { afterInset: snap(gap.afterInset) }),
    }))
  }
  if (result.partOverrides) {
    result.partOverrides = Object.fromEntries(
      Object.entries(result.partOverrides).map(([part, value]) => [part, snapOverride(value)]),
    )
  }
  if (result.partOverridesByJungseong) {
    result.partOverridesByJungseong = Object.fromEntries(
      Object.entries(result.partOverridesByJungseong).map(([jungseong, overrides]) => [
        jungseong,
        Object.fromEntries(Object.entries(overrides).map(([part, value]) => [part, snapOverride(value)])),
      ]),
    )
  }
  if (result.overrides) {
    result.overrides = result.overrides.map((override) => ({
      ...override,
      partOverrides: Object.fromEntries(
        Object.entries(override.partOverrides).map(([part, value]) => [part, snapOverride(value)]),
      ),
    }))
  }
  delete result.userPartOverrides
  return result
}

export function createCurrentPresetSchemas(
  baseSchemas: Readonly<Record<LayoutType, LayoutSchema>>,
  legacyProfile: LegacyCalibrationLayoutProfileV1,
): Record<LayoutType, LayoutSchema> {
  return Object.fromEntries(Object.entries(baseSchemas).map(([layoutType, baseSchema]) => {
    const typedLayout = layoutType as LayoutType
    const profile = legacyProfile[typedLayout]
    const schema = structuredClone(baseSchema)
    return [typedLayout, profile ? { ...schema, userPartOverrides: structuredClone(profile) } : schema]
  })) as Record<LayoutType, LayoutSchema>
}

export function createPresetCandidateSeedSchemas(
  baseSchemas: Readonly<Record<LayoutType, LayoutSchema>>,
  legacyProfile: LegacyCalibrationLayoutProfileV1,
): Record<LayoutType, LayoutSchema> {
  const result = structuredClone(baseSchemas) as Record<LayoutType, LayoutSchema>
  for (const layoutType of PRESET_CANDIDATE_LAYOUT_TYPES) {
    const schema = result[layoutType]
    const user = legacyProfile[layoutType]
    const parts = new Set<Part>([
      ...Object.keys(schema.partOverrides ?? {}) as Part[],
      ...Object.keys(user ?? {}) as Part[],
    ])
    schema.partOverrides = Object.fromEntries([...parts].map((part) => [
      part,
      addOverrides(schema.partOverrides?.[part], user?.[part]),
    ]))

    if (schema.partOverridesByJungseong) {
      schema.partOverridesByJungseong = Object.fromEntries(
        Object.entries(schema.partOverridesByJungseong).map(([jungseong, overrides]) => [
          jungseong,
          Object.fromEntries(Object.entries(overrides).map(([part, value]) => [
            part,
            addOverrides(value, user?.[part as Part]),
          ])),
        ]),
      )
    }
    delete schema.userPartOverrides
    result[layoutType] = snapSchemaParameters(schema)
  }
  return result
}

function candidateLayoutType(layoutType: LayoutType, location: string): CandidateLayoutType {
  if (!PRESET_CANDIDATE_LAYOUT_TYPES.includes(layoutType as CandidateLayoutType)) {
    fail(`${location} 레이아웃 ${layoutType}은 G2 범위가 아님`)
  }
  return layoutType as CandidateLayoutType
}

function bindingFor(candidateCase: PresetSourceCase, element: PresetSourceElement): PresetMedialRoleBinding {
  const binding = PRESET_MEDIAL_ROLE_BINDINGS[candidateCase.medialJamo]?.[element.elementId]
  if (!binding) fail(`${candidateCase.character}/${element.elementId} 현재 자모 획 결속이 없음`)
  return binding
}

function evidenceAnchor(element: PresetSourceElement): { x: number; y: number } | null {
  if (element.face.status !== 'candidate') return null
  if (element.face.anchor) return element.face.anchor
  const anchor = element.face.evidence?.anchor
  if (!anchor || typeof anchor !== 'object' || Array.isArray(anchor)) return null
  const record = anchor as Record<string, unknown>
  return {
    x: finite(record.x, `${element.elementId}.evidence.anchor.x`),
    y: finite(record.y, `${element.elementId}.evidence.anchor.y`),
  }
}

function referenceSide(element: PresetSourceElement): 'left' | 'right' | undefined {
  if (element.face.status !== 'candidate') return undefined
  if (element.face.referenceSide) return element.face.referenceSide
  const side = element.face.evidence?.referenceSide
  return side === 'left' || side === 'right' ? side : undefined
}

function prepareRoleObservations(candidateCase: PresetSourceCase): PreparedRoleObservation[] {
  const sourceMultiplier = candidateCase.sourceClass === 'approved-analysis' ? 1 : 0.8
  return candidateCase.elements.flatMap((element): PreparedRoleObservation[] => {
    if (element.face.status !== 'candidate') return []
    const binding = bindingFor(candidateCase, element)
    const common = {
      elementId: element.elementId,
      part: binding.part,
      strokeId: binding.strokeId,
      referenceMode: element.face.referenceMode,
      orientation: element.orientation,
      faceSide: element.faceSide,
      referenceSide: referenceSide(element),
    } as const

    if (element.face.referenceMode === 'start-side-local-tangent') {
      const anchor = evidenceAnchor(element)
      if (!anchor) fail(`${candidateCase.character}/${element.elementId} 국소 접선 anchor가 없음`)
      return [
        { ...common, kind: 'anchor-x', axis: 'x', target: anchor.x / 1000, weight: sourceMultiplier },
        { ...common, kind: 'anchor-y', axis: 'y', target: anchor.y / 1000, weight: sourceMultiplier },
      ]
    }

    const observations: PreparedRoleObservation[] = [{
      ...common,
      kind: 'face',
      axis: element.orientation === 'vertical' ? 'x' : 'y',
      target: element.face.value / 1000,
      weight: sourceMultiplier,
    }]
    const spans = element.componentSpans ?? []
    if (spans.length > 0) {
      const from = Math.min(...spans.map((span) => span.from))
      const to = Math.max(...spans.map((span) => span.to))
      const axis = element.orientation === 'vertical' ? 'y' : 'x'
      observations.push(
        { ...common, kind: 'span-start', axis, target: from / 1000, weight: sourceMultiplier * 0.3 },
        { ...common, kind: 'span-end', axis, target: to / 1000, weight: sourceMultiplier * 0.3 },
      )
    }
    return observations
  })
}

function prepareCases(source: PresetCandidateCompilerSource, jamos: PresetCandidateJamoMaps): PreparedCase[] {
  return source.cases.map((candidateCase) => {
    const syllable = decomposeSyllable(
      candidateCase.character,
      jamos.choseong,
      jamos.jungseong,
      jamos.jongseong,
    )
    return {
      source: candidateCase,
      layoutType: candidateLayoutType(syllable.layoutType, candidateCase.character),
      observations: prepareRoleObservations(candidateCase),
    }
  })
}

function composeLegacyCharacter(initialJamo: string, contextId: string): string {
  const initialIndex = (CHOSEONG_LIST as readonly string[]).indexOf(initialJamo)
  const syllable = LEGACY_CONTEXT_SYLLABLES[contextId]
  const medialIndex = syllable ? (JUNGSEONG_LIST as readonly string[]).indexOf(syllable.medialJamo) : -1
  if (initialIndex < 0 || !syllable || medialIndex < 0) fail(`${initialJamo}/${contextId} 레거시 음절을 조합할 수 없음`)
  return String.fromCodePoint(0xac00 + initialIndex * 21 * 28 + medialIndex * 28 + (syllable.finalJamo ? 1 : 0))
}

function prepareLegacyObservations(source: PresetCandidateCompilerSource): PreparedLegacyObservation[] {
  if (JSON.stringify(source.legacyConsonants.initialJamos) !== JSON.stringify(CHOSEONG_LIST)) {
    fail('레거시 초성 19자 순서가 다름')
  }
  return source.legacyConsonants.initialJamos.flatMap((initialJamo) => {
    const rows = source.legacyConsonants.values[initialJamo]
    if (!rows || rows.length !== source.legacyConsonants.contextOrder.length) {
      fail(`${initialJamo} 레거시 문맥과 값 개수가 다름`)
    }
    return source.legacyConsonants.contextOrder.flatMap((context, contextIndex) => {
      const layoutType = LEGACY_CONTEXT_LAYOUTS[context.id]
      if (!layoutType) fail(`지원하지 않는 레거시 문맥 ${context.id}`)
      const character = composeLegacyCharacter(initialJamo, context.id)
      const values = rows[contextIndex]
      if (values.length !== context.guideOrder.length) fail(`${initialJamo}/${context.id} guide/value 개수가 다름`)
      return context.guideOrder.flatMap((guide, guideIndex): PreparedLegacyObservation[] => {
        const common = { character, initialJamo, contextId: context.id, layoutType, axis: 'y' as const, weight: 0.6 }
        const target = finite(values[guideIndex], `${initialJamo}.${context.id}.${guide}`) / 1000
        if (guide === 'initialTop') return [{ ...common, part: 'CH', kind: 'component-top', target }]
        if (guide === 'initialBottom') return [{ ...common, part: 'CH', kind: 'component-bottom', target }]
        if (guide === 'finalTop') return [{ ...common, part: 'JO', kind: 'component-top', target }]
        if (guide === 'finalBottom') return [{ ...common, part: 'JO', kind: 'component-bottom', target }]
        return []
      })
    })
  })
}

function resolveCharacter(character: string, schema: LayoutSchema, jamos: PresetCandidateJamoMaps) {
  const syllable = decomposeSyllable(
    character,
    jamos.choseong,
    jamos.jungseong,
    jamos.jongseong,
  )
  return resolveGlyphInkPrimitives({
    syllable,
    placement: { kind: 'schema', schema },
    weightMultiplier: 1,
    globalLinecap: 'round',
    globalLinejoin: 'round',
  })
}

function resolveCase(prepared: PreparedCase, schema: LayoutSchema, jamos: PresetCandidateJamoMaps) {
  return resolveCharacter(prepared.source.character, schema, jamos)
}

function validBox(box: BoxConfig): boolean {
  return [box.x, box.y, box.width, box.height].every(Number.isFinite)
    && box.x >= -EPSILON
    && box.y >= -EPSILON
    && box.width > EPSILON
    && box.height > EPSILON
    && box.x + box.width <= 1 + EPSILON
    && box.y + box.height <= 1 + EPSILON
}

function primitiveBounds(primitive: ResolvedCenterlinePrimitive): {
  minX: number
  maxX: number
  minY: number
  maxY: number
} {
  const local = getStrokeCenterlineBounds([primitive.stroke as unknown as StrokeDataV2])
  if (!local) fail(`${primitive.id} 중심선 경계를 계산할 수 없음`)
  return {
    minX: primitive.box.x + local.minX * primitive.box.width,
    maxX: primitive.box.x + local.maxX * primitive.box.width,
    minY: primitive.box.y + local.minY * primitive.box.height,
    maxY: primitive.box.y + local.maxY * primitive.box.height,
  }
}

function findPrimitive(
  primitives: readonly ResolvedCenterlinePrimitive[],
  observation: PreparedRoleObservation,
  character: string,
): ResolvedCenterlinePrimitive {
  const primitive = primitives.find((item) => (
    item.source.kind === 'stroke'
    && item.source.part === observation.part
    && item.source.strokeId === observation.strokeId
  ))
  if (!primitive) fail(`${character}/${observation.elementId} 현재 획 ${observation.strokeId}을 찾지 못함`)
  return primitive
}

function faceOffset(primitive: ResolvedCenterlinePrimitive, faceSide: PresetSourceElement['faceSide']): number {
  const halfThickness = primitive.stroke.thickness * primitive.weightMultiplier / 2
  return faceSide === 'left' || faceSide === 'top' ? -halfThickness : halfThickness
}

function tangentPoint(primitive: ResolvedCenterlinePrimitive, side: 'left' | 'right' | undefined) {
  const points = primitive.stroke.points
  if (points.length === 0) fail(`${primitive.id} 국소 접선 점이 없음`)
  const direction = side === 'right' ? -1 : 1
  return points.reduce((selected, point) => (
    (point.x - selected.x) * direction < 0 ? point : selected
  ))
}

function measureRoleObservation(
  observation: PreparedRoleObservation,
  primitive: ResolvedCenterlinePrimitive,
): number {
  const bounds = primitiveBounds(primitive)
  if (observation.kind === 'face') {
    if (observation.faceSide === 'left') return bounds.minX + faceOffset(primitive, 'left')
    if (observation.faceSide === 'right') return bounds.maxX + faceOffset(primitive, 'right')
    if (observation.faceSide === 'top') return bounds.minY + faceOffset(primitive, 'top')
    return bounds.maxY + faceOffset(primitive, 'bottom')
  }
  if (observation.kind === 'span-start') return observation.orientation === 'vertical' ? bounds.minY : bounds.minX
  if (observation.kind === 'span-end') return observation.orientation === 'vertical' ? bounds.maxY : bounds.maxX

  const point = tangentPoint(primitive, observation.referenceSide)
  if (observation.kind === 'anchor-x') return primitive.box.x + point.x * primitive.box.width
  return primitive.box.y + point.y * primitive.box.height + faceOffset(primitive, observation.faceSide)
}

interface MeasuredObservation {
  prepared: PreparedRoleObservation
  value: number
}

function measurePreparedCase(
  prepared: PreparedCase,
  schema: LayoutSchema,
  jamos: PresetCandidateJamoMaps,
): MeasuredObservation[] | null {
  const resolved = resolveCase(prepared, schema, jamos)
  if (Object.values(resolved.boxes).some((box) => box && !validBox(box))) return null
  const primitives = resolved.primitives
  return prepared.observations.map((observation) => ({
    prepared: observation,
    value: measureRoleObservation(
      observation,
      findPrimitive(primitives, observation, prepared.source.character),
    ),
  }))
}

function weightedScore(measured: readonly MeasuredObservation[]): { squared: number; weight: number } {
  return measured.reduce((result, observation) => {
    const error = observation.value - observation.prepared.target
    result.squared += error * error * observation.prepared.weight
    result.weight += observation.prepared.weight
    return result
  }, { squared: 0, weight: 0 })
}

function dataScoreForCases(
  cases: readonly PreparedCase[],
  schema: LayoutSchema,
  jamos: PresetCandidateJamoMaps,
): number {
  let squared = 0
  let weight = 0
  for (const prepared of cases) {
    const measured = measurePreparedCase(prepared, schema, jamos)
    if (!measured) return Number.POSITIVE_INFINITY
    const score = weightedScore(measured)
    squared += score.squared
    weight += score.weight
  }
  return weight > 0 ? squared / weight : 0
}

function componentVerticalBounds(
  character: string,
  schema: LayoutSchema,
  part: 'CH' | 'JO',
  jamos: PresetCandidateJamoMaps,
): { top: number; bottom: number } | null {
  const resolved = resolveCharacter(character, schema, jamos)
  if (Object.values(resolved.boxes).some((box) => box && !validBox(box))) return null
  const primitives = resolved.primitives.filter((primitive) => primitive.source.part === part)
  if (primitives.length === 0) return null
  return primitives.reduce((bounds, primitive) => {
    const centerline = primitiveBounds(primitive)
    const halfThickness = primitive.stroke.thickness * primitive.weightMultiplier / 2
    return {
      top: Math.min(bounds.top, centerline.minY - halfThickness),
      bottom: Math.max(bounds.bottom, centerline.maxY + halfThickness),
    }
  }, { top: Number.POSITIVE_INFINITY, bottom: Number.NEGATIVE_INFINITY })
}

function legacyScoreForLayout(
  observations: readonly PreparedLegacyObservation[],
  schema: LayoutSchema,
  jamos: PresetCandidateJamoMaps,
): number {
  let squared = 0
  let weight = 0
  for (const observation of observations) {
    const bounds = componentVerticalBounds(observation.character, schema, observation.part, jamos)
    if (!bounds) return Number.POSITIVE_INFINITY
    const value = observation.kind === 'component-top' ? bounds.top : bounds.bottom
    const error = value - observation.target
    squared += error * error * observation.weight
    weight += observation.weight
  }
  return weight > 0 ? squared / weight : 0
}

function layoutDataScore(
  cases: readonly PreparedCase[],
  legacy: readonly PreparedLegacyObservation[],
  schema: LayoutSchema,
  jamos: PresetCandidateJamoMaps,
): number {
  const caseScore = dataScoreForCases(cases, schema, jamos)
  if (!Number.isFinite(caseScore)) return caseScore
  if (legacy.length === 0) return caseScore
  const historical = legacyScoreForLayout(legacy, schema, jamos)
  if (!Number.isFinite(historical)) return historical
  return caseScore + historical
}

function sidesForAxis(axis: ObservationAxis): readonly OverrideSide[] {
  return axis === 'x' ? X_SIDES : Y_SIDES
}

function relevantSides(
  cases: readonly PreparedCase[],
  legacy: readonly PreparedLegacyObservation[],
  part: Part,
): OverrideSide[] {
  const axes = new Set<ObservationAxis>()
  for (const candidateCase of cases) {
    for (const observation of candidateCase.observations) {
      if (observation.part === part) axes.add(observation.axis)
    }
  }
  for (const observation of legacy) {
    if (observation.part === part) axes.add(observation.axis)
  }
  return [...axes].flatMap(sidesForAxis)
}

function commonOverride(schema: LayoutSchema, part: Part): PartOverride {
  return normalizeOverride(schema.partOverrides?.[part])
}

function setCommonOverride(schema: LayoutSchema, part: Part, value: PartOverride): void {
  schema.partOverrides = { ...schema.partOverrides, [part]: value }
}

function effectiveOverride(schema: LayoutSchema, jungseong: string, part: Part): PartOverride {
  return normalizeOverride(schema.partOverridesByJungseong?.[jungseong]?.[part] ?? schema.partOverrides?.[part])
}

function setJungseongOverride(
  schema: LayoutSchema,
  jungseong: string,
  part: Part,
  value: PartOverride,
): void {
  schema.partOverridesByJungseong = {
    ...schema.partOverridesByJungseong,
    [jungseong]: {
      ...schema.partOverridesByJungseong?.[jungseong],
      [part]: value,
    },
  }
}

function legacyOverrideId(layoutType: CandidateLayoutType, initialJamo: string): string {
  return `noto-legacy-${layoutType}-${initialJamo}`
}

function ensureLegacyOverride(schema: LayoutSchema, initialJamo: string): LayoutOverride {
  const layoutType = schema.id as CandidateLayoutType
  const id = legacyOverrideId(layoutType, initialJamo)
  const existing = schema.overrides?.find((override) => override.id === id)
  if (existing) return existing
  const created: LayoutOverride = {
    id,
    conditionGroups: [[{ type: 'choseongIs', jamo: initialJamo }]],
    partOverrides: {},
    priority: 1000,
    enabled: true,
  }
  schema.overrides = [...(schema.overrides ?? []), created]
  return created
}

function effectiveLegacyOverride(schema: LayoutSchema, initialJamo: string, part: Part): PartOverride {
  const override = ensureLegacyOverride(schema, initialJamo)
  return normalizeOverride(override.partOverrides[part] ?? schema.partOverrides?.[part])
}

function setLegacyOverride(
  schema: LayoutSchema,
  initialJamo: string,
  part: Part,
  value: PartOverride,
): void {
  const override = ensureLegacyOverride(schema, initialJamo)
  override.partOverrides = { ...override.partOverrides, [part]: value }
}

function searchTicks(reference: number): number[] {
  const referenceTick = Math.round(reference / PRESET_CANDIDATE_GRID)
  const minimum = Math.max(MIN_OVERRIDE_TICK, referenceTick - SEARCH_RADIUS_TICKS)
  const maximum = Math.min(MAX_OVERRIDE_TICK, referenceTick + SEARCH_RADIUS_TICKS)
  return Array.from({ length: maximum - minimum + 1 }, (_, index) => minimum + index)
}

function betterScore(
  score: number,
  value: number,
  bestScore: number,
  bestValue: number,
  reference: number,
): boolean {
  if (score < bestScore - EPSILON) return true
  if (Math.abs(score - bestScore) > EPSILON) return false
  const distance = Math.abs(value - reference)
  const bestDistance = Math.abs(bestValue - reference)
  return distance < bestDistance - EPSILON || (Math.abs(distance - bestDistance) <= EPSILON && value < bestValue)
}

function optimizeCommonLayout(
  schema: LayoutSchema,
  cases: readonly PreparedCase[],
  legacy: readonly PreparedLegacyObservation[],
  jamos: PresetCandidateJamoMaps,
): void {
  for (let pass = 0; pass < COMMON_PASSES; pass += 1) {
    for (const part of schema.slots) {
      const sides = relevantSides(cases, legacy, part)
      if (sides.length === 0) continue
      const reference = commonOverride(schema, part)
      for (const side of sides) {
        const current = commonOverride(schema, part)
        let bestValue = current[side]
        let bestScore = Number.POSITIVE_INFINITY
        for (const tick of searchTicks(reference[side])) {
          const value = tick * PRESET_CANDIDATE_GRID
          setCommonOverride(schema, part, { ...current, [side]: value })
          const score = layoutDataScore(cases, legacy, schema, jamos)
            + REGULARIZATION_WEIGHT * (value - reference[side]) ** 2
          if (betterScore(score, value, bestScore, bestValue, reference[side])) {
            bestScore = score
            bestValue = value
          }
        }
        setCommonOverride(schema, part, { ...current, [side]: bestValue })
      }
    }
  }
}

function rmseUnits(score: number): number {
  return Math.sqrt(Math.max(0, score)) * 1000
}

function optimizeJungseongCase(
  schema: LayoutSchema,
  prepared: PreparedCase,
  jamos: PresetCandidateJamoMaps,
): void {
  const initialScore = dataScoreForCases([prepared], schema, jamos)
  if (rmseUnits(initialScore) <= PER_JUNGSEONG_THRESHOLD_UNITS) return

  const trial = structuredClone(schema)
  const parts = [...new Set(prepared.observations.map(({ part }) => part))]
  for (const part of parts) {
    const sides = relevantSides([prepared], [], part)
    const reference = effectiveOverride(schema, prepared.source.medialJamo, part)
    setJungseongOverride(trial, prepared.source.medialJamo, part, reference)
    for (let pass = 0; pass < PER_JUNGSEONG_PASSES; pass += 1) {
      for (const side of sides) {
        const current = effectiveOverride(trial, prepared.source.medialJamo, part)
        let bestValue = current[side]
        let bestScore = Number.POSITIVE_INFINITY
        for (const tick of searchTicks(reference[side])) {
          const value = tick * PRESET_CANDIDATE_GRID
          setJungseongOverride(trial, prepared.source.medialJamo, part, { ...current, [side]: value })
          const score = dataScoreForCases([prepared], trial, jamos)
            + REGULARIZATION_WEIGHT * (value - reference[side]) ** 2
          if (betterScore(score, value, bestScore, bestValue, reference[side])) {
            bestScore = score
            bestValue = value
          }
        }
        setJungseongOverride(trial, prepared.source.medialJamo, part, { ...current, [side]: bestValue })
      }
    }
  }

  const trialScore = dataScoreForCases([prepared], trial, jamos)
  if (trialScore < initialScore - EPSILON) {
    schema.partOverridesByJungseong = trial.partOverridesByJungseong
  }
}

function optimizeLegacyConsonant(
  schema: LayoutSchema,
  observations: readonly PreparedLegacyObservation[],
  jamos: PresetCandidateJamoMaps,
): void {
  const initialJamo = observations[0]?.initialJamo
  if (!initialJamo) return
  for (const part of [...new Set(observations.map(({ part }) => part))]) {
    const reference = commonOverride(schema, part)
    setLegacyOverride(schema, initialJamo, part, reference)
    for (let pass = 0; pass < COMMON_PASSES; pass += 1) {
      for (const side of Y_SIDES) {
        const current = effectiveLegacyOverride(schema, initialJamo, part)
        let bestValue = current[side]
        let bestScore = Number.POSITIVE_INFINITY
        for (const tick of searchTicks(reference[side])) {
          const value = tick * PRESET_CANDIDATE_GRID
          setLegacyOverride(schema, initialJamo, part, { ...current, [side]: value })
          const score = legacyScoreForLayout(observations, schema, jamos)
            + REGULARIZATION_WEIGHT * (value - reference[side]) ** 2
          if (betterScore(score, value, bestScore, bestValue, reference[side])) {
            bestScore = score
            bestValue = value
          }
        }
        setLegacyOverride(schema, initialJamo, part, { ...current, [side]: bestValue })
      }
    }
  }
}

function compareCase(
  prepared: PreparedCase,
  currentSchema: LayoutSchema,
  candidateSchema: LayoutSchema,
  jamos: PresetCandidateJamoMaps,
): PresetCandidateCaseComparison {
  const current = measurePreparedCase(prepared, currentSchema, jamos)
  const candidate = measurePreparedCase(prepared, candidateSchema, jamos)
  if (!current || !candidate || current.length !== candidate.length) fail(`${prepared.source.character} 비교 측정 실패`)
  const comparisons = prepared.observations.map((observation, index): PresetRoleObservationComparison => {
    const currentValue = current[index].value * 1000
    const candidateValue = candidate[index].value * 1000
    const target = observation.target * 1000
    return {
      elementId: observation.elementId,
      part: observation.part,
      kind: observation.kind,
      referenceMode: observation.referenceMode,
      target: round(target),
      current: round(currentValue),
      candidate: round(candidateValue),
      currentError: round(Math.abs(currentValue - target)),
      candidateError: round(Math.abs(candidateValue - target)),
    }
  })
  const currentScore = weightedScore(current)
  const candidateScore = weightedScore(candidate)
  const currentRmse = Math.sqrt(currentScore.squared / currentScore.weight) * 1000
  const candidateRmse = Math.sqrt(candidateScore.squared / candidateScore.weight) * 1000
  return {
    character: prepared.source.character,
    medialJamo: prepared.source.medialJamo,
    finalJamo: prepared.source.finalJamo,
    layoutType: prepared.layoutType,
    sourceClass: prepared.source.sourceClass,
    observationCount: comparisons.length,
    currentRmse: round(currentRmse),
    candidateRmse: round(candidateRmse),
    improvement: round(currentRmse - candidateRmse),
    observations: comparisons,
  }
}

function legacyGuide(kind: PreparedLegacyObservation['kind'], part: PreparedLegacyObservation['part']): PresetLegacyLayoutComparison['guide'] {
  if (part === 'CH') return kind === 'component-top' ? 'initialTop' : 'initialBottom'
  return kind === 'component-top' ? 'finalTop' : 'finalBottom'
}

function compareLegacy(
  observation: PreparedLegacyObservation,
  currentSchema: LayoutSchema,
  candidateSchema: LayoutSchema,
  jamos: PresetCandidateJamoMaps,
): PresetLegacyLayoutComparison {
  const currentBounds = componentVerticalBounds(observation.character, currentSchema, observation.part, jamos)
  const candidateBounds = componentVerticalBounds(observation.character, candidateSchema, observation.part, jamos)
  if (!currentBounds || !candidateBounds) fail(`${observation.initialJamo}/${observation.contextId}/${observation.part} 레거시 비교 실패`)
  const current = (observation.kind === 'component-top' ? currentBounds.top : currentBounds.bottom) * 1000
  const candidate = (observation.kind === 'component-top' ? candidateBounds.top : candidateBounds.bottom) * 1000
  const target = observation.target * 1000
  return {
    character: observation.character,
    initialJamo: observation.initialJamo,
    contextId: observation.contextId,
    layoutType: observation.layoutType,
    guide: legacyGuide(observation.kind, observation.part),
    target: round(target),
    current: round(current),
    candidate: round(candidate),
    currentError: round(Math.abs(current - target)),
    candidateError: round(Math.abs(candidate - target)),
  }
}

function aggregateRmse(cases: readonly PresetCandidateCaseComparison[], key: 'currentError' | 'candidateError'): number {
  const errors = cases.flatMap(({ observations }) => observations.map((observation) => observation[key]))
  return errors.length > 0
    ? Math.sqrt(errors.reduce((sum, value) => sum + value * value, 0) / errors.length)
    : 0
}

function aggregateLegacyRmse(
  comparisons: readonly PresetLegacyLayoutComparison[],
  key: 'currentError' | 'candidateError',
): number {
  const errors = comparisons.map((comparison) => comparison[key])
  return errors.length > 0
    ? Math.sqrt(errors.reduce((sum, value) => sum + value * value, 0) / errors.length)
    : 0
}

function collectNumericValues(value: unknown, path = ''): Array<{ path: string; value: number }> {
  if (typeof value === 'number') return [{ path, value }]
  if (Array.isArray(value)) return value.flatMap((child, index) => collectNumericValues(child, `${path}[${index}]`))
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) => collectNumericValues(child, path ? `${path}.${key}` : key))
}

function schemaParameterValues(schema: LayoutSchema): Array<{ path: string; value: number }> {
  return [
    ...collectNumericValues(schema.padding, 'padding'),
    ...collectNumericValues(schema.designBodyPadding, 'designBodyPadding'),
    ...collectNumericValues(schema.splits?.map(({ value }) => value), 'splits'),
    ...collectNumericValues(schema.gaps?.map(({ size, beforeInset, afterInset }) => ({ size, beforeInset, afterInset })), 'gaps'),
    ...collectNumericValues(schema.partOverrides, 'partOverrides'),
    ...collectNumericValues(schema.partOverridesByJungseong, 'partOverridesByJungseong'),
    ...(schema.overrides ?? []).flatMap((override) => (
      collectNumericValues(override.partOverrides, `overrides.${override.id}`)
    )),
  ]
}

function collectLayoutDiffs(
  current: Readonly<Record<LayoutType, LayoutSchema>>,
  candidate: Readonly<Record<LayoutType, LayoutSchema>>,
): PresetLayoutNumericDiff[] {
  return PRESET_CANDIDATE_LAYOUT_TYPES.flatMap((layoutType) => {
    const currentSchema = current[layoutType]
    const candidateSchema = candidate[layoutType]
    const before = new Map(schemaParameterValues(currentSchema).map((entry) => [entry.path, entry.value]))
    const candidateValues = schemaParameterValues(candidateSchema)
    return candidateValues.flatMap(({ path, value }) => {
      let currentValue = before.get(path)
      const contextualMatch = /^partOverridesByJungseong\.([^.]+)\.([^.]+)\.([^.]+)$/u.exec(path)
      if (currentValue === undefined && contextualMatch) {
        const [, jungseong, rawPart, rawSide] = contextualMatch
        const part = rawPart as Part
        const side = rawSide as OverrideSide
        currentValue = currentSchema.partOverridesByJungseong?.[jungseong]?.[part]?.[side]
          ?? currentSchema.partOverrides?.[part]?.[side]
          ?? 0
      }
      const generatedOverrideMatch = /^overrides\.([^.]+)\.([^.]+)\.([^.]+)$/u.exec(path)
      if (currentValue === undefined && generatedOverrideMatch) {
        const [, overrideId, rawPart, rawSide] = generatedOverrideMatch
        const part = rawPart as Part
        const side = rawSide as OverrideSide
        currentValue = currentSchema.overrides?.find(({ id }) => id === overrideId)?.partOverrides[part]?.[side]
          ?? currentSchema.partOverrides?.[part]?.[side]
          ?? 0
      }
      if (currentValue === undefined || Math.abs(currentValue - value) <= EPSILON) return []
      return [{
        layoutType,
        path,
        current: round(currentValue, 6),
        candidate: round(value, 6),
        delta: round(value - currentValue, 6),
      }]
    })
  })
}

function countInvalidBoxes(
  cases: readonly PreparedCase[],
  schemas: Readonly<Record<LayoutType, LayoutSchema>>,
  jamos: PresetCandidateJamoMaps,
): number {
  return cases.reduce((count, prepared) => {
    const resolved = resolveCase(prepared, schemas[prepared.layoutType], jamos)
    return count + Object.values(resolved.boxes).filter((box) => box && !validBox(box)).length
  }, 0)
}

function countInvalidLegacyBoxes(
  observations: readonly PreparedLegacyObservation[],
  schemas: Readonly<Record<LayoutType, LayoutSchema>>,
  jamos: PresetCandidateJamoMaps,
): number {
  const characters = new Map(observations.map((observation) => [observation.character, observation.layoutType]))
  return [...characters].reduce((count, [character, layoutType]) => {
    const resolved = resolveCharacter(character, schemas[layoutType], jamos)
    return count + Object.values(resolved.boxes).filter((box) => box && !validBox(box)).length
  }, 0)
}

function countOffGridParameters(schemas: Readonly<Record<LayoutType, LayoutSchema>>): number {
  return PRESET_CANDIDATE_LAYOUT_TYPES.reduce((count, layoutType) => (
    count + schemaParameterValues(schemas[layoutType])
      .filter(({ value }) => Math.abs(value / PRESET_CANDIDATE_GRID - Math.round(value / PRESET_CANDIDATE_GRID)) > EPSILON)
      .length
  ), 0)
}

function countUserPartOverrides(schemas: Readonly<Record<LayoutType, LayoutSchema>>): number {
  return PRESET_CANDIDATE_LAYOUT_TYPES.filter((layoutType) => (
    Object.keys(schemas[layoutType].userPartOverrides ?? {}).length > 0
  )).length
}

function countLegacyConsonantOverrides(schemas: Readonly<Record<LayoutType, LayoutSchema>>): number {
  return PRESET_CANDIDATE_LAYOUT_TYPES.reduce((count, layoutType) => (
    count + (schemas[layoutType].overrides ?? [])
      .filter(({ id }) => id.startsWith(`noto-legacy-${layoutType}-`))
      .length
  ), 0)
}

export function compileNeutralGothicNotoCandidate(input: {
  source: PresetCandidateCompilerSource
  baseSchemas: Readonly<Record<LayoutType, LayoutSchema>>
  legacyProfile: LegacyCalibrationLayoutProfileV1
  jamos: PresetCandidateJamoMaps
}): PresetCandidateCompilation {
  if (input.source.productionEligible !== false) fail('분석 입력이 productionEligible=false가 아님')
  if (input.source.cases.length !== 42) fail('42자 입력이 필요함')

  const preparedCases = prepareCases(input.source, input.jamos)
  const preparedLegacy = prepareLegacyObservations(input.source)
  const currentSchemas = createCurrentPresetSchemas(input.baseSchemas, input.legacyProfile)
  const currentEquivalentSchemas = createPresetCandidateSeedSchemas(input.baseSchemas, input.legacyProfile)
  const candidateSchemas = structuredClone(currentEquivalentSchemas)

  for (const layoutType of PRESET_CANDIDATE_LAYOUT_TYPES) {
    const cases = preparedCases.filter((candidateCase) => candidateCase.layoutType === layoutType)
    const legacy = preparedLegacy.filter((observation) => observation.layoutType === layoutType)
    optimizeCommonLayout(candidateSchemas[layoutType], cases, legacy, input.jamos)
    for (const prepared of cases) optimizeJungseongCase(candidateSchemas[layoutType], prepared, input.jamos)
    for (const initialJamo of CHOSEONG_LIST) {
      optimizeLegacyConsonant(
        candidateSchemas[layoutType],
        legacy.filter((observation) => observation.initialJamo === initialJamo),
        input.jamos,
      )
    }
  }

  const cases = preparedCases.map((prepared) => compareCase(
    prepared,
    currentSchemas[prepared.layoutType],
    candidateSchemas[prepared.layoutType],
    input.jamos,
  ))
  const legacy = preparedLegacy.map((observation) => {
    return compareLegacy(
      observation,
      currentSchemas[observation.layoutType],
      candidateSchemas[observation.layoutType],
      input.jamos,
    )
  })
  const currentRmse = aggregateRmse(cases, 'currentError')
  const candidateRmse = aggregateRmse(cases, 'candidateError')
  const legacyCurrentRmse = aggregateLegacyRmse(legacy, 'currentError')
  const legacyCandidateRmse = aggregateLegacyRmse(legacy, 'candidateError')
  const invalidBoxCount = countInvalidBoxes(preparedCases, candidateSchemas, input.jamos)
    + countInvalidLegacyBoxes(preparedLegacy, candidateSchemas, input.jamos)
  const offGridParameterCount = countOffGridParameters(candidateSchemas)
  const userPartOverrideCount = countUserPartOverrides(candidateSchemas)
  const legacyConsonantOverrideCount = countLegacyConsonantOverrides(candidateSchemas)
  if (invalidBoxCount > 0) fail(`후보 박스 ${invalidBoxCount}개가 0–1 범위를 벗어남`)
  if (offGridParameterCount > 0) fail(`후보 매개변수 ${offGridParameterCount}개가 5-unit 격자를 벗어남`)
  if (userPartOverrideCount > 0) fail('후보에 userPartOverrides가 남음')
  if (legacyConsonantOverrideCount !== CHOSEONG_LIST.length * PRESET_CANDIDATE_LAYOUT_TYPES.length) {
    fail('Noto 레거시 초성 문맥 override 114개가 필요함')
  }

  return {
    compilerVersion: PRESET_CANDIDATE_COMPILER_VERSION,
    grid: PRESET_CANDIDATE_GRID,
    layoutSchemas: candidateSchemas,
    changedLayoutTypes: PRESET_CANDIDATE_LAYOUT_TYPES,
    frozenLayoutTypes: PRESET_CANDIDATE_FROZEN_LAYOUT_TYPES,
    invariants: {
      productionEligible: false,
      jamoMutationCount: 0,
      globalStyleMutationCount: 0,
      frozenLayoutMutationCount: 0,
      userPartOverrideCount: 0,
      legacyConsonantOverrideCount,
      invalidBoxCount,
      offGridParameterCount,
      localTangentShapeMutationCount: 0,
    },
    comparison: {
      roleObservationCount: cases.reduce((sum, candidateCase) => sum + candidateCase.observationCount, 0),
      legacyConsonantObservationCount: legacy.length,
      currentRmse: round(currentRmse),
      candidateRmse: round(candidateRmse),
      improvement: round(currentRmse - candidateRmse),
      regressionCharacters: cases.filter(({ improvement }) => improvement < -0.5).map(({ character }) => character),
      legacyCurrentRmse: round(legacyCurrentRmse),
      legacyCandidateRmse: round(legacyCandidateRmse),
      legacyImprovement: round(legacyCurrentRmse - legacyCandidateRmse),
      legacyRegressionCharacters: [...new Set(legacy
        .filter(({ candidateError, currentError }) => candidateError > currentError + 0.5)
        .map(({ character }) => character))],
      cases,
      legacy,
    },
    layoutDiffs: collectLayoutDiffs(currentEquivalentSchemas, candidateSchemas),
  }
}
