import { packUint8Arrays, subroutinizeCharStrings, unpackUint8Arrays, type PackedUint8Arrays, type SubroutinizedCharStrings } from './cffSubroutinize'

type WorkerReply =
  | { ok: true; charStrings: PackedUint8Arrays; globalSubrs: PackedUint8Arrays }
  | { ok: false; error: string }

/** Worker를 못 띄우거나 Worker가 죽으면 null. 계산이 실패하면 reject. */
function runInWorker(charStrings: readonly Uint8Array[]): Promise<SubroutinizedCharStrings | null> {
  return new Promise((resolve, reject) => {
    let worker: Worker
    try {
      worker = new Worker(new URL('./cffSubroutinize.worker.ts', import.meta.url), { type: 'module' })
    } catch {
      resolve(null)
      return
    }
    worker.onmessage = (event: MessageEvent<WorkerReply>) => {
      worker.terminate()
      const reply = event.data
      if (reply.ok) resolve({ charStrings: unpackUint8Arrays(reply.charStrings), globalSubrs: unpackUint8Arrays(reply.globalSubrs) })
      else reject(new Error(reply.error))
    }
    worker.onerror = (event) => {
      worker.terminate()
      console.warn('CFF 서브루틴 Worker 실패, 메인 스레드에서 돌림:', event.message)
      resolve(null)
    }
    const packed = packUint8Arrays(charStrings)
    worker.postMessage(packed, [packed.bytes.buffer, packed.offsets.buffer])
  })
}

/**
 * CharStrings에 전역 서브루틴을 붙인다. 브라우저면 Worker에서, 아니면(Node 스크립트 · 테스트) 그 자리에서 돌린다.
 * 실패하면 서브루틴 없이 원래 CharStrings를 돌려준다 — 파일이 커질 뿐 폰트는 그대로다.
 */
export async function subroutinizeForExport(charStrings: readonly Uint8Array[]): Promise<SubroutinizedCharStrings> {
  try {
    const fromWorker = typeof Worker === 'undefined' ? null : await runInWorker(charStrings)
    return fromWorker ?? subroutinizeCharStrings(charStrings)
  } catch (error) {
    console.warn('CFF 서브루틴 건너뜀(파일만 커짐):', error)
    return { charStrings: [...charStrings], globalSubrs: [] }
  }
}
