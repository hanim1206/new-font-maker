import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { CHOSEONG_LIST, JUNGSEONG_LIST, JONGSEONG_LIST } from '../../data/Hangul'
import { LAYOUT_LABELS } from '../../utils/hangulUtils'
import type { OverrideCondition, LayoutType } from '../../types'

/** 조건의 위치 타입 */
type PositionType = 'choseongIs' | 'jungseongIs' | 'jongseongIs' | 'layoutIs'

const POSITION_OPTIONS: { value: PositionType; label: string }[] = [
  { value: 'choseongIs', label: '초성' },
  { value: 'jungseongIs', label: '중성' },
  { value: 'jongseongIs', label: '종성' },
  { value: 'layoutIs', label: '레이아웃' },
]

/** 위치 타입별 선택 가능한 자모 목록 */
function getOptionsForPosition(posType: PositionType): { value: string; label: string }[] {
  switch (posType) {
    case 'choseongIs':
      return CHOSEONG_LIST.map(c => ({ value: c, label: c }))
    case 'jungseongIs':
      return JUNGSEONG_LIST.map(c => ({ value: c, label: c }))
    case 'jongseongIs':
      return (JONGSEONG_LIST as readonly string[])
        .filter(c => c !== '')
        .map(c => ({ value: c, label: c }))
    case 'layoutIs':
      return Object.entries(LAYOUT_LABELS).map(([key, label]) => ({
        value: key,
        label,
      }))
  }
}

/** 조건 → 위치 타입 추출 */
function conditionToPosition(condition: OverrideCondition): PositionType {
  return condition.type
}

/** 조건 → 값 추출 */
function conditionToValue(condition: OverrideCondition): string {
  if (condition.type === 'layoutIs') return condition.layout
  return condition.jamo
}

/** 위치 + 값 → OverrideCondition 변환 */
function buildCondition(posType: PositionType, value: string): OverrideCondition {
  if (posType === 'layoutIs') {
    return { type: 'layoutIs', layout: value as LayoutType }
  }
  return { type: posType, jamo: value }
}

/** 편집 중인 자모 위치를 제외한 기본 조건 생성 */
function createDefaultCondition(editingJamoType?: 'choseong' | 'jungseong' | 'jongseong' | null): OverrideCondition {
  const availablePositions = POSITION_OPTIONS.filter(p => {
    if (!editingJamoType) return true
    const selfType = `${editingJamoType}Is`
    return p.value !== selfType
  })
  const defaultPos = availablePositions[0]?.value ?? 'choseongIs'
  const options = getOptionsForPosition(defaultPos)
  const defaultValue = options[0]?.value ?? ''
  return buildCondition(defaultPos, defaultValue)
}

interface ConditionBuilderProps {
  /** OR(AND) 조건 그룹: 외부 = OR, 내부 = AND */
  conditionGroups: OverrideCondition[][]
  onChange: (conditionGroups: OverrideCondition[][]) => void
  /** 편집 중인 자모의 위치 (자기 자신 조건 제외용) */
  editingJamoType?: 'choseong' | 'jungseong' | 'jongseong' | null
}

export function ConditionBuilder({ conditionGroups, onChange, editingJamoType }: ConditionBuilderProps) {
  const selectClass = 'py-1 px-2 bg-[#0f0f0f] border border-border-lighter rounded text-xs text-[#e5e5e5] focus:outline-none focus:border-primary'

  // ===== AND 그룹 내부 조건 핸들러 =====

  const handlePositionChange = (groupIdx: number, condIdx: number, newPos: PositionType) => {
    const options = getOptionsForPosition(newPos)
    const defaultValue = options[0]?.value ?? ''
    const updated = conditionGroups.map((g, gi) =>
      gi === groupIdx
        ? g.map((c, ci) => ci === condIdx ? buildCondition(newPos, defaultValue) : c)
        : g
    )
    onChange(updated)
  }

  const handleValueChange = (groupIdx: number, condIdx: number, newValue: string) => {
    const updated = conditionGroups.map((g, gi) =>
      gi === groupIdx
        ? g.map((c, ci) => {
            if (ci !== condIdx) return c
            const posType = conditionToPosition(c)
            return buildCondition(posType, newValue)
          })
        : g
    )
    onChange(updated)
  }

  const handleRemoveCondition = (groupIdx: number, condIdx: number) => {
    const updated = conditionGroups.map((g, gi) =>
      gi === groupIdx ? g.filter((_, ci) => ci !== condIdx) : g
    )
    // 빈 그룹이 되면 그룹 자체도 제거
    const filtered = updated.filter(g => g.length > 0)
    onChange(filtered.length > 0 ? filtered : [[]])
  }

  const handleAddCondition = (groupIdx: number) => {
    const newCondition = createDefaultCondition(editingJamoType)
    const updated = conditionGroups.map((g, gi) =>
      gi === groupIdx ? [...g, newCondition] : g
    )
    onChange(updated)
  }

  // ===== OR 그룹 핸들러 =====

  const handleAddOrGroup = () => {
    const newCondition = createDefaultCondition(editingJamoType)
    onChange([...conditionGroups, [newCondition]])
  }

  const handleRemoveGroup = (groupIdx: number) => {
    const filtered = conditionGroups.filter((_, gi) => gi !== groupIdx)
    onChange(filtered.length > 0 ? filtered : [[]])
  }

  return (
    <div className="flex flex-col gap-2">
      {conditionGroups.map((group, groupIdx) => (
        <div key={groupIdx}>
          {/* OR 구분선 (첫 번째 그룹 제외) */}
          {groupIdx > 0 && (
            <div className="flex items-center gap-2 my-1.5">
              <div className="flex-1 h-px bg-border-lighter" />
              <span className="text-[0.6rem] text-accent-orange font-semibold tracking-wider">OR</span>
              <div className="flex-1 h-px bg-border-lighter" />
            </div>
          )}

          {/* AND 그룹 */}
          <div className={cn(
            'flex flex-col gap-1.5 p-2 rounded border',
            conditionGroups.length > 1 ? 'border-border-lighter bg-[#0a0a0a]' : 'border-transparent'
          )}>
            {group.map((condition, condIdx) => {
              const posType = conditionToPosition(condition)
              const value = conditionToValue(condition)
              const options = getOptionsForPosition(posType)
              const isLayout = posType === 'layoutIs'

              return (
                <div key={condIdx}>
                  {/* AND 라벨 (첫 번째 조건 제외) */}
                  {condIdx > 0 && (
                    <div className="flex items-center gap-1 my-0.5 ml-1">
                      <span className="text-[0.6rem] text-accent-cyan font-semibold tracking-wider">AND</span>
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 flex-wrap">
                    {/* 자모/레이아웃 값 선택 */}
                    {isLayout ? (
                      <>
                        <span className="text-xs text-text-dim-4">레이아웃이</span>
                        <select
                          className={cn(selectClass, 'min-w-[100px]')}
                          value={value}
                          onChange={e => handleValueChange(groupIdx, condIdx, e.target.value)}
                        >
                          {options.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </>
                    ) : (
                      <>
                        <select
                          className={cn(selectClass, 'w-[52px] text-center')}
                          value={value}
                          onChange={e => handleValueChange(groupIdx, condIdx, e.target.value)}
                        >
                          {options.map(opt => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <span className="text-xs text-text-dim-4">가</span>
                      </>
                    )}

                    {/* 위치(초성/중성/종성) 선택 */}
                    <select
                      className={selectClass}
                      value={posType}
                      onChange={e => handlePositionChange(groupIdx, condIdx, e.target.value as PositionType)}
                    >
                      {POSITION_OPTIONS.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>

                    {!isLayout && <span className="text-xs text-text-dim-4">일때</span>}

                    {/* 조건 삭제 버튼 */}
                    <button
                      className="text-xs text-text-dim-5 hover:text-red-400 ml-auto"
                      onClick={() => handleRemoveCondition(groupIdx, condIdx)}
                      title="조건 삭제"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )
            })}

            {/* AND 조건 추가 + OR 그룹 삭제 */}
            <div className="flex items-center gap-1 mt-0.5">
              <Button
                variant="ghost"
                size="sm"
                className="text-xs text-text-dim-4 hover:text-text-dim-2 h-6 px-1.5"
                onClick={() => handleAddCondition(groupIdx)}
              >
                + AND
              </Button>

              {conditionGroups.length > 1 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-red-400/60 hover:text-red-400 h-6 px-1.5 ml-auto"
                  onClick={() => handleRemoveGroup(groupIdx)}
                  title="이 OR 그룹 삭제"
                >
                  그룹 삭제
                </Button>
              )}
            </div>
          </div>
        </div>
      ))}

      {/* OR 그룹 추가 버튼 */}
      <Button
        variant="ghost"
        size="sm"
        className="text-xs text-accent-orange/70 hover:text-accent-orange self-start"
        onClick={handleAddOrGroup}
      >
        + OR 그룹 추가
      </Button>
    </div>
  )
}
