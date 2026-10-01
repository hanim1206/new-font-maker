import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * 같은 일은 같은 코드 한 곳을 지난다. 화면이 달라도 글자 그리기 · 저장값 환산 · 편집 한계는 공용 입구 하나다.
 * 입구 밖에서 같은 일을 다시 하는 코드가 생기면 여기서 실패한다 — 새 소비자가 입구를 우회하면 그 화면만 어긋나기 때문이다.
 * 입구를 옮기거나 새로 만들면 이 표의 `allowed`를 같이 고친다.
 */

const ROOT = path.resolve(__dirname, '../..')
const SOURCE_DIRS = ['src', 'src-next']

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return entry.name === 'node_modules' ? [] : sourceFiles(full)
    return /\.(ts|tsx)$/.test(entry.name) && !/\.test\.(ts|tsx)$/.test(entry.name) ? [full] : []
  })
}

const FILES = SOURCE_DIRS.flatMap((dir) => sourceFiles(path.join(ROOT, dir))).map((file) => ({ file: path.relative(ROOT, file), text: readFileSync(file, 'utf8') }))

/** `pattern`이 나오는 파일 중 `allowed` 밖의 것. */
function offenders(pattern: RegExp, allowed: readonly string[]): string[] {
  return FILES.filter(({ file, text }) => pattern.test(text) && !allowed.includes(file)).map(({ file }) => file)
}

describe('공용 입구 가드', () => {
  it('레이아웃 여백 합치기는 `mergePadding` · `mergeLayoutPadding` 하나다', () => {
    expect(offenders(/\.\.\.globalPadding,\s*\.\.\./, ['src/stores/layoutStore.ts'])).toEqual([])
  })

  it('실효 스타일(제외 규칙 + 네모꼴 보정)은 `resolveEffectiveStyle`이 만든다', () => {
    expect(offenders(/withBodyCompensation\(\s*effectiveStyleOf\(/, ['src/stores/globalStyleStore.ts'])).toEqual([])
  })

  it('옛 0.075 네모꼴 환산은 저장값 읽는 입구와 localStorage 복원에서만 부른다', () => {
    expect(offenders(/normalizeReferencePadding\(/, ['src/services/designBodyPlacement.ts', 'src/services/fontDataMigration.ts', 'src/stores/layoutStore.ts'])).toEqual([])
  })

  it('옛 획 이전과 얇은 칸 환산은 저장값 읽는 입구와 localStorage 복원에서만 부른다', () => {
    // `fontDataPayloadValidation`은 `parseAndMigrateFontData`가 부르는 1.2 이관 단계라 입구의 일부다.
    expect(offenders(/\bmigrateJamoData\(/, ['src/utils/strokeMigration.ts', 'src/services/fontDataPayloadValidation.ts'])).toEqual([])
    expect(offenders(/\bmigrateJamoMap\(/, ['src/utils/strokeMigration.ts', 'src/services/fontDataMigration.ts', 'src/stores/jamoStore.ts', 'src-next/previewFont.ts'])).toEqual([])
    expect(offenders(/\bwithThinStemsInEm\(/, ['src/utils/thinStemMigration.ts', 'src/services/fontDataMigration.ts', 'src/stores/jamoStore.ts'])).toEqual([])
  })

  it('`migrateStrokes`는 한 곳에만 정의한다', () => {
    const defined = FILES.filter(({ text }) => /export function migrateStrokes\b/.test(text)).map(({ file }) => file)
    expect(defined).toEqual(['src/utils/strokeMigration.ts'])
  })

  it('문장 줄의 글자 칸 · 띄어쓰기는 추출 폰트와 같은 `fontMetrics`에서 온다', () => {
    // 옛 식(몸통 폭 × 1000, 띄어쓰기를 몸통 비율로)이 다시 생기면 문장 화면과 추출 폰트의 글자 간격이 어긋난다.
    expect(offenders(/metrics\.spaceAdvance\s*\*/, [])).toEqual([])
    expect(offenders(/\*\s*\.85\b/, [])).toEqual([])
    expect(offenders(/\(1 - \w+\.left - \w+\.right\) \* fontSpace\.unitsPerEm/, [])).toEqual([])
  })

  it('글리프 밑선 880은 `fontMetrics.BASELINE_Y` 한 곳에서 온다', () => {
    // 글자 안내선 실험실의 880은 그 실험실이 동결한 계약 값이라 제품 밑선과 별개다.
    expect(offenders(/\b(ASCENDER|BASELINE_Y)\s*=\s*880\b/, ['src/services/fontMetrics.ts', 'src-next/FontGuideLabPage.tsx'])).toEqual([])
  })
})
