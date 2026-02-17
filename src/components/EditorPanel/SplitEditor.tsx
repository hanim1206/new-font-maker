import type { LayoutType, Padding } from '../../types'
import { useLayoutStore } from '../../stores/layoutStore'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Checkbox } from '@/components/ui/checkbox'

interface SplitEditorProps {
  layoutType: LayoutType
}

// Split 축별 한글 설명
const AXIS_NAMES = {
  x: 'X축 (좌우 분할)',
  y: 'Y축 (상하 분할)',
}

const PADDING_SIDES: Array<{ key: keyof Padding; label: string }> = [
  { key: 'top', label: '상단' },
  { key: 'bottom', label: '하단' },
  { key: 'left', label: '좌측' },
  { key: 'right', label: '우측' },
]

export function SplitEditor({ layoutType }: SplitEditorProps) {
  const {
    getLayoutSchema,
    updateSplit,
    globalPadding,
    getEffectivePadding,
    hasPaddingOverride,
    setPaddingOverride,
    removePaddingOverride,
  } = useLayoutStore()
  const schema = getLayoutSchema(layoutType)

  const splits = schema.splits || []
  const hasSplits = splits.length > 0
  const hasOverride = hasPaddingOverride(layoutType)
  const effectivePadding = getEffectivePadding(layoutType)

  const handleSplitChange = (index: number, value: number) => {
    if (splits[index] && splits[index].value === value) return
    updateSplit(layoutType, index, value)
  }

  const handleOverridePaddingChange = (
    side: keyof Padding,
    value: number
  ) => {
    setPaddingOverride(layoutType, side, value)
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Split 편집기 */}
      {hasSplits && (
        <div className="p-4 bg-surface rounded-md border border-border-subtle">
          <h4 className="text-sm font-medium m-0 mb-4 text-text-dim-4 uppercase tracking-wider flex items-center gap-2">
            <span className="text-lg">✂️</span>
            기준선 (Split)
          </h4>

          {splits.map((split, index) => {
            const colorScheme = split.axis === 'x' ? 'x' as const : 'y' as const

            return (
              <div key={`split-${index}`} className="mb-4 last:mb-0">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-base text-text-dim-1 font-medium">
                    {AXIS_NAMES[split.axis]} #{index + 1}
                  </span>
                  <span className="text-sm text-text-dim-4 font-mono bg-surface-2 px-2 py-0.5 rounded-sm">
                    {(split.value * 100).toFixed(1)}%
                  </span>
                </div>
                <Slider
                  min={0.1}
                  max={0.9}
                  step={0.025}
                  value={[split.value]}
                  onValueChange={([val]) => handleSplitChange(index, val)}
                  colorScheme={colorScheme}
                />
              </div>
            )
          })}

          <p className="text-[0.8rem] text-text-dim-5 mt-3 pt-3 border-t border-border-subtle leading-relaxed">
            기준선을 이동하면 관련 슬롯의 크기가 자동으로 조정됩니다.
          </p>
        </div>
      )}

      {/* 이 레이아웃 여백 오버라이드 */}
      <div className="p-4 bg-surface rounded-md border border-border-subtle">
        <h4 className="text-sm font-medium m-0 mb-4 text-text-dim-4 uppercase tracking-wider flex items-center gap-2">
          <span className="text-lg">🔧</span>
          이 레이아웃만 다르게
          <label className="flex items-center gap-1.5 ml-auto cursor-pointer">
            <Checkbox
              checked={hasOverride}
              onCheckedChange={() => {
                if (hasOverride) {
                  removePaddingOverride(layoutType)
                } else {
                  // 현재 글로벌 값으로 오버라이드 초기화
                  for (const { key } of PADDING_SIDES) {
                    setPaddingOverride(layoutType, key, globalPadding[key])
                  }
                }
              }}
            />
            <span className="text-xs font-normal text-text-dim-4 normal-case tracking-normal">
              오버라이드
            </span>
          </label>
        </h4>

        {hasOverride && (
          <div className="grid grid-cols-2 gap-4">
            {PADDING_SIDES.map(({ key, label }) => {
              const isOverridden =
                effectivePadding[key] !== globalPadding[key]
              return (
                <div key={key} className="mb-4 last:mb-0">
                  <div className="flex justify-between items-center mb-2">
                    <span
                      className={cn(
                        'text-base font-medium',
                        isOverridden ? 'text-accent-orange' : 'text-text-dim-1'
                      )}
                    >
                      {label}
                      {isOverridden && ' *'}
                    </span>
                    <span className="text-sm text-text-dim-4 font-mono bg-surface-2 px-2 py-0.5 rounded-sm">
                      {(effectivePadding[key] * 100).toFixed(1)}%
                    </span>
                  </div>
                  <Slider
                    min={0}
                    max={0.3}
                    step={0.025}
                    value={[effectivePadding[key]]}
                    onValueChange={([val]) =>
                      handleOverridePaddingChange(key, val)
                    }
                    colorScheme="override"
                  />
                </div>
              )
            })}
          </div>
        )}

        {!hasOverride && (
          <p className="text-[0.8rem] text-text-dim-5 mt-3 pt-3 border-t border-border-subtle leading-relaxed">
            이 레이아웃에만 다른 여백을 적용하려면 오버라이드를 켜세요.
          </p>
        )}
      </div>

      {/* 연관 샘플은 LayoutEditor 미리보기 영역 아래에 표시 */}
    </div>
  )
}
