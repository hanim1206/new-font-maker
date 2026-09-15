import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import baseJamos from '../../src/data/baseJamos.json' with { type: 'json' }
import basePresets from '../../src/data/basePresets.json' with { type: 'json' }
import { LEGACY_CALIBRATION_LAYOUT_PROFILE_V1 } from '../../src/data/legacyCalibrationLayoutProfileV1'
import {
  compileNeutralGothicNotoCandidate,
  PRESET_CANDIDATE_COMPILER_VERSION,
  type PresetCandidateCompilerSource,
  type PresetCandidateJamoMaps,
} from '../../src/services/presetCandidateCompiler'
import type { LayoutSchema, LayoutType } from '../../src/types'
import { PRESET_SOURCE_MANIFEST } from '../../src-next/presetCandidateSource'
import { USER_PRESET_01_JAMOS } from '../../src-next/userPreset01'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const SOURCE_PATH = resolve(ROOT, 'reference-data/preset-candidates/neutral-gothic-noto-seed-v0.source.v1.json')
const OUTPUT_PATH = resolve(ROOT, 'reference-data/preset-candidates/neutral-gothic-noto-seed-v0.candidate.r3.json')

type BuildSource = PresetCandidateCompilerSource & {
  sourceDigests: Readonly<Record<string, string>>
  currentBaseline: {
    digest: string
    globalStyle: {
      sourcePath: string
      value: Readonly<Record<string, unknown>>
    }
  }
}

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

const source = PRESET_SOURCE_MANIFEST as unknown as BuildSource
const sourceManifestSha256 = sha256(readFileSync(SOURCE_PATH))
const baseSchemas = basePresets.schemas as unknown as Record<LayoutType, LayoutSchema>
const typedBaseJamos = baseJamos as unknown as PresetCandidateJamoMaps
const jamos: PresetCandidateJamoMaps = {
  choseong: { ...typedBaseJamos.choseong, ...USER_PRESET_01_JAMOS.choseong },
  jungseong: { ...typedBaseJamos.jungseong, ...USER_PRESET_01_JAMOS.jungseong },
  jongseong: { ...typedBaseJamos.jongseong, ...USER_PRESET_01_JAMOS.jongseong },
}
const compilation = compileNeutralGothicNotoCandidate({
  source,
  baseSchemas,
  legacyProfile: LEGACY_CALIBRATION_LAYOUT_PROFILE_V1,
  jamos,
})
const candidateGlobalStyle = structuredClone(source.currentBaseline.globalStyle.value)
candidateGlobalStyle.linecap = 'square'
const frozenJamoDigest = sha256(JSON.stringify(jamos satisfies PresetCandidateJamoMaps))
const buildInputDigest = sha256(JSON.stringify({
  sourceManifestSha256,
  sourceInputDigest: source.inputDigest,
  currentBaselineDigest: source.currentBaseline.digest,
  compilerVersion: PRESET_CANDIDATE_COMPILER_VERSION,
  candidateGlobalStyle,
}))

const artifact = {
  schema: 'preset-candidate-artifact-v1',
  version: 1,
  id: 'neutral-gothic-noto-seed-v0-candidate-r3',
  label: '기본 고딕 01 · Noto 레거시 문맥축 교정 · 네모 끝면 후보 r3',
  revision: 'r3',
  status: 'user-review-required',
  productionEligible: false,
  input: {
    sourceManifestId: source.id,
    sourceManifestPath: 'reference-data/preset-candidates/neutral-gothic-noto-seed-v0.source.v1.json',
    sourceManifestSha256,
    sourceInputDigest: source.inputDigest,
    currentBaselineDigest: source.currentBaseline.digest,
    buildInputDigest,
    sourceDigests: source.sourceDigests,
  },
  frozen: {
    jamoDigest: frozenJamoDigest,
    jamoMutationCount: 0,
    globalStyleSourcePath: source.currentBaseline.globalStyle.sourcePath,
    globalStyle: candidateGlobalStyle,
    globalStyleMutationCount: 1,
  },
  policy: {
    layoutMutationScope: 'six-combination-layouts-only',
    consonantTargetSource: 'noto-legacy-19-initials-six-contexts',
    currentBaselineUse: 'comparison-and-unmeasured-fallback-only',
    localTangentUse: 'start-anchor-placement-only',
    glyphShapeMutation: 'forbidden',
    styleMutationScope: 'global-linecap-only',
    productPromotion: 'explicit-user-approval-only',
  },
  ...compilation,
  invariants: {
    ...compilation.invariants,
    globalStyleMutationCount: 1,
  },
}

if (artifact.comparison.candidateRmse >= artifact.comparison.currentRmse) {
  throw new Error('기본 고딕 r3 후보가 현재값보다 홀자 역할 오차를 줄이지 못했습니다.')
}
if (artifact.comparison.legacyCandidateRmse >= artifact.comparison.legacyCurrentRmse) {
  throw new Error('기본 고딕 r3 후보가 현재값보다 Noto 닿자 레거시 오차를 줄이지 못했습니다.')
}
mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
writeFileSync(OUTPUT_PATH, `${JSON.stringify(artifact, null, 2)}\n`, 'utf8')

console.log(`생성: ${OUTPUT_PATH}`)
console.log(`빌드 입력 digest: ${buildInputDigest}`)
console.log(`역할 관찰: ${artifact.comparison.roleObservationCount}개`)
console.log(`홀자 RMSE: 현재 ${artifact.comparison.currentRmse} → 후보 ${artifact.comparison.candidateRmse} font units`)
console.log(`Noto 닿자 레거시: ${artifact.comparison.legacyConsonantObservationCount}개 · RMSE ${artifact.comparison.legacyCurrentRmse} → ${artifact.comparison.legacyCandidateRmse}`)
console.log(`회귀 글자: ${artifact.comparison.regressionCharacters.length}자`)
console.log(`레이아웃 수치 변경: ${artifact.layoutDiffs.length}개`)
