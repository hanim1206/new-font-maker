import { useUIStore } from '../../stores/uiStore'
import { CHOSEONG_LIST, JUNGSEONG_LIST, JONGSEONG_LIST } from '../../data/Hangul'
import type { LayoutType } from '../../types'
import styles from './ControlPanel.module.css'

// 레이아웃 타입 목록 및 한글 이름
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

export function ControlPanel() {
  const {
    selectedLayoutType,
    editingJamoType,
    editingJamoChar,
    setControlMode,
    setSelectedLayoutType,
    setEditingJamo,
  } = useUIStore()

  // 레이아웃 타입 선택 핸들러
  const handleLayoutSelect = (layoutType: LayoutType) => {
    setSelectedLayoutType(layoutType)
    setControlMode('layout')
    // 자소 편집 모드 해제
    setEditingJamo(null, null)
  }

  // 자소 선택 핸들러
  const handleJamoSelect = (type: 'choseong' | 'jungseong' | 'jongseong', char: string) => {
    setEditingJamo(type, char)
    setControlMode('jamo')
    // 레이아웃 편집 모드 해제
    setSelectedLayoutType(null)
  }

  return (
    <div className={styles.controlPanel}>
      <h2 className={styles.title}>편집 메뉴</h2>

      {/* 레이아웃 편집 섹션 */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>레이아웃 편집</h3>
        <div className={styles.layoutGrid}>
          {LAYOUT_TYPES.map(({ type, label }) => (
            <button
              key={type}
              className={`${styles.layoutButton} ${
                selectedLayoutType === type ? styles.selected : ''
              }`}
              onClick={() => handleLayoutSelect(type)}
              title={type}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {/* 초성 편집 섹션 */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>초성 편집</h3>
        <div className={styles.jamoGrid}>
          {CHOSEONG_LIST.map((char) => (
            <button
              key={char}
              className={`${styles.jamoButton} ${
                editingJamoType === 'choseong' && editingJamoChar === char ? styles.selected : ''
              }`}
              onClick={() => handleJamoSelect('choseong', char)}
            >
              {char}
            </button>
          ))}
        </div>
      </section>

      {/* 중성 편집 섹션 */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>중성 편집</h3>
        <div className={styles.jamoGrid}>
          {JUNGSEONG_LIST.map((char) => (
            <button
              key={char}
              className={`${styles.jamoButton} ${
                editingJamoType === 'jungseong' && editingJamoChar === char ? styles.selected : ''
              }`}
              onClick={() => handleJamoSelect('jungseong', char)}
            >
              {char}
            </button>
          ))}
        </div>
      </section>

      {/* 종성 편집 섹션 */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>종성 편집</h3>
        <div className={styles.jamoGrid}>
          {JONGSEONG_LIST.filter((c) => c !== '').map((char) => (
            <button
              key={char}
              className={`${styles.jamoButton} ${
                editingJamoType === 'jongseong' && editingJamoChar === char ? styles.selected : ''
              }`}
              onClick={() => handleJamoSelect('jongseong', char)}
            >
              {char}
            </button>
          ))}
        </div>
      </section>
    </div>
  )
}
