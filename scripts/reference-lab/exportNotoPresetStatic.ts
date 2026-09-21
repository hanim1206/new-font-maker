import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { NOTO_PRESET_CHUNK_SIZE, notoPresetChunkFile, notoPresetChunkIndex } from '../../src-next/notoPresetGlyphs'
import type { NotoPresetGlyphChunk } from '../../src-next/notoPresetGlyphs'
import { createNotoPresetReader } from './notoPresetApi'

/**
 * dev API(`notoPresetApi`)가 주는 것과 같은 내용을 `public/noto-preset/`에 정적 파일로 쓴다.
 * 같은 reader를 그대로 쓰므로 manifest·모델·xor·글자는 API 응답과 바이트 단위로 같다.
 *
 * `npm run build`에 넣지 않는다. 분석값이 배포 프리셋이 되는 건 사람이 이 명령을 돌리고 커밋할 때뿐이다.
 */

const HANGUL_BASE = 0xac00
const HANGUL_COUNT = 11172
const HERE = path.dirname(fileURLToPath(import.meta.url))

export interface StaticExportSummary {
  directory: string
  glyphCount: number
  chunkCount: number
  bytes: { manifest: number; model: number; xor: number; glyphs: number; largestChunk: number }
}

export async function exportNotoPresetStatic(corpusDirectory: string, outputDirectory: string): Promise<StaticExportSummary> {
  const reader = createNotoPresetReader(corpusDirectory)
  const [manifest, model, xor] = await Promise.all([reader.manifest(), reader.model(), reader.xor()])

  const chunks = new Map<number, NotoPresetGlyphChunk>()
  let glyphCount = 0
  for (let offset = 0; offset < HANGUL_COUNT; offset += 1) {
    const codepoint = HANGUL_BASE + offset
    const glyph = await reader.glyph(codepoint)
    if (!glyph) continue
    const index = notoPresetChunkIndex(codepoint)
    if (index === null) continue
    const chunk = chunks.get(index) ?? {}
    chunk[String(codepoint)] = glyph
    chunks.set(index, chunk)
    glyphCount += 1
  }
  // 묶음에 못 담는 글자가 있으면 배포본에서 조용히 빠지므로 여기서 멈춘다.
  if (glyphCount !== manifest.glyphCount) throw new Error(`묶음에 담은 글자(${glyphCount})가 export의 글자 수(${manifest.glyphCount})와 다릅니다.`)

  // 옛 묶음이 남아 섞이지 않게 통째로 다시 쓴다.
  await rm(outputDirectory, { recursive: true, force: true })
  await mkdir(path.join(outputDirectory, 'glyphs'), { recursive: true })
  const write = async (file: string, value: unknown) => {
    const text = JSON.stringify(value)
    await writeFile(path.join(outputDirectory, file), text)
    return Buffer.byteLength(text)
  }
  const bytes = { manifest: await write('manifest.json', manifest), model: await write('model.json', model), xor: await write('xor.json', xor), glyphs: 0, largestChunk: 0 }
  for (const [index, chunk] of chunks) {
    const size = await write(notoPresetChunkFile(index), chunk)
    bytes.glyphs += size
    bytes.largestChunk = Math.max(bytes.largestChunk, size)
  }
  await copyFile(path.join(HERE, 'noto-preset-OFL.txt'), path.join(outputDirectory, 'OFL.txt'))
  return { directory: outputDirectory, glyphCount, chunkCount: chunks.size, bytes }
}

// vite-node는 argv에서 스크립트 경로를 지우므로 경로 비교로는 직접 실행인지 알 수 없다. 테스트가 import할 때만 건너뛴다.
if (!process.env.VITEST) {
  const root = path.resolve(HERE, '../..')
  const summary = await exportNotoPresetStatic(path.join(root, '.reference-fonts/guide-corpus'), path.join(root, 'public/noto-preset'))
  const megabytes = (value: number) => `${(value / 1e6).toFixed(2)}MB`
  console.log(`글자 ${summary.glyphCount}자 → 묶음 ${summary.chunkCount}개(묶음당 ${NOTO_PRESET_CHUNK_SIZE}자), 글자 합계 ${megabytes(summary.bytes.glyphs)}, 가장 큰 묶음 ${megabytes(summary.bytes.largestChunk)}`)
  console.log(`모델 ${megabytes(summary.bytes.model)} · xor ${megabytes(summary.bytes.xor)} · manifest ${summary.bytes.manifest}B → ${summary.directory}`)
}
