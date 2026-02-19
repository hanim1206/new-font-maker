import { useUIStore } from '../../stores/uiStore'
import { LAYOUT_LABELS } from '../../utils/hangulUtils'

/** 자모 타입 한글 레이블 */
const JAMO_TYPE_LABELS: Record<string, string> = {
  choseong: '초성',
  jungseong: '중성',
  jongseong: '종성',
}

/** EditorPanel 상단 브레드크럼 네비게이션 */
export function EditorBreadcrumb() {
  const {
    controlMode,
    selectedLayoutType,
    editingPartInLayout,
    editingJamoType,
    editingJamoChar,
    setEditingPartInLayout,
  } = useUIStore()

  // 편집 모드가 아니거나 레이아웃이 선택되지 않았으면 표시 안 함
  if (!controlMode || controlMode !== 'layout' || !selectedLayoutType) return null

  const layoutLabel = LAYOUT_LABELS[selectedLayoutType]
  const isJamoEditing = editingPartInLayout !== null

  const handleBackToLayout = () => {
    setEditingPartInLayout(null)
  }

  return (
    <div className="shrink-0 px-4 py-2 border-b border-border-subtle bg-[#0d0d0d] flex items-center gap-2 text-sm min-h-[36px]">
      {/* 레이아웃 이름 */}
      {isJamoEditing ? (
        <button
          onClick={handleBackToLayout}
          className="text-text-dim-4 hover:text-text-dim-2 cursor-pointer transition-colors"
        >
          {layoutLabel}
        </button>
      ) : (
        <span className="text-text-dim-2 font-medium">{layoutLabel}</span>
      )}

      {/* 구분자 + 자모 정보 */}
      {isJamoEditing && editingJamoType && editingJamoChar && (
        <>
          <span className="text-text-dim-5">›</span>
          <span className="text-text-dim-2 font-medium">
            {JAMO_TYPE_LABELS[editingJamoType] ?? editingJamoType}
            {' '}
            <span className="text-base font-bold text-foreground">{editingJamoChar}</span>
          </span>
        </>
      )}
    </div>
  )
}
