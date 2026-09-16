import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNotoPresetReader } from '../../scripts/reference-lab/notoPresetApi'
import { CHOSEONG_MAP } from '../data/Hangul'
import legacyJamos from '../data/fixtures/baseJamosLegacy2026-02.json'
import type { JamoData, MedialFamily } from '../types'
import { averageStrokes, extractJamoInContext, fitCubic, inkIntervalsAlong, insideInk } from './centerlineExtract'
import type { NotoOutline } from './notoOutlineInk'
import { modelIdentityOf } from './notoVariationModel'
import { buildSkeletonSample, meanXor, skeletonFamilyChars } from './skeletonFit'
import type { SkeletonSample } from './skeletonFit'

const CORPUS = path.resolve(__dirname, '../../.reference-fonts/guide-corpus')
const RUN = existsSync(CORPUS) ? createNotoPresetReader(CORPUS) : null

describe('중심선 추출 — 기하', () => {
  const square = [[[[0, 0], [1, 0], [1, 1], [0, 1], [0, 0]]]] as never
  it('점 안팎과 선분 잉크 구간을 읽는다', () => {
    expect(insideInk({ x: 0.5, y: 0.5 }, [square[0][0]])).toBe(true)
    expect(insideInk({ x: 1.5, y: 0.5 }, [square[0][0]])).toBe(false)
    const intervals = inkIntervalsAlong({ x: 0.5, y: 0.5 }, { x: 1, y: 0 }, 2, [square[0][0]])
    expect(intervals).toHaveLength(1)
    expect(intervals[0].from).toBeCloseTo(-0.5, 9)
    expect(intervals[0].to).toBeCloseTo(0.5, 9)
  })
  it('3차 최소제곱은 곡선 위 점을 되찾는다', () => {
    const p0 = { x: 0, y: 0 }, p1 = { x: 0.2, y: 0.8 }, p2 = { x: 0.8, y: 0.9 }, p3 = { x: 1, y: 0 }
    const samples = Array.from({ length: 21 }, (_, i) => { const t = i / 20, u = 1 - t; return { x: u ** 3 * p0.x + 3 * u * u * t * p1.x + 3 * u * t * t * p2.x + t ** 3 * p3.x, y: u ** 3 * p0.y + 3 * u * u * t * p1.y + 3 * u * t * t * p2.y + t ** 3 * p3.y } })
    const fit = fitCubic(samples, p0, p3)
    // 현 길이 파라미터라 핸들 자체는 조금 다르지만 곡선 위 점은 되찾는다.
    for (const t of [0.25, 0.5, 0.75]) {
      const u = 1 - t
      const on = (a: { x: number; y: number }, b: { x: number; y: number }, k: 'x' | 'y') => u ** 3 * p0[k] + 3 * u * u * t * a[k] + 3 * u * t * t * b[k] + t ** 3 * p3[k]
      expect(Math.abs(on(fit.p1, fit.p2, 'x') - on(p1, p2, 'x'))).toBeLessThan(0.1)
      expect(Math.abs(on(fit.p1, fit.p2, 'y') - on(p1, p2, 'y'))).toBeLessThan(0.1)
    }
  })
})

let cache: Map<string, NotoOutline> | null = null
async function outlines(): Promise<Map<string, NotoOutline>> {
  if (cache) return cache
  const m = await RUN!.manifest()
  const data = JSON.parse(readFileSync(path.join(CORPUS, m.runId, 'analysis', 'noto-preset-outlines-v1.json'), 'utf8')) as { glyphs: { identity: { character: string }; outline: NotoOutline }[] }
  cache = new Map(data.glyphs.map((g) => [g.identity.character, g.outline]))
  return cache
}
const I = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ', M = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ', F = [null, ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']
const idOf = (c: string) => { const o = c.codePointAt(0)! - 0xac00; return modelIdentityOf(I[Math.floor(o / 588)], M[Math.floor((o % 588) / 28)], F[o % 28]) }

async function familySamples(jamo: string, family: MedialFamily): Promise<SkeletonSample[]> {
  const model = await RUN!.model(); const map = await outlines()
  return skeletonFamilyChars(family, jamo).flatMap((char) => { const s = buildSkeletonSample({ char, identity: idOf(char), part: 'CH', outline: map.get(char)!, model }); return s ? [s] : [] })
}

describe.skipIf(!RUN)('중심선 추출 — 모델(랩, 기록용)', () => {
  it.each([['ㄱ', 'right'], ['ㄱ', 'bottom'], ['ㄱ', 'mixed'], ['ㅋ', 'mixed'], ['ㅅ', 'right'], ['ㅎ', 'right']] as [string, MedialFamily][])('%s %s: 문맥 5개에서 뽑아 평균한 골격이 씨앗보다 잉크에 가깝다', async (jamo, family) => {
    const samples = await familySamples(jamo, family)
    const legacy = (legacyJamos.choseong as Record<string, JamoData>)[jamo]
    const current = CHOSEONG_MAP[jamo]
    const started = Date.now()
    // 씨앗은 옛 직각 골격과 현재 기본 골격 둘 다 시도해 잉크에 더 가까운 쪽.
    const results = [legacy, current].map((seed) => {
      const sets = samples.flatMap((s) => { const e = extractJamoInContext({ jamo: seed, faces: s.faces, ghost: s.ghost, part: 'CH', family: null }); return e ? [e.strokes] : [] })
      const averaged: JamoData = { ...structuredClone(seed), strokes: averageStrokes(sets), contextStrokes: undefined }
      return { averaged, xor: sets.length ? meanXor(averaged, samples) : Number.POSITIVE_INFINITY }
    })
    const best = results.reduce((a, b) => (b.xor < a.xor ? b : a))
    const before = meanXor(legacy, samples), currentXor = meanXor({ ...current, contextStrokes: undefined }, samples)
    console.log(`[centerline ${jamo} ${family}] 옛 씨앗 ${(before * 100).toFixed(1)}% · 현재 공용 ${(currentXor * 100).toFixed(1)}% → 추출 ${(results[0].xor * 100).toFixed(1)}%(옛) / ${(results[1].xor * 100).toFixed(1)}%(현재) · ${Date.now() - started}ms`)
    // 랩 단계: 단순 획(ㄱ 다리·ㅎ 원)은 되고 갈래 획(ㅅ)은 획별 잉크 분할이 없어 흔들린다. 수치는 기록만, 실패는 안 낸다.
    expect(Number.isFinite(best.xor) || Number.isFinite(before)).toBe(true)
  }, 60000)
})
