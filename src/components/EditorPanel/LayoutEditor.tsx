import { useState, useEffect, useMemo, useCallback } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useJamoStore } from '../../stores/jamoStore'
import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import { useStrokeHistory } from '../../hooks/useStrokeHistory'
import { LayoutCanvasColumn } from './LayoutCanvasColumn'
import { JamoCanvasColumn } from './JamoCanvasColumn'
import { JamoControlsColumn } from './JamoControlsColumn'
import type { PartStyle } from '../../renderers/SvgRenderer'
import { decomposeSyllable, getSampleSyllableForLayout } from '../../utils/hangulUtils'
import { calculateBoxes } from '../../utils/layoutCalculator'
import { copyJsonToClipboard } from '../../utils/storage'
import { mergeStrokes, splitStroke, addHandlesToPoint, removeHandlesFromPoint } from '../../utils/strokeEditUtils'
import { COMPOUND_JONGSEONG } from '../../utils/jamoLinkUtils'
import type { LayoutType, Part, DecomposedSyllable, BoxConfig, JamoData, Padding } from '../../types'

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

export function LayoutEditor({ layoutType }: LayoutEditorProps) {
  const {
    inputText,
    selectedCharIndex,
    editingPartInLayout,
    setEditingPartInLayout,
    editingJamoType,
    editingJamoChar,
    setEditingJamo,
    selectedStrokeId,
    setSelectedStrokeId,
  } = useUIStore()
  const {
    getLayoutSchema,
    getEffectivePadding,
    hasPaddingOverride,
    setPaddingOverride,
    updateSplit,
    resetLayoutSchema,
    getCalculatedBoxes,
    exportSchemas,
    resetToBasePresets,
    _hydrated,
  } = useLayoutStore()
  const {
    choseong,
    jungseong,
    jongseong,
    updateChoseong,
    updateJungseong,
    updateJongseong,
    updateJamoPadding,
    updateMixedJamoPadding,
    exportJamos,
  } = useJamoStore()
  const { getEffectiveStyle, style: globalStyleRaw } = useGlobalStyleStore()

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

  // 자모 편집용 draft strokes (undo/redo 지원)
  const { strokes: draftStrokes, setStrokes: setDraftStrokes, pushSnapshot, resetStrokes: resetDraftStrokes, undo, redo, canUndo, canRedo } = useStrokeHistory()

  // 자모 편집 중이면 previewLayoutType 우선, 아니면 props layoutType
  const activeLayoutType = (editingPartInLayout && previewLayoutType) || layoutType

  const schema = getLayoutSchema(activeLayoutType)
  const effectivePadding = getEffectivePadding(activeLayoutType)
  const schemaWithPadding = useMemo(
    () => ({ ...schema, padding: effectivePadding }),
    [schema, effectivePadding]
  )
  const effectiveStyle = getEffectiveStyle(activeLayoutType)

  // 계산된 박스 (파트 오버레이용)
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
        const syllable = decomposeSyllable(selectedChar, choseong, jungseong, jongseong)
        if (syllable.layoutType === activeLayoutType) {
          return syllable
        }
      }
    }

    const firstChar = inputText.trim()[0]
    if (firstChar) {
      const syllable = decomposeSyllable(firstChar, choseong, jungseong, jongseong)
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
    return decomposeSyllable(fallbackChar, choseong, jungseong, jongseong)
  }, [inputText, selectedCharIndex, activeLayoutType, editingJamoType, editingJamoChar, choseong, jungseong, jongseong])

  // === 자모 편집 서브모드 ===
  const isJamoEditing = editingPartInLayout !== null

  // 편집 중인 파트의 자모 정보
  const editingJamoInfo = useMemo(() => {
    if (!editingPartInLayout) return null
    return partToJamoInfo(editingPartInLayout, testSyllable)
  }, [editingPartInLayout, testSyllable])

  // 편집 중인 파트의 박스 정보 (StrokeOverlay용)
  const editingBox = useMemo((): BoxConfig | null => {
    if (!editingPartInLayout) return null
    // JU_H/JU_V 파트의 경우 해당 박스를, 나머지는 직접 매핑
    const partKey = editingPartInLayout === 'JU_H' || editingPartInLayout === 'JU_V'
      ? editingPartInLayout
      : editingPartInLayout === 'CH' ? 'CH'
      : editingPartInLayout === 'JO' ? 'JO'
      : 'JU'
    const box = computedBoxes[partKey as keyof typeof computedBoxes]
    return box || null
  }, [editingPartInLayout, computedBoxes])

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

  // 편집 중인 자모의 패딩 데이터
  const editingJamoPadding = useMemo((): Padding | undefined => {
    if (!editingJamoInfo) return undefined
    const jamoMap = editingJamoInfo.type === 'choseong' ? choseong
      : editingJamoInfo.type === 'jungseong' ? jungseong
      : jongseong
    return jamoMap[editingJamoInfo.char]?.padding
  }, [editingJamoInfo, choseong, jungseong, jongseong])

  // 혼합중성 파트별 개별 패딩
  const editingHorizontalPadding = useMemo((): Padding | undefined => {
    if (!editingJamoInfo || editingJamoInfo.type !== 'jungseong') return undefined
    return jungseong[editingJamoInfo.char]?.horizontalPadding
  }, [editingJamoInfo, jungseong])

  const editingVerticalPadding = useMemo((): Padding | undefined => {
    if (!editingJamoInfo || editingJamoInfo.type !== 'jungseong') return undefined
    return jungseong[editingJamoInfo.char]?.verticalPadding
  }, [editingJamoInfo, jungseong])

  // 자모 편집 진입 시 draft strokes 로드 (히스토리 초기화)
  useEffect(() => {
    if (!editingJamoInfo) {
      resetDraftStrokes([])
      return
    }

    const jamoMap = editingJamoInfo.type === 'choseong' ? choseong
      : editingJamoInfo.type === 'jungseong' ? jungseong
      : jongseong
    const jamo = jamoMap[editingJamoInfo.char]

    if (jamo) {
      if (jamo.horizontalStrokes && jamo.verticalStrokes) {
        resetDraftStrokes([...jamo.horizontalStrokes, ...jamo.verticalStrokes])
      } else if (jamo.verticalStrokes) {
        resetDraftStrokes([...jamo.verticalStrokes])
      } else if (jamo.horizontalStrokes) {
        resetDraftStrokes([...jamo.horizontalStrokes])
      } else if (jamo.strokes) {
        resetDraftStrokes([...jamo.strokes])
      } else {
        resetDraftStrokes([])
      }
    } else {
      resetDraftStrokes([])
    }

    setSelectedStrokeId(null)
  }, [editingJamoInfo, choseong, jungseong, jongseong, setSelectedStrokeId])

  // Escape 키로 자모 편집 종료 + Ctrl+Z/Y로 undo/redo
  useEffect(() => {
    if (!isJamoEditing) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setPreviewLayoutType(null)
        setEditingPartInLayout(null)
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isJamoEditing, setEditingPartInLayout, undo, redo])

  // 파트 싱글클릭 → 즉시 자모 편집 진입
  const handlePartClick = useCallback((part: Part) => {
    const jamoInfo = partToJamoInfo(part, testSyllable)
    if (!jamoInfo) return
    setPreviewLayoutType(layoutType)
    setEditingPartInLayout(part)
    setEditingJamo(jamoInfo.type, jamoInfo.char)
  }, [testSyllable, layoutType, setEditingPartInLayout, setEditingJamo])

  // 자모 편집 변경 핸들러
  const handleStrokeChange = useCallback((strokeId: string, prop: string, value: number | string | undefined) => {
    setDraftStrokes((prev) =>
      prev.map((s) => {
        if (s.id !== strokeId) return s
        if (value === undefined) {
          // undefined → 해당 프로퍼티 제거 (linecap 오버라이드 해제 등)
          const updated = { ...s }
          delete (updated as Record<string, unknown>)[prop]
          return updated
        }
        return { ...s, [prop]: value }
      })
    )
  }, [])

  // 포인트 변경 핸들러
  const handlePointChange = useCallback((
    strokeId: string,
    pointIndex: number,
    field: 'x' | 'y' | 'handleIn' | 'handleOut',
    value: { x: number; y: number } | number
  ) => {
    setDraftStrokes(prev => prev.map(s => {
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
    }))
  }, [])

  // 두 획 합치기
  const handleMergeStrokes = useCallback((strokeIdA: string, strokeIdB: string) => {
    pushSnapshot()
    setDraftStrokes(prev => {
      const a = prev.find(s => s.id === strokeIdA)
      const b = prev.find(s => s.id === strokeIdB)
      if (!a || !b) return prev
      const merged = mergeStrokes(a, b)
      if (!merged) return prev
      return prev
        .map(s => s.id === strokeIdA ? merged : s)
        .filter(s => s.id !== strokeIdB)
    })
  }, [])

  // 획 분리
  const handleSplitStroke = useCallback((strokeId: string, pointIndex: number) => {
    pushSnapshot()
    setDraftStrokes(prev => {
      const stroke = prev.find(s => s.id === strokeId)
      if (!stroke) return prev
      const result = splitStroke(stroke, pointIndex)
      if (!result) return prev
      const [first, second] = result
      const idx = prev.findIndex(s => s.id === strokeId)
      const newStrokes = [...prev]
      newStrokes.splice(idx, 1, first, second)
      return newStrokes
    })
  }, [])

  // 포인트 곡선화 토글
  const handleToggleCurve = useCallback((strokeId: string, pointIndex: number) => {
    pushSnapshot()
    setDraftStrokes(prev => prev.map(s => {
      if (s.id !== strokeId) return s
      const pt = s.points[pointIndex]
      if (!pt) return s
      if (pt.handleIn || pt.handleOut) {
        return removeHandlesFromPoint(s, pointIndex)
      } else {
        return addHandlesToPoint(s, pointIndex)
      }
    }))
  }, [])

  // 종성 편집 시 초성 스타일 복사 정보
  // - 단일 종성: 동일 초성 1개
  // - 겹받침: 구성 자모 초성 2개
  const choseongStyleInfo = useMemo(() => {
    if (!editingJamoInfo || editingJamoInfo.type !== 'jongseong') return null
    const char = editingJamoInfo.char

    // 겹받침 확인
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

    // 단일 종성 → 동일 초성
    const singleJamo = choseong[char]
    if (singleJamo) {
      return { type: 'single' as const, jamo: singleJamo }
    }

    return null
  }, [editingJamoInfo, choseong])

  const handleApplyChoseongStyle = useCallback(() => {
    if (!choseongStyleInfo || !editingJamoInfo) return
    pushSnapshot()

    let newStrokes: typeof draftStrokes
    if (choseongStyleInfo.type === 'single') {
      // 단일 종성: 초성 획/패딩 그대로 복사
      const src = choseongStyleInfo.jamo
      newStrokes = src.strokes ? src.strokes.map(s => ({ ...s })) : []
      if (src.padding) {
        const pad = src.padding
        for (const side of ['top', 'bottom', 'left', 'right'] as const) {
          updateJamoPadding('jongseong', editingJamoInfo.char, side, pad[side])
        }
      }
    } else {
      // 겹받침: 두 구성 자모의 초성 획을 왼쪽/오른쪽에 배치
      // 첫 번째 자모 → 왼쪽 절반 (x: 0~0.5), 두 번째 → 오른쪽 (x: 0.5~1.0)
      const [firstJamo, secondJamo] = choseongStyleInfo.jamos
      const scaleStrokes = (strokes: typeof draftStrokes, xOffset: number, xScale: number) =>
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
      // 패딩 초기화 (겹받침은 좌우 배치가 중요하므로 좌우 패딩 0)
      for (const side of ['top', 'bottom', 'left', 'right'] as const) {
        updateJamoPadding('jongseong', editingJamoInfo.char, side, 0)
      }
    }

    // draft 업데이트 + 스토어에 즉시 저장 (연관 샘플·프리뷰 반영)
    resetDraftStrokes(newStrokes)
    const jamoMap = jongseong
    const jamo = jamoMap[editingJamoInfo.char]
    if (jamo) {
      updateJongseong(editingJamoInfo.char, { ...jamo, strokes: newStrokes })
    }
  }, [choseongStyleInfo, editingJamoInfo, pushSnapshot, resetDraftStrokes, updateJamoPadding, jongseong, updateJongseong])

  // 자모 편집 저장
  const handleJamoSave = useCallback(() => {
    if (!editingJamoInfo) return
    const jamoMap = editingJamoInfo.type === 'choseong' ? choseong
      : editingJamoInfo.type === 'jungseong' ? jungseong
      : jongseong
    const jamo = jamoMap[editingJamoInfo.char]
    if (!jamo) return

    const verticalJungseong = ['ㅏ', 'ㅑ', 'ㅓ', 'ㅕ', 'ㅣ', 'ㅐ', 'ㅒ', 'ㅔ', 'ㅖ']
    const horizontalJungseong = ['ㅗ', 'ㅛ', 'ㅜ', 'ㅠ', 'ㅡ']
    const isMixed = editingJamoInfo.type === 'jungseong'
      && !verticalJungseong.includes(editingJamoInfo.char)
      && !horizontalJungseong.includes(editingJamoInfo.char)

    let updatedJamo: JamoData
    if (isMixed && jamo.horizontalStrokes && jamo.verticalStrokes) {
      const horizontalStrokeIds = new Set(jamo.horizontalStrokes.map(s => s.id))
      const horizontalStrokes = draftStrokes.filter(s => horizontalStrokeIds.has(s.id))
      const verticalStrokes = draftStrokes.filter(s => !horizontalStrokeIds.has(s.id))
      updatedJamo = { ...jamo, horizontalStrokes, verticalStrokes }
    } else {
      updatedJamo = { ...jamo, strokes: draftStrokes }
    }

    switch (editingJamoInfo.type) {
      case 'choseong': updateChoseong(editingJamoInfo.char, updatedJamo); break
      case 'jungseong': updateJungseong(editingJamoInfo.char, updatedJamo); break
      case 'jongseong': updateJongseong(editingJamoInfo.char, updatedJamo); break
    }
  }, [editingJamoInfo, draftStrokes, choseong, jungseong, jongseong, updateChoseong, updateJungseong, updateJongseong])

  // 자모 편집 초기화 (히스토리 리셋)
  const handleJamoReset = useCallback(() => {
    if (!editingJamoInfo) return
    const jamoMap = editingJamoInfo.type === 'choseong' ? choseong
      : editingJamoInfo.type === 'jungseong' ? jungseong
      : jongseong
    const jamo = jamoMap[editingJamoInfo.char]
    if (!jamo) return

    if (jamo.horizontalStrokes && jamo.verticalStrokes) {
      resetDraftStrokes([...jamo.horizontalStrokes, ...jamo.verticalStrokes])
    } else if (jamo.verticalStrokes) {
      resetDraftStrokes([...jamo.verticalStrokes])
    } else if (jamo.horizontalStrokes) {
      resetDraftStrokes([...jamo.horizontalStrokes])
    } else if (jamo.strokes) {
      resetDraftStrokes([...jamo.strokes])
    }
  }, [editingJamoInfo, choseong, jungseong, jongseong, resetDraftStrokes])

  // 자모 편집 모드에서 SvgRenderer용 partStyles 계산
  // 편집 중인 파트는 hidden (StrokeOverlay가 대신 렌더링), 나머지는 어둡게
  const partStyles = useMemo((): Partial<Record<Part, PartStyle>> | undefined => {
    if (!isJamoEditing || !editingPartInLayout) return undefined
    const styles: Partial<Record<Part, PartStyle>> = {}
    const allParts: Part[] = ['CH', 'JU', 'JU_H', 'JU_V', 'JO']
    for (const part of allParts) {
      const isEditingPart = part === editingPartInLayout ||
        (editingPartInLayout === 'JU' && (part === 'JU_H' || part === 'JU_V')) ||
        ((editingPartInLayout === 'JU_H' || editingPartInLayout === 'JU_V') && (part === 'JU_H' || part === 'JU_V'))

      if (isEditingPart) {
        // 편집 중 파트: SvgRenderer에서 숨김 (StrokeOverlay가 렌더링)
        styles[part] = { hidden: true }
      } else {
        // 비편집 파트: 어둡게
        styles[part] = { fillColor: '#555', opacity: 0.25 }
      }
    }
    return styles
  }, [isJamoEditing, editingPartInLayout])

  // 자모 편집 시 draftStrokes를 반영한 테스트 음절 (미리보기용)
  const editingSyllable = useMemo((): DecomposedSyllable | null => {
    if (!isJamoEditing || !editingJamoInfo) return null

    // testSyllable을 기반으로 편집 중인 파트의 strokes만 교체
    const syllable = { ...testSyllable }

    if (editingJamoInfo.type === 'choseong' && syllable.choseong) {
      syllable.choseong = { ...syllable.choseong, strokes: draftStrokes }
    } else if (editingJamoInfo.type === 'jungseong' && syllable.jungseong) {
      const jamo = jungseong[editingJamoInfo.char]
      if (jamo?.horizontalStrokes && jamo?.verticalStrokes) {
        const hIds = new Set(jamo.horizontalStrokes.map(s => s.id))
        syllable.jungseong = {
          ...syllable.jungseong,
          horizontalStrokes: draftStrokes.filter(s => hIds.has(s.id)),
          verticalStrokes: draftStrokes.filter(s => !hIds.has(s.id)),
        }
      } else {
        syllable.jungseong = { ...syllable.jungseong, strokes: draftStrokes }
      }
    } else if (editingJamoInfo.type === 'jongseong' && syllable.jongseong) {
      syllable.jongseong = { ...syllable.jongseong, strokes: draftStrokes }
    }

    return syllable
  }, [isJamoEditing, editingJamoInfo, testSyllable, draftStrokes, jungseong])

  // === 레이아웃 편집 모드 핸들러 ===
  const handleSave = () => {
    console.log('\n현재 LayoutSchema:\n')
    console.log(JSON.stringify(schema, null, 2))
    const boxes = getCalculatedBoxes(layoutType)
    console.log('\n계산된 BoxConfig:\n')
    console.log(JSON.stringify(boxes, null, 2))
    alert('레이아웃 설정이 저장되었습니다!\n(LocalStorage에 자동 저장됨)')
  }

  const handleReset = () => {
    if (confirm(`'${layoutType}' 레이아웃을 기본값으로 되돌리시겠습니까?`)) {
      resetLayoutSchema(layoutType)
    }
  }

  const handleExportPresets = async () => {
    const json = exportSchemas()
    const ok = await copyJsonToClipboard(json)
    if (ok) {
      alert('JSON이 클립보드에 복사되었습니다.\n이 데이터를 basePresets.json 파일 전체에 붙여넣으세요.\n\n⚠️ localStorage에서 직접 복사하면 포맷이 달라 에러납니다.\n반드시 이 버튼으로 추출한 데이터를 사용하세요.\n\n경로: /Users/hanim/Documents/GitHub/new-font-maker/src/data/basePresets.json')
    } else {
      alert('클립보드 복사에 실패했습니다.')
    }
  }

  const handleExportJamos = async () => {
    const json = exportJamos()
    const ok = await copyJsonToClipboard(json)
    if (ok) {
      alert('JSON이 클립보드에 복사되었습니다.\n이 데이터를 baseJamos.json 파일 전체에 붙여넣으세요.\n\n⚠️ localStorage에서 직접 복사하면 포맷이 달라 에러납니다.\n반드시 이 버튼으로 추출한 데이터를 사용하세요.\n\n경로: /Users/hanim/Documents/GitHub/new-font-maker/src/data/baseJamos.json')
    } else {
      alert('클립보드 복사에 실패했습니다.')
    }
  }

  const handleResetAll = () => {
    if (confirm('모든 레이아웃을 기본값으로 되돌리시겠습니까?\n저장된 작업이 모두 사라집니다.')) {
      resetToBasePresets()
    }
  }

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

  // 미리보기에 사용할 음절 (자모 편집 시 draft 반영, 아니면 testSyllable)
  const displaySyllable = editingSyllable || testSyllable

  // 패딩 오버라이드 핸들러
  const handlePaddingOverrideChange = useCallback((side: keyof Padding, val: number) => {
    setPaddingOverride(layoutType, side, val)
  }, [layoutType, setPaddingOverride])

  // 3컬럼 데스크톱 레이아웃
  return (
    <div className="h-full overflow-hidden flex">
      {/* 좌측: 레이아웃 캔버스 */}
      <div className="flex-[2] min-w-0 overflow-y-auto border-r border-border-subtle">
        <LayoutCanvasColumn
          layoutType={layoutType}
          displaySyllable={displaySyllable}
          schemaWithPadding={schemaWithPadding}
          effectiveStyle={effectiveStyle}
          computedBoxes={computedBoxes}
          schema={schema}
          effectivePadding={effectivePadding}
          hasPaddingOverride={hasPaddingOverride(layoutType)}
          isJamoEditing={isJamoEditing}
          editingPartInLayout={editingPartInLayout}
          editingJamoInfo={editingJamoInfo}
          previewLayoutType={previewLayoutType}
          activeLayoutType={activeLayoutType}
          editingJamoType={editingJamoType}
          editingJamoChar={editingJamoChar}
          onPartClick={handlePartClick}
          onSplitChange={(index, value) => updateSplit(layoutType, index, value)}
          onPaddingOverrideChange={handlePaddingOverrideChange}
          onPreviewLayoutTypeChange={(lt) => setPreviewLayoutType(lt)}
        />
      </div>

      {/* 중앙: 자모 획 캔버스 */}
      <div className="flex-[3] min-w-0 overflow-y-auto border-r border-border-subtle">
        <JamoCanvasColumn
          displaySyllable={displaySyllable}
          schemaWithPadding={schemaWithPadding}
          effectiveStyle={effectiveStyle}
          partStyles={partStyles}
          isJamoEditing={isJamoEditing}
          draftStrokes={draftStrokes}
          editingBox={editingBox}
          editingJamoInfo={editingJamoInfo}
          mixedJungseongData={mixedJungseongData}
          editingJamoPadding={editingJamoPadding}
          editingHorizontalPadding={editingHorizontalPadding}
          editingVerticalPadding={editingVerticalPadding}
          selectedStrokeId={selectedStrokeId}
          globalStyleRaw={globalStyleRaw}
          onStrokeChange={handleStrokeChange}
          onPointChange={handlePointChange}
          onDragStart={pushSnapshot}
          onJamoPaddingChange={(type, char, side, val) => updateJamoPadding(type, char, side, val)}
          onMixedJamoPaddingChange={(char, part, side, val) => updateMixedJamoPadding(char, part, side, val)}
        />
      </div>

      {/* 우측: 컨트롤러 */}
      <div className="w-[280px] shrink-0 overflow-y-auto">
        <JamoControlsColumn
          isJamoEditing={isJamoEditing}
          editingJamoInfo={editingJamoInfo}
          draftStrokes={draftStrokes}
          editingBox={editingBox}
          choseongStyleInfo={choseongStyleInfo}
          onStrokeChange={handleStrokeChange}
          onPointChange={handlePointChange}
          onMergeStrokes={handleMergeStrokes}
          onSplitStroke={handleSplitStroke}
          onToggleCurve={handleToggleCurve}
          onUndo={undo}
          onRedo={redo}
          canUndo={canUndo}
          canRedo={canRedo}
          onJamoSave={handleJamoSave}
          onJamoReset={handleJamoReset}
          onApplyChoseongStyle={handleApplyChoseongStyle}
          onLayoutSave={handleSave}
          onLayoutReset={handleReset}
          onExportPresets={handleExportPresets}
          onExportJamos={handleExportJamos}
          onResetAll={handleResetAll}
        />
      </div>
    </div>
  )
}
