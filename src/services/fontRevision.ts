/**
 * 추출 버전. 같은 폰트를 다시 받을 때마다 올려, 같은 이름으로 재설치해도 OS가 새 파일로 알아보게 한다.
 * 추출 횟수 n → `1.00n`(1000번째부터 `2.000`). name 표의 버전 · 고유 ID와 `head.fontRevision`에 같은 값을 쓴다.
 */

export function fontVersionText(revision: number): string {
  const safe = Number.isFinite(revision) && revision > 0 ? Math.floor(revision) : 0
  return (1 + safe / 1000).toFixed(3)
}

const HEAD_TAG = 0x68656164 // 'head'
const CHECKSUM_MAGIC = 0xb1b0afba

function tableChecksum(view: DataView, offset: number, length: number): number {
  let sum = 0
  const end = offset + length
  for (let at = offset; at < end; at += 4) {
    // 끝의 4바이트 미만 조각은 0으로 채운 것처럼 더한다.
    const word = at + 4 <= view.byteLength
      ? view.getUint32(at)
      : [0, 1, 2, 3].reduce((acc, index) => (acc << 8) | (at + index < view.byteLength ? view.getUint8(at + index) : 0), 0) >>> 0
    sum = (sum + word) >>> 0
  }
  return sum
}

/**
 * opentype.js는 `head.fontRevision`을 1.0으로 고정해 쓴다. 만든 뒤 그 자리만 고치고 체크섬을 다시 맞춘다.
 * sfnt 표 목록에서 `head`를 찾지 못하면 그대로 둔다.
 */
export function setHeadFontRevision(buffer: ArrayBuffer, revision: number): void {
  const view = new DataView(buffer)
  const numTables = view.getUint16(4)
  let record = -1
  for (let index = 0; index < numTables; index += 1) {
    const at = 12 + index * 16
    if (view.getUint32(at) === HEAD_TAG) { record = at; break }
  }
  if (record < 0) return
  const offset = view.getUint32(record + 8)
  const length = view.getUint32(record + 12)

  view.setInt32(offset + 4, Math.round(Number(fontVersionText(revision)) * 65536))
  view.setUint32(offset + 8, 0) // checkSumAdjustment는 0으로 두고 표 체크섬을 잰다.
  view.setUint32(record + 4, tableChecksum(view, offset, length))
  const fileSum = tableChecksum(view, 0, buffer.byteLength)
  view.setUint32(offset + 8, (CHECKSUM_MAGIC - fileSum) >>> 0)
}
