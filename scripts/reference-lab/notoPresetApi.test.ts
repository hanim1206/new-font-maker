import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { createNotoPresetReader, NOTO_PRESET_SCHEMA } from './notoPresetApi'

const FONT = { id: 'noto', fileSha256: 'f'.repeat(64), axes: { wght: 400 }, unitsPerEm: 1000 }
const STAGE_KEYS = { outline: 'o'.repeat(64), initial: 'i'.repeat(64), medial: 'm'.repeat(64), final: 'f'.repeat(64) }

async function fixture(runs: { id: string; glyphs: unknown[]; schema?: string }[]): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'noto-preset-'))
  for (const run of runs) {
    const analysis = path.join(root, run.id, 'analysis')
    await mkdir(analysis, { recursive: true })
    await writeFile(path.join(analysis, `${NOTO_PRESET_SCHEMA}.json`), JSON.stringify({
      schema: run.schema ?? NOTO_PRESET_SCHEMA, font: FONT, stageKeys: STAGE_KEYS,
      coordinateFrame: 'glyph-normalized-baselines-with-font-unit-outline', glyphCount: run.glyphs.length, glyphs: run.glyphs,
    }))
  }
  return root
}

const glyph = (character: string, codepoint: number) => ({
  identity: { character, codepoint, initialJamo: 'ㄱ', medialJamo: 'ㅏ', finalJamo: null, contextId: 'right' },
  outline: { unitsPerEm: 1000, operations: [] },
  baselines: {},
})

describe('createNotoPresetReader', () => {
  it('가장 최근 run의 export를 읽어 manifest와 글자를 codepoint로 준다', async () => {
    const root = await fixture([{ id: 'a'.repeat(24), glyphs: [glyph('가', 0xac00), glyph('각', 0xac01)] }])
    const reader = createNotoPresetReader(root)
    const manifest = await reader.manifest()
    expect(manifest.schema).toBe(NOTO_PRESET_SCHEMA)
    expect(manifest.glyphCount).toBe(2)
    expect(manifest.runId).toBe('a'.repeat(24))
    expect(manifest.stageKeys.outline).toBe(STAGE_KEYS.outline)
    expect((await reader.glyph(0xac01))?.identity.character).toBe('각')
    expect(await reader.glyph(0xac02)).toBeNull()
  })

  it('export가 없거나 형식이 다르면 설명하는 오류를 던진다', async () => {
    await expect(createNotoPresetReader(await fixture([])).manifest()).rejects.toThrow('export가 없습니다')
    const wrong = await fixture([{ id: 'b'.repeat(24), glyphs: [], schema: 'other' }])
    await expect(createNotoPresetReader(wrong).manifest()).rejects.toThrow('형식이 다릅니다')
    const broken = await fixture([{ id: 'c'.repeat(24), glyphs: [{ identity: {} }] }])
    await expect(createNotoPresetReader(broken).manifest()).rejects.toThrow('손상')
  })
})
