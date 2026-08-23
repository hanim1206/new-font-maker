import type { FontData, FontDataV1_2 } from '../types/database'
import {
  FONT_DATA_V1_3_VERSION,
  FONT_DATA_VERSION,
  LEGACY_FONT_DATA_VERSION,
} from '../types/database'
import {
  parseAndMigrateShapeSystemSource,
  parseShapeSystemSourceV2,
} from './shapeSystemSourceV2'
import {
  canonicalizeLegacyFontPayload,
  validateFontDataPayload,
} from './fontDataPayloadValidation'

export type FontDataParseIssueCode =
  | 'invalid-root'
  | 'unsupported-version'
  | 'unsupported-field'
  | 'missing-field'
  | 'invalid-field'
  | 'invalid-shape-system'
  | 'clone-failed'

export interface FontDataParseIssue {
  code: FontDataParseIssueCode
  path: string
  message: string
}

export type FontDataParseResult =
  | {
    ok: true
    data: FontData
    migratedFrom?: typeof LEGACY_FONT_DATA_VERSION | typeof FONT_DATA_V1_3_VERSION
  }
  | { ok: false; issues: FontDataParseIssue[] }

const COMMON_KEYS = [
  'version',
  'layoutSchemas',
  'globalPadding',
  'paddingOverrides',
  'jamoData',
  'globalStyle',
] as const

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function issue(
  code: FontDataParseIssueCode,
  path: string,
  message: string,
): FontDataParseIssue {
  return { code, path, message }
}

function validatePayload(value: Record<string, unknown>): FontDataParseIssue[] {
  const issues: FontDataParseIssue[] = []
  const requiredRecords = ['layoutSchemas', 'globalPadding', 'paddingOverrides'] as const
  for (const key of requiredRecords) {
    if (!hasOwn(value, key)) {
      issues.push(issue('missing-field', `$.${key}`, `${key} 필드가 없습니다.`))
    } else if (!isRecord(value[key])) {
      issues.push(issue('invalid-field', `$.${key}`, `${key}는 객체여야 합니다.`))
    }
  }

  if (!hasOwn(value, 'jamoData')) {
    issues.push(issue('missing-field', '$.jamoData', 'jamoData 필드가 없습니다.'))
  } else if (!isRecord(value.jamoData)) {
    issues.push(issue('invalid-field', '$.jamoData', 'jamoData는 객체여야 합니다.'))
  } else {
    const allowed = new Set(['choseong', 'jungseong', 'jongseong'])
    for (const key of Object.keys(value.jamoData)) {
      if (!allowed.has(key)) issues.push(issue('unsupported-field', `$.jamoData.${key}`, '지원하지 않는 jamoData 필드입니다.'))
    }
    for (const key of allowed) {
      if (!hasOwn(value.jamoData, key)) {
        issues.push(issue('missing-field', `$.jamoData.${key}`, `${key} 필드가 없습니다.`))
      } else if (!isRecord(value.jamoData[key])) {
        issues.push(issue('invalid-field', `$.jamoData.${key}`, `${key}는 객체여야 합니다.`))
      }
    }
  }

  if (!hasOwn(value, 'globalStyle')) {
    issues.push(issue('missing-field', '$.globalStyle', 'globalStyle 필드가 없습니다.'))
  } else if (!isRecord(value.globalStyle)) {
    issues.push(issue('invalid-field', '$.globalStyle', 'globalStyle은 객체여야 합니다.'))
  } else {
    const allowed = new Set(['style', 'exclusions'])
    for (const key of Object.keys(value.globalStyle)) {
      if (!allowed.has(key)) issues.push(issue('unsupported-field', `$.globalStyle.${key}`, '지원하지 않는 globalStyle 필드입니다.'))
    }
    if (!hasOwn(value.globalStyle, 'style') || !isRecord(value.globalStyle.style)) {
      issues.push(issue('invalid-field', '$.globalStyle.style', 'globalStyle.style은 객체여야 합니다.'))
    }
    if (!hasOwn(value.globalStyle, 'exclusions') || !Array.isArray(value.globalStyle.exclusions)) {
      issues.push(issue('invalid-field', '$.globalStyle.exclusions', 'globalStyle.exclusions는 배열이어야 합니다.'))
    }
  }
  issues.push(...validateFontDataPayload(value, value.version === LEGACY_FONT_DATA_VERSION))
  return issues
}

function sortIssues(issues: FontDataParseIssue[]): FontDataParseIssue[] {
  return issues.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code))
}

/**
 * DB/local JSON ingress의 유일한 FontData version 경계다.
 * 1.2/1.3은 원본 payload를 보존한 1.4로 올리되 layout grid/catalog를 추측해 만들지 않는다.
 */
export function parseAndMigrateFontData(value: unknown): FontDataParseResult {
  if (!isRecord(value)) {
    return { ok: false, issues: [issue('invalid-root', '$', 'FontData root는 객체여야 합니다.')] }
  }
  if (!hasOwn(value, 'version') || typeof value.version !== 'string') {
    return { ok: false, issues: [issue('missing-field', '$.version', 'FontData version이 없습니다.')] }
  }
  if (value.version !== LEGACY_FONT_DATA_VERSION
    && value.version !== FONT_DATA_V1_3_VERSION
    && value.version !== FONT_DATA_VERSION) {
    return {
      ok: false,
      issues: [issue('unsupported-version', '$.version', `지원하지 않는 FontData version입니다: ${value.version}`)],
    }
  }

  const allowedKeys = new Set<string>(COMMON_KEYS)
  if (value.version === FONT_DATA_V1_3_VERSION || value.version === FONT_DATA_VERSION) {
    allowedKeys.add('shapeSystem')
  }
  const issues = Object.keys(value)
    .filter((key) => !allowedKeys.has(key))
    .map((key) => issue('unsupported-field', `$.${key}`, '지원하지 않는 FontData 필드입니다.'))
  issues.push(...validatePayload(value))
  if (issues.length > 0) return { ok: false, issues: sortIssues(issues) }

  let cloned: Record<string, unknown>
  try {
    cloned = structuredClone(value)
  } catch {
    return { ok: false, issues: [issue('clone-failed', '$', 'FontData를 안전하게 복제할 수 없습니다.')] }
  }
  if (value.version === LEGACY_FONT_DATA_VERSION) canonicalizeLegacyFontPayload(cloned)
  const canonicalIssues = validateFontDataPayload(cloned, false)
  if (canonicalIssues.length > 0) return { ok: false, issues: sortIssues(canonicalIssues) }

  let shapeSystem: FontData['shapeSystem']
  if ((value.version === FONT_DATA_V1_3_VERSION || value.version === FONT_DATA_VERSION)
    && hasOwn(value, 'shapeSystem')) {
    if (value.shapeSystem === undefined) {
      return { ok: false, issues: [issue('invalid-shape-system', '$.shapeSystem', 'shapeSystem은 undefined로 저장할 수 없습니다.')] }
    }
    const parsedShape = value.version === FONT_DATA_V1_3_VERSION
      ? parseAndMigrateShapeSystemSource(value.shapeSystem)
      : parseShapeSystemSourceV2(value.shapeSystem)
    if (!parsedShape.ok) {
      return {
        ok: false,
        issues: parsedShape.issues.map(({ code, path }) => issue(
          'invalid-shape-system',
          `$.shapeSystem${path === '$' ? '' : path.slice(1)}`,
          `Shape System source가 유효하지 않습니다: ${code}`,
        )),
      }
    }
    shapeSystem = structuredClone(parsedShape.source) as FontData['shapeSystem']
  }

  const data: FontData = {
    ...(cloned as unknown as Omit<FontDataV1_2, 'version'>),
    version: FONT_DATA_VERSION,
  }
  delete (data as FontData & { shapeSystem?: unknown }).shapeSystem
  if (shapeSystem) data.shapeSystem = shapeSystem

  return value.version === LEGACY_FONT_DATA_VERSION
    ? { ok: true, data, migratedFrom: LEGACY_FONT_DATA_VERSION }
    : value.version === FONT_DATA_V1_3_VERSION
      ? { ok: true, data, migratedFrom: FONT_DATA_V1_3_VERSION }
      : { ok: true, data }
}
