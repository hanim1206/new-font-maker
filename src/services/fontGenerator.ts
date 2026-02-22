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
import { collectAllGlyphData, UPM, DEFAULT_ADVANCE_WIDTH, ASCENDER, DESCENDER } from './fontExportUtils'
import type { GlyphData } from './fontExportUtils'

// ===== 타입 정의 =====

/** 폰트 생성 옵션 */
export interface FontGeneratorOptions {
  familyName?: string
  styleName?: string
  onProgress?: (completed: number, total: number, phase: string) => void
}

/** 폰트 생성 결과 */
export interface FontGeneratorResult {
  success: boolean
  glyphCount: number
  fileSize?: number
  error?: string
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
  // 모든 획의 컨투어 수집
  const allContours: Contour[] = []

  for (const resolved of glyphData.strokes) {
    const contours = strokeToContours(
      resolved.stroke,
      resolved.box,
      UPM,
      {
        weightMultiplier: glyphData.weightMultiplier,
        slant: glyphData.slant,
        globalLinecap: resolved.effectiveLinecap,
      }
    )
    allContours.push(...contours)
  }

  // 컨투어 → opentype.js Path
  const path = contoursToPath(allContours)

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
function createSpaceGlyph(): InstanceType<typeof opentype.Glyph> {
  return new opentype.Glyph({
    name: 'space',
    unicode: 32,
    advanceWidth: Math.round(DEFAULT_ADVANCE_WIDTH / 2),
    path: new opentype.Path(),
  })
}

// ===== 다운로드 =====

/**
 * ArrayBuffer를 TTF 파일로 다운로드
 */
function downloadTTF(
  arrayBuffer: ArrayBuffer,
  fileName: string = 'fontmaker.ttf'
): void {
  const blob = new Blob([arrayBuffer], { type: 'font/ttf' })
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
 * 4. .ttf 파일 다운로드
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
  } = options

  try {
    // Phase 1: 글리프 데이터 수집
    onProgress?.(0, 1, '글리프 데이터 수집 중...')

    const glyphDataList = collectAllGlyphData((completed, total) => {
      onProgress?.(completed, total, '글리프 데이터 수집 중...')
    })

    if (glyphDataList.length === 0) {
      return { success: false, glyphCount: 0, error: '생성할 글리프가 없습니다.' }
    }

    // Phase 2: 글리프 변환 (획 → 윤곽)
    const glyphs: Array<InstanceType<typeof opentype.Glyph>> = [
      createNotdefGlyph(),
      createSpaceGlyph(),
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

    const font = new opentype.Font({
      familyName,
      styleName,
      unitsPerEm: UPM,
      ascender: ASCENDER,
      descender: DESCENDER,
      glyphs: glyphs,
    })

    // Phase 4: 다운로드
    const arrayBuffer = font.toArrayBuffer() as ArrayBuffer
    const fileSize = arrayBuffer.byteLength

    const sanitizedName = familyName.replace(/[^a-zA-Z0-9가-힣ㄱ-ㅎㅏ-ㅣ\s_-]/g, '').trim() || 'fontmaker'
    downloadTTF(arrayBuffer, `${sanitizedName}.ttf`)

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
      createSpaceGlyph(),
      createGlyph(glyphData),
    ]

    const font = new opentype.Font({
      familyName,
      styleName: 'Regular',
      unitsPerEm: UPM,
      ascender: ASCENDER,
      descender: DESCENDER,
      glyphs,
    })

    const arrayBuffer = font.toArrayBuffer() as ArrayBuffer
    downloadTTF(arrayBuffer, `${familyName}-prototype.ttf`)

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
