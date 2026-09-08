import { useEffect, useRef, useState, type FormEvent } from 'react'
import styles from './ReferenceLabPage.module.css'

const FONT_CATALOG_URL = '/api/reference/v1/fonts'
const OUTLINE_URL = '/api/reference/v1/outlines'
const DEFAULT_TEXT = '가거'
const MAX_CHARACTERS = 12
const EXPECTED_PROJECTION = 'matrix(1000/nativeUPM 0 0 -1000/nativeUPM 0 880)'

export interface DisplayContract {
  unitsPerEm: 1000
  baselineY: 880
  viewBox: readonly [-120, -120, 1240, 1240]
  xOrigin: 0
  projection: typeof EXPECTED_PROJECTION
  inkAutofit: false
  individualCentering: false
  advanceNormalization: false
}

export interface ReferenceFont {
  id: string
  family: string
  fileName: string
  fileSha256: string
  version: string | null
  source: string
  license: string
  weight: number
  axes: Readonly<Record<string, number>>
}

export interface FontCatalogResponse {
  schema: 'reference-font-catalog-response-v1'
  apiVersion: 'reference.v1'
  display: DisplayContract
  fonts: readonly ReferenceFont[]
}

interface GlyphIdentity {
  character: string
  codepoint: string
}

interface PresentGlyphOutline extends GlyphIdentity {
  missing: false
  glyphName: string
  path: string
  pathSha256: string
  unitsPerEm: number
  advance: number
  bounds: readonly [number, number, number, number] | null
  contours?: readonly GlyphContour[]
}

interface MissingGlyphOutline extends GlyphIdentity {
  missing: true
  error: {
    code: 'GLYPH_MISSING'
    message: string
  }
}

export type GlyphOutline = PresentGlyphOutline | MissingGlyphOutline
export type GlyphHighlight = 'initial-left' | 'initial-top' | 'final'

interface GlyphContour {
  path: string
  bounds: readonly [number, number, number, number]
}

export interface FontOutlineSample {
  fontId: string
  glyphs: readonly GlyphOutline[]
}

export interface OutlineResponse {
  schema: 'reference-outline-response-v1'
  apiVersion: 'reference.v1'
  text: string
  display: DisplayContract
  samples: readonly FontOutlineSample[]
}

function contractError(location: string, expectation: string): never {
  throw new Error(`Reference API 응답 계약 오류 · ${location}: ${expectation}`)
}

function asRecord(value: unknown, location: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return contractError(location, '객체여야 합니다.')
  }
  return value as Record<string, unknown>
}

function asString(value: unknown, location: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    return contractError(location, '비어 있지 않은 문자열이어야 합니다.')
  }
  return value
}

function asFiniteNumber(value: unknown, location: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return contractError(location, '유한한 숫자여야 합니다.')
  }
  return value
}

function expectLiteral<T extends string | number | boolean>(
  value: unknown,
  expected: T,
  location: string,
): T {
  if (value !== expected) return contractError(location, `${String(expected)}이어야 합니다.`)
  return expected
}

function parseDisplayContract(value: unknown, location: string): DisplayContract {
  const display = asRecord(value, location)
  const viewBox = display.viewBox
  if (!Array.isArray(viewBox) || viewBox.length !== 4) {
    return contractError(`${location}.viewBox`, '[-120, -120, 1240, 1240]이어야 합니다.')
  }
  const expectedViewBox = [-120, -120, 1240, 1240] as const
  expectedViewBox.forEach((expected, index) => {
    expectLiteral(viewBox[index], expected, `${location}.viewBox[${index}]`)
  })
  return {
    unitsPerEm: expectLiteral(display.unitsPerEm, 1000, `${location}.unitsPerEm`),
    baselineY: expectLiteral(display.baselineY, 880, `${location}.baselineY`),
    viewBox: expectedViewBox,
    xOrigin: expectLiteral(display.xOrigin, 0, `${location}.xOrigin`),
    projection: expectLiteral(display.projection, EXPECTED_PROJECTION, `${location}.projection`),
    inkAutofit: expectLiteral(display.inkAutofit, false, `${location}.inkAutofit`),
    individualCentering: expectLiteral(display.individualCentering, false, `${location}.individualCentering`),
    advanceNormalization: expectLiteral(
      display.advanceNormalization,
      false,
      `${location}.advanceNormalization`,
    ),
  }
}

function parseAxes(value: unknown, location: string): Readonly<Record<string, number>> {
  const axes = asRecord(value, location)
  return Object.fromEntries(Object.entries(axes).map(([tag, axisValue]) => [
    tag,
    asFiniteNumber(axisValue, `${location}.${tag}`),
  ]))
}

function parseFont(value: unknown, index: number): ReferenceFont {
  const location = `fonts[${index}]`
  const font = asRecord(value, location)
  const fileSha256 = asString(font.fileSha256, `${location}.fileSha256`)
  if (!/^[0-9a-f]{64}$/u.test(fileSha256)) {
    return contractError(`${location}.fileSha256`, '64자 SHA-256 16진수여야 합니다.')
  }
  return {
    id: asString(font.id, `${location}.id`),
    family: asString(font.family, `${location}.family`),
    fileName: asString(font.fileName, `${location}.fileName`),
    fileSha256,
    version: font.version === undefined ? null : asString(font.version, `${location}.version`),
    source: asString(font.source, `${location}.source`),
    license: asString(font.license, `${location}.license`),
    weight: asFiniteNumber(font.weight, `${location}.weight`),
    axes: parseAxes(font.axes, `${location}.axes`),
  }
}

export function parseFontCatalogResponse(value: unknown): FontCatalogResponse {
  const response = asRecord(value, 'font catalog')
  expectLiteral(response.schema, 'reference-font-catalog-response-v1', 'font catalog.schema')
  expectLiteral(response.apiVersion, 'reference.v1', 'font catalog.apiVersion')
  if (!Array.isArray(response.fonts) || response.fonts.length === 0) {
    return contractError('font catalog.fonts', '하나 이상의 폰트 배열이어야 합니다.')
  }
  const fonts = response.fonts.map(parseFont)
  if (new Set(fonts.map(({ id }) => id)).size !== fonts.length) {
    return contractError('font catalog.fonts', '폰트 ID가 중복되었습니다.')
  }
  return {
    schema: 'reference-font-catalog-response-v1',
    apiVersion: 'reference.v1',
    display: parseDisplayContract(response.display, 'font catalog.display'),
    fonts,
  }
}

function parseGlyphIdentity(glyph: Record<string, unknown>, location: string): GlyphIdentity {
  const character = asString(glyph.character, `${location}.character`)
  const codepoint = asString(glyph.codepoint, `${location}.codepoint`)
  if (!/^U\+[0-9A-F]{4,6}$/u.test(codepoint)) {
    return contractError(`${location}.codepoint`, 'U+AC00 형식이어야 합니다.')
  }
  return { character, codepoint }
}

function parseBounds(value: unknown, location: string): readonly [number, number, number, number] | null {
  if (value === null) return null
  if (!Array.isArray(value) || value.length !== 4) {
    return contractError(location, 'null 또는 [xMin, yMin, xMax, yMax]여야 합니다.')
  }
  const bounds = value.map((item, index) => asFiniteNumber(item, `${location}[${index}]`))
  if (bounds[0] > bounds[2] || bounds[1] > bounds[3]) {
    return contractError(location, 'min 값은 max 값보다 클 수 없습니다.')
  }
  return bounds as unknown as readonly [number, number, number, number]
}

function parseContours(value: unknown, location: string): readonly GlyphContour[] {
  if (!Array.isArray(value) || value.length === 0) return contractError(location, '비어 있지 않은 배열이어야 합니다.')
  return value.map((value, index) => {
    const contour = asRecord(value, `${location}[${index}]`)
    const bounds = parseBounds(contour.bounds, `${location}[${index}].bounds`)
    if (bounds === null) return contractError(`${location}[${index}].bounds`, 'null일 수 없습니다.')
    return {
      path: asString(contour.path, `${location}[${index}].path`),
      bounds,
    }
  })
}

function parseGlyph(value: unknown, location: string): GlyphOutline {
  const glyph = asRecord(value, location)
  const identity = parseGlyphIdentity(glyph, location)
  if (glyph.missing === true) {
    const error = asRecord(glyph.error, `${location}.error`)
    return {
      ...identity,
      missing: true,
      error: {
        code: expectLiteral(error.code, 'GLYPH_MISSING', `${location}.error.code`),
        message: asString(error.message, `${location}.error.message`),
      },
    }
  }
  expectLiteral(glyph.missing, false, `${location}.missing`)
  const path = asString(glyph.path, `${location}.path`)
  const pathSha256 = asString(glyph.pathSha256, `${location}.pathSha256`)
  if (!/^[0-9a-f]{64}$/u.test(pathSha256)) {
    return contractError(`${location}.pathSha256`, '64자 SHA-256 16진수여야 합니다.')
  }
  const unitsPerEm = asFiniteNumber(glyph.unitsPerEm, `${location}.unitsPerEm`)
  if (unitsPerEm <= 0) return contractError(`${location}.unitsPerEm`, '0보다 커야 합니다.')
  const advance = asFiniteNumber(glyph.advance, `${location}.advance`)
  if (advance < 0) return contractError(`${location}.advance`, '0 이상이어야 합니다.')
  const contours = glyph.contours === undefined ? undefined : parseContours(glyph.contours, `${location}.contours`)
  return {
    ...identity,
    missing: false,
    glyphName: asString(glyph.glyphName, `${location}.glyphName`),
    path,
    pathSha256,
    unitsPerEm,
    advance,
    bounds: parseBounds(glyph.bounds, `${location}.bounds`),
    ...(contours ? { contours } : {}),
  }
}

export function parseOutlineResponse(value: unknown): OutlineResponse {
  const response = asRecord(value, 'outline response')
  expectLiteral(response.schema, 'reference-outline-response-v1', 'outline response.schema')
  expectLiteral(response.apiVersion, 'reference.v1', 'outline response.apiVersion')
  if (!Array.isArray(response.samples)) {
    return contractError('outline response.samples', '배열이어야 합니다.')
  }
  const samples = response.samples.map((value: unknown, sampleIndex: number): FontOutlineSample => {
    const location = `outline response.samples[${sampleIndex}]`
    const sample = asRecord(value, location)
    if (!Array.isArray(sample.glyphs)) return contractError(`${location}.glyphs`, '배열이어야 합니다.')
    return {
      fontId: asString(sample.fontId, `${location}.fontId`),
      glyphs: sample.glyphs.map((glyph, glyphIndex) => parseGlyph(glyph, `${location}.glyphs[${glyphIndex}]`)),
    }
  })
  if (new Set(samples.map(({ fontId }) => fontId)).size !== samples.length) {
    return contractError('outline response.samples', '폰트 ID가 중복되었습니다.')
  }
  return {
    schema: 'reference-outline-response-v1',
    apiVersion: 'reference.v1',
    text: asString(response.text, 'outline response.text'),
    display: parseDisplayContract(response.display, 'outline response.display'),
    samples,
  }
}

function normalizeCharacters(value: string): readonly string[] {
  return Array.from(value.normalize('NFC')).filter((character) => !/[\s\p{C}]/u.test(character))
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message
  return '알 수 없는 오류가 발생했습니다.'
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError'
}

async function responseJson(response: Response): Promise<unknown> {
  try {
    return await response.json()
  } catch {
    throw new Error(`Reference API ${response.status}: JSON 응답을 읽을 수 없습니다.`)
  }
}

export async function requireSuccessfulJson(response: Response): Promise<unknown> {
  const value = await responseJson(response)
  if (response.ok) return value
  const payload = asRecord(value, `HTTP ${response.status} error`)
  const error = asRecord(payload.error, `HTTP ${response.status} error.error`)
  throw new Error(`Reference API ${response.status}: ${asString(error.message, 'error.message')}`)
}

export function validateOutlineCoverage(
  response: OutlineResponse,
  requestedText: string,
  fonts: readonly ReferenceFont[],
): void {
  if (response.text !== requestedText) {
    contractError('outline response.text', `요청한 “${requestedText}”와 같아야 합니다.`)
  }
  const requestedCharacters = Array.from(requestedText)
  const requestedFontIds = new Set(fonts.map(({ id }) => id))
  if (response.samples.length !== fonts.length) {
    contractError('outline response.samples', `요청한 폰트 ${fonts.length}종을 모두 포함해야 합니다.`)
  }
  response.samples.forEach((sample, sampleIndex) => {
    if (!requestedFontIds.has(sample.fontId)) {
      contractError(`outline response.samples[${sampleIndex}].fontId`, '요청하지 않은 폰트입니다.')
    }
    if (sample.glyphs.length !== requestedCharacters.length) {
      contractError(
        `outline response.samples[${sampleIndex}].glyphs`,
        `요청한 글자 ${requestedCharacters.length}개와 같은 길이여야 합니다.`,
      )
    }
    sample.glyphs.forEach((glyph, glyphIndex) => {
      if (glyph.character !== requestedCharacters[glyphIndex]) {
        contractError(
          `outline response.samples[${sampleIndex}].glyphs[${glyphIndex}].character`,
          `요청한 “${requestedCharacters[glyphIndex]}”여야 합니다.`,
        )
      }
    })
  })
}

function axesLabel(axes: Readonly<Record<string, number>>): string {
  const entries = Object.entries(axes)
  if (entries.length === 0) return '고정 인스턴스'
  return entries.map(([tag, value]) => `${tag} ${value}`).join(' · ')
}

function boundsLabel(bounds: PresentGlyphOutline['bounds']): string {
  if (bounds === null) return '잉크 bounds 없음'
  return bounds.map((value) => Math.round(value * 1000)).join(' / ')
}

interface GlyphSpecimenProps {
  display: DisplayContract
  font: ReferenceFont
  glyph: GlyphOutline
  highlight?: GlyphHighlight
}

export function GlyphSpecimen({ display, font, glyph, highlight }: GlyphSpecimenProps) {
  const highlightSlot = highlight === 'initial-left'
    ? { x: 0, y: 0, width: 520, height: 610 }
    : highlight === 'initial-top'
      ? { x: 0, y: 0, width: 1000, height: 360 }
      : highlight === 'final'
        ? { x: 0, y: 610, width: 1000, height: 390 }
        : null
  const highlightLabel = highlight === 'final' ? '받침닿자 위치' : '첫닿자 위치'
  const commonSvg = {
    viewBox: display.viewBox.join(' '),
    'data-testid': 'glyph-svg',
    'data-coordinate-frame': 'shared-baseline',
    'data-ink-autofit': String(display.inkAutofit),
    'data-individual-centering': String(display.individualCentering),
    'data-advance-normalization': String(display.advanceNormalization),
  }
  const advance = glyph.missing ? null : glyph.advance
  const advanceX = advance === null ? null : advance * display.unitsPerEm

  return (
    <figure className={styles.specimen}>
      <svg
        {...commonSvg}
        className={styles.glyphSvg}
        data-units-per-em={glyph.missing ? undefined : glyph.unitsPerEm}
        role="img"
        aria-label={`${font.family} ${glyph.character} 원본 좌표 윤곽`}
      >
        <title>{font.family}의 {glyph.character} · 개별 중앙 정렬과 autofit 없음</title>
        <rect data-guide="em-frame" className={styles.emFrame} x="0" y="0" width="1000" height="1000" />
        <rect data-guide="design-body" className={styles.designBody} x="75" y="75" width="850" height="850" />
        <line
          data-guide="baseline"
          className={styles.baseline}
          x1="-120"
          x2="1120"
          y1={display.baselineY}
          y2={display.baselineY}
        />
        <line data-guide="x-origin" className={styles.origin} x1="0" x2="0" y1="-120" y2="1120" />
        {advanceX !== null && (
          <line
            data-guide="advance-boundary"
            className={styles.advance}
            x1={advanceX}
            x2={advanceX}
            y1="-120"
            y2="1120"
          />
        )}
        {!glyph.missing && highlightSlot && highlight && (
          <rect className={styles.jamoSlot} data-jamo-highlight={highlight} {...highlightSlot} />
        )}
        {glyph.missing ? (
          <g className={styles.missingMark} data-testid="missing-glyph">
            <text x="500" y="475" textAnchor="middle">글리프 없음</text>
            <text x="500" y="525" textAnchor="middle">{glyph.codepoint}</text>
          </g>
        ) : (
          <g
            data-font-projection="upm-to-shared-baseline"
            transform={`matrix(${display.unitsPerEm / glyph.unitsPerEm} 0 0 ${-(display.unitsPerEm / glyph.unitsPerEm)} 0 ${display.baselineY})`}
          >
            <path className={styles.glyphInk} d={glyph.path} />
          </g>
        )}
        {highlightSlot && highlight && (
          <g>
            <text className={styles.jamoSlotLabel} x={highlightSlot.x + 24} y={highlightSlot.y + 58}>{highlightLabel}</text>
          </g>
        )}
      </svg>
      <figcaption>
        {glyph.missing ? (
          <><strong>원본 폰트에 없음</strong><span>{glyph.error.message}</span></>
        ) : (
          <>
            <strong>advance {Math.round(glyph.advance * 1000)}</strong>
            <span>UPM {glyph.unitsPerEm} · bounds {boundsLabel(glyph.bounds)}</span>
          </>
        )}
      </figcaption>
    </figure>
  )
}

export function ReferenceLabPage() {
  const [inputText, setInputText] = useState(DEFAULT_TEXT)
  const [catalog, setCatalog] = useState<FontCatalogResponse | null>(null)
  const [catalogLoading, setCatalogLoading] = useState(true)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [comparison, setComparison] = useState<OutlineResponse | null>(null)
  const [comparisonLoading, setComparisonLoading] = useState(false)
  const [comparisonError, setComparisonError] = useState<string | null>(null)
  const [comparedCharacters, setComparedCharacters] = useState<readonly string[]>([])
  const outlineAbortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    async function loadCatalog(): Promise<void> {
      try {
        const response = await fetch(FONT_CATALOG_URL, {
          method: 'GET',
          credentials: 'same-origin',
          headers: { Accept: 'application/json' },
          signal: controller.signal,
        })
        const parsed = parseFontCatalogResponse(await requireSuccessfulJson(response))
        if (active) setCatalog(parsed)
      } catch (error) {
        if (active && !isAbortError(error)) setCatalogError(describeError(error))
      } finally {
        if (active) setCatalogLoading(false)
      }
    }
    void loadCatalog()
    return () => {
      active = false
      controller.abort()
    }
  }, [])

  useEffect(() => () => outlineAbortRef.current?.abort(), [])

  const handleCompare = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault()
    if (catalog === null || comparisonLoading) return
    const characters = normalizeCharacters(inputText)
    if (characters.length === 0) {
      setComparisonError('공백을 제외한 글자를 하나 이상 입력해 주세요.')
      return
    }
    if (characters.length > MAX_CHARACTERS) {
      setComparisonError(`공백을 제외하고 최대 ${MAX_CHARACTERS}글자까지 비교할 수 있습니다.`)
      return
    }
    const requestedText = characters.join('')
    setInputText(requestedText)
    setComparisonError(null)
    setComparison(null)
    setComparedCharacters([])
    setComparisonLoading(true)
    outlineAbortRef.current?.abort()
    const controller = new AbortController()
    outlineAbortRef.current = controller
    try {
      const response = await fetch(OUTLINE_URL, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: requestedText, fontIds: catalog.fonts.map(({ id }) => id) }),
        signal: controller.signal,
      })
      const parsed = parseOutlineResponse(await requireSuccessfulJson(response))
      validateOutlineCoverage(parsed, requestedText, catalog.fonts)
      setComparison(parsed)
      setComparedCharacters(characters)
    } catch (error) {
      if (!isAbortError(error)) setComparisonError(describeError(error))
    } finally {
      if (outlineAbortRef.current === controller) {
        outlineAbortRef.current = null
        setComparisonLoading(false)
      }
    }
  }

  const display = comparison?.display ?? catalog?.display

  return (
    <main className={styles.page} data-testid="reference-lab">
      <header className={styles.hero}>
        <div className={styles.heroTopline}>
          <span className={styles.eyebrow}>R0 · 로컬 원본 윤곽 비교</span>
          <div className={styles.statuses} aria-label="R0 반영 상태">
            <span>production 반영 0%</span>
            <span>측정 없음</span>
            <span>후보 생성 없음</span>
          </div>
        </div>
        <h1>폰트 레퍼런스 랩</h1>
        <p>
          같은 글자를 등록된 무료폰트의 원래 원점·크기·advance로 나란히 봅니다.
          이 단계는 비교만 하며 프리셋이나 프로젝트 값을 바꾸지 않습니다.
        </p>
        {display && (
          <div className={styles.contractChips} data-testid="coordinate-contract" aria-label="좌표 비교 계약">
            <span>표시 UPM {display.unitsPerEm}</span>
            <span>비교 frame ascender {display.baselineY}</span>
            <span>비교 frame descender {display.baselineY - display.unitsPerEm}</span>
            <span>baseline y={display.baselineY}</span>
            <span>x 원점 {display.xOrigin}</span>
            <span>원본 advance 유지</span>
            <span>개별 중앙 정렬·autofit 없음</span>
          </div>
        )}
      </header>

      <section className={styles.controls} aria-labelledby="reference-input-heading">
        <div>
          <span>01 · 비교 입력</span>
          <h2 id="reference-input-heading">어떤 글자를 같은 조건으로 볼까요?</h2>
          <p>공백은 제외하고 최대 {MAX_CHARACTERS}글자 · NFC 정규화</p>
        </div>
        <form className={styles.inputForm} onSubmit={(event) => void handleCompare(event)}>
          <label htmlFor="reference-lab-input">비교할 글자</label>
          <div>
            <input
              id="reference-lab-input"
              data-testid="reference-input"
              type="text"
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              autoComplete="off"
              spellCheck={false}
              aria-describedby="reference-input-help"
              disabled={catalogLoading || catalogError !== null}
            />
            <button
              data-testid="compare-button"
              type="submit"
              disabled={catalogLoading || catalogError !== null || comparisonLoading}
            >
              {comparisonLoading ? '비교 중…' : '비교하기'}
            </button>
          </div>
          <small id="reference-input-help">입력만으로는 요청하지 않으며, 비교하기 또는 Enter로만 갱신합니다.</small>
        </form>
      </section>

      <section className={styles.comparison} aria-labelledby="comparison-heading">
        <div className={styles.sectionHeading}>
          <div>
            <span>02 · 원본 좌표 비교</span>
            <h2 id="comparison-heading">등록 폰트별 SVG 윤곽</h2>
          </div>
          <p>Design Body 75…925는 약한 보조선이며, 파란선이 밑선=baseline입니다.</p>
        </div>

        <div className={styles.legend} aria-label="비교판 안내선">
          <span><i className={styles.emLegend} />EM frame</span>
          <span><i className={styles.bodyLegend} />Design Body 75…925 · 보조선</span>
          <span><i className={styles.baselineLegend} />밑선 · baseline 880</span>
          <span><i className={styles.originLegend} />x 원점</span>
          <span><i className={styles.advanceLegend} />원본 advance 경계</span>
        </div>

        {catalogLoading && <p className={styles.loading} role="status" data-testid="loading-state">로컬 폰트 목록을 읽는 중…</p>}
        {catalogError && <p className={styles.error} role="alert" data-testid="error-state">{catalogError}</p>}
        {comparisonError && <p className={styles.error} role="alert" data-testid="error-state">{comparisonError}</p>}
        {comparisonLoading && <p className={styles.loading} role="status" data-testid="loading-state">원본 윤곽을 추출하는 중…</p>}
        {!catalogLoading && !catalogError && !comparisonLoading && comparison === null && !comparisonError && (
          <p className={styles.emptyState}>위에서 글자를 입력한 뒤 <strong>비교하기</strong>를 누르면 여기에 원본 윤곽이 나타납니다.</p>
        )}

        {catalog && comparison && (
          <div className={styles.gridScroll} data-testid="reference-grid" tabIndex={0} aria-label="폰트별 글리프 비교표">
            <table className={styles.gridTable}>
              <caption>{comparedCharacters.join(' · ')}의 원본 폰트 윤곽 비교</caption>
              <thead>
                <tr>
                  <th scope="col" className={styles.fontColumn}>Font</th>
                  {comparedCharacters.map((character, index) => (
                    <th
                      key={`${character}-${index}`}
                      scope="col"
                      className={styles.glyphColumn}
                      data-testid="glyph-column-header"
                      data-glyph={character}
                    >
                      <strong>{character}</strong>
                      <span>U+{character.codePointAt(0)?.toString(16).toUpperCase().padStart(4, '0')}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {catalog.fonts.map((font) => {
                  const sample = comparison.samples.find(({ fontId }) => fontId === font.id)
                  if (!sample) return null
                  return (
                    <tr key={font.id} data-testid="font-row" data-font-id={font.id}>
                      <th scope="row" className={styles.fontInfo}>
                        <strong>{font.family}</strong>
                        <span>{font.fileName}</span>
                        <small>weight {font.weight} · {axesLabel(font.axes)}</small>
                      </th>
                      {sample.glyphs.map((glyph, index) => (
                        <td
                          key={`${glyph.character}-${index}`}
                          className={styles.glyphCell}
                          data-testid="glyph-cell"
                          data-font-id={font.id}
                          data-glyph={glyph.character}
                          data-advance={glyph.missing ? undefined : glyph.advance}
                          data-units-per-em={glyph.missing ? undefined : glyph.unitsPerEm}
                        >
                          <GlyphSpecimen display={comparison.display} font={font} glyph={glyph} />
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {catalog && (
        <details className={styles.provenance}>
          <summary>
            <span>03 · 근거</span>
            <strong>출처·라이선스·파일 해시</strong>
            <small>{catalog.fonts.length}종 · 로컬 catalog</small>
          </summary>
          <div className={styles.provenanceScroll}>
            <table>
              <thead><tr><th>폰트</th><th>인스턴스</th><th>라이선스</th><th>출처</th><th>파일 SHA-256</th></tr></thead>
              <tbody>
                {catalog.fonts.map((font) => (
                  <tr key={font.id}>
                    <th scope="row">{font.family}<small>{font.fileName}</small></th>
                    <td>weight {font.weight}<small>{axesLabel(font.axes)}{font.version && ` · ${font.version}`}</small></td>
                    <td>{font.license}</td>
                    <td><a href={font.source} target="_blank" rel="noreferrer">공식 출처</a></td>
                    <td><code>{font.fileSha256}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </main>
  )
}
