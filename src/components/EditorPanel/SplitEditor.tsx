import type { LayoutType, Padding } from '../../types'
import { useLayoutStore } from '../../stores/layoutStore'
import { RelatedSamplesPanel } from './RelatedSamplesPanel'
import styles from './SplitEditor.module.css'

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
    updateSplit(layoutType, index, value)
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
