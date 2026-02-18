import { useState, useCallback, useRef } from 'react'
import type { StrokeDataV2 } from '../types'

const MAX_HISTORY = 50

/**
 * 획 편집 히스토리 관리 훅
 * draftStrokes의 스냅샷을 저장하고 undo/redo 지원
 *
 * 사용 패턴:
 * - setStrokes(): 드래그 등 연속 변경 (히스토리 안 쌓임)
 * - pushSnapshot(): 드래그 시작 전, 또는 버튼 액션 전 호출 → 현재 상태를 히스토리에 저장
 * - undo()/redo(): 히스토리 탐색
 * - resetStrokes(): 자모 전환 시 히스토리 초기화
 */
export function useStrokeHistory(initialStrokes: StrokeDataV2[] = []) {
  const [strokes, setStrokesRaw] = useState<StrokeDataV2[]>(initialStrokes)
  const [historyLength, setHistoryLength] = useState(0)
  const [redoLength, setRedoLength] = useState(0)

  const historyRef = useRef<StrokeDataV2[][]>([])
  const redoRef = useRef<StrokeDataV2[][]>([])
  const currentRef = useRef<StrokeDataV2[]>(initialStrokes)

  // strokes 변경 (히스토리에 안 쌓임 — 드래그 중 연속 호출용)
  const setStrokes = useCallback((updater: StrokeDataV2[] | ((prev: StrokeDataV2[]) => StrokeDataV2[])) => {
    setStrokesRaw(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      currentRef.current = next
      return next
    })
  }, [])

  // 현재 상태를 히스토리에 저장 (드래그 시작 전, 버튼 액션 전 호출)
  const pushSnapshot = useCallback(() => {
    historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), currentRef.current]
    redoRef.current = []
    setHistoryLength(historyRef.current.length)
    setRedoLength(0)
  }, [])

  // 히스토리 초기화 (자모 전환 시)
  const resetStrokes = useCallback((newStrokes: StrokeDataV2[]) => {
    setStrokesRaw(newStrokes)
    currentRef.current = newStrokes
    historyRef.current = []
    redoRef.current = []
    setHistoryLength(0)
    setRedoLength(0)
  }, [])

  // Undo
  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return
    const prevState = historyRef.current.pop()!
    redoRef.current.push(currentRef.current)
    currentRef.current = prevState
    setStrokesRaw(prevState)
    setHistoryLength(historyRef.current.length)
    setRedoLength(redoRef.current.length)
  }, [])

  // Redo
  const redo = useCallback(() => {
    if (redoRef.current.length === 0) return
    const nextState = redoRef.current.pop()!
    historyRef.current.push(currentRef.current)
    currentRef.current = nextState
    setStrokesRaw(nextState)
    setHistoryLength(historyRef.current.length)
    setRedoLength(redoRef.current.length)
  }, [])

  return {
    strokes,
    setStrokes,
    pushSnapshot,
    resetStrokes,
    undo,
    redo,
    canUndo: historyLength > 0,
    canRedo: redoLength > 0,
  }
}
