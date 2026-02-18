import { CHOSEONG_LIST, JONGSEONG_LIST } from '../data/Hangul'

// ===== 연관 슬롯 타입 =====
export interface LinkedSlot {
  type: 'choseong' | 'jungseong' | 'jongseong'
  char: string
  reason: string // 사용자에게 보여줄 연관 이유
}

// ===== 초성↔종성 공유 자모 =====
// 초성과 종성 모두에 존재하는 글자
const SHARED_CONSONANTS = new Set(
  (CHOSEONG_LIST as readonly string[]).filter((ch) =>
    (JONGSEONG_LIST as readonly string[]).includes(ch)
  )
)

// ===== 쌍자음 → 구성 자모 매핑 =====
const SSANG_JAMO: Record<string, string> = {
  'ㄲ': 'ㄱ',
  'ㄸ': 'ㄷ',
  'ㅃ': 'ㅂ',
  'ㅆ': 'ㅅ',
  'ㅉ': 'ㅈ',
}

// 역매핑: 단일 자모 → 쌍자음
const SINGLE_TO_SSANG: Record<string, string> = {}
for (const [ssang, single] of Object.entries(SSANG_JAMO)) {
  SINGLE_TO_SSANG[single] = ssang
}

// ===== 이중받침(겹받침) → 구성 자모 매핑 =====
export const COMPOUND_JONGSEONG: Record<string, [string, string]> = {
  'ㄳ': ['ㄱ', 'ㅅ'],
  'ㄵ': ['ㄴ', 'ㅈ'],
  'ㄶ': ['ㄴ', 'ㅎ'],
  'ㄺ': ['ㄹ', 'ㄱ'],
  'ㄻ': ['ㄹ', 'ㅁ'],
  'ㄼ': ['ㄹ', 'ㅂ'],
  'ㄽ': ['ㄹ', 'ㅅ'],
  'ㄾ': ['ㄹ', 'ㅌ'],
  'ㄿ': ['ㄹ', 'ㅍ'],
  'ㅀ': ['ㄹ', 'ㅎ'],
  'ㅄ': ['ㅂ', 'ㅅ'],
}

// ===== 연관 슬롯 탐지 =====

/**
 * 편집 중인 자모의 연관 슬롯(linked slots)을 탐지
 * - 초성 편집 시: 동일한 글자가 종성에 있는지, 쌍자음 초성에 있는지, 이중받침에 있는지
 * - 종성 편집 시: 동일한 글자가 초성에 있는지, 이중받침에 포함되는지
 */
export function getLinkedSlots(
  editingType: 'choseong' | 'jungseong' | 'jongseong',
  editingChar: string
): LinkedSlot[] {
  const linked: LinkedSlot[] = []

  if (editingType === 'choseong') {
    // 1. 동일 글자가 종성에도 존재하는 경우
    if (SHARED_CONSONANTS.has(editingChar)) {
      linked.push({
        type: 'jongseong',
        char: editingChar,
        reason: `종성 ${editingChar}`,
      })
    }

    // 2. 이 글자의 쌍자음이 초성에 존재하는 경우
    const ssang = SINGLE_TO_SSANG[editingChar]
    if (ssang && (CHOSEONG_LIST as readonly string[]).includes(ssang)) {
      linked.push({
        type: 'choseong',
        char: ssang,
        reason: `쌍자음 ${ssang}`,
      })
    }

    // 3. 이 글자의 쌍자음이 종성에도 존재하는 경우
    if (ssang && (JONGSEONG_LIST as readonly string[]).includes(ssang)) {
      linked.push({
        type: 'jongseong',
        char: ssang,
        reason: `종성 쌍자음 ${ssang}`,
      })
    }

    // 4. 이 글자가 포함된 이중받침 종성
    for (const [compound, [first, second]] of Object.entries(COMPOUND_JONGSEONG)) {
      if (first === editingChar || second === editingChar) {
        linked.push({
          type: 'jongseong',
          char: compound,
          reason: `겹받침 ${compound} (${first}+${second})`,
        })
      }
    }
  }

  if (editingType === 'jongseong') {
    // 1. 동일 글자가 초성에도 존재하는 경우
    if (SHARED_CONSONANTS.has(editingChar)) {
      linked.push({
        type: 'choseong',
        char: editingChar,
        reason: `초성 ${editingChar}`,
      })
    }

    // 2. 쌍자음인 경우: 구성 자모의 초성
    const singleFromSsang = SSANG_JAMO[editingChar]
    if (singleFromSsang) {
      linked.push({
        type: 'choseong',
        char: singleFromSsang,
        reason: `구성 자모 초성 ${singleFromSsang}`,
      })
    }

    // 3. 이중받침인 경우: 구성 자모들
    const compoundParts = COMPOUND_JONGSEONG[editingChar]
    if (compoundParts) {
      for (const part of compoundParts) {
        // 초성에 있으면 추가
        if ((CHOSEONG_LIST as readonly string[]).includes(part)) {
          linked.push({
            type: 'choseong',
            char: part,
            reason: `구성 자모 초성 ${part}`,
          })
        }
        // 종성에 있으면 추가
        if ((JONGSEONG_LIST as readonly string[]).includes(part) && part !== editingChar) {
          linked.push({
            type: 'jongseong',
            char: part,
            reason: `구성 자모 종성 ${part}`,
          })
        }
      }
    }

    // 4. 이 글자가 포함된 다른 이중받침
    if (!compoundParts) {
      for (const [compound, [first, second]] of Object.entries(COMPOUND_JONGSEONG)) {
        if (first === editingChar || second === editingChar) {
          linked.push({
            type: 'jongseong',
            char: compound,
            reason: `겹받침 ${compound} (${first}+${second})`,
          })
        }
      }
    }
  }

  // 중성은 현재 연관 슬롯 없음 (중성끼리는 독립적)

  // 중복 제거
  const seen = new Set<string>()
  return linked.filter((slot) => {
    const key = `${slot.type}-${slot.char}`
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}
