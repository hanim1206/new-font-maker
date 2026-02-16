import { useState } from 'react'
import { getLinkedSlots } from '../../utils/jamoLinkUtils'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface LinkedSlotsPanelProps {
  jamoType: 'choseong' | 'jungseong' | 'jongseong'
  jamoChar: string
  onApplyToLinked: (linkedSlots: Array<{ type: 'choseong' | 'jungseong' | 'jongseong'; char: string }>) => void
}

const SLOT_TYPE_BADGE_VARIANT = {
  choseong: 'ch',
  jungseong: 'ju',
  jongseong: 'jo',
} as const

const SLOT_TYPE_LABEL = {
  choseong: '초성',
  jungseong: '중성',
  jongseong: '종성',
} as const

export function LinkedSlotsPanel({
  jamoType,
  jamoChar,
  onApplyToLinked,
}: LinkedSlotsPanelProps) {
  const linkedSlots = getLinkedSlots(jamoType, jamoChar)
  const [checkedSlots, setCheckedSlots] = useState<Set<string>>(new Set())

  if (linkedSlots.length === 0) return null

  const handleToggle = (key: string) => {
    setCheckedSlots((prev) => {
      const next = new Set(prev)
      if (next.has(key)) {
        next.delete(key)
      } else {
        next.add(key)
      }
      return next
    })
  }

  const handleApply = () => {
    const selected = linkedSlots.filter((slot) =>
      checkedSlots.has(`${slot.type}-${slot.char}`)
    )
    if (selected.length > 0) {
      onApplyToLinked(selected)
    }
  }

  const hasChecked = checkedSlots.size > 0

  return (
    <div className="p-4 bg-surface rounded-md border border-border-subtle mx-5">
      <h4 className="text-sm font-medium m-0 mb-2 text-text-dim-4 uppercase tracking-wider">
        연관 슬롯
      </h4>
      <p className="text-[0.8rem] text-text-dim-5 m-0 mb-3 leading-relaxed">
        저장 시 아래 슬롯에도 동일한 변경을 적용할 수 있습니다.
      </p>
      <div className="flex flex-col gap-1.5">
        {linkedSlots.map((slot) => {
          const key = `${slot.type}-${slot.char}`
          const typeLabel = SLOT_TYPE_LABEL[slot.type]
          const badgeVariant = SLOT_TYPE_BADGE_VARIANT[slot.type]

          return (
            <label
              key={key}
              className={cn(
                'flex items-center gap-2 px-2.5 py-2 bg-background rounded cursor-pointer transition-colors',
                'hover:bg-surface'
              )}
            >
              <Checkbox
                checked={checkedSlots.has(key)}
                onCheckedChange={() => handleToggle(key)}
              />
              <span className="text-xl font-semibold text-text-dim-1 min-w-[20px] text-center">
                {slot.char}
              </span>
              <Badge variant={badgeVariant}>{typeLabel}</Badge>
              <span className="text-xs text-text-dim-5 ml-auto">
                {slot.reason}
              </span>
            </label>
          )
        })}
      </div>
      {hasChecked && (
        <Button
          variant="blue"
          className="w-full mt-3"
          onClick={handleApply}
        >
          선택한 슬롯에도 적용 ({checkedSlots.size}개)
        </Button>
      )}
    </div>
  )
}
