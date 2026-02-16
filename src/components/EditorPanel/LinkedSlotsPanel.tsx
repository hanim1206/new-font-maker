import { useState, useMemo } from 'react'
import { getLinkedSlots } from '../../utils/jamoLinkUtils'
import { useJamoStore } from '../../stores/jamoStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import { decomposeSyllable } from '../../utils/hangulUtils'
import { CHOSEONG_LIST, JUNGSEONG_LIST, JONGSEONG_LIST } from '../../data/Hangul'
import { cn } from '@/lib/utils'
import { Checkbox } from '@/components/ui/checkbox'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

interface LinkedSlotsPanelProps {
  jamoType: 'choseong' | 'jungseong' | 'jongseong'
  jamoChar: string
  onApplyToLinked: (linkedSlots: Array<{ type: 'choseong' | 'jungseong' | 'jongseong'; char: string }>) => void
}

/**
 * 자모 타입과 문자로 샘플 음절을 생성
 * 초성 → 해당 초성 + ㅏ (예: ㄱ → 가)
 * 중성 → ㄱ + 해당 중성 (예: ㅏ → 가)
 * 종성 → ㅎ + ㅏ + 해당 종성 (예: ㄴ → 한)
 */
function buildSampleChar(type: 'choseong' | 'jungseong' | 'jongseong', char: string): string | null {
  let chIdx: number, juIdx: number, joIdx: number

  if (type === 'choseong') {
    chIdx = CHOSEONG_LIST.indexOf(char as typeof CHOSEONG_LIST[number])
    if (chIdx === -1) return null
    juIdx = 0 // ㅏ
    joIdx = 0 // 종성 없음
  } else if (type === 'jungseong') {
    chIdx = 0 // ㄱ
    juIdx = JUNGSEONG_LIST.indexOf(char as typeof JUNGSEONG_LIST[number])
    if (juIdx === -1) return null
    joIdx = 0
  } else {
    chIdx = 18 // ㅎ
    juIdx = 0  // ㅏ
    joIdx = JONGSEONG_LIST.indexOf(char as typeof JONGSEONG_LIST[number])
    if (joIdx === -1) return null
  }

  const code = (chIdx * 21 + juIdx) * 28 + joIdx + 0xac00
  return String.fromCharCode(code)
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

  const { choseong, jungseong, jongseong } = useJamoStore()
  const { getLayoutSchema, getEffectivePadding } = useLayoutStore()
  const { getEffectiveStyle } = useGlobalStyleStore()

  // 각 연관 슬롯의 샘플 음절 미리보기 데이터
  const slotPreviews = useMemo(() => {
    return linkedSlots.map((slot) => {
      const sampleChar = buildSampleChar(slot.type, slot.char)
      if (!sampleChar) return { slot, syllable: null }

      const syllable = decomposeSyllable(sampleChar, choseong, jungseong, jongseong)
      return { slot, syllable, sampleChar }
    })
  }, [linkedSlots, choseong, jungseong, jongseong])

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
        {slotPreviews.map(({ slot, syllable, sampleChar }) => {
          const key = `${slot.type}-${slot.char}`
          const typeLabel = SLOT_TYPE_LABEL[slot.type]
          const badgeVariant = SLOT_TYPE_BADGE_VARIANT[slot.type]

          // 미리보기용 스키마
          const schema = syllable ? getLayoutSchema(syllable.layoutType) : null
          const effectivePadding = syllable ? getEffectivePadding(syllable.layoutType) : null
          const schemaWithPadding = schema && effectivePadding
            ? { ...schema, padding: effectivePadding }
            : null
          const effectiveStyle = syllable ? getEffectiveStyle(syllable.layoutType) : undefined

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
              {/* 샘플 음절 미리보기 */}
              {syllable && schemaWithPadding ? (
                <div className="flex-shrink-0 bg-surface-2 rounded border border-border-subtle">
                  <SvgRenderer
                    syllable={syllable}
                    schema={schemaWithPadding}
                    size={36}
                    fillColor="#c0c0c0"
                    globalStyle={effectiveStyle}
                  />
                </div>
              ) : (
                <div className="w-9 h-9 flex-shrink-0" />
              )}
              <span className="text-xl font-semibold text-text-dim-1 min-w-[20px] text-center">
                {slot.char}
              </span>
              <Badge variant={badgeVariant}>{typeLabel}</Badge>
              <span className="text-xs text-text-dim-5 ml-auto">
                {sampleChar && <span className="text-text-dim-4 mr-1">{sampleChar}</span>}
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
