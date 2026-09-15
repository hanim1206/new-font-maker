import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import approved from '../../reference-data/preset-candidates/noto-approved-guide-inputs.v1.json'
import { medialInputFromPrediction, reportMedialFit } from './notoFitReport'
import type { MedialFitReport } from './notoFitReport'
import { splitMixedMedialRoles } from './notoMedialMasterFit'
import type { MedialFitInput, MedialRoleMeasurement } from './notoMedialMasterFit'
import { selectNotoOutlineContours } from './notoOutlineInk'
import type { NotoOutline } from './notoOutlineInk'
import { isVariationModel, MEDIAL_ROLE_SETS, predictNotoTarget } from './notoVariationModel'
import type { VariationModel } from './notoVariationModel'

/**
 * 변화량 모델 예측 rail로 홀자 획 마스터를 fit해 승인 실측·Noto 고스트와 비교한다.
 * 직접 fit 리포트와 달리 rail 오차가 0이 아니다 — 이게 모델의 문맥 예측 오차다.
 */

interface ApprovedCase {
  identity: { character: string; codepoint: number; initialJamo: string; medialJamo: string; finalJamo: string | null; contextId: string }
  stages: {
    outline: { observation: NotoOutline }
    medial: { observation: { elements: { elementId: string; face: { evidence: { contourId: number } } }[] }; measurements: Record<string, MedialRoleMeasurement> }
  }
}
interface ThicknessFile { characters: Record<string, { medialRoles?: Record<string, { thickness: number | null }> }> }

const CORPUS = path.resolve(__dirname, '../../.reference-fonts/guide-corpus')
function locate(): { run: string; model: VariationModel; thickness: ThicknessFile } | null {
  if (!existsSync(CORPUS)) return null
  for (const run of readdirSync(CORPUS).filter((name) => /^[a-f0-9]{24}$/.test(name))) {
    const modelFile = path.join(CORPUS, run, 'analysis', 'variation-model-v2.json')
    const thicknessFile = path.join(CORPUS, run, 'attributes', 'role-thickness-v1.json')
    if (!existsSync(modelFile) || !existsSync(thicknessFile)) continue
    const model = JSON.parse(readFileSync(modelFile, 'utf8')) as unknown
    if (!isVariationModel(model) || !model.targets['medial.outerPillar.spanFrom']) continue
    return { run, model, thickness: JSON.parse(readFileSync(thicknessFile, 'utf8')) as ThicknessFile }
  }
  return null
}
const source = locate()

/** 자모별 대표 두께 = corpus 전수에서 그 홀자·역할 두께의 중앙값(em 비율). 마스터 두께는 문맥과 무관하게 고정. */
function representativeThickness(thickness: ThicknessFile, medialJamo: string): Record<string, number> {
  const samples: Record<string, number[]> = {}
  for (const [character, entry] of Object.entries(thickness.characters)) {
    const codepoint = character.codePointAt(0)! - 0xac00
    if (codepoint < 0 || codepoint >= 11172) continue
    const medial = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'[Math.floor((codepoint % 588) / 28)]
    if (medial !== medialJamo) continue
    for (const [roleId, role] of Object.entries(entry.medialRoles ?? {})) if (role.thickness !== null) (samples[roleId] ??= []).push(role.thickness)
  }
  return Object.fromEntries(Object.entries(samples).map(([roleId, values]) => { const sorted = [...values].sort((a, b) => a - b); return [roleId, sorted[Math.floor(sorted.length / 2)] / 1000] }))
}

describe('변화량 모델 rail로 fit한 홀자 마스터 리포트', () => {
  it.skipIf(!source)('예측 rail 오차와 고스트 xor를 승인 57자에 대해 낸다', () => {
    const { run, model, thickness } = source!
    const cases = (approved as unknown as { cases: ApprovedCase[] }).cases
    const rows: (MedialFitReport & { character: string })[] = []
    for (const entry of cases) {
      const identity = entry.identity
      const roleIds = MEDIAL_ROLE_SETS[identity.medialJamo] ?? []
      expect(roleIds.length, `${identity.medialJamo} 역할 구성`).toBeGreaterThan(0)
      const predicted = (target: string) => predictNotoTarget(model, target, identity)?.predicted ?? null
      const thick = representativeThickness(thickness, identity.medialJamo)
      const parts: { role: MedialFitInput['role']; roleIds: readonly string[]; reference: Record<string, MedialRoleMeasurement> }[] = []
      if ('ㅘㅙㅚㅝㅞㅟㅢ'.includes(identity.medialJamo)) {
        const split = splitMixedMedialRoles(Object.fromEntries(roleIds.map((id) => [id, true])))
        const ref = splitMixedMedialRoles(entry.stages.medial.measurements)
        parts.push({ role: 'JU_H', roleIds: Object.keys(split.horizontal), reference: ref.horizontal }, { role: 'JU_V', roleIds: Object.keys(split.vertical), reference: ref.vertical })
      } else {
        parts.push({ role: 'ㅗㅛㅜㅠㅡ'.includes(identity.medialJamo) ? 'JU_HORIZONTAL' : 'JU_VERTICAL', roleIds, reference: entry.stages.medial.measurements })
      }
      for (const part of parts) {
        const contourIds = entry.stages.medial.observation.elements.filter((e) => part.roleIds.includes(e.elementId)).map((e) => e.face.evidence.contourId)
        const ghostOutline = selectNotoOutlineContours(entry.stages.outline.observation, contourIds)
        const input = medialInputFromPrediction({ jamoId: identity.medialJamo, role: part.role, roleIds: part.roleIds, predicted, thickness: thick })
        if (!input.ok) { rows.push({ character: identity.character, jamoId: identity.medialJamo, role: part.role, ok: false, message: input.message, railErrors: [] }); continue }
        rows.push({ character: identity.character, ...reportMedialFit({ ...input.input, ghostOutline, referenceMeasurements: part.reference }) })
      }
    }
    const okRows = rows.filter((row) => row.ok)
    expect(okRows.length).toBeGreaterThan(0)
    for (const row of okRows) expect(Number.isFinite(row.xorRatio)).toBe(true)

    const stat = (values: number[]) => { const s = [...values].sort((a, b) => a - b); return { n: s.length, median: s[Math.floor(s.length / 2)] ?? null, p95: s[Math.min(s.length - 1, Math.floor(0.95 * (s.length - 1)))] ?? null, max: s[s.length - 1] ?? null } }
    const byRole = Object.fromEntries((['JU_VERTICAL', 'JU_HORIZONTAL', 'JU_H', 'JU_V'] as const).map((role) => {
      const subset = okRows.filter((row) => row.role === role)
      return [role, { xor: stat(subset.map((row) => row.xorRatio!)), railAbsError: stat(subset.flatMap((row) => row.railErrors.map((rail) => Math.abs(rail.errorUnits)))) }]
    }))
    const byRail = Object.fromEntries([...new Set(okRows.flatMap((row) => row.railErrors.map((rail) => `${row.jamoId}.${rail.roleId}`)))].sort().map((key) => {
      const values = okRows.flatMap((row) => row.railErrors.filter((rail) => `${row.jamoId}.${rail.roleId}` === key).map((rail) => rail.errorUnits))
      return [key, { ...stat(values.map(Math.abs)), signedMedian: stat(values).median }]
    }))
    const summary = { schema: 'noto-medial-fit-report-model-v1', corpusRun: run, generatedAt: new Date().toISOString(), meaning: '변화량 모델 v2 예측 rail(face·spanFrom·spanTo)로 fit한 홀자 획 마스터. railAbsError = |예측 face − 승인 실측| 1000u. 게이트 아님.', count: rows.length, okCount: okRows.length, byRole, byRail, rows }
    const outDir = path.join(CORPUS, run, 'analysis')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(path.join(outDir, 'noto-medial-fit-report-model-v1.json'), JSON.stringify(summary, null, 1))
    const pct = (v: number | null) => v === null ? '—' : `${(v * 100).toFixed(1)}%`
    const u = (v: number | null) => v === null ? '—' : `${v.toFixed(1)}u`
    console.log(`[model fit] ${okRows.length}/${rows.length} ok · ` + Object.entries(byRole).map(([role, v]) => `${role} n=${v.xor.n} xor med=${pct(v.xor.median)} · rail |err| med=${u(v.railAbsError.median)} p95=${u(v.railAbsError.p95)}`).join(' · '))
    for (const [key, v] of Object.entries(byRail)) console.log(`[model fit] ${key}: |err| med=${u(v.median)} p95=${u(v.p95)} max=${u(v.max)} signed med=${u(v.signedMedian)}`)
    for (const row of rows.filter((r) => !r.ok)) console.log(`[model fit] ${row.character} ${row.role}: ${row.message}`)
  })
})
