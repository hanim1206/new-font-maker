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

      // partOverrides가 있으면 오버라이드 영역 계산
      const partOverrides = schema.partOverrides

      return { layoutType, schema, baseBoxes, partOverrides }
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getLayoutSchema, layoutSchemas, globalStyle, exclusions, jamoType, jamoChar])

  return (
    <div className="px-4 pt-3">
      <h4 className="text-xs font-medium mb-2 text-text-dim-4 uppercase tracking-wider">
        레이아웃 컨텍스트
      </h4>
      <div className="flex flex-wrap gap-1.5">
        {thumbnails.map(({ layoutType, schema, baseBoxes, partOverrides }) => {
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

                {/* partOverride 패딩: 흰색 반투명 오버레이 (색이 빠지는 효과) */}
                {partOverrides && (Object.entries(baseBoxes) as [Part, BoxConfig][]).map(([part, box]) => {
                  const override = partOverrides[part]
                  if (!override) return null
                  const top = override.top ?? 0
                  const bottom = override.bottom ?? 0
                  const left = override.left ?? 0
                  const right = override.right ?? 0
                  if (top === 0 && bottom === 0 && left === 0 && right === 0) return null

                  const bx = box.x * V
                  const by = box.y * V
                  const bw = box.width * V
                  const bh = box.height * V

                  // 각 면의 패딩 영역을 흰색 오버레이로 (양수: 안쪽 축소 → 흰색으로 탈색)
                  // 음수: 바깥 확장 → 파트색이 넘침 (기본 배경 위에 이미 그려짐)
                  const strips = []

                  if (top > 0) {
                    strips.push({ x: bx, y: by, w: bw, h: top * V, key: `${part}-top` })
                  }
                  if (bottom > 0) {
                    strips.push({ x: bx, y: by + bh - bottom * V, w: bw, h: bottom * V, key: `${part}-bottom` })
                  }
                  if (left > 0) {
                    const stripTop = by + (top > 0 ? top * V : 0)
                    const stripH = bh - (top > 0 ? top * V : 0) - (bottom > 0 ? bottom * V : 0)
                    strips.push({ x: bx, y: stripTop, w: left * V, h: stripH, key: `${part}-left` })
                  }
                  if (right > 0) {
                    const stripTop = by + (top > 0 ? top * V : 0)
                    const stripH = bh - (top > 0 ? top * V : 0) - (bottom > 0 ? bottom * V : 0)
                    strips.push({ x: bx + bw - right * V, y: stripTop, w: right * V, h: stripH, key: `${part}-right` })
                  }

                  return strips.map(({ x, y, w, h, key }) => (
                    <rect
                      key={key}
                      x={x} y={y} width={Math.max(0, w)} height={Math.max(0, h)}
                      fill="#ffffff"
                      fillOpacity={0.55}
                    />
                  ))
                })}

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
