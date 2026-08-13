import { useMemo } from 'react'
import { useLayoutStore } from '../../stores/layoutStore'
import { calculateRawBoxes } from '../../utils/layoutCalculator'
import { classifyJungseong, LAYOUT_LABELS } from '../../utils/hangulUtils'
import { PART_COLORS } from '../../constants/editorColors'
import type { BoxConfig, LayoutType, Part } from '../../types'
import styles from './JamoLayoutPreviewCards.module.css'

const GLYPH_LAYOUT_FILTERS: LayoutType[] = [
  'choseong-only',
  'choseong-jungseong-vertical',
  'choseong-jungseong-vertical-jongseong',
  'choseong-jungseong-horizontal',
  'choseong-jungseong-horizontal-jongseong',
  'choseong-jungseong-mixed',
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
    <div className={styles.container}>
      <div className={styles.matrix}>
        {chips.map(({ layoutType, schema, baseBoxes }, index) => {
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
              className={`${styles.card} ${index === 0 ? styles.standalone : ''} ${
                isActive ? styles.active : ''
              } ${isUnavailable ? 'opacity-35 cursor-not-allowed' : ''}`}
            >
              <svg width="64" height="64" viewBox={`0 0 ${V} ${V}`} className="block bg-white">
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
