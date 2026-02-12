import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import type { LayoutType } from '../../types'
import styles from './GlobalStyleEditor.module.css'

const LAYOUT_TYPES: Array<{ type: LayoutType; label: string }> = [
  { type: 'choseong-only', label: '초성만' },
  { type: 'jungseong-vertical-only', label: '세로중성만' },
  { type: 'jungseong-horizontal-only', label: '가로중성만' },
  { type: 'jungseong-mixed-only', label: '혼합중성만' },
  { type: 'choseong-jungseong-vertical', label: '초+세로중' },
  { type: 'choseong-jungseong-horizontal', label: '초+가로중' },
  { type: 'choseong-jungseong-mixed', label: '초+혼합중' },
  { type: 'choseong-jungseong-vertical-jongseong', label: '초+세로중+종' },
  { type: 'choseong-jungseong-horizontal-jongseong', label: '초+가로중+종' },
  { type: 'choseong-jungseong-mixed-jongseong', label: '초+혼합중+종' },
]

export function GlobalStyleEditor() {
  const {
    style,
    exclusions,
    updateStyle,
    addExclusion,
    removeExclusion,
    hasExclusion,
    resetStyle,
  } = useGlobalStyleStore()

  const handleExclusionToggle = (
    property: 'slant' | 'weight' | 'letterSpacing',
    layoutType: LayoutType
  ) => {
    const id = `${property}-${layoutType}`
    if (hasExclusion(property, layoutType)) {
      removeExclusion(id)
    } else {
      addExclusion(property, layoutType)
    }
  }

  return (
    <div className={styles.container}>
      {/* 기울기 */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>기울기 (Slant)</h4>
        <div className={styles.sliderGroup}>
          <div className={styles.sliderLabel}>
            <span className={styles.labelText}>각도</span>
            <span className={styles.labelValue}>{style.slant.toFixed(1)}°</span>
          </div>
          <input
            type="range"
            min={-30}
            max={30}
            step={0.5}
            value={style.slant}
            onChange={(e) => updateStyle('slant', parseFloat(e.target.value))}
            className={styles.slider}
          />
        </div>
      </div>

      {/* 두께 */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>두께 (Weight)</h4>
        <div className={styles.sliderGroup}>
          <div className={styles.sliderLabel}>
            <span className={styles.labelText}>배율</span>
            <span className={styles.labelValue}>{style.weight.toFixed(2)}x</span>
          </div>
          <input
            type="range"
            min={0.3}
            max={3.0}
            step={0.05}
            value={style.weight}
            onChange={(e) => updateStyle('weight', parseFloat(e.target.value))}
            className={styles.slider}
          />
        </div>
      </div>

      {/* 자간 */}
      <div className={styles.section}>
        <h4 className={styles.sectionTitle}>자간 (Letter Spacing)</h4>
        <div className={styles.sliderGroup}>
          <div className={styles.sliderLabel}>
            <span className={styles.labelText}>간격</span>
            <span className={styles.labelValue}>
              {(style.letterSpacing * 100).toFixed(0)}%
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={0.3}
            step={0.01}
            value={style.letterSpacing}
            onChange={(e) =>
              updateStyle('letterSpacing', parseFloat(e.target.value))
            }
            className={styles.slider}
          />
        </div>
      </div>

      {/* 레이아웃별 제외 설정 */}
      {(style.slant !== 0 ||
        style.weight !== 1.0 ||
        style.letterSpacing !== 0) && (
        <div className={styles.section}>
          <h4 className={styles.sectionTitle}>레이아웃별 제외</h4>
          <p className={styles.infoText}>
            특정 레이아웃에서 글로벌 속성을 적용하지 않으려면 체크하세요.
          </p>

          <div className={styles.exclusionGrid}>
            {LAYOUT_TYPES.map(({ type, label }) => {
              const hasAnyExclusion =
                hasExclusion('slant', type) ||
                hasExclusion('weight', type) ||
                hasExclusion('letterSpacing', type)

              return (
                <div
                  key={type}
                  className={`${styles.exclusionRow} ${
                    hasAnyExclusion ? styles.hasExclusion : ''
                  }`}
                >
                  <span className={styles.exclusionLabel}>{label}</span>
                  <div className={styles.exclusionCheckboxes}>
                    {style.slant !== 0 && (
                      <label className={styles.checkbox}>
                        <input
                          type="checkbox"
                          checked={hasExclusion('slant', type)}
                          onChange={() =>
                            handleExclusionToggle('slant', type)
                          }
                        />
                        <span className={styles.checkboxLabel}>기울기</span>
                      </label>
                    )}
                    {style.weight !== 1.0 && (
                      <label className={styles.checkbox}>
                        <input
                          type="checkbox"
                          checked={hasExclusion('weight', type)}
                          onChange={() =>
                            handleExclusionToggle('weight', type)
                          }
                        />
                        <span className={styles.checkboxLabel}>두께</span>
                      </label>
                    )}
                    {style.letterSpacing !== 0 && (
                      <label className={styles.checkbox}>
                        <input
                          type="checkbox"
                          checked={hasExclusion('letterSpacing', type)}
                          onChange={() =>
                            handleExclusionToggle('letterSpacing', type)
                          }
                        />
                        <span className={styles.checkboxLabel}>자간</span>
                      </label>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {exclusions.length > 0 && (
            <p className={styles.exclusionCount}>
              {exclusions.length}개 제외 규칙 적용 중
            </p>
          )}
        </div>
      )}

      {/* 리셋 */}
      <div className={styles.resetSection}>
        <button className={styles.resetButton} onClick={resetStyle}>
          전체 초기화
        </button>
      </div>
    </div>
  )
}
