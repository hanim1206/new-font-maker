import { useState, useEffect, useMemo, useCallback, useRef } from 'react'
import { useUIStore } from '../../stores/uiStore'
import { useLayoutStore } from '../../stores/layoutStore'
import { useJamoStore } from '../../stores/jamoStore'
import { useGlobalStyleStore } from '../../stores/globalStyleStore'
import { useHistoryStore } from '../../stores/historyStore'
import { LayoutEditorDesktop } from './LayoutEditorDesktop'
import { LayoutEditorMobile } from './LayoutEditorMobile'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import type { PartStyle } from '../../renderers/SvgRenderer'
import { decomposeSyllableWithOverrides, getSampleSyllableForLayout } from '../../utils/hangulUtils'
import { calculateBoxes, calculateRawBoxes } from '../../utils/layoutCalculator'
import { mergeStrokes, splitStroke, addHandlesToPoint, removeHandlesFromPoint } from '../../utils/strokeEditUtils'
import { COMPOUND_JONGSEONG } from '../../utils/jamoLinkUtils'
import {
  APP_ROUTE_POP_EVENT,
  applyAppRoute,
  appRouteToPath,
  getCurrentRouteHistoryState,
  pushAppRoute,
  replaceAppRoute,
  type AppRoute,
  type AppRouteHistoryState,
  type AppRoutePopDetail,
} from '../../utils/appRoutes'
import type { LayoutType, Part, DecomposedSyllable, BoxConfig, JamoData, Padding, PartOverride, StrokeDataV2, LayoutSchema } from '../../types'

interface LayoutEditorProps {
  layoutType: LayoutType
}

type PendingJamoNavigation =
  | { type: 'layout'; layoutType: LayoutType }
  | { type: 'exit' }
  | {
      type: 'history'
      route: AppRoute
      state: AppRouteHistoryState
      delta: number
    }

// 파트 → 자모 정보 매핑
function partToJamoInfo(part: Part, syllable: DecomposedSyllable): { type: 'choseong' | 'jungseong' | 'jongseong'; char: string } | null {
  if (part === 'CH' && syllable.choseong) return { type: 'choseong', char: syllable.choseong.char }
  if ((part === 'JU' || part === 'JU_H' || part === 'JU_V') && syllable.jungseong) return { type: 'jungseong', char: syllable.jungseong.char }
  if (part === 'JO' && syllable.jongseong) return { type: 'jongseong', char: syllable.jongseong.char }
  return null
}

// 스토어에서 편집 중인 자모의 flat strokes 조회
function getEditingStrokes(
  type: 'choseong' | 'jungseong' | 'jongseong',
  char: string,
  overrideId: string | null,
  ch: Record<string, JamoData>,
  ju: Record<string, JamoData>,
  jo: Record<string, JamoData>
): StrokeDataV2[] {
  const jamoMap = type === 'choseong' ? ch : type === 'jungseong' ? ju : jo
  const jamo = jamoMap[char]
  if (!jamo) return []

  if (overrideId) {
    const override = jamo.overrides?.find(o => o.id === overrideId)
    if (override) {
      const v = override.variant
      if (v.horizontalStrokes && v.verticalStrokes) return [...v.horizontalStrokes, ...v.verticalStrokes]
      if (v.strokes) return [...v.strokes]
    }
  }

  if (jamo.horizontalStrokes && jamo.verticalStrokes) return [...jamo.horizontalStrokes, ...jamo.verticalStrokes]
  if (jamo.verticalStrokes) return [...jamo.verticalStrokes]
  if (jamo.horizontalStrokes) return [...jamo.horizontalStrokes]
  if (jamo.strokes) return [...jamo.strokes]
  return []
}

// flat strokes를 스토어에 커밋 (base 또는 override variant)
function commitStrokesToStore(
  info: { type: 'choseong' | 'jungseong' | 'jongseong'; char: string },
  strokes: StrokeDataV2[],
  overrideId: string | null
) {
  const store = useJamoStore.getState()
  const jamo = store[info.type][info.char]
  if (!jamo) return

  const isMixed = info.type === 'jungseong' && !!jamo.horizontalStrokes && !!jamo.verticalStrokes

  if (overrideId) {
    const existingOverride = jamo.overrides?.find(o => o.id === overrideId)
    if (!existingOverride) return
    const variant = { ...existingOverride.variant }
    if (isMixed) {
      const hIds = new Set(jamo.horizontalStrokes!.map(s => s.id))
      variant.horizontalStrokes = strokes.filter(s => hIds.has(s.id))
      variant.verticalStrokes = strokes.filter(s => !hIds.has(s.id))
    } else {
      variant.strokes = strokes
    }
    store.updateOverride(info.type, info.char, overrideId, { variant })
  } else {
    let updated: JamoData
    if (isMixed) {
      const hIds = new Set(jamo.horizontalStrokes!.map(s => s.id))
      updated = {
        ...jamo,
        horizontalStrokes: strokes.filter(s => hIds.has(s.id)),
        verticalStrokes: strokes.filter(s => !hIds.has(s.id)),
      }
    } else {
      updated = { ...jamo, strokes }
    }
    switch (info.type) {
      case 'choseong': store.updateChoseong(info.char, updated); break
      case 'jungseong': store.updateJungseong(info.char, updated); break
      case 'jongseong': store.updateJongseong(info.char, updated); break
    }
  }
}

export function LayoutEditor({ layoutType }: LayoutEditorProps) {
  const {
    inputText,
    selectedCharIndex,
    focusedSyllable,
    setFocusedSyllable,
    selectedPartInLayout,
    setSelectedPartInLayout,
    editingPartInLayout,
    setEditingPartInLayout,
    editingJamoType,
    editingJamoChar,
    setEditingJamo,
    selectedStrokeId,
    setSelectedStrokeId,
    editingOverrideId,
    setSelectedLayoutType,
    isMobile,
  } = useUIStore()
  const {
    getLayoutSchema,
    getEffectivePadding,
    hasPaddingOverride,
    setPaddingOverride,
    removePaddingOverride,
    updateSplit,
    updatePartOverride,
    updateLayoutOverride,
    resetLayoutSchema,
    resetAllPartOverrides,
    restoreLayoutSnapshot,
    _hydrated,
  } = useLayoutStore()
  const paddingOverrides = useLayoutStore(s => s.paddingOverrides)
  const editingLayoutOverrideId = useUIStore(s => s.editingLayoutOverrideId)
  const {
    choseong,
    jungseong,
    jongseong,
    updateJamoPadding,
    updateMixedJamoPadding,
    resetJamoChar,
  } = useJamoStore()
  const { getEffectiveStyle, style: globalStyleRaw } = useGlobalStyleStore()
  const { pushSnapshot, undo: globalUndo, redo: globalRedo } = useHistoryStore()
  const canUndo = useHistoryStore(s => s.undoStack.length > 0)
  const canRedo = useHistoryStore(s => s.redoStack.length > 0)

  // 자모 편집 시 미리보기 레이아웃 전환
  const [previewLayoutType, setPreviewLayoutType] = useState<LayoutType | null>(null)

  // 의미 그리드에서 더블클릭한 음절의 레이아웃으로 자모 미리보기 컨텍스트 이동
  useEffect(() => {
    if (!focusedSyllable || !editingPartInLayout) return
    const focused = decomposeSyllableWithOverrides(focusedSyllable, choseong, jungseong, jongseong)
    setPreviewLayoutType(focused.layoutType)
  }, [focusedSyllable, editingPartInLayout, choseong, jungseong, jongseong])

  // 레이아웃 편집 더티 상태 추적
  const [isLayoutDirty, setIsLayoutDirty] = useState(false)
  const [isJamoDirty, setIsJamoDirty] = useState(false)
  const [isJamoScopeDirty, setIsJamoScopeDirty] = useState(false)
  const [savedJamoData, setSavedJamoData] = useState<JamoData | null>(null)
  const layoutSnapshotRef = useRef<LayoutSchema | null>(null)
  const jamoSnapshotRef = useRef<{ type: 'choseong' | 'jungseong' | 'jongseong'; char: string; data: JamoData } | null>(null)
  const paddingOverrideSnapshotRef = useRef<Partial<Padding> | null>(null)
  const [showSaveDialog, setShowSaveDialog] = useState(false)
  const [pendingJamoPart, setPendingJamoPart] = useState<Part | null>(null)
  const [showJamoSaveDialog, setShowJamoSaveDialog] = useState(false)
  const [pendingJamoNavigation, setPendingJamoNavigation] = useState<PendingJamoNavigation | null>(null)
  const jamoScopeActionRef = useRef<((mode: 'save' | 'discard') => boolean) | null>(null)
  const acceptedHistoryStateRef = useRef<AppRouteHistoryState | null>(getCurrentRouteHistoryState())
  const restoringHistoryRef = useRef(false)
  const confirmedHistoryNavigationRef = useRef(false)

  // layoutType 변경 시 스냅샷 초기화 + 더티 클리어
  useEffect(() => {
    layoutSnapshotRef.current = JSON.parse(JSON.stringify(getLayoutSchema(layoutType)))
    paddingOverrideSnapshotRef.current = paddingOverrides[layoutType]
      ? JSON.parse(JSON.stringify(paddingOverrides[layoutType]))
      : null
    setIsLayoutDirty(false)
  }, [layoutType]) // eslint-disable-line react-hooks/exhaustive-deps

  // layoutType prop 변경 또는 자모 편집 종료 시 previewLayoutType 초기화
  useEffect(() => {
    setPreviewLayoutType(null)
  }, [layoutType])

  useEffect(() => {
    if (!editingPartInLayout) {
      setPreviewLayoutType(null)
    }
  }, [editingPartInLayout])

  // 자모 편집 중이면 previewLayoutType 우선, 아니면 props layoutType
  const activeLayoutType = (editingPartInLayout && previewLayoutType) || layoutType

  // 스토어에서 직접 읽기 (draft 없음)
  const schema = getLayoutSchema(activeLayoutType)
  const effectivePadding = getEffectivePadding(activeLayoutType)
  const effectiveStyle = getEffectiveStyle(activeLayoutType)

  // 스키마+패딩 (캔버스 렌더링용) — 스토어에서 직접
  const schemaWithPadding = useMemo(
    () => ({ ...schema, padding: effectivePadding }),
    [schema, effectivePadding]
  )

  // 레이아웃 오버라이드 편집 중이면 해당 오버라이드의 partOverrides를 병합하여 캔버스에 표시
  const displaySchema = useMemo(() => {
    if (!editingLayoutOverrideId) return schemaWithPadding
    const override = schema.overrides?.find((o) => o.id === editingLayoutOverrideId)
    if (!override) return schemaWithPadding
    return {
      ...schemaWithPadding,
      partOverrides: { ...schema.partOverrides, ...override.partOverrides },
    }
  }, [editingLayoutOverrideId, schemaWithPadding, schema])

  const rawBoxes = useMemo(() => calculateRawBoxes(schemaWithPadding), [schemaWithPadding])

  // 테스트용 음절
  const testSyllable = useMemo(() => {
    const containsEditingJamo = (syllable: DecomposedSyllable) => {
      if (!editingJamoType || !editingJamoChar) return true
      if (editingJamoType === 'choseong') return syllable.choseong?.char === editingJamoChar
      if (editingJamoType === 'jungseong') return syllable.jungseong?.char === editingJamoChar
      return syllable.jongseong?.char === editingJamoChar
    }

    let contextSyllable: DecomposedSyllable | null = null
    if (focusedSyllable) {
      const focused = decomposeSyllableWithOverrides(focusedSyllable, choseong, jungseong, jongseong)
      if (focused.layoutType === activeLayoutType && containsEditingJamo(focused)) return focused
      contextSyllable = focused
    }

    if (inputText && selectedCharIndex >= 0) {
      const hangulChars = inputText.split('').filter((char) => {
        const code = char.charCodeAt(0)
        return (code >= 0xac00 && code <= 0xd7a3) ||
          (code >= 0x3131 && code <= 0x314e) ||
          (code >= 0x314f && code <= 0x3163)
      })
      const selectedChar = hangulChars[selectedCharIndex]
      if (selectedChar) {
        const syllable = decomposeSyllableWithOverrides(selectedChar, choseong, jungseong, jongseong)
        if (syllable.layoutType === activeLayoutType && containsEditingJamo(syllable)) {
          return syllable
        }
        contextSyllable ??= syllable
      }
    }

    const firstChar = inputText.trim()[0]
    if (firstChar) {
      const syllable = decomposeSyllableWithOverrides(firstChar, choseong, jungseong, jongseong)
      if (syllable.layoutType === activeLayoutType && containsEditingJamo(syllable)) {
        return syllable
      }
      contextSyllable ??= syllable
    }

    // 자모 편집 중이면 편집 중인 자모가 포함된 샘플, 아니면 기본 샘플
    const fallbackChar = getSampleSyllableForLayout(
      activeLayoutType,
      editingJamoType ?? undefined,
      editingJamoChar ?? undefined,
      contextSyllable ? {
        choseong: contextSyllable.choseong?.char,
        jungseong: contextSyllable.jungseong?.char,
        jongseong: contextSyllable.jongseong?.char,
      } : undefined,
    )
    return decomposeSyllableWithOverrides(fallbackChar, choseong, jungseong, jongseong)
  }, [focusedSyllable, inputText, selectedCharIndex, activeLayoutType, editingJamoType, editingJamoChar, choseong, jungseong, jongseong])

  // 계산된 박스 (파트 오버레이용) — 현재 음절의 레이아웃 기본 영역까지 반영
  const computedBoxes = useMemo(
    () => calculateBoxes(displaySchema, {
      cho: testSyllable.choseong?.char ?? '',
      jung: testSyllable.jungseong?.char ?? '',
      jong: testSyllable.jongseong?.char ?? '',
    }),
    [displaySchema, testSyllable]
  )

  // === 자모 편집 서브모드 ===
  const isJamoEditing = editingPartInLayout !== null

  // 편집 중인 파트의 자모 정보
  const editingJamoInfo = useMemo(() => {
    if (!editingPartInLayout) return null
    return partToJamoInfo(editingPartInLayout, testSyllable)
  }, [editingPartInLayout, testSyllable])

  const editorRoute = useMemo<AppRoute>(() => {
    if (isJamoEditing && editingJamoType && editingJamoChar) {
      return {
        page: 'editor',
        layoutType: activeLayoutType,
        jamo: { type: editingJamoType, char: editingJamoChar },
      }
    }
    return { page: 'editor', layoutType }
  }, [isJamoEditing, editingJamoType, editingJamoChar, activeLayoutType, layoutType])

  // UI에서 편집 뎁스가 바뀌면 URL을 동기화한다. 자모 안의 레이아웃 전환은
  // 히스토리를 쌓지 않고 현재 자모 URL만 교체한다.
  useEffect(() => {
    const nextPath = appRouteToPath(editorRoute)
    if (window.location.pathname === nextPath) {
      acceptedHistoryStateRef.current = getCurrentRouteHistoryState()
      return
    }

    const current = getCurrentRouteHistoryState()
    if (
      editorRoute.page === 'editor' && editorRoute.jamo &&
      current?.route.page === 'editor' && current.route.jamo &&
      current.route.jamo.type === editorRoute.jamo.type &&
      current.route.jamo.char === editorRoute.jamo.char
    ) {
      acceptedHistoryStateRef.current = replaceAppRoute(editorRoute, {
        parentPath: current.parentPath,
      })
      return
    }

    const parentPath = editorRoute.page === 'editor' && editorRoute.jamo
      ? current?.route.page === 'editor' && !current.route.jamo
        ? appRouteToPath(current.route)
        : current?.parentPath ?? appRouteToPath({ page: 'editor', layoutType })
      : undefined
    acceptedHistoryStateRef.current = pushAppRoute(editorRoute, { parentPath })
  }, [editorRoute, layoutType])

  // Ref로 최신 편집 컨텍스트 참조 (드래그 핸들러에서 클로저 문제 방지)
  const editingJamoInfoRef = useRef(editingJamoInfo)
  editingJamoInfoRef.current = editingJamoInfo
  const editingOverrideIdRef = useRef(editingOverrideId)
  editingOverrideIdRef.current = editingOverrideId

  useEffect(() => {
    if (!editingJamoInfo) {
      jamoSnapshotRef.current = null
      jamoScopeActionRef.current = null
      setSavedJamoData(null)
      setIsJamoDirty(false)
      setIsJamoScopeDirty(false)
      return
    }
    const current = useJamoStore.getState()[editingJamoInfo.type][editingJamoInfo.char]
    if (!current) return
    jamoSnapshotRef.current = {
      type: editingJamoInfo.type,
      char: editingJamoInfo.char,
      data: JSON.parse(JSON.stringify(current)),
    }
    setSavedJamoData(JSON.parse(JSON.stringify(current)))
    setIsJamoDirty(false)
  }, [editingJamoInfo?.type, editingJamoInfo?.char]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const snapshot = jamoSnapshotRef.current
    if (!snapshot || !editingJamoInfo) return
    const current = useJamoStore.getState()[snapshot.type][snapshot.char]
    setIsJamoDirty(JSON.stringify(current) !== JSON.stringify(snapshot.data))
  }, [editingJamoInfo, choseong, jungseong, jongseong])

  const handleJamoScopeStateChange = useCallback((dirty: boolean, action: ((mode: 'save' | 'discard') => boolean) | null) => {
    jamoScopeActionRef.current = action
    setIsJamoScopeDirty(dirty)
  }, [])

  const handleJamoSave = useCallback((): boolean => {
    if (jamoScopeActionRef.current && !jamoScopeActionRef.current('save')) return false
    const info = editingJamoInfoRef.current
    if (!info) return false
    const current = useJamoStore.getState()[info.type][info.char]
    if (!current) return false
    jamoSnapshotRef.current = { type: info.type, char: info.char, data: JSON.parse(JSON.stringify(current)) }
    setSavedJamoData(JSON.parse(JSON.stringify(current)))
    setIsJamoDirty(false)
    setIsJamoScopeDirty(false)
    return true
  }, [])

  const handleJamoDiscard = useCallback((): boolean => {
    jamoScopeActionRef.current?.('discard')
    const snapshot = jamoSnapshotRef.current
    if (!snapshot) return false
    const restored = JSON.parse(JSON.stringify(snapshot.data)) as JamoData
    const store = useJamoStore.getState()
    if (snapshot.type === 'choseong') store.updateChoseong(snapshot.char, restored)
    else if (snapshot.type === 'jungseong') store.updateJungseong(snapshot.char, restored)
    else store.updateJongseong(snapshot.char, restored)
    setIsJamoDirty(false)
    setIsJamoScopeDirty(false)
    setSelectedStrokeId(null)
    return true
  }, [setSelectedStrokeId])

  const completeJamoNavigation = useCallback((target: PendingJamoNavigation) => {
    if (target.type === 'layout') {
      setPreviewLayoutType(target.layoutType)
      return
    }
    if (target.type === 'history') {
      if (target.delta === 0) {
        acceptedHistoryStateRef.current = target.state
        applyAppRoute(target.route)
        return
      }
      confirmedHistoryNavigationRef.current = true
      window.history.go(target.delta)
      return
    }
    const layoutRoute: AppRoute = { page: 'editor', layoutType: activeLayoutType }
    acceptedHistoryStateRef.current = replaceAppRoute(layoutRoute)
    setPreviewLayoutType(null)
    setEditingPartInLayout(null)
  }, [activeLayoutType, setEditingPartInLayout])

  const requestJamoNavigation = useCallback((target: PendingJamoNavigation) => {
    if (isJamoDirty || isJamoScopeDirty) {
      setPendingJamoNavigation(target)
      setShowJamoSaveDialog(true)
      return
    }
    completeJamoNavigation(target)
  }, [isJamoDirty, isJamoScopeDirty, completeJamoNavigation])

  const handleJamoNavigationSave = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (!pendingJamoNavigation || !handleJamoSave()) {
      event.preventDefault()
      return
    }
    const target = pendingJamoNavigation
    setShowJamoSaveDialog(false)
    setPendingJamoNavigation(null)
    completeJamoNavigation(target)
  }, [pendingJamoNavigation, handleJamoSave, completeJamoNavigation])

  const handleJamoNavigationDiscard = useCallback((event: React.MouseEvent<HTMLButtonElement>) => {
    if (!pendingJamoNavigation || !handleJamoDiscard()) {
      event.preventDefault()
      return
    }
    const target = pendingJamoNavigation
    setShowJamoSaveDialog(false)
    setPendingJamoNavigation(null)
    completeJamoNavigation(target)
  }, [pendingJamoNavigation, handleJamoDiscard, completeJamoNavigation])

  const handleBackToLayout = useCallback(() => {
    const current = acceptedHistoryStateRef.current ?? getCurrentRouteHistoryState()
    if (current?.parentPath && current.index > 0) {
      window.history.back()
      return
    }
    requestJamoNavigation({ type: 'exit' })
  }, [requestJamoNavigation])

  // 브라우저 뒤로/앞으로 가기도 자모 카드 이동과 동일한 저장 분기를 거친다.
  useEffect(() => {
    const handleRoutePop = (event: Event) => {
      const { route, state } = (event as CustomEvent<AppRoutePopDetail>).detail

      if (restoringHistoryRef.current) {
        restoringHistoryRef.current = false
        acceptedHistoryStateRef.current = state
        return
      }

      if (confirmedHistoryNavigationRef.current) {
        confirmedHistoryNavigationRef.current = false
        acceptedHistoryStateRef.current = state
        applyAppRoute(route)
        return
      }

      const accepted = acceptedHistoryStateRef.current
      if (isJamoEditing && (isJamoDirty || isJamoScopeDirty) && accepted && state) {
        const delta = state.index - accepted.index
        if (delta !== 0) {
          setPendingJamoNavigation({ type: 'history', route, state, delta })
          setShowJamoSaveDialog(true)
          restoringHistoryRef.current = true
          window.history.go(-delta)
          return
        }
      }

      acceptedHistoryStateRef.current = state
      applyAppRoute(route)
    }

    window.addEventListener(APP_ROUTE_POP_EVENT, handleRoutePop)
    return () => window.removeEventListener(APP_ROUTE_POP_EVENT, handleRoutePop)
  }, [isJamoEditing, isJamoDirty, isJamoScopeDirty])

  useEffect(() => {
    if (!isJamoEditing || (!isJamoDirty && !isJamoScopeDirty)) return
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', handleBeforeUnload)
    return () => window.removeEventListener('beforeunload', handleBeforeUnload)
  }, [isJamoEditing, isJamoDirty, isJamoScopeDirty])

  // 편집 중인 파트의 박스 정보 (StrokeOverlay용)
  const editingBox = useMemo((): BoxConfig | null => {
    if (!editingPartInLayout) return null
    const partKey = editingPartInLayout === 'JU_H' || editingPartInLayout === 'JU_V'
      ? editingPartInLayout
      : editingPartInLayout === 'CH' ? 'CH'
      : editingPartInLayout === 'JO' ? 'JO'
      : 'JU'
    const box = computedBoxes[partKey as keyof typeof computedBoxes]
    return box || null
  }, [editingPartInLayout, computedBoxes])

  const editingBoundaryBox = useMemo((): BoxConfig | null => {
    if (!editingPartInLayout) return null
    return rawBoxes[editingPartInLayout] ?? null
  }, [editingPartInLayout, rawBoxes])

  // 편집 중인 자모의 strokes (스토어에서 파생)
  const editingStrokes = useMemo(() => {
    if (!editingJamoInfo) return [] as StrokeDataV2[]
    return getEditingStrokes(
      editingJamoInfo.type, editingJamoInfo.char,
      editingOverrideId, choseong, jungseong, jongseong
    )
  }, [editingJamoInfo, editingOverrideId, choseong, jungseong, jongseong])

  const baseEditingStrokes = useMemo(() => {
    if (!editingJamoInfo || !editingOverrideId) return [] as StrokeDataV2[]
    return getEditingStrokes(
      editingJamoInfo.type, editingJamoInfo.char,
      null, choseong, jungseong, jongseong
    )
  }, [editingJamoInfo, editingOverrideId, choseong, jungseong, jongseong])

  // 편집 중인 자모의 패딩 (스토어에서 파생)
  const editingPadding = useMemo(() => {
    if (!editingJamoInfo) return { padding: undefined as Padding | undefined, horizontalPadding: undefined as Padding | undefined, verticalPadding: undefined as Padding | undefined }
    const jamoMap = editingJamoInfo.type === 'choseong' ? choseong
      : editingJamoInfo.type === 'jungseong' ? jungseong : jongseong
    const jamo = jamoMap[editingJamoInfo.char]
    if (!jamo) return { padding: undefined, horizontalPadding: undefined, verticalPadding: undefined }

    if (editingOverrideId) {
      const override = jamo.overrides?.find(o => o.id === editingOverrideId)
      if (override) {
        return {
          padding: override.variant.padding ?? jamo.padding,
          horizontalPadding: override.variant.horizontalPadding ?? jamo.horizontalPadding,
          verticalPadding: override.variant.verticalPadding ?? jamo.verticalPadding,
        }
      }
    }

    return {
      padding: jamo.padding,
      horizontalPadding: jamo.horizontalPadding,
      verticalPadding: jamo.verticalPadding,
    }
  }, [editingJamoInfo, editingOverrideId, choseong, jungseong, jongseong])

  const baseEditingPadding = useMemo(() => {
    if (!editingJamoInfo || !editingOverrideId) return { padding: undefined, horizontalPadding: undefined, verticalPadding: undefined }
    const jamoMap = editingJamoInfo.type === 'choseong' ? choseong
      : editingJamoInfo.type === 'jungseong' ? jungseong : jongseong
    const jamo = jamoMap[editingJamoInfo.char]
    return {
      padding: jamo?.padding,
      horizontalPadding: jamo?.horizontalPadding,
      verticalPadding: jamo?.verticalPadding,
    }
  }, [editingJamoInfo, editingOverrideId, choseong, jungseong, jongseong])

  // 혼합중성 관련 데이터
  const mixedJungseongData = useMemo(() => {
    if (!editingJamoInfo || editingJamoInfo.type !== 'jungseong') return null
    const jamo = jungseong[editingJamoInfo.char]
    if (!jamo?.horizontalStrokes || !jamo?.verticalStrokes) return null
    return {
      isMixed: true,
      juHBox: computedBoxes.JU_H as BoxConfig | undefined,
      juVBox: computedBoxes.JU_V as BoxConfig | undefined,
      horizontalStrokeIds: new Set(jamo.horizontalStrokes.map(s => s.id)),
      verticalStrokeIds: new Set(jamo.verticalStrokes.map(s => s.id)),
      horizontalBoundaryBox: rawBoxes.JU_H as BoxConfig | undefined,
      verticalBoundaryBox: rawBoxes.JU_V as BoxConfig | undefined,
    }
  }, [editingJamoInfo, jungseong, computedBoxes, rawBoxes])

  // 자모 편집 진입/전환 시 선택 초기화
  const editingJamoType_ = editingJamoInfo?.type ?? null
  const editingJamoChar_ = editingJamoInfo?.char ?? null
  useEffect(() => {
    setSelectedStrokeId(null)
  }, [editingJamoType_, editingJamoChar_, editingOverrideId, setSelectedStrokeId])

  // Escape 키로 자모 편집 종료 + Ctrl+Z/Y로 글로벌 undo/redo
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isJamoEditing) {
        e.preventDefault()
        handleBackToLayout()
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        globalUndo()
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault()
        globalRedo()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isJamoEditing, handleBackToLayout, globalUndo, globalRedo])

  // 파트 싱글클릭 → 파트 선택 (파트 오프셋 조절용)
  const handlePartClick = useCallback((part: Part) => {
    setSelectedPartInLayout(selectedPartInLayout === part ? null : part)
  }, [selectedPartInLayout, setSelectedPartInLayout])

  // 파트 선택 해제 (캔버스 외부 클릭 시)
  const handlePartDeselect = useCallback(() => {
    setSelectedPartInLayout(null)
  }, [setSelectedPartInLayout])

  // 자모 편집으로 실제 진입하는 내부 함수
  const enterJamoEditing = useCallback((part: Part) => {
    const jamoInfo = partToJamoInfo(part, testSyllable)
    if (!jamoInfo) return
    setPreviewLayoutType(layoutType)
    setEditingPartInLayout(part)
    setEditingJamo(jamoInfo.type, jamoInfo.char)
  }, [testSyllable, layoutType, setEditingPartInLayout, setEditingJamo])

  // 파트 더블클릭 → 더티 상태면 저장/폐기 다이얼로그, 아니면 즉시 진입
  const handlePartDoubleClick = useCallback((part: Part) => {
    const jamoInfo = partToJamoInfo(part, testSyllable)
    if (!jamoInfo) return
    if (isLayoutDirty) {
      setPendingJamoPart(part)
      setShowSaveDialog(true)
      return
    }
    enterJamoEditing(part)
  }, [testSyllable, isLayoutDirty, enterJamoEditing])

  // 저장/폐기 다이얼로그 핸들러
  const handleSaveDialogSave = useCallback(() => {
    setIsLayoutDirty(false)
    setShowSaveDialog(false)
    if (pendingJamoPart) {
      enterJamoEditing(pendingJamoPart)
      setPendingJamoPart(null)
    }
  }, [pendingJamoPart, enterJamoEditing])

  const handleSaveDialogDiscard = useCallback(() => {
    if (layoutSnapshotRef.current) {
      restoreLayoutSnapshot(layoutType, layoutSnapshotRef.current, paddingOverrideSnapshotRef.current)
    }
    setIsLayoutDirty(false)
    setShowSaveDialog(false)
    if (pendingJamoPart) {
      enterJamoEditing(pendingJamoPart)
      setPendingJamoPart(null)
    }
  }, [pendingJamoPart, layoutType, enterJamoEditing, restoreLayoutSnapshot])

  // 레이아웃 툴바 저장 버튼 — dirty 플래그 클리어 + 스냅샷 갱신
  const handleLayoutSave = useCallback(() => {
    layoutSnapshotRef.current = JSON.parse(JSON.stringify(getLayoutSchema(layoutType)))
    paddingOverrideSnapshotRef.current = paddingOverrides[layoutType]
      ? JSON.parse(JSON.stringify(paddingOverrides[layoutType]))
      : null
    setIsLayoutDirty(false)
  }, [layoutType, getLayoutSchema, paddingOverrides])

  // 레이아웃 툴바 폐기 버튼 — 스냅샷 복원
  const handleLayoutDiscard = useCallback(() => {
    if (layoutSnapshotRef.current) {
      restoreLayoutSnapshot(layoutType, layoutSnapshotRef.current, paddingOverrideSnapshotRef.current)
    }
    setIsLayoutDirty(false)
  }, [layoutType, restoreLayoutSnapshot])

  // === 자모 획 편집 핸들러 (스토어 직접 조작) ===

  // 획 속성 변경 (드래그 중 연속 호출 — 스냅샷 없음)
  const handleStrokeChange = useCallback((strokeId: string, prop: string, value: number | string | boolean | undefined) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current
    const { choseong: ch, jungseong: ju, jongseong: jo } = useJamoStore.getState()
    const strokes = getEditingStrokes(info.type, info.char, ovId, ch, ju, jo)
    const newStrokes = strokes.map((s) => {
      if (s.id !== strokeId) return s
      if (value === undefined) {
        const updated = { ...s }
        delete (updated as Record<string, unknown>)[prop]
        return updated
      }
      return { ...s, [prop]: value }
    })
    commitStrokesToStore(info, newStrokes, ovId)
  }, [])

  // 포인트 변경 핸들러
  const handlePointChange = useCallback((
    strokeId: string,
    pointIndex: number,
    field: 'x' | 'y' | 'handleIn' | 'handleOut',
    value: { x: number; y: number } | number
  ) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current
    const { choseong: ch, jungseong: ju, jongseong: jo } = useJamoStore.getState()
    const strokes = getEditingStrokes(info.type, info.char, ovId, ch, ju, jo)
    const newStrokes = strokes.map(s => {
      if (s.id !== strokeId) return s
      const newPoints = s.points.map((p, i) => {
        if (i !== pointIndex) return p
        const updated = { ...p }
        if (field === 'x' || field === 'y') {
          updated[field] = value as number
        } else {
          updated[field] = value as { x: number; y: number }
        }
        return updated
      })
      return { ...s, points: newPoints }
    })
    commitStrokesToStore(info, newStrokes, ovId)
  }, [])

  // 드래그 시작 전 스냅샷 (글로벌 히스토리)
  const handleDragStart = useCallback(() => {
    pushSnapshot()
  }, [pushSnapshot])

  // 두 획 합치기
  const handleMergeStrokes = useCallback((strokeIdA: string, strokeIdB: string) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current
    pushSnapshot()
    const { choseong: ch, jungseong: ju, jongseong: jo } = useJamoStore.getState()
    const strokes = getEditingStrokes(info.type, info.char, ovId, ch, ju, jo)
    const a = strokes.find(s => s.id === strokeIdA)
    const b = strokes.find(s => s.id === strokeIdB)
    if (!a || !b) return
    const merged = mergeStrokes(a, b)
    if (!merged) return
    const newStrokes = strokes
      .map(s => s.id === strokeIdA ? merged : s)
      .filter(s => s.id !== strokeIdB)
    commitStrokesToStore(info, newStrokes, ovId)
  }, [pushSnapshot])

  // 획 분리
  const handleSplitStroke = useCallback((strokeId: string, pointIndex: number) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current
    pushSnapshot()
    const { choseong: ch, jungseong: ju, jongseong: jo } = useJamoStore.getState()
    const strokes = getEditingStrokes(info.type, info.char, ovId, ch, ju, jo)
    const stroke = strokes.find(s => s.id === strokeId)
    if (!stroke) return
    const result = splitStroke(stroke, pointIndex)
    if (!result) return
    const [first, second] = result
    const idx = strokes.findIndex(s => s.id === strokeId)
    const newStrokes = [...strokes]
    newStrokes.splice(idx, 1, first, second)
    commitStrokesToStore(info, newStrokes, ovId)
  }, [pushSnapshot])

  // 닫힌 경로를 선택한 점에서 끊기 (열기)
  const handleOpenAtPoint = useCallback((strokeId: string, pointIndex: number) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current
    pushSnapshot()
    const { choseong: ch, jungseong: ju, jongseong: jo } = useJamoStore.getState()
    const strokes = getEditingStrokes(info.type, info.char, ovId, ch, ju, jo)
    const newStrokes = strokes.map(s => {
      if (s.id !== strokeId || !s.closed) return s
      const rotated = [...s.points.slice(pointIndex), ...s.points.slice(0, pointIndex)]
      return { ...s, points: rotated, closed: false }
    })
    commitStrokesToStore(info, newStrokes, ovId)
  }, [pushSnapshot])

  // 포인트 삭제 (최소 2점 유지)
  const handleDeletePoint = useCallback((strokeId: string, pointIndex: number) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current
    pushSnapshot()
    const { choseong: ch, jungseong: ju, jongseong: jo } = useJamoStore.getState()
    const strokes = getEditingStrokes(info.type, info.char, ovId, ch, ju, jo)
    const newStrokes = strokes.map(s => {
      if (s.id !== strokeId || s.points.length <= 2) return s
      const newPoints = [...s.points]
      newPoints.splice(pointIndex, 1)
      return { ...s, points: newPoints }
    })
    commitStrokesToStore(info, newStrokes, ovId)
  }, [pushSnapshot])

  // 획 삭제
  const handleDeleteStroke = useCallback((strokeId: string) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current
    pushSnapshot()
    const { choseong: ch, jungseong: ju, jongseong: jo } = useJamoStore.getState()
    const strokes = getEditingStrokes(info.type, info.char, ovId, ch, ju, jo)
    commitStrokesToStore(info, strokes.filter(s => s.id !== strokeId), ovId)
  }, [pushSnapshot])

  // 획 추가 (기본 2점 직선)
  const handleAddStroke = useCallback(() => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current
    pushSnapshot()
    const newId = `stroke-${Date.now()}`
    const newStroke: StrokeDataV2 = {
      id: newId,
      points: [
        { x: 0.2, y: 0.5 },
        { x: 0.8, y: 0.5 },
      ],
      closed: false,
      thickness: 0.07,
    }
    const { choseong: ch, jungseong: ju, jongseong: jo } = useJamoStore.getState()
    const strokes = getEditingStrokes(info.type, info.char, ovId, ch, ju, jo)
    commitStrokesToStore(info, [...strokes, newStroke], ovId)
    setSelectedStrokeId(newId)
  }, [pushSnapshot, setSelectedStrokeId])

  // 포인트 곡선화 토글
  const handleToggleCurve = useCallback((strokeId: string, pointIndex: number) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current
    pushSnapshot()
    const { choseong: ch, jungseong: ju, jongseong: jo } = useJamoStore.getState()
    const strokes = getEditingStrokes(info.type, info.char, ovId, ch, ju, jo)
    const newStrokes = strokes.map(s => {
      if (s.id !== strokeId) return s
      const pt = s.points[pointIndex]
      if (!pt) return s
      if (pt.handleIn || pt.handleOut) {
        return removeHandlesFromPoint(s, pointIndex)
      } else {
        return addHandlesToPoint(s, pointIndex)
      }
    })
    commitStrokesToStore(info, newStrokes, ovId)
  }, [pushSnapshot])

  // 종성 편집 시 초성 스타일 복사 정보
  const choseongStyleInfo = useMemo(() => {
    if (!editingJamoInfo || editingJamoInfo.type !== 'jongseong') return null
    const char = editingJamoInfo.char

    const compoundParts = COMPOUND_JONGSEONG[char]
    if (compoundParts) {
      const [first, second] = compoundParts
      const firstJamo = choseong[first]
      const secondJamo = choseong[second]
      if (firstJamo && secondJamo) {
        return { type: 'compound' as const, parts: compoundParts, jamos: [firstJamo, secondJamo] as const }
      }
      return null
    }

    const singleJamo = choseong[char]
    if (singleJamo) {
      return { type: 'single' as const, jamo: singleJamo }
    }

    return null
  }, [editingJamoInfo, choseong])

  const handleApplyChoseongStyle = useCallback(() => {
    if (!choseongStyleInfo || !editingJamoInfo) return
    pushSnapshot()

    let newStrokes: StrokeDataV2[]
    if (choseongStyleInfo.type === 'single') {
      const src = choseongStyleInfo.jamo
      newStrokes = src.strokes ? src.strokes.map(s => ({ ...s })) : []
      if (src.padding) {
        const pad = src.padding
        for (const side of ['top', 'bottom', 'left', 'right'] as const) {
          updateJamoPadding('jongseong', editingJamoInfo.char, side, pad[side])
        }
      }
    } else {
      const [firstJamo, secondJamo] = choseongStyleInfo.jamos
      const scaleStrokes = (strokes: StrokeDataV2[], xOffset: number, xScale: number) =>
        strokes.map(s => ({
          ...s,
          points: s.points.map(p => ({
            ...p,
            x: p.x * xScale + xOffset,
            ...(p.handleIn ? { handleIn: { x: p.handleIn.x * xScale + xOffset, y: p.handleIn.y } } : {}),
            ...(p.handleOut ? { handleOut: { x: p.handleOut.x * xScale + xOffset, y: p.handleOut.y } } : {}),
          })),
        }))
      const leftStrokes = scaleStrokes(
        firstJamo.strokes ? firstJamo.strokes.map(s => ({ ...s })) : [],
        0, 0.5
      )
      const rightStrokes = scaleStrokes(
        secondJamo.strokes ? secondJamo.strokes.map(s => ({ ...s })) : [],
        0.5, 0.5
      )
      newStrokes = [...leftStrokes, ...rightStrokes]
      for (const side of ['top', 'bottom', 'left', 'right'] as const) {
        updateJamoPadding('jongseong', editingJamoInfo.char, side, 0)
      }
    }

    commitStrokesToStore(editingJamoInfo, newStrokes, editingOverrideId)
  }, [choseongStyleInfo, editingJamoInfo, editingOverrideId, pushSnapshot, updateJamoPadding])

  // 오버라이드 탭 전환 (strokes는 스토어에서 자동 파생)
  const handleOverrideSwitch = useCallback(() => {
    setSelectedStrokeId(null)
  }, [setSelectedStrokeId])

  // 자모 편집 초기화 (기본값 복원)
  const handleJamoReset = useCallback(() => {
    if (!editingJamoInfo) return
    if (!window.confirm(`자모 '${editingJamoInfo.char}'을(를) 기본값으로 초기화하시겠습니까?\n획과 패딩이 모두 초기 상태로 돌아갑니다.`)) return
    pushSnapshot()
    resetJamoChar(editingJamoInfo.type, editingJamoInfo.char)
  }, [editingJamoInfo, pushSnapshot, resetJamoChar])

  // 자모 편집 모드에서 SvgRenderer용 partStyles 계산
  const partStyles = useMemo((): Partial<Record<Part, PartStyle>> | undefined => {
    if (!isJamoEditing || !editingPartInLayout) return undefined
    const styles: Partial<Record<Part, PartStyle>> = {}
    const allParts: Part[] = ['CH', 'JU', 'JU_H', 'JU_V', 'JO']
    for (const part of allParts) {
      const isEditingPart = part === editingPartInLayout ||
        (editingPartInLayout === 'JU' && (part === 'JU_H' || part === 'JU_V')) ||
        ((editingPartInLayout === 'JU_H' || editingPartInLayout === 'JU_V') && (part === 'JU_H' || part === 'JU_V'))

      if (isEditingPart) {
        styles[part] = { hidden: true }
      } else {
        // 비편집 파트는 레이아웃 문맥을 유지하되 포커스 밖으로 흐리게 표시한다.
        styles[part] = { opacity: 0.18 }
      }
    }
    return styles
  }, [isJamoEditing, editingPartInLayout])

  // === 레이아웃 편집 핸들러 (스토어 직접 조작) ===

  const handleReset = () => {
    if (!window.confirm('이 레이아웃을 기본값으로 초기화하시겠습니까?\n현재 설정(분할선, 패딩, 파트 위치)이 모두 초기화됩니다.')) return
    pushSnapshot()
    resetLayoutSchema(layoutType)
    resetAllPartOverrides(layoutType)
    removePaddingOverride(layoutType)
    setIsLayoutDirty(false)
    // 리셋 후 스냅샷도 갱신
    layoutSnapshotRef.current = JSON.parse(JSON.stringify(getLayoutSchema(layoutType)))
    paddingOverrideSnapshotRef.current = null
  }

  // 패딩 오버라이드 → 스토어 직접 + 더티 마킹
  const handlePaddingOverrideChange = useCallback((side: keyof Padding, val: number) => {
    setPaddingOverride(activeLayoutType, side, val)
    setIsLayoutDirty(true)
  }, [setPaddingOverride, activeLayoutType])

  // 파트 오프셋 → 레이아웃 오버라이드 편집 중이면 오버라이드에, 아니면 기본 스키마에 저장
  const handlePartOverrideChange = useCallback((part: Part, side: keyof PartOverride, value: number) => {
    if (editingLayoutOverrideId) {
      const schema = getLayoutSchema(activeLayoutType)
      const override = schema.overrides?.find((o) => o.id === editingLayoutOverrideId)
      const currentPart = override?.partOverrides?.[part] ?? { top: 0, bottom: 0, left: 0, right: 0 }
      updateLayoutOverride(activeLayoutType, editingLayoutOverrideId, {
        partOverrides: {
          ...override?.partOverrides,
          [part]: { ...currentPart, [side]: value },
        },
      })
    } else {
      updatePartOverride(activeLayoutType, part, side, value)
      setIsLayoutDirty(true)
    }
  }, [editingLayoutOverrideId, updatePartOverride, updateLayoutOverride, activeLayoutType, getLayoutSchema])

  // 기준선 → 스토어 직접 + 더티 마킹
  const handleSplitChange = useCallback((index: number, value: number) => {
    updateSplit(activeLayoutType, index, value)
    setIsLayoutDirty(true)
  }, [updateSplit, activeLayoutType])

  // 레이아웃 컨텍스트 전환 핸들러
  const handlePreviewLayoutTypeChange = useCallback((lt: LayoutType) => {
    if (isJamoEditing) {
      if (lt === activeLayoutType) return
      requestJamoNavigation({ type: 'layout', layoutType: lt })
    } else {
      const anchoredChoseong = testSyllable.choseong?.char
      const anchoredSyllable = getSampleSyllableForLayout(
        lt,
        undefined,
        undefined,
        {
          choseong: anchoredChoseong,
          jungseong: testSyllable.jungseong?.char,
          jongseong: testSyllable.jongseong?.char,
        },
      )
      setSelectedLayoutType(lt)
      setFocusedSyllable(anchoredSyllable)
    }
  }, [isJamoEditing, activeLayoutType, requestJamoNavigation, testSyllable, setSelectedLayoutType, setFocusedSyllable])

  // 자모 패딩 변경 → 스토어 직접
  const handleJamoPaddingChange = useCallback((_type: 'choseong' | 'jungseong' | 'jongseong', _char: string, side: keyof Padding, val: number) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current

    if (ovId) {
      // 오버라이드 variant의 패딩 업데이트
      const store = useJamoStore.getState()
      const jamo = store[info.type][info.char]
      if (!jamo) return
      const existingOverride = jamo.overrides?.find(o => o.id === ovId)
      if (!existingOverride) return
      const variant = { ...existingOverride.variant }
      const currentPad = variant.padding ?? jamo.padding ?? { top: 0, bottom: 0, left: 0, right: 0 }
      variant.padding = { ...currentPad, [side]: val }
      store.updateOverride(info.type, info.char, ovId, { variant })
    } else {
      updateJamoPadding(info.type, info.char, side, val)
    }
  }, [updateJamoPadding])

  // 혼합중성 패딩 변경 → 스토어 직접
  const handleMixedJamoPaddingChange = useCallback((_char: string, part: 'horizontal' | 'vertical', side: keyof Padding, val: number) => {
    const info = editingJamoInfoRef.current
    if (!info) return
    const ovId = editingOverrideIdRef.current

    if (ovId) {
      const store = useJamoStore.getState()
      const jamo = store[info.type][info.char]
      if (!jamo) return
      const existingOverride = jamo.overrides?.find(o => o.id === ovId)
      if (!existingOverride) return
      const variant = { ...existingOverride.variant }
      const key = part === 'horizontal' ? 'horizontalPadding' as const : 'verticalPadding' as const
      const currentPad = variant[key] ?? jamo[key] ?? { top: 0, bottom: 0, left: 0, right: 0 }
      variant[key] = { ...currentPad, [side]: val }
      store.updateOverride(info.type, info.char, ovId, { variant })
    } else {
      updateMixedJamoPadding(info.char, part, side, val)
    }
  }, [updateMixedJamoPadding])

  // Hydration 전에는 로딩 표시
  if (!_hydrated) {
    return (
      <div className="h-full overflow-y-auto p-5">
        <div className="flex items-center justify-center h-[200px] text-text-dim-5 text-base">로딩 중...</div>
      </div>
    )
  }

  if (!schema) {
    return (
      <div className="h-full overflow-y-auto p-5">
        <p>레이아웃 스키마를 불러올 수 없습니다.</p>
      </div>
    )
  }

  // 공통 캔버스 컬럼 props
  const layoutCanvasProps = {
    layoutType,
    displaySyllable: testSyllable,
    // SvgRenderer에는 실제 schema 전달 — syllable context로 override 해석 (해당 음절이 scope에 포함될 때만 적용)
    // computedBoxes는 displaySchema 기반이라 드래그 핸들은 항상 override 박스를 표시
    schemaWithPadding: schemaWithPadding,
    effectiveStyle,
    computedBoxes,
    schema,
    effectivePadding,
    hasPaddingOverride: hasPaddingOverride(layoutType),
    selectedPartInLayout,
    editingPartInLayout,
    onLayoutReset: handleReset,
    onDragStart: handleDragStart,
    onUndo: globalUndo,
    onRedo: globalRedo,
    canUndo,
    canRedo,
    onPartClick: handlePartClick,
    onPartDoubleClick: handlePartDoubleClick,
    onPartOverrideChange: handlePartOverrideChange,
    onSplitChange: handleSplitChange,
    onPaddingOverrideChange: handlePaddingOverrideChange,
  } as const

  const jamoCanvasProps = {
    displaySyllable: testSyllable,
    schemaWithPadding,
    effectiveStyle,
    partStyles,
    isJamoEditing,
    draftStrokes: editingStrokes,
    baseGuideStrokes: baseEditingStrokes,
    editingBox,
    editingBoundaryBox,
    editingJamoInfo,
    mixedJungseongData,
    editingJamoPadding: editingPadding.padding,
    editingHorizontalPadding: editingPadding.horizontalPadding,
    editingVerticalPadding: editingPadding.verticalPadding,
    baseGuidePadding: baseEditingPadding.padding,
    baseGuideHorizontalPadding: baseEditingPadding.horizontalPadding,
    baseGuideVerticalPadding: baseEditingPadding.verticalPadding,
    isPaddingDirty: false,
    selectedStrokeId,
    globalStyleRaw,
    onStrokeChange: handleStrokeChange,
    onPointChange: handlePointChange,
    onDragStart: handleDragStart,
    onJamoPaddingChange: handleJamoPaddingChange,
    onMixedJamoPaddingChange: handleMixedJamoPaddingChange,
    onMergeStrokes: handleMergeStrokes,
    onSplitStroke: handleSplitStroke,
    onToggleCurve: handleToggleCurve,
    onOpenAtPoint: handleOpenAtPoint,
    onDeletePoint: handleDeletePoint,
    onDeleteStroke: handleDeleteStroke,
    onAddStroke: handleAddStroke,
    onOverrideSwitch: handleOverrideSwitch,
  } as const

  const jamoNavigationDialog = (
    <AlertDialog
      open={showJamoSaveDialog}
      onOpenChange={(open) => {
        setShowJamoSaveDialog(open)
        if (!open) setPendingJamoNavigation(null)
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>자모 변경사항이 있습니다</AlertDialogTitle>
          <AlertDialogDescription>
            {pendingJamoNavigation?.type === 'layout'
              ? '다른 레이아웃으로 이동하기 전에 현재 자모 변경사항을 어떻게 처리하시겠습니까?'
              : pendingJamoNavigation?.type === 'history' && pendingJamoNavigation.route.page !== 'editor'
                ? '현재 편집 화면을 떠나기 전에 자모 변경사항을 어떻게 처리하시겠습니까?'
              : '레이아웃 편집으로 돌아가기 전에 현재 자모 변경사항을 어떻게 처리하시겠습니까?'
            }
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={() => setPendingJamoNavigation(null)}>
            취소
          </AlertDialogCancel>
          <AlertDialogAction onClick={handleJamoNavigationDiscard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
            변경 폐기
          </AlertDialogAction>
          <AlertDialogAction onClick={handleJamoNavigationSave}>
            저장 후 계속
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )

  // 모바일: 단일 컬럼 레이아웃
  if (isMobile) {
    return (
      <>
        <LayoutEditorMobile
          layoutCanvasProps={layoutCanvasProps}
          jamoCanvasProps={jamoCanvasProps}
          isJamoEditing={isJamoEditing}
          editingJamoInfo={editingJamoInfo}
          choseongStyleInfo={choseongStyleInfo}
          onApplyChoseongStyle={handleApplyChoseongStyle}
          canUndo={canUndo}
          canRedo={canRedo}
          onPartDeselect={handlePartDeselect}
          onJamoReset={handleJamoReset}
          isJamoDirty={isJamoDirty}
          onJamoSave={handleJamoSave}
          onJamoDiscard={handleJamoDiscard}
          onUndo={globalUndo}
          onRedo={globalRedo}
        />
        {jamoNavigationDialog}
      </>
    )
  }

  // 3컬럼 데스크톱 레이아웃
  return (
    <>
      <LayoutEditorDesktop
        layoutCanvasProps={layoutCanvasProps}
        jamoCanvasProps={jamoCanvasProps}
        isJamoEditing={isJamoEditing}
        editingJamoInfo={editingJamoInfo}
        choseongStyleInfo={choseongStyleInfo}
        onApplyChoseongStyle={handleApplyChoseongStyle}
        canUndo={canUndo}
        canRedo={canRedo}
        onPartDeselect={handlePartDeselect}
        onJamoReset={handleJamoReset}
        isJamoDirty={isJamoDirty}
        isJamoScopeDirty={isJamoScopeDirty}
        onJamoSave={handleJamoSave}
        onJamoDiscard={handleJamoDiscard}
        onBackToLayout={handleBackToLayout}
        onJamoScopeStateChange={handleJamoScopeStateChange}
        onUndo={globalUndo}
        onRedo={globalRedo}
        selectedLayoutType={layoutType}
        previewLayoutType={previewLayoutType}
        onSelectLayout={handlePreviewLayoutTypeChange}
        onSelectPreviewLayout={handlePreviewLayoutTypeChange}
        isLayoutDirty={isLayoutDirty}
        onLayoutSave={handleLayoutSave}
        onLayoutDiscard={handleLayoutDiscard}
        savedJamoData={savedJamoData}
      />

      {/* 레이아웃 저장/폐기 다이얼로그 */}
      <AlertDialog open={showSaveDialog} onOpenChange={setShowSaveDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>레이아웃 변경사항이 있습니다</AlertDialogTitle>
            <AlertDialogDescription>
              자모 편집으로 넘어가기 전에 현재 레이아웃 변경사항을 어떻게 처리하시겠습니까?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setShowSaveDialog(false); setPendingJamoPart(null) }}>
              취소
            </AlertDialogCancel>
            <AlertDialogAction onClick={handleSaveDialogDiscard} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              변경 폐기
            </AlertDialogAction>
            <AlertDialogAction onClick={handleSaveDialogSave}>
              저장 후 계속
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {jamoNavigationDialog}
    </>
  )
}
