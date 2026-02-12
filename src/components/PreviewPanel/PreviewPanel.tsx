import { useEffect, useMemo, useState } from 'react'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import { useLayoutStore } from '../../stores/layoutStore'
import { useJamoStore } from '../../stores/jamoStore'
import { useUIStore } from '../../stores/uiStore'
import { decomposeSyllable, isHangul } from '../../utils/hangulUtils'
import type { DecomposedSyllable } from '../../types'
import styles from './PreviewPanel.module.css'

export function PreviewPanel() {
  const {
    inputText,
    setInputText,
    selectedCharIndex,
    setSelectedCharIndex,
    setViewMode,
    setControlMode,
    setEditingJamo,
    setSelectedLayoutType
  } = useUIStore()
  const { layoutConfigs } = useLayoutStore()
  const { choseong, jungseong, jongseong } = useJamoStore()
  const [showDebug, setShowDebug] = useState(false)

  // 모든 한글 글자 분석
  const syllables: DecomposedSyllable[] = useMemo(() => {
    return inputText
      .split('')
      .filter(isHangul)
      .map(char => decomposeSyllable(char, choseong, jungseong, jongseong))
  }, [inputText, choseong, jungseong, jongseong])

  // 각 글자에 대한 렌더링 정보 (규칙 적용 제거, 직접 레이아웃 설정 사용)
  const renderedSyllables = useMemo(() => {
    return syllables.map((syllable) => {
      const layoutConfig = layoutConfigs[syllable.layoutType]

      if (!layoutConfig) {
        return { syllable, boxes: null }
      }

      // 옵셔널 필드를 필터링하여 Record<Part, BoxConfig> 타입으로 변환
      const boxes: Record<string, any> = {}
      Object.entries(layoutConfig.boxes).forEach(([key, value]) => {
        if (value) {
          boxes[key] = value
        }
      })

      return {
        syllable,
        boxes: boxes as Record<string, any>,
      }
    })
  }, [syllables, layoutConfigs])

  // 선택된 글자의 정보
  const selectedCharInfo = renderedSyllables[selectedCharIndex] || { boxes: null }
  const selectedSyllable = syllables[selectedCharIndex] || null

  // 입력 텍스트가 변경되면 선택 인덱스를 0으로 리셋
  useEffect(() => {
    setSelectedCharIndex(0)
  }, [inputText, setSelectedCharIndex])

  // 자모 클릭 핸들러
  const handleJamoClick = (type: 'choseong' | 'jungseong' | 'jongseong', char: string) => {
    setViewMode('editor')
    setControlMode('jamo')
    setEditingJamo(type, char)
  }

  // 레이아웃 타입 클릭 핸들러
  const handleLayoutTypeClick = (layoutType: string) => {
    setViewMode('editor')
    setControlMode('layout')
    setSelectedLayoutType(layoutType as any)
  }

  return (
    <div className={styles.container}>
      {/* 입력 영역 */}
      <div className={styles.inputSection}>
        <input
          type="text"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          placeholder="한글 입력 (예: 한글샘플)"
          className={styles.textInput}
          maxLength={50}
        />
      </div>

      {/* 미리보기 영역 - 그리드로 모든 글자 표시 */}
      <div className={styles.previewSection}>
        {renderedSyllables.length > 0 ? (
          <div className={styles.previewGrid}>
            {renderedSyllables.map((item, index) =>
              item.boxes ? (
                <div
                  key={index}
                  className={`${styles.previewGridItem} ${index === selectedCharIndex ? styles.active : ''}`}
                  onClick={() => {
                    setSelectedCharIndex(index)
                    // 해당 음절의 레이아웃 타입으로 자동 포커스
                    setSelectedLayoutType(item.syllable.layoutType)
                    // 편집 모드를 레이아웃 편집 모드로 변경
                    setControlMode('layout')
                    // 자모 편집 모드 해제
                    setEditingJamo(null, null)
                  }}
                >
                  <SvgRenderer
                    syllable={item.syllable}
                    boxes={item.boxes}
                    size={120}
                    fillColor="#e5e5e5"
                    backgroundColor="#1a1a1a"
                    showDebugBoxes={showDebug}
                  />
                </div>
              ) : null
            )}
          </div>
        ) : (
          <div className={styles.placeholder}>
            <span>한글을 입력하세요</span>
          </div>
        )}
      </div>

      {/* 적용된 정보 (선택된 글자 기준) */}
      {selectedSyllable && selectedCharInfo.boxes && (
        <div className={styles.infoSection}>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>선택된 글자</span>
            <span className={styles.infoValue}>{selectedSyllable.char}</span>
          </div>
          <div className={styles.infoItem}>
            <span className={styles.infoLabel}>레이아웃 타입</span>
            <span 
              className={`${styles.infoValue} ${styles.clickable}`}
              onClick={() => handleLayoutTypeClick(selectedSyllable.layoutType)}
            >
              {selectedSyllable.layoutType}
            </span>
          </div>

          {/* 분해 정보 (선택된 글자) */}
          <div className={styles.decomposed}>
            {selectedSyllable.choseong && (
              <span 
                className={`${styles.jamo} ${styles.clickable}`}
                onClick={() => handleJamoClick('choseong', selectedSyllable.choseong!.char)}
              >
                초성: {selectedSyllable.choseong.char}
              </span>
            )}
            {selectedSyllable.jungseong && (
              <span 
                className={`${styles.jamo} ${styles.clickable}`}
                onClick={() => handleJamoClick('jungseong', selectedSyllable.jungseong!.char)}
              >
                중성: {selectedSyllable.jungseong.char}
              </span>
            )}
            {selectedSyllable.jongseong && (
              <span 
                className={`${styles.jamo} ${styles.clickable}`}
                onClick={() => handleJamoClick('jongseong', selectedSyllable.jongseong!.char)}
              >
                종성: {selectedSyllable.jongseong.char}
              </span>
            )}
          </div>

          {/* 디버그 토글 */}
          <label className={styles.debugToggle}>
            <input
              type="checkbox"
              checked={showDebug}
              onChange={(e) => setShowDebug(e.target.checked)}
            />
            <span>박스 영역 표시</span>
          </label>
        </div>
      )}
    </div>
  )
}
