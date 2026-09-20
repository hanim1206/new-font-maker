import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNotoPresetReader } from '../../scripts/reference-lab/notoPresetApi'
import { CHOSEONG_LIST, CHOSEONG_MAP, JONGSEONG_LIST, JUNGSEONG_LIST, JUNGSEONG_MAP } from '../data/Hangul'
import { modelIdentityOf } from './notoVariationModel'
import type { NotoOutline } from './notoOutlineInk'
import { buildSkeletonSample, fitSkeleton, fitSkeletonMultiStart, meanXor, skeletonContextChars, skeletonFamilyChars, skeletonParams, skeletonSeedVariants, regularizeSkeletonEllipses, snapSkeletonAxes } from './skeletonFit'
import type { SkeletonSample } from './skeletonFit'
import type { JamoData } from '../types'
import legacyJamos from '../data/fixtures/baseJamosLegacy2026-02.json'

const CORPUS = path.resolve(__dirname, '../../.reference-fonts/guide-corpus')
const RUN = existsSync(CORPUS) ? createNotoPresetReader(CORPUS) : null

describe('골격 다듬기 — 파라미터', () => {
  it('앵커 x·y와 있는 핸들만 자유 좌표로 잡는다', () => {
    // 옛 기본 ㅅ(2026-02): 획 2 × (앵커 2 → 4) + handleOut 1개씩(2) = 12. 다듬은 기본 획은 핸들이 더 있다.
    const params = skeletonParams((legacyJamos.choseong as Record<string, JamoData>)['ㅅ'])
    expect(params).toHaveLength(12)
    expect(params.filter((p) => p.key.startsWith('handleIn'))).toHaveLength(0)
  })
  it('문맥 글자는 홀자 계열·받침을 섞는다', () => {
    expect(skeletonContextChars('CH', 'ㅅ')).toEqual(['사', '소', '솨', '신', '숭', '설'])
    expect(skeletonContextChars('JO', 'ㄹ')).toEqual(['갈', '몰', '왈', '실', '불'])
  })
})

describe('골격 다듬기 — 축 붙이기', () => {
  it('ㄹ처럼 한 획에서 꺾이는 직선은 이어진 앵커가 같은 좌표를 받아 직각이 된다', () => {
    const strokes = [{ id: 'ㄹ', closed: false, thickness: 0.07, points: [{ x: 0, y: 0 }, { x: 0.942, y: 0 }, { x: 0.935, y: 0.485 }, { x: 0.084, y: 0.5 }, { x: 0.071, y: 1 }, { x: 1, y: 1 }] }]
    expect(snapSkeletonAxes(strokes)).toBe(true)
    const [a, b, c, d, e, f] = strokes[0].points
    expect(b.x).toBeCloseTo(c.x, 9)
    expect(c.y).toBeCloseTo(d.y, 9)
    expect(d.x).toBeCloseTo(e.x, 9)
    expect(a.y).toBe(b.y); expect(e.y).toBe(f.y)
    expect(b.x).toBeCloseTo(0.9385, 9)
    // 두 번 붙여도 더 안 바뀐다.
    expect(snapSkeletonAxes(strokes)).toBe(false)
  })

  it('한계를 넘는 기울기(ㅎ 꼭지 30°)는 그대로 두고, 앵커를 옮기면 핸들도 따라간다', () => {
    const strokes = [
      { id: 'tick', closed: false, thickness: 0.07, points: [{ x: 0.433, y: 0.08 }, { x: 0.567, y: 0 }] },
      { id: 'leg', closed: false, thickness: 0.07, points: [{ x: 0, y: 0 }, { x: 1, y: 0.01, handleOut: { x: 1, y: 0.3 } }, { x: 0.9, y: 1, handleIn: { x: 0.95, y: 0.7 } }] },
    ]
    expect(snapSkeletonAxes(strokes)).toBe(true)
    expect(strokes[0].points).toEqual([{ x: 0.433, y: 0.08 }, { x: 0.567, y: 0 }])
    expect(strokes[1].points[0].y).toBeCloseTo(0.005, 9)
    expect(strokes[1].points[1].y).toBeCloseTo(0.005, 9)
    expect(strokes[1].points[1].handleOut!.y).toBeCloseTo(0.295, 9)
    // 핸들 달린 곡선 구간은 직선이 아니라 건드리지 않는다.
    expect(strokes[1].points[2]).toEqual({ x: 0.9, y: 1, handleIn: { x: 0.95, y: 0.7 } })
  })

  it('원의 위·아래·좌·우 앵커는 접선을 축에 붙인다', () => {
    const strokes = [{ id: 'circle', closed: true, thickness: 0.07, points: [
      { x: 0.5, y: 0, handleIn: { x: 0.3, y: 0.02 }, handleOut: { x: 0.76, y: 0.06 } },
      { x: 1, y: 0.5, handleIn: { x: 0.95, y: 0.3 }, handleOut: { x: 1.02, y: 0.7 } },
      { x: 0.5, y: 1, handleIn: { x: 0.7, y: 1 }, handleOut: { x: 0.3, y: 1 } },
      { x: 0, y: 0.5, handleIn: { x: 0.3, y: 0.9 }, handleOut: { x: 0.1, y: 0.3 } },
    ] }]
    expect(snapSkeletonAxes(strokes)).toBe(true)
    const [top, right, bottom, left] = strokes[0].points
    expect([top.handleIn!.y, top.handleOut!.y]).toEqual([0, 0])
    expect([right.handleIn!.x, right.handleOut!.x]).toEqual([1, 1])
    expect(bottom).toEqual({ x: 0.5, y: 1, handleIn: { x: 0.7, y: 1 }, handleOut: { x: 0.3, y: 1 } })
    // 접선이 축에서 먼(18°) 앵커는 그대로.
    expect(left.handleIn).toEqual({ x: 0.3, y: 0.9 })
  })

  it('찌그러진 원은 앵커 범위의 축 정렬 타원으로 다시 그리고, 앵커 순서는 지킨다', () => {
    // 받침 ㄶ의 무너진 ㅎ 원(위·오른쪽 앵커가 붙어 있다).
    const stroke = { id: 'circle', closed: true, thickness: 0.07, points: [
      { x: 0.783, y: 0.402, handleIn: { x: 0.752, y: 0.61 }, handleOut: { x: 0.761, y: 0.253 } },
      { x: 0.92, y: 0.466, handleIn: { x: 0.94, y: 0.186 }, handleOut: { x: 0.779, y: 0.635 } },
      { x: 0.743, y: 0.992, handleIn: { x: 0.949, y: 0.932 }, handleOut: { x: 0.592, y: 1.044 } },
      { x: 0.5, y: 0.645, handleIn: { x: 0.393, y: 0.843 }, handleOut: { x: 0.647, y: 0.476 } },
    ] }
    expect(regularizeSkeletonEllipses([stroke])).toBe(true)
    const [top, right, bottom, left] = stroke.points
    expect([top.x, top.y]).toEqual([expect.closeTo(0.71, 9), expect.closeTo(0.402, 9)])
    expect([right.x, right.y]).toEqual([expect.closeTo(0.92, 9), expect.closeTo(0.697, 9)])
    expect([bottom.x, bottom.y]).toEqual([expect.closeTo(0.71, 9), expect.closeTo(0.992, 9)])
    expect([left.x, left.y]).toEqual([expect.closeTo(0.5, 9), expect.closeTo(0.697, 9)])
    // 시계 방향(위 → 오른쪽): 위 앵커의 out 핸들은 오른쪽으로, 접선은 수평.
    expect(top.handleOut!.x).toBeGreaterThan(top.x)
    expect(top.handleOut!.y).toBeCloseTo(top.y, 9)
    expect(top.handleIn!.x).toBeLessThan(top.x)
    expect(right.handleOut!.y).toBeGreaterThan(right.y)
    expect(right.handleOut!.x).toBeCloseTo(right.x, 9)
    expect(regularizeSkeletonEllipses([stroke])).toBe(false)
    // 원이 아닌 것(열린 획, 앵커 3개)은 안 건드린다.
    const open = { id: 'o', closed: false, thickness: 0.07, points: stroke.points.map((p) => ({ ...p })) }
    expect(regularizeSkeletonEllipses([open])).toBe(false)
  })
})

interface ExportFile { glyphs: { identity: { character: string }; outline: NotoOutline }[] }
let exportCache: Map<string, NotoOutline> | null = null
async function outlines(): Promise<Map<string, NotoOutline>> {
  if (exportCache) return exportCache
  const source = await (RUN as NonNullable<typeof RUN>).manifest()
  const file = path.join(CORPUS, source.runId, 'analysis', 'noto-preset-outlines-v1.json')
  const data = JSON.parse(readFileSync(file, 'utf8')) as ExportFile
  exportCache = new Map(data.glyphs.map((glyph) => [glyph.identity.character, glyph.outline]))
  return exportCache
}

function identityOfChar(char: string) {
  const offset = char.codePointAt(0)! - 0xac00
  const initials = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', medials = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ', finals = [null, ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']
  return modelIdentityOf(initials[Math.floor(offset / 588)], medials[Math.floor((offset % 588) / 28)], finals[offset % 28])
}

const MIXED = 'ㅘㅙㅚㅝㅞㅟㅢ'

/** 골격을 볼 문맥 표본. 홀자는 문맥 목록은 'JU'로 뽑되 부품(JU·JU_H·JU_V)은 따로 준다. */
async function samplesFor(part: 'CH' | 'JO' | 'JU' | 'JU_H' | 'JU_V', jamo: string, chars?: string[]): Promise<SkeletonSample[]> {
  const model = await RUN!.model()
  const map = await outlines()
  const listPart = part === 'CH' || part === 'JO' ? part : 'JU'
  return (chars ?? skeletonContextChars(listPart, jamo)).flatMap((char) => {
    const outline = map.get(char)
    const sample = outline ? buildSkeletonSample({ char, identity: identityOfChar(char), part, outline, model }) : null
    return sample ? [sample] : []
  })
}

describe.skipIf(!RUN)('골격 다듬기 — 모델', () => {
  it('ㅏ 홀자: slot 상자에서도 fit이 된다', async () => {
    const samples = await samplesFor('JU', 'ㅏ')
    expect(samples.length).toBeGreaterThanOrEqual(4)
    const result = fitSkeleton(JUNGSEONG_MAP['ㅏ'], samples, { maxRounds: 3, minStep: 0.01 })
    console.log(`[skeleton ㅏ] xor ${(result.before * 100).toFixed(1)}% → ${(result.after * 100).toFixed(1)}%`)
    expect(result.after).toBeLessThanOrEqual(result.before + 1e-9)
  }, 120000)

  it('ㅘ 혼합 홀자: 가로부·세로부 채널을 따로 fit한다', async () => {
    const horizontal = await samplesFor('JU_H', 'ㅘ')
    const vertical = await samplesFor('JU_V', 'ㅘ')
    expect(horizontal.length).toBeGreaterThanOrEqual(4)
    expect(vertical.length).toBeGreaterThanOrEqual(4)
    const seed = JUNGSEONG_MAP['ㅘ']
    const first = fitSkeleton(seed, horizontal, { maxRounds: 2, minStep: 0.02, channel: 'horizontalStrokes' })
    const second = fitSkeleton(first.jamo, vertical, { maxRounds: 2, minStep: 0.02, channel: 'verticalStrokes' })
    console.log(`[skeleton ㅘ] 가로부 ${(first.before * 100).toFixed(1)}% → ${(first.after * 100).toFixed(1)}% · 세로부 ${(second.before * 100).toFixed(1)}% → ${(second.after * 100).toFixed(1)}%`)
    // 세로부 fit은 가로부 결과를 건드리지 않는다.
    expect(second.jamo.horizontalStrokes).toEqual(first.jamo.horizontalStrokes)
    expect(second.jamo.verticalStrokes!.length).toBe(seed.verticalStrokes!.length)
  }, 120000)

  it('ㄱ 첫닿자: 핸들을 심어도 나빠지지 않고, 앵커 수는 그대로에 남은 핸들만 저장된다', async () => {
    // 6문맥 평균이라 ㄱ은 핸들로도 크게 못 줄인다(가는 길게 휘고 고는 짧게 꺾여 한 골격이 타협). 전수 실행은 54%대.
    const samples = await samplesFor('CH', 'ㄱ')
    const seed = (legacyJamos.choseong as Record<string, JamoData>)['ㄱ']
    const straight = fitSkeleton(seed, samples, { maxRounds: 4, minStep: 0.01 })
    const curved = fitSkeleton(seed, samples, { maxRounds: 4, minStep: 0.01, seedHandles: true })
    console.log(`[skeleton ㄱ] 직선 ${(straight.before * 100).toFixed(1)}% → ${(straight.after * 100).toFixed(1)}% · 핸들 → ${(curved.after * 100).toFixed(1)}%`)
    expect(curved.after).toBeLessThanOrEqual(straight.after + 0.01)
    expect(curved.after).toBeLessThan(curved.before)
    const stroke = curved.jamo.strokes![0]
    expect(stroke.points.length).toBe(3)
    // 앵커 자리에 남은 길이 0 핸들은 지워진다.
    for (const point of stroke.points) {
      if (point.handleIn) expect(Math.hypot(point.handleIn.x - point.x, point.handleIn.y - point.y)).toBeGreaterThan(0.002)
      if (point.handleOut) expect(Math.hypot(point.handleOut.x - point.x, point.handleOut.y - point.y)).toBeGreaterThan(0.002)
    }
  }, 120000)

  it('ㄱ 가 계열: 다듬은 공용 골격에서 출발하면 갇히고, 옛 직각 골격을 출발점으로 더하면 벗어난다', async () => {
    const samples = await samplesFor('CH', 'ㄱ', skeletonFamilyChars('right', 'ㄱ'))
    const legacy = (legacyJamos.choseong as Record<string, JamoData>)['ㄱ']
    expect(skeletonSeedVariants(legacy).length).toBe(2)
    // 공용(6문맥 타협) 골격 = 현재 기본 ㄱ. 여기서 가 계열만 다시 fit하면 골짜기에 갇힌다.
    const shared = CHOSEONG_MAP['ㄱ']
    const stuck = fitSkeleton(shared, samples, { seedHandles: true, maxRounds: 4, minStep: 0.01 })
    const multi = fitSkeletonMultiStart(shared, samples, { seedHandles: true, maxRounds: 4, minStep: 0.01, extraStarts: [legacy] })
    console.log(`[skeleton ㄱ right] 공용 출발 ${(stuck.after * 100).toFixed(1)}% · 옛 골격 추가 ${(multi.after * 100).toFixed(1)}%`)
    expect(multi.after).toBeLessThanOrEqual(stuck.after)
    expect(multi.after).toBeLessThan(0.3)
  }, 300000)

  it('ㅅ 첫닿자: 좌표 하강이 평균 xor를 줄이고 획 수·앵커 수는 그대로다', async () => {
    const samples = await samplesFor('CH', 'ㅅ')
    expect(samples.length).toBeGreaterThanOrEqual(4)
    const seed = CHOSEONG_MAP['ㅅ']
    const started = Date.now()
    const result = fitSkeleton(seed, samples, { maxRounds: 3, minStep: 0.01 })
    console.log(`[skeleton ㅅ] xor ${(result.before * 100).toFixed(1)}% → ${(result.after * 100).toFixed(1)}% · ${result.evaluations} evals · ${((Date.now() - started) / 1000).toFixed(1)}s`)
    expect(result.after).toBeLessThanOrEqual(result.before + 1e-9)
    expect(result.jamo.strokes!.map((s) => s.points.length)).toEqual(seed.strokes!.map((s) => s.points.length))
    // 편집 좌표는 0~1로 정규화된다.
    const xs = result.jamo.strokes!.flatMap((s) => s.points.map((p) => p.x))
    expect(Math.min(...xs)).toBeCloseTo(0, 2)
    expect(Math.max(...xs)).toBeCloseTo(1, 2)
    expect(result.jamo.strokes!.every((s) => s.thickness === 0.07)).toBe(true)
  }, 120000)
})

// 전수: NOTO_SKELETON_FIT=1 일 때 초성 19 + 받침 27을 다듬어 baseJamos.json에 쓰고 리포트를 corpus analysis/에 남긴다.
describe.skipIf(!RUN || !process.env.NOTO_SKELETON_FIT)('골격 다듬기 — 전수 적용', () => {
  it('기본 획을 Noto 골격에 맞춰 다시 쓴다', async () => {
    const started = Date.now()
    const file = path.resolve(__dirname, '../data/baseJamos.json')
    const base = JSON.parse(readFileSync(file, 'utf8')) as { choseong: Record<string, JamoData>; jungseong: Record<string, JamoData>; jongseong: Record<string, JamoData>; exportedAt: string }
    type FitPart = 'CH' | 'JO' | 'JU' | 'JU_H' | 'JU_V'
    const report: Record<string, { part: FitPart; before: number; after: number; evaluations: number; contexts: string[] }> = {}
    const only = process.env.NOTO_SKELETON_PARTS?.split(',') as FitPart[] | undefined
    const channelOf: Partial<Record<FitPart, 'horizontalStrokes' | 'verticalStrokes'>> = { JU_H: 'horizontalStrokes', JU_V: 'verticalStrokes' }
    const jobs: { part: FitPart; jamo: string; map: Record<string, JamoData> }[] = [
      ...CHOSEONG_LIST.map((jamo) => ({ part: 'CH' as const, jamo, map: base.choseong })),
      ...JUNGSEONG_LIST.flatMap((jamo) => MIXED.includes(jamo) ? [{ part: 'JU_H' as const, jamo, map: base.jungseong }, { part: 'JU_V' as const, jamo, map: base.jungseong }] : [{ part: 'JU' as const, jamo, map: base.jungseong }]),
      ...JONGSEONG_LIST.filter(Boolean).map((jamo) => ({ part: 'JO' as const, jamo, map: base.jongseong })),
    ].filter((job) => !only || only.includes(job.part))
      // NOTO_SKELETON_JAMOS=ㄱ,ㅋ 처럼 자모 몇 개만 돌릴 때.
      .filter((job) => !process.env.NOTO_SKELETON_JAMOS || process.env.NOTO_SKELETON_JAMOS.split(',').includes(job.jamo))
    for (const job of jobs) {
      const samples = await samplesFor(job.part, job.jamo)
      const seed = job.map[job.jamo]
      if (!seed || samples.length < 3) { console.log(`[skeleton] ${job.part} ${job.jamo}: 문맥 부족(${samples.length}) — 건너뜀`); continue }
      const legacySeed = (legacyJamos[job.part === 'CH' ? 'choseong' : job.part === 'JO' ? 'jongseong' : 'jungseong'] as Record<string, JamoData>)[job.jamo]
      const extraStarts = legacySeed && JSON.stringify(legacySeed) !== JSON.stringify(seed) ? [legacySeed] : []
      const result = fitSkeletonMultiStart(seed, samples, { channel: channelOf[job.part], seedHandles: true, extraStarts, maxMillis: 30_000 })
      if (result.after < result.before) job.map[job.jamo] = result.jamo
      report[`${job.part}:${job.jamo}`] = { part: job.part, before: Number(result.before.toFixed(4)), after: Number(result.after.toFixed(4)), evaluations: result.evaluations, contexts: samples.map((s) => s.char) }
      console.log(`[skeleton] ${job.part} ${job.jamo}: ${(result.before * 100).toFixed(1)}% → ${(result.after * 100).toFixed(1)}% (${result.evaluations} evals, ${((Date.now() - started) / 1000).toFixed(0)}s)`)
      // 첫닿자는 홀자 계열별 변형도 본다. 공용 골격보다 2%p 넘게 좋아질 때만 contextStrokes에 둔다.
      if (job.part !== 'CH') continue
      const shared = job.map[job.jamo]
      const families = (process.env.NOTO_SKELETON_FAMILIES?.split(',') as ('right' | 'bottom' | 'mixed')[] | undefined) ?? ['right', 'bottom', 'mixed']
      // 이번에 돌리는 계열만 새로 정한다. 다른 계열의 변형은 남긴다.
      for (const family of families) delete shared.contextStrokes?.[family]
      if (shared.contextStrokes && Object.keys(shared.contextStrokes).length === 0) delete shared.contextStrokes
      for (const family of families) {
        const familySamples = await samplesFor('CH', job.jamo, skeletonFamilyChars(family, job.jamo))
        if (familySamples.length < 3) continue
        const sharedXor = meanXor(shared, familySamples)
        // 공용 골격이 이미 그 계열에서 충분히 맞으면(25% 미만) 변형을 안 만든다. 획 많은 자모(ㅃ·ㅉ)는 계열 fit이 십수 분 걸린다.
        if (Number.isFinite(sharedXor) && sharedXor < 0.25) { console.log(`[skeleton]   ${job.jamo} ${family}: 공용 ${(sharedXor * 100).toFixed(1)}% — 충분, 건너뜀`); continue }
        const variant = fitSkeletonMultiStart(shared, familySamples, { seedHandles: true, extraStarts: legacySeed ? [legacySeed] : [], maxMillis: 12_000 })
        const keep = Number.isFinite(sharedXor) && variant.after <= sharedXor - 0.02
        if (keep) (shared.contextStrokes ??= {})[family] = variant.jamo.strokes
        report[`${job.part}:${job.jamo}:${family}`] = { part: job.part, before: Number(sharedXor.toFixed(4)), after: Number((keep ? variant.after : sharedXor).toFixed(4)), evaluations: variant.evaluations, contexts: familySamples.map((s) => s.char) }
        console.log(`[skeleton]   ${job.jamo} ${family}: 공용 ${(sharedXor * 100).toFixed(1)}% → 변형 ${(variant.after * 100).toFixed(1)}%${keep ? ' ✓' : ' (버림)'}`)
      }
      // 자모 하나 끝날 때마다 써 둔다. 중간에 끊어도 진행분이 남는다.
      base.exportedAt = new Date().toISOString()
      writeFileSync(file, JSON.stringify(base, null, 2) + '\n')
    }
    base.exportedAt = new Date().toISOString()
    writeFileSync(file, JSON.stringify(base, null, 2) + '\n')
    const source = await RUN!.manifest()
    const reportFile = path.join(CORPUS, source.runId, 'analysis', 'skeleton-fit-report-v1.json')
    const previous = existsSync(reportFile) ? (JSON.parse(readFileSync(reportFile, 'utf8')) as { results?: typeof report }).results ?? {} : {}
    writeFileSync(reportFile, JSON.stringify({ schema: 'skeleton-fit-report-v1', generatedAt: new Date().toISOString(), meaning: '자모 기본 획을 모델 상자에 놓고 Noto 부품 잉크(네 변으로 자름)와의 평균 xor를 좌표 하강으로 줄인 결과. 두께·획 수 고정. 부품 일부만 돌리면 나머지는 이전 결과를 유지한다.', results: { ...previous, ...report } }, null, 2))
    expect(Object.keys(report).length).toBeGreaterThan(only || process.env.NOTO_SKELETON_JAMOS ? 0 : 30)
    // 기본 획 파일이 여전히 읽히는지.
    expect(meanXor(base.choseong['ㅅ'], await samplesFor('CH', 'ㅅ'))).toBeLessThan(1)
  }, 60 * 60 * 1000)
})
