import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'
import type { StrokeDataV2 } from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { strokeToContours } from '../src/services/strokeToOutline'
import baseJamos from '../src/data/baseJamos.json'

const UPM = 1000
const ASCENDER = 880
const storageValues = new Map<string, string>()

beforeAll(() => {
  vi.stubGlobal('localStorage', {
    getItem: (key: string) => storageValues.get(key) ?? null,
    setItem: (key: string, value: string) => storageValues.set(key, value),
    removeItem: (key: string) => storageValues.delete(key),
  })
})

afterAll(() => vi.unstubAllGlobals())

const jamos = baseJamos as unknown as {
  choseong: Parameters<typeof decomposeSyllable>[1]
  jungseong: Parameters<typeof decomposeSyllable>[2]
  jongseong: Parameters<typeof decomposeSyllable>[3]
}

const cornerStroke: StrokeDataV2 = {
  id: 'corner',
  closed: false,
  thickness: 0.1,
  points: [
    { x: 0.2, y: 0.2 },
    { x: 0.8, y: 0.2 },
    { x: 0.8, y: 0.8 },
  ],
}

function contours(linejoin: 'round' | 'miter' | 'bevel') {
  return strokeToContours(
    cornerStroke,
    { x: 0, y: 0, width: 1, height: 1 },
    UPM,
    {
      weightMultiplier: 1,
      slant: 0,
      globalLinecap: 'butt',
      globalLinejoin: linejoin,
      ascender: ASCENDER,
    },
  )
}

describe('OTF 출력 계약', () => {
  it('폰트 좌표의 중심선을 880 ascender 기준으로 배치한다', () => {
    const horizontal: StrokeDataV2 = {
      id: 'top',
      closed: false,
      thickness: 0.1,
      points: [{ x: 0.2, y: 0 }, { x: 0.8, y: 0 }],
    }
    const [outline] = strokeToContours(
      horizontal,
      { x: 0, y: 0, width: 1, height: 1 },
      UPM,
      {
        weightMultiplier: 1,
        slant: 0,
        globalLinecap: 'butt',
        globalLinejoin: 'round',
        ascender: ASCENDER,
      },
    )
    const minY = Math.min(...outline.map((point) => point.y))
    const maxY = Math.max(...outline.map((point) => point.y))
    expect((minY + maxY) / 2).toBe(ASCENDER)
  })

  it('round, miter, bevel 꺾임을 서로 다른 윤곽으로 만든다', () => {
    const round = contours('round')[0]
    const miter = contours('miter')[0]
    const bevel = contours('bevel')[0]
    expect(round.length).toBeGreaterThan(bevel.length)
    expect(miter).not.toEqual(bevel)
  })

  it('대각선 round cap이 예약한 반경 밖으로 튀어나오지 않는다', () => {
    const diagonal: StrokeDataV2 = {
      id: 'diagonal',
      closed: false,
      thickness: 0.07,
      points: [{ x: 0, y: 0 }, { x: 0.5, y: 0.5 }],
    }
    const [outline] = strokeToContours(
      diagonal,
      { x: 0.035, y: 0.1, width: 0.5, height: 0.5 },
      UPM,
      {
        weightMultiplier: 1,
        slant: 0,
        globalLinecap: 'round',
        globalLinejoin: 'round',
        ascender: ASCENDER,
      },
    )
    expect(Math.min(...outline.map((point) => point.x))).toBeGreaterThanOrEqual(0)
  })

  it('겹받침 호환 자모는 종성 마스터로 독립 글리프를 만든다', () => {
    const decomposed = decomposeSyllable('ㄳ', jamos.choseong, jamos.jungseong, jamos.jongseong)
    expect(decomposed.choseong?.char).toBe('ㄳ')
    expect(decomposed.choseong?.type).toBe('choseong')
    expect(decomposed.choseong?.strokes?.length).toBeGreaterThan(0)
  })

  it('OS/2 범위는 실제 제공하는 한글 영역만 표시한다', async () => {
    const {
      OS2_CODE_PAGE_RANGE_1,
      OS2_UNICODE_RANGE_1,
      OS2_UNICODE_RANGE_2,
    } = await import('../src/services/fontExportUtils')
    expect(OS2_UNICODE_RANGE_1).toBe(0x00000001)
    expect(OS2_UNICODE_RANGE_2).toBe((1 << 20) | (1 << 24))
    expect(OS2_CODE_PAGE_RANGE_1).toBe(1 << 19)
  })

  it('글로벌 Design Body 가로폭 변화율을 스페이스 advance에 적용한다', async () => {
    const { calculateSpaceAdvance } = await import('../src/services/fontExportUtils')
    expect(calculateSpaceAdvance({ top: .075, right: .075, bottom: .075, left: .075 })).toBe(500)
    expect(calculateSpaceAdvance({ top: .075, right: .2025, bottom: .075, left: .2025 })).toBe(350)
  })

  it('한글 폰트 이름마다 고유한 PostScript 이름을 만든다', async () => {
    const { createFontIdentity } = await import('../src/services/fontGenerator')
    const first = createFontIdentity('감사 폰트', 'Regular')
    const second = createFontIdentity('예쁜 폰트', 'Regular')
    expect(first.postScriptName).not.toBe(second.postScriptName)
    expect(first.postScriptName).toMatch(/^[a-zA-Z0-9-]+$/)
    expect(createFontIdentity('Font Maker', 'Regular').asciiFamilyName).toBe('Font Maker')
  })

  it('신규 보정 화면의 레이아웃 프로필을 저장 스키마를 바꾸지 않고 출력에 반영한다', async () => {
    const [{ collectGlyphDataForChar }, { useLayoutStore }] = await Promise.all([
      import('../src/services/fontExportUtils'),
      import('../src/stores/layoutStore'),
    ])
    const layoutType = 'choseong-jungseong-vertical'
    const storedSchema = structuredClone(useLayoutStore.getState().layoutSchemas[layoutType])
    const before = collectGlyphDataForChar('가')
    const profiled = collectGlyphDataForChar('가', {
      layoutProfile: {
        [layoutType]: {
          CH: { top: 0, bottom: 0, left: 0.08, right: -0.08 },
        },
      },
    })
    const beforeChoseong = before?.strokes.find((item) => item.stroke.id.startsWith('ㄱ'))
    const profiledChoseong = profiled?.strokes.find((item) => item.stroke.id.startsWith('ㄱ'))
    expect(profiledChoseong?.box.x).toBeGreaterThan(beforeChoseong!.box.x)
    expect(useLayoutStore.getState().layoutSchemas[layoutType]).toEqual(storedSchema)
  })
})
