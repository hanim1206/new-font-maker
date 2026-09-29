import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'

/**
 * 홀자 칸 평균표. 11,172자를 화면 · 추출과 같은 상자로 놓고 홀자 채널(JU · JU_H · JU_V)의 상자 폭 · 높이(em)를
 * 받침 없음 · 있음으로 나눠 평균 낸다. 줄기 마스터가 오프셋(em)을 상자 좌표로 바꿀 때와 마스터 캔버스 비율에 쓴다.
 * 오래 걸려서 `MEDIAL_BOX_CENSUS=1`일 때만 돌고, 결과를 `src/data/medialBoxEm.json`에 쓴다:
 * `MEDIAL_BOX_CENSUS=1 npx vitest run src-next/medial-box-census.test.ts`
 */

const MODEL = JSON.parse(readFileSync(fileURLToPath(new URL('../public/noto-preset/model.json', import.meta.url)), 'utf8')) as NotoPresetModelBundle
const OUT = fileURLToPath(new URL('../src/data/medialBoxEm.json', import.meta.url))
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
const CHANNEL_OF: Record<string, 'strokes' | 'horizontalStrokes' | 'verticalStrokes'> = { JU: 'strokes', JU_H: 'horizontalStrokes', JU_V: 'verticalStrokes' }

describe.skipIf(!process.env.MEDIAL_BOX_CENSUS)('홀자 칸 평균표', () => {
  beforeAll(() => {
    const memory = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (key: string) => memory.get(key) ?? null, setItem: (key: string, value: string) => memory.set(key, value), removeItem: (key: string) => memory.delete(key) })
  })
  afterAll(() => { vi.unstubAllGlobals() })

  it('11,172자', async () => {
    const [exportUtils, deltaStore, exportStore] = await Promise.all([import('../src/services/fontExportUtils'), import('./layoutDeltaStore'), import('./fontExportStore')])
    const placementOf = exportStore.placementResolverOf(MODEL, deltaStore.layoutDeltaSnapshot())
    const sums = new Map<string, { n: number; width: number; height: number }>()
    for (let code = 0xac00; code <= 0xd7a3; code += 1) {
      const index = code - 0xac00
      const jung = JUNG[Math.floor((index % (21 * 28)) / 28)]
      const final = index % 28 === 0 ? 'open' : 'closed'
      const data = exportUtils.collectGlyphDataWithPlacement(String.fromCharCode(code), placementOf)
      if (!data || data.placementKind !== 'boxes') continue
      const seen = new Set<string>()
      for (const item of data.strokes) {
        const part = (item.beakGroup ?? '').split(':')[0]
        const channel = CHANNEL_OF[part]
        if (!channel) continue
        const key = `${jung}|${channel}|${final}`
        if (seen.has(key)) continue
        seen.add(key)
        const sum = sums.get(key) ?? { n: 0, width: 0, height: 0 }
        sum.n += 1; sum.width += item.box.width; sum.height += item.box.height
        sums.set(key, sum)
      }
    }
    const table: Record<string, Record<string, Record<string, { width: number; height: number }>>> = {}
    for (const [key, sum] of sums) {
      const [jung, channel, final] = key.split('|')
      table[jung] ??= {}
      table[jung][channel] ??= {}
      table[jung][channel][final] = { width: Number((sum.width / sum.n).toFixed(4)), height: Number((sum.height / sum.n).toFixed(4)) }
    }
    expect(Object.keys(table)).toHaveLength(21)
    writeFileSync(OUT, `${JSON.stringify({ note: '홀자 채널 상자의 평균 폭 · 높이(em). open = 받침 없음, closed = 받침 있음. medial-box-census.test.ts가 만든다.', box: table }, null, 2)}\n`)
  }, 600000)
})
