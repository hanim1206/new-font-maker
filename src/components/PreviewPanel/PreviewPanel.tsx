import { useEffect, useMemo } from 'react'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import { useLayoutStore } from '../../stores/layoutStore'
import { useJamoStore } from '../../stores/jamoStore'
import { useUIStore } from '../../stores/uiStore'
import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import { decomposeSyllableWithOverrides, isHangul } from '../../utils/hangulUtils'
import { Input } from '@/components/ui/input'
import type { DecomposedSyllable, LayoutType } from '../../types'

type PreviewItem =
  | { type: 'syllable'; syllable: DecomposedSyllable; boxes: Record<string, any> | null; hangulIndex: number }
  | { type: 'space' }
  | { type: 'newline' }

interface PreviewPanelProps {
  horizontal?: boolean
}

export function PreviewPanel({ horizontal = false }: PreviewPanelProps) {
  const {
    inputText,
    setInputText,
    setSelectedCharIndex,
    setControlMode,
    setEditingJamo,
    setEditingPartInLayout,
    setSelectedLayoutType,
    setActiveMobileDrawer,
  } = useUIStore()
  const { layoutConfigs, getEffectivePadding, getLayoutSchema } = useLayoutStore()
  const { choseong, jungseong, jongseong } = useJamoStore()
  const { getEffectiveStyle } = useGlobalStyleStore()

  // 모든 글자 분석 (한글 + 공백)
  const previewItems = useMemo((): PreviewItem[] => {
    const items: PreviewItem[] = []
    let hangulIndex = 0
    for (const ch of inputText) {
      if (isHangul(ch)) {
        const syllable = decomposeSyllableWithOverrides(ch, choseong, jungseong, jongseong)
        const layoutConfig = layoutConfigs[syllable.layoutType]
        let boxes: Record<string, any> | null = null
        if (layoutConfig) {
          boxes = {}
          Object.entries(layoutConfig.boxes).forEach(([key, value]) => {
            if (value) boxes![key] = value
          })
        }
        items.push({ type: 'syllable', syllable, boxes, hangulIndex: hangulIndex++ })
      } else if (ch === ' ') {
        items.push({ type: 'space' })
      } else if (ch === '\n') {
        items.push({ type: 'newline' })
      }
    }
    return items
  }, [inputText, choseong, jungseong, jongseong, layoutConfigs])

  const hasSyllables = previewItems.some(item => item.type === 'syllable')

  // 줄바꿈 기준으로 라인 분리
  const previewLines = useMemo(() => {
    const lines: Exclude<PreviewItem, { type: 'newline' }>[][] = [[]]
    for (const item of previewItems) {
      if (item.type === 'newline') {
        lines.push([])
      } else {
        lines[lines.length - 1].push(item)
      }
    }
    return lines
  }, [previewItems])

  // 입력 텍스트가 변경되면 선택 인덱스를 0으로 리셋
  useEffect(() => {
    setSelectedCharIndex(0)
  }, [inputText, setSelectedCharIndex])

  const handleCharClick = (index: number, layoutType: LayoutType) => {
    setSelectedCharIndex(index)
    setSelectedLayoutType(layoutType)
    setControlMode('layout')
    setEditingJamo(null, null)
    setEditingPartInLayout(null)
    setActiveMobileDrawer(null)
  }

  // === 가로 모드 (데스크톱 상단 바) ===
  if (horizontal) {
    return (
      <div className="flex-1 min-w-0 flex items-center gap-2 overflow-x-auto scrollbar-thin scrollbar-track-transparent scrollbar-thumb-border">
        <Input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="한글 입력 (예: 한글샘플)"
          maxLength={50}
          className="w-[240px] shrink-0 px-3 py-2 text-base bg-surface-2 border border-border rounded-lg text-foreground font-sans focus:border-primary"
        />
        {hasSyllables ? (
          <div className="flex items-center shrink-0">
            {previewItems.map((item, index) =>
              item.type === 'newline' ? (
                <div key={`nl-${index}`} className="shrink-0" style={{ width: 24 }} />
              ) : item.type === 'space' ? (
                <div key={`sp-${index}`} className="shrink-0" style={{ width: 24 }} />
              ) : item.boxes ? (
                <div
                  key={index}
                  className="shrink-0 cursor-pointer"
                  onClick={() => handleCharClick(item.hangulIndex, item.syllable.layoutType)}
                >
                  <SvgRenderer
                    syllable={item.syllable}
                    schema={(() => {
                      const baseSchema = getLayoutSchema(item.syllable.layoutType)
                      const padding = getEffectivePadding(item.syllable.layoutType)
                      return { ...baseSchema, padding }
                    })()}
                    size={48}
                    fillColor="#e5e5e5"
                    backgroundColor="transparent"
                    showDebugBoxes={false}
                    overflow="hidden"
                    enableTransition
                    globalStyle={getEffectiveStyle(item.syllable.layoutType)}
                  />
                </div>
              ) : null
            )}
          </div>
        ) : (
          <span className="text-text-dim-6 text-sm whitespace-nowrap">한글을 입력하세요</span>
        )}
      </div>
    )
  }

  // === 세로 모드 (모바일 / 기본) ===
  return (
    <div className="h-full p-4 bg-background flex flex-col gap-4 max-md:p-3">
      {/* 텍스트 입력 */}
      <div className="shrink-0">
        <textarea
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="한글 입력 (예: 한글샘플)"
          rows={3}
          className="w-full px-3.5 py-3 text-lg bg-surface-2 border border-border rounded-lg text-foreground font-sans focus:border-primary resize-none outline-none"
        />
      </div>

      {/* 미리보기 영역 - 실제 폰트처럼 글자 나열 */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {hasSyllables ? (
          <div className="w-full">
            {previewLines.map((line, lineIndex) => (
              <div key={lineIndex} className="flex flex-wrap w-full">
                {line.length === 0 ? (
                  <div style={{ width: '20%', aspectRatio: '1' }} />
                ) : (
                  line.map((item, itemIndex) =>
                    item.type === 'space' ? (
                      <div key={`sp-${itemIndex}`} style={{ width: '10%' }} />
                    ) : item.boxes ? (
                      <div
                        key={itemIndex}
                        className="cursor-pointer"
                        style={{ width: '20%' }}
                        onClick={() => handleCharClick(item.hangulIndex, item.syllable.layoutType)}
                      >
                        <SvgRenderer
                          syllable={item.syllable}
                          schema={(() => {
                            const baseSchema = getLayoutSchema(item.syllable.layoutType)
                            const padding = getEffectivePadding(item.syllable.layoutType)
                            return { ...baseSchema, padding }
                          })()}
                          fillColor="#e5e5e5"
                          backgroundColor="transparent"
                          showDebugBoxes={false}
                          overflow="hidden"
                          enableTransition
                          globalStyle={getEffectiveStyle(item.syllable.layoutType)}
                          className="w-full h-auto"
                        />
                      </div>
                    ) : null
                  )
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="flex justify-center items-center w-full h-[150px] rounded-xl border-2 border-dashed border-border">
            <span className="text-text-dim-6 text-base">한글을 입력하세요</span>
          </div>
        )}
      </div>
    </div>
  )
}
