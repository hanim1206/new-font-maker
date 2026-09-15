#!/usr/bin/env node

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const OUTPUT_PATH = join(ROOT, 'reference-data/preset-candidates/neutral-gothic-noto-seed-v0.source.v1.json')
const FONT_PATH = join(ROOT, '.reference-fonts/NotoSansKR.ttf')
const FONT_SHA256 = '194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252'
const MEDIALS = ['ㅏ', 'ㅐ', 'ㅑ', 'ㅒ', 'ㅓ', 'ㅔ', 'ㅕ', 'ㅖ', 'ㅗ', 'ㅘ', 'ㅙ', 'ㅚ', 'ㅛ', 'ㅜ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅠ', 'ㅡ', 'ㅢ', 'ㅣ']
const INITIALS = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
const FINALS = [null, 'ㄱ']
const INVALID_EXTRACTORS = ['geometric-role-matcher-v4', 'geometric-role-matcher-v6', 'geometric-role-matcher-v7', 'geometric-role-matcher-v8']
const APPROVED_V8_ANCHOR_OBSERVATION_DIGEST = 'ddbf8478cd0360301c5755175334ba1e8e3f05afd17bb6b723ef9136ea169291'
const MUTABLE_LAYOUT_TYPES = [
  'choseong-jungseong-vertical',
  'choseong-jungseong-horizontal',
  'choseong-jungseong-mixed',
  'choseong-jungseong-vertical-jongseong',
  'choseong-jungseong-horizontal-jongseong',
  'choseong-jungseong-mixed-jongseong',
]
const FROZEN_LAYOUT_TYPES = [
  'choseong-only',
  'jungseong-vertical-only',
  'jungseong-horizontal-only',
  'jungseong-mixed-only',
]
const CURRENT_GLOBAL_STYLE = {
  slant: 0,
  weight: 400,
  letterSpacing: 0,
  linecap: 'round',
  linejoin: 'round',
  brush: { tip: 'round', aspectRatio: 0.5, angle: 0 },
  strokeStyle: { mode: 'brush', brush: { tip: 'round', aspectRatio: 0.5, angle: 0 } },
}

const SOURCES = {
  legacy: 'reference-data/font-guide-calibrations/noto-sans-kr.v1.json',
  gold: 'reference-data/font-guide-calibrations/noto-sans-kr.medial-g0.gold.v1.json',
  p1Report: 'reference-data/font-guide-calibrations/medial-p1-g2-v9.report.v1.json',
  invalidV4: 'reference-data/font-guide-calibrations/medial-p1-g2-v4.report.v1.json',
  invalidV6: 'reference-data/font-guide-calibrations/medial-p1-g2-v6.report.v1.json',
  invalidV7: 'reference-data/font-guide-calibrations/medial-p1-g2-v7.report.v1.json',
  invalidV8: 'reference-data/font-guide-calibrations/medial-p1-g2-v8.report.v1.json',
}

const BASELINE_SOURCES = {
  baseJamos: 'src/data/baseJamos.json',
  userPreset01: 'src-next/userPreset01.ts',
  basePresets: 'src/data/basePresets.json',
  layoutCalculator: 'src/utils/layoutCalculator.ts',
  legacyLayoutProfile: 'src/data/legacyCalibrationLayoutProfileV1.ts',
  globalStyleStore: 'src/stores/globalStyleStore.ts',
}

function fail(message) {
  throw new Error(`Noto 기본 고딕 출처 생성 실패: ${message}`)
}

function sourcePath(relativePath) {
  return join(ROOT, relativePath)
}

function readJson(relativePath) {
  return JSON.parse(readFileSync(sourcePath(relativePath), 'utf8'))
}

function sha256File(path) {
  return createHash('sha256').update(readFileSync(path)).digest('hex')
}

function sha256Value(value) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function decompose(character) {
  const code = character.codePointAt(0)
  if (code === undefined || code < 0xac00 || code > 0xd7a3) fail(`${character}는 현대 한글 음절이 아님`)
  const offset = code - 0xac00
  const initialIndex = Math.floor(offset / 588)
  const medialIndex = Math.floor((offset % 588) / 28)
  const finalIndex = offset % 28
  if (initialIndex !== 0 || ![0, 1].includes(finalIndex)) fail(`${character} 문맥이 ㄱ × 종성 없음/ㄱ 범위를 벗어남`)
  return { initialJamo: 'ㄱ', medialJamo: MEDIALS[medialIndex], finalJamo: FINALS[finalIndex] }
}

function normalizeFace(component, evidence) {
  if (component.status === 'abstained') {
    return {
      status: 'abstained',
      reasonCode: component.reasonCode,
      ...(component.referenceMode ? { referenceMode: component.referenceMode } : {}),
      ...(evidence ? { evidence } : {}),
    }
  }
  return {
    status: 'candidate',
    value: component.value,
    referenceMode: component.referenceMode ?? evidence?.referenceMode ?? 'axis-aligned-face',
    ...(component.referenceSide ? { referenceSide: component.referenceSide } : {}),
    ...(component.anchor ? { anchor: component.anchor } : {}),
    ...(component.maximumDeviation === undefined ? {} : { maximumDeviation: component.maximumDeviation }),
    ...(evidence ? { evidence } : {}),
  }
}

function normalizeSpans(component, evidence) {
  if (component.status === 'abstained') {
    return {
      status: 'abstained',
      reasonCode: component.reasonCode,
      ...(evidence ? { evidence } : {}),
    }
  }
  return {
    status: 'candidate',
    value: component.value,
    ...(evidence ? { evidence } : {}),
  }
}

function normalizeElement(element, provenance) {
  return {
    elementId: element.elementId,
    orientation: element.orientation,
    faceSide: element.faceSide,
    ...(element.legacyFaceRole ? { legacyFaceRole: element.legacyFaceRole } : {}),
    ...(element.legacyTipRole === undefined ? {} : { legacyTipRole: element.legacyTipRole }),
    face: normalizeFace(element.face, element.face.evidence),
    visibleSpans: normalizeSpans(element.visibleSpans, element.visibleSpans.evidence),
    ...(element.componentSpans ? { componentSpans: element.componentSpans } : {}),
    ...(element.derived ? { derived: element.derived } : {}),
    ...(element.match ? { match: element.match } : {}),
    provenance,
  }
}

function assertFiniteObservations(cases) {
  for (const candidateCase of cases) {
    for (const element of candidateCase.elements) {
      if (element.face.status === 'candidate' && !Number.isFinite(element.face.value)) {
        fail(`${candidateCase.character}/${element.elementId} face가 유한수가 아님`)
      }
      if (element.visibleSpans.status === 'candidate') {
        for (const span of element.visibleSpans.value) {
          if (!Number.isFinite(span.from) || !Number.isFinite(span.to) || span.from >= span.to) {
            fail(`${candidateCase.character}/${element.elementId} visible span이 잘못됨`)
          }
        }
      }
    }
  }
}

function reviewProjection(cases) {
  return [...cases]
    .sort((left, right) => {
      const medialDelta = MEDIALS.indexOf(left.medialJamo) - MEDIALS.indexOf(right.medialJamo)
      if (medialDelta !== 0) return medialDelta
      return (left.finalJamo === null ? 0 : 1) - (right.finalJamo === null ? 0 : 1)
    })
    .map((candidateCase) => ({
      character: candidateCase.character,
      elements: candidateCase.elements.map((element) => ({
        elementId: element.elementId,
        orientation: element.orientation,
        faceSide: element.faceSide,
        face: element.face.status === 'candidate'
          ? {
              status: element.face.status,
              value: element.face.value,
              referenceMode: element.face.referenceMode,
              ...(element.face.referenceSide ? { referenceSide: element.face.referenceSide } : {}),
              ...(element.face.anchor ? { anchor: element.face.anchor } : {}),
              ...(element.face.maximumDeviation === undefined ? {} : { maximumDeviation: element.face.maximumDeviation }),
            }
          : {
              status: element.face.status,
              reasonCode: element.face.reasonCode,
              ...(element.face.referenceMode ? { referenceMode: element.face.referenceMode } : {}),
            },
        visibleSpans: element.visibleSpans.status === 'candidate'
          ? { status: element.visibleSpans.status, value: element.visibleSpans.value }
          : { status: element.visibleSpans.status, reasonCode: element.visibleSpans.reasonCode },
      })),
    }))
}

function main() {
  if (sha256File(FONT_PATH) !== FONT_SHA256) fail('NotoSansKR.ttf SHA-256 불일치')

  const legacy = readJson(SOURCES.legacy)
  const gold = readJson(SOURCES.gold)
  const p1Report = readJson(SOURCES.p1Report)
  const invalidV4 = readJson(SOURCES.invalidV4)
  const invalidV6 = readJson(SOURCES.invalidV6)
  const invalidV7 = readJson(SOURCES.invalidV7)
  const invalidV8 = readJson(SOURCES.invalidV8)

  if (legacy.schema !== 'font-guide-calibration-snapshot-v1' || legacy.font.fileSha256 !== FONT_SHA256) fail('레거시 스냅샷 identity 불일치')
  if (gold.status !== 'approved-analysis-gold' || gold.productionEligible !== false || gold.font.fileSha256 !== FONT_SHA256) fail('G0 골드 승인 경계 불일치')
  if (
    p1Report.status !== 'user-reviewed-diagnostic'
    || p1Report.userReviewed !== true
    || p1Report.userReview?.result !== 'pass'
    || p1Report.userReview?.wrongRoleCount !== 0
    || JSON.stringify(p1Report.userReview?.characters) !== JSON.stringify(['풔', '풕'])
    || p1Report.visualReview?.result !== 'agent-pass'
    || p1Report.presetAnchorReview?.result !== 'pass'
    || p1Report.presetAnchorReview?.characterCount !== 28
    || p1Report.presetAnchorReview?.wrongRoleCount !== 0
    || p1Report.presetAnchorReview?.observationDigest !== APPROVED_V8_ANCHOR_OBSERVATION_DIGEST
    || p1Report.productionEligible !== false
  ) fail('P1 v9 사용자 검수 경계 불일치')
  if (p1Report.extractorVersion !== 'geometric-role-matcher-v9') fail('P1 v9 extractor identity 불일치')
  if (invalidV4.status !== 'invalidated-by-user-review' || invalidV6.status !== 'invalidated-by-user-review' || invalidV7.status !== 'invalidated-by-user-review' || invalidV8.status !== 'invalidated-by-user-review') fail('폐기 extractor 이력 불일치')

  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'font-maker-noto-preset-source-'))
  const rawP1Path = join(temporaryDirectory, 'noto-p1-v9-anchor.json')
  const rawP1FullPath = join(temporaryDirectory, 'noto-p1-v9-full.json')
  try {
    execFileSync('python3', [
      join(ROOT, 'scripts/reference-lab/evaluate_medial_p1.py'),
      FONT_PATH,
      '--scope', 'p1',
      '--json', rawP1FullPath,
    ], { cwd: ROOT, stdio: 'inherit' })
    if (sha256File(rawP1FullPath) !== p1Report.reproduction.notoFullReportSha256) {
      fail('P1 v9 전체 보고서 SHA 재현 실패')
    }
    const rawP1Full = JSON.parse(readFileSync(rawP1FullPath, 'utf8'))
    if (rawP1Full.scope !== 'p1' || rawP1Full.extractorVersion !== 'geometric-role-matcher-v9' || rawP1Full.summary.caseCount !== 532) {
      fail('재생성 P1 전체 보고서 identity 불일치')
    }

    execFileSync('python3', [
      join(ROOT, 'scripts/reference-lab/evaluate_medial_p1.py'),
      FONT_PATH,
      '--scope', 'anchor',
      '--json', rawP1Path,
    ], { cwd: ROOT, stdio: 'inherit' })

    const rawP1 = JSON.parse(readFileSync(rawP1Path, 'utf8'))
    if (rawP1.scope !== 'anchor' || rawP1.extractorVersion !== 'geometric-role-matcher-v9') fail('재생성 P1 identity 불일치')
    if (rawP1.productionEligible !== false || rawP1.summary.caseCount !== 28 || rawP1.summary.usableConfidence.high !== 0) fail('재생성 P1 검수 경계 불일치')
    if (rawP1.summary.invalidNumberCount !== 0 || rawP1.summary.roleContractViolationCount !== 0 || rawP1.summary.missingEvidenceCount !== 0) fail('재생성 P1 구조 검증 실패')

    const goldCases = gold.cases.map((candidateCase) => {
      const context = decompose(candidateCase.character)
      const provenance = {
        sourceId: 'noto-medial-g0-gold-v1',
        sourceClass: 'approved-analysis',
        reviewStatus: 'user-approved-analysis',
        extractorVersion: gold.extractorVersionAtApproval,
        roleDefinitionVersion: gold.roleDefinitionVersion,
      }
      return {
        character: candidateCase.character,
        ...context,
        sourceClass: 'approved-analysis',
        reviewStatus: 'user-approved-analysis',
        productionEligible: false,
        elements: candidateCase.elements.map((element) => normalizeElement(element, provenance)),
      }
    })

    const p1Cases = rawP1.cases.map((candidateCase) => {
      if (candidateCase.status !== 'candidate') fail(`${candidateCase.character} P1 case가 candidate가 아님`)
      const context = decompose(candidateCase.character)
      if (context.medialJamo !== candidateCase.medialJamo || context.finalJamo !== candidateCase.finalJamo) fail(`${candidateCase.character} P1 문맥 identity 불일치`)
      const provenance = {
        sourceId: 'noto-medial-p1-v9-anchor',
        sourceClass: 'automatic-candidate',
        reviewStatus: 'user-approved-candidate',
        extractorVersion: rawP1.extractorVersion,
        roleDefinitionVersion: rawP1.roleContractVersion,
      }
      return {
        character: candidateCase.character,
        ...context,
        sourceClass: 'automatic-candidate',
        reviewStatus: 'user-approved-candidate',
        productionEligible: false,
        elements: candidateCase.elements.map((element) => normalizeElement(element, provenance)),
      }
    })

    const p1ObservationDigest = sha256Value(reviewProjection(p1Cases))
    if (p1ObservationDigest !== APPROVED_V8_ANCHOR_OBSERVATION_DIGEST) {
      fail('P1 v9 앵커 관찰값이 사용자 확인 v8 값과 달라짐')
    }

    const cases = [...goldCases, ...p1Cases].sort((left, right) => {
      const medialDelta = MEDIALS.indexOf(left.medialJamo) - MEDIALS.indexOf(right.medialJamo)
      if (medialDelta !== 0) return medialDelta
      return (left.finalJamo === null ? 0 : 1) - (right.finalJamo === null ? 0 : 1)
    })
    if (cases.length !== 42 || new Set(cases.map(({ character }) => character)).size !== 42) fail('42자 scope가 완전하지 않음')
    for (const medialJamo of MEDIALS) {
      for (const finalJamo of FINALS) {
        if (!cases.some((candidateCase) => candidateCase.medialJamo === medialJamo && candidateCase.finalJamo === finalJamo)) fail(`${medialJamo}/${finalJamo ?? '무받침'} 누락`)
      }
    }
    assertFiniteObservations(cases)

    const baselineSourceDigests = Object.fromEntries(
      Object.entries(BASELINE_SOURCES).map(([id, path]) => [id, sha256File(sourcePath(path))]),
    )
    const currentBaselineCore = {
      sourceClass: 'current-fallback',
      storageInput: 'excluded',
      jamos: {
        basePath: BASELINE_SOURCES.baseJamos,
        overridePath: BASELINE_SOURCES.userPreset01,
      },
      layouts: {
        basePath: BASELINE_SOURCES.basePresets,
        calculatorPath: BASELINE_SOURCES.layoutCalculator,
        legacyProfilePath: BASELINE_SOURCES.legacyLayoutProfile,
        mutableLayoutTypes: MUTABLE_LAYOUT_TYPES,
        frozenLayoutTypes: FROZEN_LAYOUT_TYPES,
      },
      globalStyle: {
        sourcePath: BASELINE_SOURCES.globalStyleStore,
        value: CURRENT_GLOBAL_STYLE,
      },
    }
    const currentBaseline = {
      ...currentBaselineCore,
      digest: sha256Value({ sourceDigests: baselineSourceDigests, baseline: currentBaselineCore }),
    }
    const sourceDigests = {
      font: FONT_SHA256,
      legacy: sha256File(sourcePath(SOURCES.legacy)),
      gold: sha256File(sourcePath(SOURCES.gold)),
      p1Report: sha256File(sourcePath(SOURCES.p1Report)),
      p1Full: sha256File(rawP1FullPath),
      p1RawAnchor: sha256File(rawP1Path),
      invalidV4: sha256File(sourcePath(SOURCES.invalidV4)),
      invalidV6: sha256File(sourcePath(SOURCES.invalidV6)),
      invalidV7: sha256File(sourcePath(SOURCES.invalidV7)),
      invalidV8: sha256File(sourcePath(SOURCES.invalidV8)),
      ...baselineSourceDigests,
    }
    const manifest = {
      schema: 'preset-source-manifest-v1',
      version: 1,
      id: 'neutral-gothic-noto-seed-v0',
      label: '기본 고딕 01 · Noto 공간 구조 입력 v0',
      status: 'analysis-review-candidate',
      productionEligible: false,
      coordinateFrame: { id: 'shared-baseline', unitsPerEm: 1000, baselineY: 880 },
      font: { id: 'noto-sans-kr', family: 'Noto Sans KR', fileSha256: FONT_SHA256, axes: { wght: 400 } },
      scope: {
        medialObservationInitialJamo: 'ㄱ',
        medials: MEDIALS,
        finalJamos: FINALS,
        characterCount: 42,
        legacyConsonantInitialJamos: INITIALS,
        legacyConsonantContextCount: INITIALS.length * legacy.contextOrder.length,
      },
      policy: {
        allowedSourceClasses: ['approved-analysis', 'automatic-candidate', 'provisional-legacy', 'current-fallback'],
        invalidExtractorVersions: INVALID_EXTRACTORS,
        missingValue: 'keep-current-and-mark-fallback',
        promotion: 'explicit-user-approval-only',
      },
      sourceDigests,
      currentBaseline,
      inputDigest: sha256Value({
        sourceDigests,
        currentBaseline,
        scope: {
          medialObservationInitialJamo: 'ㄱ',
          medials: MEDIALS,
          finalJamos: FINALS,
          legacyConsonantInitialJamos: INITIALS,
          legacyConsonantContextCount: INITIALS.length * legacy.contextOrder.length,
        },
      }),
      sources: [
        { id: 'legacy-noto-initial-v1', path: SOURCES.legacy, status: 'provisional-legacy', productionEligible: false },
        { id: 'noto-medial-g0-gold-v1', path: SOURCES.gold, status: 'approved-analysis', productionEligible: false },
        { id: 'noto-medial-p1-v9-anchor', path: null, reportPath: SOURCES.p1Report, status: 'automatic-candidate-review-carried-by-exact-observation', productionEligible: false, reproduction: p1Report.reproduction.notoAnchorCommand },
        { id: 'noto-medial-p1-v4', path: SOURCES.invalidV4, status: 'invalidated-by-user-review', usableAsInput: false },
        { id: 'noto-medial-p1-v6', path: SOURCES.invalidV6, status: 'invalidated-by-user-review', usableAsInput: false },
        { id: 'noto-medial-p1-v7', path: SOURCES.invalidV7, status: 'invalidated-by-user-review', usableAsInput: false },
        { id: 'noto-medial-p1-v8', path: SOURCES.invalidV8, status: 'invalidated-by-user-review', usableAsInput: false },
      ],
      legacyConsonants: {
        sourceId: 'legacy-noto-initial-v1',
        sourceClass: 'provisional-legacy',
        reviewStatus: 'provisional',
        initialJamos: INITIALS,
        contextOrder: legacy.contextOrder,
        values: Object.fromEntries(INITIALS.map((initialJamo) => [initialJamo, legacy.values[initialJamo]])),
      },
      caseCounts: { approvedAnalysis: goldCases.length, automaticCandidate: p1Cases.length, userApprovedCandidate: p1Cases.length },
      cases,
    }

    mkdirSync(dirname(OUTPUT_PATH), { recursive: true })
    writeFileSync(OUTPUT_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
    console.log(`생성: ${OUTPUT_PATH}`)
    console.log(`입력 digest: ${manifest.inputDigest}`)
    console.log(`범위: ${manifest.cases.length}자 · 골드 ${goldCases.length} · 동일 관찰 승인 승계 ${p1Cases.length}`)
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true })
  }
}

main()
