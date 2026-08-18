import { CHOSEONG_LIST, JONGSEONG_LIST, JUNGSEONG_LIST } from '../data/Hangul'
import type {
  BoxConfig,
  DecomposedSyllable,
  JamoData,
  LayoutType,
  MobileEditorPart,
  Part,
  StrokeDataV2,
} from '../types'
import { applyJamoPaddingToBox } from '../utils/containerBoxUtils'
import { classifyJungseong } from '../utils/hangulUtils'
import { COMPOUND_JONGSEONG } from '../utils/jamoLinkUtils'

const CHOSEONG_CAROUSEL = [
  'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
  'ㄲ', 'ㄸ', 'ㅃ', 'ㅆ', 'ㅉ',
]

const JUNGSEONG_CAROUSEL = [
  'ㅗ', 'ㅛ', 'ㅜ', 'ㅠ', 'ㅡ',
  'ㅏ', 'ㅑ', 'ㅓ', 'ㅕ', 'ㅣ',
  'ㅐ', 'ㅔ', 'ㅒ', 'ㅖ',
  'ㅘ', 'ㅙ', 'ㅚ', 'ㅝ', 'ㅞ', 'ㅟ', 'ㅢ',
]

const JONGSEONG_CAROUSEL = [
  'ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ',
  'ㄲ', 'ㄳ', 'ㄵ', 'ㄶ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅄ', 'ㅆ',
]

export interface SyllableJamoChars {
  choseong: string
  jungseong: string
  jongseong: string
}

export interface RenderedStrokeTarget {
  editorPart: MobileEditorPart
  renderPart: Part
  jamo: JamoData
  stroke: StrokeDataV2
  box: BoxConfig
}

export interface JamoContextPreview {
  id: string
  label: string
  syllable: string | null
  active: boolean
}

export function getSyllableJamoChars(char: string): SyllableJamoChars {
  const code = char.charCodeAt(0) - 0xac00
  if (code < 0 || code > 11171) {
    return { choseong: 'ㄱ', jungseong: 'ㅗ', jongseong: 'ㅁ' }
  }
  return {
    choseong: CHOSEONG_LIST[Math.floor(code / 588)],
    jungseong: JUNGSEONG_LIST[Math.floor((code % 588) / 28)],
    jongseong: JONGSEONG_LIST[code % 28],
  }
}

export function composeSyllable(chars: SyllableJamoChars): string {
  const choseongIndex = (CHOSEONG_LIST as readonly string[]).indexOf(chars.choseong)
  const jungseongIndex = (JUNGSEONG_LIST as readonly string[]).indexOf(chars.jungseong)
  const jongseongIndex = (JONGSEONG_LIST as readonly string[]).indexOf(chars.jongseong)
  if (choseongIndex < 0 || jungseongIndex < 0 || jongseongIndex < 0) return '곰'
  return String.fromCharCode(0xac00 + choseongIndex * 588 + jungseongIndex * 28 + jongseongIndex)
}

const CONTEXT_CHOSEONG = ['ㄱ', 'ㄴ', 'ㄹ', 'ㅁ', 'ㅅ']
const CONTEXT_JUNGSEONG = {
  vertical: ['ㅏ', 'ㅓ', 'ㅣ', 'ㅐ', 'ㅔ'],
  horizontal: ['ㅗ', 'ㅜ', 'ㅡ', 'ㅛ', 'ㅠ'],
  mixed: ['ㅘ', 'ㅝ', 'ㅚ', 'ㅟ', 'ㅢ'],
} as const
const CONTEXT_JONGSEONG = ['ㄱ', 'ㄴ', 'ㄹ', 'ㅁ', 'ㅇ']

export function getLayoutContextSyllables(syllable: string, layoutType: LayoutType): string[] {
  if (layoutType === 'choseong-only') return [syllable, ...CONTEXT_CHOSEONG].filter((value, index, values) => values.indexOf(value) === index).slice(0, 5)
  if (layoutType === 'jungseong-vertical-only') return [syllable, ...CONTEXT_JUNGSEONG.vertical].filter((value, index, values) => values.indexOf(value) === index).slice(0, 5)
  if (layoutType === 'jungseong-horizontal-only') return [syllable, ...CONTEXT_JUNGSEONG.horizontal].filter((value, index, values) => values.indexOf(value) === index).slice(0, 5)
  if (layoutType === 'jungseong-mixed-only') return [syllable, ...CONTEXT_JUNGSEONG.mixed].filter((value, index, values) => values.indexOf(value) === index).slice(0, 5)

  const vowelKind = layoutType.includes('mixed') ? 'mixed' : layoutType.includes('horizontal') ? 'horizontal' : 'vertical'
  const hasFinal = layoutType.includes('jongseong')
  const generated = CONTEXT_CHOSEONG.map((choseong, index) => composeSyllable({
    choseong,
    jungseong: CONTEXT_JUNGSEONG[vowelKind][index],
    jongseong: hasFinal ? CONTEXT_JONGSEONG[index] : '',
  }))
  return [syllable, ...generated].filter((value, index, values) => values.indexOf(value) === index).slice(0, 5)
}

export function getJamoCandidates(part: MobileEditorPart): string[] {
  if (part === 'CH') return CHOSEONG_CAROUSEL
  if (part === 'JU') return JUNGSEONG_CAROUSEL
  return JONGSEONG_CAROUSEL
}

/** 빠른 탐색 중심에서는 정밀하게, 바깥에서는 더 빠르게 후보를 넘긴다. */
export function getAcceleratedQuickPickOffset(movementX: number): number {
  const direction = Math.sign(movementX)
  const distance = Math.abs(movementX)
  if (distance < 12) return 0

  const effectiveDistance = distance - 12
  const linearSteps = effectiveDistance / 22
  const acceleratedSteps = (effectiveDistance * effectiveDistance) / 1800
  return direction * Math.max(1, Math.round(linearSteps + acceleratedSteps))
}

function charForPart(chars: SyllableJamoChars, part: MobileEditorPart): string {
  if (part === 'CH') return chars.choseong
  if (part === 'JU') return chars.jungseong
  return chars.jongseong
}

export function replaceSyllablePart(
  syllable: string,
  part: MobileEditorPart,
  jamoChar: string
): string {
  const chars = getSyllableJamoChars(syllable)
  if (part === 'CH') chars.choseong = jamoChar
  else if (part === 'JU') chars.jungseong = jamoChar
  else chars.jongseong = jamoChar
  return composeSyllable(chars)
}

export function getCarouselSyllables(
  syllable: string,
  part: MobileEditorPart
): { previous: string; current: string; next: string } {
  if (part === 'CH' && CHOSEONG_CAROUSEL.includes(syllable)) {
    const currentIndex = CHOSEONG_CAROUSEL.indexOf(syllable)
    return {
      previous: CHOSEONG_CAROUSEL[(currentIndex - 1 + CHOSEONG_CAROUSEL.length) % CHOSEONG_CAROUSEL.length],
      current: syllable,
      next: CHOSEONG_CAROUSEL[(currentIndex + 1) % CHOSEONG_CAROUSEL.length],
    }
  }
  const chars = getSyllableJamoChars(syllable)
  const currentJamo = charForPart(chars, part)
  const candidates = getJamoCandidates(part)
  const currentIndex = Math.max(0, candidates.indexOf(currentJamo))
  const previousJamo = candidates[(currentIndex - 1 + candidates.length) % candidates.length]
  const nextJamo = candidates[(currentIndex + 1) % candidates.length]
  return {
    previous: replaceSyllablePart(syllable, part, previousJamo),
    current: syllable,
    next: replaceSyllablePart(syllable, part, nextJamo),
  }
}

/**
 * 현재 활성 자소를 대표적인 조합 문맥에 넣어 비교한다.
 * 완성 자소 복사본을 만들지 않고 음절만 바꾸므로 모든 카드는 같은 기본형 데이터를 사용한다.
 */
export function getJamoContextPreviews(
  syllable: string,
  part: MobileEditorPart
): JamoContextPreview[] {
  const current = getSyllableJamoChars(syllable)
  const vowelType = classifyJungseong(current.jungseong)

  if (part === 'JU') {
    const hasFinal = current.jongseong !== ''
    return [
      { id: 'giyeok', label: 'ㄱ 초성', syllable: composeSyllable({ choseong: 'ㄱ', jungseong: current.jungseong, jongseong: '' }), active: current.choseong === 'ㄱ' && !hasFinal },
      { id: 'giyeok-final', label: 'ㄱ 초성+받침', syllable: composeSyllable({ choseong: 'ㄱ', jungseong: current.jungseong, jongseong: 'ㄴ' }), active: current.choseong === 'ㄱ' && hasFinal },
      { id: 'mieum', label: 'ㅁ 초성', syllable: composeSyllable({ choseong: 'ㅁ', jungseong: current.jungseong, jongseong: '' }), active: current.choseong === 'ㅁ' && !hasFinal },
      { id: 'mieum-final', label: 'ㅁ 초성+받침', syllable: composeSyllable({ choseong: 'ㅁ', jungseong: current.jungseong, jongseong: 'ㄴ' }), active: current.choseong === 'ㅁ' && hasFinal },
    ]
  }

  if (part === 'CH') {
    const consonant = CHOSEONG_CAROUSEL.includes(syllable) ? syllable : current.choseong
    const hasFinal = current.jongseong !== ''
    const isVertical = vowelType === 'vertical'
    const isHorizontal = vowelType === 'horizontal'
    return [
      {
        id: 'standalone',
        label: '단독 사용',
        syllable: consonant,
        active: syllable === consonant,
      },
      {
        id: 'vertical-no-final',
        label: '세로모음',
        syllable: composeSyllable({ choseong: consonant, jungseong: 'ㅏ', jongseong: '' }),
        active: isVertical && !hasFinal,
      },
      {
        id: 'vertical-with-final',
        label: '세로모음+받침',
        syllable: composeSyllable({ choseong: consonant, jungseong: 'ㅏ', jongseong: 'ㄹ' }),
        active: isVertical && hasFinal,
      },
      {
        id: 'horizontal-no-final',
        label: '가로모음',
        syllable: composeSyllable({ choseong: consonant, jungseong: 'ㅗ', jongseong: '' }),
        active: isHorizontal && !hasFinal,
      },
      {
        id: 'horizontal-with-final',
        label: '가로모음+받침',
        syllable: composeSyllable({ choseong: consonant, jungseong: 'ㅗ', jongseong: 'ㅁ' }),
        active: isHorizontal && hasFinal,
      },
    ]
  }

  const consonant = current.jongseong
  const compoundEntries = Object.entries(COMPOUND_JONGSEONG)
  const preferredCompound = compoundEntries.find(([compound, [first, second]]) => (
    compound === 'ㄶ' && (first === consonant || second === consonant)
  ))
  const frontCompound = preferredCompound?.[1][0] === consonant
    ? preferredCompound[0]
    : compoundEntries.find(([, [first]]) => first === consonant)?.[0]
  const backCompound = preferredCompound?.[1][1] === consonant
    ? preferredCompound[0]
    : compoundEntries.find(([, [, second]]) => second === consonant)?.[0]
  const isCompound = consonant in COMPOUND_JONGSEONG
  const canBeSingleFinal = consonant !== ''
    && !isCompound
    && (JONGSEONG_LIST as readonly string[]).includes(consonant)

  return [
    {
      id: 'single-final',
      label: '홑받침',
      syllable: canBeSingleFinal ? syllable : null,
      active: canBeSingleFinal,
    },
    {
      id: 'compound-front',
      label: '겹받침 · 앞',
      syllable: frontCompound
        ? composeSyllable({ choseong: 'ㅇ', jungseong: 'ㅏ', jongseong: frontCompound })
        : null,
      active: false,
    },
    {
      id: 'compound-back',
      label: '겹받침 · 뒤',
      syllable: backCompound
        ? composeSyllable({ choseong: 'ㅇ', jungseong: 'ㅏ', jongseong: backCompound })
        : null,
      active: false,
    },
  ]
}

export function getActiveJamo(
  syllable: DecomposedSyllable,
  part: MobileEditorPart
): JamoData | null {
  if (part === 'CH') return syllable.choseong
  if (part === 'JU') return syllable.jungseong
  return syllable.jongseong
}

export function getPartLabel(part: MobileEditorPart): string {
  if (part === 'CH') return '초성'
  if (part === 'JU') return '중성'
  return '종성'
}

function paddedBox(box: BoxConfig, jamo: JamoData, part: Part): BoxConfig {
  const padding = part === 'JU_H'
    ? jamo.horizontalPadding ?? jamo.padding
    : part === 'JU_V'
      ? jamo.verticalPadding ?? jamo.padding
      : jamo.padding
  return applyJamoPaddingToBox(box.x, box.y, box.width, box.height, padding)
}

function targets(
  editorPart: MobileEditorPart,
  renderPart: Part,
  jamo: JamoData | null,
  strokes: StrokeDataV2[] | undefined,
  box: BoxConfig | undefined
): RenderedStrokeTarget[] {
  if (!jamo || !strokes || !box) return []
  const renderedBox = paddedBox(box, jamo, renderPart)
  return strokes.map((stroke) => ({ editorPart, renderPart, jamo, stroke, box: renderedBox }))
}

export function getRenderedStrokeTargets(
  syllable: DecomposedSyllable,
  boxes: Partial<Record<Part, BoxConfig>>
): RenderedStrokeTarget[] {
  const result = [
    ...targets('CH', 'CH', syllable.choseong, syllable.choseong?.strokes, boxes.CH),
    ...targets('JO', 'JO', syllable.jongseong, syllable.jongseong?.strokes, boxes.JO),
  ]
  if (boxes.JU && syllable.jungseong) {
    result.push(...targets('JU', 'JU', syllable.jungseong, syllable.jungseong.strokes, boxes.JU))
  } else if (syllable.jungseong) {
    result.push(
      ...targets(
        'JU',
        'JU_H',
        syllable.jungseong,
        syllable.jungseong.horizontalStrokes ?? syllable.jungseong.strokes,
        boxes.JU_H
      ),
      ...targets(
        'JU',
        'JU_V',
        syllable.jungseong,
        syllable.jungseong.verticalStrokes ?? syllable.jungseong.strokes,
        boxes.JU_V
      )
    )
  }
  return result
}
