import { useState, useEffect, useCallback, useRef } from 'react'
import type { LayoutSchema, Padding, Part, PartOverride } from '../types'

interface LayoutSchemaDraft {
  draftSchema: LayoutSchema
  draftPadding: Padding
  isDirty: boolean
  setDraftSplit: (index: number, value: number) => void
  setDraftPaddingSide: (side: keyof Padding, value: number) => void
  setDraftPartOverride: (part: Part, side: keyof PartOverride, value: number) => void
  resetDraft: () => void
}

/**
 * 레이아웃 스키마의 드래프트 관리 훅
 *
 * Split/Padding/PartOverrides 변경을 로컬 state에서 관리하고,
 * 저장 버튼을 눌러야만 스토어에 반영되도록 한다.
 */
export function useLayoutSchemaDraft(
  storeSchema: LayoutSchema,
  storePadding: Padding
): LayoutSchemaDraft {
  const [draftSchema, setDraftSchema] = useState<LayoutSchema>(storeSchema)
  const [draftPadding, setDraftPadding] = useState<Padding>(storePadding)
  const [isDirty, setIsDirty] = useState(false)

  // 스토어 값 참조 (resetDraft에서 최신 값 사용)
  const storeSchemaRef = useRef(storeSchema)
  const storePaddingRef = useRef(storePadding)
  storeSchemaRef.current = storeSchema
  storePaddingRef.current = storePadding

  // 레이아웃 타입 전환 시 드래프트 리셋
  useEffect(() => {
    setDraftSchema(storeSchema)
    setDraftPadding(storePadding)
    setIsDirty(false)
  }, [storeSchema.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // isDirty가 아닐 때 스토어 값이 변경되면 드래프트 동기화
  // (저장 후 스토어 업데이트 → resetDraft → isDirty=false → 다음 렌더에서 스토어 값으로 sync)
  useEffect(() => {
    if (!isDirty) {
      setDraftSchema(storeSchema)
      setDraftPadding(storePadding)
    }
  }, [storeSchema, storePadding, isDirty])

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

  // 스토어 값으로 되돌리기
  const resetDraft = useCallback(() => {
    setDraftSchema(storeSchemaRef.current)
    setDraftPadding(storePaddingRef.current)
    setIsDirty(false)
  }, [])

  return {
    draftSchema,
    draftPadding,
    isDirty,
    setDraftSplit,
    setDraftPaddingSide,
    setDraftPartOverride,
    resetDraft,
  }
}
