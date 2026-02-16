import { useMemo } from 'react'
import { useJamoStore } from '../../stores/jamoStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import { decomposeSyllable } from '../../utils/hangulUtils'
import { generateSamplesForContext } from '../../utils/sampleGenerator'
import type { LayoutType } from '../../types'

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
    <div className="p-4 bg-surface rounded-md border border-border-subtle mt-4">
      <h4 className="text-sm font-medium m-0 mb-4 text-text-dim-4 uppercase tracking-wider">
        연관 샘플
      </h4>
      {sampleGroups.map((group) => {
        // 각 그룹의 레이아웃에 실효 패딩 적용
        const schema = getLayoutSchema(group.layoutType)
        const effectivePadding = getEffectivePadding(group.layoutType)
        const schemaWithPadding = { ...schema, padding: effectivePadding }
        const effectiveStyle = getEffectiveStyle(group.layoutType)

        return (
          <div key={group.label} className="mb-4 last:mb-0">
            <h5 className="text-xs font-medium m-0 mb-2 text-text-dim-5 pb-1 border-b border-border-subtle">
              {group.label}
            </h5>
            <div className="flex flex-wrap gap-2">
              {group.samples.map((char) => {
                const syllable = decomposeSyllable(
                  char,
                  choseong,
                  jungseong,
                  jongseong
                )

                return (
                  <div
                    key={char}
                    className="flex flex-col items-center gap-1 p-1.5 bg-background rounded border border-border-subtle transition-colors hover:border-border-light"
                  >
                    <SvgRenderer
                      syllable={syllable}
                      schema={schemaWithPadding}
                      size={72}
                      fillColor="#e0e0e0"
                      globalStyle={effectiveStyle}
                    />
                    <span className="text-[0.7rem] text-text-dim-5">{char}</span>
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
