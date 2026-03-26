import { useState, useEffect } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useJamoStore } from '../../stores/jamoStore'
import { ConditionBuilder } from './ConditionBuilder'
import type { JamoOverride, JamoOverrideVariant, OverrideCondition } from '../../types'

/** 오버라이드가 없을 때 반환할 안정 참조 */
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

interface OverrideChipBarProps {
  onOverrideSwitch: (overrideId: string | null) => void
}

/** 캔버스 상단 오버라이드 칩 바 — 상시 표시 */
export function OverrideChipBar({ onOverrideSwitch }: OverrideChipBarProps) {
  const { editingJamoType, editingJamoChar, editingOverrideId, setEditingOverrideId } = useUIStore()
  const { addOverride, updateOverride, removeOverride } = useJamoStore()
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // 자모 편집 대상 변경 시 확장 패널 닫기
  useEffect(() => {
    setExpandedId(null)
  }, [editingJamoType, editingJamoChar])

  const overrides = useJamoStore((s) => {
    if (!editingJamoType || !editingJamoChar) return EMPTY_OVERRIDES
    return s[editingJamoType][editingJamoChar]?.overrides ?? EMPTY_OVERRIDES
  })

  const selectedOverride = editingOverrideId
    ? overrides.find(o => o.id === editingOverrideId) ?? null
    : null

  if (!editingJamoType || !editingJamoChar) return null

  const handleAddOverride = () => {
    const defaultConditionType = editingJamoType === 'choseong' ? 'jungseongIs' as const
      : editingJamoType === 'jongseong' ? 'choseongIs' as const
      : 'choseongIs' as const
    const defaultJamo = defaultConditionType === 'choseongIs' ? 'ㄱ'
      : defaultConditionType === 'jungseongIs' ? 'ㅏ'
      : 'ㄱ'

    const newOverride: JamoOverride = {
      id: generateId(),
      conditionGroups: [[{ type: defaultConditionType, jamo: defaultJamo }]],
      variant: {} as JamoOverrideVariant,
      priority: overrides.length,
      enabled: true,
    }

    addOverride(editingJamoType, editingJamoChar, newOverride)
    setEditingOverrideId(newOverride.id)
    onOverrideSwitch(newOverride.id)
  }

  const handleChipClick = (id: string | null) => {
    if (id === editingOverrideId) {
      // 이미 선택된 칩을 다시 클릭 → 확장 패널 토글
      setExpandedId(expandedId === id ? null : id)
    } else {
      setEditingOverrideId(id)
      onOverrideSwitch(id)
      setExpandedId(null)
    }
  }

  const handleRemoveOverride = (id: string) => {
    removeOverride(editingJamoType, editingJamoChar, id)
    if (editingOverrideId === id) {
      setEditingOverrideId(null)
      onOverrideSwitch(null)
    }
    setExpandedId(null)
  }

  const handleToggleEnabled = () => {
    if (!selectedOverride) return
    updateOverride(editingJamoType, editingJamoChar, selectedOverride.id, {
      enabled: !selectedOverride.enabled,
    })
  }

  const handleConditionGroupsChange = (conditionGroups: OverrideCondition[][]) => {
    if (!editingOverrideId) return
    updateOverride(editingJamoType, editingJamoChar, editingOverrideId, { conditionGroups })
  }

  const isDefaultActive = editingOverrideId === null

  return (
    <div
      className="absolute top-3.5 left-1/2 -translate-x-1/2 z-30"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
    >
      {/* 칩 바 */}
      <div className="relative flex items-center gap-[3px] bg-[#16162a] border border-[#2a2a4a] rounded-[20px] py-[3px] px-1">
        {/* 기본 칩 */}
        <button
          className={`flex items-center gap-1 h-[26px] px-2.5 border-none rounded-[14px] text-[11px] cursor-pointer transition-all whitespace-nowrap ${
            isDefaultActive
              ? 'bg-[rgba(78,205,196,0.12)] text-[#4ecdc4] font-semibold'
              : 'bg-transparent text-[#7777aa] hover:bg-[#252548] hover:text-[#b0b0d0]'
          }`}
          onClick={() => handleChipClick(null)}
        >
          <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isDefaultActive ? 'bg-[#4ecdc4]' : 'bg-[#555577]'}`} />
          기본
        </button>

        {/* 오버라이드 칩들 */}
        {overrides.map(ovr => {
          const isActive = editingOverrideId === ovr.id
          const label = conditionGroupsToLabel(ovr.conditionGroups ?? (ovr.conditions ? [ovr.conditions] : []))
          return (
            <button
              key={ovr.id}
              className={`flex items-center gap-1 h-[26px] px-2.5 border-none rounded-[14px] text-[11px] cursor-pointer transition-all whitespace-nowrap ${
                !ovr.enabled ? 'opacity-[0.35]' : ''
              } ${
                isActive
                  ? 'bg-[rgba(251,146,60,0.12)] text-[#fb923c] font-semibold'
                  : 'bg-transparent text-[#7777aa] hover:bg-[#252548] hover:text-[#b0b0d0]'
              }`}
              onClick={() => handleChipClick(ovr.id)}
            >
              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${isActive ? 'bg-[#fb923c]' : 'bg-[#555577]'}`} />
              {label}
              {isActive && (
                <svg width="9" height="9" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M5 7l3 3 3-3" />
                </svg>
              )}
            </button>
          )
        })}

        {/* + 버튼 */}
        <button
          className="flex items-center justify-center w-6 h-6 border border-dashed border-[#3a3a5a] rounded-full bg-transparent text-[#555577] text-[13px] cursor-pointer transition-all shrink-0 hover:border-[#6666aa] hover:text-[#8888cc] hover:bg-[#1e1e38]"
          onClick={handleAddOverride}
        >
          +
        </button>

        {/* 확장 패널 */}
        {expandedId !== null && selectedOverride && expandedId === editingOverrideId && (
          <div className="absolute top-[calc(100%+6px)] left-1/2 -translate-x-1/2 bg-[#16162a] border border-[#2a2a4a] rounded-[10px] p-2.5 px-3 shadow-[0_12px_32px_rgba(0,0,0,0.6)] min-w-[220px] z-20">
            <div className="text-[10px] text-[#555577] uppercase tracking-[0.05em] mb-2">
              오버라이드 조건
            </div>

            <ConditionBuilder
              conditionGroups={selectedOverride.conditionGroups ?? (selectedOverride.conditions ? [selectedOverride.conditions] : [[]])}
              onChange={handleConditionGroupsChange}
              editingJamoType={editingJamoType}
            />

            <div className="flex items-center gap-1 mt-2 pt-2 border-t border-[#2a2a4a]">
              <button
                className={`flex items-center gap-1 h-[26px] px-2.5 border rounded-md text-[10px] font-medium cursor-pointer transition-all ${
                  selectedOverride.enabled
                    ? 'bg-[rgba(74,222,128,0.08)] border-[rgba(74,222,128,0.2)] text-[#4ade80] hover:bg-[rgba(74,222,128,0.15)]'
                    : 'bg-[rgba(136,136,170,0.08)] border-[rgba(136,136,170,0.2)] text-[#8888aa]'
                }`}
                onClick={handleToggleEnabled}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 8.5l3.5 3.5 6.5-8" />
                </svg>
                {selectedOverride.enabled ? '활성' : '비활성'}
              </button>
              <button
                className="flex items-center gap-1 h-[26px] px-2.5 border rounded-md text-[10px] font-medium cursor-pointer transition-all ml-auto bg-[rgba(248,113,113,0.06)] border-[rgba(248,113,113,0.15)] text-[#f87171] hover:bg-[rgba(248,113,113,0.15)] hover:border-[rgba(248,113,113,0.3)]"
                onClick={() => handleRemoveOverride(selectedOverride.id)}
              >
                <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M3 5h10M6 5V4a1 1 0 011-1h2a1 1 0 011 1v1M5 5v7a1 1 0 001 1h4a1 1 0 001-1V5" />
                </svg>
                삭제
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
