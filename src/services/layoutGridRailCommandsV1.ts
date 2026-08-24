import type {
  DeepReadonly,
  SetLayoutGridRailV1Command,
  ShapeSystemSourceV2,
  SourceCommandTransaction,
  ValidatedShapeSystemSourceV2,
} from '../types'
import { parseLayoutGridSystemSourceV1 } from './layoutGridSystemSourceV1'
import { parseShapeSystemSourceV2 } from './shapeSystemSourceV2'

type LayoutGridRailCommandError =
  | 'invalid-command'
  | 'invalid-source'
  | 'missing-grid'
  | 'stale-rail'
  | 'derived-rail'
  | 'invalid-position'
  | 'no-op'
  | 'invalid-result'

export type LayoutGridRailCommandResult =
  | { ok: true; source: ValidatedShapeSystemSourceV2; transaction: SourceCommandTransaction<ShapeSystemSourceV2> }
  | { ok: false; error: { code: LayoutGridRailCommandError; message: string } }

function fail(code: LayoutGridRailCommandError, message: string): LayoutGridRailCommandResult {
  return { ok: false, error: { code, message } }
}

/**
 * 공통 layout Rail은 배열 순서나 좌표가 아닌 stable Rail ID로만 갱신한다.
 * between Rail은 이 명령으로 materialize하지 않아 source 소유권을 보존한다.
 */
export function setLayoutGridRailV1(
  source: unknown,
  command: DeepReadonly<SetLayoutGridRailV1Command>,
): LayoutGridRailCommandResult {
  if (!command || typeof command !== 'object'
    || typeof command.transactionId !== 'string' || command.transactionId.trim() === ''
    || typeof command.railId !== 'string' || command.railId.trim() === ''
    || command.position?.kind !== 'absolute'
    || typeof command.position.value !== 'number' || !Number.isFinite(command.position.value)) {
    return fail('invalid-command', '공통 layout Rail 변경 명령이 유효하지 않습니다.')
  }
  const parsed = parseShapeSystemSourceV2(source)
  if (!parsed.ok) return fail('invalid-source', '현재 Shape System source가 strict 계약을 통과하지 못했습니다.')
  if (!parsed.source.layoutGridSystem) return fail('missing-grid', '공통 layout grid가 아직 연결되지 않았습니다.')
  const grid = parseLayoutGridSystemSourceV1(parsed.source.layoutGridSystem)
  if (!grid.ok) return fail('invalid-source', '현재 공통 layout grid를 안전하게 해석할 수 없습니다.')
  const rails = [...grid.source.grid.xRails, ...grid.source.grid.yRails]
  const target = rails.find((rail) => rail.id === command.railId)
  if (!target) return fail('stale-rail', '선택한 공통 layout Rail을 찾을 수 없습니다.')
  if (target.position.kind !== 'absolute') return fail('derived-rail', '파생 layout Rail은 직접 이동할 수 없습니다.')
  const axisRails = target.axis === 'x' ? grid.resolvedGrid.xRails : grid.resolvedGrid.yRails
  const index = axisRails.findIndex((rail) => rail.id === target.id)
  const previous = axisRails[index - 1]
  const next = axisRails[index + 1]
  const min = previous ? previous.value + grid.source.grid.minGap : 0
  const max = next ? next.value - grid.source.grid.minGap : 1
  if (command.position.value < min || command.position.value > max) {
    return fail('invalid-position', '인접 공통 layout Rail 간격을 유지하는 범위에서만 이동할 수 있습니다.')
  }
  if (Math.abs(command.position.value - target.position.value) < 1e-12) return fail('no-op', '공통 layout Rail 값이 바뀌지 않았습니다.')

  const before = structuredClone(parsed.source) as unknown as ShapeSystemSourceV2
  const nextSource = structuredClone(parsed.source) as unknown as ShapeSystemSourceV2
  const nextGrid = nextSource.layoutGridSystem
  if (!nextGrid) return fail('missing-grid', '공통 layout grid가 아직 연결되지 않았습니다.')
  const targetRail = [...nextGrid.grid.xRails, ...nextGrid.grid.yRails].find((rail) => rail.id === command.railId)
  if (!targetRail || targetRail.position.kind !== 'absolute') return fail('stale-rail', '선택한 공통 layout Rail이 바뀌었습니다.')
  targetRail.position.value = command.position.value
  const final = parseShapeSystemSourceV2(nextSource)
  if (!final.ok) return fail('invalid-result', '공통 layout Rail 변경 결과가 strict 계약을 통과하지 못했습니다.')
  return {
    ok: true,
    source: final.source,
    transaction: {
      id: command.transactionId,
      kind: 'master-grid',
      command: 'set-layout-grid-rail',
      before,
      after: structuredClone(final.source) as unknown as ShapeSystemSourceV2,
    },
  }
}
