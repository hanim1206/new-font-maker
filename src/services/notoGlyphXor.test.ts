import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNotoPresetReader } from '../../scripts/reference-lab/notoPresetApi'
import approved from '../../reference-data/preset-candidates/noto-approved-guide-inputs.v1.json'
import { CHOSEONG_MAP, JONGSEONG_MAP, JUNGSEONG_MAP } from '../data/Hangul'
import { DEFAULT_STYLE } from '../stores/globalStyleStore'
import { DEFAULT_LAYOUT_SCHEMAS } from '../utils/layoutCalculator'
import { glyphXorAgainstNoto } from './notoGlyphXor'
import type { NotoOutline } from './notoOutlineInk'

const JAMO_MAPS = { choseong: CHOSEONG_MAP, jungseong: JUNGSEONG_MAP, jongseong: JONGSEONG_MAP }

describe('glyphXorAgainstNoto', () => {
  it('승인 가를 앱 기본 획·기본 레이아웃으로 그려 Noto와 비교하면 유한한 비율이 나온다', () => {
    const entry = (approved as unknown as { cases: { identity: { character: string }; stages: { outline: { observation: NotoOutline } } }[] }).cases.find((c) => c.identity.character === '가')!
    const result = glyphXorAgainstNoto({ char: '가', outline: entry.stages.outline.observation, jamoMaps: JAMO_MAPS, schemas: DEFAULT_LAYOUT_SCHEMAS, globalStyle: DEFAULT_STYLE })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.xorRatio).toBeGreaterThan(0)
    expect(result.value.xorRatio).toBeLessThan(3)
    expect(result.value.inkRatio).toBeGreaterThan(0.2)
  })

  it('한글이 아니면 이유를 말하고 실패한다', () => {
    expect(glyphXorAgainstNoto({ char: 'A', outline: { unitsPerEm: 1000, operations: [] }, jamoMaps: JAMO_MAPS, schemas: DEFAULT_LAYOUT_SCHEMAS, globalStyle: DEFAULT_STYLE }).ok).toBe(false)
  })
})

// 전수 리포트는 무겁다(11,172자). NOTO_XOR_REPORT=1 일 때만 돌리고 corpus analysis/에 쓴다.
const CORPUS = path.resolve(__dirname, '../../.reference-fonts/guide-corpus')
function locateExport(): { run: string; file: string } | null {
  if (!process.env.NOTO_XOR_REPORT || !existsSync(CORPUS)) return null
  for (const run of readdirSync(CORPUS).filter((name) => /^[a-f0-9]{24}$/.test(name))) {
    const file = path.join(CORPUS, run, 'analysis', 'noto-preset-outlines-v1.json')
    if (existsSync(file)) return { run, file }
  }
  return null
}
const exportSource = locateExport()

describe('전수 글자 xor 리포트', () => {
  it.skipIf(!exportSource)('앱 기본 획을 모델 상자(칸 해석 함수)에 놓고 11,172자를 그려 Noto 대비 xor를 낸다', async () => {
    const { run, file } = exportSource!
    const data = JSON.parse(readFileSync(file, 'utf8')) as { stageKeys: Record<string, string>; glyphs: { identity: { character: string }; outline: NotoOutline }[] }
    const model = await createNotoPresetReader(CORPUS).model()
    const characters: Record<string, { xor: number; ink: number; placement: 'boxes' | 'schema' } | { error: string }> = {}
    const started = Date.now()
    for (const glyph of data.glyphs) {
      const result = glyphXorAgainstNoto({ char: glyph.identity.character, outline: glyph.outline, jamoMaps: JAMO_MAPS, schemas: DEFAULT_LAYOUT_SCHEMAS, globalStyle: DEFAULT_STYLE, model })
      characters[glyph.identity.character] = result.ok ? { xor: Number(result.value.xorRatio.toFixed(4)), ink: Number(result.value.inkRatio.toFixed(4)), placement: result.value.placement } : { error: result.message }
    }
    const values = Object.values(characters).flatMap((v) => 'xor' in v ? [v.xor] : []).sort((a, b) => a - b)
    const modelPlaced = Object.values(characters).filter((v) => 'placement' in v && v.placement === 'boxes').length
    const summary = {
      schema: 'noto-glyph-xor-v1', corpusRun: run, stageKeys: data.stageKeys, generatedAt: new Date().toISOString(),
      source: 'app-default-strokes+noto-model-boxes(fallback:default-layout-schemas)+default-global-style',
      meaning: '앱 기본 획을 변화량 모델 상자(칸 해석 함수)에 놓고 기본 전역 스타일로 그린 잉크와 Noto 글자 윤곽의 xor 면적 / Noto 면적. 상자를 못 푼 글자는 기본 레이아웃 스키마. 사용자 편집은 반영 안 됨. 게이트 아님.',
      count: Object.keys(characters).length, okCount: values.length, modelPlaced,
      xor: { median: values[Math.floor(values.length / 2)] ?? null, p95: values[Math.min(values.length - 1, Math.floor(0.95 * (values.length - 1)))] ?? null, max: values[values.length - 1] ?? null },
      elapsedSeconds: Number(((Date.now() - started) / 1000).toFixed(1)),
      characters,
    }
    mkdirSync(path.join(CORPUS, run, 'analysis'), { recursive: true })
    writeFileSync(path.join(CORPUS, run, 'analysis', 'noto-glyph-xor-v1.json'), JSON.stringify(summary))
    console.log(`[glyph xor] ${values.length}/${summary.count} ok · model boxes ${modelPlaced} · median ${(summary.xor.median! * 100).toFixed(1)}% · p95 ${(summary.xor.p95! * 100).toFixed(1)}% · ${summary.elapsedSeconds}s`)
    expect(values.length).toBeGreaterThan(11000)
  }, 20 * 60 * 1000)
})
