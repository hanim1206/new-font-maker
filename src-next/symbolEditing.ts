import { isSymbolChar } from '../src/data/symbols'
import { symbolSeedOf } from '../src/data/symbolSeeds'
import { SYMBOL_BASE_WEIGHT, symbolCellOf } from '../src/services/symbolGlyph'
import type { NotoLatinData } from '../src/services/notoLatinSource'
import { UPM } from '../src/services/fontMetrics'
import { useSymbolStore } from '../src/stores/symbolStore'
import type { BoxConfig, DecomposedSyllable, JamoData, StrokeDataV2 } from '../src/types'

/**
 * 편집기가 숫자 · 기호 하나를 여는 문. 편집기는 자모(첫닿자 자리 `CH`) 하나로 다루고, 읽고 쓰는 곳만 기호 저장소로 돌린다.
 * 기호 글자는 한글 자모 글자와 겹치지 않아서 `type: 'choseong'` + 기호 글자로 갈린다.
 * 저장소에 없으면 씨앗 획으로 연다(저장은 고친 뒤에만). 플랜: docs/plans/2026-10-08_숫자-기호-획-편집.md
 */

export { isSymbolChar }

/** 기호의 지금 획. 고친 적 없으면 씨앗. */
export function symbolStrokesOf(char: string): StrokeDataV2[] {
  return useSymbolStore.getState().symbols[char]?.strokes ?? symbolSeedOf(char).strokes
}

export function symbolJamoOf(char: string): JamoData {
  return { type: 'choseong', char, strokes: structuredClone(symbolStrokesOf(char)) }
}

/** 편집기 글자: 첫닿자 자리에 기호 하나. 레이아웃은 쓰지 않는다. */
export function symbolSyllableOf(char: string): DecomposedSyllable {
  return { char, choseong: symbolJamoOf(char), jungseong: null, jongseong: null, layoutType: 'choseong-only' }
}

export function isSymbolJamo(jamo: Pick<JamoData, 'type' | 'char'>): boolean {
  return jamo.type === 'choseong' && isSymbolChar(jamo.char)
}

/** 편집기에서 고친 기호 자모를 저장소에. 획만 남긴다(기준 틀 · 변형은 기호에 없다). */
export function saveSymbolJamo(jamo: JamoData): void {
  useSymbolStore.getState().setStrokes(jamo.char, jamo.strokes ?? [])
}

/** 데이터가 오기 전 칸 폭(노토 400 숫자 폭 555). */
const FALLBACK_CELL_WIDTH = 555 / UPM

/** 캔버스(1em 네모)에서 기호 칸. 노토 400 폭 × EM 높이를 가운데에. 추출(`symbolBoxOf`)과 크기가 같고 가로 자리만 다르다. */
export function symbolCanvasBox(char: string, data: NotoLatinData | null): BoxConfig {
  const width = data ? symbolCellOf(data, char, { weight: SYMBOL_BASE_WEIGHT, letterSpacing: 0 }).cellWidth : FALLBACK_CELL_WIDTH
  return { x: (1 - width) / 2, y: 0, width, height: 1 }
}
