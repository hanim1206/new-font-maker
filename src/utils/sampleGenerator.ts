import { CHOSEONG_LIST, JUNGSEONG_LIST, JONGSEONG_LIST } from '../data/Hangul'
import { classifyJungseong } from './hangulUtils'
import type { LayoutType } from '../types'

// ===== 샘플 그룹 =====
export interface SampleGroup {
  layoutType: LayoutType
  label: string
  samples: string[]
}

// ===== 유니코드 한글 음절 생성 =====
// 한글 = 0xAC00 + (초성인덱스 * 21 + 중성인덱스) * 28 + 종성인덱스
function composeSyllable(
  choseongIdx: number,
  jungseongIdx: number,
  jongseongIdx: number = 0
): string {
  const code = 0xac00 + (choseongIdx * 21 + jungseongIdx) * 28 + jongseongIdx
  return String.fromCharCode(code)
}

function choseongIndex(char: string): number {
  return (CHOSEONG_LIST as readonly string[]).indexOf(char)
}

function jungseongIndex(char: string): number {
  return (JUNGSEONG_LIST as readonly string[]).indexOf(char)
}

function jongseongIndex(char: string): number {
  return (JONGSEONG_LIST as readonly string[]).indexOf(char)
}

// ===== 레이아웃 타입별 대표 중성/종성 =====
// 각 레이아웃 카테고리를 대표하는 중성
const REPRESENTATIVE_VERTICAL_JUNGSEONG = ['ㅏ', 'ㅓ', 'ㅣ', 'ㅑ', 'ㅕ']
const REPRESENTATIVE_HORIZONTAL_JUNGSEONG = ['ㅗ', 'ㅜ', 'ㅡ', 'ㅛ', 'ㅠ']
const REPRESENTATIVE_MIXED_JUNGSEONG = ['ㅘ', 'ㅝ', 'ㅟ', 'ㅚ', 'ㅢ']

// 대표 종성 (받침 있는 그룹용)
const REPRESENTATIVE_JONGSEONG = ['ㄱ', 'ㄴ', 'ㅁ', 'ㄹ', 'ㅂ']

// 그룹당 최대 샘플 수
const MAX_SAMPLES_PER_GROUP = 6

// ===== 레이아웃 타입 한글 라벨 =====
const LAYOUT_LABELS: Record<LayoutType, string> = {
  'choseong-only': '초성만',
  'jungseong-vertical-only': '세로중성만',
  'jungseong-horizontal-only': '가로중성만',
  'jungseong-mixed-only': '혼합중성만',
  'choseong-jungseong-vertical': '초+세로중',
  'choseong-jungseong-horizontal': '초+가로중',
  'choseong-jungseong-mixed': '초+혼합중',
  'choseong-jungseong-vertical-jongseong': '초+세로중+종',
  'choseong-jungseong-horizontal-jongseong': '초+가로중+종',
  'choseong-jungseong-mixed-jongseong': '초+혼합중+종',
}

// ===== 초성 편집 시 샘플 생성 =====
export function generateChoseongSamples(char: string): SampleGroup[] {
  const choIdx = choseongIndex(char)
  if (choIdx < 0) return []

  const groups: SampleGroup[] = []

  // 초+세로중
  groups.push({
    layoutType: 'choseong-jungseong-vertical',
    label: LAYOUT_LABELS['choseong-jungseong-vertical'],
    samples: REPRESENTATIVE_VERTICAL_JUNGSEONG
      .slice(0, MAX_SAMPLES_PER_GROUP)
      .map((ju) => composeSyllable(choIdx, jungseongIndex(ju))),
  })

  // 초+가로중
  groups.push({
    layoutType: 'choseong-jungseong-horizontal',
    label: LAYOUT_LABELS['choseong-jungseong-horizontal'],
    samples: REPRESENTATIVE_HORIZONTAL_JUNGSEONG
      .slice(0, MAX_SAMPLES_PER_GROUP)
      .map((ju) => composeSyllable(choIdx, jungseongIndex(ju))),
  })

  // 초+혼합중
  groups.push({
    layoutType: 'choseong-jungseong-mixed',
    label: LAYOUT_LABELS['choseong-jungseong-mixed'],
    samples: REPRESENTATIVE_MIXED_JUNGSEONG
      .slice(0, MAX_SAMPLES_PER_GROUP)
      .map((ju) => composeSyllable(choIdx, jungseongIndex(ju))),
  })

  // 초+세로중+종
  groups.push({
    layoutType: 'choseong-jungseong-vertical-jongseong',
    label: LAYOUT_LABELS['choseong-jungseong-vertical-jongseong'],
    samples: REPRESENTATIVE_JONGSEONG
      .slice(0, MAX_SAMPLES_PER_GROUP)
      .map((jo) => composeSyllable(choIdx, jungseongIndex('ㅏ'), jongseongIndex(jo))),
  })

  // 초+가로중+종
  groups.push({
    layoutType: 'choseong-jungseong-horizontal-jongseong',
    label: LAYOUT_LABELS['choseong-jungseong-horizontal-jongseong'],
    samples: REPRESENTATIVE_JONGSEONG
      .slice(0, MAX_SAMPLES_PER_GROUP)
      .map((jo) => composeSyllable(choIdx, jungseongIndex('ㅗ'), jongseongIndex(jo))),
  })

  // 초+혼합중+종
  groups.push({
    layoutType: 'choseong-jungseong-mixed-jongseong',
    label: LAYOUT_LABELS['choseong-jungseong-mixed-jongseong'],
    samples: REPRESENTATIVE_JONGSEONG
      .slice(0, MAX_SAMPLES_PER_GROUP)
      .map((jo) => composeSyllable(choIdx, jungseongIndex('ㅘ'), jongseongIndex(jo))),
  })

  return groups
}

// ===== 중성 편집 시 샘플 생성 =====
export function generateJungseongSamples(char: string): SampleGroup[] {
  const juIdx = jungseongIndex(char)
  if (juIdx < 0) return []

  const jungseongType = classifyJungseong(char)
  const groups: SampleGroup[] = []

  // 다양한 초성과의 조합 (받침 없음)
  const layoutType: LayoutType =
    jungseongType === 'vertical'
      ? 'choseong-jungseong-vertical'
      : jungseongType === 'horizontal'
        ? 'choseong-jungseong-horizontal'
        : 'choseong-jungseong-mixed'

  // 대표 초성 선택 (ㄱ,ㄴ,ㅁ,ㅅ,ㅎ)
  const representativeChoseong = ['ㄱ', 'ㄴ', 'ㅁ', 'ㅅ', 'ㅎ', 'ㅂ']

  groups.push({
    layoutType,
    label: LAYOUT_LABELS[layoutType],
    samples: representativeChoseong
      .slice(0, MAX_SAMPLES_PER_GROUP)
      .map((ch) => composeSyllable(choseongIndex(ch), juIdx)),
  })

  // 받침 있는 조합
  const layoutTypeWithJong: LayoutType =
    jungseongType === 'vertical'
      ? 'choseong-jungseong-vertical-jongseong'
      : jungseongType === 'horizontal'
        ? 'choseong-jungseong-horizontal-jongseong'
        : 'choseong-jungseong-mixed-jongseong'

  groups.push({
    layoutType: layoutTypeWithJong,
    label: LAYOUT_LABELS[layoutTypeWithJong],
    samples: representativeChoseong
      .slice(0, MAX_SAMPLES_PER_GROUP)
      .map((ch) =>
        composeSyllable(choseongIndex(ch), juIdx, jongseongIndex('ㄴ'))
      ),
  })

  return groups
}

// ===== 종성 편집 시 샘플 생성 =====
export function generateJongseongSamples(char: string): SampleGroup[] {
  const joIdx = jongseongIndex(char)
  if (joIdx <= 0) return [] // 0은 종성 없음

  const groups: SampleGroup[] = []

  // 세로중성 + 종성
  groups.push({
    layoutType: 'choseong-jungseong-vertical-jongseong',
    label: LAYOUT_LABELS['choseong-jungseong-vertical-jongseong'],
    samples: ['ㄱ', 'ㄴ', 'ㅁ', 'ㅅ', 'ㅎ', 'ㅂ']
      .slice(0, MAX_SAMPLES_PER_GROUP)
      .map((ch) => composeSyllable(choseongIndex(ch), jungseongIndex('ㅏ'), joIdx)),
  })

  // 가로중성 + 종성
  groups.push({
    layoutType: 'choseong-jungseong-horizontal-jongseong',
    label: LAYOUT_LABELS['choseong-jungseong-horizontal-jongseong'],
    samples: ['ㄱ', 'ㄴ', 'ㅁ', 'ㅅ', 'ㅎ', 'ㅂ']
      .slice(0, MAX_SAMPLES_PER_GROUP)
      .map((ch) => composeSyllable(choseongIndex(ch), jungseongIndex('ㅗ'), joIdx)),
  })

  // 혼합중성 + 종성
  groups.push({
    layoutType: 'choseong-jungseong-mixed-jongseong',
    label: LAYOUT_LABELS['choseong-jungseong-mixed-jongseong'],
    samples: ['ㄱ', 'ㄴ', 'ㅁ', 'ㅅ', 'ㅎ', 'ㅂ']
      .slice(0, MAX_SAMPLES_PER_GROUP)
      .map((ch) => composeSyllable(choseongIndex(ch), jungseongIndex('ㅘ'), joIdx)),
  })

  return groups
}

// ===== 레이아웃 편집 시 샘플 생성 =====
export function generateLayoutSamples(layoutType: LayoutType): SampleGroup[] {
  const representativeChoseong = ['ㄱ', 'ㄴ', 'ㅁ', 'ㅅ', 'ㅎ', 'ㅂ']

  // 단독 자모 레이아웃은 샘플 생성 불가
  if (layoutType === 'choseong-only') return []
  if (layoutType.startsWith('jungseong-') && layoutType.endsWith('-only')) return []

  // 레이아웃 타입에 맞는 중성 선택
  let jungseongList: string[]
  if (layoutType.includes('vertical') && !layoutType.includes('mixed')) {
    jungseongList = REPRESENTATIVE_VERTICAL_JUNGSEONG
  } else if (layoutType.includes('horizontal') && !layoutType.includes('mixed')) {
    jungseongList = REPRESENTATIVE_HORIZONTAL_JUNGSEONG
  } else {
    jungseongList = REPRESENTATIVE_MIXED_JUNGSEONG
  }

  const hasJongseong = layoutType.includes('jongseong')

  // 초성별 그룹
  const samples = representativeChoseong
    .slice(0, MAX_SAMPLES_PER_GROUP)
    .map((ch) => {
      const choIdx = choseongIndex(ch)
      const juIdx = jungseongIndex(jungseongList[0])
      const joIdx = hasJongseong ? jongseongIndex('ㄴ') : 0
      return composeSyllable(choIdx, juIdx, joIdx)
    })

  // 중성별 그룹
  const samplesJungseong = jungseongList
    .slice(0, MAX_SAMPLES_PER_GROUP)
    .map((ju) => {
      const juIdx = jungseongIndex(ju)
      const joIdx = hasJongseong ? jongseongIndex('ㄴ') : 0
      return composeSyllable(choseongIndex('ㄱ'), juIdx, joIdx)
    })

  const groups: SampleGroup[] = [
    {
      layoutType,
      label: `${LAYOUT_LABELS[layoutType]} — 초성별`,
      samples,
    },
    {
      layoutType,
      label: `${LAYOUT_LABELS[layoutType]} — 중성별`,
      samples: samplesJungseong,
    },
  ]

  // 종성이 있는 레이아웃이면 종성별 샘플도 추가
  if (hasJongseong) {
    const samplesJongseong = REPRESENTATIVE_JONGSEONG
      .slice(0, MAX_SAMPLES_PER_GROUP)
      .map((jo) =>
        composeSyllable(
          choseongIndex('ㄱ'),
          jungseongIndex(jungseongList[0]),
          jongseongIndex(jo)
        )
      )

    groups.push({
      layoutType,
      label: `${LAYOUT_LABELS[layoutType]} — 종성별`,
      samples: samplesJongseong,
    })
  }

  return groups
}

// ===== 편집 컨텍스트에 따른 자동 샘플 생성 =====
export function generateSamplesForContext(
  editingType: 'choseong' | 'jungseong' | 'jongseong' | 'layout',
  editingChar: string | null,
  layoutType: LayoutType | null
): SampleGroup[] {
  if (editingType === 'layout' && layoutType) {
    return generateLayoutSamples(layoutType)
  }
  if (!editingChar) return []

  switch (editingType) {
    case 'choseong':
      return generateChoseongSamples(editingChar)
    case 'jungseong':
      return generateJungseongSamples(editingChar)
    case 'jongseong':
      return generateJongseongSamples(editingChar)
    default:
      return []
  }
}
