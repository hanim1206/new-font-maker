import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import approved from '../../reference-data/preset-candidates/noto-approved-guide-inputs.v1.json'
import { reportMedialFit } from './notoFitReport'
import type { MedialFitReport } from './notoFitReport'
import { splitMixedMedialRoles } from './notoMedialMasterFit'
import type { MedialFitInput, MedialRoleMeasurement } from './notoMedialMasterFit'
import { selectNotoOutlineContours } from './notoOutlineInk'
import type { NotoOutline } from './notoOutlineInk'

interface ApprovedCase {
  identity: { character: string; medialJamo: string }
  stages: {
    outline: { observation: NotoOutline }
    medial: { observation: { elements: { elementId: string; face: { evidence: { contourId: number } } }[] }; measurements: Record<string, MedialRoleMeasurement> }
  }
}
interface ThicknessFile { characters: Record<string, { medialRoles?: Record<string, { thickness: number | null }> }> }
interface ExtentFile { characters: Record<string, Record<string, { from?: number; to?: number; reasonCode: string | null }>> }

// 두께·extent 파일은 corpus(.reference-fonts, gitignore)에만 있다. 두께가 없으면 이 리포트는 건너뛴다.
const CORPUS = path.resolve(__dirname, '../../.reference-fonts/guide-corpus')
function locateThickness(): { file: string; run: string; extentFile: string | null } | null {
  if (!existsSync(CORPUS)) return null
  for (const run of readdirSync(CORPUS).filter((name) => /^[a-f0-9]{24}$/.test(name))) {
    const file = path.join(CORPUS, run, 'attributes', 'role-thickness-v1.json')
    const extentFile = path.join(CORPUS, run, 'attributes', 'role-extent-v1.json')
    if (existsSync(file)) return { file, run, extentFile: existsSync(extentFile) ? extentFile : null }
  }
  return null
}
const thicknessSource = locateThickness()

/** 승인 측정의 visibleSpans는 기울어진 면에서 스텁만 남는다. contour extent가 있으면 획 길이는 그걸 쓴다. */
function withExtents(measurements: Record<string, MedialRoleMeasurement>, extents: Record<string, { from?: number; to?: number; reasonCode: string | null }> | undefined): Record<string, MedialRoleMeasurement> {
  if (!extents) return measurements
  return Object.fromEntries(Object.entries(measurements).map(([roleId, value]) => {
    const extent = extents[roleId]
    if (!extent || extent.reasonCode !== null || extent.from === undefined || extent.to === undefined) return [roleId, value]
    return [roleId, { ...value, visibleSpans: [{ from: extent.from / 1000, to: extent.to / 1000 }] }]
  }))
}

function medialInputs(entry: ApprovedCase, thickness: Record<string, { thickness: number | null }>): { role: MedialFitInput['role']; measurements: Record<string, MedialRoleMeasurement>; contourIds: number[] }[] {
  const em = (roleIds: string[]) => Object.fromEntries(roleIds.map((id) => [id, (thickness[id]?.thickness ?? NaN) / 1000]))
  const contoursOf = (roleIds: string[]) => entry.stages.medial.observation.elements.filter((e) => roleIds.includes(e.elementId)).map((e) => e.face.evidence.contourId)
  const all = entry.stages.medial.measurements
  const medial = entry.identity.medialJamo
  if ('ㅘㅙㅚㅝㅞㅟㅢ'.includes(medial)) {
    const split = splitMixedMedialRoles(all)
    return [
      { role: 'JU_H', measurements: split.horizontal, contourIds: contoursOf(Object.keys(split.horizontal)) },
      { role: 'JU_V', measurements: split.vertical, contourIds: contoursOf(Object.keys(split.vertical)) },
    ].map((item) => ({ ...item, thickness: em(Object.keys(item.measurements)) }))
  }
  const role: MedialFitInput['role'] = 'ㅗㅛㅜㅠㅡ'.includes(medial) ? 'JU_HORIZONTAL' : 'JU_VERTICAL'
  return [{ role, measurements: all, contourIds: contoursOf(Object.keys(all)), thickness: em(Object.keys(all)) }]
}

describe('승인 57자 홀자 획 마스터 fit 리포트', () => {
  it.skipIf(!thicknessSource)('fit → 리졸버 → 잉크 vs Noto 고스트 xor 비율과 rail 오차를 글자별로 낸다', () => {
    const { file, run, extentFile } = thicknessSource!
    const thickness = (JSON.parse(readFileSync(file, 'utf8')) as ThicknessFile).characters
    const extents = extentFile ? (JSON.parse(readFileSync(extentFile, 'utf8')) as ExtentFile).characters : null
    const cases = (approved as unknown as { cases: ApprovedCase[] }).cases
    const rows: (MedialFitReport & { character: string })[] = []
    for (const entry of cases) {
      const roles = thickness[entry.identity.character]?.medialRoles ?? {}
      const measured = { ...entry, stages: { ...entry.stages, medial: { ...entry.stages.medial, measurements: withExtents(entry.stages.medial.measurements, extents?.[entry.identity.character]) } } }
      for (const item of medialInputs(measured, roles)) {
        const ghostOutline = selectNotoOutlineContours(entry.stages.outline.observation, item.contourIds)
        const report = reportMedialFit({ jamoId: entry.identity.medialJamo, role: item.role, measurements: item.measurements, thickness: (item as { thickness: Record<string, number> }).thickness, ghostOutline })
        rows.push({ character: entry.identity.character, ...report })
      }
    }
    expect(rows.length).toBeGreaterThanOrEqual(cases.length)
    const okRows = rows.filter((row) => row.ok)
    // 직접 fit이라 rail 오차는 0이어야 한다. 모델 예측 rail이 들어오면 여기서 값이 생긴다.
    for (const row of okRows) for (const rail of row.railErrors) expect(Math.abs(rail.errorUnits)).toBeLessThan(1e-6)
    for (const row of okRows) expect(Number.isFinite(row.xorRatio)).toBe(true)

    const summary = {
      schema: 'noto-medial-fit-report-v1',
      corpusRun: run,
      generatedAt: new Date().toISOString(),
      meaning: '승인 측정으로 fit한 홀자 획 마스터 잉크 vs Noto 홀자 고스트. xorRatio = xor면적/Noto면적, inkRatio = 내잉크/Noto. 게이트 아님.',
      count: rows.length, okCount: okRows.length,
      byRole: Object.fromEntries((['JU_VERTICAL', 'JU_HORIZONTAL', 'JU_H', 'JU_V'] as const).map((role) => {
        const subset = okRows.filter((row) => row.role === role)
        const xors = subset.map((row) => row.xorRatio!).sort((a, b) => a - b)
        return [role, { count: subset.length, medianXor: xors[Math.floor(xors.length / 2)] ?? null, maxXor: xors[xors.length - 1] ?? null }]
      })),
      rows,
    }
    const outDir = path.join(CORPUS, run, 'analysis')
    mkdirSync(outDir, { recursive: true })
    writeFileSync(path.join(outDir, 'noto-medial-fit-report-v1.json'), JSON.stringify(summary, null, 1))
    console.log(`[fit report] ${okRows.length}/${rows.length} ok · ` + Object.entries(summary.byRole).map(([role, v]) => `${role} n=${v.count} medianXor=${v.medianXor === null ? '—' : (v.medianXor * 100).toFixed(1) + '%'} max=${v.maxXor === null ? '—' : (v.maxXor * 100).toFixed(1) + '%'}`).join(' · '))
    for (const row of rows.filter((r) => !r.ok)) console.log(`[fit report] ${row.character} ${row.role}: ${row.message}`)
  })
})
