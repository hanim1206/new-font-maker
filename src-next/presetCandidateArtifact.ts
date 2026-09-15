import rawArtifact from '../reference-data/preset-candidates/neutral-gothic-noto-seed-v0.candidate.r3.json' with { type: 'json' }
import type {
  PresetCandidateCaseComparison,
  PresetCandidateCompilation,
  PresetLayoutNumericDiff,
  PresetLegacyLayoutComparison,
} from '../src/services/presetCandidateCompiler'
import {
  PRESET_CANDIDATE_COMPILER_VERSION,
  PRESET_CANDIDATE_FROZEN_LAYOUT_TYPES,
  PRESET_CANDIDATE_GRID,
  PRESET_CANDIDATE_LAYOUT_TYPES,
} from '../src/services/presetCandidateCompiler'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { LayoutSchema, LayoutType } from '../src/types'
import { PRESET_SOURCE_MANIFEST } from './presetCandidateSource'

export interface PresetCandidateArtifact extends PresetCandidateCompilation {
  schema: 'preset-candidate-artifact-v1'
  version: 1
  id: 'neutral-gothic-noto-seed-v0-candidate-r3'
  label: string
  revision: 'r3'
  status: 'user-review-required'
  productionEligible: false
  input: {
    sourceManifestId: 'neutral-gothic-noto-seed-v0'
    sourceManifestPath: string
    sourceManifestSha256: string
    sourceInputDigest: string
    currentBaselineDigest: string
    buildInputDigest: string
    sourceDigests: Readonly<Record<string, string>>
  }
  frozen: {
    jamoDigest: string
    jamoMutationCount: 0
    globalStyleSourcePath: string
    globalStyle: GlobalStyle
    globalStyleMutationCount: 1
  }
  policy: {
    layoutMutationScope: 'six-combination-layouts-only'
    consonantTargetSource: 'noto-legacy-19-initials-six-contexts'
    currentBaselineUse: 'comparison-and-unmeasured-fallback-only'
    localTangentUse: 'start-anchor-placement-only'
    glyphShapeMutation: 'forbidden'
    styleMutationScope: 'global-linecap-only'
    productPromotion: 'explicit-user-approval-only'
  }
  invariants: PresetCandidateCompilation['invariants'] & {
    globalStyleMutationCount: 1
  }
  comparison: PresetCandidateCompilation['comparison'] & {
    cases: PresetCandidateCaseComparison[]
    legacy: PresetLegacyLayoutComparison[]
  }
  layoutDiffs: PresetLayoutNumericDiff[]
}

function fail(location: string, message: string): never {
  throw new Error(`${location}: ${message}`)
}

function record(value: unknown, location: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(location, '객체가 필요합니다.')
  return value as Record<string, unknown>
}

function array(value: unknown, location: string): unknown[] {
  if (!Array.isArray(value)) fail(location, '배열이 필요합니다.')
  return value
}

function literal<T extends string | number | boolean>(value: unknown, expected: T, location: string): T {
  if (value !== expected) fail(location, `${String(expected)}가 필요합니다.`)
  return expected
}

function finite(value: unknown, location: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) fail(location, '유한수가 필요합니다.')
  return value
}

function sha256(value: unknown, location: string): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{64}$/u.test(value)) fail(location, 'SHA-256이 필요합니다.')
  return value
}

function validateLayoutSchemas(value: unknown): Record<LayoutType, LayoutSchema> {
  const schemas = record(value, 'preset candidate.layoutSchemas')
  const layoutTypes = [...PRESET_CANDIDATE_FROZEN_LAYOUT_TYPES, ...PRESET_CANDIDATE_LAYOUT_TYPES]
  for (const layoutType of layoutTypes) {
    const schema = record(schemas[layoutType], `preset candidate.layoutSchemas.${layoutType}`)
    literal(schema.id, layoutType, `preset candidate.layoutSchemas.${layoutType}.id`)
    if (PRESET_CANDIDATE_LAYOUT_TYPES.includes(layoutType as (typeof PRESET_CANDIDATE_LAYOUT_TYPES)[number])) {
      if (schema.userPartOverrides !== undefined) fail(`preset candidate.layoutSchemas.${layoutType}`, 'userPartOverrides를 포함할 수 없습니다.')
    }
  }
  return schemas as unknown as Record<LayoutType, LayoutSchema>
}

export function parsePresetCandidateArtifact(value: unknown): PresetCandidateArtifact {
  const artifact = record(value, 'preset candidate')
  literal(artifact.schema, 'preset-candidate-artifact-v1', 'preset candidate.schema')
  literal(artifact.version, 1, 'preset candidate.version')
  literal(artifact.id, 'neutral-gothic-noto-seed-v0-candidate-r3', 'preset candidate.id')
  literal(artifact.revision, 'r3', 'preset candidate.revision')
  literal(artifact.status, 'user-review-required', 'preset candidate.status')
  literal(artifact.productionEligible, false, 'preset candidate.productionEligible')
  literal(artifact.compilerVersion, PRESET_CANDIDATE_COMPILER_VERSION, 'preset candidate.compilerVersion')
  literal(artifact.grid, PRESET_CANDIDATE_GRID, 'preset candidate.grid')

  const input = record(artifact.input, 'preset candidate.input')
  literal(input.sourceManifestId, PRESET_SOURCE_MANIFEST.id, 'preset candidate.input.sourceManifestId')
  literal(input.sourceInputDigest, PRESET_SOURCE_MANIFEST.inputDigest, 'preset candidate.input.sourceInputDigest')
  literal(input.currentBaselineDigest, PRESET_SOURCE_MANIFEST.currentBaseline.digest, 'preset candidate.input.currentBaselineDigest')
  sha256(input.sourceManifestSha256, 'preset candidate.input.sourceManifestSha256')
  sha256(input.buildInputDigest, 'preset candidate.input.buildInputDigest')

  const policy = record(artifact.policy, 'preset candidate.policy')
  literal(policy.layoutMutationScope, 'six-combination-layouts-only', 'preset candidate.policy.layoutMutationScope')
  literal(policy.consonantTargetSource, 'noto-legacy-19-initials-six-contexts', 'preset candidate.policy.consonantTargetSource')
  literal(policy.currentBaselineUse, 'comparison-and-unmeasured-fallback-only', 'preset candidate.policy.currentBaselineUse')
  literal(policy.localTangentUse, 'start-anchor-placement-only', 'preset candidate.policy.localTangentUse')
  literal(policy.glyphShapeMutation, 'forbidden', 'preset candidate.policy.glyphShapeMutation')
  literal(policy.styleMutationScope, 'global-linecap-only', 'preset candidate.policy.styleMutationScope')
  literal(policy.productPromotion, 'explicit-user-approval-only', 'preset candidate.policy.productPromotion')

  const frozen = record(artifact.frozen, 'preset candidate.frozen')
  sha256(frozen.jamoDigest, 'preset candidate.frozen.jamoDigest')
  literal(frozen.jamoMutationCount, 0, 'preset candidate.frozen.jamoMutationCount')
  literal(frozen.globalStyleMutationCount, 1, 'preset candidate.frozen.globalStyleMutationCount')
  const globalStyle = record(frozen.globalStyle, 'preset candidate.frozen.globalStyle')
  literal(globalStyle.linecap, 'square', 'preset candidate.frozen.globalStyle.linecap')
  literal(globalStyle.linejoin, 'round', 'preset candidate.frozen.globalStyle.linejoin')
  const brush = record(globalStyle.brush, 'preset candidate.frozen.globalStyle.brush')
  literal(brush.tip, 'round', 'preset candidate.frozen.globalStyle.brush.tip')

  const invariants = record(artifact.invariants, 'preset candidate.invariants')
  literal(invariants.productionEligible, false, 'preset candidate.invariants.productionEligible')
  literal(invariants.globalStyleMutationCount, 1, 'preset candidate.invariants.globalStyleMutationCount')
  for (const key of ['jamoMutationCount', 'frozenLayoutMutationCount', 'userPartOverrideCount', 'invalidBoxCount', 'offGridParameterCount', 'localTangentShapeMutationCount']) {
    literal(invariants[key], 0, `preset candidate.invariants.${key}`)
  }
  literal(invariants.legacyConsonantOverrideCount, 114, 'preset candidate.invariants.legacyConsonantOverrideCount')

  const changedLayoutTypes = array(artifact.changedLayoutTypes, 'preset candidate.changedLayoutTypes')
  const frozenLayoutTypes = array(artifact.frozenLayoutTypes, 'preset candidate.frozenLayoutTypes')
  if (JSON.stringify(changedLayoutTypes) !== JSON.stringify(PRESET_CANDIDATE_LAYOUT_TYPES)) fail('preset candidate.changedLayoutTypes', '여섯 조합 레이아웃 순서가 다릅니다.')
  if (JSON.stringify(frozenLayoutTypes) !== JSON.stringify(PRESET_CANDIDATE_FROZEN_LAYOUT_TYPES)) fail('preset candidate.frozenLayoutTypes', '네 단독 레이아웃 순서가 다릅니다.')
  validateLayoutSchemas(artifact.layoutSchemas)

  const comparison = record(artifact.comparison, 'preset candidate.comparison')
  literal(comparison.roleObservationCount, 358, 'preset candidate.comparison.roleObservationCount')
  literal(comparison.legacyConsonantObservationCount, 342, 'preset candidate.comparison.legacyConsonantObservationCount')
  const currentRmse = finite(comparison.currentRmse, 'preset candidate.comparison.currentRmse')
  const candidateRmse = finite(comparison.candidateRmse, 'preset candidate.comparison.candidateRmse')
  if (candidateRmse >= currentRmse) fail('preset candidate.comparison', '후보 오차가 현재보다 작아야 합니다.')
  const legacyCurrentRmse = finite(comparison.legacyCurrentRmse, 'preset candidate.comparison.legacyCurrentRmse')
  const legacyCandidateRmse = finite(comparison.legacyCandidateRmse, 'preset candidate.comparison.legacyCandidateRmse')
  if (legacyCandidateRmse >= legacyCurrentRmse) fail('preset candidate.comparison', 'Noto 닿자 레거시 후보 오차가 현재보다 작아야 합니다.')
  const cases = array(comparison.cases, 'preset candidate.comparison.cases')
  if (cases.length !== 42) fail('preset candidate.comparison.cases', '42자가 필요합니다.')
  const regressions = array(comparison.regressionCharacters, 'preset candidate.comparison.regressionCharacters')
  if (regressions.length > 0) fail('preset candidate.comparison.regressionCharacters', '회귀 글자가 없어야 합니다.')
  const legacyRegressions = array(comparison.legacyRegressionCharacters, 'preset candidate.comparison.legacyRegressionCharacters')
  if (legacyRegressions.length > 0) fail('preset candidate.comparison.legacyRegressionCharacters', 'Noto 닿자 레거시 회귀 글자가 없어야 합니다.')

  return artifact as unknown as PresetCandidateArtifact
}

export const PRESET_CANDIDATE_ARTIFACT = parsePresetCandidateArtifact(rawArtifact)
export const PRESET_CANDIDATE_COMPARISON_BY_CHARACTER = new Map(
  PRESET_CANDIDATE_ARTIFACT.comparison.cases.map((candidateCase) => [candidateCase.character, candidateCase]),
)
