import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { CircleDot, Grid2X2, LockKeyhole, ScanSearch, Shapes } from 'lucide-react'
import { FinalInkRenderer } from '../src/renderers/FinalInkRenderer'
import { materializeFinalGlyphInk, type FinalGlyphInk } from '../src/services/finalGlyphInk'
import {
  resolveProjectedShapeGlyphInkPrimitives,
  resolveShapeGlyphInkPrimitives,
} from '../src/services/shapeGlyphInkResolver'
import { createJamoRoleMasterId } from '../src/services/jamoConstruction'
import { canonicalVariantContextKey } from '../src/services/jamoContextVariants'
import { resolveContextualPartGrid } from '../src/services/contextPartGridResolver'
import { parseRoleConstructionSourceV1 } from '../src/services/roleConstructionSourceV1'
import { setCoreRailOverrideV1 } from '../src/services/jamoContextVariantCommandsV1'
import { setSevenContextBaseCoreRailV2 } from '../src/services/baseMasterRailCommandsV2'
import { setBaseMasterAreaCellsV1 } from '../src/services/baseMasterAreaCommandsV1'
import { partForJamoRole } from '../src/services/jamoContextRoles'
import { projectPartGridToSlot } from '../src/services/partGridSlotProjection'
import { resolveRailGrid } from '../src/services/railGridResolver'
import { parseShapeSystemSourceV2 } from '../src/services/shapeSystemSourceV2'
import { useEffectiveGlobalStyle, weightToMultiplier } from '../src/stores/globalStyleStore'
import { AppGlyph } from './AppGlyph'
import {
  flushShapeSystemStorePersistence,
  initializeStarterShapeSystem,
  useShapeSystemStore,
} from '../src/stores/shapeSystemStore'
import { useUIStore } from '../src/stores/uiStore'
import { useFontProject } from '../src/hooks/useFontProject'
import type {
  ContextGridPresetCatalogV1,
  CoreRailRole,
  DeepReadonly,
  GridCellRef,
  JamoPartRole,
  JamoVariantContext,
  ShapeSystemSourceV2,
  SetBaseMasterAreaCellsV1Command,
} from '../src/types'
import {
  ContextComparisonStrip,
  EditScopeBar,
  MobileWorkspaceShell,
  PrecisionControlDrawer,
  type ComparisonItem,
  type DrawerState,
} from './workspace/WorkspaceChrome'
import { SaveToast } from './workspace/SaveToast'
import { saveToastView } from './workspace/saveToastView'
import { useDelayedSaving } from './workspace/useDelayedSaving'
import styles from './ShapeWorkspacePage.module.css'
import { CalibrationSentenceEditor } from './CalibrationSentenceEditor'

const CONTEXTS = [
  { char: 'ㄱ', label: '단독', role: 'STANDALONE', context: { baseContext: 'choseong-only' }, layoutType: 'choseong-only' },
  { char: '가', label: '세로모음', role: 'CH', context: { baseContext: 'vertical' }, layoutType: 'choseong-jungseong-vertical' },
  { char: '고', label: '가로모음', role: 'CH', context: { baseContext: 'horizontal' }, layoutType: 'choseong-jungseong-horizontal' },
  { char: '과', label: '혼합모음', role: 'CH', context: { baseContext: 'mixed' }, layoutType: 'choseong-jungseong-mixed' },
  { char: '각', label: '세로+받침', role: 'CH', context: { baseContext: 'vertical-with-jongseong' }, layoutType: 'choseong-jungseong-vertical-jongseong' },
  { char: '곡', label: '가로+받침', role: 'CH', context: { baseContext: 'horizontal-with-jongseong' }, layoutType: 'choseong-jungseong-horizontal-jongseong' },
  { char: '곽', label: '혼합+받침', role: 'CH', context: { baseContext: 'mixed-with-jongseong' }, layoutType: 'choseong-jungseong-mixed-jongseong' },
] as const

type WorkspaceContext = (typeof CONTEXTS)[number]

const EMPTY_CONTEXT_CATALOG: ContextGridPresetCatalogV1 = {
  schema: 'context-grid-preset-catalog',
  version: 1,
  roleDefaults: [],
  contextPresets: [],
}

type EditableCoreRole = Extract<CoreRailRole, 'inner-left' | 'inner-right' | 'inner-top' | 'inner-bottom'>

const EDITABLE_CORE_RAILS: readonly {
  coreRole: EditableCoreRole
  axis: 'x' | 'y'
  label: string
}[] = [
  { coreRole: 'inner-left', axis: 'x', label: '안쪽 왼쪽 기준선' },
  { coreRole: 'inner-right', axis: 'x', label: '안쪽 오른쪽 기준선' },
  { coreRole: 'inner-top', axis: 'y', label: '안쪽 위 기준선' },
  { coreRole: 'inner-bottom', axis: 'y', label: '안쪽 아래 기준선' },
]

function editableRail(coreRole: EditableCoreRole) {
  return EDITABLE_CORE_RAILS.find((rail) => rail.coreRole === coreRole) ?? EDITABLE_CORE_RAILS[0]
}

const ROLE_LABELS: Record<JamoPartRole, string> = {
  STANDALONE: '단독',
  CH: '초성',
  JU_VERTICAL: '세로 중성',
  JU_HORIZONTAL: '가로 중성',
  JU_H: '혼합 중성 · 가로',
  JU_V: '혼합 중성 · 세로',
  JO: '받침',
}

const REPRESENTATIVE_JAMOS = ['ㄱ', 'ㅇ', 'ㅏ', 'ㅂ', 'ㅎ', 'ㅙ'] as const

function GlyphPreview({ char, compact = false }: { char: string; compact?: boolean }) {
  return <AppGlyph char={char} size={compact ? 68 : 340} className={compact ? styles.cardGlyph : styles.canvasGlyph} />
}

/** 저장하지 않은 공통 layout Rail draft도 이 미리보기에는 즉시 투영한다. */
type ShapeMasterPreviewState =
  | { kind: 'legacy' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; ink: FinalGlyphInk }

/** J-02에서는 실제 CH ㄱ 마스터가 있을 때만 공통 Shape final regions를 해석한다. */
function useShapeMasterPreview(source: DeepReadonly<ShapeSystemSourceV2> | null): ShapeMasterPreviewState {
  // 단독 ㄱ 마스터 미리보기라 레이아웃은 `choseong-only`다.
  const globalStyle = useEffectiveGlobalStyle('choseong-only')
  return useMemo(() => {
    const scope = source?.roleSources.CH
    if (!scope) return { kind: 'legacy' as const }
    const masterId = createJamoRoleMasterId('ㄱ', 'CH')
    const master = scope.masters.find((candidate) => candidate.id === masterId)
    if (!master) return { kind: 'error' as const, message: '저장된 초성 ㄱ Shape 원형이 없습니다.' }
    const primitives = resolveShapeGlyphInkPrimitives({
      source: scope,
      masterId,
      glyphId: 'ㄱ',
      part: 'CH',
      slot: { x: 0, y: 0, width: 1, height: 1 },
      weightMultiplier: weightToMultiplier(globalStyle.weight),
      globalLinecap: globalStyle.linecap,
      globalLinejoin: globalStyle.linejoin,
    })
    if (!primitives.ok) return { kind: 'error' as const, message: primitives.issues[0]?.message ?? 'Shape 원형을 해석할 수 없습니다.' }
    const finalInk = materializeFinalGlyphInk(primitives.primitives, globalStyle.strokeStyle, {
      unitsPerEm: 1000,
      maxCurveErrorFontUnits: 0.5,
    })
    if (!finalInk.ok) return { kind: 'error' as const, message: finalInk.message }
    return { kind: 'ready' as const, ink: finalInk.ink }
  }, [globalStyle, source])
}

function ShapeStatus({ editable = false }: { editable?: boolean }) {
  const hydrationStatus = useShapeSystemStore((state) => state.hydrationStatus)
  const hydrationIssues = useShapeSystemStore((state) => state.hydrationIssues)
  const source = useShapeSystemStore((state) => state.source)

  if (hydrationStatus === 'blocked') {
    return (
      <div className={styles.blockedStatus} role="alert">
        <strong>저장 데이터 확인이 필요해요</strong>
        <span>{hydrationIssues[0] ?? '자동 복구나 편집을 시작하지 않았어요.'}</span>
      </div>
    )
  }
  if (!source) {
    return (
      <div className={styles.uninitializedStatus} role="status">
        <LockKeyhole size={15} aria-hidden="true" />
        <span>형태 시스템 연결 전이에요. 현재는 화면과 기존 글자 결과만 검토할 수 있어요.</span>
      </div>
    )
  }
  const masterCount = Object.values(source.roleSources).reduce((count, scope) => count + scope.masters.length, 0)
  return (
    <div className={styles.connectedStatus} role="status">
      <CircleDot size={15} aria-hidden="true" />
      <span>역할별 마스터 {masterCount}개가 연결되어 있어요. {editable ? '선택한 조합을 보정할 수 있어요.' : '이 화면은 원형을 관찰합니다.'}</span>
    </div>
  )
}

function DisabledPrecisionControl({ selected, expanded, sourceLabel }: { selected: boolean; expanded: boolean; sourceLabel: string }) {
  return (
    <>
      <div className={styles.disabledControl} aria-disabled="true">
        <LockKeyhole size={19} />
        <strong>{selected ? '형태 편집 연결 전입니다' : '캔버스에서 대상을 먼저 선택하세요'}</strong>
        <span>현재 화면은 관찰과 구조 검토만 지원합니다.</span>
      </div>
      {expanded && (
        <dl className={styles.drawerDetails}>
          <div><dt>출처</dt><dd>{sourceLabel}</dd></div>
          <div><dt>수정 범위</dt><dd>초성 ㄱ 원형</dd></div>
          <div><dt>좌표계</dt><dd>1000 UPM · 0–1</dd></div>
        </dl>
      )}
    </>
  )
}

function useContextItems(): ComparisonItem[] {
  return CONTEXTS.map((context) => ({
    id: context.char,
    label: context.char,
    detail: context.label,
    preview: <GlyphPreview char={context.char} compact />,
  }))
}

type ContextEditModel =
  | { kind: 'unavailable'; message: string }
  | {
    kind: 'ready'
    role: JamoPartRole
    context: JamoVariantContext
    masterId: string
    coreRole: EditableCoreRole
    axis: 'x' | 'y'
    railLabel: string
    railId: string
    value: number
    min: number
    max: number
    hasOverride: boolean
    sourceLabel: string
    ink: FinalGlyphInk
  }

type ReadyContextEditModel = Extract<ContextEditModel, { kind: 'ready' }>

type RailGesture = {
  coreRole: EditableCoreRole
  startValue: number
}

type BaseRailTarget = {
  masterId: string
  railId: string
}

type BaseEditModel =
  | { kind: 'unavailable'; message: string }
  | {
    kind: 'ready'
    coreRole: EditableCoreRole
    axis: 'x' | 'y'
    railLabel: string
    value: number
    min: number
    max: number
    targets: { STANDALONE: BaseRailTarget; CH: BaseRailTarget }
  }

type BaseRailGesture = {
  coreRole: EditableCoreRole
  startValue: number
  startClientX: number
  startClientY: number
  moved: boolean
}

const PROVENANCE_LABELS = {
  master: '자소 원형에서 가져옴',
  'role-default': '역할 기본값에서 가져옴',
  'context-preset': '조합 기본값에서 가져옴',
  'jamo-override': '이 자소에서 수정됨',
} as const

const RAIL_EDIT_STEP = 0.005
const BASE_AREA_ELEMENT_ID = 'j02:area:CH:giyeok:primary'

function snapRailDraft(value: number, min: number, max: number): number {
  const clamped = Math.min(max, Math.max(min, value))
  const snapped = Math.round(clamped / RAIL_EDIT_STEP) * RAIL_EDIT_STEP
  return Number(Math.min(max, Math.max(min, snapped)).toFixed(6))
}

type BaseAreaCellModel = {
  key: string
  column: number
  row: number
  x: number
  y: number
  width: number
  height: number
  cell: Omit<GridCellRef, 'id'>
}

type BaseAreaEditModel =
  | { kind: 'unavailable'; message: string }
  | {
    kind: 'ready'
    masterId: string
    cells: BaseAreaCellModel[]
    occupiedCellKeys: ReadonlySet<string>
  }

type BaseAreaGesture = {
  mode: 'fill' | 'erase'
  visited: Set<string>
  lastX: number
  lastY: number
}

type BaseAreaDraft = {
  mode: 'fill' | 'erase'
  cellKeys: string[]
}

function sameAreaCell(
  left: DeepReadonly<Omit<GridCellRef, 'id'>>,
  right: DeepReadonly<Omit<GridCellRef, 'id'>>,
): boolean {
  return left.leftRailId === right.leftRailId
    && left.rightRailId === right.rightRailId
    && left.topRailId === right.topRailId
    && left.bottomRailId === right.bottomRailId
}

function segmentIntersectsAreaCell(
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  cell: BaseAreaCellModel,
): boolean {
  const deltaX = endX - startX
  const deltaY = endY - startY
  let near = 0
  let far = 1
  const boundaries = [
    [-deltaX, startX - cell.x],
    [deltaX, cell.x + cell.width - startX],
    [-deltaY, startY - cell.y],
    [deltaY, cell.y + cell.height - startY],
  ] as const

  for (const [direction, distance] of boundaries) {
    if (Math.abs(direction) < Number.EPSILON) {
      if (distance < 0) return false
      continue
    }
    const ratio = distance / direction
    if (direction < 0) near = Math.max(near, ratio)
    else far = Math.min(far, ratio)
    if (near > far) return false
  }
  return true
}

function resolveBaseAreaEditModel(source: DeepReadonly<ShapeSystemSourceV2> | null): BaseAreaEditModel {
  if (!source) return { kind: 'unavailable', message: '형태 시스템을 먼저 시작해야 합니다.' }
  const parsed = parseShapeSystemSourceV2(source)
  if (!parsed.ok) return { kind: 'unavailable', message: '현재 자소 원본을 안전하게 편집할 수 없습니다.' }
  const masterId = createJamoRoleMasterId('ㄱ', 'CH')
  const master = parsed.source.roleSources.CH.masters.find(({ id }) => id === masterId)
  if (!master) return { kind: 'unavailable', message: '초성 ㄱ 원형을 찾을 수 없습니다.' }
  const channel = master.construction.channels.main
  if (!channel || channel.role !== 'CH' || channel.gridId !== parsed.source.roleSources.CH.grid.id) {
    return { kind: 'unavailable', message: '초성 ㄱ main channel의 소유권을 확인할 수 없습니다.' }
  }
  const element = channel.elements.find(({ id }) => id === BASE_AREA_ELEMENT_ID)
  if (element && (element.kind !== 'area' || element.boundaryTreatments.length !== 0)) {
    return { kind: 'unavailable', message: '곡률·사선이 있는 면은 현재 점유 도구로 편집할 수 없습니다.' }
  }
  const resolvedCh = resolveRailGrid(parsed.source.roleSources.CH.grid)
  if (!resolvedCh.ok) return { kind: 'unavailable', message: '초성 기준선 위치를 해석할 수 없습니다.' }
  const cells: BaseAreaCellModel[] = []
  for (let row = 0; row < resolvedCh.grid.yRails.length - 1; row += 1) {
    const top = resolvedCh.grid.yRails[row]
    const bottom = resolvedCh.grid.yRails[row + 1]
    for (let column = 0; column < resolvedCh.grid.xRails.length - 1; column += 1) {
      const left = resolvedCh.grid.xRails[column]
      const right = resolvedCh.grid.xRails[column + 1]
      const bounds = {
        leftRailId: left.id,
        rightRailId: right.id,
        topRailId: top.id,
        bottomRailId: bottom.id,
      }
      cells.push({
        key: [left.id, right.id, top.id, bottom.id].join(':'),
        column,
        row,
        x: left.value,
        y: top.value,
        width: right.value - left.value,
        height: bottom.value - top.value,
        cell: bounds,
      })
    }
  }
  if (cells.length === 0) return { kind: 'unavailable', message: '초성 원자 셀을 찾을 수 없습니다.' }
  const occupiedCellKeys = new Set<string>()
  if (element?.kind === 'area') {
    for (const filledCell of element.filledCells) {
      const matched = cells.find(({ cell }) => sameAreaCell(filledCell, cell))
      if (!matched) return { kind: 'unavailable', message: '저장된 면 셀을 현재 Rail 그리드에서 찾을 수 없습니다.' }
      occupiedCellKeys.add(matched.key)
    }
  }
  return { kind: 'ready', masterId, cells, occupiedCellKeys }
}

function areaCommand(
  model: Extract<BaseAreaEditModel, { kind: 'ready' }>,
  mode: 'fill' | 'erase',
  cellKeys: readonly string[],
  transactionId: string,
): SetBaseMasterAreaCellsV1Command {
  return {
    transactionId,
    mode,
    jamoId: 'ㄱ',
    target: {
      masterId: model.masterId,
      elementId: BASE_AREA_ELEMENT_ID,
    },
    cells: cellKeys.map((key) => model.cells.find((cell) => cell.key === key)?.cell)
      .filter((cell): cell is Omit<GridCellRef, 'id'> => Boolean(cell)),
  }
}

function resolveBaseEditModel(input: {
  source: DeepReadonly<ShapeSystemSourceV2> | null
  coreRole: EditableCoreRole
}): BaseEditModel {
  if (!input.source) return { kind: 'unavailable', message: '형태 시스템을 먼저 시작해야 합니다.' }
  const definition = editableRail(input.coreRole)
  const targets = {} as { STANDALONE: BaseRailTarget; CH: BaseRailTarget }
  const values: number[] = []
  const mins: number[] = []
  const maxes: number[] = []
  for (const role of ['STANDALONE', 'CH'] as const) {
    const scope = input.source.roleSources[role]
    const masterId = createJamoRoleMasterId('ㄱ', role)
    const master = scope.masters.find(({ id }) => id === masterId)
    if (!master || master.jamoId !== 'ㄱ' || master.role !== role) {
      return { kind: 'unavailable', message: `${ROLE_LABELS[role]} ㄱ 원형을 찾을 수 없습니다.` }
    }
    const parsed = parseRoleConstructionSourceV1(scope, {
      knownPresetIds: new Set(input.source.contextPresetCatalog?.contextPresets.map(({ id }) => id) ?? []),
    })
    if (!parsed.ok) return { kind: 'unavailable', message: '현재 자소 원본을 안전하게 편집할 수 없습니다.' }
    const resolved = resolveRailGrid(parsed.source.grid)
    if (!resolved.ok) return { kind: 'unavailable', message: '기준선 위치를 안전하게 해석할 수 없습니다.' }
    const rails = definition.axis === 'x' ? resolved.grid.xRails : resolved.grid.yRails
    const index = rails.findIndex(({ coreRole }) => coreRole === input.coreRole)
    const rail = rails[index]
    const previous = rails[index - 1]
    const next = rails[index + 1]
    if (!rail || !previous || !next || rail.kind !== 'core' || rail.coreRole !== input.coreRole) {
      return { kind: 'unavailable', message: `${ROLE_LABELS[role]}의 ${definition.label}을 찾을 수 없습니다.` }
    }
    targets[role] = { masterId, railId: rail.id }
    values.push(rail.value)
    mins.push(previous.value + scope.grid.minGap)
    maxes.push(next.value - scope.grid.minGap)
  }
  const min = Math.max(...mins)
  const max = Math.min(...maxes)
  if (min > max) return { kind: 'unavailable', message: '두 역할에서 함께 이동할 수 있는 범위가 없습니다.' }
  if (values.some((value) => Math.abs(value - values[0]) > 0.000001)) {
    return { kind: 'unavailable', message: '두 역할의 기준선 값이 달라 안전하게 함께 편집할 수 없습니다.' }
  }
  return { kind: 'ready', coreRole: input.coreRole, axis: definition.axis, railLabel: definition.label, value: values[0], min, max, targets }
}

function ShapePartPreview({ context, source }: { context: WorkspaceContext; source: DeepReadonly<ShapeSystemSourceV2> | null }) {
  const globalStyle = useEffectiveGlobalStyle(context.layoutType)
  const model = useMemo(() => resolveContextEditModel({
    source,
    active: context,
    coreRole: 'inner-left',
    weightMultiplier: weightToMultiplier(globalStyle.weight),
    linecap: globalStyle.linecap,
    linejoin: globalStyle.linejoin,
    strokeStyle: globalStyle.strokeStyle,
  }), [context, globalStyle, source])
  return model.kind === 'ready'
    ? <FinalInkRenderer ink={model.ink} size={68} className={styles.cardGlyph} ariaLabel={`${context.char} Shape 초성 파트 결과`} />
    : <GlyphPreview char={context.char} compact />
}

function useShapeContextItems(
  source: DeepReadonly<ShapeSystemSourceV2> | null,
  includeStandalone: boolean,
): ComparisonItem[] {
  return useMemo(() => CONTEXTS.filter((context) => includeStandalone || context.role === 'CH').map((context) => ({
    id: context.char,
    label: context.char,
    detail: context.label,
    preview: <ShapePartPreview context={context} source={source} />,
  })), [includeStandalone, source])
}

function resolveContextEditModel(input: {
  source: DeepReadonly<ShapeSystemSourceV2> | null
  active: WorkspaceContext
  coreRole: EditableCoreRole
  draftValue?: number
  weightMultiplier: number
  linecap: 'butt' | 'round' | 'square'
  linejoin: 'miter' | 'round' | 'bevel'
  strokeStyle: Parameters<typeof materializeFinalGlyphInk>[1]
}): ContextEditModel {
  if (!input.source) return { kind: 'unavailable', message: '형태 시스템을 먼저 시작해야 합니다.' }
  const scope = input.source.roleSources[input.active.role]
  const masterId = createJamoRoleMasterId('ㄱ', input.active.role)
  const master = scope.masters.find(({ id }) => id === masterId)
  if (!master) return { kind: 'unavailable', message: `${ROLE_LABELS[input.active.role]} ㄱ 원형이 없습니다.` }
  const knownPresetIds = new Set(
    input.source.contextPresetCatalog?.contextPresets.map(({ id }) => id) ?? [],
  )
  const parsed = parseRoleConstructionSourceV1(scope, { knownPresetIds })
  if (!parsed.ok) return { kind: 'unavailable', message: '현재 자소 원본을 안전하게 편집할 수 없습니다.' }
  let workingScope = parsed.source
  if (input.draftValue !== undefined) {
    const preview = setCoreRailOverrideV1(workingScope, {
      transactionId: 'shape-workspace:draft-preview',
      masterId,
      context: input.active.context,
      coreRole: input.coreRole,
      position: { kind: 'absolute', value: input.draftValue },
    }, { knownPresetIds })
    if (preview.ok) workingScope = preview.scope
    else if (preview.error.code !== 'no-op') {
      return { kind: 'unavailable', message: preview.error.message }
    }
  }
  const contextual = resolveContextualPartGrid({
    source: workingScope,
    catalog: input.source.contextPresetCatalog ?? EMPTY_CONTEXT_CATALOG,
    masterId,
    requestedContext: input.active.context,
  })
  if (!contextual.ok) {
    return { kind: 'unavailable', message: contextual.issues[0]?.message ?? '문맥 결과를 해석할 수 없습니다.' }
  }
  const part = partForJamoRole(input.active.role)
  const projection = projectPartGridToSlot({
    contextual,
    part,
    slot: { x: 0, y: 0, width: 1, height: 1 },
  })
  if (!projection.ok) {
    return { kind: 'unavailable', message: projection.issues[0]?.message ?? '자소 결과를 투영할 수 없습니다.' }
  }
  const railDefinition = editableRail(input.coreRole)
  const axisRails = railDefinition.axis === 'x'
    ? projection.resolvedPartGrid.xRails
    : projection.resolvedPartGrid.yRails
  const railIndex = axisRails.findIndex(({ coreRole }) => coreRole === input.coreRole)
  const rail = axisRails[railIndex]
  const previous = axisRails[railIndex - 1]
  const next = axisRails[railIndex + 1]
  if (!rail || !previous || !next) return { kind: 'unavailable', message: '편집할 기준선을 찾을 수 없습니다.' }
  const primitives = resolveProjectedShapeGlyphInkPrimitives({
    projection,
    glyphId: input.active.char,
    weightMultiplier: input.weightMultiplier,
    globalLinecap: input.linecap,
    globalLinejoin: input.linejoin,
  })
  if (!primitives.ok) {
    return { kind: 'unavailable', message: primitives.issues[0]?.message ?? '최종 윤곽을 만들 수 없습니다.' }
  }
  const finalInk = materializeFinalGlyphInk(primitives.primitives, input.strokeStyle, {
    unitsPerEm: 1000,
    maxCurveErrorFontUnits: 0.5,
  })
  if (!finalInk.ok) return { kind: 'unavailable', message: finalInk.message }
  const exactContextKey = canonicalVariantContextKey(input.active.context)
  const variant = master.contextVariants?.find(
    ({ context }) => canonicalVariantContextKey(context) === exactContextKey,
  )
  const provenance = contextual.provenance.railSources[rail.id]?.source ?? 'master'
  return {
    kind: 'ready',
    role: input.active.role,
    context: structuredClone(input.active.context),
    masterId,
    coreRole: input.coreRole,
    axis: railDefinition.axis,
    railLabel: railDefinition.label,
    railId: rail.id,
    value: rail.value,
    min: previous.value + scope.grid.minGap,
    max: next.value - scope.grid.minGap,
    hasOverride: Boolean(variant?.coreRailOverrides?.[input.coreRole]),
    sourceLabel: PROVENANCE_LABELS[provenance],
    ink: finalInk.ink,
  }
}

function MasterScreen() {
  const [observedChar, setObservedChar] = useState<(typeof CONTEXTS)[number]['char']>('ㄱ')
  const [drawerState, setDrawerState] = useState<DrawerState>('collapsed')
  const [activeTool, setActiveTool] = useState<'select' | 'area'>('select')
  const [editedCoreRole, setEditedCoreRole] = useState<EditableCoreRole>('inner-left')
  const [draftValue, setDraftValue] = useState<number | null>(null)
  const [areaDraft, setAreaDraft] = useState<BaseAreaDraft | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [feedback, setFeedback] = useState<string | null>(null)
  // 저장이 300ms를 넘겨야 흐림과 토스트를 함께 켠다. 빠른 저장에서 깜빡이지 않도록.
  const savingLate = useDelayedSaving(saveState === 'saving')
  const toast = saveToastView(saveState, feedback, savingLate)
  const railCanvasRef = useRef<HTMLDivElement | null>(null)
  const areaLayerRef = useRef<HTMLDivElement | null>(null)
  const railGestureRef = useRef<BaseRailGesture | null>(null)
  const areaGestureRef = useRef<BaseAreaGesture | null>(null)
  const draftValueRef = useRef<number | null>(null)
  const transactionSequence = useRef(0)
  const hydrationStatus = useShapeSystemStore((state) => state.hydrationStatus)
  const source = useShapeSystemStore((state) => state.source)
  const setBaseRail = useShapeSystemStore((state) => state.setSevenContextBaseCoreRail)
  const setBaseAreaCells = useShapeSystemStore((state) => state.setBaseMasterAreaCells)
  const canUndo = useShapeSystemStore((state) => state.past.length > 0)
  const canRedo = useShapeSystemStore((state) => state.future.length > 0)
  const undo = useShapeSystemStore((state) => state.undo)
  const redo = useShapeSystemStore((state) => state.redo)
  const projectName = useUIStore((state) => state.currentProjectName) ?? '새 한글 폰트'
  const { currentProjectId, saveCurrent } = useFontProject()
  const baseModels = useMemo(() => EDITABLE_CORE_RAILS.map((rail) => ({
    rail,
    model: resolveBaseEditModel({ source, coreRole: rail.coreRole }),
  })), [source])
  const committedModel = useMemo(() => baseModels.find(({ rail }) => rail.coreRole === editedCoreRole)?.model
    ?? { kind: 'unavailable' as const, message: '편집할 기준선을 찾을 수 없습니다.' }, [baseModels, editedCoreRole])
  const areaModel = useMemo(() => resolveBaseAreaEditModel(source), [source])
  const railDraftSource = useMemo(() => {
    if (!source || committedModel.kind !== 'ready' || draftValue === null) return source
    const result = setSevenContextBaseCoreRailV2(source, {
      transactionId: 'shape-workspace:master-draft',
      jamoId: 'ㄱ',
      coreRole: committedModel.coreRole,
      position: { kind: 'absolute', value: draftValue },
      targets: committedModel.targets,
    })
    return result.ok ? result.source : source
  }, [committedModel, draftValue, source])
  const draftSource = useMemo(() => {
    if (!source || areaModel.kind !== 'ready' || !areaDraft || areaDraft.cellKeys.length === 0) return railDraftSource
    const result = setBaseMasterAreaCellsV1(source, areaCommand(
      areaModel,
      areaDraft.mode,
      areaDraft.cellKeys,
      'shape-workspace:area-draft',
    ))
    return result.ok ? result.source : railDraftSource
  }, [areaDraft, areaModel, railDraftSource, source])
  const preview = useShapeMasterPreview(draftSource)
  const contextItems = useShapeContextItems(draftSource, activeTool !== 'area')
  const visibleValue = draftValue ?? (committedModel.kind === 'ready' ? committedModel.value : 0)

  useEffect(() => {
    railGestureRef.current = null
    areaGestureRef.current = null
    draftValueRef.current = null
    setDraftValue(null)
    setAreaDraft(null)
  }, [source])

  const persistShapeChange = useCallback(async () => {
    setSaveState('saving')
    setFeedback(null)
    try {
      flushShapeSystemStorePersistence()
      if (currentProjectId) {
        const saved = await saveCurrent()
        if (!saved) throw new Error('프로젝트 서버 저장에 실패했습니다.')
        setFeedback('프로젝트와 기기에 저장했습니다.')
      } else {
        setFeedback('이 기기에 저장했습니다.')
      }
      setSaveState('saved')
    } catch (error) {
      setSaveState('error')
      setFeedback(error instanceof Error ? error.message : '저장하지 못했습니다.')
    }
  }, [currentProjectId, saveCurrent])

  const clearDraft = useCallback(() => {
    railGestureRef.current = null
    areaGestureRef.current = null
    draftValueRef.current = null
    setDraftValue(null)
    setAreaDraft(null)
  }, [])

  const commitValue = useCallback((model: Extract<BaseEditModel, { kind: 'ready' }>, value: number) => {
    if (Math.abs(value - model.value) < 0.000001) {
      clearDraft()
      return
    }
    transactionSequence.current += 1
    const result = setBaseRail({
      transactionId: `shape-workspace:master:${transactionSequence.current}`,
      jamoId: 'ㄱ',
      coreRole: model.coreRole,
      position: { kind: 'absolute', value },
      targets: model.targets,
    })
    if (!result.ok) {
      setSaveState('error')
      setFeedback(result.error.message)
      clearDraft()
      return
    }
    clearDraft()
    void persistShapeChange()
  }, [clearDraft, persistShapeChange, setBaseRail])

  const commitAreaCells = useCallback((
    model: Extract<BaseAreaEditModel, { kind: 'ready' }>,
    mode: 'fill' | 'erase',
    cellKeys: readonly string[],
  ) => {
    transactionSequence.current += 1
    const result = setBaseAreaCells(areaCommand(
      model,
      mode,
      cellKeys,
      `shape-workspace:base-area:${transactionSequence.current}`,
    ))
    if (!result.ok) {
      setSaveState('error')
      setFeedback(result.error.message)
      clearDraft()
      return
    }
    clearDraft()
    void persistShapeChange()
  }, [clearDraft, persistShapeChange, setBaseAreaCells])

  const handleHistory = (direction: 'undo' | 'redo') => {
    const result = direction === 'undo' ? undo() : redo()
    if (!result.ok) {
      setSaveState('error')
      setFeedback(result.error.message)
      return
    }
    clearDraft()
    void persistShapeChange()
  }

  const beginCanvasGesture = (model: Extract<BaseEditModel, { kind: 'ready' }>, event: ReactPointerEvent<HTMLDivElement>) => {
    setActiveTool('select')
    setEditedCoreRole(model.coreRole)
    setDrawerState('medium')
    railGestureRef.current = {
      coreRole: model.coreRole,
      startValue: model.value,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
    }
    draftValueRef.current = null
    setDraftValue(null)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const updateCanvasDraft = (model: Extract<BaseEditModel, { kind: 'ready' }>, clientX: number, clientY: number) => {
    const gesture = railGestureRef.current
    const bounds = railCanvasRef.current?.getBoundingClientRect()
    if (!gesture || gesture.coreRole !== model.coreRole || !bounds || bounds.width <= 0 || bounds.height <= 0) return
    const delta = model.axis === 'x'
      ? (clientX - gesture.startClientX) / bounds.width
      : (clientY - gesture.startClientY) / bounds.height
    if (!gesture.moved && Math.abs(delta) * (model.axis === 'x' ? bounds.width : bounds.height) < 3) return
    gesture.moved = true
    const value = snapRailDraft(gesture.startValue + delta, model.min, model.max)
    draftValueRef.current = value
    setDraftValue(value)
  }

  const finishCanvasGesture = (model: Extract<BaseEditModel, { kind: 'ready' }>, event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = railGestureRef.current
    if (!gesture || gesture.coreRole !== model.coreRole) return
    updateCanvasDraft(model, event.clientX, event.clientY)
    railGestureRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (gesture.moved) commitValue(model, draftValueRef.current ?? gesture.startValue)
    else clearDraft()
  }

  const areaPointAtPointer = useCallback((clientX: number, clientY: number) => {
    const bounds = areaLayerRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null
    return {
      x: (clientX - bounds.left) / bounds.width,
      y: (clientY - bounds.top) / bounds.height,
    }
  }, [])

  const areaCellAtPointer = useCallback((clientX: number, clientY: number): BaseAreaCellModel | null => {
    if (areaModel.kind !== 'ready') return null
    const point = areaPointAtPointer(clientX, clientY)
    if (!point) return null
    return areaModel.cells.find((cell) => point.x >= cell.x && point.x <= cell.x + cell.width
      && point.y >= cell.y && point.y <= cell.y + cell.height) ?? null
  }, [areaModel, areaPointAtPointer])

  const beginAreaGesture = (fallbackCell: BaseAreaCellModel, event: ReactPointerEvent<HTMLButtonElement>) => {
    clearDraft()
    const point = areaPointAtPointer(event.clientX, event.clientY)
    const cell = areaCellAtPointer(event.clientX, event.clientY) ?? fallbackCell
    const mode = areaModel.kind === 'ready' && areaModel.occupiedCellKeys.has(cell.key) ? 'erase' : 'fill'
    const gesture: BaseAreaGesture = {
      mode,
      visited: new Set([cell.key]),
      lastX: point?.x ?? cell.x + cell.width / 2,
      lastY: point?.y ?? cell.y + cell.height / 2,
    }
    areaGestureRef.current = gesture
    setAreaDraft({ mode, cellKeys: [cell.key] })
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const updateAreaDraft = (clientX: number, clientY: number) => {
    const gesture = areaGestureRef.current
    const point = areaPointAtPointer(clientX, clientY)
    if (!gesture || !point || areaModel.kind !== 'ready') return
    let changed = false
    for (const cell of areaModel.cells) {
      if (gesture.visited.has(cell.key)
        || !segmentIntersectsAreaCell(gesture.lastX, gesture.lastY, point.x, point.y, cell)) continue
      gesture.visited.add(cell.key)
      changed = true
    }
    gesture.lastX = point.x
    gesture.lastY = point.y
    if (changed) setAreaDraft({ mode: gesture.mode, cellKeys: [...gesture.visited] })
  }

  const commitCurrentAreaGesture = () => {
    const gesture = areaGestureRef.current
    if (!gesture || areaModel.kind !== 'ready') return
    const cellKeys = [...gesture.visited]
    areaGestureRef.current = null
    commitAreaCells(areaModel, gesture.mode, cellKeys)
  }

  const finishAreaGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!areaGestureRef.current) return
    updateAreaDraft(event.clientX, event.clientY)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    commitCurrentAreaGesture()
  }

  const editReason = hydrationStatus === 'blocked'
    ? '저장 데이터를 확인한 뒤 편집할 수 있어요.'
    : !source
      ? '형태 시스템 연결 전에는 기존 안내 상태를 유지합니다.'
      : committedModel.kind === 'unavailable'
        ? committedModel.message
        : '단독과 초성의 같은 기준선을 한 번에 바꾸고 7개 결과에 반영합니다.'
  const areaToolActive = activeTool === 'area' && areaModel.kind === 'ready'
  const visibleOccupiedCellKeys = useMemo(() => {
    if (areaModel.kind !== 'ready') return new Set<string>()
    const keys = new Set(areaModel.occupiedCellKeys)
    if (areaDraft) for (const key of areaDraft.cellKeys) {
      if (areaDraft.mode === 'fill') keys.add(key)
      else keys.delete(key)
    }
    return keys
  }, [areaDraft, areaModel])

  return (
    <MobileWorkspaceShell
      activeArea="jamo"
      projectName={projectName}
      history={{ canUndo, canRedo, onUndo: () => handleHistory('undo'), onRedo: () => handleHistory('redo') }}
      drawer={!areaToolActive ? (
        <PrecisionControlDrawer
          state={drawerState}
          onStateChange={setDrawerState}
          targetLabel={committedModel.kind === 'ready' ? `ㄱ 원형 · ${committedModel.railLabel}` : '원형 관찰'}
        >
          {committedModel.kind === 'ready' ? (
            <div className={styles.railEditor}>
              <div className={styles.railChoices} aria-label="편집할 기준선">
                {EDITABLE_CORE_RAILS.map((rail) => (
                  <button type="button" key={rail.coreRole} aria-pressed={editedCoreRole === rail.coreRole} onClick={() => {
                    clearDraft()
                    setActiveTool('select')
                    setEditedCoreRole(rail.coreRole)
                  }}>{rail.label.replace('안쪽 ', '').replace(' 기준선', '')}</button>
                ))}
              </div>
              <div className={styles.railEditorHeading}>
                <span>{committedModel.railLabel}</span>
                <output>{Math.round(visibleValue * 1000)} UPM</output>
              </div>
              <input
                type="range"
                min={committedModel.min}
                max={committedModel.max}
                step={RAIL_EDIT_STEP}
                value={visibleValue}
                aria-label={committedModel.railLabel}
                onPointerDown={(event) => {
                  railGestureRef.current = { coreRole: committedModel.coreRole, startValue: committedModel.value, startClientX: event.clientX, startClientY: event.clientY, moved: false }
                  draftValueRef.current = null
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value)
                  if (Math.abs(value - committedModel.value) >= 0.000001 && railGestureRef.current) railGestureRef.current.moved = true
                  draftValueRef.current = value
                  setDraftValue(value)
                }}
                onPointerUp={(event) => {
                  const gesture = railGestureRef.current
                  if (!gesture || gesture.coreRole !== committedModel.coreRole) return
                  railGestureRef.current = null
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
                  if (gesture.moved) commitValue(committedModel, draftValueRef.current ?? gesture.startValue)
                  else clearDraft()
                }}
                onPointerCancel={clearDraft}
                onLostPointerCapture={clearDraft}
                onKeyDown={() => {
                  if (!railGestureRef.current) railGestureRef.current = { coreRole: committedModel.coreRole, startValue: committedModel.value, startClientX: 0, startClientY: 0, moved: false }
                }}
                onKeyUp={() => {
                  const gesture = railGestureRef.current
                  if (!gesture || gesture.coreRole !== committedModel.coreRole) return
                  railGestureRef.current = null
                  if (gesture.moved) commitValue(committedModel, draftValueRef.current ?? gesture.startValue)
                  else clearDraft()
                }}
              />
              <div className={styles.railEditorMeta}><span>단독·초성 원형에 함께 적용</span></div>
            </div>
          ) : <DisabledPrecisionControl selected={false} expanded={drawerState === 'expanded'} sourceLabel={editReason} />}
        </PrecisionControlDrawer>
      ) : undefined}
    >
      <section className={styles.titleSection}>
        <span className={styles.screenId}>J-02 · 자소 원형</span>
        <h1>초성 ㄱ 원형</h1>
        <EditScopeBar items={[
          { label: '현재 대상', value: '초성 ㄱ' },
          { label: '수정 범위', value: '이 자소의 원형' },
          { label: '영향', value: activeTool === 'area' ? '초성 조합 6개' : '단독·초성 조합 7개' },
        ]} />
        <ShapeStatus />
      </section>

      <div className={styles.workspaceScroll} data-saving={savingLate || undefined} aria-busy={savingLate || undefined} data-save-state={saveState}>
        <section className={styles.canvasSection} aria-label="초성 ㄱ 원형 편집 캔버스">
          <div className={styles.layerToggles} aria-label="캔버스 레이어">
            <button type="button" aria-pressed="true">결과 윤곽</button>
            <button type="button" aria-pressed="false" disabled>원본 선</button>
            <button type="button" aria-pressed="false" disabled>기준선</button>
            <button type="button" aria-pressed={areaModel.kind === 'ready' && areaModel.occupiedCellKeys.size > 0} disabled>점유 면</button>
          </div>
          {preview.kind === 'error' ? (
            <div className={styles.canvas} aria-describedby="shape-preview-error">
              <span className={styles.canvasGrid} aria-hidden="true" />
              <span id="shape-preview-error" className={styles.shapePreviewError} role="alert">{preview.message}</span>
            </div>
          ) : (
            <div className={styles.canvas} data-selected={committedModel.kind === 'ready' || undefined} ref={railCanvasRef}>
              <button type="button" className={styles.canvasSelectButton} onClick={() => setDrawerState('medium')} aria-label="ㄱ 원형 선택" />
              <span className={styles.canvasGrid} aria-hidden="true" />
              <span className={styles.lockedLayout} aria-hidden="true"><LockKeyhole size={14} />레이아웃 영역 잠금</span>
              {preview.kind === 'ready' ? (
                <FinalInkRenderer ink={preview.ink} size={340} className={styles.canvasGlyph} ariaLabel="Shape 마스터 ㄱ 최종 윤곽" />
              ) : <GlyphPreview char="ㄱ" />}
              {areaModel.kind === 'ready' && (
                <div className={styles.shapeAreaLayer} ref={areaLayerRef} aria-label="점유 면 원자 셀">
                  {areaToolActive && areaModel.cells.map((cell) => {
                    const occupied = visibleOccupiedCellKeys.has(cell.key)
                    const drafted = areaDraft?.cellKeys.includes(cell.key) ?? false
                    return (
                    <button
                      type="button"
                      key={cell.key}
                      className={styles.areaCell}
                      data-area-cell={cell.key}
                      data-occupied={occupied || undefined}
                      data-draft={drafted || undefined}
                      style={{
                        left: `${cell.x * 100}%`, top: `${cell.y * 100}%`,
                        width: `${cell.width * 100}%`, height: `${cell.height * 100}%`,
                      }}
                      aria-label={`면 셀 ${cell.row + 1}행 ${cell.column + 1}열, ${occupied ? '찬 셀' : '빈 셀'}`}
                      onPointerDown={(event) => beginAreaGesture(cell, event)}
                      onPointerMove={(event) => updateAreaDraft(event.clientX, event.clientY)}
                      onPointerUp={finishAreaGesture}
                      onPointerCancel={clearDraft}
                      onLostPointerCapture={clearDraft}
                    />
                    )
                  })}
                </div>
              )}
              {activeTool !== 'area' && committedModel.kind === 'ready' && baseModels.map(({ rail, model }) => {
                if (model.kind !== 'ready') return null
                const value = rail.coreRole === editedCoreRole ? visibleValue : model.value
                return <div
                  key={model.coreRole}
                  className={styles.canvasRailHandle}
                  data-selected={rail.coreRole === editedCoreRole || undefined}
                  data-axis={model.axis}
                  style={model.axis === 'x' ? { left: `${value * 100}%` } : { top: `${value * 100}%` }}
                  role="slider"
                  tabIndex={0}
                  aria-label={`캔버스 ${model.railLabel}`}
                  aria-valuemin={model.min}
                  aria-valuemax={model.max}
                  aria-valuenow={value}
                  aria-valuetext={`${Math.round(value * 1000)} UPM`}
                  onPointerDown={(event) => beginCanvasGesture(model, event)}
                  onPointerMove={(event) => updateCanvasDraft(model, event.clientX, event.clientY)}
                  onPointerUp={(event) => finishCanvasGesture(model, event)}
                  onPointerCancel={clearDraft}
                  onLostPointerCapture={clearDraft}
                ><span aria-hidden="true" /></div>
              })}
            </div>
          )}
        </section>

        <ContextComparisonStrip
          heading={areaToolActive ? '면이 반영되는 초성 조합 6개' : 'ㄱ이 쓰인 7개 조합 비교'}
          items={contextItems}
          observedId={observedChar}
          onObserve={(id) => setObservedChar(id as typeof observedChar)}
          description={areaToolActive
            ? '면은 CH 원형에만 저장됩니다. 단독 ㄱ은 별도 STANDALONE 원형이므로 이 비교에서 제외합니다.'
            : '카드는 역할별 Shape 파트 결과만 보여주며, 전체 음절 최종 결과를 뜻하지 않아요.'}
        />
        <div className={styles.contextActionRow}>
          <a href={`/workspace/jamo/result?char=${encodeURIComponent(observedChar)}`}>조합별 결과 확인</a>
        </div>

        <section className={styles.toolSection} aria-label="자소 제작 도구">
          <button type="button" aria-pressed={activeTool === 'select'} onClick={() => {
            clearDraft()
            setActiveTool('select')
          }}><ScanSearch size={18} />선택</button>
          <button type="button" disabled><Shapes size={18} />중심선</button>
          <button type="button" aria-pressed={activeTool === 'area'} disabled={areaModel.kind !== 'ready'} onClick={() => {
            clearDraft()
            setActiveTool('area')
            if (observedChar === 'ㄱ') setObservedChar('가')
          }}><Grid2X2 size={18} />면 채우기</button>
          <button type="button" disabled><CircleDot size={18} />레일</button>
        </section>
      </div>
      {toast && (
        <SaveToast
          tone={toast.tone}
          message={toast.message}
          onDismiss={toast.dismissable ? () => { setSaveState('idle'); setFeedback(null) } : undefined}
        />
      )}
    </MobileWorkspaceShell>
  )
}

function OverviewStatus({ role, jamoId }: { role: JamoPartRole; jamoId: string }) {
  const hydrationStatus = useShapeSystemStore((state) => state.hydrationStatus)
  const source = useShapeSystemStore((state) => state.source)
  if (hydrationStatus === 'blocked') return <span data-tone="blocked">확인 필요</span>
  if (!source) return <span>형태 시스템 연결 전</span>
  const master = source.roleSources[role].masters.find((item) => item.jamoId === jamoId)
  if (!master) return <span>저장된 마스터 없음</span>
  const elements = Object.values(master.construction.channels).reduce((count, channel) => count + (channel?.elements.length ?? 0), 0)
  const variants = master.contextVariants?.length ?? 0
  return <span data-tone="connected">마스터 있음 · 요소 {elements} · 직접 보정 {variants}</span>
}

function OverviewScreen() {
  const hydrationStatus = useShapeSystemStore((state) => state.hydrationStatus)
  const source = useShapeSystemStore((state) => state.source)
  const connectedMasters = source
    ? Object.entries(source.roleSources).flatMap(([role, scope]) => scope.masters.map((master) => ({ role: role as JamoPartRole, master })))
    : []

  return (
    <MobileWorkspaceShell activeArea="jamo">
      <section className={styles.titleSection}>
        <span className={styles.screenId}>J-01 · 자소 현황</span>
        <h1>자소 현황</h1>
        <p className={styles.titleDescription}>역할별로 저장된 마스터와 직접 보정 문맥을 확인합니다.</p>
        <ShapeStatus />
      </section>
      <div className={styles.workspaceScroll}>
        {hydrationStatus === 'ready' && source ? (
          <section className={styles.jamoListSection} aria-labelledby="saved-masters-heading">
            <div className={styles.overviewHeading}><span>저장된 원본</span><h2 id="saved-masters-heading">역할별 마스터 {connectedMasters.length}개</h2></div>
            <ul className={styles.jamoList}>
              {connectedMasters.map(({ role, master }) => {
                const channel = Object.values(master.construction.channels).find(Boolean)
                const elementCount = channel?.elements.length ?? 0
                return (
                  <li key={master.id}>
                    <div className={styles.jamoPreview}><GlyphPreview char={master.jamoId} compact /></div>
                    <div><strong>{ROLE_LABELS[role]} {master.jamoId}</strong><span>저장 요소 {elementCount}개 · 직접 보정 {master.contextVariants?.length ?? 0}개</span></div>
                    {role === 'CH' && master.jamoId === 'ㄱ'
                      ? <a href="/workspace/jamo/master">원형 보기</a>
                      : <button type="button" disabled>화면 연결 전</button>}
                  </li>
                )
              })}
            </ul>
          </section>
        ) : (
          <section className={styles.jamoListSection} aria-labelledby="representative-heading">
            <div className={styles.overviewHeading}><span>기존 결과 미리보기</span><h2 id="representative-heading">대표 검토 자소</h2></div>
            <p className={styles.overviewNotice}>아래 글자는 기존 렌더링 미리보기이며 Shape 마스터 상태를 뜻하지 않아요.</p>
            <ul className={styles.jamoList}>
              {REPRESENTATIVE_JAMOS.map((jamoId) => (
                <li key={jamoId}>
                  <div className={styles.jamoPreview}><GlyphPreview char={jamoId} compact /></div>
                  <div><strong>{jamoId}</strong><OverviewStatus role={jamoId === 'ㅏ' || jamoId === 'ㅙ' ? 'JU_VERTICAL' : 'CH'} jamoId={jamoId} /></div>
                  {jamoId === 'ㄱ' && hydrationStatus !== 'blocked'
                    ? <a href="/workspace/jamo/master">화면 보기</a>
                    : <button type="button" disabled>{hydrationStatus === 'blocked' ? '확인 필요' : '연결 전'}</button>}
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </MobileWorkspaceShell>
  )
}

function ContextScreen() {
  const requestedChar = new URLSearchParams(window.location.search).get('char')
  const initialChar = CONTEXTS.some(({ char }) => char === requestedChar) ? requestedChar as WorkspaceContext['char'] : '가'
  const [observedChar, setObservedChar] = useState<WorkspaceContext['char']>(initialChar)
  const [drawerState, setDrawerState] = useState<DrawerState>('collapsed')
  const [isEditing, setIsEditing] = useState(false)
  const [editedCoreRole, setEditedCoreRole] = useState<EditableCoreRole>('inner-left')
  const [draftValue, setDraftValue] = useState<number | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [feedback, setFeedback] = useState<string | null>(null)
  // 저장이 300ms를 넘겨야 흐림과 토스트를 함께 켠다. 빠른 저장에서 깜빡이지 않도록.
  const savingLate = useDelayedSaving(saveState === 'saving')
  const toast = saveToastView(saveState, feedback, savingLate)
  const railGestureRef = useRef<RailGesture | null>(null)
  const draftValueRef = useRef<number | null>(null)
  const railCanvasRef = useRef<HTMLDivElement | null>(null)
  const workspaceScrollRef = useRef<HTMLDivElement | null>(null)
  const transactionSequence = useRef(0)
  const contextItems = useContextItems()
  const active = CONTEXTS.find(({ char }) => char === observedChar) ?? CONTEXTS[1]
  const hydrationStatus = useShapeSystemStore((state) => state.hydrationStatus)
  const source = useShapeSystemStore((state) => state.source)
  const canUndo = useShapeSystemStore((state) => state.past.length > 0)
  const canRedo = useShapeSystemStore((state) => state.future.length > 0)
  const setOverride = useShapeSystemStore((state) => state.setContextCoreRailOverride)
  const removeOverride = useShapeSystemStore((state) => state.removeContextCoreRailOverride)
  const undo = useShapeSystemStore((state) => state.undo)
  const redo = useShapeSystemStore((state) => state.redo)
  const globalStyle = useEffectiveGlobalStyle(active.layoutType)
  const projectName = useUIStore((state) => state.currentProjectName) ?? '새 한글 폰트'
  const { currentProjectId, saveCurrent } = useFontProject()

  const railModels = useMemo(() => EDITABLE_CORE_RAILS.map((rail) => ({
    rail,
    model: resolveContextEditModel({
      source,
      active,
      coreRole: rail.coreRole,
      weightMultiplier: weightToMultiplier(globalStyle.weight),
      linecap: globalStyle.linecap,
      linejoin: globalStyle.linejoin,
      strokeStyle: globalStyle.strokeStyle,
    }),
  })), [active, globalStyle, source])
  const committedModel = railModels.find(({ rail }) => rail.coreRole === editedCoreRole)?.model
    ?? { kind: 'unavailable' as const, message: '편집할 기준선을 찾을 수 없습니다.' }
  const previewModel = useMemo(() => resolveContextEditModel({
    source,
    active,
    coreRole: editedCoreRole,
    draftValue: draftValue ?? undefined,
    weightMultiplier: weightToMultiplier(globalStyle.weight),
    linecap: globalStyle.linecap,
    linejoin: globalStyle.linejoin,
    strokeStyle: globalStyle.strokeStyle,
  }), [active, draftValue, editedCoreRole, globalStyle, source])
  const visibleModel = isEditing && previewModel.kind === 'ready' ? previewModel : committedModel

  useEffect(() => {
    setDraftValue(null)
    draftValueRef.current = null
    railGestureRef.current = null
  }, [observedChar, source])

  useEffect(() => {
    if (isEditing) workspaceScrollRef.current?.scrollTo({ top: 0 })
  }, [editedCoreRole, isEditing])

  const persistShapeChange = useCallback(async () => {
    setSaveState('saving')
    setFeedback(null)
    try {
      flushShapeSystemStorePersistence()
      if (currentProjectId) {
        const saved = await saveCurrent()
        if (!saved) throw new Error('프로젝트 서버 저장에 실패했습니다.')
        setFeedback('프로젝트와 기기에 저장했습니다.')
      } else {
        setFeedback('이 기기에 저장했습니다.')
      }
      setSaveState('saved')
    } catch (error) {
      setSaveState('error')
      setFeedback(error instanceof Error ? error.message : '저장하지 못했습니다.')
    }
  }, [currentProjectId, saveCurrent])

  const commitValue = useCallback((model: ReadyContextEditModel, value: number) => {
    transactionSequence.current += 1
    const result = setOverride(model.role, {
      transactionId: `shape-workspace:context:${transactionSequence.current}`,
      masterId: model.masterId,
      context: model.context,
      coreRole: model.coreRole,
      position: { kind: 'absolute', value },
    })
    if (!result.ok) {
      if (result.error.code !== 'command-failed' || !result.error.message.includes('no-op')) {
        setSaveState('error')
        setFeedback(result.error.message)
      }
      setDraftValue(null)
      draftValueRef.current = null
      return
    }
    setDraftValue(null)
    draftValueRef.current = null
    void persistShapeChange()
  }, [persistShapeChange, setOverride])

  const handleReset = () => {
    if (committedModel.kind !== 'ready' || !committedModel.hasOverride) return
    transactionSequence.current += 1
    const result = removeOverride(committedModel.role, {
      transactionId: `shape-workspace:context-reset:${transactionSequence.current}`,
      masterId: committedModel.masterId,
      context: committedModel.context,
      coreRole: committedModel.coreRole,
    })
    if (!result.ok) {
      setSaveState('error')
      setFeedback(result.error.message)
      return
    }
    setDraftValue(null)
    draftValueRef.current = null
    void persistShapeChange()
  }

  const handleHistory = (direction: 'undo' | 'redo') => {
    const result = direction === 'undo' ? undo() : redo()
    if (!result.ok) {
      setSaveState('error')
      setFeedback(result.error.message)
      return
    }
    setDraftValue(null)
    draftValueRef.current = null
    void persistShapeChange()
  }

  const handleInitialize = () => {
    const result = initializeStarterShapeSystem()
    if (!result.ok) {
      setSaveState('error')
      setFeedback(result.error.message)
      return
    }
    void persistShapeChange()
  }

  const handleObserve = (id: string) => {
    setObservedChar(id as WorkspaceContext['char'])
    setIsEditing(false)
    setDrawerState('collapsed')
    setFeedback(null)
  }


  const editReason = hydrationStatus === 'blocked'
    ? '저장 데이터를 확인한 뒤 편집할 수 있어요.'
    : !source
      ? '추천 기본 구조를 만든 뒤 바로 편집할 수 있어요.'
      : committedModel.kind === 'unavailable'
        ? committedModel.message
        : '선택한 자소와 이 조합에만 차이값을 저장합니다.'

  const handlePointerCancel = () => {
    if (!railGestureRef.current) return
    railGestureRef.current = null
    draftValueRef.current = null
    setDraftValue(null)
  }

  const updateCanvasDraft = (model: ReadyContextEditModel, clientX: number, clientY: number) => {
    const bounds = railCanvasRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return
    const pointerValue = model.axis === 'x'
      ? (clientX - bounds.left) / bounds.width
      : (clientY - bounds.top) / bounds.height
    const value = snapRailDraft(
      pointerValue,
      model.min,
      model.max,
    )
    draftValueRef.current = value
    setDraftValue(value)
  }

  const startCanvasGesture = (model: ReadyContextEditModel, event: ReactPointerEvent<HTMLDivElement>) => {
    setEditedCoreRole(model.coreRole)
    railGestureRef.current = { coreRole: model.coreRole, startValue: model.value }
    draftValueRef.current = model.value
    setDraftValue(model.value)
    event.currentTarget.setPointerCapture(event.pointerId)
    updateCanvasDraft(model, event.clientX, event.clientY)
  }

  const finishCanvasGesture = (model: ReadyContextEditModel, event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = railGestureRef.current
    if (!gesture || gesture.coreRole !== model.coreRole) return
    updateCanvasDraft(model, event.clientX, event.clientY)
    const value = draftValueRef.current ?? gesture.startValue
    railGestureRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    commitValue(model, value)
  }

  return (
    <MobileWorkspaceShell
      activeArea="jamo"
      projectName={projectName}
      history={{
        canUndo,
        canRedo,
        onUndo: () => handleHistory('undo'),
        onRedo: () => handleHistory('redo'),
      }}
      drawer={(
        <PrecisionControlDrawer
          state={drawerState}
          onStateChange={setDrawerState}
          targetLabel={`${active.char} · ${isEditing && committedModel.kind === 'ready' ? committedModel.railLabel : '관찰만'}`}
        >
          {isEditing && committedModel.kind === 'ready' ? (
            <div className={styles.railEditor}>
              <div className={styles.railChoices} aria-label="편집할 기준선">
                {EDITABLE_CORE_RAILS.map((rail) => (
                  <button
                    type="button"
                    key={rail.coreRole}
                    aria-pressed={editedCoreRole === rail.coreRole}
                    onClick={() => {
                      railGestureRef.current = null
                      draftValueRef.current = null
                      setDraftValue(null)
                      setEditedCoreRole(rail.coreRole)
                    }}
                  >{rail.label.replace('안쪽 ', '').replace(' 기준선', '')}</button>
                ))}
              </div>
              <div className={styles.railEditorHeading}>
                <span>{committedModel.railLabel}</span>
                <output>{Math.round((draftValue ?? committedModel.value) * 1000)} UPM</output>
              </div>
              <input
                type="range"
                min={committedModel.min}
                max={committedModel.max}
                step={RAIL_EDIT_STEP}
                value={draftValue ?? committedModel.value}
                aria-label={committedModel.railLabel}
                onPointerDown={(event) => {
                  railGestureRef.current = {
                    coreRole: committedModel.coreRole,
                    startValue: committedModel.value,
                  }
                  draftValueRef.current = committedModel.value
                  event.currentTarget.setPointerCapture(event.pointerId)
                }}
                onChange={(event) => {
                  const value = Number(event.currentTarget.value)
                  draftValueRef.current = value
                  setDraftValue(value)
                }}
                onPointerUp={(event) => {
                  const gesture = railGestureRef.current
                  if (!gesture || gesture.coreRole !== committedModel.coreRole) return
                  const value = draftValueRef.current ?? gesture.startValue
                  railGestureRef.current = null
                  if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
                  commitValue(committedModel, value)
                }}
                onPointerCancel={handlePointerCancel}
                onLostPointerCapture={handlePointerCancel}
                onKeyDown={() => {
                  railGestureRef.current = {
                    coreRole: committedModel.coreRole,
                    startValue: committedModel.value,
                  }
                }}
                onKeyUp={() => {
                  const gesture = railGestureRef.current
                  if (!gesture || gesture.coreRole !== committedModel.coreRole) return
                  railGestureRef.current = null
                  commitValue(committedModel, draftValueRef.current ?? gesture.startValue)
                }}
              />
              <div className={styles.railEditorMeta}>
                <span>{visibleModel.kind === 'ready' ? visibleModel.sourceLabel : committedModel.sourceLabel}</span>
                <button type="button" disabled={!committedModel.hasOverride} onClick={handleReset}>기본값으로</button>
              </div>
            </div>
          ) : (
            <div className={styles.disabledControl} aria-disabled="true">
              <LockKeyhole size={19} />
              <strong>비교 모드에서는 값을 바꾸지 않아요</strong>
              <span>{editReason}</span>
            </div>
          )}
        </PrecisionControlDrawer>
      )}
    >
      <section className={styles.titleSection}>
        <span className={styles.screenId}>J-03 · 조합별 결과</span>
        <h1>초성 ㄱ · 조합별 결과</h1>
        <EditScopeBar items={[
          { label: '현재 대상', value: active.char },
          { label: '현재 행동', value: isEditing ? '이 조합만 보정' : '비교만' },
          { label: '영향', value: isEditing ? '현재 자소·현재 조합' : '저장 변경 없음' },
        ]} actionLabel={isEditing ? '범위 고정' : '범위 잠김'} />
        <ShapeStatus editable />
      </section>

      <div className={styles.workspaceScroll} ref={workspaceScrollRef} data-saving={savingLate || undefined} aria-busy={savingLate || undefined} data-save-state={saveState}>
        <section className={styles.resultPreview} aria-label={`${active.char} ${active.label} 결과 미리보기`} aria-live="polite">
          <div><span>{visibleModel.kind === 'ready' ? 'Shape 초성 파트 실시간 결과' : '기존 렌더링 미리보기'}</span><strong>{active.char} · {active.label}</strong></div>
          {visibleModel.kind === 'ready' ? (
            <div className={styles.resultCanvas} ref={railCanvasRef}>
              <FinalInkRenderer ink={visibleModel.ink} size={340} className={styles.canvasGlyph} ariaLabel={`${active.char} Shape 보정 미리보기`} />
              {isEditing && railModels.map(({ rail, model }) => {
                if (model.kind !== 'ready') return null
                const canvasModel = rail.coreRole === editedCoreRole && visibleModel.kind === 'ready'
                  ? visibleModel
                  : model
                return (
                  <div
                    key={model.coreRole}
                    className={styles.canvasRailHandle}
                    data-selected={rail.coreRole === editedCoreRole || undefined}
                    style={canvasModel.axis === 'x'
                      ? { left: `${canvasModel.value * 100}%` }
                      : { top: `${canvasModel.value * 100}%` }}
                    data-axis={canvasModel.axis}
                    role="slider"
                    tabIndex={0}
                    aria-label={`캔버스 ${canvasModel.railLabel}`}
                    aria-valuemin={model.min}
                    aria-valuemax={model.max}
                    aria-valuenow={canvasModel.value}
                    aria-valuetext={`${Math.round(canvasModel.value * 1000)} UPM`}
                    onPointerDown={(event) => startCanvasGesture(model, event)}
                    onPointerMove={(event) => {
                      if (railGestureRef.current?.coreRole === model.coreRole) updateCanvasDraft(model, event.clientX, event.clientY)
                    }}
                    onPointerUp={(event) => finishCanvasGesture(model, event)}
                    onPointerCancel={handlePointerCancel}
                    onLostPointerCapture={handlePointerCancel}
                    onKeyDown={(event) => {
                      const negativeKey = model.axis === 'x' ? 'ArrowLeft' : 'ArrowUp'
                      const positiveKey = model.axis === 'x' ? 'ArrowRight' : 'ArrowDown'
                      if (event.key !== negativeKey && event.key !== positiveKey) return
                      event.preventDefault()
                      setEditedCoreRole(model.coreRole)
                      if (!railGestureRef.current) {
                        railGestureRef.current = { coreRole: model.coreRole, startValue: model.value }
                        draftValueRef.current = model.value
                      }
                      const direction = event.key === negativeKey ? -1 : 1
                      const value = snapRailDraft(
                        (draftValueRef.current ?? model.value) + direction * RAIL_EDIT_STEP,
                        model.min,
                        model.max,
                      )
                      draftValueRef.current = value
                      setDraftValue(value)
                    }}
                    onKeyUp={(event) => {
                      const validKeys = model.axis === 'x'
                        ? ['ArrowLeft', 'ArrowRight']
                        : ['ArrowUp', 'ArrowDown']
                      if (!validKeys.includes(event.key)) return
                      const gesture = railGestureRef.current
                      if (!gesture || gesture.coreRole !== model.coreRole) return
                      railGestureRef.current = null
                      commitValue(model, draftValueRef.current ?? gesture.startValue)
                    }}
                  >
                    <span aria-hidden="true" />
                  </div>
                )
              })}
            </div>
          ) : <GlyphPreview char={active.char} />}
          <p>{visibleModel.kind === 'ready'
            ? isEditing
              ? '파란 기준선을 직접 끌거나 아래 정밀 조절을 사용하세요. 손을 떼기 전에는 저장하지 않아요.'
              : '현재 초성 파트의 기준선 변화를 보여줍니다. 손을 떼기 전에는 저장하지 않아요.'
            : '형태 시스템을 시작하기 전에는 기존 글자 결과를 보여줍니다.'}</p>
        </section>
        <ContextComparisonStrip
          heading="ㄱ이 쓰인 7개 조합 비교"
          items={contextItems}
          observedId={observedChar}
          onObserve={handleObserve}
          description={isEditing
            ? '현재 카드는 이 자소·이 조합 보정 범위로 잠겨 있어요.'
            : '카드를 보는 것만으로는 보정 데이터를 만들지 않아요.'}
        />
        <div className={styles.reviewActions}>
          <a href="/workspace/jamo/master">원형 보기</a>
          {!source && hydrationStatus === 'ready' ? (
            <button type="button" onClick={handleInitialize}>추천 기본 구조로 시작</button>
          ) : (
            <button
              type="button"
              disabled={hydrationStatus === 'blocked' || committedModel.kind !== 'ready'}
              aria-describedby="context-edit-disabled"
              onClick={() => { setIsEditing(true); setDrawerState('medium') }}
            >이 조합만 보정</button>
          )}
        </div>
        <p id="context-edit-disabled" className={styles.disabledReason}>{editReason}</p>
      </div>
      {toast && (
        <SaveToast
          tone={toast.tone}
          message={toast.message}
          onDismiss={toast.dismissable ? () => { setSaveState('idle'); setFeedback(null) } : undefined}
        />
      )}
    </MobileWorkspaceShell>
  )
}

function NotFoundScreen(): ReactNode {
  return (
    <MobileWorkspaceShell activeArea="jamo">
      <section className={styles.notFound} role="alert">
        <span className={styles.screenId}>WORKSPACE</span>
        <h1>작업 화면을 찾을 수 없어요</h1>
        <p>잘못된 주소를 문장 보정 화면으로 숨기지 않았습니다.</p>
        <a href="/workspace/jamos">자소 현황으로 이동</a>
      </section>
    </MobileWorkspaceShell>
  )
}

/** 자소 탭. 문장에서 글자를 골라 획을 직접 편집한다. 칸(레이아웃)은 뼈대 탭 몫. */
function JamoEditorScreen() {
  return <CalibrationSentenceEditor chrome="workspace" />
}

/** 뼈대 탭은 없앴다(글자에 닿지 않던 화면). 옛 주소는 자소 탭으로 넘긴다. */
function LegacySkeletonRedirect() {
  useEffect(() => { window.location.replace('/workspace/jamo') }, [])
  return null
}

export function ShapeWorkspacePage() {
  if (window.location.pathname === '/workspace/skeleton') return <LegacySkeletonRedirect />
  if (window.location.pathname === '/workspace/jamos') return <OverviewScreen />
  if (window.location.pathname === '/workspace/jamo/result') return <ContextScreen />
  if (window.location.pathname === '/workspace/jamo/master') return <MasterScreen />
  if (window.location.pathname === '/workspace/jamo') return <JamoEditorScreen />
  return <NotFoundScreen />
}
