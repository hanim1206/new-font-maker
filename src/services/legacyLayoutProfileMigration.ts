import type { LayoutType, Part, PartOverride } from '../types'

export const KNOWN_LAYOUT_TYPES = [
  'choseong-only',
  'jungseong-vertical-only',
  'jungseong-horizontal-only',
  'jungseong-mixed-only',
  'choseong-jungseong-vertical',
  'choseong-jungseong-horizontal',
  'choseong-jungseong-mixed',
  'choseong-jungseong-vertical-jongseong',
  'choseong-jungseong-horizontal-jongseong',
  'choseong-jungseong-mixed-jongseong',
] as const satisfies readonly LayoutType[]

export const KNOWN_PARTS = ['CH', 'JU', 'JU_H', 'JU_V', 'JO'] as const satisfies readonly Part[]

const PART_OVERRIDE_FIELDS = ['top', 'bottom', 'left', 'right'] as const satisfies readonly (keyof PartOverride)[]

export type LayoutProfile = Partial<Record<LayoutType, Partial<Record<Part, PartOverride>>>>

export type LayoutMigrationStatus =
  | 'preset-seed'
  | 'user-candidate'
  | 'canonical-only'
  | 'equal'
  | 'conflict'
  | 'invalid'

export type MigrationSource = 'legacy' | 'canonical' | 'preset'

export interface LayoutMigrationIssue {
  source: MigrationSource
  code:
    | 'invalid-json'
    | 'invalid-envelope'
    | 'missing-profile'
    | 'unknown-layout'
    | 'invalid-layout-schema'
    | 'invalid-override-map'
    | 'unknown-part'
    | 'invalid-part-override'
  message: string
  layoutType?: LayoutType
  part?: Part
  path: string
}

export interface LayoutMigrationDecision {
  layoutType: LayoutType
  status: LayoutMigrationStatus
  migrationCandidate: boolean
  legacy?: Partial<Record<Part, PartOverride>>
  canonical?: Partial<Record<Part, PartOverride>>
  preset?: Partial<Record<Part, PartOverride>>
  issues: LayoutMigrationIssue[]
}

export interface LegacyLayoutProfileMigrationPlan {
  sourceFingerprint: string
  decisions: Record<LayoutType, LayoutMigrationDecision>
  candidates: LayoutProfile
  conflicts: LayoutType[]
  invalidLayouts: LayoutType[]
  issues: LayoutMigrationIssue[]
  canApply: boolean
}

export interface LegacyLayoutProfileMigrationInput {
  legacyRaw: unknown
  canonicalRaw: unknown
  presetProfile: unknown
}

interface ParsedPayload {
  state?: Record<string, unknown>
  fingerprintSource: unknown
  issues: LayoutMigrationIssue[]
  rootInvalid: boolean
}

interface ValidatedProfile {
  values: LayoutProfile
  presentLayouts: Set<LayoutType>
  invalidLayouts: Set<LayoutType>
  issues: LayoutMigrationIssue[]
  rootInvalid: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isLayoutType(value: string): value is LayoutType {
  return (KNOWN_LAYOUT_TYPES as readonly string[]).includes(value)
}

function isPart(value: string): value is Part {
  return (KNOWN_PARTS as readonly string[]).includes(value)
}

function parseRawPayload(raw: unknown, source: Exclude<MigrationSource, 'preset'>): ParsedPayload {
  let parsed = raw

  if (typeof raw === 'string') {
    try {
      parsed = JSON.parse(raw) as unknown
    } catch {
      return {
        fingerprintSource: raw,
        issues: [{
          source,
          code: 'invalid-json',
          message: `${source} 저장값이 올바른 JSON이 아닙니다.`,
          path: '$',
        }],
        rootInvalid: true,
      }
    }
  }

  if (!isRecord(parsed)) {
    return {
      fingerprintSource: parsed,
      issues: [{
        source,
        code: 'invalid-envelope',
        message: `${source} 저장값은 객체여야 합니다.`,
        path: '$',
      }],
      rootInvalid: true,
    }
  }

  if (!Object.hasOwn(parsed, 'state')) {
    return { state: parsed, fingerprintSource: parsed, issues: [], rootInvalid: false }
  }

  if (!isRecord(parsed.state)) {
    return {
      fingerprintSource: parsed,
      issues: [{
        source,
        code: 'invalid-envelope',
        message: `${source} Zustand envelope의 state가 객체가 아닙니다.`,
        path: '$.state',
      }],
      rootInvalid: true,
    }
  }

  return { state: parsed.state, fingerprintSource: parsed.state, issues: [], rootInvalid: false }
}

function validatePartOverride(
  raw: unknown,
  source: MigrationSource,
  layoutType: LayoutType,
  part: Part,
  path: string,
): { value?: PartOverride; issue?: LayoutMigrationIssue } {
  if (!isRecord(raw)) {
    return {
      issue: {
        source,
        code: 'invalid-part-override',
        message: `${layoutType}.${part} 보정값은 객체여야 합니다.`,
        layoutType,
        part,
        path,
      },
    }
  }

  const actualFields = Object.keys(raw).sort()
  const expectedFields = [...PART_OVERRIDE_FIELDS].sort()
  const hasExactFields = actualFields.length === expectedFields.length
    && actualFields.every((field, index) => field === expectedFields[index])
  const hasFiniteValues = PART_OVERRIDE_FIELDS.every((field) => Number.isFinite(raw[field]))

  if (!hasExactFields || !hasFiniteValues) {
    return {
      issue: {
        source,
        code: 'invalid-part-override',
        message: `${layoutType}.${part} 보정값은 top/bottom/left/right 유한수만 포함해야 합니다.`,
        layoutType,
        part,
        path,
      },
    }
  }

  return {
    value: {
      top: raw.top as number,
      bottom: raw.bottom as number,
      left: raw.left as number,
      right: raw.right as number,
    },
  }
}

function validateProfile(
  raw: unknown,
  source: MigrationSource,
  path: string,
): ValidatedProfile {
  const values: LayoutProfile = {}
  const presentLayouts = new Set<LayoutType>()
  const invalidLayouts = new Set<LayoutType>()
  const issues: LayoutMigrationIssue[] = []

  if (!isRecord(raw)) {
    issues.push({
      source,
      code: source === 'legacy' ? 'missing-profile' : 'invalid-override-map',
      message: `${path} 값은 객체여야 합니다.`,
      path,
    })
    return { values, presentLayouts, invalidLayouts, issues, rootInvalid: true }
  }

  for (const rawLayoutType of Object.keys(raw)) {
    if (!isLayoutType(rawLayoutType)) {
      issues.push({
        source,
        code: 'unknown-layout',
        message: `알 수 없는 레이아웃 타입 ${rawLayoutType}입니다.`,
        path: `${path}.${rawLayoutType}`,
      })
      continue
    }

    const layoutType = rawLayoutType
    presentLayouts.add(layoutType)
    const rawOverrides = raw[layoutType]
    if (!isRecord(rawOverrides)) {
      invalidLayouts.add(layoutType)
      issues.push({
        source,
        code: 'invalid-override-map',
        message: `${layoutType} 보정 맵은 객체여야 합니다.`,
        layoutType,
        path: `${path}.${layoutType}`,
      })
      continue
    }

    const overrides: Partial<Record<Part, PartOverride>> = {}
    let isValid = true

    for (const rawPart of Object.keys(rawOverrides)) {
      if (!isPart(rawPart)) {
        isValid = false
        issues.push({
          source,
          code: 'unknown-part',
          message: `${layoutType}에 알 수 없는 파트 ${rawPart}가 있습니다.`,
          layoutType,
          path: `${path}.${layoutType}.${rawPart}`,
        })
        continue
      }

      const result = validatePartOverride(
        rawOverrides[rawPart],
        source,
        layoutType,
        rawPart,
        `${path}.${layoutType}.${rawPart}`,
      )
      if (result.issue) {
        isValid = false
        issues.push(result.issue)
      } else if (result.value) {
        overrides[rawPart] = result.value
      }
    }

    if (isValid) values[layoutType] = overrides
    else invalidLayouts.add(layoutType)
  }

  return { values, presentLayouts, invalidLayouts, issues, rootInvalid: false }
}

function extractLegacyProfile(raw: unknown): { profile: ValidatedProfile; fingerprintSource: unknown; parseIssues: LayoutMigrationIssue[]; rootInvalid: boolean } {
  if (raw === null || raw === undefined) {
    return {
      profile: validateProfile({}, 'legacy', '$.state.layoutProfile'),
      fingerprintSource: raw,
      parseIssues: [],
      rootInvalid: false,
    }
  }

  const payload = parseRawPayload(raw, 'legacy')
  if (!payload.state) {
    return {
      profile: validateProfile(undefined, 'legacy', '$.state.layoutProfile'),
      fingerprintSource: payload.fingerprintSource,
      parseIssues: payload.issues,
      rootInvalid: true,
    }
  }

  const profileRaw = payload.state.layoutProfile
  return {
    profile: validateProfile(profileRaw, 'legacy', '$.state.layoutProfile'),
    fingerprintSource: profileRaw,
    parseIssues: payload.issues,
    rootInvalid: payload.rootInvalid,
  }
}

function extractCanonicalProfile(raw: unknown): { profile: ValidatedProfile; parseIssues: LayoutMigrationIssue[]; rootInvalid: boolean } {
  if (raw === null || raw === undefined) {
    return {
      profile: validateProfile({}, 'canonical', '$.state.layoutSchemas[*].userPartOverrides'),
      parseIssues: [],
      rootInvalid: false,
    }
  }

  const payload = parseRawPayload(raw, 'canonical')
  if (!payload.state || !isRecord(payload.state.layoutSchemas)) {
    const issue: LayoutMigrationIssue = {
      source: 'canonical',
      code: 'missing-profile',
      message: 'canonical 저장값에 layoutSchemas 객체가 없습니다.',
      path: '$.state.layoutSchemas',
    }
    return {
      profile: {
        values: {},
        presentLayouts: new Set(),
        invalidLayouts: new Set(),
        issues: [issue],
        rootInvalid: true,
      },
      parseIssues: payload.issues,
      rootInvalid: true,
    }
  }

  const profileRaw: Record<string, unknown> = {}
  const schemaIssues: LayoutMigrationIssue[] = []
  const invalidLayouts = new Set<LayoutType>()

  for (const [rawLayoutType, rawSchema] of Object.entries(payload.state.layoutSchemas)) {
    if (!isLayoutType(rawLayoutType)) {
      schemaIssues.push({
        source: 'canonical',
        code: 'unknown-layout',
        message: `알 수 없는 레이아웃 타입 ${rawLayoutType}입니다.`,
        path: `$.state.layoutSchemas.${rawLayoutType}`,
      })
      continue
    }
    if (!isRecord(rawSchema)) {
      invalidLayouts.add(rawLayoutType)
      schemaIssues.push({
        source: 'canonical',
        code: 'invalid-layout-schema',
        message: `${rawLayoutType} canonical schema가 객체가 아닙니다.`,
        layoutType: rawLayoutType,
        path: `$.state.layoutSchemas.${rawLayoutType}`,
      })
      continue
    }
    if (Object.hasOwn(rawSchema, 'userPartOverrides') && rawSchema.userPartOverrides !== undefined) {
      profileRaw[rawLayoutType] = rawSchema.userPartOverrides
    }
  }

  const profile = validateProfile(profileRaw, 'canonical', '$.state.layoutSchemas[*].userPartOverrides')
  for (const layoutType of invalidLayouts) profile.invalidLayouts.add(layoutType)
  profile.issues.push(...schemaIssues)

  return { profile, parseIssues: payload.issues, rootInvalid: payload.rootInvalid }
}

function normalizeForCanonicalSerialization(value: unknown): unknown {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') {
    if (Number.isFinite(value)) return value
    return { $number: String(value) }
  }
  if (typeof value === 'undefined') return { $undefined: true }
  if (typeof value === 'bigint') return { $bigint: value.toString() }
  if (Array.isArray(value)) return value.map(normalizeForCanonicalSerialization)
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, normalizeForCanonicalSerialization(value[key])]),
    )
  }
  return { $unsupported: typeof value, value: String(value) }
}

export function canonicalSerialize(value: unknown): string {
  return JSON.stringify(normalizeForCanonicalSerialization(value))
}

function fingerprint(value: unknown): string {
  const serialized = canonicalSerialize(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < serialized.length; index += 1) {
    hash ^= serialized.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

function profilesEqual(
  left: Partial<Record<Part, PartOverride>>,
  right: Partial<Record<Part, PartOverride>>,
): boolean {
  return canonicalSerialize(left) === canonicalSerialize(right)
}

function cloneOverrides(value: Partial<Record<Part, PartOverride>> | undefined): Partial<Record<Part, PartOverride>> | undefined {
  if (!value) return undefined
  const result: Partial<Record<Part, PartOverride>> = {}
  for (const part of KNOWN_PARTS) {
    const override = value[part]
    if (override) result[part] = { ...override }
  }
  return result
}

export function analyzeLegacyLayoutProfileMigration(
  input: LegacyLayoutProfileMigrationInput,
): LegacyLayoutProfileMigrationPlan {
  const legacyResult = extractLegacyProfile(input.legacyRaw)
  const canonicalResult = extractCanonicalProfile(input.canonicalRaw)
  const preset = validateProfile(input.presetProfile, 'preset', '$.presetProfile')
  const issues = [
    ...legacyResult.parseIssues,
    ...legacyResult.profile.issues,
    ...canonicalResult.parseIssues,
    ...canonicalResult.profile.issues,
    ...preset.issues,
  ]
  const hasRootInvalid = legacyResult.rootInvalid
    || legacyResult.profile.rootInvalid
    || canonicalResult.rootInvalid
    || canonicalResult.profile.rootInvalid
    || preset.rootInvalid
  const candidates: LayoutProfile = {}
  const conflicts: LayoutType[] = []
  const invalidLayouts: LayoutType[] = []
  const decisions = {} as Record<LayoutType, LayoutMigrationDecision>

  for (const layoutType of KNOWN_LAYOUT_TYPES) {
    const layoutIssues = issues.filter((issue) => issue.layoutType === layoutType)
    const isInvalid = hasRootInvalid
      || legacyResult.profile.invalidLayouts.has(layoutType)
      || canonicalResult.profile.invalidLayouts.has(layoutType)
      || preset.invalidLayouts.has(layoutType)
    const legacyPresent = legacyResult.profile.presentLayouts.has(layoutType)
    const canonicalPresent = canonicalResult.profile.presentLayouts.has(layoutType)
    const presetPresent = preset.presentLayouts.has(layoutType)
    const legacy = cloneOverrides(legacyResult.profile.values[layoutType])
    const canonical = cloneOverrides(canonicalResult.profile.values[layoutType])
    const presetValue = cloneOverrides(preset.values[layoutType])
    let status: LayoutMigrationStatus
    let migrationCandidate = false

    if (isInvalid) {
      status = 'invalid'
      invalidLayouts.push(layoutType)
    } else if (legacyPresent && canonicalPresent) {
      if (profilesEqual(legacy ?? {}, canonical ?? {})) status = 'equal'
      else {
        status = 'conflict'
        conflicts.push(layoutType)
      }
    } else if (canonicalPresent) {
      status = 'canonical-only'
    } else if (legacyPresent) {
      if (presetPresent && profilesEqual(legacy ?? {}, presetValue ?? {})) {
        status = 'preset-seed'
      } else {
        status = 'user-candidate'
        migrationCandidate = true
        candidates[layoutType] = cloneOverrides(legacy) ?? {}
      }
    } else {
      status = 'preset-seed'
    }

    decisions[layoutType] = {
      layoutType,
      status,
      migrationCandidate,
      ...(legacyPresent && { legacy }),
      ...(canonicalPresent && { canonical }),
      ...(presetPresent && { preset: presetValue }),
      issues: layoutIssues,
    }
  }

  return {
    sourceFingerprint: fingerprint(legacyResult.fingerprintSource),
    decisions,
    candidates,
    conflicts,
    invalidLayouts,
    issues,
    canApply: issues.length === 0 && conflicts.length === 0,
  }
}
