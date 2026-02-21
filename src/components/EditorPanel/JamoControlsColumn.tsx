import { OverridePanel } from '../CharacterEditor/OverridePanel'
import { Button } from '@/components/ui/button'

interface ChoseongStyleInfo {
  type: 'single' | 'compound'
  parts?: [string, string]
}

interface JamoControlsColumnProps {
  // 자모 편집 상태
  isJamoEditing: boolean
  editingJamoInfo: { type: 'choseong' | 'jungseong' | 'jongseong'; char: string } | null
  choseongStyleInfo: ChoseongStyleInfo | null
  onApplyChoseongStyle: () => void
  // 오버라이드 탭 전환 시 호출
  onOverrideSwitch: (overrideId: string | null) => void
}

/** 우측 컨트롤러 패널 (슬림 — 오버라이드 + 초성 스타일만) */
export function JamoControlsColumn({
  isJamoEditing,
  editingJamoInfo,
  choseongStyleInfo,
  onApplyChoseongStyle,
  onOverrideSwitch,
}: JamoControlsColumnProps) {
  if (isJamoEditing && editingJamoInfo) {
    return (
      <div className="h-full overflow-y-auto">
        <div className="p-4 flex flex-col gap-4">
          {/* 초성 스타일 적용 버튼 (종성 편집 시) */}
          {choseongStyleInfo && (
            <Button
              variant="outline"
              size="sm"
              onClick={onApplyChoseongStyle}
              className="text-xs w-full"
              title={choseongStyleInfo.type === 'compound'
                ? `초성 ${choseongStyleInfo.parts?.[0]}+${choseongStyleInfo.parts?.[1]}의 획을 종성에 적용`
                : `초성 ${editingJamoInfo.char}의 획/패딩을 종성에 적용`
              }
            >
              {choseongStyleInfo.type === 'compound'
                ? `초성 ${choseongStyleInfo.parts?.[0]}+${choseongStyleInfo.parts?.[1]} 적용`
                : '초성 스타일 적용'
              }
            </Button>
          )}

          {/* 적용 범위 (조건부 오버라이드) */}
          <OverridePanel onOverrideSwitch={onOverrideSwitch} />

          <p className="text-xs text-text-dim-5 text-center leading-relaxed">
            방향키: 이동 | Shift+방향키: 크기
            <br />
            R: 회전 | Esc: 레이아웃으로 돌아가기
          </p>
        </div>
      </div>
    )
  }

  // 레이아웃 모드
  return (
    <div className="h-full overflow-y-auto p-4 flex flex-col gap-3">
      <h3 className="text-sm font-medium text-text-dim-3 uppercase tracking-wider">레이아웃 설정</h3>
      <p className="text-xs text-text-dim-5 mt-4 text-center leading-relaxed">
        좌측 캔버스에서 파트를 클릭하면
        <br />
        자모 편집 모드로 진입합니다
      </p>
    </div>
  )
}
