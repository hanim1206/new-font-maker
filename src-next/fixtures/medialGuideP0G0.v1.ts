import type { RoleId } from '../medialGuideModel'

export type MedialGuideG0ContextId =
  | 'initial-horizontal'
  | 'initial-horizontal-final'
  | 'initial-vertical'
  | 'initial-vertical-final'
  | 'initial-mixed'
  | 'initial-mixed-final'

export type MedialGuideG0Medial = 'ㅏ' | 'ㅓ' | 'ㅣ' | 'ㅗ' | 'ㅜ' | 'ㅡ' | 'ㅘ'
export type MedialGuideG0MedialContext = 'right' | 'bottom' | 'mixed'
export type MedialGuideG0ElementId = 'outerPillar' | 'primaryBeam' | 'baseStem' | 'upperBeam' | 'lowerBeam'

export interface MedialGuideG0Region {
  id: string
  part: 'medial' | 'initial' | 'final'
  x: number
  y: number
  width: number
  height: number
}

export interface MedialGuideG0ContextDefinition {
  include: readonly [MedialGuideG0Region, ...MedialGuideG0Region[]]
}

export interface MedialGuideG0TuningCase {
  medialJamo: MedialGuideG0Medial
  medialContext: MedialGuideG0MedialContext
  characters: readonly [withoutFinal: string, withFinal: string]
  elements: readonly MedialGuideG0ElementId[]
  /** v2 scalar observations retained only for migration and partial approvals. */
  roles: readonly RoleId[]
}

interface MedialGuideG0Fixture {
  schema: 'medial-guide-p0-g0-review-fixture-v1'
  version: 1
  status: 'approved-analysis-gold'
  approvedAt: '2026-09-14'
  coordinateFrame: 'shared-baseline'
  font: {
    id: 'noto-sans-kr'
    fileSha256: string
  }
  initialJamo: 'ㄱ'
  finalJamos: readonly [null, 'ㄱ']
  excludedRoles: readonly ['initial', 'final']
  roleDefinitionVersion: 'medial-guide-role-v3'
  legacyRoleDefinitionVersion: 'medial-guide-role-v2'
  roiDefinitionVersion: 'medial-guide-roi-v1'
  boundaryRule: {
    include: 'closed'
    membership: 'inside-any-include'
    foreignInkPolicy: 'classify-contour-or-abstain'
  }
  contexts: Readonly<Record<MedialGuideG0ContextId, MedialGuideG0ContextDefinition>>
  tuningCases: readonly MedialGuideG0TuningCase[]
  review: {
    approved: true
    gold: true
    productionEligible: false
  }
}

export const MEDIAL_GUIDE_P0_G0_FIXTURE = {
  schema: 'medial-guide-p0-g0-review-fixture-v1',
  version: 1,
  status: 'approved-analysis-gold',
  approvedAt: '2026-09-14',
  coordinateFrame: 'shared-baseline',
  font: {
    id: 'noto-sans-kr',
    fileSha256: '194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252',
  },
  initialJamo: 'ㄱ',
  finalJamos: [null, 'ㄱ'],
  excludedRoles: ['initial', 'final'],
  roleDefinitionVersion: 'medial-guide-role-v3',
  legacyRoleDefinitionVersion: 'medial-guide-role-v2',
  roiDefinitionVersion: 'medial-guide-roi-v1',
  boundaryRule: {
    include: 'closed',
    membership: 'inside-any-include',
    foreignInkPolicy: 'classify-contour-or-abstain',
  },
  contexts: {
    'initial-horizontal': {
      include: [{ id: 'right-medial', part: 'medial', x: 500, y: 75, width: 425, height: 850 }],
    },
    'initial-horizontal-final': {
      include: [{ id: 'right-medial', part: 'medial', x: 500, y: 75, width: 425, height: 575 }],
    },
    'initial-vertical': {
      include: [{ id: 'bottom-medial', part: 'medial', x: 75, y: 465, width: 850, height: 460 }],
    },
    'initial-vertical-final': {
      include: [{ id: 'bottom-medial', part: 'medial', x: 75, y: 390, width: 850, height: 260 }],
    },
    'initial-mixed': {
      include: [
        { id: 'mixed-base', part: 'medial', x: 75, y: 420, width: 600, height: 505 },
        { id: 'mixed-outer', part: 'medial', x: 455, y: 75, width: 470, height: 850 },
      ],
    },
    'initial-mixed-final': {
      include: [
        { id: 'mixed-base', part: 'medial', x: 75, y: 300, width: 600, height: 350 },
        { id: 'mixed-outer', part: 'medial', x: 455, y: 75, width: 470, height: 575 },
      ],
    },
  },
  tuningCases: [
    { medialJamo: 'ㅏ', medialContext: 'right', characters: ['가', '각'], elements: ['outerPillar', 'primaryBeam'], roles: ['outerPillarFace', 'primaryBeamFace'] },
    { medialJamo: 'ㅓ', medialContext: 'right', characters: ['거', '걱'], elements: ['outerPillar', 'primaryBeam'], roles: ['outerPillarFace', 'primaryBeamFace'] },
    { medialJamo: 'ㅣ', medialContext: 'right', characters: ['기', '긱'], elements: ['outerPillar'], roles: ['outerPillarFace'] },
    { medialJamo: 'ㅗ', medialContext: 'bottom', characters: ['고', '곡'], elements: ['baseStem', 'primaryBeam'], roles: ['basePillarFace', 'baseStemTipFace', 'primaryBeamFace'] },
    { medialJamo: 'ㅜ', medialContext: 'bottom', characters: ['구', '국'], elements: ['baseStem', 'primaryBeam'], roles: ['basePillarFace', 'baseStemTipFace', 'primaryBeamFace'] },
    { medialJamo: 'ㅡ', medialContext: 'bottom', characters: ['그', '극'], elements: ['primaryBeam'], roles: ['primaryBeamFace'] },
    { medialJamo: 'ㅘ', medialContext: 'mixed', characters: ['과', '곽'], elements: ['baseStem', 'outerPillar', 'upperBeam', 'lowerBeam'], roles: ['basePillarFace', 'baseStemTipFace', 'outerPillarFace', 'upperBeamFace', 'lowerBeamFace'] },
  ],
  review: {
    approved: true,
    gold: true,
    productionEligible: false,
  },
} as const satisfies MedialGuideG0Fixture
