import { useUIStore } from '../../stores/uiStore'
import { CHOSEONG_LIST, JUNGSEONG_LIST, JONGSEONG_LIST } from '../../data/Hangul'
import { getLayoutsForJamoType, classifyJungseong, LAYOUT_LABELS } from '../../utils/hangulUtils'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion'
import type { LayoutType, Part } from '../../types'

const ALL_LAYOUT_TYPES: Array<{ type: LayoutType; label: string }> = Object.entries(
  LAYOUT_LABELS
).map(([type, label]) => ({ type: type as LayoutType, label }))

function jamoTypeToPart(jamoType: 'choseong' | 'jungseong' | 'jongseong', jamoChar: string): Part {
  if (jamoType === 'choseong') return 'CH'
  if (jamoType === 'jongseong') return 'JO'
  const subType = classifyJungseong(jamoChar)
  if (subType === 'mixed') return 'JU_H'
  return 'JU'
}

export function ControlPanel() {
  const {
    controlMode,
    selectedLayoutType,
    editingPartInLayout,
    editingJamoChar,
    setControlMode,
    setSelectedLayoutType,
    setEditingJamo,
    setEditingPartInLayout,
    setActiveMobileDrawer,
  } = useUIStore()

  const handleLayoutSelect = (layoutType: LayoutType) => {
    setSelectedLayoutType(layoutType)
    setControlMode('layout')
    setEditingJamo(null, null)
    setEditingPartInLayout(null)
    setActiveMobileDrawer(null)
  }

  const handleJamoSelect = (
    type: 'choseong' | 'jungseong' | 'jongseong',
    char: string
  ) => {
    const subType = type === 'jungseong' ? classifyJungseong(char) : undefined
    const layouts = getLayoutsForJamoType(type, subType)
    const firstLayout = layouts[0]
    if (!firstLayout) return

    setSelectedLayoutType(firstLayout)
    setControlMode('layout')
    setEditingJamo(type, char)
    setEditingPartInLayout(jamoTypeToPart(type, char))
    setActiveMobileDrawer(null)
  }

  return (
    <div className="p-5 bg-background scrollbar-thin scrollbar-track-background scrollbar-thumb-border">
      <Accordion type="multiple" defaultValue={['layout', 'choseong', 'jungseong', 'jongseong']}>
        <AccordionItem value="layout">
          <AccordionTrigger>레이아웃 편집</AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-2 gap-2">
              {ALL_LAYOUT_TYPES.map(({ type, label }) => (
                <Button
                  key={type}
                  variant={selectedLayoutType === type ? 'blue' : 'default'}
                  size="sm"
                  className="py-3 text-center leading-tight"
                  onClick={() => handleLayoutSelect(type)}
                  title={type}
                >
                  {label}
                </Button>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="choseong">
          <AccordionTrigger>
            초성 편집
            <span className="text-xs text-text-dim-5 ml-2 normal-case font-normal">클릭 → 레이아웃 내 편집</span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-5 gap-1.5">
              {CHOSEONG_LIST.map((char) => (
                <button
                  key={char}
                  className={cn(
                    'aspect-square text-lg bg-surface-2 text-text-dim-1 border border-border rounded-sm cursor-pointer transition-all flex items-center justify-center',
                    'hover:bg-surface-hover hover:border-border-light hover:text-foreground',
                    editingPartInLayout === 'CH' &&
                    controlMode === 'layout' &&
                    editingJamoChar === char &&
                    'bg-accent-blue border-accent-blue-hover text-white font-semibold'
                  )}
                  onClick={() => handleJamoSelect('choseong', char)}
                >
                  {char}
                </button>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="jungseong">
          <AccordionTrigger>
            중성 편집
            <span className="text-xs text-text-dim-5 ml-2 normal-case font-normal">클릭 → 레이아웃 내 편집</span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-5 gap-1.5">
              {JUNGSEONG_LIST.map((char) => (
                <button
                  key={char}
                  className={cn(
                    'aspect-square text-lg bg-surface-2 text-text-dim-1 border border-border rounded-sm cursor-pointer transition-all flex items-center justify-center',
                    'hover:bg-surface-hover hover:border-border-light hover:text-foreground',
                    editingPartInLayout &&
                    (editingPartInLayout === 'JU' || editingPartInLayout === 'JU_H' || editingPartInLayout === 'JU_V') &&
                    controlMode === 'layout' &&
                    editingJamoChar === char &&
                    'bg-accent-blue border-accent-blue-hover text-white font-semibold'
                  )}
                  onClick={() => handleJamoSelect('jungseong', char)}
                >
                  {char}
                </button>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>

        <AccordionItem value="jongseong">
          <AccordionTrigger>
            종성 편집
            <span className="text-xs text-text-dim-5 ml-2 normal-case font-normal">클릭 → 레이아웃 내 편집</span>
          </AccordionTrigger>
          <AccordionContent>
            <div className="grid grid-cols-5 gap-1.5">
              {JONGSEONG_LIST.filter((c) => c !== '').map((char) => (
                <button
                  key={char}
                  className={cn(
                    'aspect-square text-lg bg-surface-2 text-text-dim-1 border border-border rounded-sm cursor-pointer transition-all flex items-center justify-center',
                    'hover:bg-surface-hover hover:border-border-light hover:text-foreground',
                    editingPartInLayout === 'JO' &&
                    controlMode === 'layout' &&
                    editingJamoChar === char &&
                    'bg-accent-blue border-accent-blue-hover text-white font-semibold'
                  )}
                  onClick={() => handleJamoSelect('jongseong', char)}
                >
                  {char}
                </button>
              ))}
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  )
}
