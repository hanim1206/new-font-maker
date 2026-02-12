import { useState } from 'react'
import { getLinkedSlots } from '../../utils/jamoLinkUtils'
import styles from './LinkedSlotsPanel.module.css'

interface LinkedSlotsPanelProps {
  jamoType: 'choseong' | 'jungseong' | 'jongseong'
  jamoChar: string
  onApplyToLinked: (linkedSlots: Array<{ type: 'choseong' | 'jungseong' | 'jongseong'; char: string }>) => void
}

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
    <div className={styles.container}>
      <h4 className={styles.title}>연관 슬롯</h4>
      <p className={styles.description}>
        저장 시 아래 슬롯에도 동일한 변경을 적용할 수 있습니다.
      </p>
      <div className={styles.slotList}>
        {linkedSlots.map((slot) => {
          const key = `${slot.type}-${slot.char}`
          const typeLabel =
            slot.type === 'choseong'
              ? '초성'
              : slot.type === 'jungseong'
                ? '중성'
                : '종성'

          return (
            <label key={key} className={styles.slotItem}>
              <input
                type="checkbox"
                checked={checkedSlots.has(key)}
                onChange={() => handleToggle(key)}
              />
              <span className={styles.slotChar}>{slot.char}</span>
              <span className={styles.slotType}>{typeLabel}</span>
              <span className={styles.slotReason}>{slot.reason}</span>
            </label>
          )
        })}
      </div>
      {hasChecked && (
        <button className={styles.applyButton} onClick={handleApply}>
          선택한 슬롯에도 적용 ({checkedSlots.size}개)
        </button>
      )}
    </div>
  )
}
