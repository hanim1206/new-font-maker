import { useState, useEffect, useCallback, useRef } from 'react'
import type { LayoutSchema, Padding, Part, PartOverride } from '../types'

const MAX_HISTORY = 50

interface DraftSnapshot {
  schema: LayoutSchema
  padding: Padding
}

interface LayoutSchemaDraft {
  draftSchema: LayoutSchema
  draftPadding: Padding
  isDirty: boolean
  setDraftSplit: (index: number, value: number) => void
  setDraftPaddingSide: (side: keyof Padding, value: number) => void
  setDraftPartOverride: (part: Part, side: keyof PartOverride, value: number) => void
  resetDraft: () => void
  // undo/redo
  pushSnapshot: () => void
  undo: () => void
  redo: () => void
  canUndo: boolean
  canRedo: boolean
}

/**
 * 레이아웃 스키마의 드래프트 관리 훅
 *
 * Split/Padding/PartOverrides 변경을 로컬 state에서 관리하고,
 * 저장 버튼을 눌러야만 스토어에 반영되도록 한다.
 * undo/redo 히스토리도 지원한다.
 */
export function useLayoutSchemaDraft(
  storeSchema: LayoutSchema,
  storePadding: Padding
): LayoutSchemaDraft {
  const [draftSchema, setDraftSchema] = useState<LayoutSchema>(storeSchema)
  const [draftPadding, setDraftPadding] = useState<Padding>(storePadding)
  const [isDirty, setIsDirty] = useState(false)
  const [historyLength, setHistoryLength] = useState(0)
  const [redoLength, setRedoLength] = useState(0)

  // 스토어 값 참조 (resetDraft에서 최신 값 사용)
  const storeSchemaRef = useRef(storeSchema)
  const storePaddingRef = useRef(storePadding)
  storeSchemaRef.current = storeSchema
  storePaddingRef.current = storePadding

  // 현재 드래프트 참조 (히스토리용)
  const currentRef = useRef<DraftSnapshot>({ schema: storeSchema, padding: storePadding })
  const historyRef = useRef<DraftSnapshot[]>([])
  const redoRef = useRef<DraftSnapshot[]>([])

  // currentRef 동기화
  useEffect(() => {
    currentRef.current = { schema: draftSchema, padding: draftPadding }
  }, [draftSchema, draftPadding])

  // 레이아웃 타입 전환 시 드래프트 + 히스토리 리셋
  useEffect(() => {
    setDraftSchema(storeSchema)
    setDraftPadding(storePadding)
    setIsDirty(false)
    historyRef.current = []
    redoRef.current = []
    setHistoryLength(0)
    setRedoLength(0)
  }, [storeSchema.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // isDirty가 아닐 때 스토어 값이 변경되면 드래프트 동기화
  // (저장 후 스토어 업데이트 → resetDraft → isDirty=false → 다음 렌더에서 스토어 값으로 sync)
  // 주의: storeSchema/storePadding은 매 렌더마다 새 객체 참조를 반환하므로
  // JSON 직렬화로 내용 비교하여 실제 변경 시에만 동기화
  const storeSchemaJson = JSON.stringify(storeSchema)
  const storePaddingJson = JSON.stringify(storePadding)
  useEffect(() => {
    if (!isDirty) {
      setDraftSchema(storeSchema)
      setDraftPadding(storePadding)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storeSchemaJson, storePaddingJson, isDirty])

  // 현재 상태를 히스토리에 저장 (드래그 시작 전 호출)
  const pushSnapshot = useCallback(() => {
    historyRef.current = [...historyRef.current.slice(-(MAX_HISTORY - 1)), currentRef.current]
    redoRef.current = []
    setHistoryLength(historyRef.current.length)
    setRedoLength(0)
  }, [])

  // Undo
  const undo = useCallback(() => {
    if (historyRef.current.length === 0) return
    const prevState = historyRef.current.pop()!
    redoRef.current.push(currentRef.current)
    currentRef.current = prevState
    setDraftSchema(prevState.schema)
    setDraftPadding(prevState.padding)
    setIsDirty(true)
    setHistoryLength(historyRef.current.length)
    setRedoLength(redoRef.current.length)
  }, [])

  // Redo
  const redo = useCallback(() => {
    if (redoRef.current.length === 0) return
    const nextState = redoRef.current.pop()!
    historyRef.current.push(currentRef.current)
    currentRef.current = nextState
    setDraftSchema(nextState.schema)
    setDraftPadding(nextState.padding)
    setIsDirty(true)
    setHistoryLength(historyRef.current.length)
    setRedoLength(redoRef.current.length)
  }, [])

  // Split 값 변경
  const setDraftSplit = useCallback((index: number, value: number) => {
    setDraftSchema(prev => {
      if (!prev.splits || index >= prev.splits.length) return prev
      const newSplits = prev.splits.map((s, i) =>
        i === index ? { ...s, value } : s
      )
      return { ...prev, splits: newSplits }
    })
    setIsDirty(true)
  }, [])

  // 패딩 값 변경
  const setDraftPaddingSide = useCallback((side: keyof Padding, value: number) => {
    setDraftPadding(prev => ({ ...prev, [side]: value }))
    setIsDirty(true)
  }, [])

  // 파트 오프셋 변경
  const setDraftPartOverride = useCallback((part: Part, side: keyof PartOverride, value: number) => {
    setDraftSchema(prev => {
      const currentOverrides = prev.partOverrides ?? {}
      const currentPartOvr = currentOverrides[part] ?? { top: 0, bottom: 0, left: 0, right: 0 }
      return {
        ...prev,
        partOverrides: {
          ...currentOverrides,
          [part]: { ...currentPartOvr, [side]: value },
        },
      }
    })
    setIsDirty(true)
  }, [])

  // 스토어 값으로 되돌리기 + 히스토리 초기화
  const resetDraft = useCallback(() => {
    setDraftSchema(storeSchemaRef.current)
    setDraftPadding(storePaddingRef.current)
    setIsDirty(false)
    historyRef.current = []
    redoRef.current = []
    setHistoryLength(0)
    setRedoLength(0)
  }, [])

  return {
    draftSchema,
    draftPadding,
    isDirty,
    setDraftSplit,
    setDraftPaddingSide,
    setDraftPartOverride,
    resetDraft,
    pushSnapshot,
    undo,
    redo,
    canUndo: historyLength > 0,
    canRedo: redoLength > 0,
  }
}
