import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import type { FontData } from '../src/types/database'

/** 관리자 미리보기(`previewFontOf` + `FontDataGlyph`)는 스토어를 거치지 않고, 스토어가 불러온 것과 같은 값으로 그려야 한다. */
const storageValues = new Map<string, string>()
vi.stubGlobal('localStorage', {
  get length() { return storageValues.size },
  clear: () => storageValues.clear(),
  getItem: (key: string) => storageValues.get(key) ?? null,
  key: (index: number) => [...storageValues.keys()][index] ?? null,
  removeItem: (key: string) => { storageValues.delete(key) },
  setItem: (key: string, value: string) => { storageValues.set(key, value) },
})

let bridge: typeof import('../src/services/fontDataBridge')
let FontDataGlyph: typeof import('./fontDataGlyph').FontDataGlyph
let previewFontOf: typeof import('./previewFont').previewFontOf
/** 아무도 손대기 전의 기본 폰트. 뒤 테스트가 스토어에 친구 폰트를 넣어도 이 값은 그대로다. */
let baseFont: FontData

beforeAll(async () => {
  bridge = await import('../src/services/fontDataBridge')
  FontDataGlyph = (await import('./fontDataGlyph')).FontDataGlyph
  previewFontOf = (await import('./previewFont')).previewFontOf
  baseFont = structuredClone(bridge.collectFontData())
})

/** 기본값과 다른 친구 폰트: 굵기 · 기울기 · 여백 · 획 하나 뺌. */
function friendFont(): FontData {
  const data = structuredClone(baseFont)
  data.globalStyle.style = { ...data.globalStyle.style, weight: 700, slant: 6 }
  data.globalPadding = { ...data.globalPadding, left: data.globalPadding.left + 0.02 }
  const hieut = data.jamoData.choseong['ㅎ']
  if (hieut?.strokes && hieut.strokes.length > 1) hieut.strokes = hieut.strokes.slice(1)
  return data
}

const CHARS = ['각', '의', '뷁', '호', '까']

describe('관리자 폰트 미리보기', () => {
  it('미리보기는 이 기기 저장소를 건드리지 않는다', () => {
    const data = friendFont()
    const before = new Map(storageValues)
    const prepared = previewFontOf(data)
    expect(prepared.ok).toBe(true)
    if (!prepared.ok) return
    for (const char of CHARS) renderToStaticMarkup(createElement(FontDataGlyph, { font: prepared.font, char, size: 40 }))
    expect(new Map(storageValues)).toEqual(before)
  })

  it('스토어의 불러오기와 같은 값을 만든다', async () => {
    const data = friendFont()
    const prepared = previewFontOf(data)
    if (!prepared.ok) throw new Error(prepared.message)
    const before = new Map(storageValues)
    expect(bridge.applyFontData(data).ok).toBe(true)
    // 저장소 흉내가 살아 있는지: 스토어에 넣으면 적힌다(그래서 앞 테스트의 '안 적힘'이 뜻이 있다).
    expect(new Map(storageValues)).not.toEqual(before)
    const jamo = (await import('../src/stores/jamoStore')).useJamoStore.getState()
    const layout = (await import('../src/stores/layoutStore')).useLayoutStore.getState()
    const style = (await import('../src/stores/globalStyleStore')).useGlobalStyleStore.getState()
    const { font } = prepared
    expect(font.jamo).toEqual({ choseong: jamo.choseong, jungseong: jamo.jungseong, jongseong: jamo.jongseong })
    expect(font.layoutSchemas).toEqual(layout.layoutSchemas)
    expect(font.globalPadding).toEqual(layout.globalPadding)
    expect(font.paddingOverrides).toEqual(layout.paddingOverrides)
    expect(font.style).toEqual(style.style)
    expect(font.exclusions).toEqual(style.exclusions)
    expect(font.style.weight).toBe(700)
  })

  it('폰트 값대로 그린다(굵기 · 기울기)', () => {
    const plain = previewFontOf(baseFont)
    const friend = previewFontOf(friendFont())
    if (!plain.ok || !friend.ok) throw new Error('폰트를 못 읽음')
    const plainSvg = renderToStaticMarkup(createElement(FontDataGlyph, { font: plain.font, char: '각', size: 40 }))
    const friendSvg = renderToStaticMarkup(createElement(FontDataGlyph, { font: friend.font, char: '각', size: 40 }))
    expect(plainSvg).not.toContain('skewX')
    expect(friendSvg).toContain('skewX(-6)')
    expect(friendSvg).not.toBe(plainSvg)
  })

  it('틀린 JSON은 까닭을 돌려준다', () => {
    const result = previewFontOf({ version: 'nope' })
    expect(result.ok).toBe(false)
  })
})
