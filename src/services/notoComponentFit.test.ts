import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import approved from '../../reference-data/preset-candidates/noto-approved-guide-inputs.v1.json'
import { CHOSEONG_MAP } from '../data/Hangul'
// 직각 ㄱ으로 상자 산술을 검증한다. 기본 ㄱ은 Noto 골격 다듬기로 다리가 기울어 옛 기본 획(2026-02)을 쓴다.
import legacyJamos from '../data/fixtures/baseJamosLegacy2026-02.json'
import type { JamoData } from '../types'
import { componentBoxFromFaces, fitNotoComponent, inkOfComponentFit, reportComponentFit } from './notoComponentFit'
import type { ComponentFitReport } from './notoComponentFit'
import { isVariationModel, predictNotoTarget } from './notoVariationModel'
import type { VariationModel } from './notoVariationModel'
import { selectNotoOutlineContours } from './notoOutlineInk'
import type { NotoOutline } from './notoOutlineInk'

interface ApprovedCase {
  identity: { character: string; codepoint: number; initialJamo: string; medialJamo: string; finalJamo: string | null; contextId: string }
  stages: {
    outline: { observation: NotoOutline }
    initial: { observation: { componentGroup: { value: { contourIds: number[] } } }; measurements: { roleFaces: Record<string, number> } }
  }
}

const GIYEOK = (legacyJamos.choseong as Record<string, JamoData>)['ㄱ']

describe('componentBoxFromFaces', () => {
  it('잉크 바깥면이 faces에 닿도록 중심선 상자를 두께 절반 안쪽에 둔다', () => {
    const faces = { left: 0.1, right: 0.5, top: 0.15, bottom: 0.79 }
    const placed = componentBoxFromFaces(GIYEOK.strokes!, faces)
    expect(typeof placed).toBe('object')
    if (typeof placed === 'string') return
    // ㄱ 중심선은 0~1 전폭이라 상자 = faces 안쪽 두께/2.
    expect(placed.box.x).toBeCloseTo(0.1 + 0.035, 9)
    expect(placed.box.x + placed.box.width).toBeCloseTo(0.5 - 0.035, 9)
    expect(placed.box.y).toBeCloseTo(0.15 + 0.035, 9)
    expect(placed.box.y + placed.box.height).toBeCloseTo(0.79 - 0.035, 9)
    expect(placed.thickness).toBe(0.07)
  })

  it('두께보다 작은 박스는 거부한다', () => {
    expect(fitNotoComponent({ part: 'CH', jamo: GIYEOK, faces: { left: 0.1, right: 0.15, top: 0.1, bottom: 0.9 }, glyphId: 'x' })).toMatchObject({ ok: false })
  })

  it('fit 잉크의 바깥 범위는 faces에 온다(일자 끝)', () => {
    const faces = { left: 0.1, right: 0.5, top: 0.15, bottom: 0.79 }
    const fit = fitNotoComponent({ part: 'CH', jamo: GIYEOK, faces, glyphId: 'ㄱ' })
    expect(fit.ok).toBe(true)
    if (!fit.ok) return
    // ㄱ 가로획 왼끝·세로획 아래끝은 일자라 중심선이 faces까지 간다. 윗면·오른면은 두께/2 안쪽.
    expect(fit.fit.box.x).toBeCloseTo(0.1, 5)
    expect(fit.fit.box.x + fit.fit.box.width).toBeCloseTo(0.5 - 0.035, 5)
    expect(fit.fit.box.y).toBeCloseTo(0.15 + 0.035, 5)
    expect(fit.fit.box.y + fit.fit.box.height).toBeCloseTo(0.79, 5)
    const ink = inkOfComponentFit(fit.fit)
    expect(ink.ok).toBe(true)
    if (!ink.ok) return
    const points = ink.regions.flatMap((region) => region.outer)
    expect(Math.min(...points.map((p) => p.x))).toBeCloseTo(faces.left, 5)
    expect(Math.max(...points.map((p) => p.x))).toBeCloseTo(faces.right, 5)
    expect(Math.min(...points.map((p) => p.y))).toBeCloseTo(faces.top, 5)
    expect(Math.max(...points.map((p) => p.y))).toBeCloseTo(faces.bottom, 5)
  })
})

// corpus(.reference-fonts)가 있을 때만: 승인 57자 첫닿자를 실측 박스·모델 박스로 놓고 Noto 첫닿자 고스트와 비교한다.
const CORPUS = path.resolve(__dirname, '../../.reference-fonts/guide-corpus')
function locateModel(): { run: string; model: VariationModel } | null {
  if (!existsSync(CORPUS)) return null
  for (const run of readdirSync(CORPUS).filter((name) => /^[a-f0-9]{24}$/.test(name))) {
    const file = path.join(CORPUS, run, 'analysis', 'variation-model-v2.json')
    if (!existsSync(file)) continue
    const model = JSON.parse(readFileSync(file, 'utf8')) as unknown
    if (isVariationModel(model)) return { run, model }
  }
  return null
}
const source = locateModel()

describe('승인 57자 첫닿자 박스 fit 리포트', () => {
  it.skipIf(!source)('앱 기본 획을 실측 박스·모델 박스에 놓고 xor와 네 변 오차를 낸다', () => {
    const { run, model } = source!
    const cases = (approved as unknown as { cases: ApprovedCase[] }).cases
    const rows: (ComponentFitReport & { character: string; source: 'measured' | 'model' })[] = []
    for (const entry of cases) {
      const jamo = CHOSEONG_MAP[entry.identity.initialJamo] as JamoData | undefined
      if (!jamo) continue
      const measured = entry.stages.initial.measurements.roleFaces as { left: number; right: number; top: number; bottom: number }
      const ghostOutline = selectNotoOutlineContours(entry.stages.outline.observation, entry.stages.initial.observation.componentGroup.value.contourIds)
      const direct = fitNotoComponent({ part: 'CH', jamo, faces: measured, glyphId: entry.identity.character })
      rows.push({ character: entry.identity.character, source: 'measured', ...(direct.ok ? reportComponentFit({ fit: direct.fit, ghostOutline, referenceFaces: measured }) : { part: 'CH', jamoId: jamo.char, ok: false, message: direct.message, faceErrors: [] }) })
      const predicted = Object.fromEntries((['left', 'right', 'top', 'bottom'] as const).map((side) => [side, (predictNotoTarget(model, `initial.roleFaces.${side}`, entry.identity)?.predicted ?? NaN) / 1000])) as typeof measured
      const modelFit = fitNotoComponent({ part: 'CH', jamo, faces: predicted, glyphId: entry.identity.character })
      rows.push({ character: entry.identity.character, source: 'model', ...(modelFit.ok ? reportComponentFit({ fit: modelFit.fit, ghostOutline, referenceFaces: measured }) : { part: 'CH', jamoId: jamo.char, ok: false, message: modelFit.message, faceErrors: [] }) })
    }
    const okRows = rows.filter((row) => row.ok)
    expect(okRows.length).toBeGreaterThan(0)
    const stat = (values: number[]) => { const s = [...values].sort((a, b) => a - b); return { n: s.length, median: s[Math.floor(s.length / 2)] ?? null, p95: s[Math.min(s.length - 1, Math.floor(0.95 * (s.length - 1)))] ?? null, max: s[s.length - 1] ?? null } }
    const bySource = Object.fromEntries((['measured', 'model'] as const).map((kind) => {
      const subset = okRows.filter((row) => row.source === kind)
      return [kind, { xor: stat(subset.map((row) => row.xorRatio!)), faceAbsError: stat(subset.flatMap((row) => row.faceErrors.map((face) => Math.abs(face.errorUnits)))) }]
    }))
    const byJamo = Object.fromEntries([...new Set(okRows.map((row) => row.jamoId))].sort().map((jamoId) => [jamoId, stat(okRows.filter((row) => row.source === 'measured' && row.jamoId === jamoId).map((row) => row.xorRatio!))]))
    const summary = { schema: 'noto-component-fit-report-v1', corpusRun: run, generatedAt: new Date().toISOString(), meaning: '앱 기본 획(baseJamos)을 Noto 첫닿자 박스(실측/모델 예측)에 놓고 Noto 첫닿자 고스트와 비교. xor = 획 골격 차이 + 두께 차이. 게이트 아님.', count: rows.length, okCount: okRows.length, bySource, byJamo, rows }
    const outDir = path.join(CORPUS, run, 'analysis')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(path.join(outDir, 'noto-component-fit-report-v1.json'), JSON.stringify(summary, null, 1))
    const pct = (v: number | null) => v === null ? '—' : `${(v * 100).toFixed(1)}%`
    const u = (v: number | null) => v === null ? '—' : `${v.toFixed(1)}u`
    console.log(`[component fit] ${okRows.length}/${rows.length} ok · measured xor med=${pct(bySource.measured.xor.median)} max=${pct(bySource.measured.xor.max)} · model xor med=${pct(bySource.model.xor.median)} · model face |err| med=${u(bySource.model.faceAbsError.median)} p95=${u(bySource.model.faceAbsError.p95)}`)
    console.log('[component fit] xor by jamo (measured box): ' + Object.entries(byJamo).map(([jamo, v]) => `${jamo} ${pct(v.median)}`).join(' · '))
    for (const row of rows.filter((r) => !r.ok)) console.log(`[component fit] ${row.character} ${row.source}: ${row.message}`)
  })
})
