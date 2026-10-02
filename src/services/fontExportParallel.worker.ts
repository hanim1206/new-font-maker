/**
 * 추출 병렬 Worker — 맡은 글자들을 수집 → 윤곽 → CharString 운반형까지 만든다(플랜 2026-10-02 추출 워커 병렬).
 *
 * 메인이 보낸 폰트 데이터 스냅숏으로 이 Worker 안의 스토어를 채우므로,
 * 직렬 추출과 같은 코드(`portableHangulGlyphOf`)가 같은 입력으로 돌아 바이트가 같다.
 */

// 스토어가 모듈 로드 때 localStorage를 만진다. import는 호이스팅되므로 대역 설치가 반드시 첫 줄이어야 한다.
import './workerLocalStorageShim'
import { applyFontData } from './fontDataBridge'
import { packUint8Arrays } from './cffSubroutinize'
import { portableHangulGlyphOf } from './fontGenerator'
import { placementResolverOf } from '../../src-next/fontExportStore'
import { useLayoutDeltaStore } from '../../src-next/layoutDeltaStore'
import type { LayoutDeltaSnapshot } from '../../src-next/layoutDeltaStore'
import type { NotoPresetModelBundle } from '../../src-next/notoPresetGlyphs'

export interface ParallelWorkerRequest {
  fontData: unknown
  deltaSnapshot: LayoutDeltaSnapshot
  bundle: NotoPresetModelBundle
  chars: string[]
  simplifyEpsilon?: number
}

/** 운반형에서 CharString만 뺀 메타. null = 그 글자는 글리프 없음(비한글 등). */
export interface PortableMeta {
  u: number
  c: string
  a: number
  ib: { y1: number; y2: number } | null
  st: { x1: number; y1: number; x2: number; y2: number } | null
  sk: boolean
  sf: boolean
}

export type ParallelWorkerReply =
  | { type: 'progress'; done: number }
  | { type: 'done'; metas: Array<PortableMeta | null>; bytes: Uint8Array; offsets: Uint32Array }
  | { type: 'error'; message: string }

const post = (reply: ParallelWorkerReply, transfer?: Transferable[]) =>
  (self as unknown as { postMessage: (message: unknown, transfer?: Transferable[]) => void }).postMessage(reply, transfer)

self.onmessage = (event: MessageEvent<ParallelWorkerRequest>) => {
  try {
    const { fontData, deltaSnapshot, bundle, chars, simplifyEpsilon } = event.data
    const applied = applyFontData(fontData)
    if (!applied.ok) throw new Error(`폰트 데이터 적용 실패: ${applied.error.message}`)
    useLayoutDeltaStore.getState().restore({ rules: deltaSnapshot.rules ?? {} })
    const placementOf = placementResolverOf(bundle, deltaSnapshot)

    const metas: Array<PortableMeta | null> = []
    const charStrings: Uint8Array[] = []
    let done = 0
    for (const char of chars) {
      const portable = portableHangulGlyphOf(char, placementOf, simplifyEpsilon)
      if (portable) {
        metas.push({ u: portable.unicode, c: portable.char, a: portable.advanceWidth, ib: portable.inkBox, st: portable.stub, sk: portable.skipped, sf: portable.schemaFallback })
        charStrings.push(portable.charString)
      } else {
        metas.push(null)
      }
      done += 1
      if (done % 100 === 0) post({ type: 'progress', done })
    }
    const packed = packUint8Arrays(charStrings)
    post({ type: 'done', metas, bytes: packed.bytes, offsets: packed.offsets }, [packed.bytes.buffer, packed.offsets.buffer])
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) })
  }
}
