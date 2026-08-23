import { describe, expect, it, vi } from 'vitest'
import type { CoreXRailRole, CoreYRailRole, InkPoint, InkRegion, JamoPartRole } from '../types'
import { createDefaultGrid2Project, getGrid2Contours } from '../../src-next/gridSystem2EditorModel'
import { unionInkRegions } from './inkBoolean'
import { gridAreaToInkRegions, validateRoleConstructionScope } from './jamoConstruction'
import { redoSourceTransaction, undoSourceTransaction } from './masterGridCommands'
import { resolveRailGrid } from './railGridResolver'
import {
  applyGridV1ImportProposal,
  fingerprintGridV1ImportSource,
  GRID_V1_JAMOS,
  GRID_V1_STORAGE_KEY,
  parseGridV1ImportCandidate,
  proposeGridV1Import,
  type GridV1CoreIndexMap,
  type GridV1ImportCandidate,
  type GridV1ImportProposal,
  type GridV1Jamo,
} from './gridV1Import'

const X_ROLES: CoreXRailRole[] = ['outer-left', 'inner-left', 'center-x', 'inner-right', 'outer-right']
const Y_ROLES: CoreYRailRole[] = ['outer-top', 'inner-top', 'center-y', 'inner-bottom', 'outer-bottom']

function point(xIndex: number, yIndex: number) {
  return { xIndex, yIndex }
}

function glyph(): GridV1ImportCandidate['glyphs'][GridV1Jamo] {
  return {
    cells: [
      [true, false, false, false],
      [false, true, false, false],
      [false, false, false, false],
      [false, false, false, true],
    ],
    curve: 'square',
    cuts: [],
    cut: null,
    localCuts: [],
    curves: [],
    diagonalEdges: [],
  }
}

function project(): GridV1ImportCandidate {
  return {
    version: 1,
    snapUnit: 25,
    cutGuide: { from: point(0, 2), to: point(3, 0) },
    xRails: [100, 250, 500, 750, 900],
    yRails: [100, 250, 500, 750, 900],
    glyphs: Object.fromEntries(GRID_V1_JAMOS.map((jamo) => [jamo, glyph()])) as GridV1ImportCandidate['glyphs'],
  }
}

function sevenRailProject(): GridV1ImportCandidate {
  const source = project()
  source.xRails = [100, 200, 300, 500, 700, 800, 900]
  source.yRails = [100, 200, 300, 500, 700, 800, 900]
  source.cutGuide = { from: point(0, 2), to: point(3, 0) }
  for (const jamo of GRID_V1_JAMOS) {
    source.glyphs[jamo].cells = Array.from({ length: 6 }, (_, row) => (
      Array.from({ length: 6 }, (_, column) => row === column)
    ))
  }
  return source
}

function coreMap(indexes: [number, number, number, number, number] = [0, 1, 2, 3, 4]): GridV1CoreIndexMap {
  return {
    x: Object.fromEntries(X_ROLES.map((role, index) => [role, indexes[index]])) as Record<CoreXRailRole, number>,
    y: Object.fromEntries(Y_ROLES.map((role, index) => [role, indexes[index]])) as Record<CoreYRailRole, number>,
  }
}

function parse(source = project()) {
  const result = parseGridV1ImportCandidate(JSON.stringify(source))
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('fixture parse failed')
  return result
}

function proposalInput(overrides: Partial<Parameters<typeof proposeGridV1Import>[0]> = {}) {
  const parsed = parse()
  return {
    candidate: parsed.candidate,
    candidateFingerprint: parsed.fingerprint,
    legacyRaw: parsed.legacyRaw,
    importId: 'legacy-project-A',
    role: 'STANDALONE' as JamoPartRole,
    coreIndexMap: coreMap(),
    selectedJamos: ['ㄱ', 'ㅁ'] as GridV1Jamo[],
    ...overrides,
  }
}

function proposal(overrides: Partial<Parameters<typeof proposeGridV1Import>[0]> = {}): GridV1ImportProposal {
  const result = proposeGridV1Import(proposalInput(overrides))
  expect(result.ok).toBe(true)
  if (!result.ok) throw new Error('proposal fixture 생성 실패')
  return result.proposal
}

function emptyTarget(value: GridV1ImportProposal): Parameters<typeof applyGridV1ImportProposal>[0] {
  const target = structuredClone(value.source)
  target.masters = []
  return target
}

function applyCommand(before: Parameters<typeof applyGridV1ImportProposal>[0]) {
  return {
    transactionId: 'tx:grid-v1:import',
    expectedBeforeFingerprint: fingerprintGridV1ImportSource(before),
    targetPolicy: 'empty-only' as const,
  }
}

function deepFreeze(value: unknown): void {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return
  Object.freeze(value)
  Object.values(value).forEach(deepFreeze)
}

function pointInRing(target: InkPoint, ring: readonly InkPoint[]): boolean {
  let inside = false
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const a = ring[current]
    const b = ring[previous]
    if ((a.y > target.y) !== (b.y > target.y)
      && target.x < ((b.x - a.x) * (target.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

function filled(target: InkPoint, regions: readonly InkRegion[]): boolean {
  return regions.some((region) => pointInRing(target, region.outer)
    && !region.holes.some((hole) => pointInRing(target, hole)))
}

function canonicalRing(points: readonly InkPoint[]): string {
  const clean = points.map(({ x, y }) => ({ x: Number(x.toFixed(9)), y: Number(y.toFixed(9)) }))
  const variants: string[] = []
  for (const direction of [clean, [...clean].reverse()]) {
    for (let offset = 0; offset < direction.length; offset += 1) {
      variants.push(JSON.stringify([...direction.slice(offset), ...direction.slice(0, offset)]))
    }
  }
  return variants.sort()[0]
}

function canonicalRings(regions: readonly InkRegion[]): string[] {
  return regions.flatMap((region) => [region.outer, ...region.holes]).map(canonicalRing).sort()
}

function boundsOf(rings: readonly (readonly InkPoint[])[]) {
  const points = rings.flat()
  return {
    minX: Math.min(...points.map(({ x }) => x)),
    minY: Math.min(...points.map(({ y }) => y)),
    maxX: Math.max(...points.map(({ x }) => x)),
    maxY: Math.max(...points.map(({ y }) => y)),
  }
}

describe('Grid Lab v1 strict import candidate', () => {
  it('키 부재·JSON 손상·unknown/version 필드를 fail-closed한다', () => {
    expect(parseGridV1ImportCandidate(null)).toEqual({
      ok: false,
      issues: [{ code: 'missing-storage', path: '$', message: expect.any(String) }],
    })
    expect(parseGridV1ImportCandidate('{bad')).toEqual({
      ok: false,
      issues: [{ code: 'invalid-json', path: '$', message: expect.any(String) }],
    })
    const unknown = { ...project(), future: true }
    const unknownResult = parseGridV1ImportCandidate(JSON.stringify(unknown))
    expect(unknownResult.ok).toBe(false)
    if (!unknownResult.ok) expect(unknownResult.issues).toContainEqual(expect.objectContaining({ path: '$.future', code: 'unknown-field' }))
    const future = { ...project(), version: 2 }
    const futureResult = parseGridV1ImportCandidate(JSON.stringify(future))
    expect(futureResult.ok).toBe(false)
    if (!futureResult.ok) expect(futureResult.issues).toContainEqual(expect.objectContaining({ path: '$.version', code: 'unsupported-version' }))
  })

  it('rail·cell·reference 구조를 보정하지 않고 정확한 path로 거부한다', () => {
    const cases: Array<[string, (value: GridV1ImportCandidate) => void]> = [
      ['$.xRails', (value) => { value.xRails[2] = value.xRails[1] }],
      ['$.glyphs.ㄱ.cells[0]', (value) => { value.glyphs['ㄱ'].cells[0].pop() }],
      ['$.glyphs.ㄱ.curves[0].incoming.xIndex', (value) => {
        value.glyphs['ㄱ'].curves = [{ vertex: point(1, 1), incoming: point(99, 1), outgoing: point(1, 2) }]
      }],
    ]
    for (const [path, mutate] of cases) {
      const value = project()
      mutate(value)
      const result = parseGridV1ImportCandidate(JSON.stringify(value))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.issues.map((issue) => issue.path)).toContain(path)
    }
  })

  it('rail 개수·인접 gap·snapUnit 생성기 계약을 strict하게 검증한다', () => {
    const cases: Array<[string, (value: GridV1ImportCandidate) => void]> = [
      ['$.xRails', (value) => {
        value.xRails = Array.from({ length: 13 }, (_, index) => 100 + index * 50)
      }],
      ['$.xRails', (value) => { value.xRails = [100, 149, 500, 750, 900] }],
      ['$.snapUnit', (value) => { value.snapUnit = 4 }],
      ['$.snapUnit', (value) => { value.snapUnit = 105 }],
      ['$.snapUnit', (value) => { value.snapUnit = 26 }],
    ]
    for (const [path, mutate] of cases) {
      const value = project()
      mutate(value)
      const result = parseGridV1ImportCandidate(JSON.stringify(value))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.issues.map((issue) => issue.path)).toContain(path)
    }

    for (const snapUnit of [5, 25, 100]) {
      const value = project()
      value.snapUnit = snapUnit
      expect(parseGridV1ImportCandidate(JSON.stringify(value)).ok).toBe(true)
    }
    const exactGap = project()
    exactGap.xRails = [100, 150, 500, 750, 900]
    expect(parseGridV1ImportCandidate(JSON.stringify(exactGap)).ok).toBe(true)
  })

  it('cutGuide는 서로 다른 행과 열을 잇는 대각선만 허용한다', () => {
    const value = project()
    value.cutGuide = { from: point(0, 2), to: point(3, 2) }
    const result = parseGridV1ImportCandidate(JSON.stringify(value))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ path: '$.cutGuide' }))
  })

  it('문서화된 legacy v1 생략만 기본값으로 복원하고 present invalid는 거부한다', () => {
    const legacy = JSON.parse(JSON.stringify(project())) as Record<string, unknown>
    delete legacy.snapUnit
    delete legacy.cutGuide
    Object.values(legacy.glyphs as Record<string, Record<string, unknown>>).forEach((legacyGlyph) => {
      delete legacyGlyph.cut
      delete legacyGlyph.localCuts
      delete legacyGlyph.curves
      delete legacyGlyph.diagonalEdges
    })
    const restored = parseGridV1ImportCandidate(JSON.stringify(legacy))
    expect(restored.ok).toBe(true)
    if (restored.ok) {
      expect(restored.candidate.snapUnit).toBe(25)
      expect(restored.candidate.cutGuide).toEqual({ from: point(0, 2), to: point(3, 0) })
      for (const jamo of GRID_V1_JAMOS) {
        expect(restored.candidate.glyphs[jamo]).toMatchObject({
          cut: null, localCuts: [], curves: [], diagonalEdges: [],
        })
      }
    }

    const invalidCases: Array<[string, (value: Record<string, unknown>) => void]> = [
      ['$.snapUnit', (value) => { value.snapUnit = null }],
      ['$.cutGuide', (value) => { value.cutGuide = null }],
      ['$.glyphs.ㄱ.cut', (value) => { (value.glyphs as Record<string, Record<string, unknown>>)['ㄱ'].cut = 1 }],
      ['$.glyphs.ㄱ.localCuts', (value) => { (value.glyphs as Record<string, Record<string, unknown>>)['ㄱ'].localCuts = null }],
      ['$.glyphs.ㄱ.curves', (value) => { (value.glyphs as Record<string, Record<string, unknown>>)['ㄱ'].curves = null }],
      ['$.glyphs.ㄱ.diagonalEdges', (value) => { (value.glyphs as Record<string, Record<string, unknown>>)['ㄱ'].diagonalEdges = null }],
      ['$.glyphs.ㄱ.future', (value) => { (value.glyphs as Record<string, Record<string, unknown>>)['ㄱ'].future = true }],
      ['$.glyphs.ㄱ.cuts', (value) => { delete (value.glyphs as Record<string, Record<string, unknown>>)['ㄱ'].cuts }],
    ]
    for (const [path, mutate] of invalidCases) {
      const value = JSON.parse(JSON.stringify(project())) as Record<string, unknown>
      mutate(value)
      const result = parseGridV1ImportCandidate(JSON.stringify(value))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.issues.map((issue) => issue.path)).toContain(path)
    }
  })

  it('동일 의미 JSON의 fingerprint가 안정적이고 raw 입력을 변경하지 않는다', () => {
    const value = project()
    const raw = JSON.stringify(value)
    const reordered = JSON.stringify({
      glyphs: value.glyphs,
      yRails: value.yRails,
      xRails: value.xRails,
      cutGuide: value.cutGuide,
      snapUnit: value.snapUnit,
      version: value.version,
    })
    const first = parseGridV1ImportCandidate(raw)
    const second = parseGridV1ImportCandidate(reordered)
    expect(first.ok && second.ok && first.fingerprint).toBe(second.ok ? second.fingerprint : '')
    if (first.ok && second.ok) {
      expect(first.legacyRaw).toBe(raw)
      expect(second.legacyRaw).toBe(reordered)
    }
    expect(raw).toBe(JSON.stringify(value))
  })
})

describe('Grid Lab v1 production proposal', () => {
  it('실제 Grid Lab ㄱ·ㅁ·ㅇ의 topology·bbox·hole·filled 의미를 production InkRegion에 exact 이관한다', () => {
    const legacy = createDefaultGrid2Project()
    const parsed = parseGridV1ImportCandidate(JSON.stringify(legacy))
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    const result = proposeGridV1Import(proposalInput({
      candidate: parsed.candidate,
      candidateFingerprint: parsed.fingerprint,
      legacyRaw: parsed.legacyRaw,
      coreIndexMap: coreMap([0, 2, 3, 4, 6]),
      selectedJamos: ['ㅇ', 'ㄱ', 'ㅁ'],
    }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const resolved = resolveRailGrid(result.proposal.source.grid)
    expect(resolved.ok).toBe(true)
    if (!resolved.ok) return

    for (const jamo of ['ㄱ', 'ㅁ', 'ㅇ'] as const) {
      const master = result.proposal.source.masters.find((candidate) => candidate.jamoId === jamo)!
      const element = master.construction.channels.main!.elements[0]
      expect(element.kind).toBe('area')
      if (element.kind !== 'area') continue
      const imported = unionInkRegions(gridAreaToInkRegions(element, resolved.grid), {
        positionEpsilon: 1e-9,
        minRingArea: 1e-12,
      })
      const legacyRings = getGrid2Contours(legacy, jamo)
        .map((ring) => ring.map(({ x, y }) => ({ x: x / 1000, y: y / 1000 })))
      expect(canonicalRings(imported), `${jamo} canonical rings`).toEqual(legacyRings.map(canonicalRing).sort())
      expect(boundsOf(imported.flatMap((region) => [region.outer, ...region.holes])), `${jamo} bbox`)
        .toEqual(boundsOf(legacyRings))
      expect({ regions: imported.length, holes: imported.reduce((sum, region) => sum + region.holes.length, 0) })
        .toEqual({ regions: 1, holes: jamo === 'ㄱ' ? 0 : 1 })
      legacy.glyphs[jamo].cells.forEach((row, rowIndex) => row.forEach((isFilled, columnIndex) => {
        const center = {
          x: (legacy.xRails[columnIndex] + legacy.xRails[columnIndex + 1]) / 2000,
          y: (legacy.yRails[rowIndex] + legacy.yRails[rowIndex + 1]) / 2000,
        }
        expect(filled(center, imported), `${jamo} cell ${rowIndex},${columnIndex}`).toBe(isFilled)
      }))
      if (jamo !== 'ㄱ') expect(filled({ x: 0.5, y: 0.5 }, imported), `${jamo} hole center`).toBe(false)
    }
  })

  it('caller가 명시한 role·core map·selected jamo만 안정 ID source로 제안한다', () => {
    const parsed = parse(sevenRailProject())
    const input = proposalInput({
      candidate: parsed.candidate,
      candidateFingerprint: parsed.fingerprint,
      legacyRaw: parsed.legacyRaw,
      coreIndexMap: coreMap([0, 2, 3, 4, 6]),
      selectedJamos: ['ㄱ', 'ㅇ'],
    })
    const first = proposeGridV1Import(input)
    const second = proposeGridV1Import(input)
    expect(first).toEqual(second)
    expect(first.ok).toBe(true)
    if (!first.ok) return
    const { proposal } = first
    expect(proposal.legacyStorage).toEqual({ key: GRID_V1_STORAGE_KEY, disposition: 'preserve' })
    expect(proposal.legacyRaw).toBe(parsed.legacyRaw)
    expect(proposal.coreIndexMap).toEqual(coreMap([0, 2, 3, 4, 6]))
    expect(proposal.source.grid.minGap).toBe(0.05)
    expect(proposal.source.masters.map((master) => [master.jamoId, master.role])).toEqual([
      ['ㄱ', 'STANDALONE'], ['ㅇ', 'STANDALONE'],
    ])
    expect(proposal.source.grid.xRails.map((rail) => [rail.id, rail.kind, rail.coreRole, rail.position])).toEqual([
      [expect.stringContaining(':x:legacy-rail-0'), 'core', 'outer-left', { kind: 'absolute', value: 0.1 }],
      [expect.stringContaining(':x:legacy-rail-1'), 'auxiliary', undefined, { kind: 'absolute', value: 0.2 }],
      [expect.stringContaining(':x:legacy-rail-2'), 'core', 'inner-left', { kind: 'absolute', value: 0.3 }],
      [expect.stringContaining(':x:legacy-rail-3'), 'core', 'center-x', { kind: 'absolute', value: 0.5 }],
      [expect.stringContaining(':x:legacy-rail-4'), 'core', 'inner-right', { kind: 'absolute', value: 0.7 }],
      [expect.stringContaining(':x:legacy-rail-5'), 'auxiliary', undefined, { kind: 'absolute', value: 0.8 }],
      [expect.stringContaining(':x:legacy-rail-6'), 'core', 'outer-right', { kind: 'absolute', value: 0.9 }],
    ])
    expect(validateRoleConstructionScope(proposal.source)).toEqual({ ok: true, issues: [] })
    const serialized = JSON.stringify(proposal.source)
    expect(serialized).not.toContain('xIndex')
    expect(serialized).not.toContain('yIndex')
    expect(serialized).not.toContain('"row"')
    expect(serialized).not.toContain('"column"')
    const area = proposal.source.masters[0].construction.channels.main!.elements[0]
    expect(area.kind).toBe('area')
    if (area.kind === 'area') {
      expect(area.filledCells).toHaveLength(6)
      expect(area.filledCells[0].id).toContain(encodeURIComponent(area.filledCells[0].leftRailId))
    }
  })

  it.each(['STANDALONE', 'CH', 'JO'] as const)('Grid v1 자음 의미 role %s를 main channel로 제한한다', (role) => {
    const result = proposeGridV1Import(proposalInput({ role, selectedJamos: ['ㄱ'] }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const master = result.proposal.source.masters[0]
    expect(master.role).toBe(role)
    expect(Object.keys(master.construction.channels)).toEqual(['main'])
    expect(master.construction.channels.main?.gridId).toBe(result.proposal.source.grid.id)
  })

  it('selectedJamos 입력 순서와 무관하게 canonical 자소 순서로 동일 제안한다', () => {
    const forward = proposeGridV1Import(proposalInput({ selectedJamos: ['ㄱ', 'ㅇ'] }))
    const reverse = proposeGridV1Import(proposalInput({ selectedJamos: ['ㅇ', 'ㄱ'] }))
    expect(forward).toEqual(reverse)
    expect(forward.ok).toBe(true)
    if (forward.ok) expect(forward.proposal.selectedJamos).toEqual(['ㄱ', 'ㅇ'])
  })

  it('x/y exact 50-unit gap을 0.05로 보존하고 production validator를 통과한다', () => {
    const value = project()
    value.xRails = [100, 150, 400, 700, 900]
    value.yRails = [100, 150, 400, 700, 900]
    const parsed = parse(value)
    const result = proposeGridV1Import(proposalInput({
      candidate: parsed.candidate,
      candidateFingerprint: parsed.fingerprint,
      legacyRaw: parsed.legacyRaw,
      selectedJamos: ['ㄱ'],
    }))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.proposal.source.grid.xRails[1].position).toEqual({ kind: 'absolute', value: 0.15 })
    expect(result.proposal.source.grid.yRails[1].position).toEqual({ kind: 'absolute', value: 0.15 })
    expect(result.proposal.source.grid.minGap).toBe(0.05)
    expect(validateRoleConstructionScope(result.proposal.source)).toEqual({ ok: true, issues: [] })
  })

  it('importId·selection·fingerprint·core map의 모호성을 차단한다', () => {
    const cases = [
      { importId: '' },
      { selectedJamos: [] },
      { selectedJamos: null as unknown as GridV1Jamo[] },
      { selectedJamos: ['ㄱ', 'ㄱ'] as GridV1Jamo[] },
      { candidateFingerprint: 'stale' },
      { role: 'JU_H' as JamoPartRole },
      { coreIndexMap: coreMap([0, 2, 1, 3, 4]) },
      { coreIndexMap: coreMap([1, 2, 3, 4, 0]) },
    ]
    for (const overrides of cases) {
      const result = proposeGridV1Import(proposalInput(overrides))
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.issues.length).toBeGreaterThan(0)
    }
  })

  it('legacy raw와 candidate가 다르면 제안하지 않는다', () => {
    const changed = project()
    changed.snapUnit = 50
    const parsed = parse(changed)
    const result = proposeGridV1Import(proposalInput({
      candidate: parsed.candidate,
      candidateFingerprint: parsed.fingerprint,
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues).toContainEqual(expect.objectContaining({ path: '$.legacyRaw' }))
  })

  it.each([
    ['unsupported-rounded-mode', (value: GridV1ImportCandidate) => { value.glyphs['ㄱ'].curve = 'grid-rounded' }],
    ['unsupported-corner-cut', (value: GridV1ImportCandidate) => { value.glyphs['ㄱ'].cuts = ['top-left'] }],
    ['unsupported-cut', (value: GridV1ImportCandidate) => {
      value.glyphs['ㄱ'].cut = { guide: { from: point(0, 2), to: point(3, 0) }, side: 'above' }
    }],
    ['unsupported-local-cut', (value: GridV1ImportCandidate) => {
      value.glyphs['ㄱ'].localCuts = [{ guide: { from: point(0, 2), to: point(3, 0) }, anchor: point(0, 0), target: { row: 0, column: 0 }, side: 'below' }]
    }],
    ['unsupported-curve', (value: GridV1ImportCandidate) => {
      value.glyphs['ㄱ'].curves = [{ vertex: point(1, 1), incoming: point(0, 1), outgoing: point(1, 2) }]
    }],
    ['unsupported-diagonal', (value: GridV1ImportCandidate) => {
      value.glyphs['ㄱ'].diagonalEdges = [{ vertex: point(1, 1), from: point(0, 1), to: point(1, 2) }]
    }],
  ] as const)('%s 의미를 조용히 버리지 않고 blocker로 반환한다', (code, mutate) => {
    const value = project()
    mutate(value)
    const parsed = parse(value)
    const result = proposeGridV1Import(proposalInput({
      candidate: parsed.candidate,
      candidateFingerprint: parsed.fingerprint,
      legacyRaw: parsed.legacyRaw,
      selectedJamos: ['ㄱ'],
    }))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.blockers).toContainEqual(expect.objectContaining({ code, jamo: 'ㄱ', count: 1 }))
  })

  it('선택하지 않은 자소의 unsupported 의미는 보존된 후보에 남기고 선택 import를 막지 않는다', () => {
    const value = project()
    value.glyphs['ㅇ'].curves = [{ vertex: point(1, 1), incoming: point(0, 1), outgoing: point(1, 2) }]
    const parsed = parse(value)
    const result = proposeGridV1Import(proposalInput({
      candidate: parsed.candidate,
      candidateFingerprint: parsed.fingerprint,
      legacyRaw: parsed.legacyRaw,
      selectedJamos: ['ㄱ'],
    }))
    expect(result.ok).toBe(true)
  })

  it('동결된 candidate를 변경하지 않고 어떤 storage write도 수행하지 않는다', () => {
    const parsed = parse()
    const candidate = structuredClone(parsed.candidate) as GridV1ImportCandidate
    Object.freeze(candidate)
    Object.freeze(candidate.xRails)
    Object.freeze(candidate.yRails)
    const before = structuredClone(candidate)
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { setItem })
    try {
      const result = proposeGridV1Import(proposalInput({
        candidate,
        candidateFingerprint: parsed.fingerprint,
      }))
      expect(result.ok).toBe(true)
      expect(candidate).toEqual(before)
      expect(setItem).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('Grid Lab v1 pure apply transaction', () => {
  it('strict empty target에 canonical 제안을 정확히 한 transaction으로 적용하고 undo/redo한다', () => {
    const value = proposal({ selectedJamos: ['ㅇ', 'ㄱ'] })
    const before = emptyTarget(value)
    const result = applyGridV1ImportProposal(before, value, applyCommand(before))
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.source).toEqual(value.source)
    expect(result.transaction).toMatchObject({
      id: 'tx:grid-v1:import', kind: 'master-grid', command: 'import-grid-v1',
    })
    expect(result.transaction.before).toEqual(before)
    expect(result.transaction.after).toEqual(value.source)
    expect(undoSourceTransaction(result.transaction)).toEqual(before)
    expect(redoSourceTransaction(result.transaction)).toEqual(value.source)
    expect(result.source).not.toBe(result.transaction.after)
    expect(result.transaction.before).not.toBe(before)
  })

  it('before strict parse·role·empty-only·stale fingerprint를 각각 fail-closed한다', () => {
    const value = proposal()
    const validBefore = emptyTarget(value)

    const malformed = structuredClone(validBefore) as typeof validBefore & { future?: boolean }
    malformed.future = true
    const wrongRole = structuredClone(validBefore)
    wrongRole.grid.role = 'CH'
    const nonEmpty = structuredClone(value.source)
    const cases = [
      applyGridV1ImportProposal(malformed, value, applyCommand(malformed)),
      applyGridV1ImportProposal(wrongRole, value, applyCommand(wrongRole)),
      applyGridV1ImportProposal(nonEmpty, value, applyCommand(nonEmpty)),
      applyGridV1ImportProposal(validBefore, value, {
        ...applyCommand(validBefore), expectedBeforeFingerprint: 'stale',
      }),
    ]
    expect(cases.map((result) => result.ok ? 'ok' : result.issues[0].code)).toEqual([
      'invalid-before', 'role-mismatch', 'target-not-empty', 'stale-before',
    ])
  })

  it('이미 적용된 source 재적용은 empty-only 정책으로 transaction 없이 차단한다', () => {
    const value = proposal()
    const result = applyGridV1ImportProposal(value.source, value, applyCommand(value.source))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0].code).toBe('target-not-empty')
  })

  it.each([
    ['rail ID', (before: ReturnType<typeof emptyTarget>) => {
      before.grid.xRails[0].id = `${before.grid.xRails[0].id}:different`
    }],
    ['rail position', (before: ReturnType<typeof emptyTarget>) => {
      before.grid.xRails[0].position = { kind: 'absolute', value: 0.09 }
    }],
    ['snapStep', (before: ReturnType<typeof emptyTarget>) => { before.grid.snapStep = 0.05 }],
    ['minGap', (before: ReturnType<typeof emptyTarget>) => { before.grid.minGap = 0.04 }],
    ['auxiliary rail', (before: ReturnType<typeof emptyTarget>) => {
      before.grid.xRails.splice(1, 0, {
        id: `${before.grid.id}:x:unexpected-aux`,
        kind: 'auxiliary',
        position: { kind: 'absolute', value: 0.175 },
      })
    }],
  ])('masters가 비어 있어도 canonical target과 %s가 다른 grid는 거부한다', (_label, mutate) => {
    const value = proposal()
    const before = emptyTarget(value)
    mutate(before)
    expect(validateRoleConstructionScope(before)).toEqual({ ok: true, issues: [] })
    const result = applyGridV1ImportProposal(before, value, applyCommand(before))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.issues[0].code).toBe('target-grid-mismatch')
      expect(result).not.toHaveProperty('source')
      expect(result).not.toHaveProperty('transaction')
    }
  })

  it.each([
    ['source fingerprint', (value: GridV1ImportProposal) => { value.sourceFingerprint = 'forged' }],
    ['source', (value: GridV1ImportProposal) => {
      value.source.grid.xRails[0].position = { kind: 'absolute', value: 0.01 }
    }],
    ['core map', (value: GridV1ImportProposal) => { value.coreIndexMap.x['outer-left'] = 1 }],
    ['candidate fingerprint', (value: GridV1ImportProposal) => { value.candidateFingerprint = 'forged' }],
    ['selected order', (value: GridV1ImportProposal) => { value.selectedJamos.reverse() }],
    ['import id', (value: GridV1ImportProposal) => { value.importId = 'forged-import' }],
    ['legacy storage', (value: GridV1ImportProposal) => {
      (value.legacyStorage as { key: string }).key = 'forged-key'
    }],
  ])('위조 proposal(%s)을 raw 재구성 canonical 비교로 차단한다', (_label, forge) => {
    const original = proposal({ selectedJamos: ['ㄱ', 'ㅇ'] })
    const before = emptyTarget(original)
    const forged = structuredClone(original)
    forge(forged)
    const result = applyGridV1ImportProposal(before, forged, applyCommand(before))
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues[0].code).toBe('invalid-proposal')
  })

  it('frozen before/proposal을 변경하지 않고 storage 접근 없이 독립 clone transaction을 만든다', () => {
    const value = proposal()
    const before = emptyTarget(value)
    const beforeSnapshot = structuredClone(before)
    const proposalSnapshot = structuredClone(value)
    deepFreeze(before)
    deepFreeze(value)
    const getItem = vi.fn()
    const setItem = vi.fn()
    vi.stubGlobal('localStorage', { getItem, setItem })
    try {
      const result = applyGridV1ImportProposal(before, value, applyCommand(before))
      expect(result.ok).toBe(true)
      expect(before).toEqual(beforeSnapshot)
      expect(value).toEqual(proposalSnapshot)
      expect(getItem).not.toHaveBeenCalled()
      expect(setItem).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('runtime invalid command를 throw 없이 차단한다', () => {
    const value = proposal()
    const before = emptyTarget(value)
    const commands: unknown[] = [
      null,
      {},
      { ...applyCommand(before), transactionId: '' },
      { ...applyCommand(before), expectedBeforeFingerprint: null },
      { ...applyCommand(before), targetPolicy: 'overwrite' },
    ]
    for (const command of commands) {
      expect(() => applyGridV1ImportProposal(
        before,
        value,
        command as Parameters<typeof applyGridV1ImportProposal>[2],
      )).not.toThrow()
      const result = applyGridV1ImportProposal(
        before,
        value,
        command as Parameters<typeof applyGridV1ImportProposal>[2],
      )
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.issues[0].code).toBe('invalid-command')
    }
  })
})
