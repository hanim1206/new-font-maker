import { useState, useEffect, useMemo } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useJamoStore } from '../../stores/jamoStore'
import { CharacterPreview } from '../CharacterEditor/CharacterPreview'
import { StrokeList } from '../CharacterEditor/StrokeList'
import { StrokeEditor } from '../CharacterEditor/StrokeEditor'
import { StrokeInspector } from '../CharacterEditor/StrokeInspector'
import { LayoutContextThumbnails } from '../CharacterEditor/LayoutContextThumbnails'
import { LinkedSlotsPanel } from './LinkedSlotsPanel'
import { RelatedSamplesPanel } from './RelatedSamplesPanel'
import { copyJsonToClipboard } from '../../utils/storage'
import { classifyJungseong, getLayoutsForJamoType } from '../../utils/hangulUtils'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Slider } from '@/components/ui/slider'
import type { StrokeDataV2, JamoData, BoxConfig, LayoutType, Padding } from '../../types'

interface JamoEditorProps {
  jamoType: 'choseong' | 'jungseong' | 'jongseong'
  jamoChar: string
}

export function JamoEditor({ jamoType, jamoChar }: JamoEditorProps) {
  const { setSelectedStrokeId, selectedLayoutContext, setSelectedLayoutContext } = useUIStore()
  const { layoutConfigs } = useLayoutStore()
  const {
    choseong,
    jungseong,
    jongseong,
    updateChoseong,
    updateJungseong,
    updateJongseong,
    updateJamoPadding,
    resetJamoPadding,
    isModified,
    isJamoModified,
    exportJamos,
    resetToBaseJamos,
    _hydrated,
  } = useJamoStore()

  // Draft state for stroke edits
  const [draftStrokes, setDraftStrokes] = useState<StrokeDataV2[]>([])

  // 자모 맵 가져오기 (jamoStore에서)
  const jamoMap = useMemo(() => {
    switch (jamoType) {
      case 'choseong':
        return choseong
      case 'jungseong':
        return jungseong
      case 'jongseong':
        return jongseong
    }
  }, [jamoType, choseong, jungseong, jongseong])

  // 편집 중인 자모의 박스 정보 계산 (비율 + 위치)
  // selectedLayoutContext가 있으면 해당 레이아웃 박스 사용, 없으면 기본 첫 번째 매칭
  const jamoBoxInfo = useMemo(() => {
    const defaultBox = { x: 0, y: 0, width: 1, height: 1, juH: undefined as BoxConfig | undefined, juV: undefined as BoxConfig | undefined }
    if (!jamoType || !jamoChar) return defaultBox

    // 특정 레이아웃에서 자모 박스 추출하는 헬퍼
    const extractBoxFromLayout = (lt: LayoutType) => {
      const layoutConfig = layoutConfigs[lt as keyof typeof layoutConfigs]
      if (!layoutConfig) return null

      if (jamoType === 'choseong') {
        const box = layoutConfig.boxes.CH
        if (box) return { x: box.x, y: box.y, width: box.width, height: box.height, juH: undefined, juV: undefined }
      } else if (jamoType === 'jongseong') {
        const box = layoutConfig.boxes.JO
        if (box) return { x: box.x, y: box.y, width: box.width, height: box.height, juH: undefined, juV: undefined }
      } else if (jamoType === 'jungseong') {
        // 혼합중성: JU_H + JU_V 합산 박스
        if (layoutConfig.boxes.JU_H && layoutConfig.boxes.JU_V) {
          const juH = layoutConfig.boxes.JU_H
          const juV = layoutConfig.boxes.JU_V
          const minX = Math.min(juH.x, juV.x)
          const minY = Math.min(juH.y, juV.y)
          const maxX = Math.max(juH.x + juH.width, juV.x + juV.width)
          const maxY = Math.max(juH.y + juH.height, juV.y + juV.height)
          return { x: minX, y: minY, width: maxX - minX, height: maxY - minY, juH, juV }
        }
        // 일반 중성
        if (layoutConfig.boxes.JU) {
          const ju = layoutConfig.boxes.JU
          return { x: ju.x, y: ju.y, width: ju.width, height: ju.height, juH: undefined, juV: undefined }
        }
      }
      return null
    }

    // selectedLayoutContext가 있으면 해당 레이아웃 사용
    if (selectedLayoutContext) {
      const result = extractBoxFromLayout(selectedLayoutContext)
      if (result) return result
    }

    // 기본값: 첫 번째 매칭 레이아웃 사용
    const subType = jamoType === 'jungseong' ? classifyJungseong(jamoChar) : undefined
    const layouts = getLayoutsForJamoType(jamoType, subType)

    for (const lt of layouts) {
      const result = extractBoxFromLayout(lt)
      if (result) return result
    }

    return defaultBox
  }, [jamoType, jamoChar, layoutConfigs, selectedLayoutContext])

  // 자모가 변경될 때 획 데이터 로드
  useEffect(() => {
    const jamo = jamoMap[jamoChar]
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
  }, [jamoType, jamoChar, jamoMap, setSelectedStrokeId])

  const handleStrokeChange = (strokeId: string, prop: string, value: number) => {
    setDraftStrokes((prev) =>
      prev.map((s) => (s.id === strokeId ? { ...s, [prop]: value } : s))
    )
  }

  const handleSave = () => {
    // jamoStore에 저장 (자동으로 LocalStorage에 persist됨)
    const jamo = jamoMap[jamoChar]
    if (!jamo) return

    // 혼합 중성 처리
    const verticalJungseong = ['ㅏ', 'ㅑ', 'ㅓ', 'ㅕ', 'ㅣ', 'ㅐ', 'ㅒ', 'ㅔ', 'ㅖ']
    const horizontalJungseong = ['ㅗ', 'ㅛ', 'ㅜ', 'ㅠ', 'ㅡ']
    const isMixed = jamoType === 'jungseong' && !verticalJungseong.includes(jamoChar) && !horizontalJungseong.includes(jamoChar)

    let updatedJamo: JamoData

    if (isMixed && jamo.horizontalStrokes && jamo.verticalStrokes) {
      // 혼합 중성: horizontalStrokes와 verticalStrokes 분리
      const horizontalStrokeIds = new Set(jamo.horizontalStrokes.map(s => s.id))
      const horizontalStrokes = draftStrokes.filter(s => horizontalStrokeIds.has(s.id))
      const verticalStrokes = draftStrokes.filter(s => !horizontalStrokeIds.has(s.id))

      updatedJamo = {
        ...jamo,
        horizontalStrokes,
        verticalStrokes,
      }
    } else {
      // 일반 자모
      updatedJamo = {
        ...jamo,
        strokes: draftStrokes,
      }
    }

    // jamoStore 업데이트
    switch (jamoType) {
      case 'choseong':
        updateChoseong(jamoChar, updatedJamo)
        break
      case 'jungseong':
        updateJungseong(jamoChar, updatedJamo)
        break
      case 'jongseong':
        updateJongseong(jamoChar, updatedJamo)
        break
    }

    alert(`'${jamoChar}' 자모가 저장되었습니다.\n변경사항은 LocalStorage에 자동 저장됩니다.`)
  }

  const handleReset = () => {
    const jamo = jamoMap[jamoChar]
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

  // JSON 내보내기 핸들러
  const handleExport = async () => {
    const json = exportJamos()
    const ok = await copyJsonToClipboard(json)
    if (ok) {
      alert('JSON이 클립보드에 복사되었습니다.\n이 데이터를 baseJamos.json 파일 전체에 붙여넣으세요.\n\n⚠️ localStorage에서 직접 복사하면 포맷이 달라 에러납니다.\n반드시 이 버튼으로 추출한 데이터를 사용하세요.\n\n경로: /Users/hanim/Documents/GitHub/new-font-maker/src/data/baseJamos.json')
    } else {
      alert('클립보드 복사에 실패했습니다.')
    }
  }

  // 전체 초기화 핸들러
  const handleResetAll = () => {
    if (confirm('모든 자모를 기본값으로 되돌리시겠습니까?')) {
      resetToBaseJamos()
      alert('모든 자모가 초기화되었습니다.')
    }
  }

  // 변경 감지
  const modified = isModified()
  const currentJamoModified = isJamoModified(jamoType, jamoChar)

  // hydration 대기 중
  if (!_hydrated) {
    return (
      <div className="h-full flex flex-col overflow-y-auto">
        <p className="flex items-center justify-center h-[200px] text-text-dim-5 text-base">자모 데이터 로딩 중...</p>
      </div>
    )
  }

  if (draftStrokes.length === 0) {
    return (
      <div className="h-full flex flex-col overflow-y-auto">
        <p className="py-10 px-5 text-center text-text-dim-5">획 데이터를 불러올 수 없습니다.</p>
      </div>
    )
  }

  return (
    <div className="h-full flex flex-col overflow-y-auto">
      {/* 변경 감지 배지 (전체 수정됨) */}
      {modified && (
        <Badge variant="modified" className="flex items-center gap-2 px-3.5 py-2.5 text-sm mx-5 mt-4 w-fit">
          <span className="w-2 h-2 bg-accent-yellow rounded-full animate-pulse-dot" />
          수정됨 (baseJamos.json과 다름)
        </Badge>
      )}

      {/* 현재 자모 수정됨 표시 */}
      {currentJamoModified && (
        <Badge variant="info" className="block text-center text-xs py-1.5 px-3 mx-5 mt-2">
          현재 '{jamoChar}' 자모가 수정되었습니다
        </Badge>
      )}

      {/* 레이아웃 컨텍스트 썸네일 */}
      <LayoutContextThumbnails
        jamoType={jamoType}
        jamoChar={jamoChar}
        selectedContext={selectedLayoutContext}
        onSelectContext={setSelectedLayoutContext}
      />

      {/* 3단 레이아웃 */}
      <div className="grid grid-cols-[200px_1fr_250px] gap-4 p-5 min-h-[400px]">
        {/* 좌측: 획 목록 */}
        <div className="flex flex-col overflow-y-auto bg-surface rounded-md border border-border-subtle p-4">
          <h3 className="text-sm font-medium mb-3 text-text-dim-3 uppercase tracking-wider">획 목록</h3>
          <StrokeList strokes={draftStrokes} />
        </div>

        {/* 중앙: 큰 미리보기 + 키보드 힌트 */}
        <div className="flex flex-col items-center justify-center overflow-hidden bg-surface rounded-md border border-border-subtle p-4">
          <h3 className="text-sm font-medium mb-3 text-text-dim-3 uppercase tracking-wider">미리보기</h3>
          <CharacterPreview jamoChar={jamoChar} strokes={draftStrokes} boxInfo={jamoBoxInfo} jamoType={jamoType} jamoPadding={jamoMap[jamoChar]?.padding} />
          <p className="mt-4 text-xs text-text-dim-5 text-center leading-relaxed">
            방향키: 이동 | Shift+방향키: 크기 | R: 회전
          </p>
        </div>

        {/* 우측: Stroke Inspector */}
        <div className="flex flex-col overflow-y-auto bg-surface rounded-md border border-border-subtle p-4">
          <h3 className="text-sm font-medium mb-3 text-text-dim-3 uppercase tracking-wider">속성 편집</h3>
          <StrokeInspector strokes={draftStrokes} onChange={handleStrokeChange} />
        </div>
      </div>

      {/* 자모 패딩 슬라이더 */}
      <JamoPaddingSection
        jamoType={jamoType}
        jamoChar={jamoChar}
        padding={jamoMap[jamoChar]?.padding}
        onPaddingChange={(side, value) => updateJamoPadding(jamoType, jamoChar, side, value)}
        onReset={() => resetJamoPadding(jamoType, jamoChar)}
      />

      {/* 키보드 컨트롤 (UI 없음) */}
      <StrokeEditor strokes={draftStrokes} onChange={handleStrokeChange} boxInfo={jamoBoxInfo} />

      {/* 연관 슬롯 링크 */}
      <LinkedSlotsPanel
        jamoType={jamoType}
        jamoChar={jamoChar}
        onApplyToLinked={(linkedSlots) => {
          // 현재 draft strokes를 연관 슬롯에도 적용
          for (const slot of linkedSlots) {
            const targetJamo = slot.type === 'choseong' ? choseong[slot.char]
              : slot.type === 'jungseong' ? jungseong[slot.char]
              : jongseong[slot.char]
            if (!targetJamo) continue

            const updatedJamo: JamoData = { ...targetJamo, strokes: [...draftStrokes] }
            switch (slot.type) {
              case 'choseong': updateChoseong(slot.char, updatedJamo); break
              case 'jungseong': updateJungseong(slot.char, updatedJamo); break
              case 'jongseong': updateJongseong(slot.char, updatedJamo); break
            }
          }
          alert(`${linkedSlots.length}개 연관 슬롯에 적용되었습니다.`)
        }}
      />

      {/* 연관 샘플 미리보기 */}
      <div style={{ padding: '0 20px' }}>
        <RelatedSamplesPanel
          editingType={jamoType}
          editingChar={jamoChar}
          layoutType={null}
        />
      </div>

      {/* 버튼 그룹 */}
      <div className="flex gap-3 px-5 py-4 border-t border-border-subtle bg-background">
        <Button variant="default" className="flex-1" onClick={handleReset}>
          초기화
        </Button>
        <Button variant="blue" className="flex-1" onClick={handleSave}>
          저장
        </Button>
      </div>

      {/* 내보내기/전체 리셋 영역 */}
      <div className="flex gap-3 px-5 py-4 border-t border-border-subtle bg-background">
        <Button variant="green" className="flex-1" onClick={handleExport}>
          JSON 내보내기
        </Button>
        <Button variant="danger" className="flex-1" onClick={handleResetAll}>
          전체 초기화
        </Button>
      </div>
    </div>
  )
}

// 자모 패딩 섹션 컴포넌트
const JAMO_PADDING_SIDES: Array<{ key: keyof Padding; label: string }> = [
  { key: 'top', label: '상단' },
  { key: 'bottom', label: '하단' },
  { key: 'left', label: '좌측' },
  { key: 'right', label: '우측' },
]

function JamoPaddingSection({
  jamoType: _jamoType,
  jamoChar: _jamoChar,
  padding,
  onPaddingChange,
  onReset,
}: {
  jamoType: string
  jamoChar: string
  padding?: Padding
  onPaddingChange: (side: keyof Padding, value: number) => void
  onReset: () => void
}) {
  // unused vars 무시 (향후 확장용)
  void _jamoType
  void _jamoChar

  const hasPadding = padding && (padding.top > 0 || padding.bottom > 0 || padding.left > 0 || padding.right > 0)

  return (
    <div className="mx-5 mb-4 p-4 bg-surface rounded-md border border-border-subtle">
      <h4 className="text-sm font-medium m-0 mb-4 text-text-dim-4 uppercase tracking-wider flex items-center gap-2">
        <span className="text-lg">📐</span>
        자모 여백 (Padding)
        {hasPadding && (
          <Button
            variant="default"
            size="sm"
            className="ml-auto text-xs"
            onClick={onReset}
          >
            리셋
          </Button>
        )}
      </h4>

      <div className="grid grid-cols-2 gap-4">
        {JAMO_PADDING_SIDES.map(({ key, label }) => {
          const value = padding?.[key] ?? 0
          const isNonZero = value > 0

          return (
            <div key={key}>
              <div className="flex justify-between items-center mb-2">
                <span
                  className={`text-base font-medium ${isNonZero ? 'text-accent-orange' : 'text-text-dim-1'}`}
                >
                  {label}
                </span>
                <span className="text-sm text-text-dim-4 font-mono bg-surface-2 px-2 py-0.5 rounded-sm">
                  {(value * 100).toFixed(1)}%
                </span>
              </div>
              <Slider
                min={0}
                max={0.3}
                step={0.025}
                value={[value]}
                onValueChange={([val]) => onPaddingChange(key, val)}
                colorScheme="override"
              />
            </div>
          )
        })}
      </div>

      <p className="text-[0.75rem] text-text-dim-5 mt-3 pt-3 border-t border-border-subtle leading-relaxed">
        자모 획이 박스 가장자리까지 확장되는 것을 방지합니다. 변경 시 즉시 반영됩니다.
      </p>
    </div>
  )
}
