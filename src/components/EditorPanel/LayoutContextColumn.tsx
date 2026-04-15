import { useMemo } from 'react'
import { useLayoutStore } from '../../stores/layoutStore'
import { calculateRawBoxes } from '../../utils/layoutCalculator'
import { PART_COLORS } from '../../constants/editorColors'
import type { LayoutType, Part, BoxConfig } from '../../types'

/** 좌측에 항상 고정 노출되는 7개 레이아웃 */
const FIXED_LAYOUTS: LayoutType[] = [
  'choseong-jungseong-vertical',
  'choseong-jungseong-horizontal',
  'choseong-jungseong-mixed',
  'choseong-jungseong-vertical-jongseong',
  'choseong-jungseong-horizontal-jongseong',
  'choseong-jungseong-mixed-jongseong',
  'choseong-only',
]

const V = 100

interface LayoutContextColumnProps {
  /** 현재 선택된 레이아웃 타입 (레이아웃 편집 모드) */
  selectedLayoutType: LayoutType | null
  /** 자모 편집 중인지 여부 */
  isJamoEditing: boolean
  /** 자모 편집 시 미리보기 레이아웃 컨텍스트 */
  previewLayoutType: LayoutType | null
  /** 레이아웃 선택 핸들러 (레이아웃 편집 모드) */
  onSelectLayout: (lt: LayoutType) => void
  /** 미리보기 레이아웃 전환 핸들러 (자모 편집 모드) */
  onSelectPreviewLayout: (lt: LayoutType) => void
}

/** 1열: 레이아웃 타입 내비게이션 썸네일 컬럼 */
export function LayoutContextColumn({
  selectedLayoutType,
  isJamoEditing,
  previewLayoutType,
  onSelectLayout,
  onSelectPreviewLayout,
}: LayoutContextColumnProps) {
  const { getLayoutSchema, layoutSchemas } = useLayoutStore()

  const thumbnails = useMemo(() => {
    return FIXED_LAYOUTS.map((layoutType) => {
      const schema = getLayoutSchema(layoutType)
      const noPaddingSchema = {
        ...schema,
        padding: { top: 0, bottom: 0, left: 0, right: 0 },
        partOverrides: undefined,
      }
      const baseBoxes = calculateRawBoxes(noPaddingSchema)
      return { layoutType, schema, baseBoxes }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getLayoutSchema, layoutSchemas])

  // 활성 레이아웃: 자모 편집 중이면 previewLayoutType, 아니면 selectedLayoutType
  const activeType = isJamoEditing ? previewLayoutType : selectedLayoutType

  return (
    <div className="w-[80px] shrink-0 flex flex-col border-r border-border-subtle overflow-y-auto bg-background">
      <div className="px-2 pt-3 pb-1 shrink-0">
        <span className="text-[9px] font-medium text-text-dim-5 uppercase tracking-wider">
          레이아웃
        </span>
      </div>

      <div className="flex flex-col gap-1 p-1.5">
        {thumbnails.map(({ layoutType, schema, baseBoxes }) => {
          const isActive = activeType === layoutType
          const handleClick = isJamoEditing ? onSelectPreviewLayout : onSelectLayout

          return (
            <button
              key={layoutType}
              onClick={() => handleClick(layoutType)}
              title={layoutType}
              className={`
                w-full p-1 rounded border transition-colors cursor-pointer
                ${isActive
                  ? 'border-text-dim-3 bg-surface-2'
                  : 'border-transparent hover:border-border-light hover:bg-surface-2'
                }
              `}
            >
              <svg
                width="100%"
                viewBox={`0 0 ${V} ${V}`}
                style={{ aspectRatio: '1', display: 'block', backgroundColor: '#ffffff' }}
              >
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
