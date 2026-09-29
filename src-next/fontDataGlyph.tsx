import { useMemo } from 'react'
import type { ReactNode } from 'react'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { effectiveStyleOf } from '../src/stores/globalStyleStore'
import { groupBeakResolverOf } from '../src/stores/jamoGroupStore'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { useContextPlacement } from './notoModel'
import type { ModelSource } from './notoModel'
import type { PreviewFont } from './previewFont'

/** 저장된 폰트(`previewFontOf`)로 그린 글자 하나. 스토어를 읽지 않는다. 그리는 길은 `AppGlyph`와 같다. */
const NO_GROUPS = groupBeakResolverOf([])

/** `model`을 주면 폰트 버전 대신 그 모델로 그린다(관리자 `v2로 보기` · 프리셋 초안). */
export function FontDataGlyph({ font, char, size, className, model, underlay, children }: { font: PreviewFont; char: string; size: number; className?: string; model?: ModelSource; underlay?: ReactNode; children?: ReactNode }) {
  const { choseong, jungseong, jongseong } = font.jamo
  const syllable = useMemo(() => decomposeSyllable(char, choseong, jungseong, jongseong), [char, choseong, jungseong, jongseong])
  const globalStyle = useMemo(() => effectiveStyleOf(font.style, font.exclusions, syllable.layoutType), [font.style, font.exclusions, syllable.layoutType])
  const padding = { ...font.globalPadding, ...font.paddingOverrides[syllable.layoutType] }
  const schema = { ...font.layoutSchemas[syllable.layoutType], padding, designBodyPadding: padding }
  const { placement } = useContextPlacement(syllable, schema, globalStyle, font.delta, model ?? font.preset)

  return (
    <SvgRenderer
      syllable={syllable}
      schema={placement.kind === 'schema' ? placement.schema : undefined}
      boxes={placement.kind === 'boxes' ? placement.boxes : undefined}
      size={size}
      className={className}
      globalStyle={globalStyle}
      groupBeakOf={NO_GROUPS}
      overflow="visible"
      clipGlyphs={false}
      underlay={underlay}
    >
      {children}
    </SvgRenderer>
  )
}
