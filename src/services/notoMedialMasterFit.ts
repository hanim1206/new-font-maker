import type {
  BoxConfig,
  CoreXRailRole,
  CoreYRailRole,
  GridCenterlineElement,
  JamoPartRole,
  JamoRoleMaster,
  RailGrid,
  RoleConstructionScope,
} from '../types'
import { createEmptyJamoRoleMaster, createRoleConstructionSourceV1, expectedConstructionChannel } from './jamoConstruction'
import { CORE_X_RAIL_ROLES, CORE_Y_RAIL_ROLES, createBasePartGrid } from './railGridResolver'

/**
 * Noto 홀자 측정(역할면·가시 구간·두께)을 획(centerline) 마스터로 옮긴다.
 * 윤곽을 편집하는 게 아니라, 측정값에서 줄기·보의 중심선과 끝을 읽어
 * part-local RailGrid + GridCenterlineElement로 다시 그린다. 두께는 element에만 두고 rail은 위치만 갖는다.
 * slot = 그 홀자의 잉크 박스(em 좌표). rail 값은 (v − slot.x)/slot.w 로 part-local이 된다.
 */

export type MedialFitRole = Extract<JamoPartRole, 'JU_VERTICAL' | 'JU_HORIZONTAL' | 'JU_H' | 'JU_V'>

export interface MedialRoleMeasurement {
  face: number
  faceSide: string
  orientation: 'vertical' | 'horizontal'
  visibleSpans: readonly { from: number; to: number }[]
  visibleLength?: number
}

export interface MedialFitInput {
  jamoId: string
  role: MedialFitRole
  /** em 좌표(0~1) 역할 측정. 키 = 역할 id(outerPillar, primaryBeam …). */
  measurements: Readonly<Record<string, MedialRoleMeasurement>>
  /** 역할별 두께, em 비율(0~1). 1000u 측정이면 /1000. */
  thickness: Readonly<Record<string, number>>
  /** 없으면 0.01. 문맥 rail 최소 간격. */
  minGap?: number
}

/** 측정에서 읽은 획 하나. 좌표는 em. */
export interface FittedStroke {
  roleId: string
  orientation: 'vertical' | 'horizontal'
  /** 세로 획이면 x, 가로 획이면 y 중심선. */
  center: number
  /** 획 길이 방향 시작·끝(em). */
  from: number
  to: number
  thickness: number
}

export type CoreRailRole = CoreXRailRole | CoreYRailRole

/** 획 하나가 어느 core rail에 매였는지. rail을 옮기면 이 결속으로 획이 따라온다. */
export interface StrokeRailBinding {
  roleId: string
  orientation: 'vertical' | 'horizontal'
  thickness: number
  centerRail: CoreRailRole
  fromRail: CoreRailRole
  toRail: CoreRailRole
}

export interface MedialFitResult {
  jamoId: string
  role: MedialFitRole
  slot: BoxConfig
  strokes: FittedStroke[]
  /** core rail 역할 → em 좌표. 리포트에서 측정 face와 비교할 때 쓴다. */
  railsEm: Record<CoreRailRole, number>
  bindings: StrokeRailBinding[]
  grid: RailGrid
  master: JamoRoleMaster
  scope: RoleConstructionScope
}

export type MedialFitOutcome = { ok: true; fit: MedialFitResult } | { ok: false; message: string }

const DEFAULT_MIN_GAP = 0.01
const EPSILON = 1e-6

function strokeOf(roleId: string, m: MedialRoleMeasurement, thickness: number): FittedStroke | string {
  if (!Number.isFinite(m.face) || !Number.isFinite(thickness) || thickness <= 0) return `${roleId}: face 또는 두께가 없습니다.`
  if (!m.visibleSpans.length || m.visibleSpans.some((span) => !Number.isFinite(span.from) || !Number.isFinite(span.to) || span.to <= span.from)) return `${roleId}: 가시 구간이 없습니다.`
  // face는 잉크 바깥면이라 두께의 절반만큼 안쪽이 중심선이다. 끊긴 구간(보가 가로지른 자리)은 합집합으로 본다.
  const inward = m.orientation === 'vertical'
    ? (m.faceSide === 'right' ? -1 : m.faceSide === 'left' ? 1 : 0)
    : (m.faceSide === 'top' ? 1 : m.faceSide === 'bottom' ? -1 : 0)
  if (inward === 0) return `${roleId}: faceSide ${m.faceSide}는 ${m.orientation} 획에 맞지 않습니다.`
  return {
    roleId, orientation: m.orientation, thickness,
    center: m.face + inward * thickness / 2,
    from: Math.min(...m.visibleSpans.map((span) => span.from)),
    to: Math.max(...m.visibleSpans.map((span) => span.to)),
  }
}

/** 한 축의 필요한 값들을 core rail 5개에 순서대로 배정한다. 양끝은 outer, 안쪽은 개수에 따라 center/inner. */
function assignAxis<TRole extends string>(
  roles: readonly TRole[],
  edges: [number, number],
  interior: number[],
): { values: Record<TRole, number> } | string {
  const [lo, hi] = edges
  const unique = [...new Set(interior.map((v) => Number(v.toFixed(9))))].filter((v) => v > lo + EPSILON && v < hi - EPSILON).sort((a, b) => a - b)
  const [outerLo, innerLo, center, innerHi, outerHi] = roles
  const values = { [outerLo]: lo, [outerHi]: hi } as Record<TRole, number>
  const slots: TRole[] = unique.length === 1 ? [center] : unique.length === 2 ? [innerLo, innerHi] : unique.length === 3 ? [innerLo, center, innerHi] : []
  if (unique.length > 3) return `한 축에 필요한 안쪽 기준선이 ${unique.length}개라 core rail 5개를 넘습니다.`
  slots.forEach((role, index) => { values[role] = unique[index] })
  // 안 쓰는 core rail은 이웃 사이 중점. 순서와 minGap은 grid 검증이 다시 본다.
  for (const role of [innerLo, center, innerHi]) {
    if (values[role] !== undefined) continue
    const index = roles.indexOf(role)
    const prev = [...roles.slice(0, index)].reverse().find((r) => values[r] !== undefined)!
    const next = roles.slice(index + 1).find((r) => values[r] !== undefined)!
    values[role] = (values[prev] + values[next]) / 2
  }
  return { values }
}

export function fitNotoMedialMaster(input: MedialFitInput): MedialFitOutcome {
  const strokes: FittedStroke[] = []
  for (const [roleId, m] of Object.entries(input.measurements)) {
    const stroke = strokeOf(roleId, m, input.thickness[roleId])
    if (typeof stroke === 'string') return { ok: false, message: stroke }
    strokes.push(stroke)
  }
  if (!strokes.length) return { ok: false, message: '홀자 측정이 비어 있습니다.' }

  // slot = 획 중심선 상자 + 두께 절반. em 좌표.
  const xs: number[] = []
  const ys: number[] = []
  for (const s of strokes) {
    if (s.orientation === 'vertical') { xs.push(s.center - s.thickness / 2, s.center + s.thickness / 2); ys.push(s.from, s.to) }
    else { ys.push(s.center - s.thickness / 2, s.center + s.thickness / 2); xs.push(s.from, s.to) }
  }
  const slot: BoxConfig = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
  if (slot.width <= 0 || slot.height <= 0) return { ok: false, message: '홀자 잉크 박스를 만들 수 없습니다.' }

  // 접합: 획 끝이 직교하는 다른 획의 두께 띠 안에 있으면 그 중심선으로 붙인다.
  // 측정은 잉크 면(기둥 오른면)에서 보가 시작한다고 말하지만 획 모델에선 중심선에서 만나야 union이 이어진다.
  for (const s of strokes) {
    for (const other of strokes) {
      if (other === s || other.orientation === s.orientation) continue
      const half = other.thickness / 2 + EPSILON
      if (Math.abs(s.from - other.center) <= half) s.from = other.center
      if (Math.abs(s.to - other.center) <= half) s.to = other.center
    }
  }

  // 축별로 필요한 rail 값: 중심선과 획 끝. 잉크 바깥면(=slot 경계)은 outer로 간다.
  const xNeeds: number[] = []
  const yNeeds: number[] = []
  for (const s of strokes) {
    if (s.orientation === 'vertical') { xNeeds.push(s.center); yNeeds.push(s.from, s.to) }
    else { yNeeds.push(s.center); xNeeds.push(s.from, s.to) }
  }
  const xAssign = assignAxis(CORE_X_RAIL_ROLES, [slot.x, slot.x + slot.width], xNeeds)
  if (typeof xAssign === 'string') return { ok: false, message: `x축: ${xAssign}` }
  const yAssign = assignAxis(CORE_Y_RAIL_ROLES, [slot.y, slot.y + slot.height], yNeeds)
  if (typeof yAssign === 'string') return { ok: false, message: `y축: ${yAssign}` }
  const railsEm = { ...xAssign.values, ...yAssign.values }

  const local = (axis: 'x' | 'y', v: number) => axis === 'x' ? (v - slot.x) / slot.width : (v - slot.y) / slot.height
  const grid = createBasePartGrid({
    role: input.role,
    xCorePositions: Object.fromEntries(CORE_X_RAIL_ROLES.map((r) => [r, local('x', railsEm[r])])) as Record<CoreXRailRole, number>,
    yCorePositions: Object.fromEntries(CORE_Y_RAIL_ROLES.map((r) => [r, local('y', railsEm[r])])) as Record<CoreYRailRole, number>,
    snapStep: 0.001,
    minGap: input.minGap ?? DEFAULT_MIN_GAP,
  })
  const roleFor = (axis: 'x' | 'y', v: number): CoreRailRole | undefined => {
    const roles: readonly CoreRailRole[] = axis === 'x' ? CORE_X_RAIL_ROLES : CORE_Y_RAIL_ROLES
    return roles.find((r) => Math.abs(railsEm[r] - v) < EPSILON)
  }
  const bindings: StrokeRailBinding[] = []
  for (const s of strokes) {
    const [centerAxis, spanAxis] = s.orientation === 'vertical' ? ['x', 'y'] as const : ['y', 'x'] as const
    const centerRail = roleFor(centerAxis, s.center)
    const fromRail = roleFor(spanAxis, s.from)
    const toRail = roleFor(spanAxis, s.to)
    if (!centerRail || !fromRail || !toRail) return { ok: false, message: `${s.roleId}: 끝점이 rail에 걸리지 않습니다.` }
    bindings.push({ roleId: s.roleId, orientation: s.orientation, thickness: s.thickness, centerRail, fromRail, toRail })
  }
  const master = masterFromBindings(input.jamoId, input.role, grid.id, bindings)
  const scope = createRoleConstructionSourceV1({ grid, masters: [master] })
  return { ok: true, fit: { jamoId: input.jamoId, role: input.role, slot, strokes, railsEm, bindings, grid, master, scope } }
}

function railIdOf(gridId: string, role: CoreRailRole): string {
  const axis = (CORE_X_RAIL_ROLES as readonly string[]).includes(role) ? 'x' : 'y'
  return `${gridId}:${axis}:${role}`
}

function masterFromBindings(jamoId: string, role: MedialFitRole, gridId: string, bindings: readonly StrokeRailBinding[]): JamoRoleMaster {
  const master = createEmptyJamoRoleMaster({ jamoId, role, gridId })
  const channel = master.construction.channels[expectedConstructionChannel(role)]!
  for (const b of bindings) {
    const [ax, ay, bx, by] = b.orientation === 'vertical'
      ? [b.centerRail, b.fromRail, b.centerRail, b.toRail]
      : [b.fromRail, b.centerRail, b.toRail, b.centerRail]
    const element: GridCenterlineElement = {
      id: `noto:${b.roleId}`, kind: 'centerline', closed: false, thickness: b.thickness,
      anchors: [
        { id: `noto:${b.roleId}:a`, point: { id: `noto:${b.roleId}:a:pt`, xRailId: railIdOf(gridId, ax), yRailId: railIdOf(gridId, ay) } },
        { id: `noto:${b.roleId}:b`, point: { id: `noto:${b.roleId}:b:pt`, xRailId: railIdOf(gridId, bx), yRailId: railIdOf(gridId, by) } },
      ],
    }
    channel.elements.push(element)
  }
  return master
}

/** 이 fit에서 실제로 획이 매인 core rail. 나머지 core rail은 자리만 채운 것이라 편집 대상이 아니다. */
export function boundRailRoles(fit: Pick<MedialFitResult, 'bindings'>): CoreRailRole[] {
  const roles = new Set<CoreRailRole>()
  for (const b of fit.bindings) { roles.add(b.centerRail); roles.add(b.fromRail); roles.add(b.toRail) }
  return [...CORE_X_RAIL_ROLES, ...CORE_Y_RAIL_ROLES].filter((role) => roles.has(role))
}

/**
 * rail 값(em)을 바꿔 같은 결속으로 획을 다시 놓는다. 두께는 결속에 박혀 있어 rail이 움직여도 그대로다.
 * slot은 outer rail 네 개가 정하고, 안 매인 core rail은 이웃 중점으로 다시 채운다.
 * 순서가 뒤집히거나 minGap 아래로 붙으면 실패한다 — 호출자는 마지막 유효값을 지킨다.
 */
export function applyRailEdits(fit: MedialFitResult, railsEm: Readonly<Record<CoreRailRole, number>>): MedialFitOutcome {
  // 획은 결속된 rail 값에서 다시 놓는다. 두께는 결속에 박혀 있어 그대로다.
  const strokes: FittedStroke[] = fit.bindings.map((b) => ({ roleId: b.roleId, orientation: b.orientation, thickness: b.thickness, center: railsEm[b.centerRail], from: railsEm[b.fromRail], to: railsEm[b.toRail] }))
  if (strokes.some((s) => ![s.center, s.from, s.to].every(Number.isFinite) || s.to <= s.from)) return { ok: false, message: '획의 시작과 끝이 뒤집혔습니다.' }
  // slot은 fit과 같은 규칙(획 잉크 박스)으로 다시 잡는다. 매이지 않은 outer rail은 여기서 따라온다.
  const xs: number[] = []
  const ys: number[] = []
  for (const s of strokes) {
    if (s.orientation === 'vertical') { xs.push(s.center - s.thickness / 2, s.center + s.thickness / 2); ys.push(s.from, s.to) }
    else { ys.push(s.center - s.thickness / 2, s.center + s.thickness / 2); xs.push(s.from, s.to) }
  }
  const slot: BoxConfig = { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) }
  if (slot.width <= 0 || slot.height <= 0) return { ok: false, message: '홀자 잉크 박스를 만들 수 없습니다.' }
  const bound = new Set(boundRailRoles(fit))
  const next = { ...railsEm }
  next['outer-left'] = bound.has('outer-left') ? next['outer-left'] : slot.x
  next['outer-right'] = bound.has('outer-right') ? next['outer-right'] : slot.x + slot.width
  next['outer-top'] = bound.has('outer-top') ? next['outer-top'] : slot.y
  next['outer-bottom'] = bound.has('outer-bottom') ? next['outer-bottom'] : slot.y + slot.height
  const axes: readonly (readonly CoreRailRole[])[] = [CORE_X_RAIL_ROLES, CORE_Y_RAIL_ROLES]
  for (const roles of axes) {
    for (const role of roles.slice(1, -1)) {
      if (bound.has(role)) continue
      const index = roles.indexOf(role)
      const prev = [...roles.slice(0, index)].reverse().find((r) => bound.has(r) || r === roles[0])!
      const after = roles.slice(index + 1).find((r) => bound.has(r) || r === roles[roles.length - 1])!
      next[role] = (next[prev] + next[after]) / 2
    }
  }
  const minGap = fit.grid.minGap
  for (const roles of axes) {
    const size = roles === CORE_X_RAIL_ROLES ? slot.width : slot.height
    for (let index = 1; index < roles.length; index += 1) {
      if ((next[roles[index]] - next[roles[index - 1]]) / size < minGap - EPSILON) return { ok: false, message: `${roles[index - 1]}와 ${roles[index]} 사이가 너무 좁습니다.` }
    }
  }
  const local = (axis: 'x' | 'y', v: number) => axis === 'x' ? (v - slot.x) / slot.width : (v - slot.y) / slot.height
  const grid = createBasePartGrid({
    role: fit.role,
    xCorePositions: Object.fromEntries(CORE_X_RAIL_ROLES.map((r) => [r, local('x', next[r])])) as Record<CoreXRailRole, number>,
    yCorePositions: Object.fromEntries(CORE_Y_RAIL_ROLES.map((r) => [r, local('y', next[r])])) as Record<CoreYRailRole, number>,
    snapStep: fit.grid.snapStep,
    minGap,
  })
  const master = masterFromBindings(fit.jamoId, fit.role, grid.id, fit.bindings)
  const scope = createRoleConstructionSourceV1({ grid, masters: [master] })
  return { ok: true, fit: { ...fit, slot, strokes, railsEm: next, grid, master, scope } }
}

/** 혼합 홀자(ㅘ 등)는 측정 역할 이름으로 가로부(JU_H)·세로부(JU_V)를 가른다. */
export function splitMixedMedialRoles<T>(measurements: Readonly<Record<string, T>>): { horizontal: Record<string, T>; vertical: Record<string, T> } {
  const horizontal: Record<string, T> = {}
  const vertical: Record<string, T> = {}
  for (const [roleId, value] of Object.entries(measurements)) {
    if (roleId === 'baseStem' || roleId === 'lowerBeam') horizontal[roleId] = value
    else vertical[roleId] = value
  }
  return { horizontal, vertical }
}
