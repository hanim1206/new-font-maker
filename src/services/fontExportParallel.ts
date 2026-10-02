import { unpackUint8Arrays } from './cffSubroutinize'
import type { PortableHangulGlyph } from './fontGenerator'
import type { LayoutDeltaSnapshot } from '../../src-next/layoutDeltaStore'
import type { NotoPresetModelBundle } from '../../src-next/notoPresetGlyphs'
import type { ParallelWorkerReply, ParallelWorkerRequest } from './fontExportParallel.worker'

/**
 * 추출 수집 · 변환을 Worker 풀로 나눈다(플랜 2026-10-02 추출 워커 병렬).
 * 어떤 이유로든 못 돌리면 null — 호출자는 지금 직렬 경로로 폴백한다. 폰트는 같고 느려질 뿐이다.
 */

/** Worker 수 상한. G0: 6이 4보다 2초 이득, 그 위는 수확 체감. */
export const PARALLEL_EXPORT_WORKER_CAP = 6

export interface ParallelPortablesInput {
  chars: readonly string[]
  /** `collectFontData()` 스냅숏. Worker가 자기 스토어를 채운다. */
  fontData: unknown
  deltaSnapshot: LayoutDeltaSnapshot
  bundle: NotoPresetModelBundle
  simplifyEpsilon?: number
  onProgress?: (done: number, total: number) => void
}

/** 이 환경에서 병렬 추출이 돌 수 있는가. 못 돌면 호출자가 처음부터 직렬로 간다. */
export function parallelExportAvailable(): boolean {
  const cores = typeof navigator !== 'undefined' ? navigator.hardwareConcurrency ?? 0 : 0
  return typeof Worker !== 'undefined' && Math.min(PARALLEL_EXPORT_WORKER_CAP, cores - 1) >= 2
}

export async function parallelHangulPortables(input: ParallelPortablesInput): Promise<PortableHangulGlyph[] | null> {
  if (!parallelExportAvailable()) return null
  const cores = navigator.hardwareConcurrency ?? 0
  const workerCount = Math.min(PARALLEL_EXPORT_WORKER_CAP, cores - 1)

  // 끼워넣기(stride) 분할 — 받침 글자가 몰린 연속 범위 등분은 부하가 안 고르다(G0 측정).
  const assignments: number[][] = Array.from({ length: workerCount }, () => [])
  for (let i = 0; i < input.chars.length; i++) assignments[i % workerCount].push(i)

  const slots: Array<PortableHangulGlyph | null> = new Array(input.chars.length).fill(null)
  const dones = new Array<number>(workerCount).fill(0)
  const report = () => input.onProgress?.(dones.reduce((a, b) => a + b, 0), input.chars.length)
  const workers: Worker[] = []

  try {
    await Promise.all(assignments.map((indices, at) => new Promise<void>((resolve, reject) => {
      let worker: Worker
      try {
        worker = new Worker(new URL('./fontExportParallel.worker.ts', import.meta.url), { type: 'module' })
      } catch (error) {
        reject(error)
        return
      }
      workers.push(worker)
      worker.onmessage = (event: MessageEvent<ParallelWorkerReply>) => {
        const reply = event.data
        if (reply.type === 'progress') {
          dones[at] = reply.done
          report()
          return
        }
        if (reply.type === 'error') {
          reject(new Error(reply.message))
          return
        }
        const charStrings = unpackUint8Arrays({ bytes: reply.bytes, offsets: reply.offsets })
        let csIndex = 0
        reply.metas.forEach((meta, j) => {
          if (!meta) return
          slots[indices[j]] = {
            unicode: meta.u,
            char: meta.c,
            advanceWidth: meta.a,
            charString: charStrings[csIndex++],
            inkBox: meta.ib,
            stub: meta.st,
            skipped: meta.sk,
            schemaFallback: meta.sf,
          }
        })
        dones[at] = indices.length
        report()
        worker.terminate()
        resolve()
      }
      worker.onerror = (event) => reject(new Error(event.message || 'Worker 오류'))
      const request: ParallelWorkerRequest = {
        fontData: input.fontData,
        deltaSnapshot: input.deltaSnapshot,
        bundle: input.bundle,
        chars: indices.map((i) => input.chars[i]),
        simplifyEpsilon: input.simplifyEpsilon,
      }
      worker.postMessage(request)
    })))
  } catch (error) {
    console.warn('병렬 추출 실패, 직렬로 폴백:', error)
    for (const worker of workers) worker.terminate()
    return null
  }
  return slots.filter((slot): slot is PortableHangulGlyph => slot !== null)
}
