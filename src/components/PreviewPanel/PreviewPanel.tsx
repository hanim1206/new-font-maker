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
import type { DecomposedSyllable } from '../../types'

export function PreviewPanel() {
  const {
    inputText,
    setInputText,
    selectedCharIndex,
    setSelectedCharIndex,
    setControlMode,
    setEditingJamo,
    setSelectedLayoutType
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

  // 각 글자에 대한 렌더링 정보 (규칙 적용 제거, 직접 레이아웃 설정 사용)
  const renderedSyllables = useMemo(() => {
    return syllables.map((syllable) => {
      const layoutConfig = layoutConfigs[syllable.layoutType]

      if (!layoutConfig) {
        return { syllable, boxes: null }
      }

      // 옵셔널 필드를 필터링하여 Record<Part, BoxConfig> 타입으로 변환
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

  return (
    <div className="min-h-full p-4 bg-background flex flex-col gap-4 max-md:p-3">
      {/* 입력 영역 */}
      <div className="w-full shrink-0 max-md:sticky max-md:top-0 max-md:z-10 max-md:bg-background max-md:pt-3 max-md:pb-2 max-md:-mt-3 max-md:mb-2">
        <Input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="한글 입력 (예: 한글샘플)"
          maxLength={50}
          className="w-full px-3 py-2.5 text-lg bg-surface-2 border-2 border-border rounded-lg text-foreground font-sans focus:border-primary max-md:text-xl max-md:px-3.5 max-md:py-3"
        />
      </div>

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
                  onClick={() => {
                    setSelectedCharIndex(index)
                    // 해당 음절의 레이아웃 타입으로 자동 포커스
                    setSelectedLayoutType(item.syllable.layoutType)
                    // 편집 모드를 레이아웃 편집 모드로 변경
                    setControlMode('layout')
                    // 자모 편집 모드 해제
                    setEditingJamo(null, null)
                  }}
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

      {/* 적용된 정보 (선택된 글자 기준) */}
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
