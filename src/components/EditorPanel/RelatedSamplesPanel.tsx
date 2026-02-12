import { useMemo } from 'react'
import { useJamoStore } from '../../stores/jamoStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import { decomposeSyllable } from '../../utils/hangulUtils'
import { generateSamplesForContext } from '../../utils/sampleGenerator'
import type { LayoutType } from '../../types'
import styles from './RelatedSamplesPanel.module.css'

interface RelatedSamplesPanelProps {
  editingType: 'choseong' | 'jungseong' | 'jongseong' | 'layout'
  editingChar: string | null
  layoutType: LayoutType | null
}

export function RelatedSamplesPanel({
  editingType,
  editingChar,
  layoutType,
}: RelatedSamplesPanelProps) {
  const { choseong, jungseong, jongseong } = useJamoStore()
  const { getLayoutSchema, getEffectivePadding } = useLayoutStore()
  const { getEffectiveStyle } = useGlobalStyleStore()

  const sampleGroups = useMemo(
    () => generateSamplesForContext(editingType, editingChar, layoutType),
    [editingType, editingChar, layoutType]
  )

  if (sampleGroups.length === 0) return null

  return (
    <div className={styles.container}>
      <h4 className={styles.title}>연관 샘플</h4>
      {sampleGroups.map((group) => {
        // 각 그룹의 레이아웃에 실효 패딩 적용
        const schema = getLayoutSchema(group.layoutType)
        const effectivePadding = getEffectivePadding(group.layoutType)
        const schemaWithPadding = { ...schema, padding: effectivePadding }
        const effectiveStyle = getEffectiveStyle(group.layoutType)

        return (
          <div key={group.label} className={styles.group}>
            <h5 className={styles.groupLabel}>{group.label}</h5>
            <div className={styles.sampleGrid}>
              {group.samples.map((char) => {
                const syllable = decomposeSyllable(
                  char,
                  choseong,
                  jungseong,
                  jongseong
                )

                return (
                  <div key={char} className={styles.sampleItem}>
                    <SvgRenderer
                      syllable={syllable}
                      schema={schemaWithPadding}
                      size={48}
                      fillColor="#e0e0e0"
                      globalStyle={effectiveStyle}
                    />
                    <span className={styles.sampleChar}>{char}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
