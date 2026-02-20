import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { useUIStore } from '../../stores/uiStore'
import { useJamoStore } from '../../stores/jamoStore'
import { ConditionBuilder } from './ConditionBuilder'
import type { JamoOverride, JamoOverrideVariant, OverrideCondition } from '../../types'

/** 오버라이드가 없을 때 반환할 안정 참조 (무한 리렌더 방지) */
const EMPTY_OVERRIDES: JamoOverride[] = []

/** 짧은 고유 ID 생성 */
function generateId(): string {
  return `ovr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

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

interface OverridePanelProps {
  /** 오버라이드 탭 전환 시 호출 (드래프트 strokes 재로드용) */
  onOverrideSwitch: (overrideId: string | null) => void
}

export function OverridePanel({ onOverrideSwitch }: OverridePanelProps) {
  const { editingJamoType, editingJamoChar, editingOverrideId, setEditingOverrideId } = useUIStore()
  const { addOverride, updateOverride, removeOverride } = useJamoStore()

  // 오버라이드 배열만 직접 구독 — Zustand이 배열 참조 변경을 정확히 감지
  const overrides = useJamoStore((s) => {
    if (!editingJamoType || !editingJamoChar) return EMPTY_OVERRIDES
    return s[editingJamoType][editingJamoChar]?.overrides ?? EMPTY_OVERRIDES
  })

  // 현재 선택된 오버라이드
  const selectedOverride = editingOverrideId
    ? overrides.find(o => o.id === editingOverrideId) ?? null
    : null

  if (!editingJamoType || !editingJamoChar) return null

  const handleAddOverride = () => {
    // 기본 조건: 자기 자신이 아닌 첫 번째 위치
    const defaultConditionType = editingJamoType === 'choseong' ? 'jungseongIs' as const
      : editingJamoType === 'jongseong' ? 'choseongIs' as const
      : 'choseongIs' as const
    const defaultJamo = defaultConditionType === 'choseongIs' ? 'ㄱ'
      : defaultConditionType === 'jungseongIs' ? 'ㅏ'
      : 'ㄱ'

    const newOverride: JamoOverride = {
      id: generateId(),
      conditionGroups: [[{ type: defaultConditionType, jamo: defaultJamo }]],
      variant: {} as JamoOverrideVariant, // 빈 variant = 기본값에서 복사 예정
      priority: overrides.length,
      enabled: true,
    }

    addOverride(editingJamoType, editingJamoChar, newOverride)

    // 새 오버라이드로 전환
    setEditingOverrideId(newOverride.id)
    onOverrideSwitch(newOverride.id)
  }

  const handleSelectOverride = (id: string | null) => {
    setEditingOverrideId(id)
    onOverrideSwitch(id)
  }

  const handleRemoveOverride = (id: string) => {
    removeOverride(editingJamoType, editingJamoChar, id)
    if (editingOverrideId === id) {
      setEditingOverrideId(null)
      onOverrideSwitch(null)
    }
  }

  const handleConditionGroupsChange = (conditionGroups: OverrideCondition[][]) => {
    if (!editingOverrideId) return
    updateOverride(editingJamoType, editingJamoChar, editingOverrideId, { conditionGroups })
  }

  const handleToggleEnabled = () => {
    if (!selectedOverride) return
    updateOverride(editingJamoType, editingJamoChar, selectedOverride.id, {
      enabled: !selectedOverride.enabled,
    })
  }

  return (
    <div className="p-3 bg-surface-2 rounded-md border border-border">
      <label className="text-[0.7rem] text-muted uppercase tracking-wider block mb-2">적용 범위</label>

      {/* 탭 바 */}
      <div className="flex flex-wrap gap-1 mb-2">
        {/* 기본 탭 */}
        <button
          className={cn(
            'py-1 px-2.5 rounded text-xs transition-colors border',
            editingOverrideId === null
              ? 'border-accent-cyan bg-accent-cyan/10 text-accent-cyan font-semibold'
              : 'border-border-lighter text-text-dim-4 hover:border-[#444]'
          )}
          onClick={() => handleSelectOverride(null)}
        >
          기본
        </button>

        {/* 오버라이드 탭 */}
        {overrides.map(ovr => (
          <button
            key={ovr.id}
            className={cn(
              'py-1 px-2.5 rounded text-xs transition-colors border',
              !ovr.enabled && 'opacity-40',
              editingOverrideId === ovr.id
                ? 'border-accent-orange bg-accent-orange/10 text-accent-orange font-semibold'
                : 'border-border-lighter text-text-dim-4 hover:border-[#444]'
            )}
            onClick={() => handleSelectOverride(ovr.id)}
          >
            {conditionGroupsToLabel(ovr.conditionGroups ?? (ovr.conditions ? [ovr.conditions] : []))}
          </button>
        ))}

        {/* 추가 버튼 */}
        <button
          className="py-1 px-2 rounded text-xs border border-dashed border-border-lighter text-text-dim-5 hover:border-[#444] hover:text-text-dim-3 transition-colors"
          onClick={handleAddOverride}
        >
          +
        </button>
      </div>

      {/* 선택된 오버라이드의 조건 편집 */}
      {selectedOverride && (
        <div className="flex flex-col gap-2 pt-2 border-t border-border">
          <ConditionBuilder
            conditionGroups={selectedOverride.conditionGroups ?? (selectedOverride.conditions ? [selectedOverride.conditions] : [[]])}
            onChange={handleConditionGroupsChange}
            editingJamoType={editingJamoType}
          />

          <div className="flex items-center gap-2 mt-1">
            <Button
              variant="ghost"
              size="sm"
              className={cn(
                'text-xs',
                selectedOverride.enabled ? 'text-green-400' : 'text-text-dim-5'
              )}
              onClick={handleToggleEnabled}
            >
              {selectedOverride.enabled ? '활성' : '비활성'}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs text-red-400 hover:text-red-300 ml-auto"
              onClick={() => handleRemoveOverride(selectedOverride.id)}
            >
              삭제
            </Button>
          </div>
        </div>
      )}

      {/* 기본 탭 설명 */}
      {editingOverrideId === null && overrides.length === 0 && (
        <p className="text-[0.65rem] text-text-dim-5 mt-1">
          + 버튼으로 조건부 변형을 추가할 수 있습니다
        </p>
      )}
    </div>
  )
}
