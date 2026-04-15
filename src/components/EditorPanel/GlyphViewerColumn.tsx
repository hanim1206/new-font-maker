/**
 * GlyphViewerColumn — 완성형 음절 뷰어 + 오버라이드 scope 편집
 *
 * 두 가지 모드:
 * 1. 기본 모드 (자모 편집 전): 레이아웃/자모 필터로 음절 표시
 * 2. 자모 편집 모드: 오버라이드 탭 + 그룹핑 버튼 + 드래그 선택 + 적용 버튼
 */
import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useJamoStore } from '../../stores/jamoStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import { SvgRenderer } from '../../renderers/SvgRenderer'
import { classifyJungseong, LAYOUT_LABELS, decomposeSyllableWithOverrides } from '../../utils/hangulUtils'
import { CHOSEONG_LIST, JUNGSEONG_LIST, JONGSEONG_LIST } from '../../data/Hangul'
import type { LayoutType, JamoOverride, JamoOverrideVariant, OverrideCondition } from '../../types'

// ===== 모듈 로드 시 1회 계산 =====

interface SyllableMeta {
  char: string
  layoutType: LayoutType
  cho: string
  jung: string
  jong: string
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
const CELL_PX = 40
const CELL_GAP = 4
const GRID_PAD = 6
// 2행 기본 노출 높이: paddingTop + row1 + gap + row2 + paddingBottom
const TWO_ROW_HEIGHT = GRID_PAD + CELL_PX + CELL_GAP + CELL_PX + GRID_PAD

type JongFilter = 'all' | 'none' | 'has'
type JungFilter = 'all' | 'vertical' | 'horizontal' | 'mixed'

// ===== Props =====

interface GlyphViewerColumnProps {
  onOverrideSwitch?: (id: string | null) => void
}

// ===== 컴포넌트 =====

export function GlyphViewerColumn({ onOverrideSwitch }: GlyphViewerColumnProps) {
  // --- 스토어 ---
  const selectedLayoutType = useUIStore((s) => s.selectedLayoutType)
  const editingJamoChar = useUIStore((s) => s.editingJamoChar)
  const editingJamoType = useUIStore((s) => s.editingJamoType)
  const editingOverrideId = useUIStore((s) => s.editingOverrideId)
  const setEditingOverrideId = useUIStore((s) => s.setEditingOverrideId)
  const { addOverride, updateOverride, removeOverride } = useJamoStore()
  const { choseong, jungseong, jongseong } = useJamoStore()
  const { getLayoutSchema, getEffectivePadding, layoutSchemas } = useLayoutStore()
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
  const [jongFilter, setJongFilter] = useState<JongFilter>('all')
  const [jungFilter, setJungFilter] = useState<JungFilter>('all')
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set())
  const isDragging = useRef(false)
  const isDragAdding = useRef(true)

  const toggleSection = useCallback((key: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const isJamoEditing = !!(editingJamoType && editingJamoChar)

  // 오버라이드 탭 전환 시 scope pre-selection 동기화
  useEffect(() => {
    if (!editingOverrideId || !editingJamoType || !editingJamoChar) {
      setSelectedChars(new Set())
      return
    }
    const state = useJamoStore.getState()
    const jamoData = state[editingJamoType][editingJamoChar]
    const override = jamoData?.overrides?.find((o) => o.id === editingOverrideId)
    if (!override) { setSelectedChars(new Set()); return }

    // conditionGroups에서 layoutIs 조건 추출
    const layoutTypes = new Set<LayoutType>()
    for (const group of override.conditionGroups ?? []) {
      for (const cond of group) {
        if (cond.type === 'layoutIs') layoutTypes.add(cond.layout)
      }
    }

    const newSelected = new Set<string>()
    ALL_SYLLABLES.forEach((meta) => {
      if (layoutTypes.has(meta.layoutType)) newSelected.add(meta.char)
    })
    setSelectedChars(newSelected)
  }, [editingOverrideId, editingJamoType, editingJamoChar])

  // 자모 편집 종료 시 초기화
  useEffect(() => {
    if (!isJamoEditing) {
      setSelectedChars(new Set())
      setJongFilter('all')
      setJungFilter('all')
    }
  }, [isJamoEditing])

  // --- 필터링 ---
  const visibleSyllables = useMemo<SyllableMeta[]>(() => {
    return ALL_SYLLABLES.filter((meta) => {
      if (!isJamoEditing) {
        // 기본 모드: 레이아웃 + 자모 필터
        if (selectedLayoutType && meta.layoutType !== selectedLayoutType) return false
        if (editingJamoChar && editingJamoType) {
          if (editingJamoType === 'choseong' && meta.cho !== editingJamoChar) return false
          if (editingJamoType === 'jungseong' && meta.jung !== editingJamoChar) return false
          if (editingJamoType === 'jongseong' && meta.jong !== editingJamoChar) return false
        }
        return true
      }
      // 자모 편집 모드: 편집 중인 자모가 해당 포지션에 있는 것만
      if (editingJamoType === 'choseong' && meta.cho !== editingJamoChar) return false
      if (editingJamoType === 'jungseong' && meta.jung !== editingJamoChar) return false
      if (editingJamoType === 'jongseong' && meta.jong !== editingJamoChar) return false
      // 그룹핑 필터 (추가 좁히기)
      if (jongFilter === 'none' && meta.jong !== '') return false
      if (jongFilter === 'has' && meta.jong === '') return false
      const jungType = classifyJungseong(meta.jung)
      if (jungFilter !== 'all' && jungType !== jungFilter) return false
      return true
    })
  }, [isJamoEditing, selectedLayoutType, editingJamoChar, editingJamoType, jongFilter, jungFilter])

  // --- 드래그 선택 ---
  const handleCellMouseDown = useCallback((char: string, e: React.MouseEvent) => {
    e.preventDefault()
    isDragging.current = true
    isDragAdding.current = !selectedChars.has(char)
    setSelectedChars((prev) => {
      const next = new Set(prev)
      if (isDragAdding.current) next.add(char)
      else next.delete(char)
      return next
    })
  }, [selectedChars])

  const handleCellMouseEnter = useCallback((char: string) => {
    if (!isDragging.current) return
    setSelectedChars((prev) => {
      const next = new Set(prev)
      if (isDragAdding.current) next.add(char)
      else next.delete(char)
      return next
    })
  }, [])

  useEffect(() => {
    const stop = () => { isDragging.current = false }
    document.addEventListener('mouseup', stop)
    return () => document.removeEventListener('mouseup', stop)
  }, [])

  // --- 적용 ---
  const handleApply = useCallback(() => {
    if (!editingOverrideId || !editingJamoType || !editingJamoChar) return
    const layoutTypes = new Set<LayoutType>()
    ALL_SYLLABLES.forEach((meta) => {
      if (selectedChars.has(meta.char)) layoutTypes.add(meta.layoutType)
    })
    const conditionGroups: OverrideCondition[][] = Array.from(layoutTypes).map((lt) => [
      { type: 'layoutIs' as const, layout: lt },
    ])
    updateOverride(editingJamoType, editingJamoChar, editingOverrideId, { conditionGroups })
  }, [editingOverrideId, editingJamoType, editingJamoChar, selectedChars, updateOverride])

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

  // 섹션 그룹핑: 레이아웃 선택 시 → 초성별, 그 외 → 레이아웃별
  const groupedSyllables = useMemo(() => {
    if (!isJamoEditing && selectedLayoutType) {
      // 초성별 그룹핑
      const map = new Map<string, SyllableMeta[]>()
      for (const meta of visibleSyllables) {
        const arr = map.get(meta.cho)
        if (arr) arr.push(meta)
        else map.set(meta.cho, [meta])
      }
      return Array.from(map.entries()).map(([key, syllables]) => ({ key, syllables }))
    }
    // 레이아웃별 그룹핑
    const map = new Map<string, SyllableMeta[]>()
    for (const meta of visibleSyllables) {
      const arr = map.get(meta.layoutType)
      if (arr) arr.push(meta)
      else map.set(meta.layoutType, [meta])
    }
    return Array.from(map.entries()).map(([key, syllables]) => ({ key, syllables }))
  }, [isJamoEditing, selectedLayoutType, visibleSyllables])

  const isFiltered = !isJamoEditing && (selectedLayoutType !== null || editingJamoChar !== null)

  return (
    <div
      className="flex-1 min-h-0 min-w-0 flex flex-col border-r border-border-subtle bg-[#080808]"
      onMouseLeave={() => { isDragging.current = false }}
    >

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

      {/* === 그룹핑 버튼 (자모 편집 중에만) === */}
      {isJamoEditing && (
        <div className="shrink-0 px-2 py-1.5 border-b border-border-subtle flex flex-col gap-1">
          <div className="flex gap-1">
            {([['all', '전체'], ['none', '받침없음'], ['has', '받침있음']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setJongFilter(val)}
                className={`h-5 px-2 rounded text-[10px] transition-all ${
                  jongFilter === val
                    ? 'bg-accent-blue/20 text-accent-blue font-medium'
                    : 'text-text-dim-5 bg-surface-2 hover:text-text-dim-2'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <div className="flex gap-1">
            {([['all', '전체'], ['vertical', '세로'], ['horizontal', '가로'], ['mixed', '복합']] as const).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setJungFilter(val)}
                className={`h-5 px-2 rounded text-[10px] transition-all ${
                  jungFilter === val
                    ? 'bg-accent-blue/20 text-accent-blue font-medium'
                    : 'text-text-dim-5 bg-surface-2 hover:text-text-dim-2'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      )}

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

      {/* === 글리프 그리드 (레이아웃별 섹션) === */}
      <div className="flex-1 min-h-0 overflow-y-auto select-none">
        {groupedSyllables.map(({ key, syllables }) => {
          const isExpanded = expandedSections.has(key)
          const hasMore = syllables.length > 6
          return (
            <div key={key}>
              {/* 섹션 헤더 */}
              <div className="px-3 py-1 flex items-center gap-2 sticky top-0 bg-[#0d0d0d] z-10">
                <span className="text-[10px] text-text-dim-5 font-medium uppercase tracking-wide">
                  {(!isJamoEditing && selectedLayoutType) ? key : LAYOUT_LABELS[key as LayoutType] ?? key}
                </span>
                <span className="text-[10px] text-text-dim-5 tabular-nums">
                  {syllables.length}
                </span>
              </div>
              {/* 섹션 그리드 (2행 클리핑) */}
              <div style={{ overflow: 'hidden', maxHeight: isExpanded ? undefined : TWO_ROW_HEIGHT }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: `repeat(auto-fill, ${CELL_PX}px)`,
                    gap: CELL_GAP,
                    padding: GRID_PAD,
                  }}
                >
                  {syllables.map((meta) => {
                    const isSelected = isJamoEditing && selectedChars.has(meta.char)
                    const syllable = decomposeSyllableWithOverrides(meta.char, choseong, jungseong, jongseong)
                    const cellSchema = cellSchemas[meta.layoutType]

                    return (
                      <div
                        key={meta.char}
                        title={meta.char}
                        style={{ width: CELL_PX, height: CELL_PX }}
                        className={`rounded-[2px] overflow-hidden transition-all ${
                          isJamoEditing ? 'cursor-pointer' : ''
                        } ${
                          isSelected
                            ? 'ring-2 ring-accent-blue'
                            : isJamoEditing
                              ? 'ring-1 ring-transparent hover:ring-border-light'
                              : ''
                        }`}
                        onMouseDown={isJamoEditing ? (e) => handleCellMouseDown(meta.char, e) : undefined}
                        onMouseEnter={isJamoEditing ? () => handleCellMouseEnter(meta.char) : undefined}
                      >
                        {cellSchema ? (
                          <SvgRenderer
                            syllable={syllable}
                            schema={cellSchema.schema}
                            size={CELL_PX}
                            fillColor="#1a1a1a"
                            backgroundColor="#ffffff"
                            globalStyle={cellSchema.style}
                          />
                        ) : (
                          <span className="flex items-center justify-center w-full h-full text-[11px] text-foreground bg-surface-2">
                            {meta.char}
                          </span>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
              {/* 더보기 토글 */}
              {hasMore && (
                <button
                  onClick={() => toggleSection(key)}
                  className="w-full py-1 text-[10px] text-text-dim-5 hover:text-text-dim-2 hover:bg-surface-2 transition-colors border-t border-border-subtle"
                >
                  {isExpanded ? '접기' : `더보기 (${syllables.length}개)`}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* === 적용 바 (오버라이드 편집 중에만) === */}
      {isJamoEditing && editingOverrideId !== null && (
        <div className="shrink-0 px-3 py-2 border-t border-border-subtle flex items-center justify-between bg-[#0c0c0c]">
          <span className="text-[11px] text-text-dim-5">
            {selectedChars.size > 0
              ? <><span className="text-foreground font-medium">{selectedChars.size.toLocaleString()}</span>개 선택됨</>
              : '글자를 드래그하여 적용 범위 선택'
            }
          </span>
          <button
            onClick={handleApply}
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
