import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { CircleDot, Grid2X2, LockKeyhole, ScanSearch, Shapes } from 'lucide-react'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
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
import { setSevenContextBaseAreaCellV1 } from '../src/services/baseMasterAreaCommandsV1'
import { partForJamoRole } from '../src/services/jamoContextRoles'
import { projectPartGridToSlot } from '../src/services/partGridSlotProjection'
import { resolveRailGrid } from '../src/services/railGridResolver'
import { parseLayoutGridSystemSourceV1 } from '../src/services/layoutGridSystemSourceV1'
import { resolveAllGridBoundSchemas } from '../src/services/layoutGridProjection'
import { setLayoutGridRailV1 } from '../src/services/layoutGridRailCommandsV1'
import { parseShapeSystemSourceV2 } from '../src/services/shapeSystemSourceV2'
import { useGlobalStyleStore, weightToMultiplier } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { useLayoutStore } from '../src/stores/layoutStore'
import {
  flushShapeSystemStorePersistence,
  initializeStarterShapeSystem,
  useShapeSystemStore,
} from '../src/stores/shapeSystemStore'
import { useUIStore } from '../src/stores/uiStore'
import { useFontProject } from '../src/hooks/useFontProject'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { calculateRawBoxes } from '../src/utils/layoutCalculator'
import type {
  ContextGridPresetCatalogV1,
  CoreRailRole,
  DeepReadonly,
  GridCellRef,
  JamoPartRole,
  JamoVariantContext,
  LayoutSchema,
  LayoutType,
  Padding,
  Part,
  ShapeSystemSourceV2,
  SharedLayoutType,
  SetSevenContextBaseAreaCellV1Command,
} from '../src/types'
import { SHARED_LAYOUT_TYPES } from '../src/types'
import {
  ContextComparisonStrip,
  EditScopeBar,
  MobileWorkspaceShell,
  PrecisionControlDrawer,
  type ComparisonItem,
  type DrawerState,
} from './workspace/WorkspaceChrome'
import styles from './ShapeWorkspacePage.module.css'

const CONTEXTS = [
  { char: 'ㄱ', label: '단독', role: 'STANDALONE', context: { baseContext: 'choseong-only' } },
  { char: '가', label: '세로모음', role: 'CH', context: { baseContext: 'vertical' } },
  { char: '고', label: '가로모음', role: 'CH', context: { baseContext: 'horizontal' } },
  { char: '과', label: '혼합모음', role: 'CH', context: { baseContext: 'mixed' } },
  { char: '각', label: '세로+받침', role: 'CH', context: { baseContext: 'vertical-with-jongseong' } },
  { char: '곡', label: '가로+받침', role: 'CH', context: { baseContext: 'horizontal-with-jongseong' } },
  { char: '곽', label: '혼합+받침', role: 'CH', context: { baseContext: 'mixed-with-jongseong' } },
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
const LAYOUT_SLOT_PARTS = ['CH', 'JU', 'JU_H', 'JU_V', 'JO'] as const satisfies readonly Part[]
const SHARED_LAYOUT_LABELS: Record<SharedLayoutType, string> = {
  'choseong-only': '단독',
  'choseong-jungseong-vertical': '세로',
  'choseong-jungseong-horizontal': '가로',
  'choseong-jungseong-mixed': '혼합',
  'choseong-jungseong-vertical-jongseong': '세로+받침',
  'choseong-jungseong-horizontal-jongseong': '가로+받침',
  'choseong-jungseong-mixed-jongseong': '혼합+받침',
}

function withEffectivePadding(
  schema: LayoutSchema,
  globalPadding: Padding,
  override: Partial<Padding> | undefined,
): LayoutSchema {
  const padding = { ...globalPadding, ...override }
  return { ...schema, padding, designBodyPadding: padding }
}

function GlyphPreview({ char, compact = false }: { char: string; compact?: boolean }) {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const globalStyle = useGlobalStyleStore((state) => state.style)
  const syllable = useMemo(
    () => decomposeSyllable(char, choseong, jungseong, jongseong),
    [char, choseong, jungseong, jongseong],
  )
  const schema = withEffectivePadding(
    schemas[syllable.layoutType],
    globalPadding,
    paddingOverrides[syllable.layoutType],
  )

  return (
    <SvgRenderer
      syllable={syllable}
      schema={schema}
      size={compact ? 68 : 340}
      className={compact ? styles.cardGlyph : styles.canvasGlyph}
      globalStyle={globalStyle}
      overflow="visible"
      clipGlyphs={false}
    />
  )
}

/** 저장하지 않은 공통 layout Rail draft도 이 미리보기에는 즉시 투영한다. */
function DerivedSchemaGlyphPreview({ char, schema, compact = false }: {
  char: string
  schema: LayoutSchema
  compact?: boolean
}) {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const globalStyle = useGlobalStyleStore((state) => state.style)
  const syllable = useMemo(
    () => decomposeSyllable(char, choseong, jungseong, jongseong),
    [char, choseong, jungseong, jongseong],
  )
  return <SvgRenderer
    syllable={syllable}
    schema={schema}
    size={compact ? 68 : 340}
    className={compact ? styles.cardGlyph : styles.canvasGlyph}
    globalStyle={globalStyle}
    overflow="visible"
    clipGlyphs={false}
  />
}

type ShapeMasterPreviewState =
  | { kind: 'legacy' }
  | { kind: 'error'; message: string }
  | { kind: 'ready'; ink: FinalGlyphInk }

/** J-02에서는 실제 CH ㄱ 마스터가 있을 때만 공통 Shape final regions를 해석한다. */
function useShapeMasterPreview(source: DeepReadonly<ShapeSystemSourceV2> | null): ShapeMasterPreviewState {
  const globalStyle = useGlobalStyleStore((state) => state.style)
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
const BASE_AREA_ELEMENT_IDS = {
  STANDALONE: 'j02:area:STANDALONE:giyeok:primary',
  CH: 'j02:area:CH:giyeok:primary',
} as const

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
  cells: {
    STANDALONE: Omit<GridCellRef, 'id'>
    CH: Omit<GridCellRef, 'id'>
  }
}

type BaseAreaEditModel =
  | { kind: 'unavailable'; message: string }
  | {
    kind: 'ready'
    masterIds: { STANDALONE: string; CH: string }
    cells: BaseAreaCellModel[]
    currentCellKey: string | null
    hasArea: boolean
  }

type BaseAreaGesture = {
  mode: 'create' | 'move'
  startClientX: number
  startClientY: number
  startCellKey: string
  draftCellKey: string
  moved: boolean
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

function resolveBaseAreaEditModel(source: DeepReadonly<ShapeSystemSourceV2> | null): BaseAreaEditModel {
  if (!source) return { kind: 'unavailable', message: '형태 시스템을 먼저 시작해야 합니다.' }
  const parsed = parseShapeSystemSourceV2(source)
  if (!parsed.ok) return { kind: 'unavailable', message: '현재 자소 원본을 안전하게 편집할 수 없습니다.' }
  const masterIds = {
    STANDALONE: createJamoRoleMasterId('ㄱ', 'STANDALONE'),
    CH: createJamoRoleMasterId('ㄱ', 'CH'),
  }
  const masters = {
    STANDALONE: parsed.source.roleSources.STANDALONE.masters.find(({ id }) => id === masterIds.STANDALONE),
    CH: parsed.source.roleSources.CH.masters.find(({ id }) => id === masterIds.CH),
  }
  if (!masters.STANDALONE || !masters.CH) {
    return { kind: 'unavailable', message: '단독·초성 ㄱ 원형을 모두 찾을 수 없습니다.' }
  }
  const channels = {
    STANDALONE: masters.STANDALONE.construction.channels.main,
    CH: masters.CH.construction.channels.main,
  }
  if (!channels.STANDALONE || !channels.CH) {
    return { kind: 'unavailable', message: '단독·초성 ㄱ의 main channel을 찾을 수 없습니다.' }
  }
  const elements = {
    STANDALONE: channels.STANDALONE.elements.find(({ id }) => id === BASE_AREA_ELEMENT_IDS.STANDALONE),
    CH: channels.CH.elements.find(({ id }) => id === BASE_AREA_ELEMENT_IDS.CH),
  }
  const hasStandalone = Boolean(elements.STANDALONE)
  const hasCh = Boolean(elements.CH)
  if (hasStandalone !== hasCh) {
    return { kind: 'unavailable', message: '단독·초성 면 소유 상태가 달라 안전하게 편집할 수 없습니다.' }
  }
  if ((elements.STANDALONE && (elements.STANDALONE.kind !== 'area'
    || elements.STANDALONE.filledCells.length !== 1 || elements.STANDALONE.boundaryTreatments.length !== 0))
    || (elements.CH && (elements.CH.kind !== 'area'
      || elements.CH.filledCells.length !== 1 || elements.CH.boundaryTreatments.length !== 0))) {
    return { kind: 'unavailable', message: '첫 면 편집 흐름은 곡률·사선이 없는 단일 셀만 지원합니다.' }
  }
  const resolvedCh = resolveRailGrid(parsed.source.roleSources.CH.grid)
  if (!resolvedCh.ok) return { kind: 'unavailable', message: '초성 기준선 위치를 해석할 수 없습니다.' }
  const standaloneGrid = parsed.source.roleSources.STANDALONE.grid
  const standaloneX = new Map(standaloneGrid.xRails.map((rail, index) => [rail.coreRole, { rail, index }]))
  const standaloneY = new Map(standaloneGrid.yRails.map((rail, index) => [rail.coreRole, { rail, index }]))
  const cells: BaseAreaCellModel[] = []
  for (let row = 0; row < resolvedCh.grid.yRails.length - 1; row += 1) {
    const top = resolvedCh.grid.yRails[row]
    const bottom = resolvedCh.grid.yRails[row + 1]
    if (!top.coreRole || !bottom.coreRole) continue
    const standaloneTop = standaloneY.get(top.coreRole)
    const standaloneBottom = standaloneY.get(bottom.coreRole)
    if (!standaloneTop || !standaloneBottom || standaloneBottom.index !== standaloneTop.index + 1) continue
    for (let column = 0; column < resolvedCh.grid.xRails.length - 1; column += 1) {
      // 첫 면 수직 조각은 ㄱ 가로획과 실제로 겹치는 상단 중앙 두 셀만 노출한다.
      if (row !== 0 || (column !== 1 && column !== 2)) continue
      const left = resolvedCh.grid.xRails[column]
      const right = resolvedCh.grid.xRails[column + 1]
      if (!left.coreRole || !right.coreRole) continue
      const standaloneLeft = standaloneX.get(left.coreRole)
      const standaloneRight = standaloneX.get(right.coreRole)
      if (!standaloneLeft || !standaloneRight || standaloneRight.index !== standaloneLeft.index + 1) continue
      cells.push({
        key: `${left.coreRole}:${right.coreRole}:${top.coreRole}:${bottom.coreRole}`,
        column,
        row,
        x: left.value,
        y: top.value,
        width: right.value - left.value,
        height: bottom.value - top.value,
        cells: {
          CH: {
            leftRailId: left.id,
            rightRailId: right.id,
            topRailId: top.id,
            bottomRailId: bottom.id,
          },
          STANDALONE: {
            leftRailId: standaloneLeft.rail.id,
            rightRailId: standaloneRight.rail.id,
            topRailId: standaloneTop.rail.id,
            bottomRailId: standaloneBottom.rail.id,
          },
        },
      })
    }
  }
  if (cells.length === 0) return { kind: 'unavailable', message: '두 역할이 공유하는 원자 셀을 찾을 수 없습니다.' }
  let currentCellKey: string | null = null
  const standaloneArea = elements.STANDALONE?.kind === 'area' ? elements.STANDALONE : null
  const chArea = elements.CH?.kind === 'area' ? elements.CH : null
  if (standaloneArea && chArea) {
    currentCellKey = cells.find((cell) =>
      sameAreaCell(standaloneArea.filledCells[0], cell.cells.STANDALONE)
      && sameAreaCell(chArea.filledCells[0], cell.cells.CH),
    )?.key ?? null
    if (!currentCellKey) {
      return { kind: 'unavailable', message: '단독·초성 면이 같은 의미의 원자 셀에 있지 않습니다.' }
    }
  }
  return { kind: 'ready', masterIds, cells, currentCellKey, hasArea: hasStandalone && hasCh }
}

function areaCommand(
  model: Extract<BaseAreaEditModel, { kind: 'ready' }>,
  mode: 'create' | 'move',
  cell: BaseAreaCellModel,
  transactionId: string,
): SetSevenContextBaseAreaCellV1Command {
  return {
    transactionId,
    mode,
    jamoId: 'ㄱ',
    targets: {
      STANDALONE: {
        masterId: model.masterIds.STANDALONE,
        elementId: BASE_AREA_ELEMENT_IDS.STANDALONE,
        cell: cell.cells.STANDALONE,
      },
      CH: {
        masterId: model.masterIds.CH,
        elementId: BASE_AREA_ELEMENT_IDS.CH,
        cell: cell.cells.CH,
      },
    },
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
  const globalStyle = useGlobalStyleStore((state) => state.style)
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

function useShapeContextItems(source: DeepReadonly<ShapeSystemSourceV2> | null): ComparisonItem[] {
  return useMemo(() => CONTEXTS.map((context) => ({
    id: context.char,
    label: context.char,
    detail: context.label,
    preview: <ShapePartPreview context={context} source={source} />,
  })), [source])
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
  const [areaSelected, setAreaSelected] = useState(false)
  const [editedCoreRole, setEditedCoreRole] = useState<EditableCoreRole>('inner-left')
  const [draftValue, setDraftValue] = useState<number | null>(null)
  const [draftAreaCellKey, setDraftAreaCellKey] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [feedback, setFeedback] = useState<string | null>(null)
  const railCanvasRef = useRef<HTMLDivElement | null>(null)
  const areaLayerRef = useRef<HTMLDivElement | null>(null)
  const railGestureRef = useRef<BaseRailGesture | null>(null)
  const areaGestureRef = useRef<BaseAreaGesture | null>(null)
  const draftValueRef = useRef<number | null>(null)
  const transactionSequence = useRef(0)
  const hydrationStatus = useShapeSystemStore((state) => state.hydrationStatus)
  const source = useShapeSystemStore((state) => state.source)
  const setBaseRail = useShapeSystemStore((state) => state.setSevenContextBaseCoreRail)
  const setBaseAreaCell = useShapeSystemStore((state) => state.setSevenContextBaseAreaCell)
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
    if (!source || areaModel.kind !== 'ready' || !draftAreaCellKey) return railDraftSource
    const cell = areaModel.cells.find(({ key }) => key === draftAreaCellKey)
    if (!cell) return railDraftSource
    const result = setSevenContextBaseAreaCellV1(source, areaCommand(
      areaModel,
      areaModel.hasArea ? 'move' : 'create',
      cell,
      'shape-workspace:area-draft',
    ))
    return result.ok ? result.source : railDraftSource
  }, [areaModel, draftAreaCellKey, railDraftSource, source])
  const preview = useShapeMasterPreview(draftSource)
  const contextItems = useShapeContextItems(draftSource)
  const visibleValue = draftValue ?? (committedModel.kind === 'ready' ? committedModel.value : 0)
  const visibleAreaCell = areaModel.kind === 'ready'
    ? areaModel.cells.find(({ key }) => key === (draftAreaCellKey ?? areaModel.currentCellKey)) ?? null
    : null

  useEffect(() => {
    railGestureRef.current = null
    areaGestureRef.current = null
    draftValueRef.current = null
    setDraftValue(null)
    setDraftAreaCellKey(null)
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
    setDraftAreaCellKey(null)
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

  const commitAreaCell = useCallback((
    model: Extract<BaseAreaEditModel, { kind: 'ready' }>,
    mode: 'create' | 'move',
    cell: BaseAreaCellModel,
  ) => {
    transactionSequence.current += 1
    const result = setBaseAreaCell(areaCommand(
      model,
      mode,
      cell,
      `shape-workspace:base-area:${transactionSequence.current}`,
    ))
    if (!result.ok) {
      setSaveState('error')
      setFeedback(result.error.message)
      clearDraft()
      return
    }
    clearDraft()
    setAreaSelected(true)
    setActiveTool('select')
    setDrawerState('medium')
    void persistShapeChange()
  }, [clearDraft, persistShapeChange, setBaseAreaCell])

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
    setAreaSelected(false)
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

  const areaCellAtPointer = useCallback((clientX: number, clientY: number): BaseAreaCellModel | null => {
    if (areaModel.kind !== 'ready') return null
    const bounds = areaLayerRef.current?.getBoundingClientRect()
    if (!bounds || bounds.width <= 0 || bounds.height <= 0) return null
    const x = (clientX - bounds.left) / bounds.width
    const y = (clientY - bounds.top) / bounds.height
    return areaModel.cells.find((cell) => x >= cell.x && x <= cell.x + cell.width
      && y >= cell.y && y <= cell.y + cell.height) ?? null
  }, [areaModel])

  const beginAreaGesture = (
    mode: 'create' | 'move',
    cell: BaseAreaCellModel,
    event: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    clearDraft()
    setAreaSelected(mode === 'move')
    setDrawerState('medium')
    const gesture: BaseAreaGesture = {
      mode,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startCellKey: cell.key,
      draftCellKey: cell.key,
      moved: false,
    }
    areaGestureRef.current = gesture
    setDraftAreaCellKey(cell.key)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  const updateAreaDraft = (clientX: number, clientY: number) => {
    const gesture = areaGestureRef.current
    if (!gesture) return
    const cell = areaCellAtPointer(clientX, clientY)
    if (!cell) return
    const distance = Math.hypot(clientX - gesture.startClientX, clientY - gesture.startClientY)
    if (distance >= 3 && cell.key !== gesture.startCellKey) gesture.moved = true
    gesture.draftCellKey = cell.key
    setDraftAreaCellKey(cell.key)
  }

  const finishAreaGesture = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const gesture = areaGestureRef.current
    if (!gesture || areaModel.kind !== 'ready') return
    updateAreaDraft(event.clientX, event.clientY)
    areaGestureRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const cell = areaModel.cells.find(({ key }) => key === gesture.draftCellKey)
    if (!cell) {
      clearDraft()
      return
    }
    if (gesture.mode === 'create' || (gesture.moved && gesture.draftCellKey !== gesture.startCellKey)) {
      commitAreaCell(areaModel, gesture.mode, cell)
    } else {
      setAreaSelected(true)
      clearDraft()
    }
  }

  const saveLabel = saveState === 'saving'
    ? '저장 중…'
    : saveState === 'saved'
      ? currentProjectId ? '프로젝트 저장됨' : '기기에 저장됨'
      : saveState === 'error'
        ? '저장 확인 필요'
        : committedModel.kind === 'ready' ? '원형 편집' : '원형 관찰'
  const editReason = hydrationStatus === 'blocked'
    ? '저장 데이터를 확인한 뒤 편집할 수 있어요.'
    : !source
      ? '형태 시스템 연결 전에는 기존 안내 상태를 유지합니다.'
      : committedModel.kind === 'unavailable'
        ? committedModel.message
        : '단독과 초성의 같은 기준선을 한 번에 바꾸고 7개 결과에 반영합니다.'
  const areaSelectionActive = areaSelected && areaModel.kind === 'ready' && areaModel.hasArea

  return (
    <MobileWorkspaceShell
      activeArea="jamo"
      projectName={projectName}
      statusLabel={saveLabel}
      history={{ canUndo, canRedo, onUndo: () => handleHistory('undo'), onRedo: () => handleHistory('redo') }}
      drawer={(
        <PrecisionControlDrawer
          state={drawerState}
          onStateChange={setDrawerState}
          targetLabel={areaSelectionActive
            ? 'ㄱ 원형 · 점유 면'
            : committedModel.kind === 'ready' ? `ㄱ 원형 · ${committedModel.railLabel}` : '원형 관찰'}
        >
          {areaSelectionActive && visibleAreaCell ? (
            <div className={styles.areaEditor}>
              <div className={styles.railEditorHeading}>
                <span>점유 면</span>
                <output>{visibleAreaCell.row + 1}행 {visibleAreaCell.column + 1}열</output>
              </div>
              <p>선택한 원자 셀 하나를 단독·초성 ㄱ 원형에서 함께 사용합니다. 캔버스의 면을 끌어 인접 셀로 옮길 수 있어요.</p>
            </div>
          ) : committedModel.kind === 'ready' ? (
            <div className={styles.railEditor}>
              <div className={styles.railChoices} aria-label="편집할 기준선">
                {EDITABLE_CORE_RAILS.map((rail) => (
                  <button type="button" key={rail.coreRole} aria-pressed={editedCoreRole === rail.coreRole} onClick={() => {
                    clearDraft()
                    setAreaSelected(false)
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
      )}
    >
      <section className={styles.titleSection}>
        <span className={styles.screenId}>J-02 · 자소 원형</span>
        <h1>초성 ㄱ 원형</h1>
        <EditScopeBar items={[
          { label: '현재 대상', value: '초성 ㄱ' },
          { label: '수정 범위', value: '이 자소의 원형' },
          { label: '영향', value: '초성 조합 7개' },
        ]} />
        <ShapeStatus />
        {feedback && <p className={styles.saveFeedback} data-state={saveState} role={saveState === 'error' ? 'alert' : 'status'}>{feedback}</p>}
      </section>

      <div className={styles.workspaceScroll}>
        <section className={styles.canvasSection} aria-label="초성 ㄱ 원형 편집 캔버스">
          <div className={styles.layerToggles} aria-label="캔버스 레이어">
            <button type="button" aria-pressed="true">결과 윤곽</button>
            <button type="button" aria-pressed="false" disabled>원본 선</button>
            <button type="button" aria-pressed="false" disabled>기준선</button>
            <button type="button" aria-pressed={areaModel.kind === 'ready' && areaModel.hasArea} disabled>점유 면</button>
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
                  {activeTool === 'area' && !areaModel.hasArea && areaModel.cells.map((cell) => (
                    <button
                      type="button"
                      key={cell.key}
                      className={styles.areaCreateCell}
                      data-draft={draftAreaCellKey === cell.key || undefined}
                      style={{
                        left: `${cell.x * 100}%`, top: `${cell.y * 100}%`,
                        width: `${cell.width * 100}%`, height: `${cell.height * 100}%`,
                      }}
                      aria-label={`면 생성 ${cell.row + 1}행 ${cell.column + 1}열`}
                      onPointerDown={(event) => beginAreaGesture('create', cell, event)}
                      onPointerMove={(event) => updateAreaDraft(event.clientX, event.clientY)}
                      onPointerUp={finishAreaGesture}
                      onPointerCancel={clearDraft}
                      onLostPointerCapture={clearDraft}
                    />
                  ))}
                  {areaModel.hasArea && visibleAreaCell && (
                    <button
                      type="button"
                      className={styles.areaMoveHandle}
                      data-selected={areaSelectionActive || undefined}
                      data-element-id={BASE_AREA_ELEMENT_IDS.CH}
                      style={{
                        left: `${visibleAreaCell.x * 100}%`, top: `${visibleAreaCell.y * 100}%`,
                        width: `${visibleAreaCell.width * 100}%`, height: `${visibleAreaCell.height * 100}%`,
                      }}
                      aria-label="점유 면 이동"
                      onPointerDown={(event) => beginAreaGesture('move', visibleAreaCell, event)}
                      onPointerMove={(event) => updateAreaDraft(event.clientX, event.clientY)}
                      onPointerUp={finishAreaGesture}
                      onPointerCancel={clearDraft}
                      onLostPointerCapture={clearDraft}
                    ><span>면</span></button>
                  )}
                </div>
              )}
              {committedModel.kind === 'ready' && baseModels.map(({ rail, model }) => {
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
          heading="ㄱ이 쓰인 7개 조합 비교"
          items={contextItems}
          observedId={observedChar}
          onObserve={(id) => setObservedChar(id as typeof observedChar)}
          description="카드는 Shape 초성 파트 결과만 보여주며, 전체 음절 최종 결과를 뜻하지 않아요."
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
          <button type="button" aria-pressed={activeTool === 'area'} disabled={areaModel.kind !== 'ready' || areaModel.hasArea} onClick={() => {
            clearDraft()
            setAreaSelected(false)
            setActiveTool('area')
          }}><Grid2X2 size={18} />면 채우기</button>
          <button type="button" disabled><CircleDot size={18} />레일</button>
        </section>
      </div>
    </MobileWorkspaceShell>
  )
}

type LayoutRailEditModel = {
  id: string
  axis: 'x' | 'y'
  value: number
  min: number
  max: number
}

type LayoutRailGesture = {
  railId: string
  startValue: number
  startClientX: number
  startClientY: number
  moved: boolean
}

function resolveLayoutRailModels(source: DeepReadonly<ShapeSystemSourceV2> | null): {
  kind: 'unavailable'; message: string
} | { kind: 'ready'; rails: LayoutRailEditModel[] } {
  if (!source?.layoutGridSystem) return { kind: 'unavailable', message: '공통 layout grid가 아직 연결되지 않았습니다.' }
  const parsed = parseLayoutGridSystemSourceV1(source.layoutGridSystem)
  if (!parsed.ok) return { kind: 'unavailable', message: '공통 layout grid를 안전하게 해석할 수 없습니다.' }
  const sourceRails = new Map(
    [...parsed.source.grid.xRails, ...parsed.source.grid.yRails].map((rail) => [rail.id, rail]),
  )
  const rails: LayoutRailEditModel[] = []
  for (const axis of ['x', 'y'] as const) {
    const axisRails = axis === 'x' ? parsed.resolvedGrid.xRails : parsed.resolvedGrid.yRails
    for (let index = 0; index < axisRails.length; index += 1) {
      const rail = axisRails[index]
      const sourceRail = sourceRails.get(rail.id)
      if (!sourceRail || sourceRail.position.kind !== 'absolute') continue
      rails.push({
        id: rail.id,
        axis,
        value: rail.value,
        min: index === 0 ? 0 : axisRails[index - 1].value + parsed.source.grid.minGap,
        max: index === axisRails.length - 1 ? 1 : axisRails[index + 1].value - parsed.source.grid.minGap,
      })
    }
  }
  return rails.length > 0
    ? { kind: 'ready', rails }
    : { kind: 'unavailable', message: '직접 이동할 수 있는 공통 layout Rail이 없습니다.' }
}

function SharedLayoutScreen() {
  const [selectedRailId, setSelectedRailId] = useState<string | null>(null)
  const [hoveredRailId, setHoveredRailId] = useState<string | null>(null)
  const [draftValue, setDraftValue] = useState<number | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [feedback, setFeedback] = useState<string | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  const gestureRef = useRef<LayoutRailGesture | null>(null)
  const draftValueRef = useRef<number | null>(null)
  const transactionSequence = useRef(0)
  const hydrationStatus = useShapeSystemStore((state) => state.hydrationStatus)
  const source = useShapeSystemStore((state) => state.source)
  const connectLayoutGrid = useShapeSystemStore((state) => state.connectLayoutGrid)
  const setLayoutGridRail = useShapeSystemStore((state) => state.setLayoutGridRail)
  const canUndo = useShapeSystemStore((state) => state.past.length > 0)
  const canRedo = useShapeSystemStore((state) => state.future.length > 0)
  const undo = useShapeSystemStore((state) => state.undo)
  const redo = useShapeSystemStore((state) => state.redo)
  const projectName = useUIStore((state) => state.currentProjectName) ?? '새 한글 폰트'
  const { currentProjectId, saveCurrent } = useFontProject()
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const effectiveSchemas = useMemo(() => Object.fromEntries(
    Object.entries(schemas).map(([layoutType, schema]) => [
      layoutType,
      withEffectivePadding(schema, globalPadding, paddingOverrides[layoutType as LayoutType]),
    ]),
  ) as Record<LayoutType, LayoutSchema>, [globalPadding, paddingOverrides, schemas])
  const committed = useMemo(() => resolveLayoutRailModels(source), [source])
  const selected = committed.kind === 'ready'
    ? committed.rails.find((rail) => rail.id === selectedRailId) ?? committed.rails[0]
    : null
  const draftSource = useMemo(() => {
    if (!source || !selected || draftValue === null) return source
    const result = setLayoutGridRailV1(source, {
      transactionId: 'shape-workspace:layout-draft',
      railId: selected.id,
      position: { kind: 'absolute', value: draftValue },
    })
    return result.ok ? result.source : source
  }, [draftValue, selected, source])
  const visible = useMemo(() => resolveLayoutRailModels(draftSource), [draftSource])
  const projectedSchemas = useMemo(() => {
    if (!draftSource?.layoutGridSystem) return effectiveSchemas
    const parsed = parseLayoutGridSystemSourceV1(draftSource.layoutGridSystem)
    if (!parsed.ok) return effectiveSchemas
    const projection = resolveAllGridBoundSchemas({
      schemas: effectiveSchemas,
      grid: parsed.resolvedGrid,
      bindings: parsed.source.bindings,
    })
    return projection.ok ? projection.schemas : effectiveSchemas
  }, [draftSource, effectiveSchemas])
  const contextItems = useMemo(() => CONTEXTS.map((context) => {
    const layoutType = decomposeSyllable(context.char, choseong, jungseong, jongseong).layoutType
    return {
      id: context.char,
      label: context.char,
      detail: context.label,
      preview: <DerivedSchemaGlyphPreview char={context.char} compact schema={projectedSchemas[layoutType]} />,
    }
  }), [choseong, jungseong, jongseong, projectedSchemas])
  const committedRails = useMemo(() => {
    const model = resolveLayoutRailModels(source)
    return model.kind === 'ready' ? model.rails : []
  }, [source])
  const visibleRails = useMemo(() => {
    const model = resolveLayoutRailModels(draftSource)
    return model.kind === 'ready' ? model.rails : []
  }, [draftSource])

  const clearDraft = useCallback(() => {
    gestureRef.current = null
    draftValueRef.current = null
    setDraftValue(null)
  }, [])
  const persistShapeChange = useCallback(async () => {
    setSaveState('saving')
    setFeedback(null)
    try {
      flushShapeSystemStorePersistence()
      if (currentProjectId && !(await saveCurrent())) throw new Error('프로젝트 서버 저장에 실패했습니다.')
      setSaveState('saved')
      setFeedback(currentProjectId ? '프로젝트와 기기에 저장했습니다.' : '이 기기에 저장했습니다.')
    } catch (error) {
      setSaveState('error')
      setFeedback(error instanceof Error ? error.message : '저장하지 못했습니다.')
    }
  }, [currentProjectId, saveCurrent])
  const commit = useCallback((rail: LayoutRailEditModel, value: number) => {
    if (Math.abs(value - rail.value) < 0.000001) return clearDraft()
    transactionSequence.current += 1
    const result = setLayoutGridRail({
      transactionId: `shape-workspace:layout:${transactionSequence.current}`,
      railId: rail.id,
      position: { kind: 'absolute', value },
    })
    if (!result.ok) {
      setSaveState('error')
      setFeedback(result.error.message)
      return clearDraft()
    }
    clearDraft()
    void persistShapeChange()
  }, [clearDraft, persistShapeChange, setLayoutGridRail])
  const beginGesture = (rail: LayoutRailEditModel, event: ReactPointerEvent<HTMLDivElement>) => {
    setSelectedRailId(rail.id)
    setHoveredRailId(rail.id)
    gestureRef.current = { railId: rail.id, startValue: rail.value, startClientX: event.clientX, startClientY: event.clientY, moved: false }
    draftValueRef.current = null
    setDraftValue(null)
    event.currentTarget.setPointerCapture(event.pointerId)
  }
  const railAtPointer = useCallback((clientX: number, clientY: number): LayoutRailEditModel | null => {
    const bounds = canvasRef.current?.getBoundingClientRect()
    if (!bounds) return null
    const closest = committedRails.reduce<{ rail: LayoutRailEditModel; distance: number } | null>((nearest, rail) => {
      const coordinate = rail.axis === 'x'
        ? bounds.left + bounds.width * rail.value
        : bounds.top + bounds.height * rail.value
      const pointer = rail.axis === 'x' ? clientX : clientY
      const candidate = { rail, distance: Math.abs(pointer - coordinate) }
      return !nearest || candidate.distance < nearest.distance ? candidate : nearest
    }, null)
    return closest && closest.distance <= 22 ? closest.rail : null
  }, [committedRails])
  const updateDraft = (rail: LayoutRailEditModel, clientX: number, clientY: number) => {
    const gesture = gestureRef.current
    const bounds = canvasRef.current?.getBoundingClientRect()
    if (!gesture || gesture.railId !== rail.id || !bounds) return
    const distance = rail.axis === 'x' ? clientX - gesture.startClientX : clientY - gesture.startClientY
    const length = rail.axis === 'x' ? bounds.width : bounds.height
    if (!gesture.moved && Math.abs(distance) < 3) return
    gesture.moved = true
    const value = snapRailDraft(gesture.startValue + distance / length, rail.min, rail.max)
    draftValueRef.current = value
    setDraftValue(value)
  }
  const finishGesture = (rail: LayoutRailEditModel, event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (!gesture || gesture.railId !== rail.id) return
    updateDraft(rail, event.clientX, event.clientY)
    gestureRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    const committedRail = committed.kind === 'ready'
      ? committed.rails.find((candidate) => candidate.id === rail.id)
      : undefined
    if (gesture.moved && committedRail) commit(committedRail, draftValueRef.current ?? gesture.startValue)
    else clearDraft()
  }
  const handleCanvasPointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    if (gesture) {
      const rail = committedRails.find((candidate) => candidate.id === gesture.railId)
      if (rail) updateDraft(rail, event.clientX, event.clientY)
      return
    }
    setHoveredRailId(railAtPointer(event.clientX, event.clientY)?.id ?? null)
  }
  const handleCanvasPointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rail = railAtPointer(event.clientX, event.clientY)
    if (rail) beginGesture(rail, event)
  }
  const handleCanvasPointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current
    const rail = gesture && committedRails.find((candidate) => candidate.id === gesture.railId)
    if (rail) finishGesture(rail, event)
  }
  const cancelCanvasGesture = () => {
    setHoveredRailId(null)
    clearDraft()
  }
  const handleConnect = () => {
    const result = connectLayoutGrid({ transactionId: 'shape-workspace:connect-layout', schemas: effectiveSchemas })
    if (!result.ok) { setSaveState('error'); setFeedback(result.error.message); return }
    void persistShapeChange()
  }
  const handleInitialize = () => {
    const result = initializeStarterShapeSystem()
    if (!result.ok) { setSaveState('error'); setFeedback(result.error.message); return }
    void persistShapeChange()
  }
  const handleHistory = (direction: 'undo' | 'redo') => {
    const result = direction === 'undo' ? undo() : redo()
    if (!result.ok) { setSaveState('error'); setFeedback(result.error.message); return }
    clearDraft()
    void persistShapeChange()
  }
  const saveLabel = saveState === 'saving' ? '저장 중…'
    : saveState === 'saved' ? currentProjectId ? '프로젝트 저장됨' : '기기에 저장됨'
      : saveState === 'error' ? '저장 확인 필요' : selected ? '공통 기준선 편집' : '공통 기준선 관찰'
  const layoutOverlays = useMemo(() => SHARED_LAYOUT_TYPES.map((layoutType) => ({
    layoutType,
    boxes: calculateRawBoxes(projectedSchemas[layoutType]),
  })), [projectedSchemas])

  return (
    <MobileWorkspaceShell
      activeArea="skeleton"
      projectName={projectName}
      statusLabel={saveLabel}
      history={{ canUndo, canRedo, onUndo: () => handleHistory('undo'), onRedo: () => handleHistory('redo') }}
    >
      <section className={styles.titleSection}>
        <span className={styles.screenId}>L-01 · 공통 배치 기준선</span>
        <h1>공통 layout grid</h1>
        <EditScopeBar items={[{ label: '현재 대상', value: '공통 배치 Rail' }, { label: '수정 범위', value: '7개 layout binding' }, { label: '영향', value: '조합 결과 7개' }]} />
        <ShapeStatus />
        {feedback && <p className={styles.saveFeedback} data-state={saveState} role={saveState === 'error' ? 'alert' : 'status'}>{feedback}</p>}
      </section>
      <div className={styles.workspaceScroll}>
        {hydrationStatus === 'ready' && source?.layoutGridSystem && visible.kind === 'ready' ? <>
          <section className={styles.canvasSection} aria-label="공통 layout Rail 편집 캔버스">
            <div className={`${styles.canvas} ${styles.layoutGridCanvas}`} ref={canvasRef} data-selected={selected ? 'true' : undefined} data-hovered={hoveredRailId ? 'true' : undefined} onPointerMove={handleCanvasPointerMove} onPointerDown={handleCanvasPointerDown} onPointerUp={handleCanvasPointerUp} onPointerCancel={cancelCanvasGesture} onLostPointerCapture={cancelCanvasGesture} onPointerLeave={() => { if (!gestureRef.current) setHoveredRailId(null) }}>
              <span className={styles.canvasGrid} aria-hidden="true" />
              <svg className={styles.layoutGridOverlays} viewBox="0 0 1 1" aria-label="공통 layout grid의 7개 슬롯 경계">
                {layoutOverlays.map(({ layoutType, boxes }) => (
                  <g key={layoutType} data-layout-overlay={layoutType}>
                    <title>{SHARED_LAYOUT_LABELS[layoutType]} layout 슬롯</title>
                    {LAYOUT_SLOT_PARTS.flatMap((part) => {
                      const box = boxes[part]
                      return box ? [<rect key={part} data-part={part} x={box.x} y={box.y} width={box.width} height={box.height} />] : []
                    })}
                  </g>
                ))}
              </svg>
              {visibleRails.map((rail) => <div key={rail.id} className={styles.layoutCanvasRailHandle} data-rail-id={rail.id} data-selected={rail.id === selected?.id || undefined} data-hovered={rail.id === hoveredRailId || undefined} data-axis={rail.axis} style={rail.axis === 'x' ? { left: `${rail.value * 100}%` } : { top: `${rail.value * 100}%` }} aria-hidden="true"><span /></div>)}
            </div>
            <ul className={styles.layoutOverlayLegend} aria-label="겹쳐 보이는 layout 종류">
              {SHARED_LAYOUT_TYPES.map((layoutType) => <li key={layoutType} data-layout={layoutType}>{SHARED_LAYOUT_LABELS[layoutType]}</li>)}
            </ul>
            <p className={styles.layoutCanvasHelp}>선 가까이 가면 그 Rail이 강조됩니다. 탭하면 핸들이 나타나고, 그대로 끌면 7개 결과를 임시로 보여줘요.</p>
          </section>
          <ContextComparisonStrip heading="공통 배치가 쓰이는 7개 조합" eyebrow="연결 결과" items={contextItems} observedId="가" interactive={false} description="카드는 공통 layout binding으로 다시 계산한 읽기 전용 결과예요." />
        </> : <section className={styles.layoutSetup} aria-label="공통 layout grid 연결">
          <Grid2X2 size={24} aria-hidden="true" />
          <h2>{hydrationStatus === 'blocked' ? '저장 데이터 확인이 필요해요' : !source ? '형태 시스템을 먼저 시작하세요' : '기존 배치를 공통 기준선으로 연결하세요'}</h2>
          <p>{hydrationStatus === 'blocked' ? '현재는 안전을 위해 공통 grid를 만들거나 편집하지 않아요.' : !source ? '기존 글자 결과를 바꾸지 않고, 추천 기본 구조를 먼저 준비합니다.' : '현재 7개 layout schema의 경계를 stable Rail과 binding으로 한 번만 올립니다.'}</p>
          {hydrationStatus !== 'blocked' && (!source ? <button type="button" onClick={handleInitialize}>추천 기본 구조로 시작</button> : <button type="button" onClick={handleConnect}>기존 7개 배치를 공통 기준선으로 연결</button>)}
        </section>}
      </div>
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
                      ? <a href="/workspace/jamo">원형 보기</a>
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
                    ? <a href="/workspace/jamo">화면 보기</a>
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
  const globalStyle = useGlobalStyleStore((state) => state.style)
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

  const saveLabel = saveState === 'saving'
    ? '저장 중…'
    : saveState === 'saved'
      ? currentProjectId ? '프로젝트 저장됨' : '기기에 저장됨'
      : saveState === 'error'
        ? '저장 확인 필요'
        : isEditing ? '현재 조합 보정 중' : '조합 비교'

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
      statusLabel={saveLabel}
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
        {feedback && <p className={styles.saveFeedback} data-state={saveState} role={saveState === 'error' ? 'alert' : 'status'}>{feedback}</p>}
      </section>

      <div className={styles.workspaceScroll} ref={workspaceScrollRef}>
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
          <a href="/workspace/jamo">원형 보기</a>
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

export function ShapeWorkspacePage() {
  if (window.location.pathname === '/workspace/jamos') return <OverviewScreen />
  if (window.location.pathname === '/workspace/skeleton') return <SharedLayoutScreen />
  if (window.location.pathname === '/workspace/jamo/result') return <ContextScreen />
  if (window.location.pathname === '/workspace/jamo') return <MasterScreen />
  return <NotFoundScreen />
}
