import { useMemo, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useJamoStore } from '../../stores/jamoStore'
import { CHOSEONG_LIST, JUNGSEONG_LIST, JONGSEONG_LIST } from '../../data/Hangul'
import { decomposeSyllable, isHangul } from '../../utils/hangulUtils'
import type { LayoutType } from '../../types'
import styles from './ControlPanel.module.css'

// 레이아웃 타입 한글 이름
const LAYOUT_LABELS: Record<LayoutType, string> = {
  'choseong-only': '초성만',
  'jungseong-vertical-only': '세로중성만',
  'jungseong-horizontal-only': '가로중성만',
  'jungseong-mixed-only': '혼합중성만',
  'choseong-jungseong-vertical': '초+세로중',
  'choseong-jungseong-horizontal': '초+가로중',
  'choseong-jungseong-mixed': '초+혼합중',
  'choseong-jungseong-vertical-jongseong': '초+세로중+종',
  'choseong-jungseong-horizontal-jongseong': '초+가로중+종',
  'choseong-jungseong-mixed-jongseong': '초+혼합중+종',
}

const ALL_LAYOUT_TYPES: Array<{ type: LayoutType; label: string }> = Object.entries(
  LAYOUT_LABELS
).map(([type, label]) => ({ type: type as LayoutType, label }))

export function ControlPanel() {
  const {
    inputText,
    selectedCharIndex,
    controlMode,
    selectedLayoutType,
    editingJamoType,
    editingJamoChar,
    setControlMode,
    setSelectedLayoutType,
    setEditingJamo,
  } = useUIStore()
  const { choseong, jungseong, jongseong } = useJamoStore()
  const [showFullMenu, setShowFullMenu] = useState(false)

  // 선택된 글자의 분해 정보 계산
  const selectedSyllable = useMemo(() => {
    const hangulChars = inputText.split('').filter(isHangul)
    const char = hangulChars[selectedCharIndex]
    if (!char) return null
    return decomposeSyllable(char, choseong, jungseong, jongseong)
  }, [inputText, selectedCharIndex, choseong, jungseong, jongseong])

  // 레이아웃 타입 선택 핸들러
  const handleLayoutSelect = (layoutType: LayoutType) => {
    setSelectedLayoutType(layoutType)
    setControlMode('layout')
    setEditingJamo(null, null)
  }

  // 자소 선택 핸들러
  const handleJamoSelect = (
    type: 'choseong' | 'jungseong' | 'jongseong',
    char: string
  ) => {
    setEditingJamo(type, char)
    setControlMode('jamo')
    setSelectedLayoutType(null)
  }

  // 글로벌 스타일 선택 핸들러
  const handleGlobalStyleSelect = () => {
    setControlMode('global')
    setSelectedLayoutType(null)
    setEditingJamo(null, null)
  }

  return (
    <div className={styles.controlPanel}>
      <h2 className={styles.title}>편집 메뉴</h2>

      {/* 글로벌 스타일 버튼 (항상 표시) */}
      <section className={styles.section}>
        <h3 className={styles.sectionTitle}>글로벌</h3>
        <button
          className={`${styles.contextButton} ${
            controlMode === 'global' ? styles.selected : ''
          }`}
          onClick={handleGlobalStyleSelect}
        >
          글로벌 스타일
        </button>
      </section>

      {/* 빈 상태: 글자 미선택 + 전체목록 OFF */}
      {!selectedSyllable && !showFullMenu && (
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>
            우측 상단에서 한글을 입력하고
            <br />
            글자를 선택하세요
          </p>
        </div>
      )}

      {/* 컨텍스트 메뉴: 선택된 글자 기반 */}
      {selectedSyllable && !showFullMenu && (
        <>
          <div className={styles.selectedChar}>
            <span className={styles.selectedCharLabel}>선택된 글자</span>
            <span className={styles.selectedCharValue}>
              {selectedSyllable.char}
            </span>
          </div>

          {/* 레이아웃 편집 */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>레이아웃</h3>
            <button
              className={`${styles.contextButton} ${
                controlMode === 'layout' &&
                selectedLayoutType === selectedSyllable.layoutType
                  ? styles.selected
                  : ''
              }`}
              onClick={() => handleLayoutSelect(selectedSyllable.layoutType)}
            >
              {LAYOUT_LABELS[selectedSyllable.layoutType]}
            </button>
          </section>

          {/* 자모 편집 */}
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>자모</h3>
            <div className={styles.contextJamoList}>
              {selectedSyllable.choseong && (
                <button
                  className={`${styles.contextJamoButton} ${
                    editingJamoType === 'choseong' &&
                    editingJamoChar === selectedSyllable.choseong.char
                      ? styles.selected
                      : ''
                  }`}
                  onClick={() =>
                    handleJamoSelect(
                      'choseong',
                      selectedSyllable.choseong!.char
                    )
                  }
                >
                  <span className={styles.jamoType}>초성</span>
                  <span className={styles.jamoCharLabel}>
                    {selectedSyllable.choseong.char}
                  </span>
                </button>
              )}
              {selectedSyllable.jungseong && (
                <button
                  className={`${styles.contextJamoButton} ${
                    editingJamoType === 'jungseong' &&
                    editingJamoChar === selectedSyllable.jungseong.char
                      ? styles.selected
                      : ''
                  }`}
                  onClick={() =>
                    handleJamoSelect(
                      'jungseong',
                      selectedSyllable.jungseong!.char
                    )
                  }
                >
                  <span className={styles.jamoType}>중성</span>
                  <span className={styles.jamoCharLabel}>
                    {selectedSyllable.jungseong.char}
                  </span>
                </button>
              )}
              {selectedSyllable.jongseong && (
                <button
                  className={`${styles.contextJamoButton} ${
                    editingJamoType === 'jongseong' &&
                    editingJamoChar === selectedSyllable.jongseong.char
                      ? styles.selected
                      : ''
                  }`}
                  onClick={() =>
                    handleJamoSelect(
                      'jongseong',
                      selectedSyllable.jongseong!.char
                    )
                  }
                >
                  <span className={styles.jamoType}>종성</span>
                  <span className={styles.jamoCharLabel}>
                    {selectedSyllable.jongseong.char}
                  </span>
                </button>
              )}
            </div>
          </section>
        </>
      )}

      {/* 전체 목록 (고급 모드) */}
      {showFullMenu && (
        <>
          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>레이아웃 편집</h3>
            <div className={styles.layoutGrid}>
              {ALL_LAYOUT_TYPES.map(({ type, label }) => (
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

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>초성 편집</h3>
            <div className={styles.jamoGrid}>
              {CHOSEONG_LIST.map((char) => (
                <button
                  key={char}
                  className={`${styles.jamoButton} ${
                    editingJamoType === 'choseong' &&
                    editingJamoChar === char
                      ? styles.selected
                      : ''
                  }`}
                  onClick={() => handleJamoSelect('choseong', char)}
                >
                  {char}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>중성 편집</h3>
            <div className={styles.jamoGrid}>
              {JUNGSEONG_LIST.map((char) => (
                <button
                  key={char}
                  className={`${styles.jamoButton} ${
                    editingJamoType === 'jungseong' &&
                    editingJamoChar === char
                      ? styles.selected
                      : ''
                  }`}
                  onClick={() => handleJamoSelect('jungseong', char)}
                >
                  {char}
                </button>
              ))}
            </div>
          </section>

          <section className={styles.section}>
            <h3 className={styles.sectionTitle}>종성 편집</h3>
            <div className={styles.jamoGrid}>
              {JONGSEONG_LIST.filter((c) => c !== '').map((char) => (
                <button
                  key={char}
                  className={`${styles.jamoButton} ${
                    editingJamoType === 'jongseong' &&
                    editingJamoChar === char
                      ? styles.selected
                      : ''
                  }`}
                  onClick={() => handleJamoSelect('jongseong', char)}
                >
                  {char}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {/* 전체 목록 토글 */}
      <div className={styles.toggleSection}>
        <button
          className={styles.toggleButton}
          onClick={() => setShowFullMenu(!showFullMenu)}
        >
          {showFullMenu ? '선택 글자 메뉴로 돌아가기' : '전체 목록 보기'}
        </button>
      </div>
    </div>
  )
}
