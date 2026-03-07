import { useEffect, useMemo } from 'react'
import { useLayoutStore } from '../../stores/layoutStore'
import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import { calculateRawBoxes } from '../../utils/layoutCalculator'
import { PART_COLORS } from '../../constants/editorColors'
import type { LayoutType, Part, BoxConfig } from '../../types'

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

const V = 100 // viewBox 크기



interface LayoutContextThumbnailsProps {
  jamoType?: 'choseong' | 'jungseong' | 'jongseong'
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
  const { getLayoutSchema, layoutSchemas } = useLayoutStore()
  const { style: globalStyle, exclusions } = useGlobalStyleStore()

  const effectiveContext = selectedContext ?? FIXED_LAYOUTS[0] ?? null

  useEffect(() => {
    if (!selectedContext) {
      onSelectContext(FIXED_LAYOUTS[0])
    }
  }, [selectedContext, onSelectContext])

  const thumbnails = useMemo(() => {
    return FIXED_LAYOUTS.map((layoutType) => {
      const schema = getLayoutSchema(layoutType)

      // 기준선으로만 나눈 박스 (패딩 0, partOverrides 없음)
      const noPaddingSchema = {
        ...schema,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        partOverrides: undefined,
      }
      const baseBoxes = calculateRawBoxes(noPaddingSchema)

      return { layoutType, schema, baseBoxes }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getLayoutSchema, layoutSchemas, globalStyle, exclusions, jamoType, jamoChar])

  return (
    <div className="px-4 pt-3">
      <h4 className="text-xs font-medium mb-2 text-text-dim-4 uppercase tracking-wider">
        레이아웃 컨텍스트
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {thumbnails.map(({ layoutType, schema, baseBoxes }) => {
          const isSelected = effectiveContext === layoutType

          return (
            <button
              key={layoutType}
              onClick={() => onSelectContext(layoutType)}
              className={`
                flex flex-col items-center gap-0.5 p-1 rounded border transition-colors cursor-pointer
                ${isSelected
                  ? 'border-text-dim-3'
                  : 'border-border-subtle bg-background hover:border-border-light'
                }
              `}
              title={layoutType}
            >
              <svg width={40} height={40} viewBox={`0 0 ${V} ${V}`} style={{ backgroundColor: '#ffffff' }}>
                {/* 파트별 원색 배경 */}
                {(Object.entries(baseBoxes) as [Part, BoxConfig][]).map(([part, box]) => (
                  <rect
                    key={`base-${part}`}
                    x={box.x * V}
                    y={box.y * V}
                    width={box.width * V}
                    height={box.height * V}
                    fill={PART_COLORS[part]}
                    fillOpacity={1}
                  />
                ))}

                {/* 기준선: 검정 굵은 선 */}
                {schema.splits?.map((split, i) => {
                  const pos = split.value * V
                  return split.axis === 'x'
                    ? <line key={`split-${i}`} x1={pos} y1={0} x2={pos} y2={V} stroke="#000" strokeWidth={2} />
                    : <line key={`split-${i}`} x1={0} y1={pos} x2={V} y2={pos} stroke="#000" strokeWidth={2} />
                })}
              </svg>
            </button>
          )
        })}
      </div>
    </div>
  )
}
