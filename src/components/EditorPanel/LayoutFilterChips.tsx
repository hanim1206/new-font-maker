import { useMemo } from 'react'
import { useLayoutStore } from '../../stores/layoutStore'
import { calculateRawBoxes } from '../../utils/layoutCalculator'
import { classifyJungseong, LAYOUT_LABELS } from '../../utils/hangulUtils'
import { PART_COLORS } from '../../constants/editorColors'
import type { BoxConfig, LayoutType, Part } from '../../types'

const GLYPH_LAYOUT_FILTERS: LayoutType[] = [
  'choseong-only',
  'choseong-jungseong-vertical',
  'choseong-jungseong-horizontal',
  'choseong-jungseong-mixed',
  'choseong-jungseong-vertical-jongseong',
  'choseong-jungseong-horizontal-jongseong',
  'choseong-jungseong-mixed-jongseong',
]

interface LayoutFilterChipsProps {
  activeLayoutType: LayoutType | null
  onSelect: (layoutType: LayoutType) => void
  editingJamoType?: 'choseong' | 'jungseong' | 'jongseong' | null
  editingJamoChar?: string | null
}

const V = 100

export function LayoutFilterChips({ activeLayoutType, onSelect, editingJamoType, editingJamoChar }: LayoutFilterChipsProps) {
  const { getLayoutSchema, layoutSchemas } = useLayoutStore()
  const chips = useMemo(() => GLYPH_LAYOUT_FILTERS.map((layoutType) => {
    const schema = getLayoutSchema(layoutType)
    const baseBoxes = calculateRawBoxes({
      ...schema,
      padding: { top: 0, bottom: 0, left: 0, right: 0 },
      partOverrides: undefined,
    })
    return { layoutType, schema, baseBoxes }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [getLayoutSchema, layoutSchemas])

  return (
    <div className="shrink-0 px-2 py-2 border-b border-border-subtle bg-[#0c0c0c]">
      <div className="mb-1.5 text-[9px] font-medium text-text-dim-5 uppercase tracking-wider">레이아웃 필터</div>
      <div className="flex gap-1.5 overflow-x-auto pb-0.5">
        {chips.map(({ layoutType, schema, baseBoxes }) => {
          const isActive = activeLayoutType === layoutType
          const jungseongType = editingJamoType === 'jungseong' && editingJamoChar
            ? classifyJungseong(editingJamoChar)
            : null
          const isUnavailable = jungseongType
            ? !layoutType.includes(`jungseong-${jungseongType}`)
            : editingJamoType === 'jongseong'
              ? !layoutType.endsWith('-jongseong')
              : false
          return (
            <button
              key={layoutType}
              onClick={() => onSelect(layoutType)}
              title={isUnavailable
                ? `${LAYOUT_LABELS[layoutType]} · 현재 자소의 편집 영역 없음`
                : LAYOUT_LABELS[layoutType]}
              aria-pressed={isActive}
              disabled={isUnavailable}
              className={`shrink-0 w-11 p-1 rounded border-2 transition-colors ${
                isActive
                  ? 'border-accent-blue bg-accent-blue/10'
                  : isUnavailable
                    ? 'border-border-subtle bg-surface-2 opacity-35 cursor-not-allowed'
                  : 'border-border-subtle hover:border-border-light bg-surface-2'
              }`}
            >
              <svg width="100%" viewBox={`0 0 ${V} ${V}`} className="block aspect-square bg-white">
                {(Object.entries(baseBoxes) as [Part, BoxConfig][]).map(([part, box]) => (
                  <rect
                    key={part}
                    x={box.x * V}
                    y={box.y * V}
                    width={box.width * V}
                    height={box.height * V}
                    fill={PART_COLORS[part]}
                  />
                ))}
                {schema.splits?.map((split, index) => {
                  const position = split.value * V
                  return split.axis === 'x'
                    ? <line key={index} x1={position} y1={0} x2={position} y2={V} stroke="#000" strokeWidth={2} />
                    : <line key={index} x1={0} y1={position} x2={V} y2={position} stroke="#000" strokeWidth={2} />
                })}
              </svg>
            </button>
          )
        })}
      </div>
    </div>
  )
}
