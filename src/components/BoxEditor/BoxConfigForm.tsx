import type { LayoutType, BoxConfig, Part } from '../../types'
import styles from './BoxConfigForm.module.css'

interface BoxConfigFormProps {
  layoutType: LayoutType
  boxes: Record<string, BoxConfig>
  onChange: (part: Part, prop: keyof BoxConfig, value: number) => void
}

// Part 타입별 한글 이름
const PART_NAMES: Record<Part, string> = {
  CH: '초성',
  JU: '중성',
  JU_H: '중성-가로',
  JU_V: '중성-세로',
  JO: '종성',
}

export function BoxConfigForm({ layoutType, boxes, onChange }: BoxConfigFormProps) {
  // 현재 레이아웃 타입에 필요한 Part들 결정
  const shouldShowJU_H = layoutType.includes('mixed')
  const shouldShowJU_V = layoutType.includes('mixed')
  const shouldShowJU = !layoutType.includes('mixed') && layoutType.includes('jungseong')
  const shouldShowCH = layoutType.includes('choseong')
  const shouldShowJO = layoutType.includes('jongseong')

  const handleInputChange = (part: Part, prop: keyof BoxConfig, valueStr: string) => {
    const value = parseFloat(valueStr)
    if (!isNaN(value) && value >= 0 && value <= 1) {
      onChange(part, prop, value)
    }
  }

  const renderBoxInputs = (part: Part) => {
    const box = boxes[part]
    if (!box) return null

    return (
      <div key={part} className={styles.boxGroup}>
        <div className={styles.boxHeader}>
          <span className={styles.boxLabel}>{PART_NAMES[part]}</span>
          <span className={styles.boxPart}>({part})</span>
        </div>
        <div className={styles.inputGrid}>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>X</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={box.x.toFixed(2)}
              onChange={(e) => handleInputChange(part, 'x', e.target.value)}
              className={styles.numberInput}
            />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Y</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={box.y.toFixed(2)}
              onChange={(e) => handleInputChange(part, 'y', e.target.value)}
              className={styles.numberInput}
            />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Width</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={box.width.toFixed(2)}
              onChange={(e) => handleInputChange(part, 'width', e.target.value)}
              className={styles.numberInput}
            />
          </div>
          <div className={styles.inputGroup}>
            <label className={styles.inputLabel}>Height</label>
            <input
              type="number"
              min="0"
              max="1"
              step="0.01"
              value={box.height.toFixed(2)}
              onChange={(e) => handleInputChange(part, 'height', e.target.value)}
              className={styles.numberInput}
            />
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className={styles.formContainer}>
      {shouldShowCH && renderBoxInputs('CH')}
      {shouldShowJU && renderBoxInputs('JU')}
      {shouldShowJU_H && renderBoxInputs('JU_H')}
      {shouldShowJU_V && renderBoxInputs('JU_V')}
      {shouldShowJO && renderBoxInputs('JO')}
    </div>
  )
}
