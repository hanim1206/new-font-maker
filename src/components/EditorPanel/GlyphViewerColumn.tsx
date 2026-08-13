/**
 * GlyphViewerColumn — 완성형 음절 뷰어 + 오버라이드 scope 편집
 *
 * 두 가지 모드:
 * 1. 기본 모드 (자모 편집 전): 레이아웃/자모 필터로 음절 표시
 * 2. 자모 편집 모드: 오버라이드 탭 + 그룹핑 버튼 + 드래그 선택 + 적용 버튼
 */
import { useState, useCallback, useEffect, useMemo } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useJamoStore } from '../../stores/jamoStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import { SemanticGlyphGrid } from './SemanticGlyphGrid'
import { LayoutFilterChips } from './LayoutFilterChips'
import { classifyJungseong, decomposeSyllableWithOverrides } from '../../utils/hangulUtils'
import { CHOSEONG_LIST, JUNGSEONG_LIST, JONGSEONG_LIST } from '../../data/Hangul'
import type { LayoutType, JamoOverride, JamoOverrideVariant, OverrideCondition, LayoutOverride } from '../../types'
import type { SyllableGridMeta } from '../../utils/syllableGridUtils'

// ===== 모듈 로드 시 1회 계산 =====

type SyllableMeta = SyllableGridMeta

function containsJamo(meta: SyllableMeta, type: 'choseong' | 'jungseong' | 'jongseong', char: string): boolean {
  if (type === 'choseong') return meta.cho === char
  if (type === 'jungseong') return meta.jung === char
  return meta.jong === char
}

function buildAllSyllables(): SyllableMeta[] {
  const result: SyllableMeta[] = []
  for (let i = 0; i < 11172; i++) {
    const char = String.fromCharCode(0xac00 + i)
    const choIdx = Math.floor(i / (21 * 28))
    const jungIdx = Math.floor((i % (21 * 28)) / 28)
    const jongIdx = i % 28

    const cho = CHOSEONG_LIST[choIdx]
    const jung = JUNGSEONG_LIST[jungIdx]
    const jong = JONGSEONG_LIST[jongIdx]

    const jungType = classifyJungseong(jung)
    const hasJong = jong !== ''

    let layoutType: LayoutType
    if (jungType === 'mixed') {
      layoutType = hasJong ? 'choseong-jungseong-mixed-jongseong' : 'choseong-jungseong-mixed'
    } else if (jungType === 'horizontal') {
      layoutType = hasJong ? 'choseong-jungseong-horizontal-jongseong' : 'choseong-jungseong-horizontal'
    } else {
      layoutType = hasJong ? 'choseong-jungseong-vertical-jongseong' : 'choseong-jungseong-vertical'
    }

    result.push({ char, layoutType, cho, jung, jong })
  }
  return result
}

// 거의 안 쓰이는 쌍자음 초성 / 겹받침 종성 제외
const EXCLUDED_CHOSEONG = new Set(['ㅆ', 'ㅉ'])
const EXCLUDED_JONGSEONG = new Set(['ㄳ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ'])
const ALL_SYLLABLES = buildAllSyllables().filter(
  (m) => !EXCLUDED_CHOSEONG.has(m.cho) && !EXCLUDED_JONGSEONG.has(m.jong)
)

// ===== 유틸 =====

function generateId(): string {
  return `ovr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`
}

const EMPTY_OVERRIDES: JamoOverride[] = []
const CELL_PX = 36

// ===== Props =====

interface GlyphViewerColumnProps {
  onOverrideSwitch?: (id: string | null) => void
  activeLayoutType: LayoutType | null
  onSelectLayout: (layoutType: LayoutType) => void
  onJamoScopeStateChange?: (isDirty: boolean, action: ((mode: 'save' | 'discard') => boolean) | null) => void
}

// ===== 컴포넌트 =====

export function GlyphViewerColumn({ onOverrideSwitch, activeLayoutType, onSelectLayout, onJamoScopeStateChange }: GlyphViewerColumnProps) {
  // --- 스토어 ---
  const selectedLayoutType = useUIStore((s) => s.selectedLayoutType)
  const editingJamoChar = useUIStore((s) => s.editingJamoChar)
  const editingJamoType = useUIStore((s) => s.editingJamoType)
  const editingOverrideId = useUIStore((s) => s.editingOverrideId)
  const setEditingOverrideId = useUIStore((s) => s.setEditingOverrideId)
  const editingLayoutOverrideId = useUIStore((s) => s.editingLayoutOverrideId)
  const setEditingLayoutOverrideId = useUIStore((s) => s.setEditingLayoutOverrideId)
  const { addOverride, updateOverride, removeOverride } = useJamoStore()
  const { choseong, jungseong, jongseong } = useJamoStore()
  const { getLayoutSchema, getEffectivePadding, layoutSchemas, addLayoutOverride, updateLayoutOverride, removeLayoutOverride } = useLayoutStore()
  const { getEffectiveStyle } = useGlobalStyleStore()

  // 레이아웃 7종의 schema+style을 사전 계산 (셀 렌더 시 재사용)
  const cellSchemas = useMemo(() => {
    const LAYOUT_TYPES: LayoutType[] = [
      'choseong-jungseong-vertical',
      'choseong-jungseong-horizontal',
      'choseong-jungseong-mixed',
      'choseong-jungseong-vertical-jongseong',
      'choseong-jungseong-horizontal-jongseong',
      'choseong-jungseong-mixed-jongseong',
      'choseong-only',
    ]
    const map: Partial<Record<LayoutType, { schema: ReturnType<typeof getLayoutSchema> & { padding: ReturnType<typeof getEffectivePadding> }; style: ReturnType<typeof getEffectiveStyle> }>> = {}
    for (const lt of LAYOUT_TYPES) {
      const schema = getLayoutSchema(lt)
      const padding = getEffectivePadding(lt)
      map[lt] = { schema: { ...schema, padding }, style: getEffectiveStyle(lt) }
    }
    return map
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [getLayoutSchema, getEffectivePadding, getEffectiveStyle, layoutSchemas])

  const overrides = useJamoStore((s) => {
    if (!editingJamoType || !editingJamoChar) return EMPTY_OVERRIDES
    return s[editingJamoType][editingJamoChar]?.overrides ?? EMPTY_OVERRIDES
  })

  // --- 로컬 상태 ---
  const [selectedChars, setSelectedChars] = useState<Set<string>>(new Set())
  const setFocusedSyllable = useUIStore((s) => s.setFocusedSyllable)

  const isJamoEditing = !!(editingJamoType && editingJamoChar)
  // 레이아웃 오버라이드 scope 편집 모드
  const isLayoutOverrideEditing = !isJamoEditing && !!selectedLayoutType && !!editingLayoutOverrideId

  const storedJamoScopeChars = useMemo(() => {
    const stored = new Set<string>()
    if (!isJamoEditing || !editingOverrideId || !editingJamoType || !editingJamoChar) return stored
    const override = overrides.find((item) => item.id === editingOverrideId)
    if (!override) return stored
    ALL_SYLLABLES.forEach((meta) => {
      if (
        containsJamo(meta, editingJamoType, editingJamoChar) &&
        matchConditionGroups(override.conditionGroups ?? [], meta)
      ) stored.add(meta.char)
    })
    return stored
  }, [isJamoEditing, editingOverrideId, editingJamoType, editingJamoChar, overrides])

  const isJamoScopeDirty = editingOverrideId !== null && (
    selectedChars.size !== storedJamoScopeChars.size ||
    Array.from(selectedChars).some((char) => !storedJamoScopeChars.has(char))
  )

  // 레이아웃 오버라이드 편집 중: 선택된 셀에 미리보기 적용할 스키마 (partOverrides 직접 병합)
  const layoutOverridePreviewSchema = useMemo(() => {
    if (!isLayoutOverrideEditing || !selectedLayoutType || !editingLayoutOverrideId) return null
    const schema = getLayoutSchema(selectedLayoutType)
    const override = schema?.overrides?.find((o) => o.id === editingLayoutOverrideId)
    if (!override || Object.keys(override.partOverrides).length === 0) return null
    const style = cellSchemas[selectedLayoutType]?.style
    const padding = getEffectivePadding(selectedLayoutType)
    // 오버라이드 partOverrides를 기본에 병합, overrides 배열에서 제거하여 이중 적용 방지
    const previewSchema = {
      ...schema,
      padding,
      partOverrides: { ...(schema.partOverrides ?? {}), ...override.partOverrides },
      overrides: (schema.overrides ?? []).filter((o) => o.id !== editingLayoutOverrideId),
    }
    return { schema: previewSchema, style }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLayoutOverrideEditing, selectedLayoutType, editingLayoutOverrideId, layoutSchemas, cellSchemas])

  // 조건 OR(AND) 매칭 헬퍼
  function matchConditionGroups(
    conditionGroups: OverrideCondition[][],
    meta: SyllableMeta,
  ): boolean {
    return conditionGroups.some((group) =>
      group.every((cond) => {
        if (cond.type === 'layoutIs') return meta.layoutType === cond.layout
        if (cond.type === 'choseongIs') return meta.cho === cond.jamo
        if (cond.type === 'jungseongIs') return meta.jung === cond.jamo
        if (cond.type === 'jongseongIs') return meta.jong === cond.jamo
        return false
      })
    )
  }

  // scope pre-selection 통합 effect
  useEffect(() => {
    if (isJamoEditing && editingOverrideId && editingJamoType && editingJamoChar) {
      // 자모 오버라이드: 기존 conditionGroups에서 선택 복원
      const state = useJamoStore.getState()
      const jamoData = state[editingJamoType][editingJamoChar]
      const override = jamoData?.overrides?.find((o) => o.id === editingOverrideId)
      if (!override || (override.conditionGroups ?? []).length === 0) {
        setSelectedChars(new Set())
        return
      }
      const groups = override.conditionGroups
      const newSelected = new Set<string>()
      ALL_SYLLABLES.forEach((meta) => {
        if (
          containsJamo(meta, editingJamoType, editingJamoChar) &&
          matchConditionGroups(groups, meta)
        ) newSelected.add(meta.char)
      })
      setSelectedChars(newSelected)
    } else if (!isJamoEditing && selectedLayoutType && editingLayoutOverrideId) {
      // 레이아웃 오버라이드: conditionGroups에서 선택 복원
      const schema = useLayoutStore.getState().getLayoutSchema(selectedLayoutType)
      const override = schema?.overrides?.find((o) => o.id === editingLayoutOverrideId)
      if (!override || (override.conditionGroups ?? []).length === 0) {
        setSelectedChars(new Set())
        return
      }
      const groups = override.conditionGroups
      const newSelected = new Set<string>()
      ALL_SYLLABLES.forEach((meta) => {
        if (meta.layoutType === selectedLayoutType && matchConditionGroups(groups, meta)) newSelected.add(meta.char)
      })
      setSelectedChars(newSelected)
    } else {
      setSelectedChars(new Set())
    }
  }, [isJamoEditing, editingOverrideId, editingJamoType, editingJamoChar, editingLayoutOverrideId, selectedLayoutType])

  // --- 필터링 ---
  const visibleSyllables = useMemo<SyllableMeta[]>(() => {
    return ALL_SYLLABLES.filter((meta) => {
      if (!isJamoEditing) {
        // 기본 모드 + 레이아웃 오버라이드 모드: 레이아웃 + 자모 필터
        if (selectedLayoutType && meta.layoutType !== selectedLayoutType) return false
        if (editingJamoChar && editingJamoType) {
          if (editingJamoType === 'choseong' && meta.cho !== editingJamoChar) return false
          if (editingJamoType === 'jungseong' && meta.jung !== editingJamoChar) return false
          if (editingJamoType === 'jongseong' && meta.jong !== editingJamoChar) return false
        }
        return true
      }
      // 자모 편집 모드: 편집 중인 자모가 해당 포지션에 있는 것만
      if (activeLayoutType && meta.layoutType !== activeLayoutType) return false
      if (editingJamoType === 'choseong' && meta.cho !== editingJamoChar) return false
      if (editingJamoType === 'jungseong' && meta.jung !== editingJamoChar) return false
      if (editingJamoType === 'jongseong' && meta.jong !== editingJamoChar) return false
      return true
    })
  }, [isJamoEditing, selectedLayoutType, activeLayoutType, editingJamoChar, editingJamoType])

  const handleToggleCell = useCallback((char: string) => {
    setSelectedChars((previous) => {
      const next = new Set(previous)
      if (next.has(char)) next.delete(char)
      else next.add(char)
      return next
    })
  }, [])

  const handleToggleRange = useCallback((chars: string[]) => {
    setSelectedChars((previous) => {
      const next = new Set(previous)
      const shouldDeselect = chars.length > 0 && chars.every((char) => previous.has(char))
      chars.forEach((char) => {
        if (shouldDeselect) next.delete(char)
        else next.add(char)
      })
      return next
    })
  }, [])

  // --- 적용 ---
  const handleApply = useCallback(() => {
    if (!editingOverrideId || !editingJamoType || !editingJamoChar) return

    // 선택된 각 음절을 정확히 특정하는 AND 조건 그룹을 생성
    // 편집 중인 자모 포지션은 고정이므로, 나머지 조건으로 음절 식별
    const groupMap = new Map<string, OverrideCondition[]>()

    ALL_SYLLABLES.forEach((meta) => {
      if (!selectedChars.has(meta.char)) return

      let group: OverrideCondition[]
      let key: string

      if (editingJamoType === 'choseong') {
        // 초성 고정 → jung + jong 으로 식별
        group = [
          { type: 'layoutIs', layout: meta.layoutType },
          { type: 'jungseongIs', jamo: meta.jung },
          { type: 'jongseongIs', jamo: meta.jong },
        ]
        key = `${meta.layoutType}|${meta.jung}|${meta.jong}`
      } else if (editingJamoType === 'jungseong') {
        // 중성 고정 → cho + jong 으로 식별
        group = [
          { type: 'layoutIs', layout: meta.layoutType },
          { type: 'choseongIs', jamo: meta.cho },
          { type: 'jongseongIs', jamo: meta.jong },
        ]
        key = `${meta.layoutType}|${meta.cho}|${meta.jong}`
      } else {
        // 종성 고정 → cho + jung 으로 식별
        group = [
          { type: 'layoutIs', layout: meta.layoutType },
          { type: 'choseongIs', jamo: meta.cho },
          { type: 'jungseongIs', jamo: meta.jung },
        ]
        key = `${meta.layoutType}|${meta.cho}|${meta.jung}`
      }

      if (!groupMap.has(key)) groupMap.set(key, group)
    })

    const conditionGroups = Array.from(groupMap.values())
    updateOverride(editingJamoType, editingJamoChar, editingOverrideId, { conditionGroups })
  }, [editingOverrideId, editingJamoType, editingJamoChar, selectedChars, updateOverride])

  useEffect(() => {
    if (!isJamoEditing) {
      onJamoScopeStateChange?.(false, null)
      return
    }
    onJamoScopeStateChange?.(isJamoScopeDirty, (mode) => {
      if (mode === 'discard') {
        setSelectedChars(new Set(storedJamoScopeChars))
        return true
      }
      if (editingOverrideId && selectedChars.size === 0) return false
      if (editingOverrideId) handleApply()
      return true
    })
    return () => onJamoScopeStateChange?.(false, null)
  }, [isJamoEditing, editingOverrideId, selectedChars, storedJamoScopeChars, isJamoScopeDirty, handleApply, onJamoScopeStateChange])

  // --- 레이아웃 오버라이드 scope 적용 ---
  const handleLayoutOverrideApply = useCallback(() => {
    if (!selectedLayoutType || !editingLayoutOverrideId) return

    // 선택된 각 음절을 정확히 특정하는 AND 조건 그룹 생성 (layoutType은 저장 위치에서 이미 특정되므로 불필요)
    const groupMap = new Map<string, OverrideCondition[]>()
    ALL_SYLLABLES.forEach((meta) => {
      if (meta.layoutType !== selectedLayoutType || !selectedChars.has(meta.char)) return
      const group: OverrideCondition[] = [
        { type: 'choseongIs', jamo: meta.cho },
        { type: 'jungseongIs', jamo: meta.jung },
        ...(meta.jong !== '' ? [{ type: 'jongseongIs' as const, jamo: meta.jong }] : []),
      ]
      const key = `${meta.cho}|${meta.jung}|${meta.jong}`
      if (!groupMap.has(key)) groupMap.set(key, group)
    })

    const conditionGroups = Array.from(groupMap.values())
    updateLayoutOverride(selectedLayoutType, editingLayoutOverrideId, { conditionGroups })
  }, [selectedLayoutType, editingLayoutOverrideId, selectedChars, updateLayoutOverride])

  // --- 레이아웃 오버라이드 탭 관리 ---
  const handleAddLayoutOverride = useCallback(() => {
    if (!selectedLayoutType) return
    const schema = useLayoutStore.getState().getLayoutSchema(selectedLayoutType)
    const priority = (schema.overrides?.length ?? 0)
    const newOverride: LayoutOverride = {
      id: generateId(),
      conditionGroups: [],
      partOverrides: {},
      priority,
      enabled: true,
    }
    addLayoutOverride(selectedLayoutType, newOverride)
    setEditingLayoutOverrideId(newOverride.id)
  }, [selectedLayoutType, addLayoutOverride, setEditingLayoutOverrideId])

  const handleSelectLayoutOverride = useCallback((id: string | null) => {
    setEditingLayoutOverrideId(id)
  }, [setEditingLayoutOverrideId])

  const handleRemoveLayoutOverride = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!selectedLayoutType) return
    removeLayoutOverride(selectedLayoutType, id)
    if (editingLayoutOverrideId === id) setEditingLayoutOverrideId(null)
  }, [selectedLayoutType, editingLayoutOverrideId, removeLayoutOverride, setEditingLayoutOverrideId])

  // --- 오버라이드 관리 ---
  const handleAddOverride = useCallback(() => {
    if (!editingJamoType || !editingJamoChar) return
    const newOverride: JamoOverride = {
      id: generateId(),
      conditionGroups: [],
      variant: {} as JamoOverrideVariant,
      priority: overrides.length,
      enabled: true,
    }
    addOverride(editingJamoType, editingJamoChar, newOverride)
    setEditingOverrideId(newOverride.id)
    onOverrideSwitch?.(newOverride.id)
  }, [editingJamoType, editingJamoChar, overrides.length, addOverride, setEditingOverrideId, onOverrideSwitch])

  const handleSelectOverride = useCallback((id: string | null) => {
    setEditingOverrideId(id)
    onOverrideSwitch?.(id)
  }, [setEditingOverrideId, onOverrideSwitch])

  const handleRemoveOverride = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation()
    if (!editingJamoType || !editingJamoChar) return
    removeOverride(editingJamoType, editingJamoChar, id)
    if (editingOverrideId === id) {
      setEditingOverrideId(null)
      onOverrideSwitch?.(null)
    }
  }, [editingJamoType, editingJamoChar, editingOverrideId, removeOverride, setEditingOverrideId, onOverrideSwitch])

  const isFiltered = !isJamoEditing && (selectedLayoutType !== null || editingJamoChar !== null)

  return (
    <div className="flex-1 min-h-0 min-w-0 flex flex-col border-r border-border-subtle bg-[#080808]">

      <LayoutFilterChips
        activeLayoutType={activeLayoutType}
        onSelect={onSelectLayout}
        editingJamoType={isJamoEditing ? editingJamoType : null}
        editingJamoChar={isJamoEditing ? editingJamoChar : null}
      />

      {/* === 오버라이드 탭 (자모 편집 중에만) === */}
      {isJamoEditing && (
        <div className="shrink-0 px-2 pt-2 pb-1.5 border-b border-border-subtle flex items-center gap-1 flex-wrap">
          {/* 기본 탭 */}
          <button
            onClick={() => handleSelectOverride(null)}
            className={`h-6 px-2.5 rounded-full text-[11px] font-medium transition-all ${
              editingOverrideId === null
                ? 'bg-[rgba(78,205,196,0.15)] text-[#4ecdc4]'
                : 'text-text-dim-5 hover:text-text-dim-2 hover:bg-surface-2'
            }`}
          >
            기본
          </button>

          {/* 오버라이드 탭들 */}
          {overrides.map((ovr, idx) => (
            <div key={ovr.id} className="relative group flex items-center">
              <button
                onClick={() => handleSelectOverride(ovr.id)}
                className={`h-6 pl-2.5 pr-1.5 rounded-full text-[11px] font-medium transition-all flex items-center gap-1 ${
                  !ovr.enabled ? 'opacity-40' : ''
                } ${
                  editingOverrideId === ovr.id
                    ? 'bg-[rgba(251,146,60,0.15)] text-[#fb923c]'
                    : 'text-text-dim-5 hover:text-text-dim-2 hover:bg-surface-2'
                }`}
              >
                오버라이드 {idx + 1}
                <span
                  role="button"
                  onClick={(e) => handleRemoveOverride(ovr.id, e)}
                  className="opacity-0 group-hover:opacity-50 hover:!opacity-100 text-[#f87171] leading-none ml-0.5"
                  title="삭제"
                >
                  ×
                </span>
              </button>
            </div>
          ))}

          {/* + 버튼 */}
          <button
            onClick={handleAddOverride}
            className="w-6 h-6 flex items-center justify-center rounded-full border border-dashed border-border text-text-dim-5 text-[13px] hover:border-text-dim-3 hover:text-text-dim-2 transition-all shrink-0"
          >
            +
          </button>
        </div>
      )}

      {/* === 레이아웃 오버라이드 탭 (레이아웃 편집 중에만) === */}
      {!isJamoEditing && selectedLayoutType && (() => {
        const schema = useLayoutStore.getState().getLayoutSchema(selectedLayoutType)
        const layoutOverrides = schema?.overrides ?? []
        return (
          <div className="shrink-0 px-2 pt-2 pb-1.5 border-b border-border-subtle flex items-center gap-1 flex-wrap">
            <button
              onClick={() => handleSelectLayoutOverride(null)}
              className={`h-6 px-2.5 rounded-full text-[11px] font-medium transition-all ${
                editingLayoutOverrideId === null
                  ? 'bg-[rgba(78,205,196,0.15)] text-[#4ecdc4]'
                  : 'text-text-dim-5 hover:text-text-dim-2 hover:bg-surface-2'
              }`}
            >
              기본
            </button>
            {layoutOverrides.map((ovr, idx) => (
              <div key={ovr.id} className="relative group flex items-center">
                <button
                  onClick={() => handleSelectLayoutOverride(ovr.id)}
                  className={`h-6 pl-2.5 pr-1.5 rounded-full text-[11px] font-medium transition-all flex items-center gap-1 ${
                    !ovr.enabled ? 'opacity-40' : ''
                  } ${
                    editingLayoutOverrideId === ovr.id
                      ? 'bg-[rgba(251,146,60,0.15)] text-[#fb923c]'
                      : 'text-text-dim-5 hover:text-text-dim-2 hover:bg-surface-2'
                  }`}
                >
                  오버라이드 {idx + 1}
                  <span
                    role="button"
                    onClick={(e) => handleRemoveLayoutOverride(ovr.id, e)}
                    className="opacity-0 group-hover:opacity-50 hover:!opacity-100 text-[#f87171] leading-none ml-0.5"
                    title="삭제"
                  >
                    ×
                  </span>
                </button>
              </div>
            ))}
            <button
              onClick={handleAddLayoutOverride}
              className="w-6 h-6 flex items-center justify-center rounded-full border border-dashed border-border text-text-dim-5 text-[13px] hover:border-text-dim-3 hover:text-text-dim-2 transition-all shrink-0"
            >
              +
            </button>
          </div>
        )
      })()}

      {/* === 헤더 === */}
      <div className="shrink-0 px-3 py-1.5 border-b border-border-subtle flex items-center justify-between">
        <span className="text-[11px] text-text-dim-3 font-medium">음절</span>
        <span className="text-[10px] text-text-dim-5 tabular-nums">
          {isFiltered
            ? <><span className="text-foreground">{visibleSyllables.length.toLocaleString()}</span> / {ALL_SYLLABLES.length.toLocaleString()}</>
            : visibleSyllables.length.toLocaleString()
          }
        </span>
      </div>

      <SemanticGlyphGrid
        syllables={visibleSyllables}
        editingJamoType={isJamoEditing ? editingJamoType : null}
        selectedLayoutType={selectedLayoutType}
        selectedChars={selectedChars}
        selectable={isJamoEditing || isLayoutOverrideEditing}
        onToggleCell={handleToggleCell}
        onToggleRange={handleToggleRange}
        onSetSelection={setSelectedChars}
        onNavigate={(meta) => setFocusedSyllable(meta.char)}
        renderCell={(meta, isSelected) => {
          const syllable = decomposeSyllableWithOverrides(meta.char, choseong, jungseong, jongseong)
          const cellSchema = cellSchemas[meta.layoutType]
          const usePreview = isLayoutOverrideEditing && isSelected && !!layoutOverridePreviewSchema
          const renderSchema = usePreview ? layoutOverridePreviewSchema! : cellSchema
          return (
            <>
              {renderSchema ? (
                <SvgRenderer
                  syllable={syllable}
                  schema={renderSchema.schema}
                  size={CELL_PX}
                  fillColor="#1a1a1a"
                  backgroundColor="#ffffff"
                  globalStyle={renderSchema.style}
                />
              ) : (
                <span className="flex items-center justify-center w-full h-full text-[11px] text-neutral-800 bg-white">
                  {meta.char}
                </span>
              )}
              {(isJamoEditing || isLayoutOverrideEditing) && (
                <div className={`absolute inset-0 pointer-events-none transition-colors ${
                  isSelected
                    ? (isLayoutOverrideEditing ? 'bg-[#f59e0b]/50' : 'bg-[#84cc16]/55')
                    : 'bg-transparent hover:bg-black/8'
                }`} />
              )}
            </>
          )
        }}
      />

      {/* === 적용 범위 상태 (저장은 상단 공통 저장 버튼에서 수행) === */}
      {isJamoEditing && editingOverrideId !== null && (
        <div className="shrink-0 px-3 py-2 border-t border-border-subtle flex items-center justify-between bg-[#0c0c0c]">
          <button onClick={() => setSelectedChars(new Set())} className="text-[11px] text-text-dim-3 hover:text-foreground">
            선택 해제
          </button>
          <span className="text-[11px] text-text-dim-5 ml-auto mr-3">
            {selectedChars.size > 0
              ? <><span className="text-foreground font-medium">{selectedChars.size.toLocaleString()}</span>개 선택됨</>
              : '글자를 드래그하여 적용 범위 선택'
            }
          </span>
          <span className="text-[11px] text-text-dim-4">상단 저장으로 확정</span>
        </div>
      )}

      {/* === 적용 바 (레이아웃 오버라이드 scope 편집 중) === */}
      {isLayoutOverrideEditing && (
        <div className="shrink-0 px-3 py-2 border-t border-border-subtle flex items-center justify-between bg-[#0c0c0c]">
          <button onClick={() => setSelectedChars(new Set())} className="text-[11px] text-text-dim-3 hover:text-foreground">
            선택 해제
          </button>
          <span className="text-[11px] text-text-dim-5 ml-auto mr-3">
            {selectedChars.size > 0
              ? <><span className="text-foreground font-medium">{selectedChars.size.toLocaleString()}</span>개 선택됨</>
              : '글자를 드래그하여 적용 범위 선택'
            }
          </span>
          <button
            onClick={handleLayoutOverrideApply}
            disabled={selectedChars.size === 0}
            className="h-7 px-3 rounded text-[11px] font-medium bg-accent-blue text-white disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            적용
          </button>
        </div>
      )}

    </div>
  )
}
