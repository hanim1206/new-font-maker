import type { ReactNode } from 'react'
import type { JamoContextPreview } from '../../services/mobileEditorContext'
import type { MobileEditorPart } from '../../types'
import styles from './JamoContextStrip.module.css'

interface JamoContextStripProps {
  jamoChar: string
  part: MobileEditorPart
  items: JamoContextPreview[]
  onSelect: (syllable: string) => void
  renderPreview: (syllable: string) => ReactNode
}

export function JamoContextStrip({
  jamoChar,
  part,
  items,
  onSelect,
  renderPreview,
}: JamoContextStripProps) {
  const role = part === 'CH' ? '초성' : part === 'JU' ? '중성' : '종성'
  return (
    <section className={styles.section} aria-label={`${role} ${jamoChar} 적용 문맥`}>
      <div className={styles.header}>
        <h2 className={styles.title}>{role} {jamoChar} 적용 문맥</h2>
        <span className={styles.scope}>보기 전용</span>
      </div>
      <div className={`${styles.list} ${items.length === 3 ? styles.threeColumns : ''} ${items.length === 5 ? styles.fiveColumns : ''}`}>
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={styles.card}
            disabled={!item.syllable}
            aria-current={item.active ? 'true' : undefined}
            aria-label={`${item.label} 문맥 ${item.syllable ?? '사용 불가'}`}
            onClick={() => { if (item.syllable) onSelect(item.syllable) }}
          >
            <span className={styles.preview} aria-hidden="true">{item.syllable ? renderPreview(item.syllable) : '—'}</span>
            <span className={styles.label}>{item.label}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
