import { mkdir, writeFile } from 'node:fs/promises'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * 앱과 같은 파이프라인으로 기본 스토어 상태의 OTF를 파일로 만든다. 브라우저 없이 iOS 검사 · fontTools 대조용.
 *
 *     npx vite-node scripts/font-check/exportSampleOtf.ts [출력 경로] [--name 꾸불체] [--ascii Kkubul] [--revision 1] [--font-data 폰트데이터.json]
 * `--font-data`는 `font_projects.font_data` 값(또는 그 행의 JSON 배열)을 앱처럼 스토어에 적용한 뒤 추출한다.
 *
 * 기본 출력은 `reference-data/font-check/샘플.otf`. 끝에 `validateOpenTypeForIOS` 결과를 찍는다.
 */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..')

function argValue(flag: string): string | undefined {
  const index = process.argv.indexOf(flag)
  return index >= 0 ? process.argv[index + 1] : undefined
}

// 스토어가 브라우저 저장소를 기대한다. 메모리로 대신한다.
const memory = new Map<string, string>()
;(globalThis as unknown as { localStorage: unknown }).localStorage = {
  getItem: (key: string) => memory.get(key) ?? null,
  setItem: (key: string, value: string) => memory.set(key, value),
  removeItem: (key: string) => memory.delete(key),
}

const familyName = argValue('--name') ?? '꾸불체'
const asciiFamilyName = argValue('--ascii')
const revision = Number(argValue('--revision') ?? '1')
const positional = process.argv.slice(2).filter((arg, index, all) => !arg.startsWith('--') && !all[index - 1]?.startsWith('--'))
const outPath = path.resolve(positional[0] ?? path.join(ROOT, 'reference-data', 'font-check', `${familyName}.otf`))

const [{ generateFontBuffer }, exportStore, deltaStore, validation] = await Promise.all([
  import('../../src/services/fontGenerator'),
  import('../../src-next/fontExportStore'),
  import('../../src-next/layoutDeltaStore'),
  import('../../src/services/openTypeValidation'),
])
const fontDataPath = argValue('--font-data')
if (fontDataPath) {
  const raw = JSON.parse(readFileSync(path.resolve(fontDataPath), 'utf8'))
  const value = Array.isArray(raw) ? raw[0].font_data : raw.font_data ?? raw
  const [{ applyFontData }, { useLayoutDeltaStore }] = await Promise.all([
    import('../../src/services/fontDataBridge'),
    import('../../src-next/layoutDeltaStore'),
  ])
  const applied = applyFontData(value)
  if (!applied.ok) throw new Error(`폰트 데이터 적용 실패: ${applied.error.message}`)
  useLayoutDeltaStore.getState().restore({ rules: applied.data.layoutDelta?.rules ?? {} })
}
const model = JSON.parse(readFileSync(path.join(ROOT, 'public', 'noto-preset', 'model.json'), 'utf8'))
const placementOf = exportStore.placementResolverOf(model, deltaStore.layoutDeltaSnapshot())

const started = performance.now()
const result = await generateFontBuffer({ familyName, asciiFamilyName, placementOf, revision })
if (!result.success || !result.bytes) throw new Error(result.error ?? '추출 실패')
await mkdir(path.dirname(outPath), { recursive: true })
await writeFile(outPath, Buffer.from(result.bytes))

console.log(`${outPath} · ${(result.bytes.byteLength / 1_000_000).toFixed(2)} MB · 글리프 ${result.glyphCount} · 빈 글자 ${result.skippedChars?.length ?? 0} · ${Math.round(performance.now() - started)}ms`)
console.log('이름:', result.identity)
const report = result.validation ?? validation.validateOpenTypeForIOS(result.bytes)
console.log(validation.summarizeValidation(report))
for (const issue of report.issues) console.log(`  [${issue.severity}] ${issue.code}: ${issue.message}`)
process.exit(report.ok ? 0 : 1)
