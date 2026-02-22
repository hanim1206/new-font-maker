import type { LayoutType, Part, PartOverride } from '../../types'
import { useLayoutStore } from '../../stores/layoutStore'
import { cn } from '@/lib/utils'
import { Slider } from '@/components/ui/slider'
import { Button } from '@/components/ui/button'
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card'

interface SplitEditorProps {
  layoutType: LayoutType
  selectedPart?: Part | null
}

const OVERRIDE_SIDES: Array<{ key: keyof PartOverride; label: string }> = [
  { key: 'top', label: '상단' },
  { key: 'bottom', label: '하단' },
  { key: 'left', label: '좌측' },
  { key: 'right', label: '우측' },
]

export function SplitEditor({ layoutType, selectedPart }: SplitEditorProps) {
  const {
    getLayoutSchema,
    updatePartOverride,
    resetPartOverride,
  } = useLayoutStore()
  const schema = getLayoutSchema(layoutType)

  return (
    <div className="flex flex-col gap-4">
      {selectedPart && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2">
              <span className="text-lg">📐</span>
              파트 오프셋: {selectedPart}
              <Button
                variant="default"
                size="sm"
                className="ml-auto text-xs"
                onClick={() => resetPartOverride(layoutType, selectedPart)}
              >
                리셋
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-[0.75rem] text-text-dim-5 mb-3 leading-relaxed">
              양수 = 안쪽 축소, 음수 = 바깥 확장 (오버랩)
            </p>

            <div className="grid grid-cols-2 gap-4">
              {OVERRIDE_SIDES.map(({ key, label }) => {
                const currentOverride = schema.partOverrides?.[selectedPart]
                const value = currentOverride?.[key] ?? 0
                const isNonZero = value !== 0

                return (
                  <div key={key}>
                    <div className="flex justify-between items-center mb-2">
                      <span
                        className={cn(
                          'text-base font-medium',
                          isNonZero
                            ? value < 0 ? 'text-accent-cyan' : 'text-accent-orange'
                            : 'text-text-dim-1'
                        )}
                      >
                        {label}
                        {isNonZero && (value < 0 ? ' ↔' : ' ↤')}
                      </span>
                      <span className="text-sm text-text-dim-4 font-mono bg-surface-2 px-2 py-0.5 rounded-sm">
                        {(value * 100).toFixed(1)}%
                      </span>
                    </div>
                    <Slider
                      min={0}
                      max={0.3}
                      step={0.005}
                      value={[value]}
                      onValueChange={([val]) =>
                        updatePartOverride(layoutType, selectedPart, key, val)
                      }
                      colorScheme="override"
                    />
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
