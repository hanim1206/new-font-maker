import { useMemo } from 'react'
import type { LayoutType, Part, Padding } from '../../types'
import { useLayoutStore } from '../../stores/layoutStore'
import { calculateBoxes } from '../../utils/layoutCalculator'
import { RelatedSamplesPanel } from './RelatedSamplesPanel'
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
    updateGlobalPadding,
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

  // 계산된 박스 (미리보기용 - 실효 패딩 적용)
  const calculatedBoxes = useMemo(() => {
    const schemaWithPadding = { ...schema, padding: effectivePadding }
    return calculateBoxes(schemaWithPadding)
  }, [schema, effectivePadding])

  const handleSplitChange = (index: number, value: number) => {
    updateSplit(layoutType, index, value)
  }

  const handleGlobalPaddingChange = (
    side: keyof Padding,
    value: number
  ) => {
    updateGlobalPadding(side, value)
  }

  const handleOverridePaddingChange = (
    side: keyof Padding,
    value: number
  ) => {
    setPaddingOverride(layoutType, side, value)
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
            const sliderClass =
              split.axis === 'x' ? styles.sliderX : styles.sliderY

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
                  onChange={(e) =>
                    handleSplitChange(index, parseFloat(e.target.value))
                  }
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

      {/* 글로벌 여백 */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>↔️</span>
          글로벌 여백 (전체 레이아웃)
        </h4>

        <div className={styles.paddingGrid}>
          {PADDING_SIDES.map(({ key, label }) => (
            <div key={key} className={styles.sliderGroup}>
              <div className={styles.sliderLabel}>
                <span className={styles.labelText}>{label}</span>
                <span className={styles.labelValue}>
                  {(globalPadding[key] * 100).toFixed(0)}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={0.3}
                step={0.01}
                value={globalPadding[key]}
                onChange={(e) =>
                  handleGlobalPaddingChange(key, parseFloat(e.target.value))
                }
                className={`${styles.slider} ${styles.paddingSlider}`}
              />
            </div>
          ))}
        </div>

        <p className={styles.infoText}>
          글로벌 여백은 모든 레이아웃에 일괄 적용됩니다.
        </p>
      </div>

      {/* 이 레이아웃 여백 오버라이드 */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>
          <span className={styles.sectionIcon}>🔧</span>
          이 레이아웃만 다르게
          <label className={styles.overrideToggle}>
            <input
              type="checkbox"
              checked={hasOverride}
              onChange={() => {
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
            <span className={styles.overrideToggleLabel}>오버라이드</span>
          </label>
        </h4>

        {hasOverride && (
          <div className={styles.paddingGrid}>
            {PADDING_SIDES.map(({ key, label }) => {
              const isOverridden =
                effectivePadding[key] !== globalPadding[key]
              return (
                <div key={key} className={styles.sliderGroup}>
                  <div className={styles.sliderLabel}>
                    <span
                      className={`${styles.labelText} ${isOverridden ? styles.overriddenLabel : ''}`}
                    >
                      {label}
                      {isOverridden && ' *'}
                    </span>
                    <span className={styles.labelValue}>
                      {(effectivePadding[key] * 100).toFixed(0)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.3}
                    step={0.01}
                    value={effectivePadding[key]}
                    onChange={(e) =>
                      handleOverridePaddingChange(
                        key,
                        parseFloat(e.target.value)
                      )
                    }
                    className={`${styles.slider} ${styles.overrideSlider}`}
                  />
                </div>
              )
            })}
          </div>
        )}

        {!hasOverride && (
          <p className={styles.infoText}>
            이 레이아웃에만 다른 여백을 적용하려면 오버라이드를 켜세요.
          </p>
        )}
      </div>

      {/* 연관 샘플 미리보기 */}
      <RelatedSamplesPanel
        editingType="layout"
        editingChar={null}
        layoutType={layoutType}
      />
    </div>
  )
}
