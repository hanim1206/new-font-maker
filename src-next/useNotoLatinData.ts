import { useEffect, useState } from 'react'
import { loadNotoLatinData } from '../src/services/notoLatinSource'
import type { NotoLatinData } from '../src/services/notoLatinSource'

let dataPromise: Promise<NotoLatinData> | null = null
let loadedData: NotoLatinData | null = null

/** 노토 영문 · 숫자 · 기호 데이터. 앱에서 한 번만 받는다. 오기 전 · 못 받으면 null. */
export function useNotoLatinData(): NotoLatinData | null {
  const [data, setData] = useState<NotoLatinData | null>(loadedData)
  useEffect(() => {
    if (loadedData) return
    let alive = true
    dataPromise ??= loadNotoLatinData()
    dataPromise
      .then((loaded) => { loadedData = loaded; if (alive) setData(loaded) })
      .catch((failure) => { dataPromise = null; console.warn('숫자 · 기호 데이터를 읽지 못했습니다:', failure) })
    return () => { alive = false }
  }, [])
  return data
}
