import { LayoutCanvasColumn } from './LayoutCanvasColumn'
import { JamoCanvasColumn } from './JamoCanvasColumn'
import { JamoControlsColumn } from './JamoControlsColumn'
import { OverridePanel } from '../CharacterEditor/OverridePanel'
import { Button } from '@/components/ui/button'
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover'
import { cn } from '@/lib/utils'
import { useUIStore } from '../../stores/uiStore'
import { useJamoStore } from '../../stores/jamoStore'
import type { OverrideCondition } from '../../types'

/** 단일 AND 그룹을 짧은 라벨로 변환 */
function groupToLabel(group: OverrideCondition[]): string {
  if (group.length === 0) return '?'
  return group.map(c => {
    if (c.type === 'layoutIs') return c.layout.slice(0, 6)
    const posLabel = c.type === 'choseongIs' ? '초' : c.type === 'jungseongIs' ? '중' : '종'
    return `${c.jamo}${posLabel}`
  }).join('+')
}

/** conditionGroups (OR/AND)를 짧은 라벨로 변환 */
function conditionGroupsToLabel(groups: OverrideCondition[][]): string {
  if (groups.length === 0) return '(조건 없음)'
  return groups.map(g => groupToLabel(g)).join(' | ')
}

// === 타입 정의 ===

type LayoutCanvasProps = React.ComponentProps<typeof LayoutCanvasColumn>
type JamoCanvasProps = React.ComponentProps<typeof JamoCanvasColumn>
type JamoControlsProps = React.ComponentProps<typeof JamoControlsColumn>

export interface LayoutEditorMobileProps {
  layoutCanvasProps: LayoutCanvasProps
  jamoCanvasProps: JamoCanvasProps
  jamoControlsProps: JamoControlsProps
  isJamoEditing: boolean
  editingJamoInfo: { type: 'choseong' | 'jungseong' | 'jongseong'; char: string } | null
  canUndo: boolean
  canRedo: boolean
  onPartDeselect: () => void
  onJamoReset: () => void
  onUndo: () => void
  onRedo: () => void
}

// === 컴포넌트 ===

/** 현재 오버라이드 없을 때의 안정 참조 */
const EMPTY_OVERRIDES: { id: string; conditionGroups?: OverrideCondition[][]; conditions?: OverrideCondition[] }[] = []

export function LayoutEditorMobile({
  layoutCanvasProps,
  jamoCanvasProps,
  jamoControlsProps,
  isJamoEditing,
  editingJamoInfo,
  canUndo,
  canRedo,
  onPartDeselect,
  onJamoReset,
  onUndo,
  onRedo,
}: LayoutEditorMobileProps) {
  const editingOverrideId = useUIStore(s => s.editingOverrideId)
  const editingJamoType = useUIStore(s => s.editingJamoType)
  const editingJamoChar = useUIStore(s => s.editingJamoChar)

  // 현재 오버라이드 라벨 계산
  const overrideLabel = useJamoStore((s) => {
    if (!editingOverrideId || !editingJamoType || !editingJamoChar) return null
    const overrides = s[editingJamoType][editingJamoChar]?.overrides ?? EMPTY_OVERRIDES
    const ovr = overrides.find(o => o.id === editingOverrideId)
    if (!ovr) return null
    return conditionGroupsToLabel(ovr.conditionGroups ?? (ovr.conditions ? [ovr.conditions] : []))
  })

  const chipLabel = editingOverrideId ? (overrideLabel ?? '...') : '기본'
  const isOverride = editingOverrideId !== null

  return (
    <div className="h-full overflow-hidden flex flex-col" onClick={onPartDeselect}>
      {/* 자모 편집 상단 영역 */}
      {isJamoEditing && editingJamoInfo && (
        <div className="shrink-0 bg-surface-2 px-3 py-2 border-b border-border-subtle flex items-center gap-1.5">
          <span className="text-sm font-medium text-text-dim-3 truncate">
            {editingJamoInfo.char} 편집
          </span>

          {/* 범위 Popover 트리거 */}
          <Popover>
            <PopoverTrigger asChild>
              <button
                className={cn(
                  'shrink-0 h-6 px-2 rounded-full text-[0.65rem] font-medium flex items-center gap-0.5 transition-colors',
                  isOverride
                    ? 'bg-accent-orange/15 text-accent-orange'
                    : 'bg-accent-cyan/15 text-accent-cyan'
                )}
                onClick={(e) => e.stopPropagation()}
              >
                {chipLabel} <span className="text-[0.55rem] opacity-60">▾</span>
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              side="bottom"
              className="w-auto max-w-[90vw] p-3"
              onClick={(e) => e.stopPropagation()}
            >
              <OverridePanel onOverrideSwitch={jamoControlsProps.onOverrideSwitch} compact />
            </PopoverContent>
          </Popover>

          {/* 종성 편집 시 초성 스타일 적용 */}
          {jamoControlsProps.choseongStyleInfo && (
            <Button
              variant="outline"
              size="sm"
              onClick={jamoControlsProps.onApplyChoseongStyle}
              className="text-[0.7rem] h-7 px-2"
            >
              {jamoControlsProps.choseongStyleInfo.type === 'compound'
                ? `초성 ${jamoControlsProps.choseongStyleInfo.parts?.[0]}+${jamoControlsProps.choseongStyleInfo.parts?.[1]}`
                : '초성 적용'}
            </Button>
          )}

          <div className="flex-1" />
          <Button variant="default" size="sm" onClick={onUndo} disabled={!canUndo} title="되돌리기">↩</Button>
          <Button variant="default" size="sm" onClick={onRedo} disabled={!canRedo} title="다시 실행">↪</Button>
          <Button variant="default" size="sm" onClick={onJamoReset}>초기화</Button>
        </div>
      )}

      {/* 메인 캔버스 */}
      <div className="flex-1 min-h-0">
        {isJamoEditing ? (
          <JamoCanvasColumn {...jamoCanvasProps} />
        ) : (
          <LayoutCanvasColumn {...layoutCanvasProps} />
        )}
      </div>
    </div>
  )
}
