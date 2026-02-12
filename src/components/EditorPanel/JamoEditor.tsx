import { useState, useEffect, useMemo } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useJamoStore } from '../../stores/jamoStore'
import { CharacterPreview } from '../CharacterEditor/CharacterPreview'
import { StrokeList } from '../CharacterEditor/StrokeList'
import { StrokeEditor } from '../CharacterEditor/StrokeEditor'
import { StrokeInspector } from '../CharacterEditor/StrokeInspector'
import { downloadAsJson } from '../../utils/storage'
import type { StrokeData, JamoData, BoxConfig } from '../../types'
import styles from './JamoEditor.module.css'

interface JamoEditorProps {
  jamoType: 'choseong' | 'jungseong' | 'jongseong'
  jamoChar: string
}

export function JamoEditor({ jamoType, jamoChar }: JamoEditorProps) {
  const { setSelectedStrokeId } = useUIStore()
  const { layoutConfigs } = useLayoutStore()
  const {
    choseong,
    jungseong,
    jongseong,
    updateChoseong,
    updateJungseong,
    updateJongseong,
    isModified,
    isJamoModified,
    exportJamos,
    resetToBaseJamos,
    _hydrated,
  } = useJamoStore()

  // Draft state for stroke edits
  const [draftStrokes, setDraftStrokes] = useState<StrokeData[]>([])

  // 자모 맵 가져오기 (jamoStore에서)
  const jamoMap = useMemo(() => {
    switch (jamoType) {
      case 'choseong':
        return choseong
      case 'jungseong':
        return jungseong
      case 'jongseong':
        return jongseong
    }
  }, [jamoType, choseong, jungseong, jongseong])

  // 편집 중인 자모의 박스 정보 계산 (비율 + 위치)
  // 혼합 중성의 경우 JU_H와 JU_V 박스 정보도 함께 반환
  const jamoBoxInfo = useMemo(() => {
    if (!jamoType || !jamoChar) return { x: 0, y: 0, width: 1, height: 1, juH: undefined, juV: undefined }

    // 중성의 경우, 실제 사용되는 레이아웃 타입을 정확히 찾아야 함
    if (jamoType === 'jungseong') {
      const jamo = jamoMap[jamoChar]
      if (!jamo) return { x: 0, y: 0, width: 1, height: 1, juH: undefined, juV: undefined }

      // 중성 타입 분류
      const verticalJungseong = ['ㅏ', 'ㅑ', 'ㅓ', 'ㅕ', 'ㅣ', 'ㅐ', 'ㅒ', 'ㅔ', 'ㅖ']
      const horizontalJungseong = ['ㅗ', 'ㅛ', 'ㅜ', 'ㅠ', 'ㅡ']
      const isVertical = verticalJungseong.includes(jamoChar)
      const isHorizontal = horizontalJungseong.includes(jamoChar)
      const isMixed = !isVertical && !isHorizontal

      // 혼합 중성의 경우
      if (isMixed) {
        const mixedLayoutTypes = [
          'jungseong-mixed-only',
          'choseong-jungseong-mixed',
          'choseong-jungseong-mixed-jongseong'
        ]
        
        for (const layoutType of mixedLayoutTypes) {
          const layoutConfig = layoutConfigs[layoutType as keyof typeof layoutConfigs]
          if (layoutConfig) {
            if (layoutConfig.boxes.JU_H && layoutConfig.boxes.JU_V) {
              const juH = layoutConfig.boxes.JU_H
              const juV = layoutConfig.boxes.JU_V
              const minX = Math.min(juH.x, juV.x)
              const minY = Math.min(juH.y, juV.y)
              const maxX = Math.max(juH.x + juH.width, juV.x + juV.width)
              const maxY = Math.max(juH.y + juH.height, juV.y + juV.height)
              const combinedWidth = maxX - minX
              const combinedHeight = maxY - minY
              return { 
                x: minX, 
                y: minY, 
                width: combinedWidth, 
                height: combinedHeight,
                juH: juH,
                juV: juV
              }
            } else if (layoutConfig.boxes.JU) {
              const ju = layoutConfig.boxes.JU
              return { x: ju.x, y: ju.y, width: ju.width, height: ju.height, juH: undefined, juV: undefined }
            }
          }
        }
      } else if (isVertical) {
        const verticalLayoutTypes = [
          'jungseong-vertical-only',
          'choseong-jungseong-vertical',
          'choseong-jungseong-vertical-jongseong'
        ]
        
        for (const layoutType of verticalLayoutTypes) {
          const layoutConfig = layoutConfigs[layoutType as keyof typeof layoutConfigs]
          if (layoutConfig) {
            if (layoutConfig.boxes.JU_V) {
              const juV = layoutConfig.boxes.JU_V
              return { x: juV.x, y: juV.y, width: juV.width, height: juV.height, juH: undefined, juV: undefined }
            } else if (layoutConfig.boxes.JU) {
              const ju = layoutConfig.boxes.JU
              return { x: ju.x, y: ju.y, width: ju.width, height: ju.height, juH: undefined, juV: undefined }
            }
          }
        }
      } else if (isHorizontal) {
        const horizontalLayoutTypes = [
          'jungseong-horizontal-only',
          'choseong-jungseong-horizontal',
          'choseong-jungseong-horizontal-jongseong'
        ]
        
        for (const layoutType of horizontalLayoutTypes) {
          const layoutConfig = layoutConfigs[layoutType as keyof typeof layoutConfigs]
          if (layoutConfig) {
            if (layoutConfig.boxes.JU_H) {
              const juH = layoutConfig.boxes.JU_H
              return { x: juH.x, y: juH.y, width: juH.width, height: juH.height, juH: undefined, juV: undefined }
            } else if (layoutConfig.boxes.JU) {
              const ju = layoutConfig.boxes.JU
              return { x: ju.x, y: ju.y, width: ju.width, height: ju.height, juH: undefined, juV: undefined }
            }
          }
        }
      }
    }

    // 초성, 종성의 경우
    const relevantLayoutTypes = Object.keys(layoutConfigs).filter((layoutType) => {
      if (jamoType === 'choseong') {
        return layoutType.includes('choseong')
      } else if (jamoType === 'jongseong') {
        return layoutType.includes('jongseong')
      }
      return false
    })

    for (const layoutType of relevantLayoutTypes) {
      const layoutConfig = layoutConfigs[layoutType as keyof typeof layoutConfigs]
      let box: BoxConfig | undefined

      if (jamoType === 'choseong') {
        box = layoutConfig.boxes.CH
      } else if (jamoType === 'jongseong') {
        box = layoutConfig.boxes.JO
      }

      if (box) {
        return { x: box.x, y: box.y, width: box.width, height: box.height, juH: undefined, juV: undefined }
      }
    }

    return { x: 0, y: 0, width: 1, height: 1, juH: undefined, juV: undefined }
  }, [jamoType, jamoChar, layoutConfigs, jamoMap])

  // 자모가 변경될 때 획 데이터 로드
  useEffect(() => {
    const jamo = jamoMap[jamoChar]
    if (jamo) {
      // 혼합 중성의 경우 horizontalStrokes와 verticalStrokes를 합쳐서 사용
      if (jamo.horizontalStrokes && jamo.verticalStrokes) {
        setDraftStrokes([...jamo.horizontalStrokes, ...jamo.verticalStrokes])
      } else if (jamo.verticalStrokes) {
        // verticalStrokes만 있는 경우
        setDraftStrokes([...jamo.verticalStrokes])
      } else if (jamo.horizontalStrokes) {
        // horizontalStrokes만 있는 경우
        setDraftStrokes([...jamo.horizontalStrokes])
      } else if (jamo.strokes) {
        setDraftStrokes([...jamo.strokes])
      } else {
        setDraftStrokes([])
      }
    } else {
      setDraftStrokes([])
    }
    // 새 자모 선택 시 획 선택 초기화
    setSelectedStrokeId(null)
  }, [jamoType, jamoChar, jamoMap, setSelectedStrokeId])

  const handleStrokeChange = (strokeId: string, prop: keyof StrokeData, value: number) => {
    setDraftStrokes((prev) =>
      prev.map((s) => (s.id === strokeId ? { ...s, [prop]: value } : s))
    )
  }

  const handleSave = () => {
    // jamoStore에 저장 (자동으로 LocalStorage에 persist됨)
    const jamo = jamoMap[jamoChar]
    if (!jamo) return

    // 혼합 중성 처리
    const verticalJungseong = ['ㅏ', 'ㅑ', 'ㅓ', 'ㅕ', 'ㅣ', 'ㅐ', 'ㅒ', 'ㅔ', 'ㅖ']
    const horizontalJungseong = ['ㅗ', 'ㅛ', 'ㅜ', 'ㅠ', 'ㅡ']
    const isMixed = jamoType === 'jungseong' && !verticalJungseong.includes(jamoChar) && !horizontalJungseong.includes(jamoChar)

    let updatedJamo: JamoData

    if (isMixed && jamo.horizontalStrokes && jamo.verticalStrokes) {
      // 혼합 중성: horizontalStrokes와 verticalStrokes 분리
      const horizontalStrokeIds = new Set(jamo.horizontalStrokes.map(s => s.id))
      const horizontalStrokes = draftStrokes.filter(s => horizontalStrokeIds.has(s.id))
      const verticalStrokes = draftStrokes.filter(s => !horizontalStrokeIds.has(s.id))

      updatedJamo = {
        ...jamo,
        horizontalStrokes,
        verticalStrokes,
      }
    } else {
      // 일반 자모
      updatedJamo = {
        ...jamo,
        strokes: draftStrokes,
      }
    }

    // jamoStore 업데이트
    switch (jamoType) {
      case 'choseong':
        updateChoseong(jamoChar, updatedJamo)
        break
      case 'jungseong':
        updateJungseong(jamoChar, updatedJamo)
        break
      case 'jongseong':
        updateJongseong(jamoChar, updatedJamo)
        break
    }

    alert(`'${jamoChar}' 자모가 저장되었습니다.\n변경사항은 LocalStorage에 자동 저장됩니다.`)
  }

  const handleReset = () => {
    const jamo = jamoMap[jamoChar]
    if (jamo) {
      // 혼합 중성의 경우 horizontalStrokes와 verticalStrokes를 합쳐서 사용
      if (jamo.horizontalStrokes && jamo.verticalStrokes) {
        setDraftStrokes([...jamo.horizontalStrokes, ...jamo.verticalStrokes])
      } else if (jamo.verticalStrokes) {
        // verticalStrokes만 있는 경우
        setDraftStrokes([...jamo.verticalStrokes])
      } else if (jamo.horizontalStrokes) {
        // horizontalStrokes만 있는 경우
        setDraftStrokes([...jamo.horizontalStrokes])
      } else if (jamo.strokes) {
        setDraftStrokes([...jamo.strokes])
      }
    }
  }

  // JSON 내보내기 핸들러
  const handleExport = () => {
    const json = exportJamos()
    const timestamp = new Date().toISOString().slice(0, 10)
    downloadAsJson(json, `baseJamos-${timestamp}.json`)
    alert('JSON 파일이 다운로드되었습니다.\nsrc/data/baseJamos.json에 덮어씌우세요.')
  }

  // 전체 초기화 핸들러
  const handleResetAll = () => {
    if (confirm('모든 자모를 기본값으로 되돌리시겠습니까?')) {
      resetToBaseJamos()
      alert('모든 자모가 초기화되었습니다.')
    }
  }

  // 변경 감지
  const modified = isModified()
  const currentJamoModified = isJamoModified(jamoType, jamoChar)

  // hydration 대기 중
  if (!_hydrated) {
    return (
      <div className={styles.container}>
        <p className={styles.loading}>자모 데이터 로딩 중...</p>
      </div>
    )
  }

  if (draftStrokes.length === 0) {
    return (
      <div className={styles.container}>
        <p className={styles.emptyState}>획 데이터를 불러올 수 없습니다.</p>
      </div>
    )
  }

  return (
    <div className={styles.container}>
      {/* 변경 감지 배지 (전체 수정됨) */}
      {modified && (
        <div className={styles.modifiedBadge}>
          <span className={styles.modifiedDot}></span>
          수정됨 (baseJamos.json과 다름)
        </div>
      )}

      {/* 현재 자모 수정됨 표시 */}
      {currentJamoModified && (
        <div className={styles.currentJamoModified}>
          현재 '{jamoChar}' 자모가 수정되었습니다
        </div>
      )}

      {/* 3단 레이아웃 */}
      <div className={styles.threeColumnLayout}>
        {/* 좌측: 획 목록 */}
        <div className={styles.leftPanel}>
          <h3 className={styles.panelTitle}>획 목록</h3>
          <StrokeList strokes={draftStrokes} />
        </div>

        {/* 중앙: 큰 미리보기 + 키보드 힌트 */}
        <div className={styles.centerPanel}>
          <h3 className={styles.panelTitle}>미리보기</h3>
          <CharacterPreview jamoChar={jamoChar} strokes={draftStrokes} boxInfo={jamoBoxInfo} jamoType={jamoType} />
          <p className={styles.keyboardHint}>
            방향키: 위치 이동 | Shift + 방향키: 크기 조절
          </p>
        </div>

        {/* 우측: Stroke Inspector */}
        <div className={styles.rightPanel}>
          <h3 className={styles.panelTitle}>속성 편집</h3>
          <StrokeInspector strokes={draftStrokes} onChange={handleStrokeChange} />
        </div>
      </div>

      {/* 키보드 컨트롤 (UI 없음) */}
      <StrokeEditor strokes={draftStrokes} onChange={handleStrokeChange} boxInfo={jamoBoxInfo} />

      {/* 버튼 그룹 */}
      <div className={styles.buttonGroup}>
        <button className={styles.resetButton} onClick={handleReset}>
          초기화
        </button>
        <button className={styles.saveButton} onClick={handleSave}>
          저장
        </button>
      </div>

      {/* 내보내기/전체 리셋 영역 */}
      <div className={styles.exportSection}>
        <button className={styles.exportButton} onClick={handleExport}>
          JSON 내보내기
        </button>
        <button className={styles.resetAllButton} onClick={handleResetAll}>
          전체 초기화
        </button>
      </div>
    </div>
  )
}
