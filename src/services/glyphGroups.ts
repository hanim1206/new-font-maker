// 글자표 묶음 — 묶음 하나는 질문 하나를 갖는다.
// 글자를 한꺼번에 던지지 않고, 한 가지 면에서 같아 보여야 하는 글자를 나란히 놓아 어긋난 것이 튀게 한다.
// 판은 가로 10칸, 세로 최대 10줄. 빈칸은 ' '.
import { CHOSEONG_LIST, JONGSEONG_LIST } from '../data/Hangul'
import { composeChar, decomposeChar } from './handwritingRead'
import { CHART_SYLLABLES } from './handwritingBank'

export const GROUP_COLS = 10
export const GROUP_MAX_ROWS = 10

export type GroupStage = 1 | 2 | 3 | 'review' | 'all'

export interface GlyphGroup {
  id: string
  stage: GroupStage
  name: string
  /** 이 묶음으로 보려는 것. */
  question: string
  /** 줄마다 최대 10자. ' '는 빈칸. 전체 묶음은 빈 배열(글자표 전체를 그대로 쓴다). */
  rows: string[]
}

export const STAGE_NAME: Record<GroupStage, string> = { 1: '1단계 · 인상', 2: '2단계 · 레이아웃', 3: '3단계 · 자모 세부', review: '검수', all: '전체' }

const KS = new Set(CHART_SYLLABLES)

/** 2,350자 안에 있는 것만 남기고 10자에서 자른다. */
function row(chars: (string | null)[]): string {
  const seen = new Set<string>()
  const out: string[] = []
  for (const ch of chars) {
    if (!ch || !KS.has(ch) || seen.has(ch)) continue
    seen.add(ch)
    out.push(ch)
    if (out.length === GROUP_COLS) break
  }
  return out.join('')
}

/** 문장을 낱말 단위로 10칸 줄에 싣는다. 낱말 사이는 빈칸 하나. */
export function wrapSentence(text: string, cols = GROUP_COLS): string[] {
  const rows: string[] = []
  let cur = ''
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${word}` : word
    if ([...next].length <= cols) cur = next
    else { if (cur) rows.push(cur); cur = word }
  }
  if (cur) rows.push(cur)
  return rows
}

const SIMPLE_JONG = new Set<string>(JONGSEONG_LIST.filter(Boolean))
const VOWELS_FOR_CHO = ['ㅏ', 'ㅓ', 'ㅣ', 'ㅐ', 'ㅔ', 'ㅗ', 'ㅜ', 'ㅡ', 'ㅚ', 'ㅘ', 'ㅟ', 'ㅝ', 'ㅕ', 'ㅑ', 'ㅛ', 'ㅠ', 'ㅢ']
const JONG_CYCLE = ['ㄴ', 'ㄹ', 'ㅇ', 'ㄱ', 'ㅁ', 'ㅂ', 'ㅅ']
const CHO_FOR_JONG = ['ㅇ', 'ㄱ', 'ㅁ', 'ㄴ', 'ㅂ', 'ㄷ', 'ㅎ', 'ㅈ', 'ㅅ', 'ㄹ', 'ㅊ', 'ㅍ']

/** 한 닿자의 모든 자리: 첫닿자 홀로 · 첫닿자 + 받침 · 받침. */
export function consonantPlaces(c: string): string[] {
  const rows: string[] = []
  if ((CHOSEONG_LIST as readonly string[]).includes(c)) {
    rows.push(row(VOWELS_FOR_CHO.map((v) => composeChar(c, v, null))))
    rows.push(row(VOWELS_FOR_CHO.map((v, i) => composeChar(c, v, JONG_CYCLE[i % JONG_CYCLE.length]))))
  }
  if (SIMPLE_JONG.has(c)) {
    rows.push(row(CHO_FOR_JONG.flatMap((cho, i) => [composeChar(cho, VOWELS_FOR_CHO[i % 8], c), composeChar(cho, VOWELS_FOR_CHO[(i + 5) % 8], c)])))
  }
  return rows.filter(Boolean)
}

const CHO_FOR_VOWEL = ['ㄱ', 'ㄴ', 'ㄷ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
/** 홀자가 섞임홀자 안에 들어가는 짝. ㅗ ㅜ ㅡ는 뒤에 오는 세로홀자와, ㅏ ㅓ ㅐ ㅔ ㅣ는 앞에 오는 가로홀자와 섞인다. */
const IN_MIXED: Record<string, string[]> = {
  'ㅏ': ['ㅘ'], 'ㅐ': ['ㅙ'], 'ㅓ': ['ㅝ'], 'ㅔ': ['ㅞ'], 'ㅣ': ['ㅚ', 'ㅟ', 'ㅢ'],
  'ㅗ': ['ㅘ', 'ㅙ', 'ㅚ'], 'ㅜ': ['ㅝ', 'ㅞ', 'ㅟ'], 'ㅡ': ['ㅢ'],
}

/** 한 홀자의 모든 자리: 홀로 · 받침 위 · 섞임홀자 안(섞임홀자면 홀로 · 받침 위만). */
export function vowelPlaces(v: string): string[] {
  const rows = [
    row(CHO_FOR_VOWEL.map((c) => composeChar(c, v, null))),
    row(CHO_FOR_VOWEL.map((c, i) => composeChar(c, v, JONG_CYCLE[i % JONG_CYCLE.length]))),
  ]
  const mixed = IN_MIXED[v]
  if (mixed) {
    rows.push(row(CHO_FOR_VOWEL.flatMap((c) => mixed.map((m) => composeChar(c, m, null)))))
    rows.push(row(CHO_FOR_VOWEL.flatMap((c, i) => mixed.map((m) => composeChar(c, m, JONG_CYCLE[i % JONG_CYCLE.length])))))
  }
  return rows.filter(Boolean)
}

/** 같은 첫닿자를 여섯 레이아웃에 놓은 줄. 한 줄이 첫닿자 하나. */
function sameChoRows(): string[] {
  return ['ㄱ', 'ㄴ', 'ㄷ', 'ㅁ', 'ㅅ', 'ㅇ', 'ㅈ', 'ㅎ'].map((c) => row(
    ['ㅏ', 'ㅓ', 'ㅗ', 'ㅜ', 'ㅘ', 'ㅝ'].flatMap((v) => [composeChar(c, v, null), composeChar(c, v, 'ㄴ')]),
  ))
}

/** 지금 고른 글자. 자모 묶음 둘이 이것을 따라 바뀐다. */
export interface GroupFocus { char: string | null; slot?: 'CH' | 'JU' | 'JO' | null }

export function glyphGroups(focus: GroupFocus = { char: null }): GlyphGroup[] {
  const parts = focus.char ? decomposeChar(focus.char) : null
  const cons = focus.slot === 'JO' && parts?.[2] && SIMPLE_JONG.has(parts[2]) ? parts[2] : parts?.[0] ?? 'ㅅ'
  const vowel = parts?.[1] ?? 'ㅏ'
  const groups: GlyphGroup[] = [
    { id: 'impression', stage: 1, name: '인상 한 줄', question: '전체 분위기가 내가 원한 것인가?',
      rows: wrapSentence('고향 과일 가게 왼쪽 대문 옆 바람 쐬러 나온 아이와 강아지') },
    { id: 'density', stage: 1, name: '짙기', question: '획 많은 글자가 뭉치고, 획 적은 글자가 허전한가?',
      rows: ['이그기우으', '를뺄흙삶뚫', '이를그뺄기', '흙우삶으뚫'] },
    { id: 'layouts', stage: 2, name: '여섯 레이아웃', question: '자리마다 칸 나눔이 고른가? 한 줄이 레이아웃 하나.',
      rows: ['이처계때께하서녀에지', '한임명집실것없력있같', '고조수끄뿌요크효도부', '는급꽃몫북들품용을숲', '와뇌최쾌뭐뒤화궤의쉬', '됨쉽횟봤권뭘왕퀵원될'] },
    { id: 'same-cho', stage: 2, name: '같은 첫닿자, 다른 자리', question: '자리가 바뀌어도 같은 자모로 보이는가? 한 줄이 첫닿자 하나.',
      rows: sameChoRows() },
    { id: 'jong-line', stage: 2, name: '받침 줄', question: '받침 있는 글자와 없는 글자가 섞여도 아랫선이 고른가?',
      rows: ['나난노논누눈느는니닌', '마만모몬무문므믄미민', ...wrapSentence('하늘 아래 큰 강물 길게 흐른다')] },
    { id: 'particles', stage: 2, name: '조사', question: '가장 자주 나오는 글자가 단어 옆에서 튀지 않는가?',
      rows: wrapSentence('꽃이 꽃을 꽃은 꽃의 꽃에 꽃도 꽃과 꽃만 나는 나를 나의 나와 나도 너가 너에게 너로') },
    { id: 'consonant', stage: 3, name: `한 자모의 모든 자리 · ${cons}`, question: '지금 고치는 자모가 자리마다 어울리는가? 글자를 고르면 그 자모로 바뀐다.',
      rows: consonantPlaces(cons) },
    { id: 'vowel', stage: 3, name: `한 홀자의 모든 자리 · ${vowel}`, question: '홀로, 받침 위에서, 섞임홀자 안에서 같은 홀자로 보이는가?',
      rows: vowelPlaces(vowel) },
    { id: 'branch', stage: 3, name: '곁줄기 방향', question: '바깥, 안, 위, 아래로 뻗는 곁줄기가 어울리는가? 한 줄이 방향 하나.',
      rows: ['아야안양가갸간갼', '어여언영거겨건견', '오요온용고교곤굣', '우유운융구규군균'].map((r) => row([...r])) },
    { id: 'family', stage: 3, name: '닮은 자모 가족', question: '한 가족이 한 손으로 그린 것처럼 보이는가? 한 줄이 한 가족.',
      rows: ['가카까', '나다타따라', '마바파빠', '사자차싸짜', '아하'] },
    { id: 'double', stage: 3, name: '쌍닿자', question: '좁은 칸에 둘이 들어가도 숨이 막히지 않는가?',
      rows: ['까따빠싸짜', '꼬뚜뽀쏘쪼', '깍딱빡싹짝', '꽤뛰쐬쬐뀌', '있었았겠갔'] },
    { id: 'dense', stage: 3, name: '빽빽한 글자', question: '겹받침에서 속공간이 살아 있는가?',
      rows: ['값닭삶읽밝넓앉흙몫', '않많끊닳옳싫잃곬핥'] },
    { id: 'usage', stage: 'review', name: '쓰임새 문장', question: '문장으로 놓았을 때 어떤가?',
      rows: wrapSentence('글자는 혼자 있을 때보다 여럿이 모였을 때 제 얼굴을 드러낸다 한 줄을 채우면 틈이 보이고 두 줄을 채우면 숨이 보인다 그래서 마지막 확인은 늘 문장으로 한다') },
    { id: 'all', stage: 'all', name: '전체 2,350자', question: '모든 글자를 차례대로.', rows: [] },
  ]
  return groups.map((g) => ({ ...g, rows: g.rows.slice(0, GROUP_MAX_ROWS) }))
}
