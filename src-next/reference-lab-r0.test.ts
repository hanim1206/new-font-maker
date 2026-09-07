import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const CATALOG_URL = new URL('../reference-data/font-catalog.v1.json', import.meta.url)
const LEGACY_MANIFEST_URL = new URL('../public/references/vertical-vowel-gap.manifest.json', import.meta.url)
const PACKAGE_URL = new URL('../package.json', import.meta.url)
const SERVER_URL = new URL('../scripts/reference-lab/server.py', import.meta.url)
const START_URL = new URL('../scripts/reference-lab/start.mjs', import.meta.url)
const SHA256 = /^[0-9a-f]{64}$/
const EXPECTED_FONT_IDS = [
  'noto-sans-kr',
  'ibm-plex-sans-kr',
  'nanum-gothic',
  'dotum',
  'gowun-dodum',
  'black-han-sans',
]

interface ReferenceFontRecord {
  id: string
  family: string
  fileName: string
  fileSha256: string
  version: string
  source: string
  license: string
  weight: number
  axes: Record<string, number>
  role?: unknown
  aggregation?: unknown
}

interface ReferenceDisplayContract {
  unitsPerEm: number
  baselineY: number
  viewBox: number[]
  xOrigin: number
  projection: string
  inkAutofit: boolean
  individualCentering: boolean
  advanceNormalization: boolean
}

interface ReferenceFontCatalog {
  schema: string
  version: number
  display: ReferenceDisplayContract
  fonts: ReferenceFontRecord[]
}

interface LegacyManifest {
  fonts: Array<Omit<ReferenceFontRecord, 'axes'> & { aggregation: string; role: string }>
}

interface PackageManifest {
  scripts?: Record<string, string>
}

const catalog = JSON.parse(readFileSync(CATALOG_URL, 'utf8')) as ReferenceFontCatalog
const legacy = JSON.parse(readFileSync(LEGACY_MANIFEST_URL, 'utf8')) as LegacyManifest
const packageManifest = JSON.parse(readFileSync(PACKAGE_URL, 'utf8')) as PackageManifest

describe('Reference Lab R0 정적 계약', () => {
  it('vertical-vowel-gap과 같은 공통 원점·baseline 화면을 사용하고 개별 맞춤을 금지한다', () => {
    expect(catalog).toMatchObject({
      schema: 'reference-font-catalog-v1',
      version: 1,
      display: {
        unitsPerEm: 1000,
        baselineY: 880,
        viewBox: [-120, -120, 1240, 1240],
        xOrigin: 0,
        projection: 'matrix(1000/nativeUPM 0 0 -1000/nativeUPM 0 880)',
        inkAutofit: false,
        individualCentering: false,
        advanceNormalization: false,
      },
    })
    expect(legacy.fonts).toHaveLength(6)
  })

  it('동일한 무료폰트 6종과 provenance를 동적 corpus 원본으로 승격한다', () => {
    expect(catalog.fonts.map(({ id }) => id)).toEqual(expect.arrayContaining(EXPECTED_FONT_IDS))
    expect(new Set(catalog.fonts.map(({ id }) => id)).size).toBe(catalog.fonts.length)
    expect(new Set(catalog.fonts.map(({ fileName }) => fileName)).size).toBe(catalog.fonts.length)

    const legacyById = new Map(legacy.fonts.map((font) => [font.id, font]))
    for (const expectedId of EXPECTED_FONT_IDS) {
      const font = catalog.fonts.find(({ id }) => id === expectedId)
      expect(font, `${expectedId} catalog 항목이 필요합니다.`).toBeDefined()
      if (!font) continue
      const legacyFont = legacyById.get(font.id)
      expect(legacyFont, `${font.id} legacy evidence가 필요합니다.`).toBeDefined()
      expect(font).toMatchObject({
        family: legacyFont?.family,
        fileName: legacyFont?.fileName,
        fileSha256: legacyFont?.fileSha256,
        version: legacyFont?.version,
        source: legacyFont?.source,
        license: legacyFont?.license,
        weight: legacyFont?.weight,
      })
      expect(font.fileSha256).toMatch(SHA256)
      expect(font.source).toMatch(/^https:\/\/github\.com\/google\/fonts\//)
      expect(font.license).toBe('SIL Open Font License 1.1')
      expect(font.weight).toBe(400)
      expect(Object.values(font.axes).every(Number.isFinite)).toBe(true)
    }
  })

  it('font의 고유 정보와 세션별 분석 역할을 섞지 않는다', () => {
    for (const font of catalog.fonts) {
      expect(font).not.toHaveProperty('role')
      expect(font).not.toHaveProperty('aggregation')
    }
    expect(legacy.fonts.every(({ role, aggregation }) => Boolean(role && aggregation))).toBe(true)
  })

  it('한 명령으로 로컬 UI와 read-only outline service를 시작할 정적 진입점을 제공한다', () => {
    expect(packageManifest.scripts?.['reference:lab']).toBe('node scripts/reference-lab/start.mjs')
    expect(existsSync(SERVER_URL)).toBe(true)
    expect(existsSync(START_URL)).toBe(true)
    expect(readFileSync(SERVER_URL, 'utf8').length).toBeGreaterThan(1_000)
    expect(readFileSync(START_URL, 'utf8').length).toBeGreaterThan(200)
  })
})
