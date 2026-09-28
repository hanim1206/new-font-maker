/**
 * CFF CharStrings를 opentype.js 밖에서 바이트로 만든다.
 *
 * opentype.js는 글리프마다 연산자 객체 배열을 만들고, CharStrings INDEX를 숫자 배열로 이어 붙이고,
 * 크기를 재려고 같은 INDEX를 여러 번 다시 만든다. 한글 11,172자에 둥근 윤곽이면 파일 9MB에 메모리 3GB를 넘겨
 * 아이폰 Safari가 탭을 죽인다. 그래서:
 *
 * 1. `compactGlyphForCff` — 글리프 윤곽을 바로 Type 2 CharString 바이트로 굳히고, 글리프의 path는
 *    `getMetrics()`가 같은 값을 내는 두 점짜리 대역으로 바꾼다. hmtx · head · hhea는 opentype.js가 그대로 계산한다.
 * 2. `replaceCffCharStrings` — opentype.js가 대역으로 만든 파일에서 CFF의 CharStrings INDEX만 진짜 바이트로 갈아 끼운다.
 *
 * 바이트는 opentype.js `glyphToOps` + `encode.CHARSTRING`과 똑같이 나와야 한다(테스트가 대조한다).
 */
// @ts-expect-error opentype.js에 타입 정의 파일 없음
import * as opentype from 'opentype.js'
import { readSfnt, writeSfnt } from './openTypePackaging'

type PathCommand =
  | { type: 'M' | 'L'; x: number; y: number }
  | { type: 'Q'; x: number; y: number; x1: number; y1: number }
  | { type: 'C'; x: number; y: number; x1: number; y1: number; x2: number; y2: number }
  | { type: 'Z' }

interface CffGlyph {
  advanceWidth: number
  path: { commands: PathCommand[]; getBoundingBox(): { x1: number; y1: number; x2: number; y2: number } }
}

/** 늘어나는 바이트 버퍼. 숫자 배열 대신 쓴다. */
class ByteWriter {
  private bytes = new Uint8Array(256)
  length = 0

  push(value: number): void {
    if (this.length === this.bytes.length) {
      const next = new Uint8Array(this.bytes.length * 2)
      next.set(this.bytes)
      this.bytes = next
    }
    this.bytes[this.length++] = value
  }

  /** opentype.js `encode.NUMBER`와 같은 규칙. */
  number(v: number): void {
    if (v >= -107 && v <= 107) {
      this.push(v + 139)
    } else if (v >= 108 && v <= 1131) {
      const w = v - 108
      this.push((w >> 8) + 247); this.push(w & 255)
    } else if (v >= -1131 && v <= -108) {
      const w = -v - 108
      this.push((w >> 8) + 251); this.push(w & 255)
    } else if (v >= -32768 && v <= 32767) {
      this.push(28); this.push((v >> 8) & 255); this.push(v & 255)
    } else {
      this.push(29); this.push((v >> 24) & 255); this.push((v >> 16) & 255); this.push((v >> 8) & 255); this.push(v & 255)
    }
  }

  result(): Uint8Array {
    return this.bytes.slice(0, this.length)
  }
}

const RMOVETO = 21
const RLINETO = 5
const RRCURVETO = 8
const ENDCHAR = 14

/** opentype.js `glyphToOps`(CFF 1)를 그대로 따라 CharString 바이트를 만든다. */
export function encodeGlyphCharString(glyph: CffGlyph): Uint8Array {
  const out = new ByteWriter()
  out.number(glyph.advanceWidth)
  let x = 0
  let y = 0
  for (const original of glyph.path.commands) {
    let cmd = original
    if (cmd.type === 'Q') {
      const _13 = 1 / 3
      const _23 = 2 / 3
      cmd = {
        type: 'C', x: cmd.x, y: cmd.y,
        x1: Math.round(_13 * x + _23 * cmd.x1), y1: Math.round(_13 * y + _23 * cmd.y1),
        x2: Math.round(_13 * cmd.x + _23 * cmd.x1), y2: Math.round(_13 * cmd.y + _23 * cmd.y1),
      }
    }
    if (cmd.type === 'M' || cmd.type === 'L') {
      out.number(Math.round(cmd.x - x))
      out.number(Math.round(cmd.y - y))
      out.push(cmd.type === 'M' ? RMOVETO : RLINETO)
      x = Math.round(cmd.x)
      y = Math.round(cmd.y)
    } else if (cmd.type === 'C') {
      out.number(Math.round(cmd.x1 - x))
      out.number(Math.round(cmd.y1 - y))
      out.number(Math.round(cmd.x2 - cmd.x1))
      out.number(Math.round(cmd.y2 - cmd.y1))
      out.number(Math.round(cmd.x - cmd.x2))
      out.number(Math.round(cmd.y - cmd.y2))
      out.push(RRCURVETO)
      x = Math.round(cmd.x)
      y = Math.round(cmd.y)
    }
  }
  out.push(ENDCHAR)
  return out.result()
}

export interface CompactGlyph {
  /** 진짜 윤곽의 CharString 바이트. */
  charString: Uint8Array
  /** 진짜 윤곽의 잉크 상자(곡선 극값 기준). 윈도우 클리핑 메트릭이 쓴다. 빈 글리프면 null. */
  inkBox: { y1: number; y2: number } | null
}

/**
 * 글리프 윤곽을 CharString으로 굳히고 path를 대역으로 바꾼다.
 * 대역은 opentype.js `getMetrics()`(제어점까지 포함한 최소 · 최대)가 원래와 같은 값을 내는 두 점이다.
 */
export function compactGlyphForCff(glyph: CffGlyph): CompactGlyph {
  const commands = glyph.path.commands
  const charString = encodeGlyphCharString(glyph)
  if (commands.length === 0) return { charString, inkBox: null }
  const box = glyph.path.getBoundingBox()
  let xMin = Infinity
  let yMin = Infinity
  let xMax = -Infinity
  let yMax = -Infinity
  const take = (px: number, py: number) => {
    if (px < xMin) xMin = px
    if (px > xMax) xMax = px
    if (py < yMin) yMin = py
    if (py > yMax) yMax = py
  }
  for (const cmd of commands) {
    if (cmd.type === 'Z') continue
    take(cmd.x, cmd.y)
    if (cmd.type === 'Q' || cmd.type === 'C') take(cmd.x1, cmd.y1)
    if (cmd.type === 'C') take(cmd.x2, cmd.y2)
  }
  const stub = new opentype.Path()
  if (Number.isFinite(xMin)) {
    stub.moveTo(xMin, yMin)
    stub.lineTo(xMax, yMax)
  }
  glyph.path = stub
  return { charString, inkBox: { y1: box.y1, y2: box.y2 } }
}

// ===== CFF 표 다시 쓰기 =====

interface CffIndex {
  count: number
  /** INDEX 끝(다음 구조의 시작) 오프셋. */
  end: number
  /** 각 항목의 [시작, 끝). */
  items: Array<[number, number]>
}

function readOffset(bytes: Uint8Array, at: number, size: number): number {
  let value = 0
  for (let i = 0; i < size; i += 1) value = value * 256 + bytes[at + i]
  return value
}

function readIndex(bytes: Uint8Array, at: number, withItems = true): CffIndex {
  const count = (bytes[at] << 8) | bytes[at + 1]
  if (count === 0) return { count, end: at + 2, items: [] }
  const offSize = bytes[at + 2]
  const offsetsAt = at + 3
  const dataBase = offsetsAt + (count + 1) * offSize - 1
  const items: Array<[number, number]> = []
  if (withItems) {
    for (let i = 0; i < count; i += 1) {
      items.push([dataBase + readOffset(bytes, offsetsAt + i * offSize, offSize), dataBase + readOffset(bytes, offsetsAt + (i + 1) * offSize, offSize)])
    }
  }
  return { count, end: dataBase + readOffset(bytes, offsetsAt + count * offSize, offSize), items }
}

function writeIndex(items: readonly Uint8Array[]): Uint8Array {
  const dataLength = items.reduce((sum, item) => sum + item.length, 0)
  const lastOffset = dataLength + 1
  const offSize = lastOffset < 0x100 ? 1 : lastOffset < 0x10000 ? 2 : lastOffset < 0x1000000 ? 3 : 4
  const out = new Uint8Array(3 + (items.length + 1) * offSize + dataLength)
  out[0] = (items.length >> 8) & 255
  out[1] = items.length & 255
  out[2] = offSize
  const writeOffset = (index: number, value: number) => {
    const at = 3 + index * offSize
    for (let i = offSize - 1; i >= 0; i -= 1) { out[at + i] = value & 255; value = Math.floor(value / 256) }
  }
  let offset = 1
  let cursor = 3 + (items.length + 1) * offSize
  items.forEach((item, index) => {
    writeOffset(index, offset)
    out.set(item, cursor)
    cursor += item.length
    offset += item.length
  })
  writeOffset(items.length, offset)
  return out
}

interface DictOperand { value: number; at: number; length: number }

/** Top DICT에서 연산자마다 피연산자(값과 바이트 자리)를 읽는다. 실수(30)는 값 없이 건너뛴다. */
function readDict(bytes: Uint8Array, start: number, end: number): Map<number, DictOperand[]> {
  const entries = new Map<number, DictOperand[]>()
  let operands: DictOperand[] = []
  let at = start
  while (at < end) {
    const b0 = bytes[at]
    if (b0 <= 21) {
      const op = b0 === 12 ? 1200 + bytes[at + 1] : b0
      at += b0 === 12 ? 2 : 1
      entries.set(op, operands)
      operands = []
    } else if (b0 === 28) {
      operands.push({ value: (((bytes[at + 1] << 8) | bytes[at + 2]) << 16) >> 16, at, length: 3 }); at += 3
    } else if (b0 === 29) {
      operands.push({ value: (bytes[at + 1] << 24) | (bytes[at + 2] << 16) | (bytes[at + 3] << 8) | bytes[at + 4], at, length: 5 }); at += 5
    } else if (b0 === 30) {
      const from = at
      at += 1
      while (at < end) { const nibbles = bytes[at++]; if ((nibbles & 0x0f) === 0x0f || (nibbles >> 4) === 0x0f) break }
      operands.push({ value: NaN, at: from, length: at - from })
    } else if (b0 >= 32 && b0 <= 246) {
      operands.push({ value: b0 - 139, at, length: 1 }); at += 1
    } else if (b0 >= 247 && b0 <= 250) {
      operands.push({ value: (b0 - 247) * 256 + bytes[at + 1] + 108, at, length: 2 }); at += 2
    } else if (b0 >= 251 && b0 <= 254) {
      operands.push({ value: -(b0 - 251) * 256 - bytes[at + 1] - 108, at, length: 2 }); at += 2
    } else {
      throw new Error(`CFF DICT에 모르는 바이트 ${b0}`)
    }
  }
  return entries
}

const OP_CHARSTRINGS = 17
const OP_PRIVATE = 18

/**
 * opentype.js가 만든 CFF 표에서 CharStrings INDEX를 `charStrings`로 바꾼다.
 * opentype.js 배치(… charset · CharStrings · Private DICT로 끝)를 전제로 하고, 아니면 멈춘다.
 * Private 오프셋은 5바이트 정수(29)로 쓰여 있어 자리 길이가 바뀌지 않는다.
 */
export function replaceCffTableCharStrings(cff: Uint8Array, charStrings: readonly Uint8Array[]): Uint8Array {
  const headerSize = cff[2]
  const nameIndex = readIndex(cff, headerSize, false)
  const topDictIndex = readIndex(cff, nameIndex.end)
  if (topDictIndex.count !== 1) throw new Error('CFF Top DICT가 하나여야 합니다.')
  const [dictStart, dictEnd] = topDictIndex.items[0]
  const dict = readDict(cff, dictStart, dictEnd)
  const charStringsOffset = dict.get(OP_CHARSTRINGS)?.[0]?.value
  const privateOperands = dict.get(OP_PRIVATE)
  if (charStringsOffset === undefined || !privateOperands || privateOperands.length !== 2) throw new Error('CFF Top DICT에 CharStrings · Private 자리가 없습니다.')
  const [privateSize, privateOffset] = privateOperands
  if (privateOffset.length !== 5) throw new Error('CFF Private 오프셋이 5바이트 정수가 아닙니다.')

  const oldCharStrings = readIndex(cff, charStringsOffset, false)
  if (oldCharStrings.count !== charStrings.length) throw new Error(`CharStrings 수가 다릅니다: 표 ${oldCharStrings.count} · 새 ${charStrings.length}`)
  if (oldCharStrings.end !== privateOffset.value || privateOffset.value + privateSize.value !== cff.length) {
    throw new Error('CFF 배치가 예상(CharStrings 뒤에 Private DICT로 끝)과 다릅니다.')
  }

  const index = writeIndex(charStrings)
  const privateDict = cff.subarray(privateOffset.value, privateOffset.value + privateSize.value)
  const out = new Uint8Array(charStringsOffset + index.length + privateDict.length)
  out.set(cff.subarray(0, charStringsOffset), 0)
  out.set(index, charStringsOffset)
  out.set(privateDict, charStringsOffset + index.length)
  const newPrivateOffset = charStringsOffset + index.length
  const at = privateOffset.at
  out[at] = 29
  out[at + 1] = (newPrivateOffset >> 24) & 255
  out[at + 2] = (newPrivateOffset >> 16) & 255
  out[at + 3] = (newPrivateOffset >> 8) & 255
  out[at + 4] = newPrivateOffset & 255
  return out
}

/** sfnt 파일의 `CFF ` 표를 진짜 CharStrings로 바꿔 다시 묶는다. 체크섬도 다시 맞춘다. */
export function replaceCffCharStrings(buffer: ArrayBuffer, charStrings: readonly Uint8Array[]): ArrayBuffer {
  const file = readSfnt(buffer)
  const cff = file.tables.find((table) => table.tag === 'CFF ')
  if (!cff) throw new Error('CFF 표가 없습니다.')
  cff.data = replaceCffTableCharStrings(cff.data, charStrings)
  return writeSfnt(file)
}
