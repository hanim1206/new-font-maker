import { useUIStore } from '../../stores/uiStore'
import { LayoutEditor } from './LayoutEditor'
import { JamoEditor } from './JamoEditor'
import { GlobalStyleEditor } from './GlobalStyleEditor'

export function EditorPanel() {
  const { controlMode, selectedLayoutType, editingJamoType, editingJamoChar, editingPartInLayout } = useUIStore()

  // 아무것도 선택되지 않은 경우
  if (!controlMode) {
    return (
      <div className="h-full bg-background border-t border-border-subtle overflow-hidden flex flex-col">
        <div className="h-full flex items-center justify-center">
          <p className="text-text-dim-5 text-base text-center">편집 메뉴에서 편집할 항목을 선택하세요</p>
        </div>
      </div>
    )
  }

  // 글로벌 스타일 편집 모드
  if (controlMode === 'global') {
    return (
      <div className="h-full bg-background border-t border-border-subtle overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-border-subtle bg-[#111]">
          <h2 className="text-xl font-semibold text-[#e0e0e0]">글로벌 스타일</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <GlobalStyleEditor />
        </div>
      </div>
    )
  }

  // 레이아웃 편집 모드
  if (controlMode === 'layout' && selectedLayoutType) {
    // 자모 편집 서브모드 여부에 따른 헤더 텍스트
    const layoutHeaderText = editingPartInLayout && editingJamoChar
      ? `레이아웃: ${selectedLayoutType} > ${editingPartInLayout} (${editingJamoChar})`
      : `레이아웃 편집: ${selectedLayoutType}`

    return (
      <div className="h-full bg-background border-t border-border-subtle overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-border-subtle bg-[#111]">
          <h2 className="text-xl font-semibold text-[#e0e0e0]">{layoutHeaderText}</h2>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
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
      <div className="h-full bg-background border-t border-border-subtle overflow-hidden flex flex-col">
        <div className="px-5 py-4 border-b border-border-subtle bg-[#111]">
          <h2 className="text-xl font-semibold text-[#e0e0e0]">
            {typeLabel} 편집: {editingJamoChar}
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <JamoEditor jamoType={editingJamoType} jamoChar={editingJamoChar} />
        </div>
      </div>
    )
  }

  return (
    <div className="h-full bg-background border-t border-border-subtle overflow-hidden flex flex-col">
      <div className="h-full flex items-center justify-center">
        <p className="text-text-dim-5 text-base text-center">선택된 항목이 없습니다</p>
      </div>
    </div>
  )
}
