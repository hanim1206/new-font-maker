import { useMemo } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useJamoStore } from '../../stores/jamoStore'
import { SplitEditor } from './SplitEditor'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import { decomposeSyllable } from '../../utils/hangulUtils'
import { downloadAsJson } from '../../utils/storage'
import type { LayoutType } from '../../types'
import styles from './LayoutEditor.module.css'

interface LayoutEditorProps {
  layoutType: LayoutType
}

export function LayoutEditor({ layoutType }: LayoutEditorProps) {
  const { inputText, selectedCharIndex } = useUIStore()
  const {
    getLayoutSchema,
    resetLayoutSchema,
    getCalculatedBoxes,
    isModified,
    isLayoutModified,
    exportSchemas,
    resetToBasePresets,
    _hydrated,
  } = useLayoutStore()
  const { choseong, jungseong, jongseong } = useJamoStore()

  const schema = getLayoutSchema(layoutType)
  const modified = isModified()
  const currentLayoutModified = isLayoutModified(layoutType)

  // 테스트용 음절 (선택한 음절 우선, 없으면 입력 텍스트의 첫 번째 음절 또는 기본값)
  const testSyllable = useMemo(() => {
    // 선택한 음절이 있고 레이아웃 타입이 일치하면 사용
    if (inputText && selectedCharIndex >= 0) {
      const hangulChars = inputText.split('').filter((char) => {
        const code = char.charCodeAt(0)
        return (code >= 0xac00 && code <= 0xd7a3) || // 완성형
               (code >= 0x3131 && code <= 0x314e) || // 자음
               (code >= 0x314f && code <= 0x3163)    // 모음
      })
      const selectedChar = hangulChars[selectedCharIndex]
      if (selectedChar) {
        const syllable = decomposeSyllable(selectedChar, choseong, jungseong, jongseong)
        // 레이아웃 타입이 일치하는지 확인
        if (syllable.layoutType === layoutType) {
          return syllable
        }
      }
    }

    // 입력 텍스트의 첫 번째 음절 확인
    const firstChar = inputText.trim()[0]
    if (firstChar) {
      const syllable = decomposeSyllable(firstChar, choseong, jungseong, jongseong)
      // 레이아웃 타입이 일치하는지 확인
      if (syllable.layoutType === layoutType) {
        return syllable
      }
    }

    // 레이아웃 타입에 맞는 기본 테스트 문자
    const testChars: Record<string, string> = {
      'choseong-only': 'ㄱ',
      'jungseong-vertical-only': 'ㅣ',
      'jungseong-horizontal-only': 'ㅡ',
      'jungseong-mixed-only': 'ㅢ',
      'choseong-jungseong-vertical': '가',
      'choseong-jungseong-horizontal': '고',
      'choseong-jungseong-mixed': '괘',
      'choseong-jungseong-vertical-jongseong': '한',
      'choseong-jungseong-horizontal-jongseong': '공',
      'choseong-jungseong-mixed-jongseong': '궝',
    }

    return decomposeSyllable(testChars[layoutType] || '한', choseong, jungseong, jongseong)
  }, [inputText, selectedCharIndex, layoutType, choseong, jungseong, jongseong])

  const handleSave = () => {
    // Schema 기반이므로 변경사항은 자동으로 store에 반영됨 (LocalStorage에도 자동 저장)
    // 콘솔에 현재 schema 출력 (디버그용)
    console.log('\n📋 현재 LayoutSchema:\n')
    console.log(JSON.stringify(schema, null, 2))

    // 계산된 boxes도 출력
    const boxes = getCalculatedBoxes(layoutType)
    console.log('\n📦 계산된 BoxConfig:\n')
    console.log(JSON.stringify(boxes, null, 2))

    alert('레이아웃 설정이 저장되었습니다!\n(LocalStorage에 자동 저장됨)')
  }

  const handleReset = () => {
    if (confirm(`'${layoutType}' 레이아웃을 기본값으로 되돌리시겠습니까?`)) {
      resetLayoutSchema(layoutType)
    }
  }

  const handleExport = () => {
    const json = exportSchemas()
    const timestamp = new Date().toISOString().slice(0, 10)
    downloadAsJson(json, `basePresets-${timestamp}.json`)
    alert('JSON 파일이 다운로드되었습니다.\nsrc/data/basePresets.json에 덮어씌우세요.')
  }

  const handleResetAll = () => {
    if (confirm('모든 레이아웃을 기본값으로 되돌리시겠습니까?\n저장된 작업이 모두 사라집니다.')) {
      resetToBasePresets()
    }
  }

  // Hydration 전에는 로딩 표시
  if (!_hydrated) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>로딩 중...</div>
      </div>
    )
  }

  if (!schema) {
    return (
      <div className={styles.container}>
        <p>레이아웃 스키마를 불러올 수 없습니다.</p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* 변경 감지 배지 */}
      {modified && (
        <div className={styles.modifiedBadge}>
          <span className={styles.modifiedDot}></span>
          수정됨 (basePresets.json과 다름)
        </div>
      )}

      {/* 현재 레이아웃 변경 표시 */}
      {currentLayoutModified && (
        <div className={styles.currentLayoutModified}>
          현재 레이아웃 수정됨
        </div>
      )}

      {/* 미리보기 영역 */}
      <div className={styles.previewSection}>
        <h3 className={styles.sectionTitle}>미리보기</h3>
        <div className={styles.previewBox}>
          <SvgRenderer
            syllable={testSyllable}
            schema={schema}
            size={200}
            fillColor="#e5e5e5"
            backgroundColor="#1a1a1a"
            showDebugBoxes={true}
          />
        </div>
        <p className={styles.testChar}>테스트: {testSyllable.char}</p>
      </div>

      {/* Split/Padding 편집기 */}
      <div className={styles.formSection}>
        <h3 className={styles.sectionTitle}>레이아웃 설정</h3>
        <SplitEditor layoutType={layoutType} />
      </div>

      {/* 버튼 영역 */}
      <div className={styles.buttonGroup}>
        <button onClick={handleSave} className={styles.saveButton}>
          저장
        </button>
        <button onClick={handleReset} className={styles.resetButton}>
          되돌리기
        </button>
      </div>

      {/* 내보내기/전체 리셋 영역 */}
      <div className={styles.exportSection}>
        <button onClick={handleExport} className={styles.exportButton}>
          JSON 내보내기
        </button>
        <button onClick={handleResetAll} className={styles.resetAllButton}>
          전체 초기화
        </button>
      </div>
    </div>
  )
}
