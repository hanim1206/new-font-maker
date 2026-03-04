/**
 * 미저장 변경 감지 훅
 *
 * 3개 스토어의 subscribe를 통해 변경을 감지한다.
 * _hydrated 상태 확인으로 hydration/loadFontData 이후의 실제 변경만 추적.
 */
import { useState, useCallback, useEffect, useRef } from 'react'
import { useJamoStore } from '../stores/jamoStore'
import { useLayoutStore } from '../stores/layoutStore'
import { useGlobalStyleStore } from '../stores/globalStyleStore'

export function useUnsavedChanges() {
  const [isDirty, setIsDirty] = useState(false)
  const skipJamoRef = useRef(false)
  const skipLayoutRef = useRef(false)
  const skipStyleRef = useRef(false)

  // 저장 직후 isDirty를 false로 설정 (이후 변경은 추적됨)
  const markAsSaved = useCallback(() => {
    setIsDirty(false)
  }, [])

  // 로드 직후: 3개 스토어 모두 skip 후 isDirty 해제
  const markAsClean = useCallback(() => {
    skipJamoRef.current = true
    skipLayoutRef.current = true
    skipStyleRef.current = true
    setIsDirty(false)
  }, [])

  // 스토어 변경 감지 (hydration 이후만)
  useEffect(() => {
    const unsubs = [
      useJamoStore.subscribe((state, prev) => {
        if (state._hydrated && prev._hydrated && !skipJamoRef.current) {
          setIsDirty(true)
        }
        skipJamoRef.current = false
      }),
      useLayoutStore.subscribe((state, prev) => {
        if (state._hydrated && prev._hydrated && !skipLayoutRef.current) {
          setIsDirty(true)
        }
        skipLayoutRef.current = false
      }),
      useGlobalStyleStore.subscribe((state, prev) => {
        if (state._hydrated && prev._hydrated && !skipStyleRef.current) {
          setIsDirty(true)
        }
        skipStyleRef.current = false
      }),
    ]
    return () => unsubs.forEach((u) => u())
  }, [])

  // beforeunload 이벤트 등록
  useEffect(() => {
    if (!isDirty) return

    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty])

  return {
    isDirty,
    markAsSaved,
    markAsClean,
  }
}
