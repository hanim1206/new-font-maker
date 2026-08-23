import type {
  CoreXRailRole,
  CoreYRailRole,
  DeepReadonly,
  GridAreaElement,
  GridCellRef,
  JamoConstructionChannel,
  JamoPartRole,
  JamoRoleMaster,
  RailAxis,
  RailGrid,
  RoleConstructionScope,
  SourceCommandTransaction,
} from '../types'
import {
  createEmptyJamoRoleMaster,
  createGridCellId,
  expectedConstructionChannel,
  validateRoleConstructionScope,
} from './jamoConstruction'
import { CORE_X_RAIL_ROLES, CORE_Y_RAIL_ROLES } from './railGridResolver'
import { parseRoleConstructionSourceV1 } from './roleConstructionSourceV1'

export const GRID_V1_STORAGE_KEY = 'font-maker-grid-system-2-lab-v1'
export const GRID_V1_JAMOS = ['ㄱ', 'ㄴ', 'ㄷ', 'ㅁ', 'ㅇ'] as const

export type GridV1Jamo = (typeof GRID_V1_JAMOS)[number]

interface GridV1Point {
  xIndex: number
  yIndex: number
}

interface GridV1Guide {
  from: GridV1Point
  to: GridV1Point
}

interface GridV1AppliedCut {
  guide: GridV1Guide
  side: 'above' | 'below'
}

interface GridV1LocalCut {
  guide: GridV1Guide
  anchor: GridV1Point
  target: { row: number; column: number }
  side: 'above' | 'below'
}

interface GridV1Curve {
  vertex: GridV1Point
  incoming: GridV1Point
  outgoing: GridV1Point
}

interface GridV1Diagonal {
  vertex: GridV1Point
  from: GridV1Point
  to: GridV1Point
}

interface GridV1Glyph {
  cells: boolean[][]
  curve: 'square' | 'grid-rounded'
  cuts: Array<'top-left' | 'top-right' | 'bottom-right' | 'bottom-left'>
  cut: GridV1AppliedCut | null
  localCuts: GridV1LocalCut[]
  curves: GridV1Curve[]
  diagonalEdges: GridV1Diagonal[]
}

export interface GridV1ImportCandidate {
  version: 1
  snapUnit: number
  cutGuide: GridV1Guide
  xRails: number[]
  yRails: number[]
  glyphs: Record<GridV1Jamo, GridV1Glyph>
}

export type GridV1ImportIssueCode =
  | 'missing-storage'
  | 'invalid-json'
  | 'invalid-root'
  | 'unknown-field'
  | 'missing-field'
  | 'unsupported-version'
  | 'invalid-field'
  | 'invalid-import-id'
  | 'invalid-role'
  | 'invalid-selection'
  | 'invalid-core-map'
  | 'invalid-proposal'

export interface GridV1ImportIssue {
  code: GridV1ImportIssueCode
  path: string
  message: string
}

export type GridV1ImportBlockerCode =
  | 'unsupported-rounded-mode'
  | 'unsupported-corner-cut'
  | 'unsupported-cut'
  | 'unsupported-local-cut'
  | 'unsupported-curve'
  | 'unsupported-diagonal'

export interface GridV1ImportBlocker {
  code: GridV1ImportBlockerCode
  path: string
  jamo: GridV1Jamo
  count: number
  message: string
}

export type GridV1CandidateParseResult =
  | { ok: true; candidate: DeepReadonly<GridV1ImportCandidate>; fingerprint: string; legacyRaw: string }
  | { ok: false; issues: GridV1ImportIssue[] }

export interface GridV1CoreIndexMap {
  x: Record<CoreXRailRole, number>
  y: Record<CoreYRailRole, number>
}

export interface GridV1ImportProposal {
  importId: string
  role: JamoPartRole
  selectedJamos: GridV1Jamo[]
  candidateFingerprint: string
  legacyRaw: string
  coreIndexMap: GridV1CoreIndexMap
  sourceFingerprint: string
  source: RoleConstructionScope
  legacyStorage: { key: typeof GRID_V1_STORAGE_KEY; disposition: 'preserve' }
}

export type GridV1ImportProposalResult =
  | { ok: true; proposal: GridV1ImportProposal }
  | { ok: false; issues: GridV1ImportIssue[]; blockers: GridV1ImportBlocker[] }

export type GridV1ImportApplyIssueCode =
  | 'invalid-command'
  | 'invalid-before'
  | 'role-mismatch'
  | 'target-not-empty'
  | 'target-grid-mismatch'
  | 'stale-before'
  | 'invalid-proposal'

export interface GridV1ImportApplyIssue {
  code: GridV1ImportApplyIssueCode
  path: string
  message: string
}

export type GridV1ImportApplyResult =
  | {
    ok: true
    source: RoleConstructionScope
    transaction: SourceCommandTransaction<RoleConstructionScope>
  }
  | { ok: false; issues: GridV1ImportApplyIssue[] }

const ROOT_KEYS = ['version', 'snapUnit', 'cutGuide', 'xRails', 'yRails', 'glyphs'] as const
const ROOT_REQUIRED_KEYS = ['version', 'xRails', 'yRails', 'glyphs'] as const
const GLYPH_KEYS = ['cells', 'curve', 'cuts', 'cut', 'localCuts', 'curves', 'diagonalEdges'] as const
const GLYPH_REQUIRED_KEYS = ['cells', 'curve', 'cuts'] as const
const JAMO_SET = new Set<string>(GRID_V1_JAMOS)
const ROLE_SET = new Set<string>(['STANDALONE', 'CH', 'JO'])

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key)
}

function addIssue(
  issues: GridV1ImportIssue[],
  code: GridV1ImportIssueCode,
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
  issues: GridV1ImportIssue[],
): void {
  const allowedSet = new Set(allowed)
  for (const key of Object.keys(value).sort()) {
    if (!allowedSet.has(key)) addIssue(issues, 'unknown-field', `${path}.${key}`, '지원하지 않는 필드입니다.')
  }
  for (const key of required) {
    if (!hasOwn(value, key)) addIssue(issues, 'missing-field', `${path}.${key}`, '필수 필드가 없습니다.')
  }
}

function finiteNumber(value: unknown, path: string, issues: GridV1ImportIssue[]): value is number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    addIssue(issues, 'invalid-field', path, '유한한 숫자여야 합니다.')
    return false
  }
  return true
}

function parsePoint(
  value: unknown,
  path: string,
  xCount: number,
  yCount: number,
  issues: GridV1ImportIssue[],
): GridV1Point | null {
  if (!isRecord(value)) {
    addIssue(issues, 'invalid-field', path, '그리드 점은 객체여야 합니다.')
    return null
  }
  exactKeys(value, ['xIndex', 'yIndex'], ['xIndex', 'yIndex'], path, issues)
  if (!Number.isInteger(value.xIndex) || (value.xIndex as number) < 0 || (value.xIndex as number) >= xCount) {
    addIssue(issues, 'invalid-field', `${path}.xIndex`, 'xIndex가 레일 범위를 벗어납니다.')
  }
  if (!Number.isInteger(value.yIndex) || (value.yIndex as number) < 0 || (value.yIndex as number) >= yCount) {
    addIssue(issues, 'invalid-field', `${path}.yIndex`, 'yIndex가 레일 범위를 벗어납니다.')
  }
  return Number.isInteger(value.xIndex) && Number.isInteger(value.yIndex)
    ? { xIndex: value.xIndex as number, yIndex: value.yIndex as number }
    : null
}

function parseGuide(
  value: unknown,
  path: string,
  xCount: number,
  yCount: number,
  issues: GridV1ImportIssue[],
): GridV1Guide | null {
  if (!isRecord(value)) {
    addIssue(issues, 'invalid-field', path, 'guide는 객체여야 합니다.')
    return null
  }
  exactKeys(value, ['from', 'to'], ['from', 'to'], path, issues)
  const from = parsePoint(value.from, `${path}.from`, xCount, yCount, issues)
  const to = parsePoint(value.to, `${path}.to`, xCount, yCount, issues)
  if (from && to && (from.xIndex === to.xIndex || from.yIndex === to.yIndex)) {
    addIssue(issues, 'invalid-field', path, 'guide는 서로 다른 행과 열을 잇는 대각선이어야 합니다.')
  }
  return from && to ? { from, to } : null
}

function parseRails(value: unknown, path: string, issues: GridV1ImportIssue[]): number[] | null {
  if (!Array.isArray(value) || value.length < 5 || value.length > 12) {
    addIssue(issues, 'invalid-field', path, '레일은 5–12개의 배열이어야 합니다.')
    return null
  }
  const rails: number[] = []
  value.forEach((rail, index) => {
    if (finiteNumber(rail, `${path}[${index}]`, issues)) {
      if (rail < 0 || rail > 1000) addIssue(issues, 'invalid-field', `${path}[${index}]`, '레일은 0–1000 범위여야 합니다.')
      rails.push(rail)
    }
  })
  if (rails.length === value.length && rails.some((rail, index) => index > 0 && rail <= rails[index - 1])) {
    addIssue(issues, 'invalid-field', path, '레일은 중복 없이 오름차순이어야 합니다.')
  }
  if (rails.length === value.length && rails.some((rail, index) => index > 0 && rail - rails[index - 1] < 50)) {
    addIssue(issues, 'invalid-field', path, '인접 레일은 50 unit 이상 떨어져야 합니다.')
  }
  return rails.length === value.length ? rails : null
}

function parseCells(
  value: unknown,
  path: string,
  rows: number,
  columns: number,
  issues: GridV1ImportIssue[],
): boolean[][] | null {
  if (!Array.isArray(value) || value.length !== rows) {
    addIssue(issues, 'invalid-field', path, `cells는 ${rows}행이어야 합니다.`)
    return null
  }
  let valid = true
  const cells = value.map((row, rowIndex) => {
    if (!Array.isArray(row) || row.length !== columns || row.some((cell) => typeof cell !== 'boolean')) {
      addIssue(issues, 'invalid-field', `${path}[${rowIndex}]`, `${columns}개의 boolean 셀이 필요합니다.`)
      valid = false
      return []
    }
    return [...row] as boolean[]
  })
  return valid ? cells : null
}

function parsePointTriple(
  value: unknown,
  path: string,
  keys: readonly [string, string, string],
  xCount: number,
  yCount: number,
  issues: GridV1ImportIssue[],
): Record<string, GridV1Point> | null {
  if (!isRecord(value)) {
    addIssue(issues, 'invalid-field', path, '경계 처리는 객체여야 합니다.')
    return null
  }
  exactKeys(value, keys, keys, path, issues)
  const points = keys.map((key) => parsePoint(value[key], `${path}.${key}`, xCount, yCount, issues))
  if (points.some((point) => point === null)) return null
  return Object.fromEntries(keys.map((key, index) => [key, points[index]!]))
}

function parseGlyph(
  value: unknown,
  path: string,
  xCount: number,
  yCount: number,
  issues: GridV1ImportIssue[],
): GridV1Glyph | null {
  if (!isRecord(value)) {
    addIssue(issues, 'invalid-field', path, 'glyph는 객체여야 합니다.')
    return null
  }
  exactKeys(value, GLYPH_KEYS, GLYPH_REQUIRED_KEYS, path, issues)
  const cells = parseCells(value.cells, `${path}.cells`, yCount - 1, xCount - 1, issues)
  if (value.curve !== 'square' && value.curve !== 'grid-rounded') {
    addIssue(issues, 'invalid-field', `${path}.curve`, 'curve mode가 유효하지 않습니다.')
  }
  const cornerSet = new Set(['top-left', 'top-right', 'bottom-right', 'bottom-left'])
  const cuts = Array.isArray(value.cuts) && value.cuts.every((cut) => cornerSet.has(String(cut)))
    ? [...value.cuts] as GridV1Glyph['cuts']
    : null
  if (!cuts) addIssue(issues, 'invalid-field', `${path}.cuts`, 'cuts가 유효하지 않습니다.')

  let cut: GridV1AppliedCut | null = null
  if (hasOwn(value, 'cut') && value.cut !== null) {
    if (!isRecord(value.cut)) addIssue(issues, 'invalid-field', `${path}.cut`, 'cut은 객체 또는 null이어야 합니다.')
    else {
      exactKeys(value.cut, ['guide', 'side'], ['guide', 'side'], `${path}.cut`, issues)
      const guide = parseGuide(value.cut.guide, `${path}.cut.guide`, xCount, yCount, issues)
      if (value.cut.side !== 'above' && value.cut.side !== 'below') addIssue(issues, 'invalid-field', `${path}.cut.side`, 'cut side가 유효하지 않습니다.')
      if (guide && (value.cut.side === 'above' || value.cut.side === 'below')) cut = { guide, side: value.cut.side }
    }
  }

  const parseArray = <T>(
    input: unknown,
    arrayPath: string,
    parser: (entry: unknown, entryPath: string) => T | null,
  ): T[] | null => {
    if (!Array.isArray(input)) {
      addIssue(issues, 'invalid-field', arrayPath, '배열이어야 합니다.')
      return null
    }
    const result = input.map((entry, index) => parser(entry, `${arrayPath}[${index}]`))
    return result.some((entry) => entry === null) ? null : result as T[]
  }

  const localCuts = hasOwn(value, 'localCuts')
    ? parseArray(value.localCuts, `${path}.localCuts`, (entry, entryPath): GridV1LocalCut | null => {
    if (!isRecord(entry)) {
      addIssue(issues, 'invalid-field', entryPath, 'local cut은 객체여야 합니다.')
      return null
    }
    exactKeys(entry, ['guide', 'anchor', 'target', 'side'], ['guide', 'anchor', 'target', 'side'], entryPath, issues)
    const guide = parseGuide(entry.guide, `${entryPath}.guide`, xCount, yCount, issues)
    const anchor = parsePoint(entry.anchor, `${entryPath}.anchor`, xCount, yCount, issues)
    let target: GridV1LocalCut['target'] | null = null
    if (!isRecord(entry.target)) addIssue(issues, 'invalid-field', `${entryPath}.target`, 'target은 객체여야 합니다.')
    else {
      exactKeys(entry.target, ['row', 'column'], ['row', 'column'], `${entryPath}.target`, issues)
      if (Number.isInteger(entry.target.row) && Number.isInteger(entry.target.column)
        && (entry.target.row as number) >= 0 && (entry.target.row as number) < yCount - 1
        && (entry.target.column as number) >= 0 && (entry.target.column as number) < xCount - 1) {
        target = { row: entry.target.row as number, column: entry.target.column as number }
      } else addIssue(issues, 'invalid-field', `${entryPath}.target`, 'target cell이 범위를 벗어납니다.')
    }
    if (entry.side !== 'above' && entry.side !== 'below') addIssue(issues, 'invalid-field', `${entryPath}.side`, 'side가 유효하지 않습니다.')
    return guide && anchor && target && (entry.side === 'above' || entry.side === 'below')
      ? { guide, anchor, target, side: entry.side }
      : null
    })
    : []

  const curves = hasOwn(value, 'curves')
    ? parseArray(value.curves, `${path}.curves`, (entry, entryPath): GridV1Curve | null => {
      const parsed = parsePointTriple(entry, entryPath, ['vertex', 'incoming', 'outgoing'], xCount, yCount, issues)
      return parsed ? parsed as unknown as GridV1Curve : null
    })
    : []
  const diagonalEdges = hasOwn(value, 'diagonalEdges')
    ? parseArray(value.diagonalEdges, `${path}.diagonalEdges`, (entry, entryPath): GridV1Diagonal | null => {
      const parsed = parsePointTriple(entry, entryPath, ['vertex', 'from', 'to'], xCount, yCount, issues)
      return parsed ? parsed as unknown as GridV1Diagonal : null
    })
    : []

  if (!cells || !cuts || !localCuts || !curves || !diagonalEdges
    || (value.curve !== 'square' && value.curve !== 'grid-rounded')
    || (hasOwn(value, 'cut') && value.cut !== null && cut === null)) return null
  return { cells, curve: value.curve, cuts, cut, localCuts, curves, diagonalEdges }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right))
    return `{${entries.map(([key, child]) => `${JSON.stringify(key)}:${canonicalJson(child)}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function fingerprint(value: unknown): string {
  const text = canonicalJson(value)
  let hash = 0x811c9dc5
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return `fnv1a32:${(hash >>> 0).toString(16).padStart(8, '0')}`
}

export function fingerprintGridV1ImportSource(source: DeepReadonly<RoleConstructionScope>): string {
  return fingerprint(source)
}

function sortedIssues(issues: GridV1ImportIssue[]): GridV1ImportIssue[] {
  return issues.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code))
}

export function parseGridV1ImportCandidate(raw: string | null | undefined): GridV1CandidateParseResult {
  if (raw === null || raw === undefined) {
    return { ok: false, issues: [{ code: 'missing-storage', path: '$', message: 'Grid Lab v1 저장값이 없습니다.' }] }
  }
  let value: unknown
  try {
    value = JSON.parse(raw) as unknown
  } catch {
    return { ok: false, issues: [{ code: 'invalid-json', path: '$', message: 'Grid Lab v1 JSON을 해석할 수 없습니다.' }] }
  }
  if (!isRecord(value)) {
    return { ok: false, issues: [{ code: 'invalid-root', path: '$', message: 'Grid Lab v1 root는 객체여야 합니다.' }] }
  }
  const issues: GridV1ImportIssue[] = []
  exactKeys(value, ROOT_KEYS, ROOT_REQUIRED_KEYS, '$', issues)
  if (value.version !== 1) addIssue(issues, 'unsupported-version', '$.version', `지원하지 않는 Grid Lab version입니다: ${String(value.version)}`)
  if (hasOwn(value, 'snapUnit')) {
    if (finiteNumber(value.snapUnit, '$.snapUnit', issues)
      && (!Number.isInteger(value.snapUnit) || value.snapUnit < 5 || value.snapUnit > 100 || value.snapUnit % 5 !== 0)) {
      addIssue(issues, 'invalid-field', '$.snapUnit', 'snapUnit은 5–100 범위의 5단위 정수여야 합니다.')
    }
  }
  const xRails = parseRails(value.xRails, '$.xRails', issues)
  const yRails = parseRails(value.yRails, '$.yRails', issues)
  if (!xRails || !yRails) return { ok: false, issues: sortedIssues(issues) }
  const cutGuide = hasOwn(value, 'cutGuide')
    ? parseGuide(value.cutGuide, '$.cutGuide', xRails.length, yRails.length, issues)
    : { from: { xIndex: 0, yIndex: 2 }, to: { xIndex: 3, yIndex: 0 } }
  const glyphs = {} as Record<GridV1Jamo, GridV1Glyph>
  if (!isRecord(value.glyphs)) addIssue(issues, 'invalid-field', '$.glyphs', 'glyphs는 객체여야 합니다.')
  else {
    exactKeys(value.glyphs, GRID_V1_JAMOS, GRID_V1_JAMOS, '$.glyphs', issues)
    for (const jamo of GRID_V1_JAMOS) {
      const glyph = parseGlyph(value.glyphs[jamo], `$.glyphs.${jamo}`, xRails.length, yRails.length, issues)
      if (glyph) glyphs[jamo] = glyph
    }
  }
  if (issues.length > 0 || !cutGuide || Object.keys(glyphs).length !== GRID_V1_JAMOS.length) {
    return { ok: false, issues: sortedIssues(issues) }
  }
  const candidate: GridV1ImportCandidate = {
    version: 1,
    snapUnit: hasOwn(value, 'snapUnit') ? value.snapUnit as number : 25,
    cutGuide,
    xRails,
    yRails,
    glyphs,
  }
  return {
    ok: true,
    candidate: structuredClone(candidate),
    fingerprint: fingerprint(candidate),
    legacyRaw: raw,
  }
}

function collectBlockers(
  candidate: DeepReadonly<GridV1ImportCandidate>,
  selectedJamos: readonly GridV1Jamo[],
): GridV1ImportBlocker[] {
  const blockers: GridV1ImportBlocker[] = []
  const add = (jamo: GridV1Jamo, code: GridV1ImportBlockerCode, field: string, count: number, message: string) => {
    if (count > 0) blockers.push({ code, path: `$.glyphs.${jamo}.${field}`, jamo, count, message })
  }
  for (const jamo of selectedJamos) {
    const glyph = candidate.glyphs[jamo]
    add(jamo, 'unsupported-rounded-mode', 'curve', glyph.curve === 'grid-rounded' ? 1 : 0, '구형 전체 곡률 의미는 자동 변환할 수 없습니다.')
    add(jamo, 'unsupported-corner-cut', 'cuts', glyph.cuts.length, '구형 모서리 절단 의미는 자동 변환할 수 없습니다.')
    add(jamo, 'unsupported-cut', 'cut', glyph.cut ? 1 : 0, '구형 전역 절단 의미는 자동 변환할 수 없습니다.')
    add(jamo, 'unsupported-local-cut', 'localCuts', glyph.localCuts.length, '구형 국소 절단 의미는 자동 변환할 수 없습니다.')
    add(jamo, 'unsupported-curve', 'curves', glyph.curves.length, '곡률 참조 의미는 이 import 조각에서 변환하지 않습니다.')
    add(jamo, 'unsupported-diagonal', 'diagonalEdges', glyph.diagonalEdges.length, '사선 참조 의미는 이 import 조각에서 변환하지 않습니다.')
  }
  return blockers.sort((left, right) => left.path.localeCompare(right.path) || left.code.localeCompare(right.code))
}

function validateCoreMap(
  mapping: unknown,
  roles: readonly string[],
  railCount: number,
  axis: RailAxis,
  issues: GridV1ImportIssue[],
): Map<number, string> {
  const result = new Map<number, string>()
  const path = `$.coreIndexMap.${axis}`
  if (!isRecord(mapping)) {
    addIssue(issues, 'invalid-core-map', path, 'core index map은 객체여야 합니다.')
    return result
  }
  exactKeys(mapping, roles, roles, path, issues)
  const indexes: number[] = []
  roles.forEach((role) => {
    const index = mapping[role]
    if (!Number.isInteger(index) || (index as number) < 0 || (index as number) >= railCount) {
      addIssue(issues, 'invalid-core-map', `${path}.${role}`, 'core index가 레일 범위를 벗어납니다.')
      return
    }
    indexes.push(index as number)
    if (result.has(index as number)) addIssue(issues, 'invalid-core-map', `${path}.${role}`, '같은 레일을 두 core role에 연결할 수 없습니다.')
    else result.set(index as number, role)
  })
  if (indexes.length === roles.length && indexes.some((index, position) => position > 0 && index <= indexes[position - 1])) {
    addIssue(issues, 'invalid-core-map', path, 'core role index는 의미 순서대로 증가해야 합니다.')
  }
  if (indexes.length === roles.length && (indexes[0] !== 0 || indexes[indexes.length - 1] !== railCount - 1)) {
    addIssue(issues, 'invalid-core-map', path, 'outer core role은 첫 레일과 마지막 레일에 연결해야 합니다.')
  }
  return result
}

function canonicalCoreIndexMap(coreIndexMap: DeepReadonly<GridV1CoreIndexMap>): GridV1CoreIndexMap {
  return {
    x: Object.fromEntries(CORE_X_RAIL_ROLES.map((role) => [role, coreIndexMap.x[role]])) as Record<CoreXRailRole, number>,
    y: Object.fromEntries(CORE_Y_RAIL_ROLES.map((role) => [role, coreIndexMap.y[role]])) as Record<CoreYRailRole, number>,
  }
}

function encode(value: string): string {
  return encodeURIComponent(value)
}

function createGrid(
  candidate: DeepReadonly<GridV1ImportCandidate>,
  importId: string,
  role: JamoPartRole,
  coreIndexMap: GridV1CoreIndexMap,
): RailGrid {
  const gridId = `grid-v1-import:${encode(importId)}:${encode(role)}`
  const createRails = (axis: RailAxis, values: readonly number[], coreMap: ReadonlyMap<number, string>) => values.map((value, index) => {
    const coreRole = coreMap.get(index)
    return {
      id: `${gridId}:${axis}:legacy-rail-${index}`,
      kind: coreRole ? 'core' as const : 'auxiliary' as const,
      ...(coreRole ? { coreRole: coreRole as CoreXRailRole | CoreYRailRole } : {}),
      position: { kind: 'absolute' as const, value: value / 1000 },
    }
  })
  const xCoreMap = new Map(Object.entries(coreIndexMap.x).map(([coreRole, index]) => [index, coreRole]))
  const yCoreMap = new Map(Object.entries(coreIndexMap.y).map(([coreRole, index]) => [index, coreRole]))
  return {
    id: gridId,
    role,
    xRails: createRails('x', candidate.xRails, xCoreMap),
    yRails: createRails('y', candidate.yRails, yCoreMap),
    snapStep: candidate.snapUnit / 1000,
    minGap: 0.05,
  }
}

function channelFor(master: JamoRoleMaster): JamoConstructionChannel {
  const channel = expectedConstructionChannel(master.role)
  if (channel === 'horizontal' && master.role === 'JU_H') return master.construction.channels.horizontal
  if (channel === 'vertical' && master.role === 'JU_V') return master.construction.channels.vertical
  if (channel === 'main' && master.role !== 'JU_H' && master.role !== 'JU_V') return master.construction.channels.main
  throw new Error('role과 construction channel이 일치하지 않습니다.')
}

function createMaster(
  candidate: DeepReadonly<GridV1ImportCandidate>,
  grid: RailGrid,
  jamo: GridV1Jamo,
  importId: string,
): JamoRoleMaster {
  const master = createEmptyJamoRoleMaster({ jamoId: jamo, role: grid.role, gridId: grid.id })
  const channel = channelFor(master)
  const elementId = `grid-v1-import:${encode(importId)}:${encode(grid.role)}:${encode(jamo)}:area`
  const filledCells: GridCellRef[] = []
  candidate.glyphs[jamo].cells.forEach((row, rowIndex) => row.forEach((filled, columnIndex) => {
    if (!filled) return
    const leftRailId = grid.xRails[columnIndex].id
    const rightRailId = grid.xRails[columnIndex + 1].id
    const topRailId = grid.yRails[rowIndex].id
    const bottomRailId = grid.yRails[rowIndex + 1].id
    filledCells.push({
      id: createGridCellId({
        masterId: master.id,
        channel: expectedConstructionChannel(master.role),
        elementId,
        leftRailId,
        rightRailId,
        topRailId,
        bottomRailId,
      }),
      leftRailId,
      rightRailId,
      topRailId,
      bottomRailId,
    })
  }))
  const area: GridAreaElement = { id: elementId, kind: 'area', filledCells, boundaryTreatments: [] }
  channel.elements = [area]
  return master
}

/**
 * 검토 가능한 순수 import 제안만 만든다. 저장·store 적용·history transaction은
 * 의도적으로 다음 조각의 명시적 apply 경계에 남긴다.
 */
export function proposeGridV1Import(input: {
  candidate: DeepReadonly<GridV1ImportCandidate>
  candidateFingerprint: string
  legacyRaw: string
  importId: string
  role: JamoPartRole
  coreIndexMap: GridV1CoreIndexMap
  selectedJamos: readonly GridV1Jamo[]
}): GridV1ImportProposalResult {
  const issues: GridV1ImportIssue[] = []
  const parsedRaw = parseGridV1ImportCandidate(input.legacyRaw)
  if (!parsedRaw.ok) {
    addIssue(issues, 'invalid-field', '$.legacyRaw', 'legacy raw가 strict Grid Lab v1 후보가 아닙니다.')
  } else if (parsedRaw.fingerprint !== input.candidateFingerprint) {
    addIssue(issues, 'invalid-field', '$.legacyRaw', 'legacy raw와 candidate fingerprint가 일치하지 않습니다.')
  }
  if (typeof input.importId !== 'string' || input.importId.trim() === '') {
    addIssue(issues, 'invalid-import-id', '$.importId', 'importId는 비어 있지 않은 문자열이어야 합니다.')
  }
  if (typeof input.role !== 'string' || !ROLE_SET.has(input.role)) {
    addIssue(issues, 'invalid-role', '$.role', `알 수 없는 role입니다: ${String(input.role)}`)
  }
  if (input.candidateFingerprint !== fingerprint(input.candidate)) {
    addIssue(issues, 'invalid-field', '$.candidateFingerprint', 'candidate fingerprint가 현재 후보와 일치하지 않습니다.')
  }
  const selectionIsArray = Array.isArray(input.selectedJamos)
  const requestedSelection = selectionIsArray ? [...input.selectedJamos] : []
  if (!selectionIsArray || requestedSelection.length === 0
    || requestedSelection.some((jamo) => !JAMO_SET.has(String(jamo)))
    || new Set(requestedSelection).size !== requestedSelection.length) {
    addIssue(issues, 'invalid-selection', '$.selectedJamos', '선택 자소는 중복 없는 Grid Lab v1 자소 목록이어야 합니다.')
  }
  const selected = GRID_V1_JAMOS.filter((jamo) => requestedSelection.includes(jamo))
  validateCoreMap(input.coreIndexMap?.x, CORE_X_RAIL_ROLES, input.candidate.xRails.length, 'x', issues)
  validateCoreMap(input.coreIndexMap?.y, CORE_Y_RAIL_ROLES, input.candidate.yRails.length, 'y', issues)
  const blockers = selected.every((jamo) => JAMO_SET.has(jamo)) ? collectBlockers(input.candidate, selected) : []
  if (issues.length > 0 || blockers.length > 0) return { ok: false, issues: sortedIssues(issues), blockers }

  const coreIndexMap = canonicalCoreIndexMap(input.coreIndexMap)
  const grid = createGrid(input.candidate, input.importId, input.role, coreIndexMap)
  const source: RoleConstructionScope = {
    schema: 'role-construction',
    version: 1,
    grid,
    masters: selected.map((jamo) => createMaster(input.candidate, grid, jamo, input.importId)),
  }
  const validation = validateRoleConstructionScope(source)
  if (!validation.ok) {
    return {
      ok: false,
      blockers: [],
      issues: [{
        code: 'invalid-proposal',
        path: '$.source',
        message: `import proposal이 production 계약을 통과하지 못했습니다: ${validation.issues.map(({ code }) => code).join(', ')}`,
      }],
    }
  }
  const proposal: GridV1ImportProposal = {
    importId: input.importId,
    role: input.role,
    selectedJamos: selected,
    candidateFingerprint: input.candidateFingerprint,
    legacyRaw: input.legacyRaw,
    coreIndexMap,
    sourceFingerprint: fingerprint(source),
    source: structuredClone(source),
    legacyStorage: { key: GRID_V1_STORAGE_KEY, disposition: 'preserve' },
  }
  return { ok: true, proposal }
}


function applyFailure(
  code: GridV1ImportApplyIssueCode,
  path: string,
  message: string,
): GridV1ImportApplyResult {
  return { ok: false, issues: [{ code, path, message }] }
}

/**
 * 검증된 Grid v1 제안을 비어 있는 단일 role source에 적용하는 순수 transaction 경계다.
 * store, localStorage, FontData에는 접근하지 않는다.
 */
export function applyGridV1ImportProposal(
  before: DeepReadonly<RoleConstructionScope>,
  proposal: DeepReadonly<GridV1ImportProposal>,
  command: DeepReadonly<{
    transactionId: string
    expectedBeforeFingerprint: string
    targetPolicy: 'empty-only'
  }>,
): GridV1ImportApplyResult {
  if (!isRecord(command)
    || typeof command.transactionId !== 'string'
    || command.transactionId.trim() === ''
    || typeof command.expectedBeforeFingerprint !== 'string'
    || command.expectedBeforeFingerprint.trim() === ''
    || command.targetPolicy !== 'empty-only') {
    return applyFailure('invalid-command', '$.command', 'import command가 유효하지 않습니다.')
  }

  const parsedBefore = parseRoleConstructionSourceV1(before)
  if (!parsedBefore.ok) {
    return applyFailure(
      'invalid-before',
      '$.before',
      `적용 전 source가 strict v1 계약을 통과하지 못했습니다: ${parsedBefore.issues.map(({ code }) => code).join(', ')}`,
    )
  }
  if (!isRecord(proposal) || typeof proposal.role !== 'string' || parsedBefore.source.grid.role !== proposal.role) {
    return applyFailure('role-mismatch', '$.proposal.role', '제안 role과 적용 대상 role이 일치하지 않습니다.')
  }
  if (parsedBefore.source.masters.length !== 0) {
    return applyFailure('target-not-empty', '$.before.masters', 'empty-only import 대상에는 기존 master가 없어야 합니다.')
  }
  const beforeFingerprint = fingerprint(parsedBefore.source)
  if (command.expectedBeforeFingerprint !== beforeFingerprint) {
    return applyFailure('stale-before', '$.command.expectedBeforeFingerprint', '적용 전 source fingerprint가 예상값과 다릅니다.')
  }

  const parsedRaw = parseGridV1ImportCandidate(proposal.legacyRaw)
  if (!parsedRaw.ok) {
    return applyFailure('invalid-proposal', '$.proposal.legacyRaw', '제안의 legacy raw를 strict하게 재해석할 수 없습니다.')
  }
  const rebuilt = proposeGridV1Import({
    candidate: parsedRaw.candidate,
    candidateFingerprint: parsedRaw.fingerprint,
    legacyRaw: parsedRaw.legacyRaw,
    importId: proposal.importId,
    role: proposal.role,
    coreIndexMap: proposal.coreIndexMap,
    selectedJamos: proposal.selectedJamos,
  })
  if (!rebuilt.ok || canonicalJson(rebuilt.proposal) !== canonicalJson(proposal)
    || rebuilt.proposal.sourceFingerprint !== fingerprint(rebuilt.proposal.source)) {
    return applyFailure('invalid-proposal', '$.proposal', '제안이 legacy raw에서 재구성한 canonical 제안과 일치하지 않습니다.')
  }
  const canonicalEmptyTarget = structuredClone(rebuilt.proposal.source)
  canonicalEmptyTarget.masters = []
  if (canonicalJson(parsedBefore.source) !== canonicalJson(canonicalEmptyTarget)) {
    return applyFailure(
      'target-grid-mismatch',
      '$.before.grid',
      '적용 대상의 schema, version, grid가 제안에서 재구성한 canonical empty target과 일치하지 않습니다.',
    )
  }

  const transactionBefore = structuredClone(parsedBefore.source) as RoleConstructionScope
  const transactionAfter = structuredClone(rebuilt.proposal.source)
  return {
    ok: true,
    source: structuredClone(transactionAfter),
    transaction: {
      id: command.transactionId,
      kind: 'master-grid',
      command: 'import-grid-v1',
      before: transactionBefore,
      after: transactionAfter,
    },
  }
}
