import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const HTML_URL = new URL('../public/references/vertical-vowel-gap.html', import.meta.url)
const MANIFEST_URL = new URL('../public/references/vertical-vowel-gap.manifest.json', import.meta.url)
const SHA256 = /^[0-9a-f]{64}$/
const EXPECTED_ANALYSIS_SHA256 = '8575b47ae9bc7d24250479e414f53a37b66f40e27e7250e56aa7495e16d53954'
const EXPECTED_HTML_SHA256 = '3f97fee926c82748781f5ff679f9c0b93fcf213b53d8b8808db6f48fd10e42c9'
const EXPECTED_GLYPHS = ['가', '거', '나', '너', '다', '더', '마', '머', '아', '어']
const EXPECTED_FONT_IDS = [
  'noto-sans-kr',
  'ibm-plex-sans-kr',
  'nanum-gothic',
  'dotum',
  'gowun-dodum',
  'black-han-sans',
]
const EXPECTED_CANDIDATE_IDS = ['current', 'a', 'b', 'c']

interface EvidenceManifest {
  schema: string
  version: number
  checkpoint: string
  status: string
  approved: boolean
  productionValueApplied: boolean
  analysisSha256: string
  htmlSha256: string
  corpus: {
    fontCount: number
    glyphCount: number
    referenceSampleCount: number
    candidateCount: number
    missingCount: number
    glyphs: string[]
  }
  decision: {
    mode: string
    xGapVerdict: string
    question: string
    scope: string
    fixed: string[]
    excluded: string[]
  }
  fonts: Array<{
    id: string
    family: string
    aggregation: string
    weight: number
    license: string
    source: string
    fileSha256: string
  }>
  references: Array<{
    fontId: string
    glyph: string
    pathSha256: string
    unitsPerEm: number
    advance: number
    bounds: number[]
    measurement: null | { left: number; right: number; value: number }
  }>
  measurement: {
    id: string
    limitations: string
    validForNumericAggregation: string[]
    coreFontIds: string[]
    excludedFromAggregation: string[]
    roundedFontUnitTargets: { p25: number; median: number; p75: number }
  }
  shapeGeometry: {
    onlyVariable: string
    unitsPerEm: number
    strokeWidth: number
    chRightCenter: number
    juCenterOffset: number
    strokeReference: {
      fontId: string
      glyph: string
      weight: number
      method: string
      samples: { chHorizontal: number; juHorizontal: number; juVertical: number }
      horizontalMean: number
      rawBalancedValue: number
      roundedValue: number
      limitation: string
    }
  }
  comparisonYCalibration: {
    status: string
    scope: string
    productionApplied: boolean
    reference: {
      fontId: string
      glyph: string
      weight: number
      pathSha256: string
      sourceBounds: number[]
      inkEnvelope: { top: number; bottom: number }
    }
    control: { gapFontUnits: number; strokeWidth: number; xCalibration: string }
    sourceCenterlines: {
      chTop: number
      chBottom: number
      juTop: number
      juArm: number
      juBottom: number
    }
    variants: Array<{
      id: string
      label: string
      basis: string
      targetInkEnvelope: { top: number; bottom: number }
      targetCenterlineEnvelope: { top: number; bottom: number }
      affine: { scaleY: number; offsetY: number }
      mappedCenterlines: {
        chTop: number
        chBottom: number
        juTop: number
        juArm: number
        juBottom: number
      }
      bodyOverflow: { top: number; bottom: number }
    }>
    recommendedVariantId: string
    limitation: string
  }
  display: {
    viewBox: number[]
    unitsPerEm: number
    rule: string
    coordinateFrame: {
      method: string
      ascender: number
      descender: number
      baselineY: number
      xOrigin: number
      yDirection: string
      referenceTransform: string
      candidateCoordinates: string
      inkAutofit: boolean
      individualCentering: boolean
      advanceNormalization: boolean
      emGuide: number[]
      designBodyGuide: number[]
      designBodyGuideRole: string
      gapBandY: number[]
    }
    glanceStrip: { glyph: string; order: string[] }
  }
  candidates: Array<{
    id: string
    gap: number
    gapFontUnits: number
    strokeRatio: number
    juX: number
    deltaFromCurrent: number
    basis: string
  }>
  xGapHypothesis: {
    candidateId: string
    reason: string
    provisional: boolean
    status: string
  }
  recommendation: {
    variantId: string
    reason: string
    provisional: boolean
  }
}

const htmlBytes = readFileSync(HTML_URL)
const html = htmlBytes.toString('utf8')
const manifestText = readFileSync(MANIFEST_URL, 'utf8')
const manifest = JSON.parse(manifestText) as EvidenceManifest

function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

function embeddedManifestText(): string {
  const match = html.match(/<script id="evidence-manifest" type="application\/json">([\s\S]*?)<\/script>/)
  if (!match?.[1]) throw new Error('HTML 안에 evidence-manifest JSON이 필요합니다.')
  return match[1]
}

describe('S0b 세로모음 X 간격 evidence artifact', () => {
  it('승인 전 상태와 6 fonts × 10 glyphs, 4 candidates 범위를 exact 고정한다', () => {
    expect(manifest).toMatchObject({
      schema: 'vertical-vowel-gap-evidence-v1',
      version: 1,
      checkpoint: 'S0b',
      status: 'candidate',
      approved: false,
      productionValueApplied: false,
      corpus: {
        fontCount: 6,
        glyphCount: 10,
        referenceSampleCount: 60,
        candidateCount: 4,
        missingCount: 0,
      },
    })
    expect(manifest.corpus.glyphs).toEqual(EXPECTED_GLYPHS)
    expect(manifest.fonts.map(({ id }) => id)).toEqual(EXPECTED_FONT_IDS)
    expect(manifest.candidates.map(({ id }) => id)).toEqual(EXPECTED_CANDIDATE_IDS)
    expect(manifest.decision).toMatchObject({
      mode: 'comparison-only-y-calibration',
      xGapVerdict: 'suspended',
    })
    expect(manifest.xGapHypothesis).toMatchObject({
      candidateId: 'b',
      provisional: true,
      status: 'suspended-until-y-calibration',
    })
    expect(manifest.recommendation).toMatchObject({ variantId: 'noto-envelope', provisional: true })
    expect(manifest.decision.question).toBe(
      '다음 X 간격 비교에서 Noto Sans KR 400 `가`의 잉크 상·하단에 맞춘 Y 표시안을 사용할까요?',
    )
  })

  it('60 reference 조합과 font provenance가 빠짐없이 유일하다', () => {
    const expectedPairs = EXPECTED_FONT_IDS.flatMap((fontId) => (
      EXPECTED_GLYPHS.map((glyph) => `${fontId}:${glyph}`)
    )).sort()
    const actualPairs = manifest.references.map(({ fontId, glyph }) => `${fontId}:${glyph}`).sort()
    expect(actualPairs).toEqual(expectedPairs)

    for (const font of manifest.fonts) {
      expect(font.weight).toBe(400)
      expect(font.license).toBe('SIL Open Font License 1.1')
      expect(font.source).toMatch(/^https:\/\/github\.com\/google\/fonts\//)
      expect(font.fileSha256).toMatch(SHA256)
    }
    expect(manifest.measurement.coreFontIds).toEqual(EXPECTED_FONT_IDS.slice(0, 4))
    expect(manifest.measurement.excludedFromAggregation).toEqual(EXPECTED_FONT_IDS.slice(4))

    for (const reference of manifest.references) {
      expect(reference.pathSha256).toMatch(SHA256)
      expect(reference.unitsPerEm).toBeGreaterThan(0)
      expect(Number.isFinite(reference.advance)).toBe(true)
      expect(reference.bounds).toHaveLength(4)
      expect(reference.bounds.every(Number.isFinite)).toBe(true)
      const [xMin, yMin, xMax, yMax] = reference.bounds.map((value) => value * 1000)
      const [viewX, viewY, viewWidth, viewHeight] = manifest.display.viewBox
      expect(xMin!).toBeGreaterThanOrEqual(viewX!)
      expect(xMax!).toBeLessThanOrEqual(viewX! + viewWidth!)
      expect(manifest.display.coordinateFrame.baselineY - yMax!).toBeGreaterThanOrEqual(viewY!)
      expect(manifest.display.coordinateFrame.baselineY - yMin!).toBeLessThanOrEqual(viewY! + viewHeight!)
    }
    const measured = manifest.references.filter(({ measurement }) => measurement !== null)
    expect(measured).toHaveLength(6)
    expect(measured.every(({ glyph, measurement }) => (
      glyph === '가'
      && measurement !== null
      && measurement.right > measurement.left
      && measurement.value > 0
    ))).toBe(true)
  })

  it('분석값과 HTML bytes의 SHA-256 및 embedded manifest가 sidecar와 일치한다', () => {
    expect(manifest.analysisSha256).toBe(EXPECTED_ANALYSIS_SHA256)
    expect(manifest.htmlSha256).toBe(EXPECTED_HTML_SHA256)
    expect(sha256(htmlBytes)).toBe(manifest.htmlSha256)

    const embeddedText = embeddedManifestText()
    const embedded = JSON.parse(embeddedText) as Record<string, unknown>
    const sidecarCore = JSON.parse(manifestText) as Record<string, unknown>
    delete sidecarCore.htmlSha256
    expect(embedded).toEqual(sidecarCore)

    const analysisBasis = embeddedText.replace(
      `{"analysisSha256":"${manifest.analysisSha256}",`,
      '{',
    )
    expect(analysisBasis).not.toBe(embeddedText)
    expect(sha256(analysisBasis)).toBe(manifest.analysisSha256)
    expect(manifestText).not.toMatch(/\/(?:Users|private|tmp)\//)
  })

  it('X 판정을 보류하고 Current·Body-fit·Noto-envelope Y 표시안을 exact 고정한다', () => {
    const calibration = manifest.comparisonYCalibration
    expect(calibration).toMatchObject({
      status: 'candidate',
      scope: 'display-only',
      productionApplied: false,
      recommendedVariantId: 'noto-envelope',
      control: {
        gapFontUnits: 149.9486083984375,
        strokeWidth: 75,
        xCalibration: 'Noto 가의 전폭 X 빈 띠와 exact 일치',
      },
      sourceCenterlines: {
        chTop: 300,
        chBottom: 675,
        juTop: 245,
        juArm: 500,
        juBottom: 755,
      },
    })
    expect(calibration.variants.map(({ id }) => id)).toEqual(['current', 'body-fit', 'noto-envelope'])
    expect(calibration.limitation).toContain('5선 위치의 승인이 아니다')

    const variants = Object.fromEntries(calibration.variants.map((variant) => [variant.id, variant]))
    expect(variants.current).toMatchObject({
      targetInkEnvelope: { top: 207.5, bottom: 792.5 },
      affine: { scaleY: 1, offsetY: 0 },
    })
    expect(variants['body-fit']).toMatchObject({
      targetInkEnvelope: { top: 75, bottom: 925 },
      targetCenterlineEnvelope: { top: 112.5, bottom: 887.5 },
      bodyOverflow: { top: 0, bottom: 0 },
    })
    expect(variants['noto-envelope']).toMatchObject({
      targetInkEnvelope: {
        top: 52.6895751953125,
        bottom: 957.140380859375,
      },
      targetCenterlineEnvelope: {
        top: 90.1895751953125,
        bottom: 919.640380859375,
      },
      bodyOverflow: {
        top: 22.3104248046875,
        bottom: 32.140380859375,
      },
    })
    expect(variants['noto-envelope']?.affine.scaleY).toBeCloseTo(1.6263741287530638, 12)
    expect(variants['noto-envelope']?.mappedCenterlines).toMatchObject({
      chTop: 179.64015227673104,
      chBottom: 789.5304505591298,
      juTop: 90.1895751953125,
      juArm: 504.9149780273438,
      juBottom: 919.640380859375,
    })

    const halfStroke = calibration.control.strokeWidth / 2
    for (const variant of calibration.variants) {
      expect(variant.targetCenterlineEnvelope.top - halfStroke).toBeCloseTo(
        variant.targetInkEnvelope.top,
        10,
      )
      expect(variant.targetCenterlineEnvelope.bottom + halfStroke).toBeCloseTo(
        variant.targetInkEnvelope.bottom,
        10,
      )
    }
    const notoReference = manifest.references.find(({ fontId, glyph }) => (
      fontId === 'noto-sans-kr' && glyph === '가'
    ))
    expect(notoReference).toBeDefined()
    expect(calibration.reference.pathSha256).toBe(notoReference?.pathSha256)
    expect(calibration.reference.inkEnvelope.top).toBeCloseTo(
      880 - notoReference!.bounds[3]! * 1000,
      10,
    )
    expect(calibration.reference.inkEnvelope.bottom).toBeCloseTo(
      880 - notoReference!.bounds[1]! * 1000,
      10,
    )
    expect(html.match(/data-testid="y-calibration-specimen"/g)).toHaveLength(4)
    expect(html).not.toContain('value="B 동결"')
  })

  it('Noto 기준 표시 크기·굵기에서 A/B/C 실제 잉크 간격을 유지한다', () => {
    expect(manifest.measurement).toMatchObject({
      id: 'whole-x-empty-band',
      validForNumericAggregation: ['가'],
      roundedFontUnitTargets: { p25: 170, median: 190, p75: 205 },
    })
    expect(manifest.measurement.limitations.length).toBeGreaterThan(0)
    expect(manifest.shapeGeometry).toMatchObject({
      onlyVariable: 'JU X translation',
      unitsPerEm: 1000,
      strokeWidth: 75,
      chRightCenter: 495,
      juCenterOffset: 87.1875,
      strokeReference: {
        fontId: 'noto-sans-kr',
        glyph: '가',
        weight: 400,
        samples: {
          chHorizontal: 68.6114501953,
          juHorizontal: 69.1715087891,
          juVertical: 83.3118896484,
        },
        roundedValue: 75,
      },
    })
    expect(manifest.shapeGeometry.strokeReference.method.length).toBeGreaterThan(0)
    expect(manifest.shapeGeometry.strokeReference.limitation.length).toBeGreaterThan(0)
    expect(manifest.display).toEqual({
      viewBox: [-120, -120, 1240, 1240],
      unitsPerEm: 1000,
      rule: '공통 Font Space에서 reference는 원본, candidate는 명시한 comparison-only Y variant로 표시',
      coordinateFrame: {
        method: 'shared-baseline',
        ascender: 880,
        descender: -120,
        baselineY: 880,
        xOrigin: 0,
        yDirection: 'down',
        referenceTransform: 'y=880-fontY*1000/nativeUPM',
        candidateCoordinates: 'font-space-y-down + explicit comparisonYCalibration variant',
        inkAutofit: false,
        individualCentering: false,
        advanceNormalization: false,
        emGuide: [0, 0, 1000, 1000],
        designBodyGuide: [75, 75, 850, 850],
        designBodyGuideRole: 'guide-only',
        gapBandY: [75, 925],
      },
      glanceStrip: {
        glyph: '가',
        order: [
          'reference:noto-sans-kr',
          'reference:ibm-plex-sans-kr',
          'reference:nanum-gothic',
          'reference:dotum',
          'reference:gowun-dodum',
          'reference:black-han-sans',
          'candidate:current',
          'candidate:a',
          'candidate:b',
          'candidate:c',
        ],
      },
    })
    expect(new Set(manifest.display.glanceStrip.order).size).toBe(10)
    expect(html.match(/data-coordinate-frame="shared-baseline"/g)).toHaveLength(78)
    expect(html.match(/data-guide="baseline"/g)).toHaveLength(78)
    expect(html.match(/data-font-projection="upm-to-shared-baseline"/g)).toHaveLength(67)
    expect(html).not.toMatch(/matrix\([^)]* 0 1000\)/)

    const byId = Object.fromEntries(manifest.candidates.map((candidate) => [candidate.id, candidate]))
    expect(byId.a?.gapFontUnits).toBe(manifest.measurement.roundedFontUnitTargets.p25)
    expect(byId.b?.gapFontUnits).toBe(manifest.measurement.roundedFontUnitTargets.median)
    expect(byId.c?.gapFontUnits).toBe(manifest.measurement.roundedFontUnitTargets.p75)
    expect([byId.a?.gap, byId.b?.gap, byId.c?.gap, byId.current?.gap]).toEqual([
      0.17,
      0.19,
      0.205,
      0.26781249999999995,
    ])
    expect([byId.current?.juX, byId.a?.juX, byId.b?.juX, byId.c?.juX]).toEqual([
      0.750625,
      0.6528125,
      0.6728125,
      0.6878124999999999,
    ])
    expect(manifest.candidates.every((candidate) => (
      Number.isFinite(candidate.gap)
      && Number.isFinite(candidate.strokeRatio)
      && Number.isFinite(candidate.juX)
      && Number.isFinite(candidate.deltaFromCurrent)
      && candidate.basis.length > 0
    ))).toBe(true)
    for (const candidate of manifest.candidates) {
      const juLeftInk = candidate.juX * 1000
        + manifest.shapeGeometry.juCenterOffset
        - manifest.shapeGeometry.strokeWidth / 2
      const chRightInk = manifest.shapeGeometry.chRightCenter
        + manifest.shapeGeometry.strokeWidth / 2
      expect(juLeftInk - chRightInk).toBeCloseTo(candidate.gapFontUnits, 8)
    }
  })
})
