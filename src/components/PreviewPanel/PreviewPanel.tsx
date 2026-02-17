import { useEffect, useMemo, useState } from 'react'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import { useLayoutStore } from '../../stores/layoutStore'
import { useJamoStore } from '../../stores/jamoStore'
import { useUIStore } from '../../stores/uiStore'
import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import { decomposeSyllable, isHangul } from '../../utils/hangulUtils'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import type { DecomposedSyllable, LayoutType } from '../../types'

interface PreviewPanelProps {
  horizontal?: boolean
}

export function PreviewPanel({ horizontal = false }: PreviewPanelProps) {
  const {
    inputText,
    setInputText,
    selectedCharIndex,
    setSelectedCharIndex,
    setControlMode,
    setEditingJamo,
    setSelectedLayoutType,
    isMobile,
  } = useUIStore()
  const { layoutConfigs, getEffectivePadding, getLayoutSchema } = useLayoutStore()
  const { choseong, jungseong, jongseong } = useJamoStore()
  const { getEffectiveStyle } = useGlobalStyleStore()
  const [showDebug, setShowDebug] = useState(true)

  // 모든 한글 글자 분석
  const syllables: DecomposedSyllable[] = useMemo(() => {
    return inputText
      .split('')
      .filter(isHangul)
      .map(char => decomposeSyllable(char, choseong, jungseong, jongseong))
  }, [inputText, choseong, jungseong, jongseong])

  // 각 글자에 대한 렌더링 정보
  const renderedSyllables = useMemo(() => {
    return syllables.map((syllable) => {
      const layoutConfig = layoutConfigs[syllable.layoutType]

      if (!layoutConfig) {
        return { syllable, boxes: null }
      }

      const boxes: Record<string, any> = {}
      Object.entries(layoutConfig.boxes).forEach(([key, value]) => {
        if (value) {
          boxes[key] = value
        }
      })

      return {
        syllable,
        boxes: boxes as Record<string, any>,
      }
    })
  }, [syllables, layoutConfigs])

  // 선택된 글자의 정보
  const selectedCharInfo = renderedSyllables[selectedCharIndex] || { boxes: null }
  const selectedSyllable = syllables[selectedCharIndex] || null

  // 입력 텍스트가 변경되면 선택 인덱스를 0으로 리셋
  useEffect(() => {
    setSelectedCharIndex(0)
  }, [inputText, setSelectedCharIndex])

  const handleCharClick = (index: number, layoutType: LayoutType) => {
    setSelectedCharIndex(index)
    setSelectedLayoutType(layoutType)
    setControlMode('layout')
    setEditingJamo(null, null)
  }

  // === 가로 모드 (데스크톱 상단 바) ===
  if (horizontal) {
    return (
      <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border">
        {renderedSyllables.length > 0 ? (
          renderedSyllables.map((item, index) =>
            item.boxes ? (
              <div
                key={index}
                className={cn(
                  'shrink-0 flex justify-center items-center bg-[#0f0f0f] rounded p-0.5 border-2 cursor-pointer transition-all',
                  'hover:border-[#444] hover:bg-surface',
                  index === selectedCharIndex
                    ? 'border-primary bg-primary/10'
                    : 'border-border'
                )}
                onClick={() => handleCharClick(index, item.syllable.layoutType)}
              >
                <SvgRenderer
                  syllable={item.syllable}
                  schema={(() => {
                    const schema = getLayoutSchema(item.syllable.layoutType)
                    const padding = getEffectivePadding(item.syllable.layoutType)
                    return { ...schema, padding }
                  })()}
                  size={48}
                  fillColor="#e5e5e5"
                  backgroundColor="#1a1a1a"
                  showDebugBoxes={false}
                  globalStyle={getEffectiveStyle(item.syllable.layoutType)}
                />
              </div>
            ) : null
          )
        ) : (
          <span className="text-text-dim-6 text-sm whitespace-nowrap">한글을 입력하세요</span>
        )}
      </div>
    )
  }

  // === 세로 모드 (모바일 / 기본) ===
  return (
    <div className="min-h-full p-4 bg-background flex flex-col gap-4 max-md:p-3">
      {/* 입력 영역 — 모바일에서만 표시 */}
      {isMobile && (
        <div className="w-full shrink-0 sticky top-0 z-10 bg-background pt-3 pb-2 -mt-3 mb-2">
          <Input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="한글 입력 (예: 한글샘플)"
            maxLength={50}
            className="w-full px-3.5 py-3 text-xl bg-surface-2 border-2 border-border rounded-lg text-foreground font-sans focus:border-primary"
          />
        </div>
      )}

      {/* 미리보기 영역 - 그리드로 모든 글자 표시 */}
      <div className="flex justify-center items-start shrink-0 max-md:min-h-[180px] max-md:sticky max-md:top-[4.5rem] max-md:z-[9] max-md:bg-background max-md:pb-2 max-md:mb-2">
        {renderedSyllables.length > 0 ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(90px,1fr))] gap-2 p-2 bg-surface-2 rounded-xl max-w-full w-full max-md:grid-cols-[repeat(auto-fill,minmax(100px,1fr))] max-md:gap-3 max-md:p-3 max-[480px]:grid-cols-[repeat(auto-fill,minmax(80px,1fr))] max-[480px]:gap-2">
            {renderedSyllables.map((item, index) =>
              item.boxes ? (
                <div
                  key={index}
                  className={cn(
                    'flex justify-center items-center bg-[#0f0f0f] rounded p-1 border-2 border-border cursor-pointer transition-all',
                    'hover:border-[#444] hover:bg-surface',
                    index === selectedCharIndex && 'border-primary bg-primary/10 shadow-[0_0_0_1px_theme(colors.primary.DEFAULT)]'
                  )}
                  onClick={() => handleCharClick(index, item.syllable.layoutType)}
                >
                  <SvgRenderer
                    syllable={item.syllable}
                    schema={(() => {
                      const schema = getLayoutSchema(item.syllable.layoutType)
                      const padding = getEffectivePadding(item.syllable.layoutType)
                      return { ...schema, padding }
                    })()}
                    size={90}
                    fillColor="#e5e5e5"
                    backgroundColor="#1a1a1a"
                    showDebugBoxes={showDebug}
                    globalStyle={getEffectiveStyle(item.syllable.layoutType)}
                  />
                </div>
              ) : null
            )}
          </div>
        ) : (
          <div className="flex justify-center items-center w-full h-[150px] bg-surface-2 rounded-xl border-2 border-dashed border-border">
            <span className="text-text-dim-6 text-base">한글을 입력하세요</span>
          </div>
        )}
      </div>

      {/* 박스 영역 표시 체크박스 */}
      {selectedSyllable && selectedCharInfo.boxes && (
        <label className="flex items-center gap-2 cursor-pointer text-xs text-text-dim-5 mt-2 pt-2 border-t border-surface-3">
          <Checkbox
            checked={showDebug}
            onCheckedChange={(checked) => setShowDebug(checked === true)}
          />
          <span>박스 영역 표시</span>
        </label>
      )}
    </div>
  )
}
