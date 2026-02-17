import { useState, useEffect, useMemo, useRef, useCallback } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useJamoStore } from '../../stores/jamoStore'
import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import { SplitEditor } from './SplitEditor'
import { RelatedSamplesPanel } from './RelatedSamplesPanel'
import { StrokeList } from '../CharacterEditor/StrokeList'
import { StrokeInspector } from '../CharacterEditor/StrokeInspector'
import { StrokeEditor } from '../CharacterEditor/StrokeEditor'
import { StrokeOverlay } from '../CharacterEditor/StrokeOverlay'
import { LayoutContextThumbnails } from '../CharacterEditor/LayoutContextThumbnails'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import type { PartStyle } from '../../renderers/SvgRenderer'
import { decomposeSyllable } from '../../utils/hangulUtils'
import { calculateBoxes } from '../../utils/layoutCalculator'
import { copyJsonToClipboard } from '../../utils/storage'
import { Button } from '@/components/ui/button'
import type { LayoutType, Part, StrokeData, DecomposedSyllable, BoxConfig, JamoData } from '../../types'

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
    setSelectedStrokeId,
  } = useUIStore()
  const {
    getLayoutSchema,
    getEffectivePadding,
    hasPaddingOverride,
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
  } = useJamoStore()
  const { getEffectiveStyle, style: globalStyleRaw } = useGlobalStyleStore()

  // SVG ref (StrokeOverlay에서 사용)
  const svgRef = useRef<SVGSVGElement>(null)

  // 파트 선택 상태 (레이아웃 편집 모드)
  const [selectedPart, setSelectedPart] = useState<Part | null>(null)

  // 자모 편집용 draft strokes
  const [draftStrokes, setDraftStrokes] = useState<StrokeData[]>([])

  const schema = getLayoutSchema(layoutType)
  const effectivePadding = getEffectivePadding(layoutType)
  const schemaWithPadding = useMemo(
    () => ({ ...schema, padding: effectivePadding }),
    [schema, effectivePadding]
  )
  const effectiveStyle = getEffectiveStyle(layoutType)

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
        if (syllable.layoutType === layoutType) {
          return syllable
        }
      }
    }

    const firstChar = inputText.trim()[0]
    if (firstChar) {
      const syllable = decomposeSyllable(firstChar, choseong, jungseong, jongseong)
      if (syllable.layoutType === layoutType) {
        return syllable
      }
    }

    const testChars: Record<string, string> = {
      'choseong-only': 'ㄱ',
      'jungseong-vertical-only': 'ㅣ',
      'jungseong-horizontal-only': 'ㅡ',
      'jungseong-mixed-only': 'ㅢ',
      'choseong-jungseong-vertical': '가',
      'choseong-jungseong-horizontal': '고',
      'choseong-jungseong-mixed': '괘',
      'choseong-jungseong-vertical-jongseong': '한',
      'choseong-jungseong-horizontal-jongseong': '공',
      'choseong-jungseong-mixed-jongseong': '궝',
    }

    return decomposeSyllable(testChars[layoutType] || '한', choseong, jungseong, jongseong)
  }, [inputText, selectedCharIndex, layoutType, choseong, jungseong, jongseong])

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

  // 자모 편집 진입 시 draft strokes 로드
  useEffect(() => {
    if (!editingJamoInfo) {
      setDraftStrokes([])
      return
    }

    const jamoMap = editingJamoInfo.type === 'choseong' ? choseong
      : editingJamoInfo.type === 'jungseong' ? jungseong
      : jongseong
    const jamo = jamoMap[editingJamoInfo.char]

    if (jamo) {
      if (jamo.horizontalStrokes && jamo.verticalStrokes) {
        setDraftStrokes([...jamo.horizontalStrokes, ...jamo.verticalStrokes])
      } else if (jamo.verticalStrokes) {
        setDraftStrokes([...jamo.verticalStrokes])
      } else if (jamo.horizontalStrokes) {
        setDraftStrokes([...jamo.horizontalStrokes])
      } else if (jamo.strokes) {
        setDraftStrokes([...jamo.strokes])
      } else {
        setDraftStrokes([])
      }
    } else {
      setDraftStrokes([])
    }

    setSelectedStrokeId(null)
  }, [editingJamoInfo, choseong, jungseong, jongseong, setSelectedStrokeId])

  // Escape 키로 자모 편집 종료
  useEffect(() => {
    if (!isJamoEditing) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        setEditingPartInLayout(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isJamoEditing, setEditingPartInLayout])

  // 더블클릭으로 자모 편집 진입
  const handlePartDoubleClick = useCallback((part: Part) => {
    const jamoInfo = partToJamoInfo(part, testSyllable)
    if (!jamoInfo) return
    setEditingPartInLayout(part)
    setEditingJamo(jamoInfo.type, jamoInfo.char)
  }, [testSyllable, setEditingPartInLayout, setEditingJamo])

  // 자모 편집 변경 핸들러
  const handleStrokeChange = useCallback((strokeId: string, prop: string, value: number) => {
    setDraftStrokes((prev) =>
      prev.map((s) => (s.id === strokeId ? { ...s, [prop]: value } : s))
    )
  }, [])

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

  // 자모 편집 초기화
  const handleJamoReset = useCallback(() => {
    if (!editingJamoInfo) return
    const jamoMap = editingJamoInfo.type === 'choseong' ? choseong
      : editingJamoInfo.type === 'jungseong' ? jungseong
      : jongseong
    const jamo = jamoMap[editingJamoInfo.char]
    if (!jamo) return

    if (jamo.horizontalStrokes && jamo.verticalStrokes) {
      setDraftStrokes([...jamo.horizontalStrokes, ...jamo.verticalStrokes])
    } else if (jamo.verticalStrokes) {
      setDraftStrokes([...jamo.verticalStrokes])
    } else if (jamo.horizontalStrokes) {
      setDraftStrokes([...jamo.horizontalStrokes])
    } else if (jamo.strokes) {
      setDraftStrokes([...jamo.strokes])
    }
  }, [editingJamoInfo, choseong, jungseong, jongseong])

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

  const handleExport = async () => {
    const json = exportSchemas()
    const ok = await copyJsonToClipboard(json)
    if (ok) {
      alert('JSON이 클립보드에 복사되었습니다.\nsrc/data/basePresets.json에 붙여넣으세요.')
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

  // 미리보기 크기 (자모 편집 시 확대)
  const previewSize = isJamoEditing ? 300 : 200

  return (
    <div className="h-full overflow-y-auto flex flex-col">
      {/* 자모 편집 서브모드 헤더 */}
      {isJamoEditing && editingJamoInfo && (
        <div className="flex items-center gap-3 pb-3 border-b border-border-subtle">
          <Button
            variant="default"
            size="sm"
            onClick={() => setEditingPartInLayout(null)}
          >
            ← 레이아웃
          </Button>
          <span className="text-sm text-text-dim-2 font-medium">
            {editingJamoInfo.type === 'choseong' ? '초성' : editingJamoInfo.type === 'jungseong' ? '중성' : '종성'}
            {' '}
            <span className="text-lg font-bold text-text-primary">{editingJamoInfo.char}</span>
            {' '}
            <span className="text-text-dim-4">({editingPartInLayout})</span>
          </span>
        </div>
      )}

      {/* 레이아웃 편집 모드 버튼 영역 */}
      {!isJamoEditing && (
        <div className="flex gap-3 pb-4 border-b border-border-subtle">
          <Button variant="blue" className="flex-1" onClick={handleSave}>
            저장
          </Button>
          <Button variant="default" className="flex-1" onClick={handleReset}>
            되돌리기
          </Button>
          <Button variant="green" className="flex-1" onClick={handleExport}>
            JSON 내보내기
          </Button>
          <Button variant="danger" className="flex-1" onClick={handleResetAll}>
            전체 초기화
          </Button>
        </div>
      )}

      {/* 미리보기 + 편집 패널 (가로 배치) */}
      <div className="flex gap-4 mt-4 flex-1">
        {/* 미리보기 영역 */}
        <div className="shrink-0 p-4 bg-surface rounded-md border border-border-subtle">
          <h3 className="text-sm font-medium mb-3 text-text-dim-3 uppercase tracking-wider">
            미리보기
          </h3>

          {/* 자모 편집 시 LayoutContextThumbnails 표시 */}
          {isJamoEditing && editingJamoInfo && (
            <LayoutContextThumbnails
              jamoType={editingJamoInfo.type}
              jamoChar={editingJamoInfo.char}
              selectedContext={layoutType}
              onSelectContext={() => {
                // 현재는 layoutType이 고정, 향후 전환 기능 추가
              }}
            />
          )}

          <div className="flex justify-center p-3 bg-background rounded mb-2">
            <div className="relative inline-block" style={{ backgroundColor: '#1a1a1a' }}>
              {/* 0.025 스냅 그리드 */}
              <svg
                className="absolute inset-0 pointer-events-none z-0"
                width={previewSize}
                height={previewSize}
                viewBox="0 0 100 100"
              >
                {Array.from({ length: 39 }, (_, i) => {
                  const v = (i + 1) * 2.5
                  return (
                    <g key={`grid-${i}`}>
                      <line x1={v} y1={0} x2={v} y2={100} stroke="#333" strokeWidth={0.2} />
                      <line x1={0} y1={v} x2={100} y2={v} stroke="#333" strokeWidth={0.2} />
                    </g>
                  )
                })}
                {Array.from({ length: 9 }, (_, i) => {
                  const v = (i + 1) * 10
                  return (
                    <g key={`grid-major-${i}`}>
                      <line x1={v} y1={0} x2={v} y2={100} stroke="#444" strokeWidth={0.4} />
                      <line x1={0} y1={v} x2={100} y2={v} stroke="#444" strokeWidth={0.4} />
                    </g>
                  )
                })}
              </svg>

              {/* SvgRenderer (partStyles로 자모 편집 시 비편집 파트 어둡게) */}
              <SvgRenderer
                svgRef={svgRef}
                syllable={displaySyllable}
                schema={schemaWithPadding}
                size={previewSize}
                fillColor="#e5e5e5"
                backgroundColor="transparent"
                showDebugBoxes
                globalStyle={effectiveStyle}
                partStyles={partStyles}
              >
                {/* 자모 편집 모드: StrokeOverlay를 SvgRenderer children으로 전달 */}
                {isJamoEditing && editingBox && draftStrokes.length > 0 && (
                  <StrokeOverlay
                    strokes={draftStrokes}
                    box={mixedJungseongData?.juHBox || mixedJungseongData?.juVBox ? {
                      // 혼합중성: JU_H + JU_V 합산 박스
                      x: Math.min(mixedJungseongData.juHBox?.x ?? 1, mixedJungseongData.juVBox?.x ?? 1),
                      y: Math.min(mixedJungseongData.juHBox?.y ?? 1, mixedJungseongData.juVBox?.y ?? 1),
                      width: Math.max(
                        (mixedJungseongData.juHBox?.x ?? 0) + (mixedJungseongData.juHBox?.width ?? 0),
                        (mixedJungseongData.juVBox?.x ?? 0) + (mixedJungseongData.juVBox?.width ?? 0)
                      ) - Math.min(mixedJungseongData.juHBox?.x ?? 1, mixedJungseongData.juVBox?.x ?? 1),
                      height: Math.max(
                        (mixedJungseongData.juHBox?.y ?? 0) + (mixedJungseongData.juHBox?.height ?? 0),
                        (mixedJungseongData.juVBox?.y ?? 0) + (mixedJungseongData.juVBox?.height ?? 0)
                      ) - Math.min(mixedJungseongData.juHBox?.y ?? 1, mixedJungseongData.juVBox?.y ?? 1),
                    } : editingBox}
                    svgRef={svgRef}
                    viewBoxSize={100}
                    onStrokeChange={handleStrokeChange}
                    strokeColor="#e5e5e5"
                    isMixed={!!mixedJungseongData}
                    juHBox={mixedJungseongData?.juHBox}
                    juVBox={mixedJungseongData?.juVBox}
                    horizontalStrokeIds={mixedJungseongData?.horizontalStrokeIds}
                    verticalStrokeIds={mixedJungseongData?.verticalStrokeIds}
                    globalStyle={globalStyleRaw}
                  />
                )}
              </SvgRenderer>

              {/* 레이아웃 편집 모드: 패딩/기준선/파트 오버레이 */}
              {!isJamoEditing && (
                <>
                  {/* 패딩 오버라이드 시각화 */}
                  {hasPaddingOverride(layoutType) && (() => {
                    const p = effectivePadding
                    const hr = 1.0
                    return (
                      <>
                        <div
                          className="absolute left-0 right-0 bg-accent-orange/20 pointer-events-none z-[1]"
                          style={{ top: 0, height: `${(p.top / hr) * 100}%` }}
                        />
                        <div
                          className="absolute left-0 right-0 bottom-0 bg-accent-orange/20 pointer-events-none z-[1]"
                          style={{ height: `${(p.bottom / hr) * 100}%` }}
                        />
                        <div
                          className="absolute top-0 bottom-0 bg-accent-orange/20 pointer-events-none z-[1]"
                          style={{ left: 0, width: `${p.left * 100}%` }}
                        />
                        <div
                          className="absolute top-0 bottom-0 right-0 bg-accent-orange/20 pointer-events-none z-[1]"
                          style={{ width: `${p.right * 100}%` }}
                        />
                      </>
                    )
                  })()}

                  {/* 기준선 오버레이 */}
                  {(schema.splits || []).map((split, index) =>
                    split.axis === 'x' ? (
                      <div
                        key={`split-x-${index}`}
                        className="absolute top-0 bottom-0 w-0.5 bg-accent-red opacity-70 z-[2] pointer-events-none"
                        style={{ left: `${split.value * 100}%` }}
                      />
                    ) : (
                      <div
                        key={`split-y-${index}`}
                        className="absolute left-0 right-0 h-0.5 bg-accent-cyan opacity-70 z-[2] pointer-events-none"
                        style={{ top: `${split.value * 100}%` }}
                      />
                    )
                  )}

                  {/* 파트 클릭/더블클릭 오버레이 */}
                  {(Object.entries(computedBoxes) as [Part, { x: number; y: number; width: number; height: number }][]).map(
                    ([part, box]) => (
                      <button
                        key={`part-overlay-${part}`}
                        className={`absolute z-[3] border-2 transition-colors cursor-pointer rounded-sm ${
                          selectedPart === part
                            ? 'border-accent-yellow bg-accent-yellow/15'
                            : 'border-transparent hover:border-accent-yellow/50 hover:bg-accent-yellow/5'
                        }`}
                        style={{
                          left: `${box.x * 100}%`,
                          top: `${box.y * 100}%`,
                          width: `${box.width * 100}%`,
                          height: `${box.height * 100}%`,
                        }}
                        onClick={() => setSelectedPart(selectedPart === part ? null : part)}
                        onDoubleClick={() => handlePartDoubleClick(part)}
                        title={`${part} (더블클릭: 자모 편집)`}
                      >
                        {selectedPart === part && (
                          <span className="absolute top-0.5 left-1 text-[0.55rem] font-bold text-accent-yellow drop-shadow-[0_0_2px_rgba(0,0,0,0.8)]">
                            {part}
                          </span>
                        )}
                      </button>
                    )
                  )}
                </>
              )}
            </div>
          </div>

          {/* 연관 샘플 (미리보기 아래) */}
          <RelatedSamplesPanel
            editingType={isJamoEditing && editingJamoType ? editingJamoType : 'layout'}
            editingChar={isJamoEditing && editingJamoChar ? editingJamoChar : null}
            layoutType={layoutType}
            compact
          />
        </div>

        {/* 우측 패널: 레이아웃 설정 또는 자모 편집 도구 */}
        <div className="flex-1 min-w-0 overflow-y-auto">
          {isJamoEditing && editingJamoInfo ? (
            /* 자모 편집 도구 */
            <div className="flex flex-col gap-4">
              {/* 획 목록 */}
              <div className="bg-surface rounded-md border border-border-subtle p-4">
                <h3 className="text-sm font-medium mb-3 text-text-dim-3 uppercase tracking-wider">획 목록</h3>
                <StrokeList strokes={draftStrokes} />
              </div>

              {/* 속성 편집 */}
              <div className="bg-surface rounded-md border border-border-subtle p-4">
                <h3 className="text-sm font-medium mb-3 text-text-dim-3 uppercase tracking-wider">속성 편집</h3>
                <StrokeInspector strokes={draftStrokes} onChange={handleStrokeChange} />
              </div>

              {/* 키보드 기반 컨트롤 (UI 없음, 이벤트만 처리) */}
              <StrokeEditor
                strokes={draftStrokes}
                onChange={handleStrokeChange}
                boxInfo={editingBox ? { ...editingBox } : undefined}
              />

              {/* 저장/초기화 버튼 */}
              <div className="flex gap-3">
                <Button variant="default" className="flex-1" onClick={handleJamoReset}>
                  초기화
                </Button>
                <Button variant="blue" className="flex-1" onClick={handleJamoSave}>
                  저장
                </Button>
              </div>

              <p className="text-xs text-text-dim-5 text-center leading-relaxed">
                방향키: 이동 | Shift+방향키: 크기 | R: 회전 | Esc: 레이아웃으로 돌아가기
              </p>
            </div>
          ) : (
            /* 레이아웃 편집 도구 */
            <>
              <h3 className="text-sm font-medium mb-3 text-text-dim-3 uppercase tracking-wider">레이아웃 설정</h3>
              <SplitEditor layoutType={layoutType} selectedPart={selectedPart} />
              <p className="text-xs text-text-dim-5 mt-4 text-center leading-relaxed">
                파트 더블클릭으로 자모 편집 진입
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
