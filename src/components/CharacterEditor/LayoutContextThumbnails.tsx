import { useEffect, useMemo } from 'react'
import { useJamoStore } from '../../stores/jamoStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import { decomposeSyllable, getLayoutsForJamoType, getSampleSyllableForLayout, classifyJungseong } from '../../utils/hangulUtils'
import type { LayoutType } from '../../types'

interface LayoutContextThumbnailsProps {
  jamoType: 'choseong' | 'jungseong' | 'jongseong'
  jamoChar: string
  selectedContext: LayoutType | null
  onSelectContext: (layoutType: LayoutType) => void
}

export function LayoutContextThumbnails({
  jamoType,
  jamoChar,
  selectedContext,
  onSelectContext,
}: LayoutContextThumbnailsProps) {
  const { choseong, jungseong, jongseong } = useJamoStore()
  const { getLayoutSchema, getEffectivePadding } = useLayoutStore()
  const { getEffectiveStyle } = useGlobalStyleStore()

  // 자모 타입에 따른 적용 가능한 레이아웃 목록
  const applicableLayouts = useMemo(() => {
    if (jamoType === 'jungseong') {
      const subType = classifyJungseong(jamoChar)
      return getLayoutsForJamoType(jamoType, subType)
    }
    return getLayoutsForJamoType(jamoType)
  }, [jamoType, jamoChar])

  // selectedContext가 null이면 첫 번째 레이아웃을 기본 선택
  const effectiveContext = selectedContext ?? applicableLayouts[0] ?? null

  useEffect(() => {
    if (!selectedContext && applicableLayouts.length > 0) {
      onSelectContext(applicableLayouts[0])
    }
  }, [selectedContext, applicableLayouts, onSelectContext])

  if (applicableLayouts.length === 0) return null

  return (
    <div className="px-5 pt-3">
      <h4 className="text-xs font-medium mb-2 text-text-dim-4 uppercase tracking-wider">
        레이아웃 컨텍스트
      </h4>
      <div className="flex flex-wrap gap-1.5 ">
        {applicableLayouts.map((layoutType) => {
          const sampleChar = getSampleSyllableForLayout(layoutType, jamoType, jamoChar)
          const schema = getLayoutSchema(layoutType)
          const effectivePadding = getEffectivePadding(layoutType)
          const schemaWithPadding = { ...schema, padding: effectivePadding }
          const effectiveStyle = getEffectiveStyle(layoutType)

          const syllable = decomposeSyllable(
            sampleChar,
            choseong,
            jungseong,
            jongseong
          )

          const isSelected = effectiveContext === layoutType

          return (
            <button
              key={layoutType}
              onClick={() => onSelectContext(layoutType)}
              className={`
                flex flex-col items-center gap-0.5 p-1 rounded border transition-colors cursor-pointer
                ${isSelected
                  ? 'border-accent-blue bg-accent-blue/10 ring-1 ring-accent-blue'
                  : 'border-border-subtle bg-background hover:border-border-light'
                }
              `}
              title={layoutType}
            >
              <SvgRenderer
                syllable={syllable}
                schema={schemaWithPadding}
                size={50}
                fillColor={isSelected ? '#60a5fa' : '#a0a0a0'}
                showDebugBoxes
                globalStyle={effectiveStyle}
              />
              <span className="text-[0.8rem] text-text-dim-5 leading-none">
                {sampleChar}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
