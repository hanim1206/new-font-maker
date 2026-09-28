/**
 * 추출한 OTF가 iOS(CoreText) · 일반 앱에서 등록 · 선택 · 렌더링될 조건을 파일 바이트만 보고 검사한다.
 * opentype.js를 거치지 않고 직접 읽으므로 만든 쪽 버그를 같은 눈으로 덮지 않는다.
 *
 * severity: error = 등록 · 선택이 깨질 수 있음 / warning = 규격 어긋남 · 일부 환경 문제 / info = 참고.
 */
import { isValidPostScriptName } from './fontIdentity'
import { readCmapRecords, readSfnt } from './openTypePackaging'
import type { SfntTable } from './openTypePackaging'
import { tableChecksum } from './fontRevision'

export type ValidationSeverity = 'error' | 'warning' | 'info'

export interface ValidationIssue {
  severity: ValidationSeverity
  /** 기계가 읽는 짧은 코드. `cmap.unicode-missing` 같은 꼴. */
  code: string
  message: string
  detail?: unknown
}

export interface NameSet {
  family?: string
  subfamily?: string
  fullName?: string
  postScriptName?: string
  uniqueId?: string
  version?: string
}

export interface OpenTypeValidationReport {
  /** error가 하나도 없으면 true. */
  ok: boolean
  issues: ValidationIssue[]
  tables: string[]
  missingTables: string[]
  cmap: {
    unicodePlatform: boolean
    windowsPlatform: boolean
    /** 두 플랫폼이 모두 있을 때 같은 매핑인지. 하나만 있으면 null. */
    mappingsAgree: boolean | null
    hangulSyllables: number
    compatibilityJamo: number
    /** U+0020~U+007E 중 매핑된 수(최대 95). */
    ascii: number
    space: boolean
  }
  names: {
    windows: NameSet
    macintosh: NameSet
    /** Windows language ID(16진수 문자열) → 한국어 등 localized 이름. */
    localized: Record<string, { family?: string; fullName?: string }>
  }
  cff: { fontName?: string; fullName?: string; familyName?: string; weight?: string; charStringCount?: number } | null
  metrics: {
    unitsPerEm?: number
    hhea?: { ascender: number; descender: number; lineGap: number }
    typo?: { ascender: number; descender: number; lineGap: number }
    win?: { ascent: number; descent: number }
    fsSelection?: number
    usWeightClass?: number
    macStyle?: number
    italicAngle?: number
    bbox?: { xMin: number; yMin: number; xMax: number; yMax: number }
    advanceWidthMax?: number
  }
}

const REQUIRED_TABLES = ['head', 'hhea', 'maxp', 'OS/2', 'name', 'cmap', 'post', 'hmtx'] as const
const HANGUL_FIRST = 0xac00
const HANGUL_LAST = 0xd7a3
const JAMO_FIRST = 0x3131
const JAMO_LAST = 0x3163
const ASCII_FIRST = 0x20
const ASCII_LAST = 0x7e
const HEAD_MAGIC = 0x5f0f3cf5
const CHECKSUM_MAGIC = 0xb1b0afba
const FS_SELECTION_ITALIC = 0x01
const FS_SELECTION_BOLD = 0x20
const FS_SELECTION_REGULAR = 0x40
const NAME_IDS = { family: 1, subfamily: 2, uniqueId: 3, fullName: 4, version: 5, postScriptName: 6 } as const
// CFF 표준 문자열 391개 중 이름 비교에 나올 만한 꼬리(379~390). 나머지 표준 SID는 비교하지 않는다.
const CFF_STANDARD_STRING_TAIL: Record<number, string> = {
  379: '001.000', 380: '001.001', 381: '001.002', 382: '001.003', 383: 'Black', 384: 'Bold', 385: 'Book',
  386: 'Light', 387: 'Medium', 388: 'Regular', 389: 'Roman', 390: 'Semibold',
}
const CFF_STANDARD_STRING_COUNT = 391

function viewOf(table: SfntTable): DataView {
  return new DataView(table.data.buffer, table.data.byteOffset, table.data.byteLength)
}

// ===== cmap =====

function parseFormat4(view: DataView, offset: number, into: Map<number, number>): void {
  const segCount = view.getUint16(offset + 6) / 2
  const endCodes = offset + 14
  const startCodes = endCodes + segCount * 2 + 2
  const idDeltas = startCodes + segCount * 2
  const idRangeOffsets = idDeltas + segCount * 2
  for (let segment = 0; segment < segCount; segment += 1) {
    const end = view.getUint16(endCodes + segment * 2)
    const start = view.getUint16(startCodes + segment * 2)
    const delta = view.getInt16(idDeltas + segment * 2)
    const rangeOffsetAddress = idRangeOffsets + segment * 2
    const rangeOffset = view.getUint16(rangeOffsetAddress)
    if (start === 0xffff) continue
    for (let code = start; code <= end && code !== 0xffff; code += 1) {
      let glyph: number
      if (rangeOffset === 0) {
        glyph = (code + delta) & 0xffff
      } else {
        const address = rangeOffsetAddress + rangeOffset + (code - start) * 2
        if (address + 2 > view.byteLength) continue
        const raw = view.getUint16(address)
        glyph = raw === 0 ? 0 : (raw + delta) & 0xffff
      }
      if (glyph !== 0) into.set(code, glyph)
    }
  }
}

function parseFormat12(view: DataView, offset: number, into: Map<number, number>): void {
  const groupCount = view.getUint32(offset + 12)
  for (let group = 0; group < groupCount; group += 1) {
    const at = offset + 16 + group * 12
    const start = view.getUint32(at)
    const end = view.getUint32(at + 4)
    const glyph = view.getUint32(at + 8)
    for (let code = start; code <= end; code += 1) into.set(code, glyph + (code - start))
  }
}

/** 한 플랫폼(0 또는 3)의 Unicode 서브테이블을 전부 합친 코드포인트 → 글리프 표. 없으면 null. */
function unicodeMappingOf(cmap: SfntTable, platformId: number, issues: ValidationIssue[]): Map<number, number> | null {
  const view = viewOf(cmap)
  const records = readCmapRecords(cmap.data).filter((record) => record.platformId === platformId
    && (platformId === 0 || record.encodingId === 1 || record.encodingId === 10))
  if (records.length === 0) return null
  const mapping = new Map<number, number>()
  for (const record of records) {
    if (record.offset + 4 > view.byteLength) {
      issues.push({ severity: 'error', code: 'cmap.subtable-out-of-range', message: `cmap (${record.platformId},${record.encodingId}) 서브테이블이 표 밖을 가리킵니다.` })
      continue
    }
    const format = view.getUint16(record.offset)
    if (format === 4) parseFormat4(view, record.offset, mapping)
    else if (format === 12) parseFormat12(view, record.offset, mapping)
    else issues.push({ severity: 'info', code: 'cmap.format-skipped', message: `cmap (${record.platformId},${record.encodingId}) format ${format}은 검사에서 건너뜁니다.` })
  }
  return mapping
}

function countRange(mapping: Map<number, number>, first: number, last: number): number {
  let count = 0
  for (let code = first; code <= last; code += 1) if (mapping.has(code)) count += 1
  return count
}

function mappingsEqual(a: Map<number, number>, b: Map<number, number>): boolean {
  if (a.size !== b.size) return false
  for (const [code, glyph] of a) if (b.get(code) !== glyph) return false
  return true
}

// ===== name =====

interface RawNameRecord {
  platformId: number
  encodingId: number
  languageId: number
  nameId: number
  text: string
}

function decodeName(bytes: Uint8Array, platformId: number): string {
  if (platformId === 1) return Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
  let out = ''
  for (let index = 0; index + 1 < bytes.length; index += 2) out += String.fromCharCode((bytes[index] << 8) | bytes[index + 1])
  return out
}

function readNameRecords(name: SfntTable, issues: ValidationIssue[]): RawNameRecord[] {
  const view = viewOf(name)
  const count = view.getUint16(2)
  const stringOffset = view.getUint16(4)
  const records: RawNameRecord[] = []
  for (let index = 0; index < count; index += 1) {
    const at = 6 + index * 12
    if (at + 12 > view.byteLength) break
    const platformId = view.getUint16(at)
    const encodingId = view.getUint16(at + 2)
    const languageId = view.getUint16(at + 4)
    const nameId = view.getUint16(at + 6)
    const length = view.getUint16(at + 8)
    const offset = stringOffset + view.getUint16(at + 10)
    if (offset + length > name.data.length) {
      issues.push({ severity: 'error', code: 'name.string-out-of-range', message: `name ID ${nameId} 문자열이 표 밖을 가리킵니다.` })
      continue
    }
    records.push({ platformId, encodingId, languageId, nameId, text: decodeName(name.data.subarray(offset, offset + length), platformId) })
  }
  return records
}

function nameSetOf(records: RawNameRecord[], platformId: number, encodingId: number, languageId: number): NameSet {
  const pick = (nameId: number) => records.find((record) => record.platformId === platformId && record.encodingId === encodingId && record.languageId === languageId && record.nameId === nameId)?.text
  return {
    family: pick(NAME_IDS.family),
    subfamily: pick(NAME_IDS.subfamily),
    uniqueId: pick(NAME_IDS.uniqueId),
    fullName: pick(NAME_IDS.fullName),
    version: pick(NAME_IDS.version),
    postScriptName: pick(NAME_IDS.postScriptName),
  }
}

// ===== CFF =====

interface CffIndex {
  items: Uint8Array[]
  end: number
}

function readCffIndex(data: Uint8Array, at: number): CffIndex {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength)
  const count = view.getUint16(at)
  if (count === 0) return { items: [], end: at + 2 }
  const offSize = view.getUint8(at + 2)
  const readOffset = (index: number) => {
    let value = 0
    for (let byte = 0; byte < offSize; byte += 1) value = (value << 8) | view.getUint8(at + 3 + index * offSize + byte)
    return value >>> 0
  }
  const dataStart = at + 3 + (count + 1) * offSize - 1
  const items: Uint8Array[] = []
  for (let index = 0; index < count; index += 1) items.push(data.subarray(dataStart + readOffset(index), dataStart + readOffset(index + 1)))
  return { items, end: dataStart + readOffset(count) }
}

/** Top DICT에서 연산자 → 피연산자 목록. 실수(30)는 이름 비교에 안 쓰니 NaN으로 둔다. */
function parseCffDict(dict: Uint8Array): Map<number, number[]> {
  const out = new Map<number, number[]>()
  let operands: number[] = []
  for (let index = 0; index < dict.length;) {
    const b0 = dict[index]
    if (b0 <= 21) {
      let op = b0
      index += 1
      if (b0 === 12) { op = 1200 + dict[index]; index += 1 }
      out.set(op, operands)
      operands = []
    } else if (b0 === 28) { operands.push((dict[index + 1] << 24 >> 16) | dict[index + 2]); index += 3 }
    else if (b0 === 29) { operands.push((dict[index + 1] << 24) | (dict[index + 2] << 16) | (dict[index + 3] << 8) | dict[index + 4]); index += 5 }
    else if (b0 === 30) {
      // 실수: 니블 0xf가 나올 때까지.
      index += 1
      while (index < dict.length && (dict[index] & 0x0f) !== 0x0f && (dict[index] >> 4) !== 0x0f) index += 1
      index += 1
      operands.push(Number.NaN)
    } else if (b0 >= 32 && b0 <= 246) { operands.push(b0 - 139); index += 1 }
    else if (b0 >= 247 && b0 <= 250) { operands.push((b0 - 247) * 256 + dict[index + 1] + 108); index += 2 }
    else if (b0 >= 251 && b0 <= 254) { operands.push(-(b0 - 251) * 256 - dict[index + 1] - 108); index += 2 }
    else index += 1
  }
  return out
}

function readCff(cff: SfntTable, issues: ValidationIssue[]): OpenTypeValidationReport['cff'] {
  try {
    const data = cff.data
    const headerSize = data[2]
    const nameIndex = readCffIndex(data, headerSize)
    const topDictIndex = readCffIndex(data, nameIndex.end)
    const stringIndex = readCffIndex(data, topDictIndex.end)
    const latin1 = (bytes: Uint8Array) => Array.from(bytes, (byte) => String.fromCharCode(byte)).join('')
    const sidText = (sid: number | undefined): string | undefined => {
      if (sid === undefined || !Number.isFinite(sid)) return undefined
      if (sid < CFF_STANDARD_STRING_COUNT) return CFF_STANDARD_STRING_TAIL[sid] ?? `<standard string ${sid}>`
      const custom = stringIndex.items[sid - CFF_STANDARD_STRING_COUNT]
      return custom ? latin1(custom) : undefined
    }
    const topDict = parseCffDict(topDictIndex.items[0] ?? new Uint8Array())
    const charStringsOffset = topDict.get(17)?.[0]
    const charStringCount = charStringsOffset !== undefined && charStringsOffset < data.length
      ? new DataView(data.buffer, data.byteOffset, data.byteLength).getUint16(charStringsOffset)
      : undefined
    return {
      fontName: nameIndex.items[0] ? latin1(nameIndex.items[0]) : undefined,
      fullName: sidText(topDict.get(2)?.[0]),
      familyName: sidText(topDict.get(3)?.[0]),
      weight: sidText(topDict.get(4)?.[0]),
      charStringCount,
    }
  } catch (error) {
    issues.push({ severity: 'error', code: 'cff.unreadable', message: `CFF 표를 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}` })
    return null
  }
}

// ===== 본 검사 =====

export function validateOpenTypeForIOS(fontBuffer: ArrayBuffer): OpenTypeValidationReport {
  const issues: ValidationIssue[] = []
  const report: OpenTypeValidationReport = {
    ok: false,
    issues,
    tables: [],
    missingTables: [],
    cmap: { unicodePlatform: false, windowsPlatform: false, mappingsAgree: null, hangulSyllables: 0, compatibilityJamo: 0, ascii: 0, space: false },
    names: { windows: {}, macintosh: {}, localized: {} },
    cff: null,
    metrics: {},
  }

  let tables: SfntTable[]
  try {
    tables = readSfnt(fontBuffer).tables
  } catch (error) {
    issues.push({ severity: 'error', code: 'sfnt.unreadable', message: `sfnt 컨테이너를 읽지 못했습니다: ${error instanceof Error ? error.message : String(error)}` })
    return report
  }
  const table = (tag: string) => tables.find((item) => item.tag === tag)
  report.tables = tables.map((item) => item.tag)

  // 필수 표
  report.missingTables = REQUIRED_TABLES.filter((tag) => !table(tag))
  const hasOutlines = Boolean(table('CFF ')) || Boolean(table('CFF2')) || (Boolean(table('glyf')) && Boolean(table('loca')))
  if (!hasOutlines) report.missingTables.push('CFF /glyf')
  for (const tag of report.missingTables) issues.push({ severity: 'error', code: 'table.missing', message: `필수 표 ${tag}가 없습니다.` })

  // head · 체크섬
  const head = table('head')
  let numGlyphs: number | undefined
  if (head && head.data.length >= 54) {
    const view = viewOf(head)
    if (view.getUint32(12) !== HEAD_MAGIC) issues.push({ severity: 'error', code: 'head.magic', message: 'head.magicNumber가 틀립니다.' })
    const unitsPerEm = view.getUint16(18)
    report.metrics.unitsPerEm = unitsPerEm
    if (unitsPerEm < 16 || unitsPerEm > 16384) issues.push({ severity: 'error', code: 'head.unitsPerEm', message: `unitsPerEm ${unitsPerEm}은 16~16384 밖입니다.` })
    report.metrics.bbox = { xMin: view.getInt16(36), yMin: view.getInt16(38), xMax: view.getInt16(40), yMax: view.getInt16(42) }
    report.metrics.macStyle = view.getUint16(44)
    const fileView = new DataView(fontBuffer)
    const headOffsetInFile = (() => {
      const count = fileView.getUint16(4)
      for (let index = 0; index < count; index += 1) {
        const at = 12 + index * 16
        if (fileView.getUint32(at) === 0x68656164) return fileView.getUint32(at + 8)
      }
      return -1
    })()
    if (headOffsetInFile >= 0) {
      const stored = fileView.getUint32(headOffsetInFile + 8)
      fileView.setUint32(headOffsetInFile + 8, 0)
      const expected = (CHECKSUM_MAGIC - tableChecksum(fileView, 0, fontBuffer.byteLength)) >>> 0
      fileView.setUint32(headOffsetInFile + 8, stored)
      if (stored !== expected) issues.push({ severity: 'warning', code: 'head.checksum', message: 'head.checkSumAdjustment가 파일 내용과 맞지 않습니다.' })
    }
  }
  const maxp = table('maxp')
  if (maxp && maxp.data.length >= 6) numGlyphs = viewOf(maxp).getUint16(4)

  // cmap
  const cmap = table('cmap')
  if (cmap) {
    const unicode = unicodeMappingOf(cmap, 0, issues)
    const windows = unicodeMappingOf(cmap, 3, issues)
    report.cmap.unicodePlatform = unicode !== null
    report.cmap.windowsPlatform = windows !== null
    if (!windows) issues.push({ severity: 'error', code: 'cmap.windows-missing', message: 'Windows Unicode cmap((3,1) 또는 (3,10))이 없습니다.' })
    if (!unicode) issues.push({ severity: 'warning', code: 'cmap.unicode-missing', message: 'Unicode 플랫폼 cmap((0,3) 또는 (0,4))이 없습니다. iOS/macOS는 Windows cmap도 읽지만 Unicode cmap을 우선한다.' })
    if (unicode && windows) {
      report.cmap.mappingsAgree = mappingsEqual(unicode, windows)
      if (!report.cmap.mappingsAgree) issues.push({ severity: 'error', code: 'cmap.mismatch', message: 'Unicode 플랫폼 cmap과 Windows cmap이 다른 글리프를 가리킵니다.' })
    }
    const mapping = windows ?? unicode ?? new Map<number, number>()
    report.cmap.hangulSyllables = countRange(mapping, HANGUL_FIRST, HANGUL_LAST)
    report.cmap.compatibilityJamo = countRange(mapping, JAMO_FIRST, JAMO_LAST)
    report.cmap.ascii = countRange(mapping, ASCII_FIRST, ASCII_LAST)
    report.cmap.space = mapping.has(0x20)
    if (report.cmap.hangulSyllables === 0) issues.push({ severity: 'warning', code: 'cmap.no-hangul', message: '한글 음절(가~힣)이 하나도 없습니다.' })
    else if (report.cmap.hangulSyllables < HANGUL_LAST - HANGUL_FIRST + 1) issues.push({ severity: 'info', code: 'cmap.partial-hangul', message: `한글 음절 ${report.cmap.hangulSyllables}/11172자.` })
    if (!report.cmap.space) issues.push({ severity: 'warning', code: 'cmap.no-space', message: 'U+0020 공백이 없습니다. 줄바꿈 · 띄어쓰기 처리가 어긋날 수 있습니다.' })
    if (report.cmap.ascii <= 1) issues.push({ severity: 'info', code: 'cmap.no-ascii', message: '영문 · 숫자(U+0021~U+007E)가 없습니다. 그 글자는 시스템 글꼴로 대체되지만 폰트 선택 자체는 막지 않습니다.' })
    if (numGlyphs !== undefined) {
      for (const [code, glyph] of mapping) {
        if (glyph >= numGlyphs) {
          issues.push({ severity: 'error', code: 'cmap.glyph-out-of-range', message: `U+${code.toString(16).toUpperCase()}이 없는 글리프 ${glyph}을 가리킵니다(글리프 수 ${numGlyphs}).` })
          break
        }
      }
    }
  }

  // name
  const name = table('name')
  let windowsNames: NameSet = {}
  if (name) {
    const records = readNameRecords(name, issues)
    windowsNames = nameSetOf(records, 3, 1, 0x0409)
    report.names.windows = windowsNames
    report.names.macintosh = nameSetOf(records, 1, 0, 0)
    for (const record of records) {
      if (record.platformId !== 3 || record.encodingId !== 1 || record.languageId === 0x0409) continue
      if (record.nameId !== NAME_IDS.family && record.nameId !== NAME_IDS.fullName) continue
      const key = `0x${record.languageId.toString(16).padStart(4, '0')}`
      const entry = report.names.localized[key] ?? {}
      if (record.nameId === NAME_IDS.family) entry.family = record.text
      else entry.fullName = record.text
      report.names.localized[key] = entry
    }
    for (const [key, nameId] of Object.entries(NAME_IDS)) {
      if (nameId === NAME_IDS.uniqueId || nameId === NAME_IDS.version) continue
      if (!windowsNames[key as keyof NameSet]) issues.push({ severity: 'error', code: 'name.missing', message: `name ID ${nameId}(${key})가 Windows(3,1,0x409)에 없습니다.` })
      if (!report.names.macintosh[key as keyof NameSet]) issues.push({ severity: 'warning', code: 'name.mac-missing', message: `name ID ${nameId}(${key})가 Macintosh(1,0,0)에 없습니다. Apple은 ID 6를 두 곳에서 찾습니다.` })
    }
    const { family, subfamily, fullName, postScriptName } = windowsNames
    if (family && subfamily && fullName) {
      const expected = subfamily === 'Regular' ? [family, `${family} ${subfamily}`] : [`${family} ${subfamily}`]
      if (!expected.includes(fullName)) issues.push({ severity: 'warning', code: 'name.full-inconsistent', message: `name ID 4 '${fullName}'가 ID 1 + ID 2('${family} ${subfamily}')와 다릅니다.` })
    }
    if (postScriptName !== undefined) {
      if (!isValidPostScriptName(postScriptName)) issues.push({ severity: 'error', code: 'name.postscript-invalid', message: `name ID 6 '${postScriptName}'에 공백 · 비ASCII · 금지 문자가 있거나 63자를 넘습니다.` })
      if (family && subfamily && postScriptName !== `${family.replace(/\s+/g, '')}-${subfamily.replace(/\s+/g, '')}`) {
        issues.push({ severity: 'info', code: 'name.postscript-derivation', message: `name ID 6 '${postScriptName}'가 ID 1 · 2에서 바로 나온 꼴이 아닙니다.` })
      }
    }
    if (report.names.macintosh.postScriptName && postScriptName && report.names.macintosh.postScriptName !== postScriptName) {
      issues.push({ severity: 'error', code: 'name.postscript-platform-mismatch', message: 'name ID 6가 Macintosh와 Windows에서 다릅니다.' })
    }
    for (const record of records) {
      if (record.platformId === 0 && record.languageId !== 0 && record.languageId < 0x8000) {
        issues.push({ severity: 'warning', code: 'name.unicode-language', message: `platform 0 name 레코드(ID ${record.nameId})의 languageID ${record.languageId}은 규격 밖입니다(0 또는 0x8000+ltag 인덱스).` })
        break
      }
    }
    for (const [key, entry] of Object.entries(report.names.localized)) {
      if (entry.family && !entry.fullName) issues.push({ severity: 'info', code: 'name.localized-partial', message: `${key} localized 이름에 ID 1만 있고 ID 4가 없습니다.` })
    }
  }

  // CFF
  const cff = table('CFF ')
  if (cff) {
    report.cff = readCff(cff, issues)
    if (report.cff) {
      const { fontName, fullName, familyName, weight, charStringCount } = report.cff
      if (windowsNames.postScriptName && fontName !== windowsNames.postScriptName) {
        issues.push({ severity: 'error', code: 'cff.fontname-mismatch', message: `CFF FontName '${fontName}'와 name ID 6 '${windowsNames.postScriptName}'가 다릅니다.` })
      }
      if (windowsNames.fullName && fullName !== undefined && fullName !== windowsNames.fullName) {
        issues.push({ severity: 'warning', code: 'cff.fullname-mismatch', message: `CFF FullName '${fullName}'와 name ID 4 '${windowsNames.fullName}'가 다릅니다.` })
      }
      if (windowsNames.family && familyName !== undefined && familyName !== windowsNames.family) {
        issues.push({ severity: 'warning', code: 'cff.familyname-mismatch', message: `CFF FamilyName '${familyName}'와 name ID 1 '${windowsNames.family}'가 다릅니다.` })
      }
      if (windowsNames.subfamily && weight !== undefined && !weight.startsWith('<') && weight !== windowsNames.subfamily) {
        issues.push({ severity: 'info', code: 'cff.weight-mismatch', message: `CFF Weight '${weight}'와 name ID 2 '${windowsNames.subfamily}'가 다릅니다.` })
      }
      if (numGlyphs !== undefined && charStringCount !== undefined && charStringCount !== numGlyphs) {
        issues.push({ severity: 'error', code: 'cff.glyph-count', message: `CFF CharStrings ${charStringCount}개와 maxp.numGlyphs ${numGlyphs}가 다릅니다.` })
      }
    }
  }

  // 메트릭
  const hhea = table('hhea')
  const os2 = table('OS/2')
  const post = table('post')
  const hmtx = table('hmtx')
  if (hhea && hhea.data.length >= 36) {
    const view = viewOf(hhea)
    report.metrics.hhea = { ascender: view.getInt16(4), descender: view.getInt16(6), lineGap: view.getInt16(8) }
    report.metrics.advanceWidthMax = view.getUint16(10)
    if (report.metrics.hhea.ascender <= 0) issues.push({ severity: 'error', code: 'hhea.ascender', message: `hhea.ascender ${report.metrics.hhea.ascender}는 양수여야 합니다.` })
    if (report.metrics.hhea.descender > 0) issues.push({ severity: 'error', code: 'hhea.descender', message: `hhea.descender ${report.metrics.hhea.descender}는 0 이하여야 합니다.` })
    const numberOfHMetrics = view.getUint16(34)
    if (numGlyphs !== undefined && hmtx) {
      if (numberOfHMetrics > numGlyphs) issues.push({ severity: 'error', code: 'hhea.numberOfHMetrics', message: `numberOfHMetrics ${numberOfHMetrics}가 글리프 수 ${numGlyphs}보다 큽니다.` })
      const expectedLength = numberOfHMetrics * 4 + (numGlyphs - numberOfHMetrics) * 2
      if (hmtx.data.length < expectedLength) issues.push({ severity: 'error', code: 'hmtx.length', message: `hmtx 길이 ${hmtx.data.length}가 필요한 ${expectedLength}보다 짧습니다.` })
      else {
        const hmtxView = viewOf(hmtx)
        let over = 0
        for (let index = 0; index < numberOfHMetrics; index += 1) {
          if (hmtxView.getUint16(index * 4) > (report.metrics.advanceWidthMax ?? 0)) over += 1
        }
        if (over > 0) issues.push({ severity: 'warning', code: 'hmtx.advance-over-max', message: `hhea.advanceWidthMax보다 넓은 글리프 ${over}개.` })
      }
    }
  }
  if (os2 && os2.data.length >= 78) {
    const view = viewOf(os2)
    const usWeightClass = view.getUint16(4)
    const fsSelection = view.getUint16(62)
    report.metrics.usWeightClass = usWeightClass
    report.metrics.fsSelection = fsSelection
    report.metrics.typo = { ascender: view.getInt16(68), descender: view.getInt16(70), lineGap: view.getInt16(72) }
    report.metrics.win = { ascent: view.getUint16(74), descent: view.getUint16(76) }
    if (usWeightClass < 1 || usWeightClass > 1000) issues.push({ severity: 'error', code: 'os2.usWeightClass', message: `usWeightClass ${usWeightClass}는 1~1000이어야 합니다.` })
    if (report.metrics.typo.ascender <= 0 || report.metrics.typo.descender > 0) issues.push({ severity: 'error', code: 'os2.typo', message: `sTypoAscender ${report.metrics.typo.ascender} / sTypoDescender ${report.metrics.typo.descender} 부호가 틀립니다.` })
    if (report.metrics.win.ascent === 0 || report.metrics.win.descent === 0) issues.push({ severity: 'error', code: 'os2.win-zero', message: 'usWinAscent · usWinDescent가 0입니다.' })
    const bbox = report.metrics.bbox
    if (bbox && (report.metrics.win.ascent < bbox.yMax || report.metrics.win.descent < -bbox.yMin)) {
      issues.push({ severity: 'warning', code: 'os2.win-clips', message: `usWinAscent/usWinDescent(${report.metrics.win.ascent}/${report.metrics.win.descent})가 잉크 범위(${bbox.yMax}/${bbox.yMin})보다 좁아 Windows에서 잘립니다.` })
    }
    const bold = Boolean(fsSelection & FS_SELECTION_BOLD)
    const italic = Boolean(fsSelection & FS_SELECTION_ITALIC)
    const regular = Boolean(fsSelection & FS_SELECTION_REGULAR)
    if (regular && (bold || italic)) issues.push({ severity: 'warning', code: 'os2.fsSelection-regular-and-style', message: 'fsSelection REGULAR 비트와 BOLD/ITALIC 비트가 같이 켜져 있습니다.' })
    if (!regular && !bold && !italic) issues.push({ severity: 'warning', code: 'os2.fsSelection-none', message: 'fsSelection에 REGULAR · BOLD · ITALIC 중 아무것도 없습니다.' })
    const macStyle = report.metrics.macStyle
    if (macStyle !== undefined) {
      if (Boolean(macStyle & 1) !== bold) issues.push({ severity: 'warning', code: 'style.bold-mismatch', message: `head.macStyle bold(${Boolean(macStyle & 1)})와 fsSelection bold(${bold})가 다릅니다.` })
      if (Boolean(macStyle & 2) !== italic) issues.push({ severity: 'warning', code: 'style.italic-mismatch', message: `head.macStyle italic(${Boolean(macStyle & 2)})와 fsSelection italic(${italic})가 다릅니다.` })
    }
    const subfamily = windowsNames.subfamily
    if (subfamily) {
      if (/bold/i.test(subfamily) !== bold) issues.push({ severity: 'warning', code: 'style.name-bold-mismatch', message: `name ID 2 '${subfamily}'와 fsSelection bold(${bold})가 다릅니다.` })
      if (/italic|oblique/i.test(subfamily) !== italic) issues.push({ severity: 'warning', code: 'style.name-italic-mismatch', message: `name ID 2 '${subfamily}'와 fsSelection italic(${italic})가 다릅니다.` })
    }
    if (post && post.data.length >= 8) {
      const italicAngle = viewOf(post).getInt32(4) / 65536
      report.metrics.italicAngle = italicAngle
      if ((italicAngle !== 0) !== italic) issues.push({ severity: 'warning', code: 'post.italicAngle', message: `post.italicAngle ${italicAngle}과 italic 비트(${italic})가 다릅니다.` })
    }
    const hheaMetrics = report.metrics.hhea
    if (hheaMetrics && report.metrics.unitsPerEm) {
      const lineHeight = hheaMetrics.ascender - hheaMetrics.descender + hheaMetrics.lineGap
      if (lineHeight < report.metrics.unitsPerEm) issues.push({ severity: 'warning', code: 'hhea.line-height', message: `hhea 줄 높이 ${lineHeight}가 unitsPerEm보다 작습니다.` })
    }
  }

  report.ok = !issues.some((issue) => issue.severity === 'error')
  return report
}

/** 사람이 읽는 한 줄 요약. 콘솔 · 토스트용. */
export function summarizeValidation(report: OpenTypeValidationReport): string {
  const count = (severity: ValidationSeverity) => report.issues.filter((issue) => issue.severity === severity).length
  return `오류 ${count('error')} · 경고 ${count('warning')} · 참고 ${count('info')} · 한글 ${report.cmap.hangulSyllables}자 · ASCII ${report.cmap.ascii}자`
}
