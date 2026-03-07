import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useJamoStore } from '../../stores/jamoStore'
import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import { useHistoryStore } from '../../stores/historyStore'
import { LayoutEditorDesktop } from './LayoutEditorDesktop'
import { LayoutEditorMobile } from './LayoutEditorMobile'
import type { PartStyle } from '../../renderers/SvgRenderer'
import { decomposeSyllableWithOverrides, getSampleSyllableForLayout } from '../../utils/hangulUtils'
import { calculateBoxes } from '../../utils/layoutCalculator'
import { mergeStrokes, splitStroke, addHandlesToPoint, removeHandlesFromPoint } from '../../utils/strokeEditUtils'
import { COMPOUND_JONGSEONG } from '../../utils/jamoLinkUtils'
import type { LayoutType, Part, DecomposedSyllable, BoxConfig, JamoData, Padding, PartOverride, StrokeDataV2 } from '../../types'

interface LayoutEditorProps {
  layoutType: LayoutType
}

// 파트 → 자모 정보 매핑
function partToJamoInfo(part: Part, syllable: DecomposedSyllable): { type: 'choseong' | 'jungseong' | 'jongseong'; char: string } | null {
  if (part === 'CH' && syllable.choseong) return { type: 'choseong', char: syllable.choseong.char }
  if ((part === 'JU' || part === 'JU_H' || part === 'JU_V') && syllable.jungseong) return { type: 'jungseong', char: syllable.jungseong.char }
  if (part === 'JO' && syllable.jongseong) return { type: 'jongseong', char: syllable.jongseong.char }
  return null
}

// 스토어에서 편집 중인 자모의 flat strokes 조회
function getEditingStrokes(
  type: 'choseong' | 'jungseong' | 'jongseong',
  char: string,
  overrideId: string | null,
  ch: Record<string, JamoData>,
  ju: Record<string, JamoData>,
  jo: Record<string, JamoData>
): StrokeDataV2[] {
  const jamoMap = type === 'choseong' ? ch : type === 'jungseong' ? ju : jo
  const jamo = jamoMap[char]
  if (!jamo) return []

  if (overrideId) {
    const override = jamo.overrides?.find(o => o.id === overrideId)
    if (override) {
      const v = override.variant
      if (v.horizontalStrokes && v.verticalStrokes) return [...v.horizontalStrokes, ...v.verticalStrokes]
      if (v.strokes) return [...v.strokes]
    }
  }

  if (jamo.horizontalStrokes && jamo.verticalStrokes) return [...jamo.horizontalStrokes, ...jamo.verticalStrokes]
  if (jamo.verticalStrokes) return [...jamo.verticalStrokes]
  if (jamo.horizontalStrokes) return [...jamo.horizontalStrokes]
  if (jamo.strokes) return [...jamo.strokes]
  return []
}

// flat strokes를 스토어에 커밋 (base 또는 override variant)
function commitStrokesToStore(
  info: { type: 'choseong' | 'jungseong' | 'jongseong'; char: string },
  strokes: StrokeDataV2[],
  overrideId: string | null
) {
  const store = useJamoStore.getState()
  const jamo = store[info.type][info.char]
  if (!jamo) return

  const isMixed = info.type === 'jungseong' && !!jamo.horizontalStrokes && !!jamo.verticalStrokes

  if (overrideId) {
    const existingOverride = jamo.overrides?.find(o => o.id === overrideId)
    if (!existingOverride) return
    const variant = { ...existingOverride.variant }
    if (isMixed) {
      const hIds = new Set(jamo.horizontalStrokes!.map(s => s.id))
      variant.horizontalStrokes = strokes.filter(s => hIds.has(s.id))
      variant.verticalStrokes = strokes.filter(s => !hIds.has(s.id))
    } else {
      variant.strokes = strokes
    }
    store.updateOverride(info.type, info.char, overrideId, { variant })
  } else {
    let updated: JamoData
    if (isMixed) {
      const hIds = new Set(jamo.horizontalStrokes!.map(s => s.id))
      updated = {
        ...jamo,
        horizontalStrokes: strokes.filter(s => hIds.has(s.id)),
        verticalStrokes: strokes.filter(s => !hIds.has(s.id)),
      }
    } else {
      updated = { ...jamo, strokes }
    }
    switch (info.type) {
      case 'choseong': store.updateChoseong(info.char, updated); break
      case 'jungseong': store.updateJungseong(info.char, updated); break
      case 'jongseong': store.updateJongseong(info.char, updated); break
    }
  }
}

export function LayoutEditor({ layoutType }: LayoutEditorProps) {
  const {
    inputText,
    selectedCharIndex,
    selectedPartInLayout,
    setSelectedPartInLayout,
    editingPartInLayout,
    setEditingPartInLayout,
    editingJamoType,
    editingJamoChar,
    setEditingJamo,
    selectedStrokeId,
    setSelectedStrokeId,
    editingOverrideId,
    setSelectedLayoutType,
    isMobile,
  } = useUIStore()
  const {
    getLayoutSchema,
    getEffectivePadding,
    hasPaddingOverride,
    setPaddingOverride,
    removePaddingOverride,
    updateSplit,
    updatePartOverride,
    resetLayoutSchema,
    resetAllPartOverrides,
    _hydrated,
  } = useLayoutStore()
  const {
    choseong,
    jungseong,
    jongseong,
    updateJamoPadding,
    updateMixedJamoPadding,
    resetJamoChar,
  } = useJamoStore()
  const { getEffectiveStyle, style: globalStyleRaw } = useGlobalStyleStore()
  const { pushSnapshot, undo: globalUndo, redo: globalRedo } = useHistoryStore()
  const canUndo = useHistoryStore(s => s.undoStack.length > 0)
  const canRedo = useHistoryStore(s => s.redoStack.length > 0)

  // 자모 편집 시 미리보기 레이아웃 전환
  const [previewLayoutType, setPreviewLayoutType] = useState<LayoutType | null>(null)

  // layoutType prop 변경 또는 자모 편집 종료 시 previewLayoutType 초기화
  useEffect(() => {
    setPreviewLayoutType(null)
  }, [layoutType])

  useEffect(() => {
    if (!editingPartInLayout) {
      setPreviewLayoutType(null)
    }
  }, [editingPartInLayout])

  // 자모 편집 중이면 previewLayoutType 우선, 아니면 props layoutType
  const activeLayoutType = (editingPartInLayout && previewLayoutType) || layoutType

  // 스토어에서 직접 읽기 (draft 없음)
  const schema = getLayoutSchema(activeLayoutType)
  const effectivePadding = getEffectivePadding(activeLayoutType)
  const effectiveStyle = getEffectiveStyle(activeLayoutType)

  // 스키마+패딩 (캔버스 렌더링용) — 스토어에서 직접
  const schemaWithPadding = useMemo(
    () => ({ ...schema, padding: effectivePadding }),
    [schema, effectivePadding]
  )

  // 계산된 박스 (파트 오버레이용) — partOverrides 포함
  const computedBoxes = useMemo(
    () => calculateBoxes(schemaWithPadding),
    [schemaWithPadding]
  )

  // 테스트용 음절
  const testSyllable = useMemo(() => {
    if (inputText && selectedCharIndex >= 0) {
      const hangulChars = inputText.split('').filter((char) => {
        const code = char.charCodeAt(0)
        return (code >= 0xac00 && code <= 0xd7a3) ||
          (code >= 0x3131 && code <= 0x314e) ||
          (code >= 0x314f && code <= 0x3163)
      })
      const selectedChar = hangulChars[selectedCharIndex]
      if (selectedChar) {
        const syllable = decomposeSyllableWithOverrides(selectedChar, choseong, jungseong, jongseong)
        if (syllable.layoutType === activeLayoutType) {
          return syllable
        }
      }
    }

    const firstChar = inputText.trim()[0]
    if (firstChar) {
      const syllable = decomposeSyllableWithOverrides(firstChar, choseong, jungseong, jongseong)
      if (syllable.layoutType === activeLayoutType) {
        return syllable
      }
    }

    // 자모 편집 중이면 편집 중인 자모가 포함된 샘플, 아니면 기본 샘플
    const fallbackChar = getSampleSyllableForLayout(
      activeLayoutType,
      editingJamoType ?? undefined,
      editingJamoChar ?? undefined
    )
    return decomposeSyllableWithOverrides(fallbackChar, choseong, jungseong, jongseong)
  }, [inputText, selectedCharIndex, activeLayoutType, editingJamoType, editingJamoChar, choseong, jungseong, jongseong])

  // === 자모 편집 서브모드 ===
  const isJamoEditing = editingPartInLayout !== null

  // 편집 중인 파트의 자모 정보
  const editingJamoInfo = useMemo(() => {
    if (!editingPartInLayout) return null
    return partToJamoInfo(editingPartInLayout, testSyllable)
  }, [editingPartInLayout, testSyllable])

  // Ref로 최신 편집 컨텍스트 참조 (드래그 핸들러에서 클로저 문제 방지)
  const editingJamoInfoRef = useRef(editingJamoInfo)
  editingJamoInfoRef.current = editingJamoInfo
  const editingOverrideIdRef = useRef(editingOverrideId)
  editingOverrideIdRef.current = editingOverrideId

  // 편집 중인 파트의 박스 정보 (StrokeOverlay용)
  const editingBox = useMemo((): BoxConfig | null => {
    if (!editingPartInLayout) return null
    const partKey = editingPartInLayout === 'JU_H' || editingPartInLayout === 'JU_V'
      ? editingPartInLayout
      : editingPartInLayout === 'CH' ? 'CH'
      : editingPartInLayout === 'JO' ? 'JO'
      : 'JU'
    const box = computedBoxes[partKey as keyof typeof computedBoxes]
    return box || null
  }, [editingPartInLayout, computedBoxes])

  // 편집 중인 자모의 strokes (스토어에서 파생)
  const editingStrokes = useMemo(() => {
    if (!editingJamoInfo) return [] as StrokeDataV2[]
    return getEditingStrokes(
      editingJamoInfo.type, editingJamoInfo.char,
      editingOverrideId, choseong, jungseong, jongseong
    )
  }, [editingJamoInfo, editingOverrideId, choseong, jungseong, jongseong])

  // 편집 중인 자모의 패딩 (스토어에서 파생)
  const editingPadding = useMemo(() => {
    if (!editingJamoInfo) return { padding: undefined as Padding | undefined, horizontalPadding: undefined as Padding | undefined, verticalPadding: undefined as Padding | undefined }
    const jamoMap = editingJamoInfo.type === 'choseong' ? choseong
      : editingJamoInfo.type === 'jungseong' ? jungseong : jongseong
    const jamo = jamoMap[editingJamoInfo.char]
    if (!jamo) return { padding: undefined, horizontalPadding: undefined, verticalPadding: undefined }

    if (editingOverrideId) {
      const override = jamo.overrides?.find(o => o.id === editingOverrideId)
      if (override) {
        return {
          padding: override.variant.padding ?? jamo.padding,
          horizontalPadding: override.variant.horizontalPadding ?? jamo.horizontalPadding,
          verticalPadding: override.variant.verticalPadding ?? jamo.verticalPadding,
        }
      }
    }

    return {
      padding: jamo.padding,
      horizontalPadding: jamo.horizontalPadding,
      verticalPadding: jamo.verticalPadding,
    }
  }, [editingJamoInfo, editingOverrideId, choseong, jungseong, jongseong])

  // 혼합중성 관련 데이터
  const mixedJungseongData = useMemo(() => {
    if (!editingJamoInfo || editingJamoInfo.type !== 'jungseong') return null
    const jamo = jungseong[editingJamoInfo.char]
    if (!jamo?.horizontalStrokes || !jamo?.verticalStrokes) return null
    return {
      isMixed: true,
      juHBox: computedBoxes.JU_H as BoxConfig | undefined,
      juVBox: computedBoxes.JU_V as BoxConfig | undefined,
      horizontalStrokeIds: new Set(jamo.horizontalStrokes.map(s => s.id)),
      verticalStrokeIds: new Set(jamo.verticalStrokes.map(s => s.id)),
    }
  }, [editingJamoInfo, jungseong, computedBoxes])

  // 자모 편집 진입/전환 시 선택 초기화
  const editingJamoType_ = editingJamoInfo?.type ?? null
  const editingJamoChar_ = editingJamoInfo?.char ?? null
  useEffect(() => {
    setSelectedStrokeId(null)
  }, [editingJamoType_, editingJamoChar_, editingOverrideId, setSelectedStrokeId])

  // Escape 키로 자모 편집 종료 + Ctrl+Z/Y로 글로벌 undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isJamoEditing) {
        e.preventDefault()
        setPreviewLayoutType(null)
        setEditingPartInLayout(null)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        globalUndo()
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        globalRedo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isJamoEditing, setEditingPartInLayout, globalUndo, globalRedo])

  // 파트 싱글클릭 → 파트 선택 (파트 오프셋 조절용)
  const handlePartClick = useCallback((part: Part) => {
    setSelectedPartInLayout(selectedPartInLayout === part ? null : part)
  }, [selectedPartInLayout, setSelectedPartInLayout])

  // 파트 선택 해제 (캔버스 외부 클릭 시)
  const handlePartDeselect = useCallback(() => {
    setSelectedPartInLayout(null)
  }, [setSelectedPartInLayout])

  // 파트 더블클릭 → 자모 편집 진입
  const handlePartDoubleClick = useCallback((part: Part) => {
    const jamoInfo = partToJamoInfo(part, testSyllable)
    if (!jamoInfo) return
    setPreviewLayoutType(layoutType)
    setEditingPartInLayout(part)
    setEditingJamo(jamoInfo.type, jamoInfo.char)
  }, [testSyllable, layoutType, setEditingPartInLayout, setEditingJamo])

  // === 자모 획 편집 핸들러 (스토어 직접 조작) ===

  // 획 속성 변경 (드래그 중 연속 호출 — 스냅샷 없음)
  const handleStrokeChange = useCallback((strokeId: string, prop: string, value: number | string | boolean | undefined) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current
    const { choseong: ch, jungseong: ju, jongseong: jo } = useJamoStore.getState()
    const strokes = getEditingStrokes(info.type, info.char, ovId, ch, ju, jo)
    const newStrokes = strokes.map((s) => {
      if (s.id !== strokeId) return s
      if (value === undefined) {
        const updated = { ...s }
        delete (updated as Record<string, unknown>)[prop]
        return updated
      }
      return { ...s, [prop]: value }
    })
    commitStrokesToStore(info, newStrokes, ovId)
  }, [])

  // 포인트 변경 핸들러
  const handlePointChange = useCallback((
    strokeId: string,
    pointIndex: number,
    field: 'x' | 'y' | 'handleIn' | 'handleOut',
    value: { x: number; y: number } | number
  ) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current
    const { choseong: ch, jungseong: ju, jongseong: jo } = useJamoStore.getState()
    const strokes = getEditingStrokes(info.type, info.char, ovId, ch, ju, jo)
    const newStrokes = strokes.map(s => {
      if (s.id !== strokeId) return s
      const newPoints = s.points.map((p, i) => {
        if (i !== pointIndex) return p
        const updated = { ...p }
        if (field === 'x' || field === 'y') {
          updated[field] = value as number
        } else {
          updated[field] = value as { x: number; y: number }
        }
        return updated
      })
      return { ...s, points: newPoints }
    })
    commitStrokesToStore(info, newStrokes, ovId)
  }, [])

  // 드래그 시작 전 스냅샷 (글로벌 히스토리)
  const handleDragStart = useCallback(() => {
    pushSnapshot()
  }, [pushSnapshot])

  // 두 획 합치기
  const handleMergeStrokes = useCallback((strokeIdA: string, strokeIdB: string) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current
    pushSnapshot()
    const { choseong: ch, jungseong: ju, jongseong: jo } = useJamoStore.getState()
    const strokes = getEditingStrokes(info.type, info.char, ovId, ch, ju, jo)
    const a = strokes.find(s => s.id === strokeIdA)
    const b = strokes.find(s => s.id === strokeIdB)
    if (!a || !b) return
    const merged = mergeStrokes(a, b)
    if (!merged) return
    const newStrokes = strokes
      .map(s => s.id === strokeIdA ? merged : s)
      .filter(s => s.id !== strokeIdB)
    commitStrokesToStore(info, newStrokes, ovId)
  }, [pushSnapshot])

  // 획 분리
  const handleSplitStroke = useCallback((strokeId: string, pointIndex: number) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current
    pushSnapshot()
    const { choseong: ch, jungseong: ju, jongseong: jo } = useJamoStore.getState()
    const strokes = getEditingStrokes(info.type, info.char, ovId, ch, ju, jo)
    const stroke = strokes.find(s => s.id === strokeId)
    if (!stroke) return
    const result = splitStroke(stroke, pointIndex)
    if (!result) return
    const [first, second] = result
    const idx = strokes.findIndex(s => s.id === strokeId)
    const newStrokes = [...strokes]
    newStrokes.splice(idx, 1, first, second)
    commitStrokesToStore(info, newStrokes, ovId)
  }, [pushSnapshot])

  // 닫힌 경로를 선택한 점에서 끊기 (열기)
  const handleOpenAtPoint = useCallback((strokeId: string, pointIndex: number) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current
    pushSnapshot()
    const { choseong: ch, jungseong: ju, jongseong: jo } = useJamoStore.getState()
    const strokes = getEditingStrokes(info.type, info.char, ovId, ch, ju, jo)
    const newStrokes = strokes.map(s => {
      if (s.id !== strokeId || !s.closed) return s
      const rotated = [...s.points.slice(pointIndex), ...s.points.slice(0, pointIndex)]
      return { ...s, points: rotated, closed: false }
    })
    commitStrokesToStore(info, newStrokes, ovId)
  }, [pushSnapshot])

  // 포인트 삭제 (최소 2점 유지)
  const handleDeletePoint = useCallback((strokeId: string, pointIndex: number) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current
    pushSnapshot()
    const { choseong: ch, jungseong: ju, jongseong: jo } = useJamoStore.getState()
    const strokes = getEditingStrokes(info.type, info.char, ovId, ch, ju, jo)
    const newStrokes = strokes.map(s => {
      if (s.id !== strokeId || s.points.length <= 2) return s
      const newPoints = [...s.points]
      newPoints.splice(pointIndex, 1)
      return { ...s, points: newPoints }
    })
    commitStrokesToStore(info, newStrokes, ovId)
  }, [pushSnapshot])

  // 획 삭제
  const handleDeleteStroke = useCallback((strokeId: string) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current
    pushSnapshot()
    const { choseong: ch, jungseong: ju, jongseong: jo } = useJamoStore.getState()
    const strokes = getEditingStrokes(info.type, info.char, ovId, ch, ju, jo)
    commitStrokesToStore(info, strokes.filter(s => s.id !== strokeId), ovId)
  }, [pushSnapshot])

  // 획 추가 (기본 2점 직선)
  const handleAddStroke = useCallback(() => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current
    pushSnapshot()
    const newId = `stroke-${Date.now()}`
    const newStroke: StrokeDataV2 = {
      id: newId,
      points: [
        { x: 0.2, y: 0.5 },
        { x: 0.8, y: 0.5 },
      ],
      closed: false,
      thickness: 0.07,
    }
    const { choseong: ch, jungseong: ju, jongseong: jo } = useJamoStore.getState()
    const strokes = getEditingStrokes(info.type, info.char, ovId, ch, ju, jo)
    commitStrokesToStore(info, [...strokes, newStroke], ovId)
    setSelectedStrokeId(newId)
  }, [pushSnapshot, setSelectedStrokeId])

  // 포인트 곡선화 토글
  const handleToggleCurve = useCallback((strokeId: string, pointIndex: number) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current
    pushSnapshot()
    const { choseong: ch, jungseong: ju, jongseong: jo } = useJamoStore.getState()
    const strokes = getEditingStrokes(info.type, info.char, ovId, ch, ju, jo)
    const newStrokes = strokes.map(s => {
      if (s.id !== strokeId) return s
      const pt = s.points[pointIndex]
      if (!pt) return s
      if (pt.handleIn || pt.handleOut) {
        return removeHandlesFromPoint(s, pointIndex)
      } else {
        return addHandlesToPoint(s, pointIndex)
      }
    })
    commitStrokesToStore(info, newStrokes, ovId)
  }, [pushSnapshot])

  // 종성 편집 시 초성 스타일 복사 정보
  const choseongStyleInfo = useMemo(() => {
    if (!editingJamoInfo || editingJamoInfo.type !== 'jongseong') return null
    const char = editingJamoInfo.char

    const compoundParts = COMPOUND_JONGSEONG[char]
    if (compoundParts) {
      const [first, second] = compoundParts
      const firstJamo = choseong[first]
      const secondJamo = choseong[second]
      if (firstJamo && secondJamo) {
        return { type: 'compound' as const, parts: compoundParts, jamos: [firstJamo, secondJamo] as const }
      }
      return null
    }

    const singleJamo = choseong[char]
    if (singleJamo) {
      return { type: 'single' as const, jamo: singleJamo }
    }

    return null
  }, [editingJamoInfo, choseong])

  const handleApplyChoseongStyle = useCallback(() => {
    if (!choseongStyleInfo || !editingJamoInfo) return
    pushSnapshot()

    let newStrokes: StrokeDataV2[]
    if (choseongStyleInfo.type === 'single') {
      const src = choseongStyleInfo.jamo
      newStrokes = src.strokes ? src.strokes.map(s => ({ ...s })) : []
      if (src.padding) {
        const pad = src.padding
        for (const side of ['top', 'bottom', 'left', 'right'] as const) {
          updateJamoPadding('jongseong', editingJamoInfo.char, side, pad[side])
        }
      }
    } else {
      const [firstJamo, secondJamo] = choseongStyleInfo.jamos
      const scaleStrokes = (strokes: StrokeDataV2[], xOffset: number, xScale: number) =>
        strokes.map(s => ({
          ...s,
          points: s.points.map(p => ({
            ...p,
            x: p.x * xScale + xOffset,
            ...(p.handleIn ? { handleIn: { x: p.handleIn.x * xScale + xOffset, y: p.handleIn.y } } : {}),
            ...(p.handleOut ? { handleOut: { x: p.handleOut.x * xScale + xOffset, y: p.handleOut.y } } : {}),
          })),
        }))
      const leftStrokes = scaleStrokes(
        firstJamo.strokes ? firstJamo.strokes.map(s => ({ ...s })) : [],
        0, 0.5
      )
      const rightStrokes = scaleStrokes(
        secondJamo.strokes ? secondJamo.strokes.map(s => ({ ...s })) : [],
        0.5, 0.5
      )
      newStrokes = [...leftStrokes, ...rightStrokes]
      for (const side of ['top', 'bottom', 'left', 'right'] as const) {
        updateJamoPadding('jongseong', editingJamoInfo.char, side, 0)
      }
    }

    commitStrokesToStore(editingJamoInfo, newStrokes, editingOverrideId)
  }, [choseongStyleInfo, editingJamoInfo, editingOverrideId, pushSnapshot, updateJamoPadding])

  // 오버라이드 탭 전환 (strokes는 스토어에서 자동 파생)
  const handleOverrideSwitch = useCallback((_overrideId: string | null) => {
    setSelectedStrokeId(null)
  }, [setSelectedStrokeId])

  // 자모 편집 초기화 (기본값 복원)
  const handleJamoReset = useCallback(() => {
    if (!editingJamoInfo) return
    if (!window.confirm(`자모 '${editingJamoInfo.char}'을(를) 기본값으로 초기화하시겠습니까?\n획과 패딩이 모두 초기 상태로 돌아갑니다.`)) return
    pushSnapshot()
    resetJamoChar(editingJamoInfo.type, editingJamoInfo.char)
  }, [editingJamoInfo, pushSnapshot, resetJamoChar])

  // 자모 편집 모드에서 SvgRenderer용 partStyles 계산
  const partStyles = useMemo((): Partial<Record<Part, PartStyle>> | undefined => {
    if (!isJamoEditing || !editingPartInLayout) return undefined
    const styles: Partial<Record<Part, PartStyle>> = {}
    const allParts: Part[] = ['CH', 'JU', 'JU_H', 'JU_V', 'JO']
    for (const part of allParts) {
      const isEditingPart = part === editingPartInLayout ||
        (editingPartInLayout === 'JU' && (part === 'JU_H' || part === 'JU_V')) ||
        ((editingPartInLayout === 'JU_H' || editingPartInLayout === 'JU_V') && (part === 'JU_H' || part === 'JU_V'))

      if (isEditingPart) {
        styles[part] = { hidden: true }
      } else {
        // 비편집 파트: 숨김
        styles[part] = { hidden: true }
      }
    }
    return styles
  }, [isJamoEditing, editingPartInLayout])

  // === 레이아웃 편집 핸들러 (스토어 직접 조작) ===

  const handleReset = () => {
    if (!window.confirm('이 레이아웃을 기본값으로 초기화하시겠습니까?\n현재 설정(분할선, 패딩, 파트 위치)이 모두 초기화됩니다.')) return
    pushSnapshot()
    resetLayoutSchema(layoutType)
    resetAllPartOverrides(layoutType)
    removePaddingOverride(layoutType)
  }

  // 패딩 오버라이드 → 스토어 직접
  const handlePaddingOverrideChange = useCallback((side: keyof Padding, val: number) => {
    setPaddingOverride(activeLayoutType, side, val)
  }, [setPaddingOverride, activeLayoutType])

  // 파트 오프셋 → 스토어 직접
  const handlePartOverrideChange = useCallback((part: Part, side: keyof PartOverride, value: number) => {
    updatePartOverride(activeLayoutType, part, side, value)
  }, [updatePartOverride, activeLayoutType])

  // 기준선 → 스토어 직접
  const handleSplitChange = useCallback((index: number, value: number) => {
    updateSplit(activeLayoutType, index, value)
  }, [updateSplit, activeLayoutType])

  // 레이아웃 컨텍스트 전환 핸들러
  const handlePreviewLayoutTypeChange = useCallback((lt: LayoutType) => {
    if (isJamoEditing) {
      setPreviewLayoutType(lt)
    } else {
      setSelectedLayoutType(lt)
    }
  }, [isJamoEditing, setPreviewLayoutType, setSelectedLayoutType])

  // 자모 패딩 변경 → 스토어 직접
  const handleJamoPaddingChange = useCallback((_type: 'choseong' | 'jungseong' | 'jongseong', _char: string, side: keyof Padding, val: number) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current

    if (ovId) {
      // 오버라이드 variant의 패딩 업데이트
      const store = useJamoStore.getState()
      const jamo = store[info.type][info.char]
      if (!jamo) return
      const existingOverride = jamo.overrides?.find(o => o.id === ovId)
      if (!existingOverride) return
      const variant = { ...existingOverride.variant }
      const currentPad = variant.padding ?? jamo.padding ?? { top: 0, bottom: 0, left: 0, right: 0 }
      variant.padding = { ...currentPad, [side]: val }
      store.updateOverride(info.type, info.char, ovId, { variant })
    } else {
      updateJamoPadding(info.type, info.char, side, val)
    }
  }, [updateJamoPadding])

  // 혼합중성 패딩 변경 → 스토어 직접
  const handleMixedJamoPaddingChange = useCallback((_char: string, part: 'horizontal' | 'vertical', side: keyof Padding, val: number) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current

    if (ovId) {
      const store = useJamoStore.getState()
      const jamo = store[info.type][info.char]
      if (!jamo) return
      const existingOverride = jamo.overrides?.find(o => o.id === ovId)
      if (!existingOverride) return
      const variant = { ...existingOverride.variant }
      const key = part === 'horizontal' ? 'horizontalPadding' as const : 'verticalPadding' as const
      const currentPad = variant[key] ?? jamo[key] ?? { top: 0, bottom: 0, left: 0, right: 0 }
      variant[key] = { ...currentPad, [side]: val }
      store.updateOverride(info.type, info.char, ovId, { variant })
    } else {
      updateMixedJamoPadding(info.char, part, side, val)
    }
  }, [updateMixedJamoPadding])

  // Hydration 전에는 로딩 표시
  if (!_hydrated) {
    return (
      <div className="h-full overflow-y-auto p-5">
        <div className="flex items-center justify-center h-[200px] text-text-dim-5 text-base">로딩 중...</div>
      </div>
    )
  }

  if (!schema) {
    return (
      <div className="h-full overflow-y-auto p-5">
        <p>레이아웃 스키마를 불러올 수 없습니다.</p>
      </div>
    )
  }

  // 공통 캔버스 컬럼 props
  const layoutCanvasProps = {
    layoutType,
    displaySyllable: testSyllable,
    schemaWithPadding,
    effectiveStyle,
    computedBoxes,
    schema,
    effectivePadding,
    hasPaddingOverride: hasPaddingOverride(layoutType),
    selectedPartInLayout,
    editingPartInLayout,
    editingJamoInfo,
    previewLayoutType: isJamoEditing ? previewLayoutType : layoutType,
    onLayoutReset: handleReset,
    onDragStart: handleDragStart,
    onUndo: globalUndo,
    onRedo: globalRedo,
    canUndo,
    canRedo,
    onPartClick: handlePartClick,
    onPartDoubleClick: handlePartDoubleClick,
    onPartOverrideChange: handlePartOverrideChange,
    onSplitChange: handleSplitChange,
    onPaddingOverrideChange: handlePaddingOverrideChange,
    onPreviewLayoutTypeChange: handlePreviewLayoutTypeChange,
  } as const

  const jamoCanvasProps = {
    displaySyllable: testSyllable,
    schemaWithPadding,
    effectiveStyle,
    partStyles,
    isJamoEditing,
    draftStrokes: editingStrokes,
    editingBox,
    editingJamoInfo,
    mixedJungseongData,
    editingJamoPadding: editingPadding.padding,
    editingHorizontalPadding: editingPadding.horizontalPadding,
    editingVerticalPadding: editingPadding.verticalPadding,
    isPaddingDirty: false,
    selectedStrokeId,
    globalStyleRaw,
    onStrokeChange: handleStrokeChange,
    onPointChange: handlePointChange,
    onDragStart: handleDragStart,
    onJamoPaddingChange: handleJamoPaddingChange,
    onMixedJamoPaddingChange: handleMixedJamoPaddingChange,
    onMergeStrokes: handleMergeStrokes,
    onSplitStroke: handleSplitStroke,
    onToggleCurve: handleToggleCurve,
    onOpenAtPoint: handleOpenAtPoint,
    onDeletePoint: handleDeletePoint,
    onDeleteStroke: handleDeleteStroke,
    onAddStroke: handleAddStroke,
  } as const

  const jamoControlsProps = {
    isJamoEditing,
    editingJamoInfo,
    choseongStyleInfo,
    onApplyChoseongStyle: handleApplyChoseongStyle,
    onOverrideSwitch: handleOverrideSwitch,
    strokes: editingStrokes,
    onStrokeChange: handleStrokeChange,
    onMergeStrokes: handleMergeStrokes,
    onDeleteStroke: handleDeleteStroke,
    onAddStroke: handleAddStroke,
  } as const

  // 모바일: 단일 컬럼 레이아웃
  if (isMobile) {
    return (
      <LayoutEditorMobile
        layoutCanvasProps={layoutCanvasProps}
        jamoCanvasProps={jamoCanvasProps}
        jamoControlsProps={jamoControlsProps}
        isJamoEditing={isJamoEditing}
        editingJamoInfo={editingJamoInfo}
        canUndo={canUndo}
        canRedo={canRedo}
        onPartDeselect={handlePartDeselect}
        onJamoReset={handleJamoReset}
        onUndo={globalUndo}
        onRedo={globalRedo}
      />
    )
  }

  // 3컬럼 데스크톱 레이아웃
  return (
    <LayoutEditorDesktop
      layoutCanvasProps={layoutCanvasProps}
      jamoCanvasProps={jamoCanvasProps}
      jamoControlsProps={jamoControlsProps}
      isJamoEditing={isJamoEditing}
      editingJamoInfo={editingJamoInfo}
      canUndo={canUndo}
      canRedo={canRedo}
      onPartDeselect={handlePartDeselect}
      onJamoReset={handleJamoReset}
      onUndo={globalUndo}
      onRedo={globalRedo}
    />
  )
}
