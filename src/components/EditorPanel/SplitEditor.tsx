import { useMemo } from 'react'
import type { LayoutType, Part } from '../../types'
import { useLayoutStore } from '../../stores/layoutStore'
import { calculateBoxes } from '../../utils/layoutCalculator'
import styles from './SplitEditor.module.css'

interface SplitEditorProps {
  layoutType: LayoutType
}

// 슬롯별 한글 이름
const SLOT_NAMES: Record<Part, string> = {
  CH: '초성',
  JU: '중성',
  JU_H: '중성-가로',
  JU_V: '중성-세로',
  JO: '종성',
}

// Split 축별 한글 설명
const AXIS_NAMES = {
  x: 'X축 (좌우 분할)',
  y: 'Y축 (상하 분할)',
}

export function SplitEditor({ layoutType }: SplitEditorProps) {
  const { getLayoutSchema, updateSplit, updatePadding } = useLayoutStore()
  const schema = getLayoutSchema(layoutType)

  const splits = schema.splits || []
  const padding = schema.padding || { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 }
  const hasSplits = splits.length > 0

  // 계산된 박스 (미리보기용)
  const calculatedBoxes = useMemo(() => calculateBoxes(schema), [schema])

  const handleSplitChange = (index: number, value: number) => {
    updateSplit(layoutType, index, value)
  }

  const handlePaddingChange = (side: 'top' | 'bottom' | 'left' | 'right', value: number) => {
    updatePadding(layoutType, side, value)
  }

  // Split 슬라이더 범위 결정
  const getSplitRange = (index: number, axis: 'x' | 'y') => {
    // 기본 범위: 0.2 ~ 0.8
    let min = 0.2
    let max = 0.8

    // 같은 축의 다른 split이 있으면 범위 조정
    const samAxisSplits = splits.filter((s) => s.axis === axis)
    const currentIndex = samAxisSplits.findIndex((_, i) => {
      let count = 0
      for (let j = 0; j <= index; j++) {
        if (splits[j].axis === axis) count++
      }
      return i === count - 1
    })

    if (samAxisSplits.length > 1) {
      if (currentIndex === 0) {
        max = (samAxisSplits[1]?.value ?? 0.8) - 0.05
      } else if (currentIndex === samAxisSplits.length - 1) {
        min = (samAxisSplits[currentIndex - 1]?.value ?? 0.2) + 0.05
      }
    }

    return { min, max }
  }

  return (
    <div className={styles.container}>
              {/* 비주얼 미리보기 */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>👁️</span>
          레이아웃 미리보기
        </h4>
        <div className={styles.visualPreview}>
          {/* Split 라인 표시 */}
          {splits.map((split, index) =>
            split.axis === 'x' ? (
              <div
                key={`line-x-${index}`}
                className={styles.splitLineX}
                style={{ left: `${split.value * 100}%` }}
              />
            ) : (
              <div
                key={`line-y-${index}`}
                className={styles.splitLineY}
                style={{ top: `${split.value * 100}%` }}
              />
            )
          )}

          {/* 슬롯 영역 표시 */}
          {Object.entries(calculatedBoxes).map(([part, box]) => {
            if (!box) return null
            const colorMap: Record<string, string> = {
              CH: '#ff6b6b',
              JU: '#4ecdc4',
              JU_H: '#ff9500',
              JU_V: '#ffd700',
              JO: '#4169e1',
            }
            return (
              <div
                key={part}
                className={styles.slotArea}
                style={{
                  left: `${box.x * 100}%`,
                  top: `${box.y * 100}%`,
                  width: `${box.width * 100}%`,
                  height: `${box.height * 100}%`,
                  borderColor: colorMap[part] || '#666',
                  backgroundColor: `${colorMap[part]}15`,
                }}
              >
                {part}
              </div>
            )
          })}
        </div>
      </div>
      {/* 슬롯 정보 */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>📦</span>
          슬롯 구성
        </h4>
        <div className={styles.slotsInfo}>
          {schema.slots.map((slot) => (
            <span
              key={slot}
              className={`${styles.slotBadge} ${styles[`slot${slot.replace('_', '')}`] || styles.slotJU}`}
            >
              {SLOT_NAMES[slot]} ({slot})
            </span>
          ))}
        </div>
      </div>

      {/* Split 편집기 */}
      {hasSplits && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>
            <span className={styles.sectionIcon}>✂️</span>
            기준선 (Split)
          </h4>

          {splits.map((split, index) => {
            const range = getSplitRange(index, split.axis)
            const sliderClass = split.axis === 'x' ? styles.sliderX : styles.sliderY

            return (
              <div key={`split-${index}`} className={styles.sliderGroup}>
                <div className={styles.sliderLabel}>
                  <span className={styles.labelText}>
                    {AXIS_NAMES[split.axis]} #{index + 1}
                  </span>
                  <span className={styles.labelValue}>
                    {(split.value * 100).toFixed(0)}%
                  </span>
                </div>
                <input
                  type="range"
                  min={range.min}
                  max={range.max}
                  step={0.01}
                  value={split.value}
                  onChange={(e) => handleSplitChange(index, parseFloat(e.target.value))}
                  className={`${styles.slider} ${sliderClass}`}
                />
              </div>
            )
          })}

          <p className={styles.infoText}>
            기준선을 이동하면 관련 슬롯의 크기가 자동으로 조정됩니다.
          </p>
        </div>
      )}

      {/* Padding 편집기 (Split 없거나 고급 옵션) */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>↔️</span>
          여백 (Padding)
        </h4>

        <div className={styles.paddingGrid}>
          <div className={styles.sliderGroup}>
            <div className={styles.sliderLabel}>
              <span className={styles.labelText}>상단</span>
              <span className={styles.labelValue}>{(padding.top * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={0.3}
              step={0.01}
              value={padding.top}
              onChange={(e) => handlePaddingChange('top', parseFloat(e.target.value))}
              className={`${styles.slider} ${styles.paddingSlider}`}
            />
          </div>

          <div className={styles.sliderGroup}>
            <div className={styles.sliderLabel}>
              <span className={styles.labelText}>하단</span>
              <span className={styles.labelValue}>{(padding.bottom * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={0.3}
              step={0.01}
              value={padding.bottom}
              onChange={(e) => handlePaddingChange('bottom', parseFloat(e.target.value))}
              className={`${styles.slider} ${styles.paddingSlider}`}
            />
          </div>

          <div className={styles.sliderGroup}>
            <div className={styles.sliderLabel}>
              <span className={styles.labelText}>좌측</span>
              <span className={styles.labelValue}>{(padding.left * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={0.3}
              step={0.01}
              value={padding.left}
              onChange={(e) => handlePaddingChange('left', parseFloat(e.target.value))}
              className={`${styles.slider} ${styles.paddingSlider}`}
            />
          </div>

          <div className={styles.sliderGroup}>
            <div className={styles.sliderLabel}>
              <span className={styles.labelText}>우측</span>
              <span className={styles.labelValue}>{(padding.right * 100).toFixed(0)}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={0.3}
              step={0.01}
              value={padding.right}
              onChange={(e) => handlePaddingChange('right', parseFloat(e.target.value))}
              className={`${styles.slider} ${styles.paddingSlider}`}
            />
          </div>
        </div>

        {!hasSplits && (
          <p className={styles.infoText}>
            Split이 없는 레이아웃은 여백으로 슬롯 위치를 조정합니다.
          </p>
        )}
      </div>


    </div>
  )
}

