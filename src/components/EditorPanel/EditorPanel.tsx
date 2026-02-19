import { useState, useCallback } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { LayoutEditor } from './LayoutEditor'
import { JamoEditor } from './JamoEditor'
import { GlobalQuickControls } from './GlobalQuickControls'
import { EditorBreadcrumb } from './EditorBreadcrumb'
import { CHOSEONG_LIST, JUNGSEONG_LIST, JONGSEONG_LIST } from '../../data/Hangul'
import { getLayoutsForJamoType, classifyJungseong } from '../../utils/hangulUtils'
import { cn } from '@/lib/utils'
import type { Part } from '../../types'

// 자모 타입 → 파트 매핑
function jamoTypeToPart(jamoType: 'choseong' | 'jungseong' | 'jongseong', jamoChar: string): Part {
  if (jamoType === 'choseong') return 'CH'
  if (jamoType === 'jongseong') return 'JO'
  const subType = classifyJungseong(jamoChar)
  if (subType === 'mixed') return 'JU_H'
  return 'JU'
}

export function EditorPanel() {
  const {
    controlMode,
    selectedLayoutType,
    editingJamoType,
    editingJamoChar,
    editingPartInLayout,
    isMobile,
    setControlMode,
    setSelectedLayoutType,
    setEditingJamo,
    setEditingPartInLayout,
  } = useUIStore()
  const [showMenu, setShowMenu] = useState(false)

  // 자모 클릭 → 레이아웃 경유 자모 편집 진입
  const handleJamo = useCallback((type: 'choseong' | 'jungseong' | 'jongseong', char: string) => {
    const subType = type === 'jungseong' ? classifyJungseong(char) : undefined
    const layouts = getLayoutsForJamoType(type, subType)
    const firstLayout = layouts[0]
    if (!firstLayout) return

    setSelectedLayoutType(firstLayout)
    setControlMode('layout')
    setEditingJamo(type, char)
    setEditingPartInLayout(jamoTypeToPart(type, char))
    setShowMenu(false)
  }, [setSelectedLayoutType, setControlMode, setEditingJamo, setEditingPartInLayout])

  // 콘텐츠
  let content: React.ReactNode = null
  if (!controlMode) {
    content = (
      <div className="h-full flex items-center justify-center">
        <p className="text-text-dim-5 text-base text-center">
          상단 메뉴에서 편집할 항목을 선택하세요
        </p>
      </div>
    )
  } else if (controlMode === 'layout' && selectedLayoutType) {
    content = <LayoutEditor layoutType={selectedLayoutType} />
  } else if (controlMode === 'jamo' && editingJamoType && editingJamoChar) {
    content = (
      <div className="flex-1 overflow-y-auto p-5">
        <JamoEditor jamoType={editingJamoType} jamoChar={editingJamoChar} />
      </div>
    )
  } else {
    content = (
      <div className="h-full flex items-center justify-center">
        <p className="text-text-dim-5 text-base text-center">선택된 항목이 없습니다</p>
      </div>
    )
  }

  return (
    <div className="h-full bg-background border-t border-border-subtle overflow-hidden flex flex-col">
      {/* 편집 메뉴 토글 바 (데스크톱만) */}
      {!isMobile && (
        <div className="shrink-0 hidden">
          {/* 토글 버튼 */}
          <button
            className="w-full px-4 py-2 flex items-center gap-2 text-sm font-medium text-text-dim-3 bg-[#111] border-b border-border-subtle cursor-pointer hover:bg-surface-2 hover:text-text-dim-1 transition-colors"
            onClick={() => setShowMenu(!showMenu)}
          >
            <span className="text-xs">{showMenu ? '▼' : '▲'}</span>
            전체 자모     
          </button>

          {/* 펼침: 자모 버튼 가로 정렬 */}
          {showMenu && (
            <div className="px-4 py-3 border-b border-border-subtle bg-[#0d0d0d] flex flex-col gap-4 overflow-x-auto">
              {/* 초성 */}
              <div className="flex gap-1 shrink-0">
                {CHOSEONG_LIST.map((char) => (
                  <button
                    key={`ch-${char}`}
                    className={cn(
                      'w-7 h-7 text-sm rounded cursor-pointer transition-all flex items-center justify-center',
                      editingPartInLayout === 'CH' && editingJamoChar === char
                        ? 'bg-accent-blue text-white font-semibold'
                        : 'bg-surface-2 text-text-dim-1 border border-border hover:bg-surface-hover hover:text-foreground'
                    )}
                    onClick={() => handleJamo('choseong', char)}
                    title={`초성 ${char}`}
                  >
                    {char}
                  </button>
                ))}
              </div>

              {/* 구분선 */}
              <div className="shrink-0 w-px bg-border-subtle" />

              {/* 중성 */}
              <div className="flex gap-1 shrink-0">
                {JUNGSEONG_LIST.map((char) => (
                  <button
                    key={`ju-${char}`}
                    className={cn(
                      'w-7 h-7 text-sm rounded cursor-pointer transition-all flex items-center justify-center',
                      editingPartInLayout && ['JU', 'JU_H', 'JU_V'].includes(editingPartInLayout) && editingJamoChar === char
                        ? 'bg-accent-blue text-white font-semibold'
                        : 'bg-surface-2 text-text-dim-1 border border-border hover:bg-surface-hover hover:text-foreground'
                    )}
                    onClick={() => handleJamo('jungseong', char)}
                    title={`중성 ${char}`}
                  >
                    {char}
                  </button>
                ))}
              </div>

              {/* 구분선 */}
              <div className="shrink-0 w-px bg-border-subtle" />

              {/* 종성 */}
              <div className="flex gap-1 shrink-0">
                {JONGSEONG_LIST.filter((c) => c !== '').map((char) => (
                  <button
                    key={`jo-${char}`}
                    className={cn(
                      'w-7 h-7 text-sm rounded cursor-pointer transition-all flex items-center justify-center',
                      editingPartInLayout === 'JO' && editingJamoChar === char
                        ? 'bg-accent-blue text-white font-semibold'
                        : 'bg-surface-2 text-text-dim-1 border border-border hover:bg-surface-hover hover:text-foreground'
                    )}
                    onClick={() => handleJamo('jongseong', char)}
                    title={`종성 ${char}`}
                  >
                    {char}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* 글로벌 스타일 퀵 컨트롤 (항상 표시) */}
      <GlobalQuickControls />

      {/* 브레드크럼 네비게이션 */}
      <EditorBreadcrumb />

      {/* 콘텐츠 */}
      {content}
    </div>
  )
}
