import { devices, expect, test, type Page } from '@playwright/test'
import { medialGuideG0GoldCase } from '../../src-next/medialGuideGoldModel'

const LAB_URL = '/font-guide-lab?font=ibm-plex-sans-kr'
const DISPLAY = {
  unitsPerEm: 1000, baselineY: 880, viewBox: [-120, -120, 1240, 1240], xOrigin: 0,
  projection: 'matrix(1000/nativeUPM 0 0 -1000/nativeUPM 0 880)', inkAutofit: false, individualCentering: false, advanceNormalization: false,
} as const
const fonts = [
  { id: 'noto-sans-kr', family: 'Noto Sans KR', fileName: 'noto.ttf', fileSha256: '194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252', source: 'https://example.invalid/noto', license: 'OFL', weight: 400, axes: { wght: 400 } },
  { id: 'ibm-plex-sans-kr', family: 'IBM Plex Sans KR', fileName: 'ibm.ttf', fileSha256: '2'.padStart(64, '0'), source: 'https://example.invalid/ibm', license: 'OFL', weight: 400, axes: {} },
  { id: 'nanum-gothic', family: 'Nanum Gothic', fileName: 'nanum.ttf', fileSha256: '76f45ef4a6bcff344c837c95a7dcc26e017e38b5846d5ae0cdcb5b86be2e2d31', source: 'https://example.invalid/nanum', license: 'OFL', weight: 400, axes: {} },
] as const

function glyphPathSha(character: string) {
  return character.codePointAt(0)!.toString(16).padStart(64, '0')
}

function outlineResponse(text: string, fontIds: readonly string[]) {
  return {
    schema: 'reference-outline-response-v1', apiVersion: 'reference.v1', text, display: DISPLAY,
    samples: fontIds.map((fontId) => ({
      fontId,
      glyphs: Array.from(text).map((character, index) => ({
        character, codepoint: `U+${character.codePointAt(0)!.toString(16).toUpperCase()}`, missing: false,
        glyphName: `${fontId}-${index}`, path: 'M60 0H760V840H60Z', pathSha256: glyphPathSha(character),
        unitsPerEm: 1000, advance: 1, bounds: [0.06, 0, 0.76, 0.84],
      })),
    })),
  }
}

type MedialCandidateRequestCase = { character: string; initialJamo: string; medialJamo: string; finalJamo: string | null }
type InitialComponentRequestCase = MedialCandidateRequestCase & { contextId: 'right' | 'right-final' | 'bottom' | 'bottom-final' | 'mixed' | 'mixed-final' }
type FinalComponentDisplayRequestCase = { character: string; initialJamo: string; medialJamo: 'ㅏ' | 'ㅗ' | 'ㅘ'; finalJamo: string; contextId: 'right-final' | 'bottom-final' | 'mixed-final' }

const FINAL_DISPLAY_TEST_SPECS = {
  'ㄱ': { structureKind: 'single', members: [{ id: 'only', jamo: 'ㄱ', role: 'only' }] },
  'ㄳ': { structureKind: 'compound', members: [{ id: 'left', jamo: 'ㄱ', role: 'left' }, { id: 'right', jamo: 'ㅅ', role: 'right' }] },
} as const

const G0_TEMPLATE_CHARACTER: Readonly<Record<string, readonly [string, string]>> = {
  'ㅏ': ['가', '각'],
  'ㅓ': ['거', '걱'],
  'ㅣ': ['기', '긱'],
  'ㅗ': ['고', '곡'],
  'ㅜ': ['구', '국'],
  'ㅡ': ['그', '극'],
  'ㅘ': ['과', '곽'],
}

type P1ElementId = 'innerPillar' | 'outerPillar' | 'primaryBeam' | 'baseStem' | 'leftStem' | 'rightStem' | 'upperBeam' | 'lowerBeam'

const P1_ELEMENT_IDS: Readonly<Record<string, readonly P1ElementId[]>> = {
  'ㅐ': ['innerPillar', 'outerPillar', 'primaryBeam'],
  'ㅑ': ['outerPillar', 'upperBeam', 'lowerBeam'],
  'ㅒ': ['innerPillar', 'outerPillar', 'upperBeam', 'lowerBeam'],
  'ㅔ': ['innerPillar', 'outerPillar', 'primaryBeam'],
  'ㅕ': ['outerPillar', 'upperBeam', 'lowerBeam'],
  'ㅖ': ['innerPillar', 'outerPillar', 'upperBeam', 'lowerBeam'],
  'ㅙ': ['baseStem', 'innerPillar', 'outerPillar', 'upperBeam', 'lowerBeam'],
  'ㅚ': ['baseStem', 'outerPillar', 'primaryBeam'],
  'ㅛ': ['leftStem', 'rightStem', 'primaryBeam'],
  'ㅝ': ['baseStem', 'outerPillar', 'upperBeam', 'lowerBeam'],
  'ㅞ': ['baseStem', 'innerPillar', 'outerPillar', 'upperBeam', 'lowerBeam'],
  'ㅟ': ['baseStem', 'outerPillar', 'primaryBeam'],
  'ㅠ': ['leftStem', 'rightStem', 'primaryBeam'],
  'ㅢ': ['outerPillar', 'primaryBeam'],
}

const P1_ELEMENT_META = {
  innerPillar: { orientation: 'vertical', faceSide: 'right', legacyFaceRole: 'innerPillarFace', legacyTipRole: null },
  outerPillar: { orientation: 'vertical', faceSide: 'right', legacyFaceRole: 'outerPillarFace', legacyTipRole: null },
  primaryBeam: { orientation: 'horizontal', faceSide: 'top', legacyFaceRole: 'primaryBeamFace', legacyTipRole: null },
  baseStem: { orientation: 'vertical', faceSide: 'right', legacyFaceRole: 'basePillarFace', legacyTipRole: 'baseStemTipFace' },
  leftStem: { orientation: 'vertical', faceSide: 'right', legacyFaceRole: 'leftStemFace', legacyTipRole: 'leftStemTipFace' },
  rightStem: { orientation: 'vertical', faceSide: 'right', legacyFaceRole: 'rightStemFace', legacyTipRole: 'rightStemTipFace' },
  upperBeam: { orientation: 'horizontal', faceSide: 'top', legacyFaceRole: 'upperBeamFace', legacyTipRole: null },
  lowerBeam: { orientation: 'horizontal', faceSide: 'top', legacyFaceRole: 'lowerBeamFace', legacyTipRole: null },
} as const

function medialCandidateResponse(cases: readonly MedialCandidateRequestCase[], fontId: string = fonts[0].id) {
  const font = fonts.find(({ id }) => id === fontId)
  if (!font) throw new Error(`${fontId} fixture 폰트가 필요합니다.`)
  return {
    schema: 'reference-medial-guide-candidate-response-v1', apiVersion: 'reference.v1', extractorVersion: 'geometric-role-matcher-v9',
    roleDefinitionVersion: 'medial-guide-role-v4', coordinateFrame: 'shared-baseline', matching: 'geometry-role-search',
    font: { id: font.id, fileSha256: font.fileSha256, axes: font.axes },
    cases: cases.map((candidateCase, caseIndex) => {
      const templateCharacter = G0_TEMPLATE_CHARACTER[candidateCase.medialJamo]?.[candidateCase.finalJamo === null ? 0 : 1]
      const goldCase = medialGuideG0GoldCase(candidateCase.character) ?? (templateCharacter ? medialGuideG0GoldCase(templateCharacter) : null)
      if (!goldCase) {
        const elementIds = P1_ELEMENT_IDS[candidateCase.medialJamo]
        if (!elementIds) throw new Error(`${candidateCase.character} 홀자 fixture가 필요합니다.`)
        return {
          ...candidateCase, status: 'candidate', glyphName: `${font.id}-${caseIndex}`, pathSha256: glyphPathSha(candidateCase.character),
          elements: elementIds.map((elementId, elementIndex) => {
            const meta = P1_ELEMENT_META[elementId]
            const evidence = {
              hypothesisId: `${elementId}:contour-${elementIndex}:${meta.faceSide}`,
              contourId: elementIndex,
              segmentIds: [0],
              method: 'geometric-role-matcher-v9',
              referenceMode: 'axis-aligned-face',
              matchingUnit: 'axis-face-segment-group',
              roleStrategy: `fixture-${elementId}`,
            }
            const value = 220 + elementIndex * 120 + caseIndex
            return {
              elementId, ...meta,
              face: { status: 'candidate', value, evidence },
              visibleSpans: { status: 'candidate', value: [{ from: 100, to: 800 }], evidence },
              componentSpans: [{ from: 100, to: 800 }], derived: { extent: 700, visibleLength: 700 },
              match: { status: 'matched', score: 0.9, confidence: 'medium', margin: 0.4, alternatives: [{ contourId: elementIndex, score: 0.9 }] },
            }
          }),
        }
      }
      return {
        ...candidateCase, status: 'candidate', glyphName: `${font.id}-${caseIndex}`, pathSha256: glyphPathSha(candidateCase.character),
        elements: goldCase.elements.map((element, elementIndex) => {
          const evidence = {
            hypothesisId: `${element.elementId}:contour-${elementIndex}:${element.faceSide}`,
            contourId: elementIndex,
            segmentIds: element.face.status === 'candidate' ? [0] : [],
            method: 'geometric-role-matcher-v3',
            referenceMode: element.face.referenceMode,
            ...(element.face.status === 'candidate' && element.face.referenceMode === 'start-side-local-tangent' ? {
              referenceSide: element.face.referenceSide,
              anchor: element.face.anchor,
              maximumDeviation: element.face.maximumDeviation,
            } : {}),
          }
          const legacyFaceRole = element.elementId === 'outerPillar' ? 'outerPillarFace' : element.elementId === 'baseStem' ? 'basePillarFace' : element.elementId === 'upperBeam' ? 'upperBeamFace' : element.elementId === 'lowerBeam' ? 'lowerBeamFace' : 'primaryBeamFace'
          const match = { status: 'matched', score: 0.99, confidence: 'high', margin: 0.99, alternatives: [{ contourId: elementIndex, score: 0.99 }] }
          if (element.face.status === 'abstained' || element.visibleSpans.status === 'abstained') return {
            elementId: element.elementId, orientation: element.orientation, faceSide: element.faceSide, legacyFaceRole, legacyTipRole: null,
            face: { status: 'abstained', reasonCode: element.face.status === 'abstained' ? element.face.reasonCode : element.visibleSpans.reasonCode, evidence },
            visibleSpans: { status: 'abstained', reasonCode: element.visibleSpans.status === 'abstained' ? element.visibleSpans.reasonCode : element.face.reasonCode, evidence },
            match,
          }
          return {
            elementId: element.elementId, orientation: element.orientation, faceSide: element.faceSide,
            legacyFaceRole, legacyTipRole: element.elementId === 'baseStem' ? 'baseStemTipFace' : null,
            face: { status: 'candidate', value: element.face.value, evidence }, visibleSpans: { status: 'candidate', value: element.visibleSpans.value, evidence },
            componentSpans: element.componentSpans, derived: element.derived,
            match,
          }
        }),
      }
    }),
  }
}

const INITIAL_CONTEXT_META = {
  right: { scanOrigin: 'medial-outer-pillar', scanDirection: 'right-to-left' },
  'right-final': { scanOrigin: 'medial-outer-pillar', scanDirection: 'right-to-left-and-upper-cluster' },
  bottom: { scanOrigin: 'medial-primary-beam', scanDirection: 'bottom-to-top' },
  'bottom-final': { scanOrigin: 'medial-primary-beam', scanDirection: 'bottom-to-top' },
  mixed: { scanOrigin: 'medial-base-beam-and-outer-pillar', scanDirection: 'anchor-to-upper-left' },
  'mixed-final': { scanOrigin: 'medial-base-beam-and-outer-pillar', scanDirection: 'anchor-to-upper-left' },
} as const

function initialRoleSpec(initialJamo: string) {
  if (['ㄴ', 'ㅅ', 'ㅆ', 'ㅇ'].includes(initialJamo)) return { roleClass: 'full-component', horizontalRule: 'component-ink-extremum' }
  if (['ㄲ', 'ㄸ', 'ㅃ', 'ㅉ'].includes(initialJamo)) return { roleClass: 'paired-first-main-horizontal', horizontalRule: 'paired-first-main-horizontal-endpoint' }
  if (['ㅊ', 'ㅎ'].includes(initialJamo)) return { roleClass: 'marked-body-horizontal', horizontalRule: 'body-main-horizontal-endpoint' }
  return { roleClass: 'first-main-horizontal', horizontalRule: 'first-main-horizontal-endpoint' }
}

function initialComponentCandidateResponse(cases: readonly InitialComponentRequestCase[], fontId: string) {
  const font = fonts.find(({ id }) => id === fontId)
  if (!font) throw new Error(`${fontId} fixture 폰트가 필요합니다.`)
  return {
    schema: 'reference-initial-component-candidate-response-v2', apiVersion: 'reference.v1', extractorVersion: 'initial-component-matcher-v3',
    roleDefinitionVersion: 'initial-component-role-v2', medialAnchorExtractorVersion: 'geometric-role-matcher-v9', coordinateFrame: 'shared-baseline', matching: 'medial-anchored-component-grouping',
    font: { id: font.id, fileSha256: font.fileSha256, axes: font.axes },
    cases: cases.map((candidateCase, caseIndex) => {
      const commonEvidence = { source: 'actual-glyph-outline', medialAnchorExtractorVersion: 'geometric-role-matcher-v9' }
      const bounds = { top: 110 + caseIndex, bottom: 470 + caseIndex, left: 80 + caseIndex, right: 460 + caseIndex }
      const roleSpec = initialRoleSpec(candidateCase.initialJamo)
      const axisFaces = Object.fromEntries((['top', 'bottom', 'left', 'right'] as const).map((side, sideIndex) => {
        const orientation = side === 'left' || side === 'right' ? 'vertical' : 'horizontal'
        const value = bounds[side]
        const visibleSpans = orientation === 'vertical'
          ? [{ from: bounds.top, to: bounds.bottom }]
          : [{ from: bounds.left, to: bounds.right }]
        return [side, {
          status: 'candidate',
          value: [{ orientation, side, value, visibleSpans, contourId: 0, segmentIds: [sideIndex] }],
          evidence: { ...commonEvidence, method: 'selected-component-axis-face-v1', side },
        }]
      }))
      return {
        ...candidateCase,
        status: 'candidate', glyphName: `${font.id}-${caseIndex}`, pathSha256: glyphPathSha(candidateCase.character),
        componentGroup: {
          status: 'candidate', value: { contourIds: [0], holeContourIds: [], selectedPathSha256: 'a'.repeat(64) },
          evidence: { ...commonEvidence, method: 'medial-anchored-component-grouping-v1', ...INITIAL_CONTEXT_META[candidateCase.contextId], selectionRule: fontId === 'nanum-gothic' && candidateCase.contextId === 'bottom' ? 'context-directed-merged-boundary' : 'context-directed-contour-islands', score: 0.95, margin: 120 },
        },
        inkBounds: Object.fromEntries((['top', 'bottom', 'left', 'right'] as const).map((side) => [side, {
          status: 'candidate', value: bounds[side], evidence: { ...commonEvidence, method: 'bezier-ink-extremum-v1', side, contourIds: [0] },
        }])),
        axisFaces,
        roleFaces: Object.fromEntries((['top', 'bottom', 'left', 'right'] as const).map((side) => {
          const selectionRule = side === 'top' || side === 'bottom' ? 'component-ink-extremum' : roleSpec.horizontalRule
          const usesInkBound = selectionRule === 'component-ink-extremum'
          return [side, {
            status: 'candidate',
            value: bounds[side],
            evidence: {
              ...commonEvidence,
              method: 'initial-structure-role-face-v2',
              side,
              roleClass: roleSpec.roleClass,
              selectionRule,
              sourceSide: usesInkBound ? side : 'top',
              sourceValues: [usesInkBound ? bounds[side] : bounds.top],
              contourIds: [0],
              segmentIds: usesInkBound ? [] : [0],
              sourceSpans: usesInkBound ? [] : [{ from: bounds.left, to: bounds.right }],
            },
          }]
        })),
        selectionArea: {
          status: 'candidate', value: { x: bounds.left, y: bounds.top, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top },
          evidence: { ...commonEvidence, method: 'derived-four-role-faces-v2', derivedFrom: ['top', 'bottom', 'left', 'right'] },
        },
      }
    }),
  }
}

function finalComponentDisplayResponse(cases: readonly FinalComponentDisplayRequestCase[], fontId: string) {
  const font = fonts.find(({ id }) => id === fontId)
  if (!font) throw new Error(`${fontId} fixture 폰트가 필요합니다.`)
  return {
    schema: 'reference-final-component-display-response-v1', apiVersion: 'reference.v1', coordinateFrame: 'shared-baseline',
    extractorVersion: 'final-component-matcher-v2', roleDefinitionVersion: 'final-component-role-v1', medialAnchorExtractorVersion: 'geometric-role-matcher-v9',
    source: {
      candidateArtifactSha256: 'a'.repeat(64), candidateIdentitySha256: 'b'.repeat(64),
      verification: { state: 'verified', reviewedAt: '2026-09-15T00:00:00+09:00', reviewedBy: 'e2e-fixture' },
    },
    font: { id: font.id, fileSha256: font.fileSha256, axes: font.axes },
    cases: cases.map((candidateCase, caseIndex) => {
      const spec = FINAL_DISPLAY_TEST_SPECS[candidateCase.finalJamo as keyof typeof FINAL_DISPLAY_TEST_SPECS]
      if (!spec) throw new Error(`${candidateCase.finalJamo} 받침 fixture가 필요합니다.`)
      const bounds = { top: 600 + caseIndex, bottom: 810 + caseIndex, left: 100 + caseIndex, right: 820 + caseIndex }
      const memberPaths = spec.members.map((member, memberIndex) => ({
        id: member.id,
        path: member.id === 'right' ? `M${460 + memberIndex * 40} 600H760V810H${460 + memberIndex * 40}Z` : `M100 600H${member.id === 'left' ? 440 : 820}V810H100Z`,
      }))
      const axisFaces = Object.fromEntries((['top', 'bottom', 'left', 'right'] as const).map((side) => {
        const orientation = side === 'left' || side === 'right' ? 'vertical' : 'horizontal'
        return [side, {
          status: 'candidate',
          value: [{ orientation, value: bounds[side], visibleSpans: orientation === 'vertical' ? [{ from: bounds.top, to: bounds.bottom }] : [{ from: bounds.left, to: bounds.right }] }],
        }]
      }))
      return {
        identity: {
          fontSha256: font.fileSha256, axes: font.axes, character: candidateCase.character, codepoint: candidateCase.character.codePointAt(0), glyphName: `${font.id}-final-${caseIndex}`, pathSha256: glyphPathSha(candidateCase.character),
          initialJamo: candidateCase.initialJamo, medialJamo: candidateCase.medialJamo, finalJamo: candidateCase.finalJamo, contextId: candidateCase.contextId,
          schemaVersion: 'final-component-p0-contract-v1', extractorVersion: 'final-component-matcher-v2', roleDefinitionVersion: 'final-component-role-v1',
        },
        state: 'candidate', structureKind: spec.structureKind,
        members: spec.members.map((member, memberIndex) => ({ ...member, contourIds: [memberIndex] })),
        memberPaths,
        componentGroup: { contourIds: spec.members.map((_, memberIndex) => memberIndex), holeContourIds: [], selectedPathSha256: 'c'.repeat(64) },
        memberRelation: spec.members.length === 1 ? null : { relation: 'disjoint', leftAnchorX: 220, rightAnchorX: 620 },
        inkBounds: Object.fromEntries((['top', 'bottom', 'left', 'right'] as const).map((side) => [side, { status: 'candidate', value: bounds[side] }])),
        axisFaces,
        roleFaces: Object.fromEntries((['top', 'bottom', 'left', 'right'] as const).map((side) => [side, { status: 'candidate', value: bounds[side] }])),
        selectionArea: { status: 'candidate', value: { x: bounds.left, y: bounds.top, width: bounds.right - bounds.left, height: bounds.bottom - bounds.top } },
      }
    }),
  }
}

async function installApiFixture(
  page: Page,
  requests: Array<{ text: string; fontIds: string[] }>,
  beforeCandidateResponse?: (cases: readonly MedialCandidateRequestCase[]) => Promise<void>,
  candidateRequests?: MedialCandidateRequestCase[][],
  beforeInitialComponentResponse?: (cases: readonly InitialComponentRequestCase[]) => Promise<void>,
  initialComponentRequests?: InitialComponentRequestCase[][],
  finalComponentRequests?: FinalComponentDisplayRequestCase[][],
) {
  await page.route('**/api/reference/v1/fonts', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', json: { schema: 'reference-font-catalog-response-v1', apiVersion: 'reference.v1', display: DISPLAY, fonts } })
  })
  await page.route('**/api/reference/v1/outlines', async (route) => {
    const body = route.request().postDataJSON() as { text: string; fontIds: string[] }
    requests.push(body)
    await route.fulfill({ status: 200, contentType: 'application/json', json: outlineResponse(body.text, body.fontIds) })
  })
  await page.route('**/api/reference/v1/medial-guide-candidates', async (route) => {
    const body = route.request().postDataJSON() as { fontId: string; cases: MedialCandidateRequestCase[] }
    candidateRequests?.push(body.cases)
    await beforeCandidateResponse?.(body.cases)
    await route.fulfill({ status: 200, contentType: 'application/json', json: medialCandidateResponse(body.cases, body.fontId) })
  })
  await page.route('**/api/reference/v1/initial-component-candidates', async (route) => {
    const body = route.request().postDataJSON() as { fontId: string; cases: InitialComponentRequestCase[] }
    initialComponentRequests?.push(body.cases)
    await beforeInitialComponentResponse?.(body.cases)
    await route.fulfill({ status: 200, contentType: 'application/json', json: initialComponentCandidateResponse(body.cases, body.fontId) })
  })
  await page.route('**/api/reference/v1/final-component-display', async (route) => {
    const body = route.request().postDataJSON() as { fontId: string; cases: FinalComponentDisplayRequestCase[] }
    finalComponentRequests?.push(body.cases)
    await route.fulfill({ status: 200, contentType: 'application/json', json: finalComponentDisplayResponse(body.cases, body.fontId) })
  })
}

test.describe('Font Guide Lab', () => {
  test.use({
    userAgent: devices['Desktop Chrome'].userAgent, viewport: { width: 1280, height: 900 }, screen: { width: 1280, height: 900 },
    deviceScaleFactor: devices['Desktop Chrome'].deviceScaleFactor, isMobile: devices['Desktop Chrome'].isMobile, hasTouch: devices['Desktop Chrome'].hasTouch,
  })

  test('폰트·글자 전환을 유지하며 레거시 기준선을 노출하지 않는다', async ({ page }) => {
    const requests: Array<{ text: string; fontIds: string[] }> = []
    await installApiFixture(page, requests)
    await page.goto(LAB_URL)

    await expect(page.getByTestId('font-guide-lab')).toBeVisible()
    await expect(page.getByRole('button', { name: 'IBM Plex Sans KR' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => requests).toEqual([{ text: '가각고곡과곽', fontIds: ['ibm-plex-sans-kr'] }])
    await expect(page.getByTestId('font-guide-pair')).toHaveCount(3)
    await expect(page.getByTestId('font-guide-pair').first()).toHaveAttribute('aria-label', '가로 첫닿자 ↔ 오른쪽 홀자 · 받침')
    await expect(page.getByTestId('font-guide-case')).toHaveCount(6)
    await expect(page.getByTestId('font-guide-glyph')).toHaveCount(6)
    await expect(page.locator('[data-context-id="initial-horizontal"]')).toHaveAttribute('data-glyph', '가')
    await expect(page.locator('[data-context-id="initial-horizontal-final"]')).toHaveAttribute('data-glyph', '각')
    await expect(page.locator('[data-context-id="initial-mixed"]')).toHaveAttribute('data-glyph', '과')
    await expect(page.locator('[data-context-id="initial-mixed-final"]')).toHaveAttribute('data-glyph', '곽')
    await expect(page.locator('[data-context-id="initial-vertical"]')).toHaveAttribute('data-glyph', '고')
    await expect(page.locator('[data-context-id="initial-vertical-final"]')).toHaveAttribute('data-glyph', '곡')
    await expect(page.locator('[data-guide-id]')).toHaveCount(0)
    await expect(page.locator('[data-guide-region]')).toHaveCount(0)
    await expect(page.locator('[data-card-guide-control-id="initialTop"]')).toHaveCount(0)
    await expect(page.locator('[data-card-guide-control-id="finalTop"]')).toHaveCount(0)
    await expect(page.locator('[data-card-guide-control-id="pillarX"]')).toHaveCount(0)
    await expect(page.locator('[data-guide-line-id]')).toHaveCount(0)
    await expect(page.getByText('레거시 첫닿·받침·기둥선은 숨깁니다.', { exact: false })).toBeVisible()
    await expect(page.getByRole('button', { name: /사례 기준선 선택/ })).toHaveCount(0)

    await page.getByRole('button', { name: 'ㄴ' }).click()
    await expect.poll(() => requests.length).toBe(2)
    await expect.poll(() => requests[1]).toEqual({ text: '나낙노녹놔놕', fontIds: ['ibm-plex-sans-kr'] })
    await expect(page.getByTestId('font-guide-case').first()).toHaveAttribute('data-glyph', '나')
    await expect(page.getByRole('spinbutton', { name: '나 · 첫닿윗선' })).toHaveCount(0)
    await page.getByRole('button', { name: 'ㄱ' }).click()
    await expect(page.getByRole('spinbutton', { name: '가 · 첫닿윗선' })).toHaveCount(0)

    await page.getByRole('button', { name: 'Noto Sans KR' }).click()
    await expect.poll(() => requests.length).toBe(4)
    await expect(page.getByRole('spinbutton', { name: '가 · 첫닿윗선' })).toHaveCount(0)
    await expect(page.getByRole('spinbutton', { name: '가 · 첫닿왼선' })).toHaveCount(0)
    await expect(page.getByRole('spinbutton', { name: '각 · 받침왼선' })).toHaveCount(0)
    await expect(page.locator('[data-active-guide-region]')).toHaveCount(0)

    await page.getByRole('button', { name: 'ㅓ', exact: true }).click()
    await expect.poll(() => requests.at(-1)).toEqual({ text: '거걱고곡과곽', fontIds: ['noto-sans-kr'] })
    await expect(page.locator('[data-context-id="initial-horizontal"]')).toHaveAttribute('data-glyph', '거')
    await expect(page.locator('[data-context-id="initial-horizontal-final"]')).toHaveAttribute('data-glyph', '걱')
    const medialPillar = page.getByRole('spinbutton', { name: '거 · 관측 기둥선 · 오른면' })
    await expect(medialPillar).toHaveValue('')
    const medialCard = page.locator('[data-context-id="initial-horizontal"]')
    const candidatePillar = medialCard.getByRole('button', { name: /^자동 후보 793$/ })
    await expect(medialCard.locator('[data-medial-face-segment-id="outerPillar"]')).not.toHaveCount(0)
    await candidatePillar.click()
    await expect(medialPillar).toHaveValue('793')
    await expect(medialCard.locator('[data-medial-card-control-id="outerPillarFace"] [data-observation-review="pending"]')).toContainText('자동 후보 채택 · 검토 대기')
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('reference-medial-guide-observations-v3'))).toContain('"method":"automatic-candidate"')
    await expect.poll(() => page.evaluate(() => window.localStorage.getItem('reference-medial-guide-observations-v3'))).toContain('"finalJamo":null')
    await expect(medialCard.locator('[data-medial-overlay-id="outerPillarFace"][data-medial-overlay-source="candidate"]')).toHaveCount(0)
    await expect(medialCard.locator('[data-medial-face-segment-id="outerPillar"]')).not.toHaveCount(0)
    const medialCanvas = medialCard.getByTestId('font-guide-glyph')
    const medialCanvasBox = await medialCanvas.boundingBox()
    expect(medialCanvasBox).not.toBeNull()
    if (!medialCanvasBox) throw new Error('홀자 캔버스가 필요합니다.')
    await medialCanvas.hover({ position: { x: medialCanvasBox.width * 913 / 1240, y: medialCanvasBox.height * 500 / 1240 } })
    await expect(medialCard.locator('[data-medial-overlay-id="outerPillarFace"][data-medial-overlay-source="observation"]')).toHaveAttribute('data-medial-overlay-active', 'true')
    await expect(medialCard.locator('[data-medial-card-control-id="outerPillarFace"]')).toHaveAttribute('data-medial-card-control-active', 'true')
    await medialPillar.hover()
    await expect(medialCard.locator('[data-medial-overlay-id="outerPillarFace"][data-medial-overlay-source="observation"]')).toHaveAttribute('data-medial-overlay-active', 'true')
    await expect(medialCard.locator('[data-medial-overlay-id="outerPillarFace"][data-medial-overlay-source="observation"]')).toHaveCount(1)
    await medialPillar.fill('794')
    await medialPillar.press('Enter')
    await expect(medialCard.locator('[data-medial-card-control-id="outerPillarFace"] [data-observation-review="corrected"]')).toContainText('수정 관측 · 검토 대기')
    const beamControl = medialCard.locator('[data-medial-card-control-id="primaryBeamFace"]')
    await beamControl.getByRole('button', { name: '후보 거부' }).click()
    await expect(beamControl.locator('[data-observation-review="rejected"]')).toContainText('자동 후보 · 거부됨')
    await expect(beamControl.getByRole('button', { name: '후보 거부됨' })).toBeDisabled()
    await expect(medialCard.locator('[data-medial-overlay-id="primaryBeamFace"]')).toHaveCount(0)
    await page.locator('[data-context-id="initial-horizontal"]').getByRole('button', { name: '분석 채택' }).first().click()
    await expect(page.locator('[data-context-id="initial-horizontal"]').getByRole('button', { name: '분석 채택됨' }).first()).toBeDisabled()
  })

  test('고정 나눔고딕은 같은 화면에서 후보를 계산하되 G0 gold로 표시하지 않는다', async ({ page }) => {
    const requests: Array<{ text: string; fontIds: string[] }> = []
    const candidateRequests: MedialCandidateRequestCase[][] = []
    await installApiFixture(page, requests, undefined, candidateRequests)
    await page.goto('/font-guide-lab?font=nanum-gothic')

    await expect(page.getByRole('button', { name: 'Nanum Gothic' })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => candidateRequests.length).toBe(1)
    await expect(page.getByTestId('medial-g0-review')).toHaveCount(0)
    await expect(page.getByTestId('medial-face-elements')).toHaveCount(6)
    await expect(page.getByTestId('medial-face-elements').first()).toContainText('v3 자동 추출 후보')
    await expect(page.getByTestId('medial-face-elements').first()).toContainText('gold·생산값 아님')
    await expect(page.getByTestId('medial-face-elements').first()).not.toContainText('G0 gold')
    const firstCard = page.getByTestId('font-guide-case').first()
    const pillarSummary = firstCard.locator('[data-medial-element-id="outerPillar"]')
    await pillarSummary.hover()
    await expect(pillarSummary).toHaveAttribute('data-medial-element-active', 'true')
    const activePillarFace = firstCard.locator('[data-medial-face-segment-id="outerPillar"]').first()
    await expect(activePillarFace).toHaveAttribute('data-medial-face-active', 'true')
    await expect(activePillarFace).toHaveCSS('stroke-width', '7px')
  })

  test('섞임 홀자는 구조에 맞는 기둥·보 입력만 보인다', async ({ page }) => {
    const requests: Array<{ text: string; fontIds: string[] }> = []
    await installApiFixture(page, requests)
    await page.goto(LAB_URL)

    await page.getByRole('button', { name: 'ㅚ', exact: true }).click()
    await expect.poll(() => requests.at(-1)).toEqual({ text: '가각고곡괴괵', fontIds: ['ibm-plex-sans-kr'] })
    const mixedCard = page.locator('[data-context-id="initial-mixed"]')
    await expect(mixedCard.getByRole('spinbutton', { name: '괴 · 관측 바탕 세로줄기 · 오른면' })).toHaveCount(1)
    await expect(mixedCard.getByRole('spinbutton', { name: '괴 · 관측 기둥선 · 오른면' })).toHaveCount(1)
    await expect(mixedCard.getByRole('spinbutton', { name: '괴 · 주 보 윗면' })).toHaveCount(1)
    await expect(mixedCard.getByRole('spinbutton', { name: '괴 · 윗 보 윗면' })).toHaveCount(0)
    await expect(mixedCard.getByRole('spinbutton', { name: '괴 · 아랫 보 윗면' })).toHaveCount(0)
  })

  test('ㅞ는 세 기둥과 두 보를 각각 기록한다', async ({ page }) => {
    const requests: Array<{ text: string; fontIds: string[] }> = []
    await installApiFixture(page, requests)
    await page.goto(LAB_URL)

    await page.getByRole('button', { name: 'ㅞ', exact: true }).click()
    await expect.poll(() => requests.at(-1)).toEqual({ text: '가각고곡궤궥', fontIds: ['ibm-plex-sans-kr'] })
    const mixedCard = page.locator('[data-context-id="initial-mixed"]')
    await expect(mixedCard.locator('[data-medial-card-control-id]')).toHaveCount(6)
    await expect(mixedCard.getByRole('spinbutton', { name: '궤 · 관측 바탕 세로줄기 · 오른면' })).toHaveCount(1)
    await expect(mixedCard.getByRole('spinbutton', { name: '궤 · 관측 안쪽기둥선 · 오른면' })).toHaveCount(1)
    await expect(mixedCard.getByRole('spinbutton', { name: '궤 · 관측 기둥선 · 오른면' })).toHaveCount(1)
    await expect(mixedCard.getByRole('spinbutton', { name: '궤 · 윗 보 윗면' })).toHaveCount(1)
    await expect(mixedCard.getByRole('spinbutton', { name: '궤 · 아랫 보 윗면' })).toHaveCount(1)
  })

  test('ㄱ의 과와 곽은 굽은 아랫보의 시작쪽 국소 접선을 같은 규칙으로 보인다', async ({ page }) => {
    const requests: Array<{ text: string; fontIds: string[] }> = []
    await installApiFixture(page, requests)
    await page.goto('/font-guide-lab?font=noto-sans-kr')

    const mixedCard = page.locator('[data-context-id="initial-mixed"]')
    await expect(mixedCard.getByRole('button', { name: /^자동 후보 / })).toHaveCount(5)
    await expect(mixedCard.getByRole('button', { name: '자동 후보 314' })).toHaveCount(1)
    await expect(mixedCard.getByRole('button', { name: '자동 후보 411' })).toHaveCount(1)
    await expect(mixedCard.getByRole('button', { name: '자동 후보 743' })).toHaveCount(1)
    await expect(mixedCard.getByRole('button', { name: '자동 후보 431' })).toHaveCount(1)
    await expect(mixedCard.getByRole('button', { name: '자동 후보 691' })).toHaveCount(1)
    await expect(mixedCard.getByRole('button', { name: '후보 보류' })).toHaveCount(0)
    const mixedLocalTangent = mixedCard.locator('[data-medial-element-id="lowerBeam"]')
    await expect(mixedLocalTangent).toHaveAttribute('data-medial-face-reference-mode', 'start-side-local-tangent')
    await expect(mixedLocalTangent).toContainText('국소 접선')
    await expect(mixedCard.locator('[data-medial-face-segment-id="lowerBeam"]')).toHaveAttribute('x1', '40.81')
    await expect(mixedCard.locator('[data-medial-face-segment-id="lowerBeam"]')).toHaveAttribute('x2', '65.093')
    const mixedFinalCard = page.locator('[data-context-id="initial-mixed-final"]')
    await expect(mixedFinalCard.getByRole('button', { name: '자동 후보 317' })).toHaveCount(1)
    await expect(mixedFinalCard.getByRole('button', { name: '자동 후보 496' })).toHaveCount(1)
    await expect(mixedFinalCard.getByRole('button', { name: '후보 보류' })).toHaveCount(0)
    const localTangent = mixedFinalCard.locator('[data-medial-element-id="lowerBeam"]')
    await expect(localTangent).toHaveAttribute('data-medial-face-reference-mode', 'start-side-local-tangent')
    await expect(localTangent).toContainText('국소 접선')
    await expect(mixedFinalCard.locator('[data-medial-face-segment-id="lowerBeam"]')).toHaveAttribute('x1', '43.619')
    await expect(mixedFinalCard.locator('[data-medial-face-segment-id="lowerBeam"]')).toHaveAttribute('x2', '97.911')
  })

  test('G1에서 v3 자동 추출을 G0 gold와 비교하고 버전 고정 ROI를 보인다', async ({ page }) => {
    const requests: Array<{ text: string; fontIds: string[] }> = []
    await installApiFixture(page, requests)
    await page.goto('/font-guide-lab?font=noto-sans-kr')

    const review = page.getByTestId('medial-g0-review')
    await expect(review).toBeVisible()
    await expect(review).toContainText('14글자 · 28요소 · 2026-09-14 동결')
    await expect(review).toContainText('분석 회귀 기준이며 생산 자모·폰트 값으로 승격하지 않습니다')
    await expect(page.getByTestId('medial-g0-comparison-summary')).toContainText('현재 화면 16/16 일치 · 최대 Δ0 · high 16 · high 오선택 0')
    await expect(review.getByRole('button', { name: /G0 검토$/ })).toHaveCount(7)
    await expect(page.locator('[data-g0-analysis-gold="true"]')).toHaveCount(6)
    await expect(page.locator('[data-medial-gold-status="match"]')).toHaveCount(16)
    await expect(page.locator('[data-medial-gold-status="mismatch"]')).toHaveCount(0)
    await expect(page.locator('[data-medial-match-confidence="high"]')).toHaveCount(16)
    await expect(page.getByTestId('medial-g0-contract')).toHaveCount(6)
    const go = page.locator('[data-context-id="initial-vertical"]')
    await expect(go.getByRole('button', { name: '자동 후보 450' })).toHaveCount(1)
    await expect(go.getByRole('button', { name: '자동 후보 762' })).toHaveCount(1)
    await expect(go.getByRole('button', { name: '자동 후보 439' })).toHaveCount(1)
    await expect(go.getByRole('spinbutton', { name: '고 · 바탕 세로줄기 · 윗끝면' })).toHaveCount(1)
    await expect(go.getByTestId('medial-g0-contract')).toContainText('medial-guide-role-v3')
    const ga = page.locator('[data-context-id="initial-horizontal"]')
    await expect(ga.locator('[data-medial-face-segment-id="outerPillar"]')).toHaveCount(2)
    await expect(ga.locator('[data-medial-gold-segment-id="outerPillar"]')).toHaveCount(2)
    await expect(ga.locator('[data-medial-element-id="outerPillar"]')).toHaveAttribute('data-medial-visible-spans', '53-420|489-957')
    await expect(ga.locator('[data-medial-element-id="outerPillar"]')).toHaveAttribute('data-medial-gold-status', 'match')
    await expect(page.locator('[data-medial-analysis-roi]')).toHaveCount(0)
    await review.getByRole('button', { name: '분석 ROI 보기' }).click()

    const rightRoi = page.locator('[data-context-id="initial-horizontal"] [data-medial-analysis-roi="right-medial"]')
    await expect(rightRoi).toHaveAttribute('data-roi-version', 'medial-guide-roi-v1')
    await expect(rightRoi).toHaveAttribute('x', '500')
    await expect(rightRoi).toHaveAttribute('width', '425')
    await expect(page.locator('[data-context-id="initial-mixed"] [data-medial-analysis-roi]')).toHaveCount(2)

    await expect(page.locator('[data-medial-analysis-roi]')).not.toHaveCount(0)
    await review.getByRole('button', { name: '분석 ROI 숨기기' }).click()
    await expect(page.locator('[data-medial-analysis-roi]')).toHaveCount(0)

    await review.getByRole('button', { name: '구·국 G0 검토' }).click()
    await expect.poll(() => requests.at(-1)).toEqual({ text: '가각구국과곽', fontIds: ['noto-sans-kr'] })
    await expect(page.locator('[data-context-id="initial-vertical"]')).toHaveAttribute('data-glyph', '구')
    const guk = page.locator('[data-context-id="initial-vertical-final"]')
    await expect(guk).toHaveAttribute('data-glyph', '국')
    await expect(guk.getByRole('button', { name: '자동 후보 678' })).toHaveCount(0)
    await expect(guk.getByRole('button', { name: '후보 보류' })).toBeDisabled()
    await expect(guk.getByRole('button', { name: '후보 보류' })).toHaveAttribute('title', /숨은 성분 끝 678\.200 · 보이는 끝 651\.959/)
    await expect(guk.locator('[data-medial-overlay-id="baseStemTipFace"]')).toHaveCount(0)
    await expect(guk.locator('[data-medial-face-segment-id="baseStem"]')).toHaveAttribute('y1', '487.281')
    await expect(guk.locator('[data-medial-face-segment-id="baseStem"]')).toHaveAttribute('y2', '651.959')
    await expect(guk.locator('[data-medial-element-id="baseStem"]')).toHaveAttribute('data-medial-visible-spans', '487-652')

    const gu = page.locator('[data-context-id="initial-vertical"]')
    await expect(gu.locator('[data-guide-line-id="initialBottom"]')).toHaveCount(0)
    await expect(gu.getByRole('spinbutton', { name: '구 · 첫닿밑선' })).toHaveCount(0)

    await page.getByRole('button', { name: 'ㄴ', exact: true }).click()
    await expect(review).toHaveCount(0)
    await expect(page.locator('[data-medial-analysis-roi]')).toHaveCount(0)
  })

  test('폐기된 가·과 legacy 후보 채택만 한 번 무효화하고 v3로 이관한다', async ({ page }) => {
    const requests: Array<{ text: string; fontIds: string[] }> = []
    await installApiFixture(page, requests)
    const profileKey = `noto-sans-kr:${fonts[0].fileSha256}:wght=400`
    const inferredObservation = (value: number, id: string, side: string) => ({
      coordinateFrame: 'shared-baseline', value, anchor: { id, mode: 'outerFace', side },
      method: 'inferred', confidence: 'medium', review: 'accepted-for-analysis',
    })
    await page.addInitScript(({ store }) => {
      if (window.sessionStorage.getItem('legacy-ga-gwa-seeded')) return
      window.localStorage.setItem('reference-medial-guide-observations-v1', JSON.stringify(store))
      window.sessionStorage.setItem('legacy-ga-gwa-seeded', 'true')
    }, {
      store: {
        schema: 'reference-medial-guide-observations-v2', version: 2,
        values: {
          [profileKey]: {
            observations: {
              'ㄱ': {
                'ㅏ': {
                  'without-final': {
                    outerPillarFace: inferredObservation(724, 'outerPillarFace', 'right'),
                    primaryBeamFace: inferredObservation(444, 'primaryBeamFace', 'top'),
                  },
                  'with-final': { outerPillarFace: inferredObservation(730, 'outerPillarFace', 'right') },
                },
                'ㅘ': { 'without-final': { basePillarFace: inferredObservation(300, 'basePillarFace', 'right') } },
                'ㅓ': { 'without-final': { outerPillarFace: inferredObservation(780, 'outerPillarFace', 'right') } },
              },
            },
          },
        },
      },
    })

    await page.goto('/font-guide-lab?font=noto-sans-kr')
    const ga = page.locator('[data-context-id="initial-horizontal"]')
    const gwa = page.locator('[data-context-id="initial-mixed"]')
    await expect(ga.locator('[data-medial-overlay-source="observation"]')).toHaveCount(0)
    await expect(gwa.locator('[data-medial-overlay-source="observation"]')).toHaveCount(0)
    await expect(ga.getByRole('button', { name: '자동 후보 745' })).toBeVisible()

    const migrated = await page.evaluate((key) => {
      const store = JSON.parse(window.localStorage.getItem('reference-medial-guide-observations-v3') ?? 'null')
      const cases = store.values[key].observations
      const roles = (medial: string, finalJamo: string | null) => cases.find((item: { initialJamo: string; medialJamo: string; finalJamo: string | null }) => item.initialJamo === 'ㄱ' && item.medialJamo === medial && item.finalJamo === finalJamo)?.roles
      return {
        schema: store.schema,
        ga: roles('ㅏ', null),
        gaFinal: roles('ㅏ', 'ㄱ'),
        gwa: roles('ㅘ', null),
        geo: roles('ㅓ', null),
        ledger: window.localStorage.getItem('reference-medial-guide-observation-invalidations-v1'),
      }
    }, profileKey)
    expect(migrated.schema).toBe('reference-medial-guide-observations-v3')
    expect(migrated.ga).toBeUndefined()
    expect(migrated.gaFinal.outerPillarFace.value).toBe(730)
    expect(migrated.gwa).toBeUndefined()
    expect(migrated.geo.outerPillarFace.value).toBe(780)
    expect(migrated.ledger).toContain('2026-09-14-noto-g0-ga-gwa-invalid-candidate-reset-v1')

    await ga.getByRole('button', { name: '자동 후보 745' }).click()
    await expect(ga.getByRole('spinbutton', { name: '가 · 관측 기둥선 · 오른면' })).toHaveValue('745')
    await page.reload()
    await expect(page.locator('[data-context-id="initial-horizontal"]').getByRole('spinbutton', { name: '가 · 관측 기둥선 · 오른면' })).toHaveValue('745')
  })

  test('P1 현재 추출기는 G0 밖 다중 구조도 같은 화면에서 계산한다', async ({ page }) => {
    const requests: Array<{ text: string; fontIds: string[] }> = []
    await installApiFixture(page, requests)
    await page.goto('/font-guide-lab?font=noto-sans-kr')

    await page.getByRole('button', { name: 'ㅍ', exact: true }).click()
    await page.getByRole('button', { name: 'ㅞ', exact: true }).click()
    await expect.poll(() => requests.at(-1)).toEqual({ text: '파팍포폭풰풱', fontIds: ['noto-sans-kr'] })
    const mixedCard = page.locator('[data-context-id="initial-mixed"]')
    await expect(mixedCard.locator('[data-medial-element-id]')).toHaveCount(5)
    await expect(mixedCard.getByTestId('medial-face-elements')).toContainText('geometric-role-matcher-v9 자동 추출 후보')
    await expect(mixedCard.getByRole('button', { name: /^자동 후보 / })).toHaveCount(6)
    await expect(mixedCard.getByRole('button', { name: '후보 보류' })).toHaveCount(0)
    await expect(mixedCard.locator('[data-g0-analysis-gold="true"]')).toHaveCount(0)
    await expect(mixedCard.locator('[data-medial-face-segment-id="innerPillar"]')).toHaveCount(1)
    await expect(mixedCard.locator('[data-medial-face-segment-id="outerPillar"]')).toHaveCount(1)
  })

  test('P1 겹기둥·쌍줄기·혼합 역할을 한 화면에서 각각 보인다', async ({ page }) => {
    const requests: Array<{ text: string; fontIds: string[] }> = []
    await installApiFixture(page, requests)
    await page.goto('/font-guide-lab?font=noto-sans-kr')

    await page.getByRole('button', { name: 'ㅒ', exact: true }).click()
    await page.getByRole('button', { name: 'ㅠ', exact: true }).click()
    await page.getByRole('button', { name: 'ㅞ', exact: true }).click()
    await expect.poll(() => requests.at(-1)).toEqual({ text: '걔걕규귝궤궥', fontIds: ['noto-sans-kr'] })

    const right = page.locator('[data-context-id="initial-horizontal"]')
    const bottom = page.locator('[data-context-id="initial-vertical"]')
    const mixed = page.locator('[data-context-id="initial-mixed"]')
    await expect(right.locator('[data-medial-element-id]')).toHaveCount(4)
    await expect(bottom.locator('[data-medial-element-id]')).toHaveCount(3)
    await expect(mixed.locator('[data-medial-element-id]')).toHaveCount(5)
    await expect(right.locator('[data-medial-element-id="innerPillar"]')).toHaveCount(1)
    await expect(bottom.locator('[data-medial-element-id="leftStem"]')).toHaveCount(1)
    await expect(bottom.locator('[data-medial-element-id="rightStem"]')).toHaveCount(1)
    await expect(mixed.locator('[data-medial-element-id="innerPillar"]')).toHaveCount(1)
    await expect(page.locator('[data-medial-gold-status]')).toHaveCount(0)
    await expect(page.getByText('자동 후보 관측선', { exact: true })).toBeVisible()
    await expect(page.getByText('G0 gold', { exact: true })).toHaveCount(0)
  })

  test('P1 위험 표본은 같은 화면에서 폰트·첫닿자·세 홀자를 함께 전환한다', async ({ page }) => {
    const requests: Array<{ text: string; fontIds: string[] }> = []
    await installApiFixture(page, requests)
    await page.goto('/font-guide-lab?font=noto-sans-kr')

    const review = page.getByTestId('medial-p1-risk-review')
    await expect(review).toContainText('5세트 · 30글자 · v9 사용자 확인 완료')
    await review.locator('[data-p1-risk-sample="nanum-parallel"]').click()
    await expect(page.getByRole('button', { name: 'Nanum Gothic' })).toHaveAttribute('aria-pressed', 'true')
    await expect(page.getByRole('button', { name: 'ㄸ', exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => requests.at(-1)).toEqual({ text: '떄떅뚀뚁뛔뛕', fontIds: ['nanum-gothic'] })
    await expect(page.locator('[data-context-id="initial-mixed"] [data-medial-element-id]')).toHaveCount(5)
    await expect(page.locator('[data-context-id="initial-mixed"] [data-medial-gold-status]')).toHaveCount(0)
  })

  test('v9 Noto 방향 표본은 풔·풕에서 홀자 바탕 보와 안쪽 줄기를 표시한다', async ({ page }) => {
    const requests: Array<{ text: string; fontIds: string[] }> = []
    await installApiFixture(page, requests)
    await page.goto('/font-guide-lab?font=noto-sans-kr')

    const review = page.getByTestId('medial-p1-risk-review')
    await review.locator('[data-p1-risk-sample="noto-direction"]').click()
    const mixed = page.locator('[data-context-id="initial-mixed"]')
    const mixedFinal = page.locator('[data-context-id="initial-mixed-final"]')
    await expect(mixed).toHaveAttribute('data-glyph', '풔')
    await expect(mixedFinal).toHaveAttribute('data-glyph', '풕')
    for (const card of [mixed, mixedFinal]) {
      await expect(card.locator('[data-medial-element-id="baseStem"]')).toHaveCount(1)
      await expect(card.locator('[data-medial-element-id="upperBeam"]')).toHaveCount(1)
      await expect(card.locator('[data-medial-element-id="outerPillar"]')).toHaveCount(1)
      await expect(card.getByTestId('medial-face-elements')).toContainText('geometric-role-matcher-v9 자동 추출 후보')
    }
  })

  test('늦게 도착한 이전 홀자 후보가 현재 선택을 덮어쓰지 않는다', async ({ page }) => {
    const requests: Array<{ text: string; fontIds: string[] }> = []
    let candidateRequestCount = 0
    await installApiFixture(page, requests, async () => {
      candidateRequestCount += 1
      if (candidateRequestCount === 1) await new Promise((resolve) => setTimeout(resolve, 300))
    })
    await page.goto('/font-guide-lab?font=noto-sans-kr', { waitUntil: 'domcontentloaded' })

    await page.getByRole('button', { name: 'ㅓ', exact: true }).click()
    const currentCard = page.locator('[data-context-id="initial-horizontal"]')
    await expect(currentCard).toHaveAttribute('data-glyph', '거')
    await expect(currentCard.getByRole('button', { name: '자동 후보 793' })).toBeVisible()
    await page.waitForTimeout(350)
    await expect(currentCard.getByRole('button', { name: '자동 후보 793' })).toBeVisible()
    await expect(currentCard.getByRole('button', { name: '자동 후보 745' })).toHaveCount(0)
  })

  test('G2 첫닿자의 ㅘ 아랫보도 두 받침 문맥에서 시작쪽 국소 접선을 쓴다', async ({ page }) => {
    const requests: Array<{ text: string; fontIds: string[] }> = []
    await installApiFixture(page, requests)
    await page.goto('/font-guide-lab?font=noto-sans-kr')

    await page.getByRole('button', { name: 'ㄷ', exact: true }).click()
    await expect.poll(() => requests.at(-1)).toEqual({ text: '다닥도독돠돡', fontIds: ['noto-sans-kr'] })
    await expect(page.getByTestId('medial-g0-review')).toHaveCount(0)
    const da = page.locator('[data-context-id="initial-horizontal"]')
    await expect(da.getByRole('button', { name: '자동 후보 745' })).toBeVisible()
    await expect(da.locator('[data-medial-face-segment-id="outerPillar"]')).not.toHaveCount(0)
    for (const contextId of ['initial-mixed', 'initial-mixed-final']) {
      const mixed = page.locator(`[data-context-id="${contextId}"]`)
      await expect(mixed.locator('[data-medial-element-id="lowerBeam"]')).toHaveAttribute('data-medial-element-status', 'candidate')
      await expect(mixed.locator('[data-medial-element-id="lowerBeam"]')).toHaveAttribute('data-medial-face-reference-mode', 'start-side-local-tangent')
      await expect(mixed.locator('[data-medial-local-tangent-anchor-id="lowerBeam"]')).toHaveCount(1)
      await expect(mixed.locator('[data-medial-element-id="lowerBeam"]')).toContainText('국소 접선')
      await expect(mixed.getByRole('button', { name: '후보 보류' })).toHaveCount(0)
    }
  })

  test('G3 후보 cache는 다른 글자만 계산하고 재선택·새로고침에서 API를 생략한다', async ({ page }) => {
    const requests: Array<{ text: string; fontIds: string[] }> = []
    const candidateRequests: MedialCandidateRequestCase[][] = []
    await installApiFixture(page, requests, undefined, candidateRequests)
    await page.goto('/font-guide-lab?font=noto-sans-kr')

    await expect(page.locator('[data-context-id="initial-horizontal"]').getByRole('button', { name: '자동 후보 745' })).toBeVisible()
    await expect.poll(() => candidateRequests.length).toBe(1)
    expect(candidateRequests[0]).toHaveLength(6)

    await page.getByRole('button', { name: 'ㄷ', exact: true }).click()
    await expect(page.locator('[data-context-id="initial-horizontal"]')).toHaveAttribute('data-glyph', '다')
    await expect.poll(() => candidateRequests.length).toBe(2)
    expect(candidateRequests[1]).toHaveLength(6)

    await page.getByRole('button', { name: 'ㄱ', exact: true }).click()
    await expect(page.locator('[data-context-id="initial-horizontal"]').getByRole('button', { name: '자동 후보 745' })).toBeVisible()
    await page.waitForTimeout(100)
    expect(candidateRequests).toHaveLength(2)

    await page.reload()
    await expect(page.locator('[data-context-id="initial-horizontal"]').getByRole('button', { name: '자동 후보 745' })).toBeVisible()
    await page.waitForTimeout(100)
    expect(candidateRequests).toHaveLength(2)
    const cache = await page.evaluate(() => JSON.parse(window.localStorage.getItem('reference-medial-guide-candidates-v1') ?? 'null'))
    expect(cache).toMatchObject({ schema: 'reference-medial-guide-candidates-v1', version: 1 })
    expect(cache.entries).toHaveLength(12)
  })

  test('첫닿 P0 역할 색면·네 역할 단면·원시 면 후보를 같은 카드에서 구분한다', async ({ page }) => {
    const requests: Array<{ text: string; fontIds: string[] }> = []
    const initialRequests: InitialComponentRequestCase[][] = []
    await installApiFixture(page, requests, undefined, undefined, undefined, initialRequests)
    await page.goto('/font-guide-lab?font=noto-sans-kr')

    await expect.poll(() => initialRequests.length).toBe(1)
    expect(initialRequests[0]).toHaveLength(6)
    await expect(page.locator('[data-initial-selection-area]')).toHaveCount(6)
    await expect(page.locator('[data-initial-role-face-side]')).toHaveCount(24)
    await expect(page.locator('[data-initial-axis-face-side]')).toHaveCount(24)
    await expect(page.getByText('첫닿 역할 색면', { exact: true })).toBeVisible()
    await expect(page.getByText('첫닿 네 역할 단면', { exact: true })).toBeVisible()
    await expect(page.getByText('첫닿 원시 면 후보', { exact: true })).toBeVisible()

    const firstCard = page.locator('[data-context-id="initial-horizontal"]')
    await expect(firstCard.getByTestId('initial-component-candidate')).toContainText('첫닿 구조 후보 · initial-component-matcher-v3')
    await expect(firstCard.getByTestId('initial-component-candidate')).toHaveAttribute('data-initial-selection-rule', 'context-directed-contour-islands')
    await firstCard.locator('[data-initial-face-summary="top"]').hover()
    await expect(firstCard.locator('[data-initial-role-face-side="top"]')).toHaveAttribute('data-initial-role-face-active', 'true')
    await expect(firstCard.locator('[data-initial-axis-face-side="top"]')).toHaveAttribute('data-initial-axis-face-active', 'true')

    await page.getByRole('button', { name: 'ㅓ', exact: true }).click()
    await expect(firstCard).toHaveAttribute('data-glyph', '거')
    await expect(page.locator('[data-initial-selection-area]')).toHaveCount(4)
    await expect(firstCard.getByTestId('initial-component-candidate')).toHaveCount(0)
  })

  test('첫닿 후보 cache와 요청 fingerprint가 재선택·새로고침·늦은 응답을 막는다', async ({ page }) => {
    const requests: Array<{ text: string; fontIds: string[] }> = []
    const initialRequests: InitialComponentRequestCase[][] = []
    let initialRequestCount = 0
    await installApiFixture(page, requests, undefined, undefined, async () => {
      initialRequestCount += 1
      if (initialRequestCount === 1) await new Promise((resolve) => setTimeout(resolve, 300))
    }, initialRequests)
    await page.goto('/font-guide-lab?font=noto-sans-kr', { waitUntil: 'domcontentloaded' })

    await page.getByRole('button', { name: 'ㄷ', exact: true }).click()
    const currentCard = page.locator('[data-context-id="initial-horizontal"]')
    await expect(currentCard).toHaveAttribute('data-glyph', '다')
    await expect(currentCard.getByTestId('initial-component-candidate')).toBeVisible()
    await page.waitForTimeout(350)
    await expect(currentCard.getByTestId('initial-component-candidate')).toBeVisible()
    await expect.poll(() => initialRequests.some((cases) => cases[0]?.initialJamo === 'ㄷ')).toBe(true)

    await page.getByRole('button', { name: 'ㄱ', exact: true }).click()
    await expect(currentCard).toHaveAttribute('data-glyph', '가')
    await expect(currentCard.getByTestId('initial-component-candidate')).toBeVisible()
    await page.waitForTimeout(100)
    const cachedRequestCount = initialRequests.length
    await page.getByRole('button', { name: 'ㄷ', exact: true }).click()
    await expect(currentCard.getByTestId('initial-component-candidate')).toBeVisible()
    await page.waitForTimeout(100)
    expect(initialRequests).toHaveLength(cachedRequestCount)

    await page.reload()
    await expect(currentCard.getByTestId('initial-component-candidate')).toBeVisible()
    await page.waitForTimeout(100)
    expect(initialRequests).toHaveLength(cachedRequestCount)
    const cache = await page.evaluate(() => JSON.parse(window.localStorage.getItem('reference-initial-component-candidates-v2') ?? 'null'))
    expect(cache).toMatchObject({ schema: 'reference-initial-component-candidates-v2', version: 2 })
    expect(cache.entries).toHaveLength(12)
  })

  test('받침 fixture는 검증 source만 읽고 겹받침 구성원·네 역할 단면을 분리한다', async ({ page }) => {
    const requests: Array<{ text: string; fontIds: string[] }> = []
    const finalRequests: FinalComponentDisplayRequestCase[][] = []
    await installApiFixture(page, requests, undefined, undefined, undefined, undefined, finalRequests)
    await page.goto('/font-guide-lab?font=noto-sans-kr')

    await expect.poll(() => finalRequests.length).toBe(1)
    expect(finalRequests[0]).toEqual([
      { character: '각', initialJamo: 'ㄱ', medialJamo: 'ㅏ', finalJamo: 'ㄱ', contextId: 'right-final' },
      { character: '곡', initialJamo: 'ㄱ', medialJamo: 'ㅗ', finalJamo: 'ㄱ', contextId: 'bottom-final' },
      { character: '곽', initialJamo: 'ㄱ', medialJamo: 'ㅘ', finalJamo: 'ㄱ', contextId: 'mixed-final' },
    ])
    await expect(page.getByLabel('받침 선택')).toHaveValue('ㄱ')
    await expect(page.locator('[data-final-selection-area]')).toHaveCount(3)
    await expect(page.locator('[data-final-member-id="only"]')).toHaveCount(3)
    await expect(page.locator('[data-final-role-face-side]')).toHaveCount(12)
    await expect(page.locator('[data-final-axis-face-side]')).toHaveCount(12)
    await expect(page.getByText('받침 역할 색면', { exact: true })).toBeVisible()
    await expect(page.getByText('받침 구성원', { exact: true })).toBeVisible()
    await expect(page.getByText('받침 역할·원시 면', { exact: true })).toBeVisible()

    await page.getByLabel('받침 선택').selectOption('ㄳ')
    await expect.poll(() => requests.at(-1)).toEqual({ text: '가갃고곣과곿', fontIds: ['noto-sans-kr'] })
    await expect.poll(() => finalRequests.length).toBe(2)
    expect(finalRequests[1].map(({ finalJamo }) => finalJamo)).toEqual(['ㄳ', 'ㄳ', 'ㄳ'])
    const compoundCard = page.locator('[data-context-id="initial-horizontal-final"]')
    await expect(compoundCard).toHaveAttribute('data-glyph', '갃')
    await expect(compoundCard.getByTestId('final-component-candidate')).toHaveAttribute('data-final-component-state', 'candidate')
    await expect(compoundCard.locator('[data-final-member-id="left"]')).toHaveCount(1)
    await expect(compoundCard.locator('[data-final-member-id="right"]')).toHaveCount(1)
    await expect(page.locator('[data-final-member-id="left"]')).toHaveCount(3)
    await expect(page.locator('[data-final-member-id="right"]')).toHaveCount(3)
    await compoundCard.locator('[data-final-member-summary="left"]').hover()
    await expect(compoundCard.locator('[data-final-member-id="left"]')).toHaveAttribute('data-final-member-active', 'true')
    await compoundCard.locator('[data-final-face-summary="top"]').hover()
    await expect(compoundCard.locator('[data-final-role-face-side="top"]')).toHaveAttribute('data-final-role-face-active', 'true')
    await expect(compoundCard.locator('[data-final-axis-face-side="top"]')).toHaveAttribute('data-final-axis-face-active', 'true')
  })

})
