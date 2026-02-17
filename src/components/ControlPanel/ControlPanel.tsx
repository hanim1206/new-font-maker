import { useMemo, useState } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useJamoStore } from '../../stores/jamoStore'
import { CHOSEONG_LIST, JUNGSEONG_LIST, JONGSEONG_LIST } from '../../data/Hangul'
import { decomposeSyllable, isHangul, getLayoutsForJamoType, classifyJungseong } from '../../utils/hangulUtils'
import { cn } from '@/lib/utils'
import type { LayoutType, Part } from '../../types'

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

// 자모 타입 → 파트 매핑
function jamoTypeToPart(jamoType: 'choseong' | 'jungseong' | 'jongseong', jamoChar: string): Part {
  if (jamoType === 'choseong') return 'CH'
  if (jamoType === 'jongseong') return 'JO'
  // 중성은 subType에 따라 JU / JU_H
  const subType = classifyJungseong(jamoChar)
  if (subType === 'mixed') return 'JU_H' // 혼합중성 → JU_H로 진입 (JU_V도 같이 표시됨)
  return 'JU'
}

export function ControlPanel() {
  const {
    inputText,
    selectedCharIndex,
    controlMode,
    selectedLayoutType,
    editingPartInLayout,
    setControlMode,
    setSelectedLayoutType,
    setEditingJamo,
    setEditingPartInLayout,
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
    setEditingPartInLayout(null)
  }

  // 전체 메뉴에서 자모 클릭 → 레이아웃 경유 자모 편집 진입
  const handleJamoFromFullMenu = (
    type: 'choseong' | 'jungseong' | 'jongseong',
    char: string
  ) => {
    // 첫 번째 매칭 레이아웃 찾기
    const subType = type === 'jungseong' ? classifyJungseong(char) : undefined
    const layouts = getLayoutsForJamoType(type, subType)
    const firstLayout = layouts[0]
    if (!firstLayout) return

    // 레이아웃 선택 → 자모 편집 서브모드 진입
    setSelectedLayoutType(firstLayout)
    setControlMode('layout')
    setEditingJamo(type, char)
    setEditingPartInLayout(jamoTypeToPart(type, char))
  }

  // 글로벌 스타일 선택 핸들러
  const handleGlobalStyleSelect = () => {
    setControlMode('global')
    setSelectedLayoutType(null)
    setEditingJamo(null, null)
    setEditingPartInLayout(null)
  }

  return (
    <div className="h-full overflow-y-auto p-5 bg-background flex flex-col scrollbar-thin scrollbar-track-background scrollbar-thumb-border">
      <h2 className="text-3xl font-semibold mb-6 text-foreground">편집 메뉴</h2>

      {/* 글로벌 스타일 버튼 (항상 표시) */}
      <section className="mb-6">
        <h3 className="text-base font-medium mb-3 text-text-dim-3 uppercase tracking-wide">글로벌</h3>
        <button
          className={cn(
            'w-full py-3.5 px-4 text-sm bg-surface-2 text-text-dim-1 border border-border rounded-md cursor-pointer transition-all text-center',
            'hover:bg-surface-hover hover:border-border-light hover:text-foreground',
            controlMode === 'global' && 'bg-accent-blue border-accent-blue-hover text-white font-medium'
          )}
          onClick={handleGlobalStyleSelect}
        >
          글로벌 스타일
        </button>
      </section>

      {/* 빈 상태: 글자 미선택 + 전체목록 OFF */}
      {!selectedSyllable && !showFullMenu && (
        <div className="flex-1 flex items-center justify-center min-h-[200px]">
          <p className="text-text-dim-5 text-sm text-center leading-[1.8]">
            좌측에서 한글을 입력하고
            <br />
            글자를 선택하세요
          </p>
        </div>
      )}

      {/* 컨텍스트 메뉴: 선택된 글자 기반 (자모 버튼 제거, 레이아웃만) */}
      {selectedSyllable && !showFullMenu && (
        <>
          <div className="flex items-center justify-between p-4 mb-6 bg-surface border border-border rounded-md">
            <span className="text-sm text-text-dim-4">선택된 글자</span>
            <span className="text-[2rem] font-bold text-foreground">{selectedSyllable.char}</span>
          </div>

          {/* 레이아웃 편집 */}
          <section className="mb-6">
            <h3 className="text-base font-medium mb-3 text-text-dim-3 uppercase tracking-wide">레이아웃</h3>
            <button
              className={cn(
                'w-full py-3.5 px-4 text-sm bg-surface-2 text-text-dim-1 border border-border rounded-md cursor-pointer transition-all text-center',
                'hover:bg-surface-hover hover:border-border-light hover:text-foreground',
                controlMode === 'layout' &&
                selectedLayoutType === selectedSyllable.layoutType &&
                'bg-accent-blue border-accent-blue-hover text-white font-medium'
              )}
              onClick={() => handleLayoutSelect(selectedSyllable.layoutType)}
            >
              {LAYOUT_LABELS[selectedSyllable.layoutType]}
            </button>
          </section>

          {/* 자모 편집 안내 */}
          <section className="mb-6">
            <h3 className="text-base font-medium mb-3 text-text-dim-3 uppercase tracking-wide">자모</h3>
            <div className="p-4 bg-surface border border-border-subtle rounded-md">
              <p className="text-sm text-text-dim-4 leading-relaxed">
                레이아웃 편집기에서 파트를 <span className="text-text-dim-2 font-medium">더블클릭</span>하면
                해당 자모 편집 모드로 진입합니다.
              </p>
              {/* 현재 자모 편집 중 표시 */}
              {editingPartInLayout && (
                <div className="mt-3 pt-3 border-t border-border-subtle">
                  <span className="text-xs text-accent-blue font-medium">
                    현재 편집 중: {editingPartInLayout}
                  </span>
                </div>
              )}
            </div>
          </section>
        </>
      )}

      {/* 전체 목록 (고급 모드) */}
      {showFullMenu && (
        <>
          <section className="mb-6">
            <h3 className="text-base font-medium mb-3 text-text-dim-3 uppercase tracking-wide">레이아웃 편집</h3>
            <div className="grid grid-cols-2 gap-2">
              {ALL_LAYOUT_TYPES.map(({ type, label }) => (
                <button
                  key={type}
                  className={cn(
                    'py-3 px-2 text-sm bg-surface-2 text-text-dim-1 border border-border rounded cursor-pointer transition-all text-center leading-tight',
                    'hover:bg-surface-hover hover:border-border-light hover:text-foreground',
                    selectedLayoutType === type && 'bg-accent-blue border-accent-blue-hover text-white font-medium'
                  )}
                  onClick={() => handleLayoutSelect(type)}
                  title={type}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* 자모 그리드: 클릭 시 레이아웃 경유 자모 편집 진입 */}
          <section className="mb-6">
            <h3 className="text-base font-medium mb-3 text-text-dim-3 uppercase tracking-wide">
              초성 편집
              <span className="text-xs text-text-dim-5 ml-2 normal-case font-normal">클릭 → 레이아웃 내 편집</span>
            </h3>
            <div className="grid grid-cols-5 gap-1.5">
              {CHOSEONG_LIST.map((char) => (
                <button
                  key={char}
                  className={cn(
                    'aspect-square text-lg bg-surface-2 text-text-dim-1 border border-border rounded-sm cursor-pointer transition-all flex items-center justify-center',
                    'hover:bg-surface-hover hover:border-border-light hover:text-foreground',
                    editingPartInLayout === 'CH' &&
                    controlMode === 'layout' &&
                    'bg-accent-blue border-accent-blue-hover text-white font-semibold'
                  )}
                  onClick={() => handleJamoFromFullMenu('choseong', char)}
                >
                  {char}
                </button>
              ))}
            </div>
          </section>

          <section className="mb-6">
            <h3 className="text-base font-medium mb-3 text-text-dim-3 uppercase tracking-wide">
              중성 편집
              <span className="text-xs text-text-dim-5 ml-2 normal-case font-normal">클릭 → 레이아웃 내 편집</span>
            </h3>
            <div className="grid grid-cols-5 gap-1.5">
              {JUNGSEONG_LIST.map((char) => (
                <button
                  key={char}
                  className={cn(
                    'aspect-square text-lg bg-surface-2 text-text-dim-1 border border-border rounded-sm cursor-pointer transition-all flex items-center justify-center',
                    'hover:bg-surface-hover hover:border-border-light hover:text-foreground',
                    editingPartInLayout &&
                    (editingPartInLayout === 'JU' || editingPartInLayout === 'JU_H' || editingPartInLayout === 'JU_V') &&
                    controlMode === 'layout' &&
                    'bg-accent-blue border-accent-blue-hover text-white font-semibold'
                  )}
                  onClick={() => handleJamoFromFullMenu('jungseong', char)}
                >
                  {char}
                </button>
              ))}
            </div>
          </section>

          <section className="mb-6">
            <h3 className="text-base font-medium mb-3 text-text-dim-3 uppercase tracking-wide">
              종성 편집
              <span className="text-xs text-text-dim-5 ml-2 normal-case font-normal">클릭 → 레이아웃 내 편집</span>
            </h3>
            <div className="grid grid-cols-5 gap-1.5">
              {JONGSEONG_LIST.filter((c) => c !== '').map((char) => (
                <button
                  key={char}
                  className={cn(
                    'aspect-square text-lg bg-surface-2 text-text-dim-1 border border-border rounded-sm cursor-pointer transition-all flex items-center justify-center',
                    'hover:bg-surface-hover hover:border-border-light hover:text-foreground',
                    editingPartInLayout === 'JO' &&
                    controlMode === 'layout' &&
                    'bg-accent-blue border-accent-blue-hover text-white font-semibold'
                  )}
                  onClick={() => handleJamoFromFullMenu('jongseong', char)}
                >
                  {char}
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {/* 전체 목록 토글 */}
      <div className="mt-auto pt-4 border-t border-border-subtle">
        <button
          className="w-full py-2.5 text-sm bg-transparent text-text-dim-5 border border-border rounded cursor-pointer transition-all hover:text-text-dim-3 hover:border-border-light hover:bg-surface"
          onClick={() => setShowFullMenu(!showFullMenu)}
        >
          {showFullMenu ? '선택 글자 메뉴로 돌아가기' : '전체 목록 보기'}
        </button>
      </div>
    </div>
  )
}
