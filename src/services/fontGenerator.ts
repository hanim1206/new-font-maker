/**
 * opentype.js를 사용한 TTF 폰트 생성 및 다운로드
 *
 * 파이프라인:
 * 1. collectGlyphDataWithPlacement() — 스토어에서 글리프 데이터 수집
 * 2. strokeToContours() — 각 획을 윤곽 컨투어로 변환
 * 3. contoursToPath() — 컨투어를 opentype.js Path로 변환
 * 4. opentype.Font — 폰트 조립 + ArrayBuffer → 다운로드
 */
// @ts-expect-error opentype.js에 타입 정의 파일 없음
import * as opentype from 'opentype.js'
import { fontVersionText, setHeadFontRevision } from './fontRevision'
import { strokeToContours } from './strokeToOutline'
import type { Contour } from './strokeToOutline'
import {
  allExportChars,
  collectGlyphDataWithPlacement,
  UPM,
  DEFAULT_ADVANCE_WIDTH,
  ASCENDER,
  DESCENDER,
  OS2_CODE_PAGE_RANGE_1,
  OS2_UNICODE_RANGE_1,
  OS2_UNICODE_RANGE_2,
  getCurrentSpaceAdvance,
} from './fontExportUtils'
import { useGlobalStyleStore } from '../stores/globalStyleStore'
import type { GlyphData, GlyphPlacementResolver } from './fontExportUtils'
import { mergeStrokeContourGroupsForCff } from './contourBoolean'
import { brushInkGroupsToFontContours, strokeToBrushInkGroups } from './brushGeometry'
import { needsFilledRenderInk, strokeToRenderInkGroups, verticalWidthFactorOf } from './strokeRenderGeometry'
import { stemBeakInkGroups } from './stemBeak'
import type { DeepReadonly } from '../types'
import type { FinalGlyphInk } from './finalGlyphInk'
import { projectFinalGlyphInkToFontContours } from './finalGlyphInk'

// ===== 타입 정의 =====

/** 폰트 생성 옵션 */
export interface FontGeneratorOptions {
  familyName?: string
  styleName?: string
  onProgress?: (completed: number, total: number, phase: string) => void
  /** 자소 상자 출처. 화면과 같은 칸 해석을 넘기면 받은 폰트가 화면과 같아진다. 없으면 스키마. */
  placementOf?: GlyphPlacementResolver
  /** 이 폰트를 몇 번째 받는지. 파일 버전이 `1.00n`이 된다(`fontRevision.ts`). 없으면 1.000. */
  revision?: number
}

/** 폰트 생성 결과 */
export interface FontGeneratorResult {
  success: boolean
  glyphCount: number
  fileSize?: number
  error?: string
  /** `placementOf`를 줬는데도 스키마 상자로 떨어진 음절 수. 기본 획이면 0이어야 한다. */
  schemaFallbackCount?: number
  /** 윤곽을 만들지 못해 빈 글리프로 넣은 글자. 폰트는 만들어졌다. */
  skippedChars?: string[]
  /** 만든 파일 그대로. 완료 페이지가 `FontFace`로 그리고 `다시 받기`에 쓴다. */
  bytes?: ArrayBuffer
  /** 내려받은 파일 이름(`이름.otf`). */
  fileName?: string
}

export interface FontIdentity {
  asciiFamilyName: string
  postScriptName: string
}

export interface FinalRegionGlyphData {
  unicode: number
  char: string
  advanceWidth: number
  finalInk: DeepReadonly<FinalGlyphInk>
  originX: number
  slant: number
}

function ringSignedArea(ring: readonly Readonly<{ x: number; y: number }>[]): number {
  return ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length]
    return sum + point.x * next.y - next.x * point.y
  }, 0) / 2
}

function hasFiniteRingPoints(ring: readonly Readonly<{ x: number; y: number }>[]): boolean {
  return ring.every((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
}

function assertFinalRegionGlyphData(glyphData: FinalRegionGlyphData): void {
  if ([...glyphData.char].length !== 1 || glyphData.char.codePointAt(0) !== glyphData.unicode
    || !Number.isInteger(glyphData.unicode) || glyphData.unicode < 0 || glyphData.unicode > 0x10FFFF) {
    throw new Error('Shape final glyph의 char와 unicode가 일치해야 합니다.')
  }
  if (!Number.isFinite(glyphData.advanceWidth) || glyphData.advanceWidth <= 0
    || !Number.isFinite(glyphData.originX) || !Number.isFinite(glyphData.slant)) {
    throw new Error('Shape final glyph의 advanceWidth, originX, slant가 유효해야 합니다.')
  }
  if (!Array.isArray(glyphData.finalInk.regions) || glyphData.finalInk.regions.length === 0) {
    throw new Error('Shape final glyph의 regions가 비어 있습니다.')
  }
  for (const region of glyphData.finalInk.regions) {
    if (!Array.isArray(region.outer) || !Array.isArray(region.holes) || region.outer.length < 3 || ringSignedArea(region.outer) >= 0
      || !hasFiniteRingPoints(region.outer)) {
      throw new Error('Shape final glyph outer ring이 유효한 시계 방향 윤곽이어야 합니다.')
    }
    for (const hole of region.holes) {
      if (!Array.isArray(hole) || hole.length < 3 || ringSignedArea(hole) <= 0
        || !hasFiniteRingPoints(hole)) {
        throw new Error('Shape final glyph hole ring이 유효한 반시계 방향 윤곽이어야 합니다.')
      }
    }
  }
}

export interface CmapMapping {
  codePoint: number
  glyphIndex: number
}

const CMAP_FORMAT_4_MAX_LENGTH = 0xffff
const CMAP_FORMAT_4_BASE_LENGTH = 16
const CMAP_FORMAT_4_BYTES_PER_SEGMENT = 8
const OPTIONAL_FONT_NAME_KEYS = [
  'trademark',
  'manufacturer',
  'designer',
  'description',
  'manufacturerURL',
  'designerURL',
  'license',
  'licenseURL',
] as const

type LocalizedFontName = Record<string, string>
type PlatformFontNames = Record<string, LocalizedFontName>
type OpenTypeFontNames = Record<'unicode' | 'macintosh' | 'windows', PlatformFontNames>

function stableNameHash(value: string): string {
  let hash = 0x811c9dc5
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 0x01000193)
  }
  return (hash >>> 0).toString(16).toUpperCase().padStart(8, '0')
}

/** 한글 이름을 보존하면서 OS 설치 충돌이 없는 ASCII/PostScript 식별자를 만든다. */
export function createFontIdentity(familyName: string, styleName: string): FontIdentity {
  const trimmedFamily = familyName.trim() || 'FontMaker'
  const asciiBase = trimmedFamily.replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'FontMaker'
  const lostCharacters = asciiBase !== trimmedFamily
  const uniqueFamily = lostCharacters
    ? `${asciiBase}-${stableNameHash(trimmedFamily)}`
    : asciiBase
  const safeStyle = styleName.replace(/[^a-zA-Z0-9-]/g, '') || 'Regular'
  const postScriptFamily = uniqueFamily.replace(/[^a-zA-Z0-9-]/g, '') || 'FontMaker'
  return {
    asciiFamilyName: uniqueFamily,
    postScriptName: `${postScriptFamily}-${safeStyle}`.slice(0, 63),
  }
}

/**
 * format 4 cmap은 길이 필드가 uint16이라 병합 후 segment가 8,189개를 넘을 수 없다.
 * opentype.js가 손상된 길이를 기록하기 전에 명시적으로 출력을 중단한다.
 */
export function assertCmapFormat4Capacity(mappings: readonly CmapMapping[]): void {
  for (const mapping of mappings) {
    if (!Number.isInteger(mapping.codePoint) || !Number.isInteger(mapping.glyphIndex)) {
      throw new Error('cmap 매핑에는 정수 Unicode와 글리프 인덱스가 필요합니다.')
    }
    if (mapping.codePoint < 0 || mapping.codePoint > 0x10ffff || mapping.glyphIndex < 0) {
      throw new Error('cmap 매핑이 유효한 Unicode 또는 글리프 인덱스 범위를 벗어났습니다.')
    }
    if (mapping.codePoint === 0xffff) {
      throw new Error('U+FFFF는 cmap format 4 terminator로 예약되어 있습니다.')
    }
  }

  const bmpMappings = mappings
    .filter(({ codePoint }) => codePoint >= 0 && codePoint < 0xffff)
    .slice()
    .sort((a, b) => a.codePoint - b.codePoint)

  let mergedRunCount = 0
  let previous: CmapMapping | undefined

  for (const mapping of bmpMappings) {
    if (previous?.codePoint === mapping.codePoint) {
      throw new Error(`중복된 Unicode cmap 매핑입니다: U+${mapping.codePoint.toString(16).toUpperCase()}`)
    }

    const continuesPreviousRun = previous !== undefined
      && mapping.codePoint === previous.codePoint + 1
      && mapping.glyphIndex === previous.glyphIndex + 1
    if (!continuesPreviousRun) mergedRunCount += 1
    previous = mapping
  }

  // 마지막 U+FFFF terminator segment까지 format 4 길이에 포함한다.
  const format4Length = CMAP_FORMAT_4_BASE_LENGTH
    + CMAP_FORMAT_4_BYTES_PER_SEGMENT * (mergedRunCount + 1)
  if (format4Length > CMAP_FORMAT_4_MAX_LENGTH) {
    throw new Error(
      `Unicode cmap 구간이 format 4 용량을 초과했습니다 (${mergedRunCount.toLocaleString()}개).`,
    )
  }
}

function setFontNameRecords(
  font: InstanceType<typeof opentype.Font>,
  familyName: string,
  styleName: string,
  identity: FontIdentity,
  revision = 0,
): void {
  const names = font.names as OpenTypeFontNames
  const version = fontVersionText(revision)
  const hasKoreanName = familyName !== identity.asciiFamilyName
  const copyright = `Copyright (c) ${new Date().getFullYear()}`
  const fullEnglishName = `${identity.asciiFamilyName} ${styleName}`
  const fullKoreanName = `${familyName} ${styleName}`

  for (const platform of ['unicode', 'macintosh', 'windows'] as const) {
    const platformNames = names[platform]
    for (const key of OPTIONAL_FONT_NAME_KEYS) delete platformNames[key]

    platformNames.copyright = { en: copyright }
    platformNames.fontFamily = { en: identity.asciiFamilyName }
    platformNames.fontSubfamily = { en: styleName }
    platformNames.uniqueID = { en: `${version};NONE;${identity.postScriptName}` }
    platformNames.fullName = { en: fullEnglishName }
    platformNames.version = { en: `Version ${version}` }
    platformNames.postScriptName = { en: identity.postScriptName }
    platformNames.preferredFamily = { en: identity.asciiFamilyName }
    platformNames.preferredSubfamily = { en: styleName }

    // Macintosh name 레코드는 MacRoman이라 한글 번역을 넣지 않는다.
    if (hasKoreanName && platform !== 'macintosh') {
      platformNames.fontFamily.ko = familyName
      platformNames.fullName.ko = fullKoreanName
      platformNames.preferredFamily.ko = familyName
    }
  }
}

// ===== 컨투어 → opentype.js Path 변환 =====

/**
 * 윤곽 컨투어 배열을 opentype.js Path로 변환
 *
 * ContourPoint.onCurve에 따라:
 * - true: lineTo (on-curve 점)
 * - false: off-curve 제어점으로 축적 후 curveTo
 */
function contoursToPath(contours: Contour[]): InstanceType<typeof opentype.Path> {
  const path = new opentype.Path()

  for (const contour of contours) {
    if (contour.length < 3) continue

    // 첫 on-curve 점 찾기
    let startIdx = 0
    for (let i = 0; i < contour.length; i++) {
      if (contour[i].onCurve) {
        startIdx = i
        break
      }
    }

    // 시작점으로 이동
    path.moveTo(contour[startIdx].x, contour[startIdx].y)

    // 나머지 점 순회
    const len = contour.length
    let i = 1
    const offCurveBuffer: Array<{ x: number; y: number }> = []

    while (i < len) {
      const idx = (startIdx + i) % len
      const point = contour[idx]

      if (point.onCurve) {
        if (offCurveBuffer.length === 0) {
          // 직선
          path.lineTo(point.x, point.y)
        } else if (offCurveBuffer.length === 1) {
          // Quadratic bezier (opentype.js quadraticCurveTo)
          path.quadraticCurveTo(
            offCurveBuffer[0].x, offCurveBuffer[0].y,
            point.x, point.y
          )
          offCurveBuffer.length = 0
        } else if (offCurveBuffer.length >= 2) {
          // Cubic bezier
          path.curveTo(
            offCurveBuffer[0].x, offCurveBuffer[0].y,
            offCurveBuffer[1].x, offCurveBuffer[1].y,
            point.x, point.y
          )
          offCurveBuffer.length = 0
        }
      } else {
        offCurveBuffer.push({ x: point.x, y: point.y })
      }

      i++
    }

    // 남은 off-curve 점 처리 (시작점으로 닫기)
    const startPoint = contour[startIdx]
    if (offCurveBuffer.length === 1) {
      path.quadraticCurveTo(
        offCurveBuffer[0].x, offCurveBuffer[0].y,
        startPoint.x, startPoint.y
      )
    } else if (offCurveBuffer.length >= 2) {
      path.curveTo(
        offCurveBuffer[0].x, offCurveBuffer[0].y,
        offCurveBuffer[1].x, offCurveBuffer[1].y,
        startPoint.x, startPoint.y
      )
    }

    path.close()
  }

  return path
}

// ===== 글리프 생성 =====

/**
 * GlyphData → OTF에 들어가는 최종 컨투어(폰트 좌표, 획 겹침 합친 뒤).
 * 화면 잉크와 맞는지 재는 테스트가 같은 값을 보도록 따로 뺐다.
 */
export function glyphDataToFontContours(glyphData: GlyphData): Contour[] {
  // CFF 1은 겹친 컨투어를 even-odd로 상쇄하므로 획별 잉크 묶음을 유지한다.
  const contourGroups: Contour[][] = []

  for (const resolved of glyphData.strokes) {
    const renderStyle = glyphData.strokeStyle ?? { mode: 'brush' as const, brush: glyphData.brush }
    // 둥근 붓촉이라도 전역 둥글기가 있으면 화면과 같은 채운 윤곽(`strokeToRenderInkGroups`)으로 간다.
    if (needsFilledRenderInk(renderStyle)) {
      const groups = brushInkGroupsToFontContours(
        renderStyle.mode === 'brush' && renderStyle.brush.tip !== 'round'
          ? strokeToBrushInkGroups(resolved.stroke, resolved.box, glyphData.weightMultiplier, renderStyle.brush)
          : strokeToRenderInkGroups(resolved.stroke, resolved.box, glyphData.weightMultiplier, renderStyle),
        UPM,
        ASCENDER,
        glyphData.slant,
      )
      contourGroups.push(...groups)
      continue
    }
    const contours = strokeToContours(
      resolved.stroke,
      resolved.box,
      UPM,
      {
        weightMultiplier: glyphData.weightMultiplier,
        slant: glyphData.slant,
        globalLinecap: resolved.effectiveLinecap,
        globalLinejoin: resolved.effectiveLinejoin,
        ascender: ASCENDER,
      }
    )
    if (contours.length > 0) contourGroups.push(contours)
  }

  // 세로줄기 부리: 화면과 같은 함수로 만든 면을 획 잉크와 함께 합친다.
  const beakGroups = stemBeakInkGroups(glyphData.strokes.map((resolved, index) => ({
    stroke: resolved.stroke,
    box: resolved.box,
    // 부리는 기둥 폭에 맞춘다(화면과 같이 가로·세로 대비를 읽는다).
    weightMultiplier: glyphData.weightMultiplier * verticalWidthFactorOf(glyphData.strokeStyle),
    group: resolved.beakGroup ?? `stroke-${index}`,
  })), glyphData.stemBeak, glyphData.strokeStyle)
  contourGroups.push(...brushInkGroupsToFontContours(beakGroups.flat(), UPM, ASCENDER, glyphData.slant))

  let mergedContours: Contour[]
  try {
    mergedContours = mergeStrokeContourGroupsForCff(contourGroups)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`${glyphData.char}(U+${glyphData.unicode.toString(16).toUpperCase()}) 컨투어 합치기 실패: ${reason}`)
  }
  return mergedContours
}

/**
 * GlyphData → opentype.js Glyph 변환
 */
function createGlyph(
  glyphData: GlyphData,
): InstanceType<typeof opentype.Glyph> {
  const mergedContours = glyphDataToFontContours(glyphData)

  // 겹침이 제거된 컨투어 → opentype.js Path
  const path = contoursToPath(mergedContours)

  // 유니코드 이름 생성
  const unicodeHex = glyphData.unicode.toString(16).toUpperCase().padStart(4, '0')

  return new opentype.Glyph({
    name: `uni${unicodeHex}`,
    unicode: glyphData.unicode,
    advanceWidth: glyphData.advanceWidth,
    path: path,
  })
}

/** 윤곽을 못 만든 글자. 자리(cmap · 너비)는 지키고 모양만 비운다. */
function createEmptyGlyph(glyphData: GlyphData): InstanceType<typeof opentype.Glyph> {
  const unicodeHex = glyphData.unicode.toString(16).toUpperCase().padStart(4, '0')
  return new opentype.Glyph({
    name: `uni${unicodeHex}`,
    unicode: glyphData.unicode,
    advanceWidth: glyphData.advanceWidth,
    path: new opentype.Path(),
  })
}

/** Shape final regions에는 출력 좌표 투영만 적용한다. Boolean과 획 확장은 재실행하지 않는다. */
function createFinalRegionGlyph(
  glyphData: FinalRegionGlyphData,
): InstanceType<typeof opentype.Glyph> {
  const contours = projectFinalGlyphInkToFontContours(glyphData.finalInk, {
    upm: UPM,
    ascender: ASCENDER,
    slant: glyphData.slant,
    originX: glyphData.originX,
  })
  const unicodeHex = glyphData.unicode.toString(16).toUpperCase().padStart(4, '0')
  return new opentype.Glyph({
    name: `uni${unicodeHex}`,
    unicode: glyphData.unicode,
    advanceWidth: glyphData.advanceWidth,
    path: contoursToPath(contours),
  })
}

/**
 * 자동 문맥 선택이 연결되기 전, 검증된 Shape request 하나를 실제 OTF로 확인하는 명시적 seam.
 * 전체 11,223자를 미리 면으로 만들지 않고 전달된 한 글리프만 소비한다.
 */
export function buildFinalRegionPrototypeFontBuffer(
  glyphData: FinalRegionGlyphData,
  familyName = 'FontMaker Shape Prototype',
): ArrayBuffer {
  assertFinalRegionGlyphData(glyphData)
  const identity = createFontIdentity(familyName, 'Regular')
  const glyphs = [
    createNotdefGlyph(),
    createSpaceGlyph(DEFAULT_ADVANCE_WIDTH / 2),
    createFinalRegionGlyph(glyphData),
  ]
  const font = new opentype.Font({
    familyName: identity.asciiFamilyName,
    styleName: 'Regular',
    unitsPerEm: UPM,
    ascender: ASCENDER,
    descender: DESCENDER,
    glyphs,
  })
  setFontNameRecords(font, familyName, 'Regular', identity)
  return font.toArrayBuffer() as ArrayBuffer
}

/**
 * .notdef 글리프 생성 (빈 사각형)
 */
function createNotdefGlyph(): InstanceType<typeof opentype.Glyph> {
  const path = new opentype.Path()

  // 외곽 사각형 (시계 방향)
  const margin = 50
  const w = DEFAULT_ADVANCE_WIDTH - margin * 2
  const h = UPM * 0.8
  const y0 = 0

  path.moveTo(margin, y0)
  path.lineTo(margin + w, y0)
  path.lineTo(margin + w, y0 + h)
  path.lineTo(margin, y0 + h)
  path.close()

  // 내부 빈 공간 (반시계 방향 = 구멍)
  const inset = 40
  path.moveTo(margin + inset, y0 + inset)
  path.lineTo(margin + inset, y0 + h - inset)
  path.lineTo(margin + w - inset, y0 + h - inset)
  path.lineTo(margin + w - inset, y0 + inset)
  path.close()

  return new opentype.Glyph({
    name: '.notdef',
    unicode: 0,
    advanceWidth: DEFAULT_ADVANCE_WIDTH,
    path: path,
  })
}

/**
 * 스페이스 글리프 생성
 */
function createSpaceGlyph(advanceWidth: number): InstanceType<typeof opentype.Glyph> {
  return new opentype.Glyph({
    name: 'space',
    unicode: 32,
    advanceWidth,
    path: new opentype.Path(),
  })
}

// ===== 다운로드 =====

/**
 * ArrayBuffer를 TTF 파일로 다운로드. 완료 페이지의 `다시 받기`도 같은 길.
 */
export function downloadTTF(
  arrayBuffer: ArrayBuffer,
  fileName: string = 'fontmaker.otf'
): void {
  const blob = new Blob([arrayBuffer], { type: 'font/otf' })
  const url = URL.createObjectURL(blob)

  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.style.display = 'none'
  document.body.appendChild(link)
  link.click()

  // 정리
  setTimeout(() => {
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, 100)
}

// ===== 청크 처리 유틸리티 =====

/**
 * 대량 항목을 청크 단위로 처리 (UI 블로킹 방지)
 */
async function processInChunks<T, R>(
  items: T[],
  processor: (item: T) => R,
  chunkSize: number = 100,
  onProgress?: (done: number, total: number) => void
): Promise<R[]> {
  const results: R[] = []

  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize)
    for (const item of chunk) {
      results.push(processor(item))
    }

    const done = Math.min(i + chunkSize, items.length)
    onProgress?.(done, items.length)

    // UI 스레드에 제어권 양보
    await new Promise(resolve => setTimeout(resolve, 0))
  }

  return results
}

/**
 * 윈도우는 usWinAscent/usWinDescent 밖의 잉크를 잘라 그린다. 획을 위아래로 크게 옮긴 글자도 잘리지 않게
 * 실제 잉크 끝까지 넓힌다. 줄 간격(hhea · typo)은 그대로라 맥과 줄 높이는 바뀌지 않는다.
 */
export function windowsClipMetrics(
  glyphs: ReadonlyArray<InstanceType<typeof opentype.Glyph>>,
): { usWinAscent: number; usWinDescent: number } {
  let yMax = ASCENDER
  let yMin = DESCENDER
  for (const glyph of glyphs) {
    if (!glyph.path?.commands.length) continue
    const box = glyph.getBoundingBox()
    yMax = Math.max(yMax, box.y2)
    yMin = Math.min(yMin, box.y1)
  }
  return { usWinAscent: Math.ceil(yMax), usWinDescent: Math.ceil(-yMin) }
}

// ===== 메인 생성 함수 =====

/**
 * TTF 폰트를 생성하고 다운로드
 *
 * 전체 파이프라인:
 * 1. 스토어에서 전체 글리프 데이터 수집 (11,000+ 글리프)
 * 2. 각 글리프의 획을 윤곽 컨투어로 변환
 * 3. opentype.js 폰트 조립
 * 4. .otf 파일 다운로드
 *
 * async로 구현하여 UI 블로킹 방지 (100개씩 청크 처리)
 */
export async function generateAndDownloadFont(
  options: FontGeneratorOptions = {}
): Promise<FontGeneratorResult> {
  const {
    familyName = 'FontMaker',
    styleName = 'Regular',
    onProgress,
    placementOf,
    revision = 0,
  } = options

  try {
    // Phase 1: 글리프 데이터 수집
    onProgress?.(0, 1, '글리프 데이터 수집 중...')

    // 모델 상자는 글자마다 획을 칸에 맞추느라 전수에 십여 초가 걸린다. 나눠 돌려 진행 표시가 멈추지 않게 한다.
    const glyphDataList = (await processInChunks(
      allExportChars(),
      (char) => collectGlyphDataWithPlacement(char, placementOf),
      placementOf ? 100 : 2000,
      (done, total) => onProgress?.(done, total, '글리프 데이터 수집 중...'),
    )).filter((data): data is GlyphData => data !== null)
    const schemaFallbackCount = placementOf
      ? glyphDataList.filter((data) => data.unicode >= 0xAC00 && data.placementKind === 'schema').length
      : undefined

    if (glyphDataList.length === 0) {
      return { success: false, glyphCount: 0, error: '생성할 글리프가 없습니다.' }
    }

    assertCmapFormat4Capacity([
      { codePoint: 0x20, glyphIndex: 1 },
      ...glyphDataList.map((data, index) => ({
        codePoint: data.unicode,
        glyphIndex: index + 2,
      })),
    ])

    // Phase 2: 글리프 변환 (획 → 윤곽)
    const glyphs: Array<InstanceType<typeof opentype.Glyph>> = [
      createNotdefGlyph(),
      createSpaceGlyph(getCurrentSpaceAdvance()),
    ]

    // 한 글자가 실패해도 폰트 전체를 버리지 않는다. 그 글자만 빈 글리프로 넣고 알린다(피드백 35).
    const skippedChars: string[] = []
    const hangulGlyphs = await processInChunks(
      glyphDataList,
      (data) => {
        try {
          return createGlyph(data)
        } catch (error) {
          console.error(`글리프 생성 실패, 빈 글리프로 넣음: ${data.char}`, error)
          skippedChars.push(data.char)
          return createEmptyGlyph(data)
        }
      },
      100,
      (done, total) => {
        onProgress?.(done, total, '글리프 윤곽 변환 중...')
      }
    )

    glyphs.push(...hangulGlyphs)

    // Phase 3: 폰트 조립
    onProgress?.(0, 1, '폰트 파일 생성 중...')

    // OS 설치 충돌을 피하는 ASCII/PostScript 식별자 생성
    const identity = createFontIdentity(familyName, styleName)
    const { asciiFamilyName } = identity

    // 글로벌 스타일에서 weight 가져오기
    const styleState = useGlobalStyleStore.getState()
    const usWeightClass = styleState.style.weight || 400

    const font = new opentype.Font({
      familyName: asciiFamilyName,
      styleName,
      unitsPerEm: UPM,
      ascender: ASCENDER,
      descender: DESCENDER,
      glyphs: glyphs,
      weightClass: usWeightClass,
      widthClass: 5,       // Normal
      fsSelection: usWeightClass >= 700 ? 0x0020 : 0x0040, // BOLD or REGULAR
      tables: {
        os2: {
          usWeightClass,
          usWidthClass: 5,
          // Basic Latin(space) + Hangul Compatibility Jamo(bit 52) + Hangul Syllables(bit 56)
          ulUnicodeRange1: OS2_UNICODE_RANGE_1,
          ulUnicodeRange2: OS2_UNICODE_RANGE_2,
          ulUnicodeRange3: 0x00000000,
          ulUnicodeRange4: 0x00000000,
          // CP949 Korean Wansung (bit 19)
          ulCodePageRange1: OS2_CODE_PAGE_RANGE_1,
          ulCodePageRange2: 0,
          // Windows 클리핑 메트릭 (양수값, macOS는 hhea 사용하므로 영향 없음)
          ...windowsClipMetrics(glyphs),
          sTypoAscender: ASCENDER,
          sTypoDescender: DESCENDER,
          sTypoLineGap: 0,
          fsSelection: usWeightClass >= 700 ? 0x0020 : 0x0040,
        },
      },
    })

    // name 테이블 설정 (macOS Font Book 유효성 + Windows 호환)
    setFontNameRecords(font, familyName, styleName, identity, revision)

    // Phase 4: 다운로드
    const arrayBuffer = font.toArrayBuffer() as ArrayBuffer
    setHeadFontRevision(arrayBuffer, revision)
    const fileSize = arrayBuffer.byteLength

    const sanitizedName = familyName.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s_-]/g, '').trim() || 'fontmaker'
    const fileName = `${sanitizedName}.otf`
    downloadTTF(arrayBuffer, fileName)

    return {
      success: true,
      glyphCount: glyphs.length,
      fileSize,
      schemaFallbackCount,
      skippedChars,
      bytes: arrayBuffer,
      fileName,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('폰트 생성 실패:', error)
    return {
      success: false,
      glyphCount: 0,
      error: `폰트 생성 실패: ${message}`,
    }
  }
}

/**
 * 프로토타입: 단일 문자의 글리프만 포함하는 테스트 폰트 생성
 *
 * 브라우저 콘솔에서 빠른 테스트용:
 * ```
 * import { downloadPrototypeFont } from './services/fontGenerator'
 * downloadPrototypeFont('가')
 * ```
 */
export async function downloadPrototypeFont(
  char: string = 'ㄱ',
  familyName: string = 'FontMaker Prototype'
): Promise<FontGeneratorResult> {
  try {
    const { collectGlyphDataForChar } = await import('./fontExportUtils')
    const glyphData = collectGlyphDataForChar(char)
    if (!glyphData) {
      return { success: false, glyphCount: 0, error: `'${char}'의 글리프 데이터를 찾을 수 없습니다.` }
    }

    assertCmapFormat4Capacity([
      { codePoint: 0x20, glyphIndex: 1 },
      { codePoint: glyphData.unicode, glyphIndex: 2 },
    ])

    const glyphs = [
      createNotdefGlyph(),
      createSpaceGlyph(getCurrentSpaceAdvance()),
      createGlyph(glyphData),
    ]

    const identity = createFontIdentity(familyName, 'Regular')
    const { asciiFamilyName } = identity

    const font = new opentype.Font({
      familyName: asciiFamilyName,
      styleName: 'Regular',
      unitsPerEm: UPM,
      ascender: ASCENDER,
      descender: DESCENDER,
      glyphs,
      tables: {
        os2: {
          ulUnicodeRange1: OS2_UNICODE_RANGE_1,
          ulUnicodeRange2: OS2_UNICODE_RANGE_2,
          ulCodePageRange1: OS2_CODE_PAGE_RANGE_1,
          ...windowsClipMetrics(glyphs),
          sTypoAscender: ASCENDER,
          sTypoDescender: DESCENDER,
          sTypoLineGap: 0,
        },
      },
    })

    setFontNameRecords(font, familyName, 'Regular', identity)

    const arrayBuffer = font.toArrayBuffer() as ArrayBuffer
    downloadTTF(arrayBuffer, `${familyName}-prototype.otf`)

    return {
      success: true,
      glyphCount: glyphs.length,
      fileSize: arrayBuffer.byteLength,
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    return { success: false, glyphCount: 0, error: message }
  }
}
