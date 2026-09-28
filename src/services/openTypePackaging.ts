/**
 * opentype.js가 만든 OTF를 iOS(CoreText) · 일반 앱이 안정적으로 읽는 꼴로 다시 묶는 층.
 * 글리프 · CFF · 메트릭 표는 바이트 그대로 두고 `cmap` · `name` · `head.macStyle`만 손댄다.
 *
 * - cmap: opentype.js는 (3,1) format 4 하나만 쓴다. 같은 서브테이블 바이트를 가리키는 (0,3) 레코드를 더해
 *   Unicode 플랫폼 cmap을 만든다. 두 레코드가 같은 오프셋을 가리키므로 매핑이 다를 수 없다.
 *   (BMP 밖 글자가 있어 (3,10) format 12가 있으면 같은 식으로 (0,4)를 더한다.)
 * - name: opentype.js는 platform 0 레코드에 ltag 인덱스를 languageID로 그대로 써서(ko → 1) Apple 규격에 어긋난다.
 *   (1,0,0) · (3,1,0x409) 영문과 (3,1,0x412) 한국어만으로 새로 쓰고 `ltag`는 버린다.
 */
import { setHeadFontRevision, tableChecksum } from './fontRevision'

export interface SfntTable {
  tag: string
  data: Uint8Array
}

export interface SfntFile {
  sfntVersion: number
  tables: SfntTable[]
}

export interface CmapEncodingRecord {
  platformId: number
  encodingId: number
  /** cmap 표 시작 기준 서브테이블 오프셋. */
  offset: number
}

export interface NameRecordSpec {
  platformId: number
  encodingId: number
  languageId: number
  nameId: number
  text: string
}

export interface LocalizedNaming {
  /** Windows language ID. 한국어 0x0412. */
  windowsLanguageId: number
  familyName: string
  fullName: string
}

/** name 표에 쓸 값. ID 1 · 2 · 4 · 6은 서로 맞아야 한다(`fontIdentity.createFontIdentity`가 그렇게 만든다). */
export interface OpenTypeNaming {
  copyright?: string
  familyName: string
  subfamilyName: string
  uniqueId: string
  fullName: string
  version: string
  postScriptName: string
  localized?: readonly LocalizedNaming[]
}

export interface PackagingOptions {
  naming: OpenTypeNaming
  /** name ID 2와 맞출 head.macStyle 비트. 없으면 그대로 둔다. */
  macStyle?: { bold: boolean; italic: boolean }
  /** `fontRevision.ts`의 추출 버전. head.fontRevision에 쓴다. */
  revision?: number
}

export const WINDOWS_LANGUAGE_ENGLISH_US = 0x0409
export const WINDOWS_LANGUAGE_KOREAN = 0x0412
const SFNT_HEADER_SIZE = 12
const SFNT_RECORD_SIZE = 16
const CHECKSUM_MAGIC = 0xb1b0afba
const HEAD_MAC_STYLE_OFFSET = 44
const HHEA_ADVANCE_WIDTH_MAX_OFFSET = 10
const HHEA_NUMBER_OF_H_METRICS_OFFSET = 34

function readTag(view: DataView, offset: number): string {
  return String.fromCharCode(view.getUint8(offset), view.getUint8(offset + 1), view.getUint8(offset + 2), view.getUint8(offset + 3))
}

function writeTag(view: DataView, offset: number, tag: string): void {
  const padded = tag.padEnd(4, ' ').slice(0, 4)
  for (let index = 0; index < 4; index += 1) view.setUint8(offset + index, padded.charCodeAt(index))
}

function padToFour(length: number): number {
  return (length + 3) & ~3
}

// ===== sfnt 컨테이너 =====

/** 표 목록을 복사해 읽는다. 원본 버퍼는 건드리지 않는다. */
export function readSfnt(buffer: ArrayBuffer): SfntFile {
  if (buffer.byteLength < SFNT_HEADER_SIZE) throw new Error('sfnt 헤더가 너무 짧습니다.')
  const view = new DataView(buffer)
  const sfntVersion = view.getUint32(0)
  const numTables = view.getUint16(4)
  if (buffer.byteLength < SFNT_HEADER_SIZE + numTables * SFNT_RECORD_SIZE) throw new Error('sfnt 표 목록이 파일 밖을 가리킵니다.')
  const tables: SfntTable[] = []
  for (let index = 0; index < numTables; index += 1) {
    const at = SFNT_HEADER_SIZE + index * SFNT_RECORD_SIZE
    const tag = readTag(view, at)
    const offset = view.getUint32(at + 8)
    const length = view.getUint32(at + 12)
    if (offset + length > buffer.byteLength) throw new Error(`${tag} 표가 파일 밖을 가리킵니다.`)
    tables.push({ tag, data: new Uint8Array(buffer, offset, length).slice() })
  }
  return { sfntVersion, tables }
}

/** 표를 태그 순으로 4바이트 정렬해 묶고 표 체크섬과 head.checkSumAdjustment를 다시 맞춘다. */
export function writeSfnt(file: SfntFile): ArrayBuffer {
  const tables = [...file.tables].sort((a, b) => (a.tag < b.tag ? -1 : a.tag > b.tag ? 1 : 0))
  const numTables = tables.length
  const entrySelector = numTables > 0 ? Math.floor(Math.log2(numTables)) : 0
  const searchRange = 2 ** entrySelector * SFNT_RECORD_SIZE
  const rangeShift = numTables * SFNT_RECORD_SIZE - searchRange

  let cursor = SFNT_HEADER_SIZE + numTables * SFNT_RECORD_SIZE
  const placements = tables.map((table) => {
    const at = cursor
    cursor += padToFour(table.data.length)
    return at
  })
  const buffer = new ArrayBuffer(cursor)
  const view = new DataView(buffer)
  const bytes = new Uint8Array(buffer)

  view.setUint32(0, file.sfntVersion)
  view.setUint16(4, numTables)
  view.setUint16(6, searchRange)
  view.setUint16(8, entrySelector)
  view.setUint16(10, rangeShift)

  let headOffset = -1
  tables.forEach((table, index) => {
    const at = placements[index]
    bytes.set(table.data, at)
    if (table.tag === 'head') {
      headOffset = at
      view.setUint32(at + 8, 0)
    }
    const record = SFNT_HEADER_SIZE + index * SFNT_RECORD_SIZE
    writeTag(view, record, table.tag)
    view.setUint32(record + 4, tableChecksum(view, at, table.data.length))
    view.setUint32(record + 8, at)
    view.setUint32(record + 12, table.data.length)
  })

  if (headOffset >= 0) {
    const fileSum = tableChecksum(view, 0, buffer.byteLength)
    view.setUint32(headOffset + 8, (CHECKSUM_MAGIC - fileSum) >>> 0)
  }
  return buffer
}

// ===== cmap =====

/** cmap 서브테이블 길이. format마다 길이 필드 자리가 다르다. */
export function cmapSubtableLength(view: DataView, offset: number): number {
  const format = view.getUint16(offset)
  switch (format) {
    case 0:
    case 2:
    case 4:
    case 6:
      return view.getUint16(offset + 2)
    case 8:
    case 10:
    case 12:
    case 13:
      return view.getUint32(offset + 4)
    case 14:
      return view.getUint32(offset + 2)
    default:
      throw new Error(`알 수 없는 cmap 서브테이블 format ${format}`)
  }
}

export function readCmapRecords(cmap: Uint8Array): CmapEncodingRecord[] {
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength)
  const numTables = view.getUint16(2)
  const records: CmapEncodingRecord[] = []
  for (let index = 0; index < numTables; index += 1) {
    const at = 4 + index * 8
    records.push({ platformId: view.getUint16(at), encodingId: view.getUint16(at + 2), offset: view.getUint32(at + 4) })
  }
  return records
}

/**
 * Windows Unicode 서브테이블((3,1) BMP · (3,10) full)과 같은 바이트를 가리키는 Unicode 플랫폼 레코드((0,3) · (0,4))를 더한다.
 * 이미 있으면 그대로 돌려준다. 매핑 출처는 하나(같은 서브테이블)라 두 플랫폼이 다른 글리프를 낼 수 없다.
 */
export function withUnicodePlatformCmap(cmap: Uint8Array): Uint8Array {
  const view = new DataView(cmap.buffer, cmap.byteOffset, cmap.byteLength)
  const records = readCmapRecords(cmap)
  const has = (platformId: number, encodingId: number) => records.find((record) => record.platformId === platformId && record.encodingId === encodingId)
  const windowsBmp = has(3, 1)
  const windowsFull = has(3, 10)
  if (!windowsBmp && !windowsFull) throw new Error('Windows Unicode cmap이 없어 Unicode 플랫폼 cmap을 만들 수 없습니다.')

  const additions: CmapEncodingRecord[] = []
  if (windowsBmp && !has(0, 3)) additions.push({ platformId: 0, encodingId: 3, offset: windowsBmp.offset })
  if (windowsFull && !has(0, 4)) additions.push({ platformId: 0, encodingId: 4, offset: windowsFull.offset })
  if (additions.length === 0) return cmap

  const all = [...records, ...additions].sort((a, b) => a.platformId - b.platformId || a.encodingId - b.encodingId)
  const subtableOffsets = [...new Set(all.map((record) => record.offset))].sort((a, b) => a - b)
  const chunks = subtableOffsets.map((offset) => cmap.subarray(offset, offset + cmapSubtableLength(view, offset)))

  const headerSize = 4 + all.length * 8
  const relocated = new Map<number, number>()
  let cursor = headerSize
  subtableOffsets.forEach((offset, index) => {
    relocated.set(offset, cursor)
    cursor += chunks[index].length
  })

  const out = new Uint8Array(cursor)
  const outView = new DataView(out.buffer)
  outView.setUint16(0, view.getUint16(0))
  outView.setUint16(2, all.length)
  all.forEach((record, index) => {
    const at = 4 + index * 8
    outView.setUint16(at, record.platformId)
    outView.setUint16(at + 2, record.encodingId)
    outView.setUint32(at + 4, relocated.get(record.offset) ?? 0)
  })
  subtableOffsets.forEach((offset, index) => out.set(chunks[index], relocated.get(offset)))
  return out
}

// ===== name =====

function isAscii(text: string): boolean {
  for (let index = 0; index < text.length; index += 1) if (text.charCodeAt(index) > 0x7f) return false
  return true
}

function encodeUtf16Be(text: string): Uint8Array {
  const out = new Uint8Array(text.length * 2)
  for (let index = 0; index < text.length; index += 1) {
    const unit = text.charCodeAt(index)
    out[index * 2] = unit >> 8
    out[index * 2 + 1] = unit & 0xff
  }
  return out
}

function encodeNameString(record: NameRecordSpec): Uint8Array {
  if (record.platformId === 1) {
    // Macintosh Roman. 우리는 ASCII만 넣는다 — 한글은 Windows 0x412 레코드로 간다.
    if (!isAscii(record.text)) throw new Error(`Macintosh name 레코드(ID ${record.nameId})에는 ASCII만 넣을 수 있습니다.`)
    return Uint8Array.from(record.text, (char) => char.charCodeAt(0))
  }
  return encodeUtf16Be(record.text)
}

/** name 표(format 0). 같은 바이트열은 문자열 풀에서 한 번만 쓴다. */
export function buildNameTable(records: readonly NameRecordSpec[]): Uint8Array {
  const sorted = [...records].sort((a, b) => a.platformId - b.platformId || a.encodingId - b.encodingId || a.languageId - b.languageId || a.nameId - b.nameId)
  const pool: number[] = []
  const poolIndex = new Map<string, number>()
  const encoded = sorted.map((record) => {
    const bytes = encodeNameString(record)
    const key = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('')
    let offset = poolIndex.get(key)
    if (offset === undefined) {
      offset = pool.length
      pool.push(...bytes)
      poolIndex.set(key, offset)
    }
    return { record, length: bytes.length, offset }
  })

  const headerSize = 6 + sorted.length * 12
  const out = new Uint8Array(headerSize + pool.length)
  const view = new DataView(out.buffer)
  view.setUint16(0, 0)
  view.setUint16(2, sorted.length)
  view.setUint16(4, headerSize)
  encoded.forEach(({ record, length, offset }, index) => {
    const at = 6 + index * 12
    view.setUint16(at, record.platformId)
    view.setUint16(at + 2, record.encodingId)
    view.setUint16(at + 4, record.languageId)
    view.setUint16(at + 6, record.nameId)
    view.setUint16(at + 8, length)
    view.setUint16(at + 10, offset)
  })
  out.set(pool, headerSize)
  return out
}

/**
 * 이름 값 → 레코드. 영문은 (1,0,0)과 (3,1,0x409) 둘 다(Apple은 ID 6를 두 곳에서 찾는다),
 * 한국어는 (3,1,0x412)의 ID 1 · 4. ID 16 · 17은 ID 1 · 2와 같으니 넣지 않는다.
 */
export function nameRecordsOf(naming: OpenTypeNaming): NameRecordSpec[] {
  const english: Array<[number, string | undefined]> = [
    [0, naming.copyright],
    [1, naming.familyName],
    [2, naming.subfamilyName],
    [3, naming.uniqueId],
    [4, naming.fullName],
    [5, naming.version],
    [6, naming.postScriptName],
  ]
  const records: NameRecordSpec[] = []
  for (const [nameId, text] of english) {
    if (!text) continue
    if (isAscii(text)) records.push({ platformId: 1, encodingId: 0, languageId: 0, nameId, text })
    records.push({ platformId: 3, encodingId: 1, languageId: WINDOWS_LANGUAGE_ENGLISH_US, nameId, text })
  }
  for (const localized of naming.localized ?? []) {
    records.push({ platformId: 3, encodingId: 1, languageId: localized.windowsLanguageId, nameId: 1, text: localized.familyName })
    records.push({ platformId: 3, encodingId: 1, languageId: localized.windowsLanguageId, nameId: 4, text: localized.fullName })
  }
  return records
}

// ===== hhea =====

/**
 * opentype.js는 advanceWidthMax를 .notdef를 빼고 재서 .notdef(1000)가 한글(920)보다 넓으면 값이 작다.
 * hmtx 전체에서 다시 잰다. 글리프 폭 자체는 바꾸지 않는다.
 */
export function withAdvanceWidthMaxFromHmtx(hhea: Uint8Array, hmtx: Uint8Array): Uint8Array {
  const hheaView = new DataView(hhea.buffer, hhea.byteOffset, hhea.byteLength)
  const hmtxView = new DataView(hmtx.buffer, hmtx.byteOffset, hmtx.byteLength)
  const numberOfHMetrics = hheaView.getUint16(HHEA_NUMBER_OF_H_METRICS_OFFSET)
  let max = 0
  for (let index = 0; index < numberOfHMetrics && index * 4 + 2 <= hmtx.byteLength; index += 1) {
    max = Math.max(max, hmtxView.getUint16(index * 4))
  }
  if (max === hheaView.getUint16(HHEA_ADVANCE_WIDTH_MAX_OFFSET)) return hhea
  const out = hhea.slice()
  new DataView(out.buffer).setUint16(HHEA_ADVANCE_WIDTH_MAX_OFFSET, max)
  return out
}

// ===== 조립 =====

/**
 * opentype.js 출력 → iOS 친화 OTF. cmap에 Unicode 플랫폼 레코드를 더하고 name을 다시 쓰고 ltag를 버린다.
 * hhea.advanceWidthMax는 hmtx에서 다시 잰다. 나머지 표(CFF · hmtx · OS/2 …)는 바이트 그대로다.
 */
export function finalizeOpenTypePackaging(buffer: ArrayBuffer, options: PackagingOptions): ArrayBuffer {
  const file = readSfnt(buffer)
  const tables = file.tables.filter((table) => table.tag !== 'ltag')
  const cmap = tables.find((table) => table.tag === 'cmap')
  const name = tables.find((table) => table.tag === 'name')
  const head = tables.find((table) => table.tag === 'head')
  const hhea = tables.find((table) => table.tag === 'hhea')
  const hmtx = tables.find((table) => table.tag === 'hmtx')
  if (!cmap || !name || !head) throw new Error('cmap · name · head 표가 있어야 다시 묶을 수 있습니다.')
  if (hhea && hmtx) hhea.data = withAdvanceWidthMaxFromHmtx(hhea.data, hmtx.data)

  cmap.data = withUnicodePlatformCmap(cmap.data)
  name.data = buildNameTable(nameRecordsOf(options.naming))
  if (options.macStyle) {
    const view = new DataView(head.data.buffer, head.data.byteOffset, head.data.byteLength)
    const current = view.getUint16(HEAD_MAC_STYLE_OFFSET) & ~0b11
    view.setUint16(HEAD_MAC_STYLE_OFFSET, current | (options.macStyle.bold ? 1 : 0) | (options.macStyle.italic ? 2 : 0))
  }

  const out = writeSfnt({ sfntVersion: file.sfntVersion, tables })
  setHeadFontRevision(out, options.revision ?? 0)
  return out
}
