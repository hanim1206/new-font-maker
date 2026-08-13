import { useMemo } from 'react'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import { useJamoStore } from '../../stores/jamoStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useUIStore } from '../../stores/uiStore'
import { classifyJungseong, decomposeSyllableWithOverrides, getSampleSyllableForLayout, LAYOUT_LABELS } from '../../utils/hangulUtils'
import type { JamoData, LayoutType } from '../../types'
import styles from './JamoLayoutPreviewCards.module.css'

const CHOSEONG_LAYOUTS: LayoutType[] = [
  'choseong-only',
  'choseong-jungseong-vertical',
  'choseong-jungseong-vertical-jongseong',
  'choseong-jungseong-horizontal',
  'choseong-jungseong-horizontal-jongseong',
  'choseong-jungseong-mixed',
  'choseong-jungseong-mixed-jongseong',
]

const JONGSEONG_LAYOUTS: LayoutType[] = [
  'choseong-jungseong-vertical-jongseong',
  'choseong-jungseong-horizontal-jongseong',
  'choseong-jungseong-mixed-jongseong',
]

interface JamoLayoutPreviewCardsProps {
  activeLayoutType: LayoutType | null
  highlightedLayoutTypes?: ReadonlySet<LayoutType>
  editingJamoType: 'choseong' | 'jungseong' | 'jongseong'
  editingJamoChar: string
  savedJamoData?: JamoData | null
  onSelect: (layoutType: LayoutType) => void
}

function getCompatibleLayouts(
  editingJamoType: JamoLayoutPreviewCardsProps['editingJamoType'],
  editingJamoChar: string,
): LayoutType[] {
  if (editingJamoType === 'choseong') return CHOSEONG_LAYOUTS
  if (editingJamoType === 'jongseong') return JONGSEONG_LAYOUTS

  const type = classifyJungseong(editingJamoChar)
  return [
    `choseong-jungseong-${type}`,
    `choseong-jungseong-${type}-jongseong`,
  ] as LayoutType[]
}

export function JamoLayoutPreviewCards({
  activeLayoutType,
  highlightedLayoutTypes,
  editingJamoType,
  editingJamoChar,
  savedJamoData,
  onSelect,
}: JamoLayoutPreviewCardsProps) {
  const editingOverrideId = useUIStore((state) => state.editingOverrideId)
  const { choseong, jungseong, jongseong } = useJamoStore()
  const { getLayoutSchema, getEffectivePadding, layoutSchemas } = useLayoutStore()
  const { getEffectiveStyle } = useGlobalStyleStore()

  const layouts = useMemo(
    () => getCompatibleLayouts(editingJamoType, editingJamoChar),
    [editingJamoType, editingJamoChar],
  )

  const cards = useMemo(() => {
    const jamoMap = editingJamoType === 'choseong'
      ? choseong
      : editingJamoType === 'jungseong' ? jungseong : jongseong
    const currentJamo = jamoMap[editingJamoChar]
    const baseJamo = editingOverrideId ? savedJamoData ?? currentJamo : currentJamo
    if (!baseJamo) return []

    const previewJamoMap = { ...jamoMap, [editingJamoChar]: baseJamo }
    const previewChoseong = editingJamoType === 'choseong' ? previewJamoMap : choseong
    const previewJungseong = editingJamoType === 'jungseong' ? previewJamoMap : jungseong
    const previewJongseong = editingJamoType === 'jongseong' ? previewJamoMap : jongseong

    return layouts.map((layoutType) => {
      const sampleChar = getSampleSyllableForLayout(layoutType, editingJamoType, editingJamoChar)
      const decomposed = decomposeSyllableWithOverrides(
        sampleChar,
        previewChoseong,
        previewJungseong,
        previewJongseong,
      )
      const schema = getLayoutSchema(layoutType)
      return {
        layoutType,
        syllable: decomposed,
        schema: { ...schema, padding: getEffectivePadding(layoutType) },
        style: getEffectiveStyle(layoutType),
      }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [layouts, editingJamoType, editingJamoChar, editingOverrideId, savedJamoData, choseong, jungseong, jongseong, layoutSchemas])

  const isChoseongMatrix = editingJamoType === 'choseong' && cards.length === 7

  return (
    <div className={styles.container}>
      <div className={isChoseongMatrix ? styles.matrix : styles.compact}>
        {cards.map(({ layoutType, syllable, schema, style }, index) => (
          <button
            key={layoutType}
            type="button"
            title={LAYOUT_LABELS[layoutType]}
            aria-label={`${LAYOUT_LABELS[layoutType]} 배치 미리보기`}
            aria-pressed={activeLayoutType === layoutType}
            data-layout-preview={layoutType}
            onClick={() => onSelect(layoutType)}
            className={`${styles.card} ${isChoseongMatrix && index === 0 ? styles.standalone : ''} ${
              activeLayoutType === layoutType ? styles.active : ''
            } ${
              highlightedLayoutTypes?.has(layoutType) ? styles.overrideMatch : ''
            }`}
          >
            <SvgRenderer
              syllable={syllable}
              schema={schema}
              size={64}
              fillColor="#1a1a1a"
              backgroundColor="transparent"
              overflow="hidden"
              globalStyle={style}
              className={styles.glyph}
            />
          </button>
        ))}
      </div>
    </div>
  )
}
