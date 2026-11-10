import { DEFAULT_LAYOUT_RULE_PARAMS } from '../src/services/layoutRules'
import type { LayoutRuleParams } from '../src/services/layoutRules'
import { DEFAULT_STROKE_SHAPE_PARAMS, STROKE_SHAPES_OFF } from '../src/services/strokeShapeRules'
import { DEFAULT_STYLE } from '../src/stores/globalStyleStore'
import type { BoxConfig, DeepReadonly, JamoData, StrokeDataV2 } from '../src/types'
import { MEDIAL_STEM_ROLES, stemEndsFor } from '../src/services/medialStemRails'
import { noFinalChars, regionsToPath, sampleChars, scoreGlyph } from './layoutRulesScore'
import type { JamoMaps, ScoreInput, ScoredGlyph } from './layoutRulesScore'

/**
 * 가설 사다리 — "패턴만"(외운 표 없이 관계 규칙만)에서 출발해, 사용자가 던진 시각 보정 가설을 하나씩 켜고 끈다.
 * 실험실(`/layout-ladder`)과 측정 스크립트(`scripts/layout-rules/measure-ladder.ts`)가 같이 쓴다.
 * 가설이 통과하면 `LADDER_HYPS`에 한 줄 보탠다.
 */

export interface LadderHyp { id: string; name: string; who: string; patch: Partial<LayoutRuleParams> }

export const LADDER_HYPS: readonly LadderHyp[] = [
  { id: 'jungKinds', name: '홀자 가지 갈래', who: '하니무스 관찰 11/9: 가로줄기가 뻗은 쪽으로 홀자가 간다 → 기둥이 하나면 가지 반대쪽으로 비켜서고, 기둥이 둘이면 기둥 틀은 그대로 두고 가지만 밖으로 나간다(ㅔㅖ 오른 기둥 = ㅐㅒ 0.813 · 0.814)', patch: { jungKinds: true } },
  { id: 'branchInset', name: '왼가지 끝은 첫닿자 오른쪽 모양 따라', who: '하니무스 관찰 11/9: 닿자 오른쪽이 막혔으면 붙고 뚫렸으면 띄운다 → 오른쪽이 위부터 막힌 자음은 가지가 오른면에 살짝 걸치고, 오른쪽 위가 빈 자음(ㄴ ㅅ)은 그 빈 자리로 더 파고든다', patch: { branchInset: true } },
  { id: 'twoStemNarrow', name: '두 기둥 홀자 옆에선 첫닿자가 좁아진다', who: '하니무스 관찰 11/9: ㅔ ㅖ는 홀자 왼면이 더 왼쪽 → 기둥이 둘이면 홀자가 자리를 더 차지해 첫닿자 오른면이 0.093 들어오고, ㅔ ㅖ 가지가 그걸 따라간다', patch: { twoStemNarrow: true } },
  { id: 'choWall', name: '세로벽 있는 첫닿자는 좁게, 쌍닿자는 넓게', who: '하니무스 질문 11/9: ㅓㅕㅔㅖ 왼면 오차는 홀자만의 것인가 → 아니고 첫닿자 폭이었다. 가장자리에 세로벽이 선 ㄱㄴㄷㄹㅁㅂㅋㅌ는 꽉 차 보여 양옆을 들이고(오른쪽 위가 빈 ㄴ은 왼쪽만), 쌍닿자는 오른쪽으로 더 낸다', patch: { choWall: true } },
  { id: 'choBottomShape', name: '바닥이 막힌 첫닿자는 위에서 끝난다', who: '하니무스 관찰 11/9: 하단이 막혀 있는 닿자와 뚫려 있는 닿자의 높이 차이 → 바닥 가로줄기가 넓을수록(ㄴ ㄷ ㄹ ㅁ ㅂ ㅌ ㅍ) 아랫면을 올리고, 세로줄기 끝만 내려오는 ㄱ ㅋ ㄲ은 거의 그대로. 받침 없으면 0.015 + 0.077 × 바닥 너비, 있으면 0.061 × 바닥 너비', patch: { choBottomShape: true } },
  { id: 'choTopShape', name: '꼭지 닿자는 위로 솟고, 받침 있으면 첫닿자가 내려온다', who: '하니무스 관찰 11/9: 첫닿자 윗면은 ㅎ ㅊ 등 꼭지 있는 애들이 다르다 → 꼭지 닿자는 나머지보다 받침 없으면 0.08, 있으면 0.055 위에서 시작한다. 받침이 있으면 첫닿자 윗면이 다 같이 0.06 내려온다', patch: { choTopShape: true } },
  { id: 'jongHeight', name: '가로줄기 층이 많은 받침은 키가 크다', who: 'AI 가설 11/9(이용제 받침군과 겹침): 층이 많을수록 받침 윗면이 올라간다(ㄱ ㄴ 1층 0~0.02 · ㄷ ㅁ ㅂ 2층 · ㄹ ㅌ 3층 0.07~0.08), 꼭지 받침 ㅊ ㅎ은 0.046 더 솟는다', patch: { jongHeight: true } },
  { id: 'pillarDive', name: '위가 빈 받침 옆에선 기둥이 더 내려온다', who: 'AI 가설 11/9(가설 2를 세로로): 받침 오른쪽 위가 비면(ㄴ ㅅ) 홀자 기둥이 그 빈 자리로 내려온다 — 0.13 × 오른쪽 위 빈 높이', patch: { pillarDive: true } },
  { id: 'jongWall', name: '세로벽 있는 받침은 그쪽을 들인다', who: 'AI 가설 11/9(가설 4를 받침으로): 받침 한쪽이 세로줄기로 막혀 있을수록 그쪽을 안으로 들인다 — 0.041 × 막힘, 양쪽 따로(홀자 몫을 뺀 받침 몫으로 맞춤). 겹받침 · 쌍받침은 아직 그대로', patch: { jongWall: true } },
  { id: 'jongFollow', name: '받침은 기둥을 따라간다', who: '하니무스 관찰 11/9: 받침 왼면은 홀자가 바깥인지 안인지, 한 줄인지 두 줄인지에 따라 갈린다 → 받침이 기둥 밑으로 통째로 옮겨 간다. 기둥이 ㅣ 자리에서 옮긴 거리 × 0.55(ㅏ ㅑ 왼쪽 0.022, ㅐ ㅒ ㅔ ㅖ 오른쪽 0.020)', patch: { jongFollow: true } },
  { id: 'choTallJong', name: '키 큰 첫닿자 밑에선 받침이 내려온다', who: 'AI 가설 11/9(받침 윗면을 받침 몫 + 첫닿자 몫으로 나눠서): 첫닿자 층이 셋 이상이면 층마다 0.01, 꼭지가 있으면 0.011만큼 받침 윗면이 내려온다(ㅎ 0.021 · ㅊ 0.011 · ㄹ ㅌ ㅉ 0.01)', patch: { choTallJong: true } },
  { id: 'jongLegs', name: '사선 다리는 벽이 아니다', who: 'AI 가설 11/9(받침 닿자 몫에서, 가설 9와 함께): ㅅ ㅈ ㅊ의 사선 다리 쪽은 들이지 않는다. 겹받침 · 쌍받침의 다리(ㄳ ㄽ ㅄ ㅆ ㄵ)는 0.03 더 뻗는다', patch: { jongLegs: true } },
  { id: 'jongWallMulti', name: '겹받침도 오른쪽 벽은 들인다', who: 'AI 가설 11/9(가설 9를 겹받침으로): ㄺ ㄻ ㄼ ㄲ처럼 오른쪽이 막힌 겹받침은 홑받침처럼 0.041 × 막힘 들이고, 겹받침 왼쪽은 0.015 더 뻗는다', patch: { jongWallMulti: true } },
  { id: 'beamToCho', name: '곁줄기는 첫닿자 가운데 높이에', who: 'AI 가설 11/10(보선 채점에서, 사용자 지적 "홀자는 보선 자리로 채점해야"): 보 · 곁줄기 가운데가 첫닿자 잉크 가운데 높이에 선다(노토 ±0.013). 곁줄기가 둘이면 간격은 그대로 두고 가운데만 맞춘다', patch: { beamToCho: true } },
  { id: 'innerPillarShort', name: '두 기둥 홀자 안 기둥은 짧다', who: 'AI 가설 11/10(보선 채점에서): ㅐ ㅒ ㅔ ㅖ 안 기둥은 위 끝이 0.018 내려오고 아래 끝이 받침 없으면 0.048, 있으면 0.016 올라온다', patch: { innerPillarShort: true } },
]

/** 패턴만: 외운 표를 끄고 틈 규칙은 켠다. */
export const LADDER_PATTERNS: LayoutRuleParams = { ...DEFAULT_LAYOUT_RULE_PARAMS, tables: false, rules: { ...DEFAULT_LAYOUT_RULE_PARAMS.rules, gap: true } }
/** 날것: 규칙을 모두 끈다. */
export const LADDER_RAW: LayoutRuleParams = { ...DEFAULT_LAYOUT_RULE_PARAMS, rules: { faces: false, choTable: false, jungTable: false, jongTable: false, choBottom: false, pillar: false, gap: false } }

/** 조합 번호(mask)의 i번째 비트가 켜져 있으면 i번째 가설을 켠다. 0 = 패턴만. */
export const ladderParams = (mask: number): LayoutRuleParams => LADDER_HYPS.reduce<LayoutRuleParams>((params, hyp, i) => (mask >> i) & 1 ? { ...params, ...hyp.patch } : params, LADDER_PATTERNS)

export const LADDER_KINDS: readonly (readonly [string, string])[] = [['오른가지 ㅏㅑ', 'ㅏㅑ'], ['가지 없음 ㅣ', 'ㅣ'], ['왼가지 ㅓㅕ', 'ㅓㅕ'], ['두 기둥 ㅐㅒㅔㅖ', 'ㅐㅒㅔㅖ']]
export const LADDER_KEYS = ['CH.left', 'CH.right', 'CH.top', 'CH.bottom', 'JU.left', 'JU.right', 'JU.top', 'JU.bottom', 'JU.beam', 'JU.inX', 'JU.inTop', 'JU.inBot', 'JO.left', 'JO.right', 'JO.top', 'JO.bottom'] as const
/** 글자 그림 한 변 길이(그림 좌표 단위). */
export const LADDER_V = 120

const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const JUNG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
const JONG = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']

export type LadderPool = '588' | '171'
export const ladderPools = (): { pool: LadderPool; chars: string[] }[] => [{ pool: '588', chars: sampleChars() }, { pool: '171', chars: noFinalChars() }]

/** 한 글자의 사다리 기록. 조합마다 칸이 채워진다(아직 안 잰 조합은 비어 있다). */
export interface LadderRow {
  char: string
  pool: LadderPool
  cho: string
  jung: string
  jong: string
  /** 조합별: 외운 표 − 이 조합, 부품.변마다(몸 em). */
  moves: Record<number, Record<string, number>>
  /** 조합별 노토까지 거리(xor). */
  xs: Record<number, number>
  raw: number
  table: number
  /** 그림: 외운 표, 조합별. */
  svgTable: string
  svgSteps: Record<number, string>
}

type Model = ScoreInput['model']
type Outline = ScoreInput['outline']

const r1 = (path: string) => path.replace(/(\d+\.\d)\d+/g, '$1')
const pathOf = (score: ScoredGlyph) => r1(regionsToPath(score.ink.rule, LADDER_V))

/** 보선 칸 — 상자 네 변 옆에 홀자 안쪽 줄기 자리를 덧붙인다(곁줄기 높이는 곁줄기가 둘이면 두 높이의 가운데). */
function railKeysOf(jung: string, maps: JamoMaps, score: ScoredGlyph): Record<string, number> {
  const r = railsOf(jung, maps.jungseong[jung] as DeepReadonly<JamoData> | undefined, score.boxes.rule.JU)
  const out: Record<string, number> = {}
  const beams = Object.keys(r).filter((k) => /Beam\.y$/.test(k)).map((k) => r[k])
  if (beams.length) out['JU.beam'] = beams.reduce((a, b) => a + b, 0) / beams.length
  if (r['innerPillar.x'] !== undefined) { out['JU.inX'] = r['innerPillar.x']; out['JU.inTop'] = r['innerPillar.top']; out['JU.inBot'] = r['innerPillar.bottom'] }
  return out
}

function movesOf(table: ScoredGlyph, step: ScoredGlyph, jung: string, maps: JamoMaps): Record<string, number> {
  const m: Record<string, number> = {}
  const a = railKeysOf(jung, maps, table), b = railKeysOf(jung, maps, step)
  for (const k in a) if (b[k] !== undefined) m[k] = +(a[k] - b[k]).toFixed(4)
  for (const part of ['CH', 'JU', 'JO'] as const) {
    const a = table.box?.parts[part]?.rule, b = step.box?.parts[part]?.rule
    if (!a || !b) continue
    for (const edge of ['left', 'right', 'top', 'bottom'] as const) m[`${part}.${edge}`] = +(a[edge] - b[edge]).toFixed(4)
  }
  return m
}

/**
 * 홀자 보선 자리 — 이름 있는 줄기(MEDIAL_STEM_ROLES)마다 그린 자리를 글자 좌표로 잰다.
 * 기둥(세로 줄기)은 가로 자리 x와 위 · 아래 끝, 보 · 곁줄기(가로 줄기)는 높이 y와 왼 · 오른 끝.
 * 상자 네 변으로는 안 보이는 안 기둥 자리 · 곁줄기 높이를 채점하려고 쓴다.
 */
export function railsOf(jung: string, jamo: DeepReadonly<JamoData> | undefined, box: DeepReadonly<BoxConfig> | undefined): Record<string, number> {
  const out: Record<string, number> = {}
  const roles = MEDIAL_STEM_ROLES[jung]
  if (!jamo || !box || !roles) return out
  const strokes = [...(jamo.strokes ?? []), ...(jamo.horizontalStrokes ?? []), ...(jamo.verticalStrokes ?? [])] as StrokeDataV2[]
  for (const stroke of strokes) {
    const role = roles[stroke.id]
    if (!role || role[0] !== 'JU' || stroke.points.length < 2) continue
    const moved = stemEndsFor(jamo as JamoData, stroke, box as BoxConfig)
    const a = moved?.start ?? stroke.points[0], b = moved?.end ?? stroke.points[stroke.points.length - 1]
    const X = (v: number) => box.x + v * box.width, Y = (v: number) => box.y + v * box.height
    const name = role[1]
    if (Math.abs(b.y - a.y) * box.height >= Math.abs(b.x - a.x) * box.width) {
      out[`${name}.x`] = X((a.x + b.x) / 2); out[`${name}.top`] = Y(Math.min(a.y, b.y)); out[`${name}.bottom`] = Y(Math.max(a.y, b.y))
    } else {
      out[`${name}.y`] = Y((a.y + b.y) / 2); out[`${name}.left`] = X(Math.min(a.x, b.x)); out[`${name}.right`] = X(Math.max(a.x, b.x))
    }
  }
  return out
}

/** 글자 하나의 기준(날것 · 외운 표)을 잰다. 실패하면 null. */
export function ladderBase(input: { char: string; pool: LadderPool; maps: JamoMaps; model: Model; outline: DeepReadonly<Outline> }): { row: LadderRow; table: ScoredGlyph } | null {
  const { char, pool, maps, model, outline } = input
  const table = scoreGlyph({ char, maps, style: DEFAULT_STYLE, model, outline, params: DEFAULT_LAYOUT_RULE_PARAMS, snapStems: true, shapes: DEFAULT_STROKE_SHAPE_PARAMS })
  const raw = scoreGlyph({ char, maps, style: DEFAULT_STYLE, model, outline, params: LADDER_RAW, snapStems: false, shapes: STROKE_SHAPES_OFF })
  if (!table.ok || !table.box || !raw.ok) return null
  const code = char.codePointAt(0)! - 0xac00
  return {
    table,
    row: { char, pool, cho: CHO[Math.floor(code / 588)], jung: JUNG[Math.floor((code % 588) / 28)], jong: JONG[code % 28], moves: {}, xs: {}, raw: raw.xor.rule, table: table.xor.rule, svgTable: pathOf(table), svgSteps: {} },
  }
}

/** 한 조합을 글자 하나에 재서 기록에 채운다. 실패하면 false. */
export function ladderStep(input: { row: LadderRow; table: ScoredGlyph; mask: number; maps: JamoMaps; model: Model; outline: DeepReadonly<Outline> }): boolean {
  const { row, table, mask, maps, model, outline } = input
  const step = scoreGlyph({ char: row.char, maps, style: DEFAULT_STYLE, model, outline, params: ladderParams(mask), snapStems: false, shapes: DEFAULT_STROKE_SHAPE_PARAMS })
  if (!step.ok || !step.box) return false
  row.moves[mask] = movesOf(table, step, row.jung, maps)
  row.xs[mask] = step.xor.rule
  row.svgSteps[mask] = pathOf(step)
  return true
}

export const ladderMedian = (values: readonly number[]): number | null => {
  const x = values.filter(Number.isFinite).slice().sort((a, b) => a - b)
  return x.length ? x[x.length >> 1] : null
}
