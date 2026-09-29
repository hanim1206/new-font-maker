/// <reference lib="webworker" />
/**
 * 서브루틴 만들기를 메인 스레드 밖에서 돌린다. 기본 폰트도 데스크톱에서 2초 남짓 걸려 화면이 멈추기 때문이다.
 * 주고받는 건 `packUint8Arrays` 한 덩어리다(글리프 1만여 개를 따로 복사하지 않는다).
 */
import { packUint8Arrays, subroutinizeCharStrings, unpackUint8Arrays, type PackedUint8Arrays } from './cffSubroutinize'

self.onmessage = (event: MessageEvent<PackedUint8Arrays>) => {
  try {
    const result = subroutinizeCharStrings(unpackUint8Arrays(event.data))
    const charStrings = packUint8Arrays(result.charStrings)
    const globalSubrs = packUint8Arrays(result.globalSubrs)
    self.postMessage({ ok: true, charStrings, globalSubrs }, [charStrings.bytes.buffer, charStrings.offsets.buffer, globalSubrs.bytes.buffer, globalSubrs.offsets.buffer])
  } catch (error) {
    self.postMessage({ ok: false, error: error instanceof Error ? error.message : String(error) })
  }
}
