import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNotoPresetReader } from '../../scripts/reference-lab/notoPresetApi'
import { CHOSEONG_LIST, CHOSEONG_MAP, JONGSEONG_LIST } from '../data/Hangul'
import { modelIdentityOf } from './notoVariationModel'
import type { NotoOutline } from './notoOutlineInk'
import { buildSkeletonSample, fitSkeleton, meanXor, skeletonContextChars, skeletonParams } from './skeletonFit'
import type { SkeletonSample } from './skeletonFit'
import type { JamoData } from '../types'

const CORPUS = path.resolve(__dirname, '../../.reference-fonts/guide-corpus')
const RUN = existsSync(CORPUS) ? createNotoPresetReader(CORPUS) : null

describe('골격 다듬기 — 파라미터', () => {
  it('앵커 x·y와 있는 핸들만 자유 좌표로 잡는다', () => {
    const params = skeletonParams(CHOSEONG_MAP['ㅅ'])
    // ㅅ: 획 2 × (앵커 2 → 4) + handleOut 1개씩(2) = 12
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

async function samplesFor(part: 'CH' | 'JO', jamo: string): Promise<SkeletonSample[]> {
  const model = await RUN!.model()
  const map = await outlines()
  return skeletonContextChars(part, jamo).flatMap((char) => {
    const outline = map.get(char)
    const sample = outline ? buildSkeletonSample({ char, identity: identityOfChar(char), part, outline, model }) : null
    return sample ? [sample] : []
  })
}

describe.skipIf(!RUN)('골격 다듬기 — 모델', () => {
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
    const base = JSON.parse(readFileSync(file, 'utf8')) as { choseong: Record<string, JamoData>; jongseong: Record<string, JamoData>; exportedAt: string }
    const report: Record<string, { part: 'CH' | 'JO'; before: number; after: number; evaluations: number; contexts: string[] }> = {}
    const jobs: { part: 'CH' | 'JO'; jamo: string; map: Record<string, JamoData> }[] = [
      ...CHOSEONG_LIST.map((jamo) => ({ part: 'CH' as const, jamo, map: base.choseong })),
      ...JONGSEONG_LIST.filter(Boolean).map((jamo) => ({ part: 'JO' as const, jamo, map: base.jongseong })),
    ]
    for (const job of jobs) {
      const samples = await samplesFor(job.part, job.jamo)
      const seed = job.map[job.jamo]
      if (!seed || samples.length < 3) { console.log(`[skeleton] ${job.part} ${job.jamo}: 문맥 부족(${samples.length}) — 건너뜀`); continue }
      const result = fitSkeleton(seed, samples)
      if (result.after < result.before) job.map[job.jamo] = result.jamo
      report[`${job.part}:${job.jamo}`] = { part: job.part, before: Number(result.before.toFixed(4)), after: Number(result.after.toFixed(4)), evaluations: result.evaluations, contexts: samples.map((s) => s.char) }
      console.log(`[skeleton] ${job.part} ${job.jamo}: ${(result.before * 100).toFixed(1)}% → ${(result.after * 100).toFixed(1)}% (${result.evaluations} evals, ${((Date.now() - started) / 1000).toFixed(0)}s)`)
    }
    base.exportedAt = new Date().toISOString()
    writeFileSync(file, JSON.stringify(base, null, 2) + '\n')
    const source = await RUN!.manifest()
    writeFileSync(path.join(CORPUS, source.runId, 'analysis', 'skeleton-fit-report-v1.json'), JSON.stringify({ schema: 'skeleton-fit-report-v1', generatedAt: new Date().toISOString(), meaning: '자모 기본 획을 모델 상자에 놓고 Noto 부품 잉크(네 변으로 자름)와의 평균 xor를 좌표 하강으로 줄인 결과. 두께·획 수 고정.', results: report }, null, 2))
    expect(Object.keys(report).length).toBeGreaterThan(30)
    // 기본 획 파일이 여전히 읽히는지.
    expect(meanXor(base.choseong['ㅅ'], await samplesFor('CH', 'ㅅ'))).toBeLessThan(1)
  }, 60 * 60 * 1000)
})
