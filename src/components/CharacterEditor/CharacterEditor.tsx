import { useState, useEffect, useMemo } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { CHOSEONG_MAP, JUNGSEONG_MAP, JONGSEONG_MAP } from '../../data/Hangul'
import { JamoSelector } from './JamoSelector'
import { CharacterPreview } from './CharacterPreview'
import { StrokeList } from './StrokeList'
import { StrokeEditor } from './StrokeEditor'
import { StrokeInspector } from './StrokeInspector'
import type { StrokeDataV2, JamoData, BoxConfig } from '../../types'
import { mergeStrokes, splitStroke, addHandlesToPoint, removeHandlesFromPoint } from '../../utils/strokeEditUtils'
import { Button } from '@/components/ui/button'

function getJamoMap(type: 'choseong' | 'jungseong' | 'jongseong'): Record<string, JamoData> {
  switch (type) {
    case 'choseong':
      return CHOSEONG_MAP
    case 'jungseong':
      return JUNGSEONG_MAP
    case 'jongseong':
      return JONGSEONG_MAP
  }
}

function generateStrokeCode(strokes: StrokeDataV2[], char: string, type: string): string {
  const formatStroke = (s: StrokeDataV2) => {
    const pointsStr = JSON.stringify(s.points)
    const labelStr = s.label ? `, label: '${s.label}'` : ''
    return `      { id: '${s.id}', points: ${pointsStr}, closed: ${s.closed}, thickness: ${s.thickness}${labelStr} },`
  }

  // 혼합 중성인지 확인
  const verticalJungseong = ['ㅏ', 'ㅑ', 'ㅓ', 'ㅕ', 'ㅣ', 'ㅐ', 'ㅒ', 'ㅔ', 'ㅖ']
  const horizontalJungseong = ['ㅗ', 'ㅛ', 'ㅜ', 'ㅠ', 'ㅡ']
  const isMixed = type === 'jungseong' && !verticalJungseong.includes(char) && !horizontalJungseong.includes(char)

  if (isMixed) {
    // 혼합 중성의 경우, 원본 데이터에서 horizontalStrokes와 verticalStrokes에 속하는 획 ID 확인
    const jamoMap = getJamoMap('jungseong')
    const originalJamo = jamoMap[char]

    if (originalJamo?.horizontalStrokes && originalJamo?.verticalStrokes) {
      // 원본의 horizontalStrokes와 verticalStrokes에 속하는 획 ID 수집
      const horizontalStrokeIds = new Set(originalJamo.horizontalStrokes.map(s => s.id))
      const verticalStrokeIds = new Set(originalJamo.verticalStrokes.map(s => s.id))

      // 편집된 strokes를 horizontalStrokes와 verticalStrokes로 분리
      const horizontalStrokes = strokes.filter(s => horizontalStrokeIds.has(s.id))
      const verticalStrokes = strokes.filter(s => verticalStrokeIds.has(s.id))

      const horizontalLines = horizontalStrokes.map(formatStroke).join('\n')
      const verticalLines = verticalStrokes.map(formatStroke).join('\n')

      return `  '${char}': {
    char: '${char}',
    type: '${type}',
    // 혼합중성: 가로획 + 세로획
    horizontalStrokes: [
${horizontalLines}
    ],
    verticalStrokes: [
${verticalLines}
    ],
  },`
    }
  }

  // 일반 중성, 초성, 종성의 경우 기존 형식
  const strokeLines = strokes.map(formatStroke).join('\n')

  return `  '${char}': {
    char: '${char}',
    type: '${type}',
    strokes: [
${strokeLines}
    ],
  },`
}

export function CharacterEditor() {
  const { editingJamoType, editingJamoChar, setEditingJamo, setSelectedStrokeId } = useUIStore()
  const { layoutConfigs } = useLayoutStore()

  // Draft state for stroke edits
  const [draftStrokes, setDraftStrokes] = useState<StrokeDataV2[]>([])

  // 편집 중인 자모의 박스 정보 계산 (비율 + 위치)
  // 혼합 중성의 경우 JU_H와 JU_V 박스 정보도 함께 반환
  const jamoBoxInfo = useMemo(() => {
    if (!editingJamoType || !editingJamoChar) return { x: 0, y: 0, width: 1, height: 1, juH: undefined, juV: undefined }

    // 중성의 경우, 실제 사용되는 레이아웃 타입을 정확히 찾아야 함
    if (editingJamoType === 'jungseong') {
      const jamoMap = getJamoMap('jungseong')
      const jamo = jamoMap[editingJamoChar]
      if (!jamo) return { x: 0, y: 0, width: 1, height: 1, juH: undefined, juV: undefined }

      // 중성 타입 분류
      const verticalJungseong = ['ㅏ', 'ㅑ', 'ㅓ', 'ㅕ', 'ㅣ', 'ㅐ', 'ㅒ', 'ㅔ', 'ㅖ']
      const horizontalJungseong = ['ㅗ', 'ㅛ', 'ㅜ', 'ㅠ', 'ㅡ']
      const isVertical = verticalJungseong.includes(editingJamoChar)
      const isHorizontal = horizontalJungseong.includes(editingJamoChar)
      const isMixed = !isVertical && !isHorizontal

      // 혼합 중성의 경우, horizontalStrokes와 verticalStrokes가 분리되어 있음
      // 편집 시에는 각 획을 원래 박스 위치에 맞게 표시해야 함
      if (isMixed) {
        // 혼합 중성은 JU_H와 JU_V를 모두 사용
        const mixedLayoutTypes = [
          'jungseong-mixed-only',
          'choseong-jungseong-mixed',
          'choseong-jungseong-mixed-jongseong'
        ]

        for (const layoutType of mixedLayoutTypes) {
          const layoutConfig = layoutConfigs[layoutType as keyof typeof layoutConfigs]
          if (layoutConfig) {
            // 혼합 중성의 경우, JU_H와 JU_V가 모두 있으면 두 박스 정보를 모두 반환
            if (layoutConfig.boxes.JU_H && layoutConfig.boxes.JU_V) {
              const juH = layoutConfig.boxes.JU_H
              const juV = layoutConfig.boxes.JU_V
              const minX = Math.min(juH.x, juV.x)
              const minY = Math.min(juH.y, juV.y)
              const maxX = Math.max(juH.x + juH.width, juV.x + juV.width)
              const maxY = Math.max(juH.y + juH.height, juV.y + juV.height)
              const combinedWidth = maxX - minX
              const combinedHeight = maxY - minY
              return {
                x: minX,
                y: minY,
                width: combinedWidth,
                height: combinedHeight,
                juH: juH,
                juV: juV
              }
            } else if (layoutConfig.boxes.JU) {
              // JU 박스가 있으면 사용
              const ju = layoutConfig.boxes.JU
              return { x: ju.x, y: ju.y, width: ju.width, height: ju.height, juH: undefined, juV: undefined }
            }
          }
        }
      } else if (isVertical) {
        // 세로 중성: JU_V 또는 JU 사용
        const verticalLayoutTypes = [
          'jungseong-vertical-only',
          'choseong-jungseong-vertical',
          'choseong-jungseong-vertical-jongseong'
        ]

        for (const layoutType of verticalLayoutTypes) {
          const layoutConfig = layoutConfigs[layoutType as keyof typeof layoutConfigs]
          if (layoutConfig) {
            if (layoutConfig.boxes.JU_V) {
              const juV = layoutConfig.boxes.JU_V
              return { x: juV.x, y: juV.y, width: juV.width, height: juV.height, juH: undefined, juV: undefined }
            } else if (layoutConfig.boxes.JU) {
              const ju = layoutConfig.boxes.JU
              return { x: ju.x, y: ju.y, width: ju.width, height: ju.height, juH: undefined, juV: undefined }
            }
          }
        }
      } else if (isHorizontal) {
        // 가로 중성: JU_H 또는 JU 사용
        const horizontalLayoutTypes = [
          'jungseong-horizontal-only',
          'choseong-jungseong-horizontal',
          'choseong-jungseong-horizontal-jongseong'
        ]

        for (const layoutType of horizontalLayoutTypes) {
          const layoutConfig = layoutConfigs[layoutType as keyof typeof layoutConfigs]
          if (layoutConfig) {
            if (layoutConfig.boxes.JU_H) {
              const juH = layoutConfig.boxes.JU_H
              return { x: juH.x, y: juH.y, width: juH.width, height: juH.height, juH: undefined, juV: undefined }
            } else if (layoutConfig.boxes.JU) {
              const ju = layoutConfig.boxes.JU
              return { x: ju.x, y: ju.y, width: ju.width, height: ju.height, juH: undefined, juV: undefined }
            }
          }
        }
      }
    }

    // 초성, 종성의 경우 기존 로직 사용
    const relevantLayoutTypes = Object.keys(layoutConfigs).filter((layoutType) => {
      if (editingJamoType === 'choseong') {
        return layoutType.includes('choseong')
      } else if (editingJamoType === 'jongseong') {
        return layoutType.includes('jongseong')
      }
      return false
    })

    for (const layoutType of relevantLayoutTypes) {
      const layoutConfig = layoutConfigs[layoutType as keyof typeof layoutConfigs]
      let box: BoxConfig | undefined

      if (editingJamoType === 'choseong') {
        box = layoutConfig.boxes.CH
      } else if (editingJamoType === 'jongseong') {
        box = layoutConfig.boxes.JO
      }

      if (box) {
        return { x: box.x, y: box.y, width: box.width, height: box.height, juH: undefined, juV: undefined }
      }
    }

    return { x: 0, y: 0, width: 1, height: 1, juH: undefined, juV: undefined }
  }, [editingJamoType, editingJamoChar, layoutConfigs])

  // 자모 선택 시 획 데이터 로드
  useEffect(() => {
    if (editingJamoType && editingJamoChar) {
      const jamoMap = getJamoMap(editingJamoType)
      const jamo = jamoMap[editingJamoChar]
      if (jamo) {
        // 혼합 중성의 경우 horizontalStrokes와 verticalStrokes를 합쳐서 사용
        if (jamo.horizontalStrokes && jamo.verticalStrokes) {
          setDraftStrokes([...jamo.horizontalStrokes, ...jamo.verticalStrokes])
        } else if (jamo.verticalStrokes) {
          // verticalStrokes만 있는 경우
          setDraftStrokes([...jamo.verticalStrokes])
        } else if (jamo.horizontalStrokes) {
          // horizontalStrokes만 있는 경우
          setDraftStrokes([...jamo.horizontalStrokes])
        } else if (jamo.strokes) {
          setDraftStrokes([...jamo.strokes])
        } else {
          setDraftStrokes([])
        }
      } else {
        setDraftStrokes([])
      }
      // 새 자모 선택 시 획 선택 초기화
      setSelectedStrokeId(null)
    } else {
      setDraftStrokes([])
    }
  }, [editingJamoType, editingJamoChar, setSelectedStrokeId])

  const handleStrokeChange = (strokeId: string, prop: string, value: number | string | undefined) => {
    setDraftStrokes((prev) =>
      prev.map((s) => {
        if (s.id !== strokeId) return s
        if (value === undefined) {
          const updated = { ...s }
          delete (updated as Record<string, unknown>)[prop]
          return updated
        }
        return { ...s, [prop]: value }
      })
    )
  }

  const handlePointChange = (
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
  }

  // 두 획 합치기
  const handleMergeStrokes = (strokeIdA: string, strokeIdB: string) => {
    setDraftStrokes(prev => {
      const a = prev.find(s => s.id === strokeIdA)
      const b = prev.find(s => s.id === strokeIdB)
      if (!a || !b) return prev
      const merged = mergeStrokes(a, b)
      if (!merged) return prev
      // 합쳐진 stroke로 교체, 두 번째 stroke 제거
      return prev
        .map(s => s.id === strokeIdA ? merged : s)
        .filter(s => s.id !== strokeIdB)
    })
  }

  // 획 분리
  const handleSplitStroke = (strokeId: string, pointIndex: number) => {
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
  }

  // 포인트 곡선화
  const handleToggleCurve = (strokeId: string, pointIndex: number) => {
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
  }

  const handleSave = () => {
    if (!editingJamoChar || !editingJamoType) return

    const code = generateStrokeCode(draftStrokes, editingJamoChar, editingJamoType)
    console.log('\n📋 Hangul.ts에 붙여넣기용:\n')
    console.log(`// Replace the entry for '${editingJamoChar}' in ${editingJamoType.toUpperCase()}_MAP:\n`)
    console.log(code)

    const confirmed = confirm(
      `이 자모를 사용하는 모든 글자가 변경됩니다.\n\n획 데이터가 콘솔에 출력되었습니다.\nHangul.ts 파일에서 '${editingJamoChar}'의 항목을 교체해주세요.`
    )

    if (confirmed) {
      alert('콘솔에서 코드를 복사하여 Hangul.ts에 붙여넣은 후 페이지를 새로고침하세요.')
    }
  }

  const handleReset = () => {
    if (editingJamoType && editingJamoChar) {
      const jamoMap = getJamoMap(editingJamoType)
      const jamo = jamoMap[editingJamoChar]
      if (jamo) {
        // 혼합 중성의 경우 horizontalStrokes와 verticalStrokes를 합쳐서 사용
        if (jamo.horizontalStrokes && jamo.verticalStrokes) {
          setDraftStrokes([...jamo.horizontalStrokes, ...jamo.verticalStrokes])
        } else if (jamo.verticalStrokes) {
          // verticalStrokes만 있는 경우
          setDraftStrokes([...jamo.verticalStrokes])
        } else if (jamo.horizontalStrokes) {
          // horizontalStrokes만 있는 경우
          setDraftStrokes([...jamo.horizontalStrokes])
        } else if (jamo.strokes) {
          setDraftStrokes([...jamo.strokes])
        }
      }
    }
  }

  const handleCancel = () => {
    setEditingJamo(null, null)
    setSelectedStrokeId(null)
  }

  return (
    <div className="min-h-full p-4 bg-[#0f0f0f] flex flex-col gap-6">
      {/* 헤더 */}
      <div className="pb-4 border-b border-border">
        <h2 className="text-xl font-semibold text-foreground mb-2 font-sans">문자 편집</h2>
        {editingJamoChar && (
          <p className="text-sm text-muted">
            선택된 자모: {editingJamoChar} ({editingJamoType})
          </p>
        )}
      </div>

      {/* 자모 선택기 */}
      <JamoSelector
        selectedType={editingJamoType}
        selectedChar={editingJamoChar}
        onSelect={setEditingJamo}
      />

      {/* 자모가 선택된 경우에만 편집 UI 표시 */}
      {editingJamoChar && draftStrokes.length > 0 ? (
        <>
          {/* 3단 레이아웃 */}
          <div className="flex flex-col gap-4">
            {/* 좌측: 획 목록 */}
            <div className="flex flex-col gap-3 order-none">
              <StrokeList strokes={draftStrokes} />
            </div>

            {/* 중앙: 큰 미리보기 + 키보드 힌트 */}
            <div className="flex flex-col items-center gap-4 order-1">
              <CharacterPreview
                jamoChar={editingJamoChar}
                strokes={draftStrokes}
                boxInfo={jamoBoxInfo}
                jamoType={editingJamoType || undefined}
                onPointChange={handlePointChange}
                onStrokeChange={handleStrokeChange}
              />
              <p className="text-xs text-muted text-center py-2 px-4 bg-surface-2 rounded border border-border max-w-[400px]">
                드래그: 획 이동 | 핸들 드래그: 크기 조절 | 방향키: 이동 | Shift+방향키: 크기 | R: 회전
              </p>
            </div>

            {/* 우측: Stroke Inspector */}
            <div className="flex flex-col gap-3 order-2">
              <StrokeInspector
                strokes={draftStrokes}
                onChange={handleStrokeChange}
                onPointChange={handlePointChange}
                onMergeStrokes={handleMergeStrokes}
                onSplitStroke={handleSplitStroke}
                onToggleCurve={handleToggleCurve}
              />

            </div>
          </div>

          {/* 키보드 컨트롤 (UI 없음) */}
          <StrokeEditor strokes={draftStrokes} onChange={handleStrokeChange} onPointChange={handlePointChange} boxInfo={jamoBoxInfo} />

          {/* 버튼 그룹 */}
          <div className="flex gap-2 pt-4 border-t border-border">
            <Button variant="default" className="flex-1" onClick={handleReset}>
              초기화
            </Button>
            <Button variant="outline" className="flex-1" onClick={handleCancel}>
              취소
            </Button>
            <Button variant="primary" className="flex-1" onClick={handleSave}>
              저장
            </Button>
          </div>
        </>
      ) : editingJamoChar ? (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-8">
          <p>이 자모에 획 데이터가 없습니다</p>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center min-h-[300px] text-center p-8">
          <div className="text-5xl mb-4 opacity-60">✏️</div>
          <p className="text-base text-text-dim-5 leading-relaxed">편집할 자모를 선택해주세요</p>
        </div>
      )}
    </div>
  )
}
