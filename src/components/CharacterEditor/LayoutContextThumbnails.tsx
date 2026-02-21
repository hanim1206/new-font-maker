import { useEffect, useMemo } from 'react'
import { useJamoStore } from '../../stores/jamoStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import { decomposeSyllable, getSampleSyllableForLayout, classifyJungseong } from '../../utils/hangulUtils'
import type { LayoutType } from '../../types'

/** 항상 고정으로 노출되는 7개 레이아웃 (음절 조합 + 초성only) */
const FIXED_LAYOUTS: LayoutType[] = [
  'choseong-jungseong-vertical',
  'choseong-jungseong-horizontal',
  'choseong-jungseong-mixed',
  'choseong-jungseong-vertical-jongseong',
  'choseong-jungseong-horizontal-jongseong',
  'choseong-jungseong-mixed-jongseong',
  'choseong-only',
]

/** 레이아웃 타입에 해당하는 중성 서브타입 ('vertical' | 'horizontal' | 'mixed' | null) */
function getLayoutJungseongSubType(layoutType: LayoutType): 'vertical' | 'horizontal' | 'mixed' | null {
  if (layoutType.includes('mixed')) return 'mixed'
  if (layoutType.includes('horizontal')) return 'horizontal'
  if (layoutType.includes('vertical')) return 'vertical'
  return null // choseong-only 등
}

/** 자모가 해당 레이아웃에 호환되는지 확인 */
function isJamoCompatible(
  layoutType: LayoutType,
  jamoType?: 'choseong' | 'jungseong' | 'jongseong',
  jamoChar?: string
): boolean {
  if (!jamoType || !jamoChar) return false

  // 초성은 모든 레이아웃에 호환
  if (jamoType === 'choseong') return true

  // 종성은 jongseong 포함 레이아웃에만 호환
  if (jamoType === 'jongseong') return layoutType.includes('jongseong')

  // 중성: 서브타입이 레이아웃과 일치해야 호환
  if (jamoType === 'jungseong') {
    const layoutSubType = getLayoutJungseongSubType(layoutType)
    if (!layoutSubType) return false // choseong-only 등에는 중성 없음
    const charSubType = classifyJungseong(jamoChar)
    return charSubType === layoutSubType
  }

  return false
}

interface LayoutContextThumbnailsProps {
  /** 자모 편집 중일 때 자모 타입 (샘플 글자 선택에 사용) */
  jamoType?: 'choseong' | 'jungseong' | 'jongseong'
  /** 자모 편집 중일 때 자모 문자 */
  jamoChar?: string
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

  // selectedContext가 null이면 첫 번째 레이아웃을 기본 선택
  const effectiveContext = selectedContext ?? FIXED_LAYOUTS[0] ?? null

  useEffect(() => {
    if (!selectedContext) {
      onSelectContext(FIXED_LAYOUTS[0])
    }
  }, [selectedContext, onSelectContext])

  // 각 레이아웃의 샘플 음절 미리 계산
  const thumbnails = useMemo(() => {
    return FIXED_LAYOUTS.map((layoutType) => {
      // 자모가 이 레이아웃에 호환될 때만 자모 정보 전달, 아니면 기본 샘플 사용
      const compatible = isJamoCompatible(layoutType, jamoType, jamoChar)
      const sampleChar = getSampleSyllableForLayout(
        layoutType,
        compatible ? jamoType : undefined,
        compatible ? jamoChar : undefined
      )
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

      return { layoutType, sampleChar, schemaWithPadding, effectiveStyle, syllable }
    })
  }, [jamoType, jamoChar, choseong, jungseong, jongseong, getLayoutSchema, getEffectivePadding, getEffectiveStyle])

  return (
    <div className="px-4 pt-3">
      <h4 className="text-xs font-medium mb-2 text-text-dim-4 uppercase tracking-wider">
        레이아웃 컨텍스트
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {thumbnails.map(({ layoutType, sampleChar, schemaWithPadding, effectiveStyle, syllable }) => {
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
                size={40}
                fillColor={isSelected ? '#60a5fa' : '#a0a0a0'}
                showDebugBoxes
                globalStyle={effectiveStyle}
              />
              <span className="text-[0.6rem] text-text-dim-5 leading-none">
                {sampleChar}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
