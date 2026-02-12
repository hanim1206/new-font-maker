import { useUIStore } from '../../stores/uiStore'
import { LayoutEditor } from './LayoutEditor'
import { JamoEditor } from './JamoEditor'
import styles from './EditorPanel.module.css'

export function EditorPanel() {
  const { controlMode, selectedLayoutType, editingJamoType, editingJamoChar } = useUIStore()

  // 아무것도 선택되지 않은 경우
  if (!controlMode) {
    return (
      <div className={styles.editorPanel}>
        <div className={styles.emptyState}>
          <p className={styles.emptyText}>좌측 메뉴에서 편집할 항목을 선택하세요</p>
        </div>
      </div>
    )
  }

  // 레이아웃 편집 모드
  if (controlMode === 'layout' && selectedLayoutType) {
    return (
      <div className={styles.editorPanel}>
        <div className={styles.header}>
          <h2 className={styles.title}>레이아웃 편집: {selectedLayoutType}</h2>
        </div>
        <div className={styles.content}>
          <LayoutEditor layoutType={selectedLayoutType} />
        </div>
      </div>
    )
  }

  // 자소 편집 모드
  if (controlMode === 'jamo' && editingJamoType && editingJamoChar) {
    const typeLabel = {
      choseong: '초성',
      jungseong: '중성',
      jongseong: '종성',
    }[editingJamoType]

    return (
      <div className={styles.editorPanel}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {typeLabel} 편집: {editingJamoChar}
          </h2>
        </div>
        <div className={styles.content}>
          <JamoEditor jamoType={editingJamoType} jamoChar={editingJamoChar} />
        </div>
      </div>
    )
  }

  return (
    <div className={styles.editorPanel}>
      <div className={styles.emptyState}>
        <p className={styles.emptyText}>선택된 항목이 없습니다</p>
      </div>
    </div>
  )
}
