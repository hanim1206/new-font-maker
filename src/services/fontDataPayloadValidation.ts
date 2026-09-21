import type { JamoData } from '../types'
import { CHOSEONG_LIST, JONGSEONG_LIST, JUNGSEONG_LIST } from '../data/Hangul'
import { migrateJamoData, migrateStrokes } from '../utils/strokeMigration'

export interface FontPayloadValidationIssue {
  code: 'missing-field' | 'invalid-field' | 'unsupported-field'
  path: string
  message: string
}

const LAYOUT_TYPES = [
  'choseong-only', 'jungseong-vertical-only', 'jungseong-horizontal-only',
  'jungseong-mixed-only', 'choseong-jungseong-vertical',
  'choseong-jungseong-horizontal', 'choseong-jungseong-mixed',
  'choseong-jungseong-vertical-jongseong',
  'choseong-jungseong-horizontal-jongseong',
  'choseong-jungseong-mixed-jongseong',
] as const
const PARTS = new Set(['CH', 'JU', 'JU_H', 'JU_V', 'JO'])
const LAYOUT_TYPE_SET = new Set<string>(LAYOUT_TYPES)
const EXPECTED_SLOTS: Record<(typeof LAYOUT_TYPES)[number], readonly string[]> = {
  'choseong-only': ['CH'],
  'jungseong-vertical-only': ['JU'],
  'jungseong-horizontal-only': ['JU'],
  'jungseong-mixed-only': ['JU_H', 'JU_V'],
  'choseong-jungseong-vertical': ['CH', 'JU'],
  'choseong-jungseong-horizontal': ['CH', 'JU'],
  'choseong-jungseong-mixed': ['CH', 'JU_H', 'JU_V'],
  'choseong-jungseong-vertical-jongseong': ['CH', 'JU', 'JO'],
  'choseong-jungseong-horizontal-jongseong': ['CH', 'JU', 'JO'],
  'choseong-jungseong-mixed-jongseong': ['CH', 'JU_H', 'JU_V', 'JO'],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function push(
  issues: FontPayloadValidationIssue[],
  code: FontPayloadValidationIssue['code'],
  path: string,
  message: string,
): void {
  issues.push({ code, path, message })
}

function exactKeys(
  value: Record<string, unknown>,
  allowed: readonly string[],
  required: readonly string[],
  path: string,
  issues: FontPayloadValidationIssue[],
): void {
  const allow = new Set(allowed)
  for (const key of Object.keys(value).sort()) {
    if (!allow.has(key)) push(issues, 'unsupported-field', `${path}.${key}`, '지원하지 않는 필드입니다.')
  }
  for (const key of required) {
    if (!hasOwn(value, key)) push(issues, 'missing-field', `${path}.${key}`, '필수 필드가 없습니다.')
  }
}

function validateUniqueIds(
  value: readonly unknown[],
  path: string,
  label: string,
  issues: FontPayloadValidationIssue[],
): void {
  const firstIndexById = new Map<string, number>()
  value.forEach((entry, index) => {
    if (!isRecord(entry) || typeof entry.id !== 'string' || entry.id.length === 0) return
    const firstIndex = firstIndexById.get(entry.id)
    if (firstIndex !== undefined) {
      push(
        issues,
        'invalid-field',
        `${path}[${index}].id`,
        `${label} ID ${entry.id}이 ${path}[${firstIndex}].id와 중복됩니다.`,
      )
      return
    }
    firstIndexById.set(entry.id, index)
  })
}

function finite(value: unknown, path: string, issues: FontPayloadValidationIssue[]): boolean {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    push(issues, 'invalid-field', path, '유한한 숫자여야 합니다.')
    return false
  }
  return true
}

function validatePadding(
  value: unknown,
  path: string,
  issues: FontPayloadValidationIssue[],
  partial = false,
): void {
  if (!isRecord(value)) {
    push(issues, 'invalid-field', path, 'padding은 객체여야 합니다.')
    return
  }
  const keys = ['top', 'bottom', 'left', 'right']
  exactKeys(value, keys, partial ? [] : keys, path, issues)
  for (const key of keys) if (hasOwn(value, key)) finite(value[key], `${path}.${key}`, issues)
}

function validatePartOverrides(value: unknown, path: string, issues: FontPayloadValidationIssue[]): void {
  if (!isRecord(value)) {
    push(issues, 'invalid-field', path, 'part override map은 객체여야 합니다.')
    return
  }
  for (const [part, override] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
    if (!PARTS.has(part)) push(issues, 'unsupported-field', `${path}.${part}`, '알 수 없는 Part입니다.')
    validatePadding(override, `${path}.${part}`, issues)
  }
}

function validateCondition(value: unknown, path: string, issues: FontPayloadValidationIssue[]): void {
  if (!isRecord(value) || typeof value.type !== 'string') {
    push(issues, 'invalid-field', path, 'override condition이 유효하지 않습니다.')
    return
  }
  const isLayout = value.type === 'layoutIs'
  const isJamo = value.type === 'choseongIs' || value.type === 'jungseongIs' || value.type === 'jongseongIs'
  if (!isLayout && !isJamo) {
    push(issues, 'invalid-field', `${path}.type`, '알 수 없는 condition type입니다.')
    return
  }
  exactKeys(value, isLayout ? ['type', 'layout'] : ['type', 'jamo'], isLayout ? ['type', 'layout'] : ['type', 'jamo'], path, issues)
  if (isLayout && !LAYOUT_TYPE_SET.has(String(value.layout))) push(issues, 'invalid-field', `${path}.layout`, '알 수 없는 layout입니다.')
  if (isJamo && (typeof value.jamo !== 'string' || value.jamo.length === 0)) push(issues, 'invalid-field', `${path}.jamo`, 'jamo가 유효하지 않습니다.')
}

function validateConditionGroups(value: unknown, path: string, issues: FontPayloadValidationIssue[]): void {
  if (!Array.isArray(value)) {
    push(issues, 'invalid-field', path, 'conditionGroups는 배열이어야 합니다.')
    return
  }
  value.forEach((group, groupIndex) => {
    if (!Array.isArray(group)) {
      push(issues, 'invalid-field', `${path}[${groupIndex}]`, 'condition group은 배열이어야 합니다.')
      return
    }
    group.forEach((condition, index) => validateCondition(condition, `${path}[${groupIndex}][${index}]`, issues))
  })
}

function validateLayoutSchemas(value: unknown, issues: FontPayloadValidationIssue[]): void {
  if (!isRecord(value)) return
  exactKeys(value, LAYOUT_TYPES, LAYOUT_TYPES, '$.layoutSchemas', issues)
  for (const layoutType of LAYOUT_TYPES) {
    const schema = value[layoutType]
    const path = `$.layoutSchemas.${layoutType}`
    if (!isRecord(schema)) {
      push(issues, 'invalid-field', path, 'LayoutSchema는 객체여야 합니다.')
      continue
    }
    exactKeys(schema, [
      'id', 'slots', 'designBodyPadding', 'splits', 'padding', 'gaps', 'mixedJungseong',
      'partOverrides', 'userPartOverrides', 'partOverridesByJungseong', 'overrides',
    ], ['id', 'slots'], path, issues)
    if (schema.id !== layoutType) push(issues, 'invalid-field', `${path}.id`, 'LayoutSchema id가 map key와 다릅니다.')
    if (!Array.isArray(schema.slots)
      || schema.slots.length !== EXPECTED_SLOTS[layoutType].length
      || schema.slots.some((part, index) => part !== EXPECTED_SLOTS[layoutType][index])) {
      push(issues, 'invalid-field', `${path}.slots`, 'slots가 유효하지 않습니다.')
    }
    if (schema.designBodyPadding !== undefined) validatePadding(schema.designBodyPadding, `${path}.designBodyPadding`, issues)
    if (schema.padding !== undefined) validatePadding(schema.padding, `${path}.padding`, issues)
    if (schema.splits !== undefined) {
      if (!Array.isArray(schema.splits)) push(issues, 'invalid-field', `${path}.splits`, 'splits는 배열이어야 합니다.')
      else schema.splits.forEach((split, index) => {
        const splitPath = `${path}.splits[${index}]`
        if (!isRecord(split)) return push(issues, 'invalid-field', splitPath, 'split은 객체여야 합니다.')
        exactKeys(split, ['axis', 'value'], ['axis', 'value'], splitPath, issues)
        if (split.axis !== 'x' && split.axis !== 'y') push(issues, 'invalid-field', `${splitPath}.axis`, 'split axis가 유효하지 않습니다.')
        finite(split.value, `${splitPath}.value`, issues)
      })
    }
    for (const key of ['partOverrides', 'userPartOverrides'] as const) {
      if (schema[key] !== undefined) validatePartOverrides(schema[key], `${path}.${key}`, issues)
    }
    if (schema.partOverridesByJungseong !== undefined) {
      if (!isRecord(schema.partOverridesByJungseong)) push(issues, 'invalid-field', `${path}.partOverridesByJungseong`, '중성별 override는 객체여야 합니다.')
      else for (const [jamo, overrides] of Object.entries(schema.partOverridesByJungseong)) {
        validatePartOverrides(overrides, `${path}.partOverridesByJungseong.${jamo}`, issues)
      }
    }
    if (schema.overrides !== undefined) {
      if (!Array.isArray(schema.overrides)) push(issues, 'invalid-field', `${path}.overrides`, 'layout overrides는 배열이어야 합니다.')
      else {
        validateUniqueIds(schema.overrides, `${path}.overrides`, 'layout override', issues)
        schema.overrides.forEach((override, index) => {
          const overridePath = `${path}.overrides[${index}]`
          if (!isRecord(override)) return push(issues, 'invalid-field', overridePath, 'layout override는 객체여야 합니다.')
          exactKeys(override, ['id', 'conditionGroups', 'partOverrides', 'priority', 'enabled'], ['id', 'conditionGroups', 'partOverrides', 'priority', 'enabled'], overridePath, issues)
          if (typeof override.id !== 'string' || override.id.length === 0) push(issues, 'invalid-field', `${overridePath}.id`, 'override id가 유효하지 않습니다.')
          validateConditionGroups(override.conditionGroups, `${overridePath}.conditionGroups`, issues)
          validatePartOverrides(override.partOverrides, `${overridePath}.partOverrides`, issues)
          finite(override.priority, `${overridePath}.priority`, issues)
          if (typeof override.enabled !== 'boolean') push(issues, 'invalid-field', `${overridePath}.enabled`, 'enabled는 boolean이어야 합니다.')
        })
      }
    }
    if (schema.gaps !== undefined) validateLayoutGaps(schema.gaps, `${path}.gaps`, issues)
    if (schema.mixedJungseong !== undefined) validateMixedJungseong(schema.mixedJungseong, `${path}.mixedJungseong`, issues)
  }
}

function validateLayoutGaps(value: unknown, path: string, issues: FontPayloadValidationIssue[]): void {
  if (!Array.isArray(value)) return push(issues, 'invalid-field', path, 'gaps는 배열이어야 합니다.')
  validateUniqueIds(value, path, 'layout gap', issues)
  value.forEach((gap, index) => {
    const gapPath = `${path}[${index}]`
    if (!isRecord(gap)) return push(issues, 'invalid-field', gapPath, 'gap은 객체여야 합니다.')
    exactKeys(gap, ['id', 'axis', 'before', 'after', 'size', 'anchor', 'beforeInset', 'afterInset'], ['id', 'axis', 'before', 'after', 'size', 'anchor'], gapPath, issues)
    if (typeof gap.id !== 'string' || gap.id.length === 0) push(issues, 'invalid-field', `${gapPath}.id`, 'gap id가 유효하지 않습니다.')
    if (gap.axis !== 'x' && gap.axis !== 'y') push(issues, 'invalid-field', `${gapPath}.axis`, 'gap axis가 유효하지 않습니다.')
    for (const key of ['before', 'after'] as const) {
      if (!Array.isArray(gap[key]) || gap[key].some((part) => !PARTS.has(String(part)))) push(issues, 'invalid-field', `${gapPath}.${key}`, `${key} Part 배열이 유효하지 않습니다.`)
    }
    if (!['before', 'center', 'after'].includes(String(gap.anchor))) push(issues, 'invalid-field', `${gapPath}.anchor`, 'gap anchor가 유효하지 않습니다.')
    for (const key of ['size', 'beforeInset', 'afterInset'] as const) if (gap[key] !== undefined) finite(gap[key], `${gapPath}.${key}`, issues)
  })
}

function validateMixedJungseong(value: unknown, path: string, issues: FontPayloadValidationIssue[]): void {
  if (!isRecord(value)) return push(issues, 'invalid-field', path, 'mixedJungseong은 객체여야 합니다.')
  exactKeys(value, ['horizontalBox', 'verticalBox'], [], path, issues)
  for (const [key, splitKey] of [['horizontalBox', 'splitY'], ['verticalBox', 'splitX']] as const) {
    const box = value[key]
    if (box === undefined) continue
    if (!isRecord(box)) {
      push(issues, 'invalid-field', `${path}.${key}`, `${key}는 객체여야 합니다.`)
      continue
    }
    exactKeys(box, [splitKey, 'padding'], [], `${path}.${key}`, issues)
    if (box[splitKey] !== undefined) finite(box[splitKey], `${path}.${key}.${splitKey}`, issues)
    if (box.padding !== undefined) validatePadding(box.padding, `${path}.${key}.padding`, issues)
  }
}

function validatePoint(value: unknown, path: string, issues: FontPayloadValidationIssue[]): void {
  if (!isRecord(value)) return push(issues, 'invalid-field', path, 'point는 객체여야 합니다.')
  exactKeys(value, ['x', 'y', 'handleIn', 'handleOut'], ['x', 'y'], path, issues)
  finite(value.x, `${path}.x`, issues)
  finite(value.y, `${path}.y`, issues)
  for (const handleKey of ['handleIn', 'handleOut'] as const) {
    const handle = value[handleKey]
    if (handle === undefined) continue
    if (!isRecord(handle)) push(issues, 'invalid-field', `${path}.${handleKey}`, 'handle은 객체여야 합니다.')
    else {
      exactKeys(handle, ['x', 'y'], ['x', 'y'], `${path}.${handleKey}`, issues)
      finite(handle.x, `${path}.${handleKey}.x`, issues)
      finite(handle.y, `${path}.${handleKey}.y`, issues)
    }
  }
}

function validateStroke(value: unknown, path: string, issues: FontPayloadValidationIssue[], allowLegacy: boolean): void {
  if (!isRecord(value)) return push(issues, 'invalid-field', path, 'stroke는 객체여야 합니다.')
  if (Array.isArray(value.points)) {
    exactKeys(value, ['id', 'points', 'closed', 'thickness', 'label', 'linecap', 'linejoin'], ['id', 'points', 'closed', 'thickness'], path, issues)
    if (typeof value.id !== 'string' || value.id.length === 0) push(issues, 'invalid-field', `${path}.id`, 'stroke id가 유효하지 않습니다.')
    value.points.forEach((point, index) => validatePoint(point, `${path}.points[${index}]`, issues))
    if (typeof value.closed !== 'boolean') push(issues, 'invalid-field', `${path}.closed`, 'closed는 boolean이어야 합니다.')
    finite(value.thickness, `${path}.thickness`, issues)
    if (value.linecap !== undefined && !['round', 'butt', 'square'].includes(String(value.linecap))) push(issues, 'invalid-field', `${path}.linecap`, 'linecap이 유효하지 않습니다.')
    if (value.linejoin !== undefined && !['miter', 'round', 'bevel'].includes(String(value.linejoin))) push(issues, 'invalid-field', `${path}.linejoin`, 'linejoin이 유효하지 않습니다.')
    return
  }
  if (!allowLegacy || !['horizontal', 'vertical', 'path'].includes(String(value.direction))) {
    push(issues, 'invalid-field', path, '지원하지 않는 stroke 형식입니다.')
    return
  }
  const allowed = value.direction === 'path'
    ? ['id', 'x', 'y', 'width', 'height', 'thickness', 'direction', 'pathData']
    : ['id', 'x', 'y', 'width', 'height', 'thickness', 'angle', 'direction']
  exactKeys(value, allowed, ['id', 'x', 'y', 'width', 'direction'], path, issues)
  for (const key of ['x', 'y', 'width']) finite(value[key], `${path}.${key}`, issues)
  if (value.height !== undefined) finite(value.height, `${path}.height`, issues)
  if (value.thickness !== undefined) finite(value.thickness, `${path}.thickness`, issues)
  if (value.angle !== undefined) finite(value.angle, `${path}.angle`, issues)
  if (value.direction === 'path') {
    if (!hasOwn(value, 'pathData')) push(issues, 'missing-field', `${path}.pathData`, 'legacy pathData가 없습니다.')
    if (!hasOwn(value, 'height')) push(issues, 'missing-field', `${path}.height`, 'legacy path height가 없습니다.')
    validateLegacyPathData(value.pathData, `${path}.pathData`, issues)
  } else if (!(typeof value.height === 'number') && !(typeof value.angle === 'number' && typeof value.thickness === 'number')) {
    push(issues, 'invalid-field', path, 'legacy rect stroke는 height 또는 angle+thickness가 필요합니다.')
  }
}

function validateLegacyPathData(value: unknown, path: string, issues: FontPayloadValidationIssue[]): void {
  if (!isRecord(value)) return push(issues, 'invalid-field', path, 'pathData는 객체여야 합니다.')
  exactKeys(value, ['points', 'closed'], ['points', 'closed'], path, issues)
  if (!Array.isArray(value.points)) push(issues, 'invalid-field', `${path}.points`, 'path points는 배열이어야 합니다.')
  else value.points.forEach((point, index) => validatePoint(point, `${path}.points[${index}]`, issues))
  if (typeof value.closed !== 'boolean') push(issues, 'invalid-field', `${path}.closed`, 'path closed는 boolean이어야 합니다.')
}

function validateStrokeArray(value: unknown, path: string, issues: FontPayloadValidationIssue[], allowLegacy: boolean): void {
  if (!Array.isArray(value)) return push(issues, 'invalid-field', path, 'stroke channel은 배열이어야 합니다.')
  validateUniqueIds(value, path, 'stroke', issues)
  value.forEach((stroke, index) => validateStroke(stroke, `${path}[${index}]`, issues, allowLegacy))
}

function validateJamoMap(
  value: unknown,
  type: 'choseong' | 'jungseong' | 'jongseong',
  issues: FontPayloadValidationIssue[],
  allowLegacy: boolean,
): void {
  if (!isRecord(value)) return
  const expected = type === 'choseong'
    ? CHOSEONG_LIST
    : type === 'jungseong'
      ? JUNGSEONG_LIST
      : JONGSEONG_LIST.filter((char) => char !== '')
  exactKeys(value, expected, expected, `$.jamoData.${type}`, issues)
  for (const [char, jamo] of Object.entries(value).sort(([a], [b]) => a.localeCompare(b))) {
    const path = `$.jamoData.${type}.${char}`
    if (!isRecord(jamo)) {
      push(issues, 'invalid-field', path, 'JamoData는 객체여야 합니다.')
      continue
    }
    exactKeys(jamo, [
      'char', 'type', 'geometryMode', 'strokes', 'horizontalStrokes', 'verticalStrokes', 'contextStrokes', 'frame',
      'contextualInkSafety', 'padding', 'horizontalPadding', 'verticalPadding', 'overrides',
    ], ['char', 'type'], path, issues)
    if (jamo.contextStrokes !== undefined) {
      if (!isRecord(jamo.contextStrokes)) push(issues, 'invalid-field', `${path}.contextStrokes`, 'contextStrokes는 객체여야 합니다.')
      else {
        exactKeys(jamo.contextStrokes, ['right', 'bottom', 'mixed'], [], `${path}.contextStrokes`, issues)
        for (const family of ['right', 'bottom', 'mixed'] as const) {
          if (jamo.contextStrokes[family] !== undefined) validateStrokeArray(jamo.contextStrokes[family], `${path}.contextStrokes.${family}`, issues, allowLegacy)
        }
      }
    }
    // 기준 틀: 획 채널과 같은 꼴의 사본.
    if (jamo.frame !== undefined) {
      if (!isRecord(jamo.frame)) push(issues, 'invalid-field', `${path}.frame`, 'frame은 객체여야 합니다.')
      else {
        exactKeys(jamo.frame, ['strokes', 'horizontalStrokes', 'verticalStrokes', 'contextStrokes'], [], `${path}.frame`, issues)
        for (const channel of ['strokes', 'horizontalStrokes', 'verticalStrokes'] as const) {
          if (jamo.frame[channel] !== undefined) validateStrokeArray(jamo.frame[channel], `${path}.frame.${channel}`, issues, allowLegacy)
        }
        if (jamo.frame.contextStrokes !== undefined) {
          if (!isRecord(jamo.frame.contextStrokes)) push(issues, 'invalid-field', `${path}.frame.contextStrokes`, 'contextStrokes는 객체여야 합니다.')
          else for (const family of ['right', 'bottom', 'mixed'] as const) {
            if (jamo.frame.contextStrokes[family] !== undefined) validateStrokeArray(jamo.frame.contextStrokes[family], `${path}.frame.contextStrokes.${family}`, issues, allowLegacy)
          }
        }
      }
    }
    if (jamo.char !== char) push(issues, 'invalid-field', `${path}.char`, 'JamoData char가 map key와 다릅니다.')
    if (jamo.type !== type) push(issues, 'invalid-field', `${path}.type`, 'JamoData type이 map과 다릅니다.')
    if (jamo.geometryMode !== undefined && jamo.geometryMode !== 'slot-normalized' && jamo.geometryMode !== 'ink-normalized') push(issues, 'invalid-field', `${path}.geometryMode`, 'geometryMode가 유효하지 않습니다.')
    for (const channel of ['strokes', 'horizontalStrokes', 'verticalStrokes'] as const) {
      if (jamo[channel] !== undefined) validateStrokeArray(jamo[channel], `${path}.${channel}`, issues, allowLegacy)
    }
    for (const padding of ['padding', 'horizontalPadding', 'verticalPadding'] as const) {
      if (jamo[padding] !== undefined) validatePadding(jamo[padding], `${path}.${padding}`, issues)
    }
    if (jamo.contextualInkSafety !== undefined) validateContextualInkSafety(jamo.contextualInkSafety, `${path}.contextualInkSafety`, issues, allowLegacy)
    if (jamo.overrides !== undefined) validateJamoOverrides(jamo.overrides, `${path}.overrides`, issues, allowLegacy)
  }
}

function validateContextualInkSafety(value: unknown, path: string, issues: FontPayloadValidationIssue[], allowLegacy: boolean): void {
  if (!isRecord(value)) return push(issues, 'invalid-field', path, 'contextualInkSafety는 객체여야 합니다.')
  exactKeys(value, ['origin', 'minimumGap'], ['origin', 'minimumGap'], path, issues)
  finite(value.minimumGap, `${path}.minimumGap`, issues)
  if (!isRecord(value.origin)) push(issues, 'invalid-field', `${path}.origin`, 'origin은 객체여야 합니다.')
  else {
    exactKeys(value.origin, ['strokes', 'horizontalStrokes', 'verticalStrokes'], [], `${path}.origin`, issues)
    for (const channel of ['strokes', 'horizontalStrokes', 'verticalStrokes'] as const) if (value.origin[channel] !== undefined) {
      validateStrokeArray(value.origin[channel], `${path}.origin.${channel}`, issues, allowLegacy)
    }
  }
}

function validateJamoOverrides(value: unknown, path: string, issues: FontPayloadValidationIssue[], allowLegacy: boolean): void {
  if (!Array.isArray(value)) return push(issues, 'invalid-field', path, 'jamo overrides는 배열이어야 합니다.')
  validateUniqueIds(value, path, 'jamo override', issues)
  value.forEach((override, index) => {
    const overridePath = `${path}[${index}]`
    if (!isRecord(override)) return push(issues, 'invalid-field', overridePath, 'jamo override는 객체여야 합니다.')
    exactKeys(override, ['id', 'conditionGroups', 'conditions', 'variant', 'priority', 'enabled'], allowLegacy ? ['id', 'variant', 'priority', 'enabled'] : ['id', 'conditionGroups', 'variant', 'priority', 'enabled'], overridePath, issues)
    if (typeof override.id !== 'string' || override.id.length === 0) push(issues, 'invalid-field', `${overridePath}.id`, 'override id가 유효하지 않습니다.')
    if (override.conditionGroups !== undefined) validateConditionGroups(override.conditionGroups, `${overridePath}.conditionGroups`, issues)
    if (override.conditions !== undefined) {
      if (!Array.isArray(override.conditions)) push(issues, 'invalid-field', `${overridePath}.conditions`, 'legacy conditions는 배열이어야 합니다.')
      else override.conditions.forEach((condition, conditionIndex) => validateCondition(condition, `${overridePath}.conditions[${conditionIndex}]`, issues))
    }
    if (override.conditionGroups === undefined && override.conditions === undefined) push(issues, 'missing-field', `${overridePath}.conditionGroups`, 'override 조건이 없습니다.')
    validateJamoVariant(override.variant, `${overridePath}.variant`, issues, allowLegacy)
    finite(override.priority, `${overridePath}.priority`, issues)
    if (typeof override.enabled !== 'boolean') push(issues, 'invalid-field', `${overridePath}.enabled`, 'enabled는 boolean이어야 합니다.')
  })
}

function validateJamoVariant(value: unknown, path: string, issues: FontPayloadValidationIssue[], allowLegacy: boolean): void {
  if (!isRecord(value)) return push(issues, 'invalid-field', path, 'jamo variant는 객체여야 합니다.')
  exactKeys(value, ['strokes', 'horizontalStrokes', 'verticalStrokes', 'padding', 'horizontalPadding', 'verticalPadding', 'transform'], [], path, issues)
  for (const channel of ['strokes', 'horizontalStrokes', 'verticalStrokes'] as const) if (value[channel] !== undefined) {
    validateStrokeArray(value[channel], `${path}.${channel}`, issues, allowLegacy)
  }
  for (const padding of ['padding', 'horizontalPadding', 'verticalPadding'] as const) if (value[padding] !== undefined) {
    validatePadding(value[padding], `${path}.${padding}`, issues)
  }
  if (value.transform !== undefined) {
    if (!isRecord(value.transform)) push(issues, 'invalid-field', `${path}.transform`, 'transform은 객체여야 합니다.')
    else {
      const keys = ['translateX', 'translateY', 'scaleX', 'scaleY']
      exactKeys(value.transform, keys, keys, `${path}.transform`, issues)
      for (const key of keys) finite(value.transform[key], `${path}.transform.${key}`, issues)
    }
  }
}

function validateBrush(value: unknown, path: string, issues: FontPayloadValidationIssue[]): void {
  if (!isRecord(value)) return push(issues, 'invalid-field', path, 'brush는 객체여야 합니다.')
  exactKeys(value, ['tip', 'aspectRatio', 'angle'], ['tip', 'aspectRatio', 'angle'], path, issues)
  if (!['round', 'ellipse', 'rectangle'].includes(String(value.tip))) push(issues, 'invalid-field', `${path}.tip`, 'brush tip이 유효하지 않습니다.')
  finite(value.aspectRatio, `${path}.aspectRatio`, issues)
  finite(value.angle, `${path}.angle`, issues)
}

function validateStrokeStyle(value: unknown, path: string, issues: FontPayloadValidationIssue[], allowLegacy: boolean): void {
  if (!isRecord(value) || typeof value.mode !== 'string') return push(issues, 'invalid-field', path, 'strokeStyle이 유효하지 않습니다.')
  if (value.mode === 'grid-system-2' && allowLegacy) {
    exactKeys(value, ['mode'], ['mode'], path, issues)
    return
  }
  const fields: Record<string, readonly string[]> = {
    brush: ['mode', 'brush'],
    'angled-area': ['mode', 'cutAngle', 'cornerRadius'],
    'dot-pattern': ['mode', 'dotSize', 'gap', 'rows', 'stagger', 'omitEvery'],
    'legacy-snapped-centerline': ['mode'],
  }
  const allowed = fields[value.mode]
  if (!allowed) return push(issues, 'invalid-field', `${path}.mode`, 'strokeStyle mode가 유효하지 않습니다.')
  exactKeys(value, allowed, allowed, path, issues)
  if (value.mode === 'brush') validateBrush(value.brush, `${path}.brush`, issues)
  for (const key of allowed) {
    if (!['mode', 'brush', 'stagger'].includes(key)) finite(value[key], `${path}.${key}`, issues)
  }
  if (value.mode === 'dot-pattern' && typeof value.stagger !== 'boolean') push(issues, 'invalid-field', `${path}.stagger`, 'stagger는 boolean이어야 합니다.')
}

function validateStemBeak(value: unknown, path: string, issues: FontPayloadValidationIssue[]): void {
  if (!isRecord(value)) return push(issues, 'invalid-field', path, 'stemBeak는 객체여야 합니다.')
  exactKeys(value, ['enabled', 'shape', 'size', 'angle'], ['enabled', 'shape', 'size', 'angle'], path, issues)
  if (!['angled', 'slab', 'round', 'bar', 'flare'].includes(String(value.shape))) push(issues, 'invalid-field', `${path}.shape`, 'stemBeak shape이 유효하지 않습니다.')
  if (typeof value.enabled !== 'boolean') push(issues, 'invalid-field', `${path}.enabled`, 'stemBeak enabled는 boolean이어야 합니다.')
  finite(value.size, `${path}.size`, issues)
  finite(value.angle, `${path}.angle`, issues)
}

function validateGlobalStyle(value: unknown, issues: FontPayloadValidationIssue[], allowLegacy: boolean): void {
  if (!isRecord(value)) return
  const style = value.style
  if (isRecord(style)) {
    const path = '$.globalStyle.style'
    const keys = ['slant', 'weight', 'letterSpacing', 'linecap', 'linejoin', 'brush', 'strokeStyle']
    // 부리는 나중에 생긴 값이라 없어도 된다(옛 저장분).
    exactKeys(style, [...keys, 'stemBeak'], keys, path, issues)
    if (style.stemBeak !== undefined) validateStemBeak(style.stemBeak, `${path}.stemBeak`, issues)
    for (const key of ['slant', 'weight', 'letterSpacing']) finite(style[key], `${path}.${key}`, issues)
    if (!['round', 'butt', 'square'].includes(String(style.linecap))) push(issues, 'invalid-field', `${path}.linecap`, 'linecap이 유효하지 않습니다.')
    if (!['miter', 'round', 'bevel'].includes(String(style.linejoin))) push(issues, 'invalid-field', `${path}.linejoin`, 'linejoin이 유효하지 않습니다.')
    validateBrush(style.brush, `${path}.brush`, issues)
    validateStrokeStyle(style.strokeStyle, `${path}.strokeStyle`, issues, allowLegacy)
  }
  if (Array.isArray(value.exclusions)) {
    validateUniqueIds(value.exclusions, '$.globalStyle.exclusions', 'global style exclusion', issues)
    value.exclusions.forEach((entry, index) => {
      const path = `$.globalStyle.exclusions[${index}]`
      if (!isRecord(entry)) return push(issues, 'invalid-field', path, 'exclusion은 객체여야 합니다.')
      exactKeys(entry, ['id', 'property', 'layoutType'], ['id', 'property', 'layoutType'], path, issues)
      if (typeof entry.id !== 'string' || entry.id.length === 0) push(issues, 'invalid-field', `${path}.id`, 'exclusion id가 유효하지 않습니다.')
      if (!['slant', 'weight', 'letterSpacing', 'linecap', 'linejoin', 'brush', 'strokeStyle', 'stemBeak'].includes(String(entry.property))) push(issues, 'invalid-field', `${path}.property`, 'exclusion property가 유효하지 않습니다.')
      if (!LAYOUT_TYPE_SET.has(String(entry.layoutType))) push(issues, 'invalid-field', `${path}.layoutType`, 'layoutType이 유효하지 않습니다.')
    })
  }
}

export function validateFontDataPayload(
  value: Record<string, unknown>,
  allowLegacy: boolean,
): FontPayloadValidationIssue[] {
  const issues: FontPayloadValidationIssue[] = []
  validateLayoutSchemas(value.layoutSchemas, issues)
  validatePadding(value.globalPadding, '$.globalPadding', issues)
  if (isRecord(value.paddingOverrides)) {
    for (const [layoutType, padding] of Object.entries(value.paddingOverrides).sort(([a], [b]) => a.localeCompare(b))) {
      if (!LAYOUT_TYPE_SET.has(layoutType)) push(issues, 'unsupported-field', `$.paddingOverrides.${layoutType}`, '알 수 없는 layout padding override입니다.')
      validatePadding(padding, `$.paddingOverrides.${layoutType}`, issues, true)
    }
  }
  if (isRecord(value.jamoData)) {
    validateJamoMap(value.jamoData.choseong, 'choseong', issues, allowLegacy)
    validateJamoMap(value.jamoData.jungseong, 'jungseong', issues, allowLegacy)
    validateJamoMap(value.jamoData.jongseong, 'jongseong', issues, allowLegacy)
  }
  validateGlobalStyle(value.globalStyle, issues, allowLegacy)
  return issues.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code))
}

/** validation 성공 뒤 1.2 legacy stroke/style alias만 명시적으로 canonicalize한다. */
export function canonicalizeLegacyFontPayload(value: Record<string, unknown>): void {
  const jamoData = value.jamoData as Record<string, Record<string, JamoData>>
  for (const type of ['choseong', 'jungseong', 'jongseong']) {
    for (const [char, jamo] of Object.entries(jamoData[type])) {
      const migrated = migrateJamoData(jamo)
      const origin = migrated.contextualInkSafety?.origin
      if (origin?.strokes) origin.strokes = migrateStrokes(origin.strokes)
      if (origin?.horizontalStrokes) origin.horizontalStrokes = migrateStrokes(origin.horizontalStrokes)
      if (origin?.verticalStrokes) origin.verticalStrokes = migrateStrokes(origin.verticalStrokes)
      for (const override of migrated.overrides ?? []) {
        if (override.variant.strokes) override.variant.strokes = migrateStrokes(override.variant.strokes)
        if (override.variant.horizontalStrokes) override.variant.horizontalStrokes = migrateStrokes(override.variant.horizontalStrokes)
        if (override.variant.verticalStrokes) override.variant.verticalStrokes = migrateStrokes(override.variant.verticalStrokes)
        if ((!override.conditionGroups || override.conditionGroups.length === 0) && override.conditions?.length) {
          override.conditionGroups = [structuredClone(override.conditions)]
        }
        delete override.conditions
      }
      jamoData[type][char] = migrated
    }
  }
  const globalStyle = value.globalStyle as { style: { strokeStyle: { mode: string } } }
  if (globalStyle.style.strokeStyle.mode === 'grid-system-2') {
    globalStyle.style.strokeStyle = { mode: 'legacy-snapped-centerline' }
  }
}
