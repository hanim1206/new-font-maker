/**
 * opentype.js를 사용한 TTF 폰트 생성 및 다운로드
 *
 * 파이프라인:
 * 1. collectAllGlyphData() — 스토어에서 글리프 데이터 수집
 * 2. strokeToContours() — 각 획을 윤곽 컨투어로 변환
 * 3. contoursToPath() — 컨투어를 opentype.js Path로 변환
 * 4. opentype.Font — 폰트 조립 + ArrayBuffer → 다운로드
 */
// @ts-expect-error opentype.js에 타입 정의 파일 없음
import opentype from 'opentype.js'
import { strokeToContours } from './strokeToOutline'
import type { Contour } from './strokeToOutline'
import {
  collectAllGlyphData,
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
import type { GlyphData } from './fontExportUtils'
import type { FontLayoutProfile } from './fontExportUtils'
import { mergeStrokeContourGroupsForCff } from './contourBoolean'
import { brushInkGroupsToFontContours, strokeToBrushInkGroups } from './brushGeometry'

// ===== 타입 정의 =====

/** 폰트 생성 옵션 */
export interface FontGeneratorOptions {
  familyName?: string
  styleName?: string
  /** 신규 보정 화면에서 확정한 레이아웃 프로필을 현재 출력에 직접 반영 */
  layoutProfile?: FontLayoutProfile
  onProgress?: (completed: number, total: number, phase: string) => void
}

/** 폰트 생성 결과 */
export interface FontGeneratorResult {
  success: boolean
  glyphCount: number
  fileSize?: number
  error?: string
}

export interface FontIdentity {
  asciiFamilyName: string
  postScriptName: string
}

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
 * GlyphData → opentype.js Glyph 변환
 */
function createGlyph(
  glyphData: GlyphData,
): InstanceType<typeof opentype.Glyph> {
  // CFF 1은 겹친 컨투어를 even-odd로 상쇄하므로 획별 잉크 묶음을 유지한다.
  const contourGroups: Contour[][] = []

  for (const resolved of glyphData.strokes) {
    if (glyphData.brush.tip !== 'round') {
      const groups = brushInkGroupsToFontContours(
        strokeToBrushInkGroups(resolved.stroke, resolved.box, glyphData.weightMultiplier, glyphData.brush),
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

  let mergedContours: Contour[]
  try {
    mergedContours = mergeStrokeContourGroupsForCff(contourGroups)
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    throw new Error(`${glyphData.char}(U+${glyphData.unicode.toString(16).toUpperCase()}) 컨투어 합치기 실패: ${reason}`)
  }

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
 * ArrayBuffer를 TTF 파일로 다운로드
 */
function downloadTTF(
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
    layoutProfile,
    onProgress,
  } = options

  try {
    // Phase 1: 글리프 데이터 수집
    onProgress?.(0, 1, '글리프 데이터 수집 중...')

    const glyphDataList = collectAllGlyphData((completed, total) => {
      onProgress?.(completed, total, '글리프 데이터 수집 중...')
    }, { layoutProfile })

    if (glyphDataList.length === 0) {
      return { success: false, glyphCount: 0, error: '생성할 글리프가 없습니다.' }
    }

    // Phase 2: 글리프 변환 (획 → 윤곽)
    const glyphs: Array<InstanceType<typeof opentype.Glyph>> = [
      createNotdefGlyph(),
      createSpaceGlyph(getCurrentSpaceAdvance()),
    ]

    const hangulGlyphs = await processInChunks(
      glyphDataList,
      (data) => createGlyph(data),
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
          usWinAscent: ASCENDER,
          usWinDescent: Math.abs(DESCENDER),
          sTypoAscender: ASCENDER,
          sTypoDescender: DESCENDER,
          sTypoLineGap: 0,
          fsSelection: usWeightClass >= 700 ? 0x0020 : 0x0040,
        },
      },
    })

    // name 테이블 설정 (macOS Font Book 유효성 + Windows 호환)
    const hasKoreanName = familyName !== asciiFamilyName
    const psFullName = identity.postScriptName

    // 필수 name 레코드 (nameID 0~6)
    font.names.copyright = { en: `Copyright (c) ${new Date().getFullYear()}` }
    font.names.fontFamily = hasKoreanName
      ? { en: asciiFamilyName, ko: familyName }
      : { en: asciiFamilyName }
    font.names.fontSubfamily = { en: styleName }
    font.names.uniqueID = { en: `1.000;NONE;${psFullName}` }
    font.names.fullName = hasKoreanName
      ? { en: `${asciiFamilyName} ${styleName}`, ko: `${familyName} ${styleName}` }
      : { en: `${asciiFamilyName} ${styleName}` }
    font.names.version = { en: 'Version 1.000' }
    font.names.postScriptName = { en: psFullName }
    // preferredFamily: Windows 폰트 메뉴 표시용
    font.names.preferredFamily = hasKoreanName
      ? { en: asciiFamilyName, ko: familyName }
      : { en: asciiFamilyName }
    font.names.preferredSubfamily = { en: styleName }

    // Phase 4: 다운로드
    const arrayBuffer = font.toArrayBuffer() as ArrayBuffer
    const fileSize = arrayBuffer.byteLength

    const sanitizedName = familyName.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s_-]/g, '').trim() || 'fontmaker'
    downloadTTF(arrayBuffer, `${sanitizedName}.otf`)

    return {
      success: true,
      glyphCount: glyphs.length,
      fileSize,
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
          usWinAscent: ASCENDER,
          usWinDescent: Math.abs(DESCENDER),
          sTypoAscender: ASCENDER,
          sTypoDescender: DESCENDER,
          sTypoLineGap: 0,
        },
      },
    })

    font.names.copyright = { en: `Copyright (c) ${new Date().getFullYear()}` }
    font.names.uniqueID = { en: `1.000;NONE;${identity.postScriptName}` }
    font.names.version = { en: 'Version 1.000' }
    font.names.postScriptName = { en: identity.postScriptName }

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
