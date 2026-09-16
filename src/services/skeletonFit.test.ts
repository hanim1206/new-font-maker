import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNotoPresetReader } from '../../scripts/reference-lab/notoPresetApi'
import { CHOSEONG_LIST, CHOSEONG_MAP, JONGSEONG_LIST, JUNGSEONG_LIST, JUNGSEONG_MAP } from '../data/Hangul'
import { modelIdentityOf } from './notoVariationModel'
import type { NotoOutline } from './notoOutlineInk'
import { buildSkeletonSample, fitSkeleton, meanXor, skeletonContextChars, skeletonParams } from './skeletonFit'
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
async function samplesFor(part: 'CH' | 'JO' | 'JU' | 'JU_H' | 'JU_V', jamo: string): Promise<SkeletonSample[]> {
  const model = await RUN!.model()
  const map = await outlines()
  const listPart = part === 'CH' || part === 'JO' ? part : 'JU'
  return skeletonContextChars(listPart, jamo).flatMap((char) => {
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
    for (const job of jobs) {
      const samples = await samplesFor(job.part, job.jamo)
      const seed = job.map[job.jamo]
      if (!seed || samples.length < 3) { console.log(`[skeleton] ${job.part} ${job.jamo}: 문맥 부족(${samples.length}) — 건너뜀`); continue }
      const result = fitSkeleton(seed, samples, { channel: channelOf[job.part], seedHandles: true })
      if (result.after < result.before) job.map[job.jamo] = result.jamo
      report[`${job.part}:${job.jamo}`] = { part: job.part, before: Number(result.before.toFixed(4)), after: Number(result.after.toFixed(4)), evaluations: result.evaluations, contexts: samples.map((s) => s.char) }
      console.log(`[skeleton] ${job.part} ${job.jamo}: ${(result.before * 100).toFixed(1)}% → ${(result.after * 100).toFixed(1)}% (${result.evaluations} evals, ${((Date.now() - started) / 1000).toFixed(0)}s)`)
    }
    base.exportedAt = new Date().toISOString()
    writeFileSync(file, JSON.stringify(base, null, 2) + '\n')
    const source = await RUN!.manifest()
    const reportFile = path.join(CORPUS, source.runId, 'analysis', 'skeleton-fit-report-v1.json')
    const previous = existsSync(reportFile) ? (JSON.parse(readFileSync(reportFile, 'utf8')) as { results?: typeof report }).results ?? {} : {}
    writeFileSync(reportFile, JSON.stringify({ schema: 'skeleton-fit-report-v1', generatedAt: new Date().toISOString(), meaning: '자모 기본 획을 모델 상자에 놓고 Noto 부품 잉크(네 변으로 자름)와의 평균 xor를 좌표 하강으로 줄인 결과. 두께·획 수 고정. 부품 일부만 돌리면 나머지는 이전 결과를 유지한다.', results: { ...previous, ...report } }, null, 2))
    expect(Object.keys(report).length).toBeGreaterThan(only ? 5 : 30)
    // 기본 획 파일이 여전히 읽히는지.
    expect(meanXor(base.choseong['ㅅ'], await samplesFor('CH', 'ㅅ'))).toBeLessThan(1)
  }, 60 * 60 * 1000)
})
