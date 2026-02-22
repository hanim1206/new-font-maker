import { useUIStore } from '../../stores/uiStore'
import { LAYOUT_LABELS } from '../../utils/hangulUtils'
import { Button } from '@/components/ui/button'
import { ChevronRight } from 'lucide-react'

const JAMO_TYPE_LABELS: Record<string, string> = {
  choseong: '초성',
  jungseong: '중성',
  jongseong: '종성',
}

export function EditorBreadcrumb() {
  const {
    controlMode,
    selectedLayoutType,
    editingPartInLayout,
    editingJamoType,
    editingJamoChar,
    setEditingPartInLayout,
  } = useUIStore()

  if (!controlMode || controlMode !== 'layout' || !selectedLayoutType) return null

  const layoutLabel = LAYOUT_LABELS[selectedLayoutType]
  const isJamoEditing = editingPartInLayout !== null

  const handleBackToLayout = () => {
    setEditingPartInLayout(null)
  }

  return (
    <div className="shrink-0 px-4 py-2 border-b border-border-subtle bg-[#0d0d0d] flex items-center gap-1.5 text-sm min-h-[36px]">
      {isJamoEditing ? (
        <Button
          variant="ghost"
          size="sm"
          className="h-auto py-0.5 px-1.5 text-text-dim-4 hover:text-text-dim-2"
          onClick={handleBackToLayout}
        >
          {layoutLabel}
        </Button>
      ) : (
        <span className="text-text-dim-2 font-medium">{layoutLabel}</span>
      )}

      {isJamoEditing && editingJamoType && editingJamoChar && (
        <>
          <ChevronRight className="h-3.5 w-3.5 text-text-dim-5" />
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
