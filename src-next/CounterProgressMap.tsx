import { useEffect, useMemo, useState } from 'react'
import { FillRule, unionD } from 'clipper2-ts'
import type { PathsD } from 'clipper2-ts'
import { designBodyPaddingForSize, REFERENCE_HEIGHT, REFERENCE_WIDTH } from '../src/services/designBodyPlacement'
import { collectGlyphDataWithPlacement } from '../src/services/fontExportUtils'
import type { GlyphPlacementResolver } from '../src/services/fontExportUtils'
import { judgeGlyphInk, measureGlyphInk, referenceOfGlyph, withCounterKeep } from '../src/services/inkCounterMeasure'
import type { GlyphInk, GlyphReference, InkVerdict } from '../src/services/inkCounterMeasure'
import { useGlobalStyleStore } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { useLayoutStore } from '../src/stores/layoutStore'
import type { Padding } from '../src/types'
import notoOutlines from './counterLabNoto.json'
import { exportPlacementResolver } from './fontExportStore'
import { useLayoutDeltaStore } from './layoutDeltaStore'
import { PART_COLOR } from './partColors'
import styles from './CounterProgressMap.module.css'

/**
 * 속공간 지키기 진행 지도. 플랜 `docs/plans/2026-10-01_속공간-지키기.md`의 확인 화면이다.
 * 위는 단계 지도(상태 · 판단 하나 · 결과), 아래는 고른 단계의 확인 그림. 그림은 추출과 같은 윤곽(OTF 잉크)이고, 밑 글씨는 전수 테스트와 같은 셈이다.
 * 단계 내용은 `STEPS` 한 곳에 적는다 — 플랜 진행 기록을 고칠 때 같이 고친다.
 */

type StepId = 'measure' | 'floor' | 'horizontal' | 'between' | 'split' | 'table'
type StepState = 'done' | 'now' | 'partial' | 'wait'
interface Step { id: StepId; title: string; state: StepState; stateLabel: string; question: string; result: string; decision?: string }

/** 10-01 다시 짬: 최소 속공간 하한선을 먼저, 손잡이는 하나씩. 옛 `기준선 밀기 → 덜 굵게`는 뒤집혔다. */
const STEPS: Step[] = [
  {
    id: 'measure', title: '재는 법', state: 'done', stateLabel: '닫힘 · 10-01',
    question: '표가 눈으로 본 것과 맞나',
    result: '맞다. 진짜 잉크로 막힘 · 자소 안 닿음 · 자소 사이 닿음을 센다. 굵기 600에서 58%, 900에서 96%가 하나 이상 걸린다.',
    decision: '틈 기준을 고정 10u에서 획 두께의 1/4로(밭 · 받침 ㅌ이 붙어 보여서).',
  },
  {
    id: 'floor', title: '최소 속공간', state: 'now', stateLabel: '고르기 대기',
    question: '하한선 — 두께의 몇 배를 남길까',
    result: '하한선 = max(24u, 굵어진 두께 × 비율). 하한선 아래로 가는 자소만 자동으로 덜 굵다. 지키는 틈은 나란하거나 마주 본 두 줄기 사이뿐이고, 굵기 400에서 이미 하한선보다 좁던 틈 · 벌어진 쐐기(ㅆ 안쪽 X)는 놓아 준다(노토도 ㅅ을 3u까지 좁힌다). 대신 갰의 ㅆ · 많의 ㄶ은 막힌다. 아래는 비율 0.25 · 0.35 · 0.5 — 굵기 900에서 34 · 48 · 68u. 아직 실험실에만 있고 제품 화면에는 안 붙었다.',
    decision: '사용자 10-01: 벌어진 쐐기는 놓아 준다(ㅆ을 굵게, 속공간은 막혀도). 그 전에 뒤집힘: 기준선 밀기 먼저 → 하한선 먼저.',
  },
  {
    id: 'horizontal', title: '가로줄기 비율', state: 'wait', stateLabel: '대기',
    question: '굵을수록 가로줄기를 얼마나 덜 굵게',
    result: '노토 900: 세로줄기 ×1.95, 가로줄기 ×1.88. 앱은 둘 다 ×1.95. 가로줄기가 쌓이는 ㅌ · 를에 먹는다. 닫을 때 ② 문장 줄을 한 번 다시 본다(확인만).',
  },
  {
    id: 'between', title: '자소 사이', state: 'wait', stateLabel: '대기',
    question: '굵어질 때 이웃 자소 쪽으로 어떻게 자라게',
    result: '굵기 900에서 자소 사이 닿음 3,415자 — 셋 가운데 가장 크다. 후보: 이웃을 마주 본 획만 덜 굵게 / 칸 변을 지키고 안쪽으로 / 칸끼리 자리 나누기.',
  },
  {
    id: 'split', title: '바깥 · 안 분배', state: 'wait', stateLabel: '필요할 때만',
    question: '굵어진 몫을 바깥 · 속공간 쪽에 어떻게 나눌까',
    result: '기본값 = 노토 실측 0.47(거의 대칭, 앱은 0.5). 곧은 줄기는 노토도 속공간 쪽으로 더 자란다. 라틴용 30~40은 고정폭 한글에 안 맞아 철회.',
  },
  {
    id: 'table', title: '조합표 확인', state: 'wait', stateLabel: '대기',
    question: '네모꼴 범위와, 좁을수록 최대 굵기를 낮출지',
    result: '②~⑤ 뒤에 가로 3 × 굵기 4를 다시 잰다. 지금 네모꼴은 86 ~ 106%.',
  },
]
const OPEN_QUESTIONS = [
  '네모꼴 보정(세로줄기만 얇게, 폰트 전체)과 합칠지 — ③ 가로줄기 비율과 같이 본다.',
  '자소마다 굵기가 달라 한 글자 안에서 들쑥날쑥해 보이나 — 공통 문장 줄로 본다.',
  '얇아진 획이 칸 변에서 떨어지는 만큼 — 처음엔 안 맞추고 잰다.',
  '제품에 붙이기 전에 실효 스타일 입구를 한 곳으로 모으는 일(다른 세션)이 먼저다.',
]
/**
 * 지금 사용자에게 묻는 것 하나. 실험실을 열면 질문 id마다 한 번 팝업으로 뜨고, 닫아도 지도 맨 위 카드로 남는다.
 * 답은 채팅으로 받는다 — 선택지를 누르면 답 문장이 복사된다. 물을 게 없으면 `null`.
 */
/** `floorRatio`: 선택지 그림을 그릴 하한선 비율. `undefined`면 그림 없이 글만. */
interface QuestionOption { label: string; detail: string; recommended?: boolean; floorRatio?: number; horizontalRatio?: number }
interface Question { id: string; step: StepId; title: string; body: string; options: QuestionOption[] }
const QUESTION: Question | null = {
  id: 'floor-ratio-stacked-2026-10-01',
  step: 'floor',
  title: '② 최소 속공간 — B′로 정할까요?',
  body: '고르신 것: 를은 B, 한은 A가 낫고 나머지는 비슷, 뷁은 다 별로. B가 한을 나쁘게 한 까닭은 ㅎ의 보 ↔ 동그라미 윗부분까지 "가로줄기 틈"으로 낮게 잡았기 때문입니다. B′는 낮은 하한선(0.25)을 곧은 가로줄기가 길게 겹쳐 쌓인 틈(ㄹ · ㅌ)에만 씁니다 — 를은 B처럼, 한은 A처럼 나와야 합니다. 를 · 한을 두 카드에서 견줘 주세요.',
  options: [
    { label: 'A. 0.5 하나', floorRatio: 0.5, detail: '한이 나았던 것. 를의 첫닿자 ㄹ이 놓여 막히고 받침 ㄹ은 ×0.53까지 얇다. 840 · 900 막힘 1,160자 · 검기 57.7%.' },
    { label: 'B′. 0.5 + 쌓인 가로줄기 틈 0.25', floorRatio: 0.5, horizontalRatio: 0.25, detail: '를은 B, 한은 A와 똑같다(ㅎ 배율 1.00). ㄹ ×0.70 · 0.72, 밭의 ㅌ ×0.63 → 0.88로 덜 얇다. 840 · 900 막힘 1,307자 · 검기 59.2%(조금 더 진하다).', recommended: true },
  ],
}
const QUESTION_SEEN_KEY = 'counter-lab-question-seen'
/** 질문 그림에 같이 그리는 빽빽한 글자(자소별 색). */
const QUESTION_CHARS = ['빼', '를', '쏟', '한', '갰']

/** 모든 단계 공통 확인 문장. 밀도 차이가 큰 글자를 섞어 전체 농도(회색도)가 고른지 본다. */
const GRAY_SENTENCE = ['뷁', '를', '빼', '쫓', '이']

/** 사용자가 굵기 900에서 덩어리로 본 글자 + 대조군. 노토 윤곽(`counterLabNoto.json`)도 같은 글자다. */
const CHARS = ['빼', '를', '뷁', '한', '이', '밭', '쏟', '뭐', '갰', '웨', '많']
const FONT_SPACE = { width: 1000, height: 1000 }
const BODY_W = Math.round(REFERENCE_WIDTH * 1000)
const BODY_H = Math.round(REFERENCE_HEIGHT * 1000)
const paddingOf = (width: number) => designBodyPaddingForSize(width, BODY_H, FONT_SPACE)
const REFERENCE_PADDING = paddingOf(BODY_W)
const GRID_WIDTHS = [840, 720, 600]
const GRID_WEIGHTS = [400, 600, 900]
/** ② 하한선 후보. 고정 24u는 그대로, 두께 비율 하나만 바꿔 본다(굵기 900 두께 137u에서 34 · 48 · 68u). */
const FLOOR_FIXED = 0.024
const FLOOR_RATIOS = [0.25, 0.35, 0.5]
const floorLabel = (ratio: number) => `두께 × ${ratio}`
/** 지금 굵기가 400 이하면 볼 게 없으니 이 굵기로 그린다. */
const FALLBACK_WEIGHT = 900

const CENSUS_HEAD = ['가로 \\ 굵기', '400', '600', '700', '900']
/** 1단계 전수(3,729자, 틈 = 두께 1/4). 칸 = 자소 사이 닿음 · 자소 안 닿음 · 속공간 막힘 · 하나라도. */
const CENSUS_ROWS = [
  ['840', '0 · 0 · 0 · 0', '1,525 · 1,344 · 428 · 2,153', '2,687 · 1,767 · 935 · 3,019', '3,415 · 2,310 · 2,289 · 3,579'],
  ['720', '43 · 315 · 19 · 356', '1,595 · 1,450 · 456 · 2,268', '2,736 · 1,918 · 1,043 · 3,093', '3,419 · 2,339 · 2,233 · 3,572'],
  ['600', '97 · 385 · 55 · 474', '1,638 · 1,799 · 621 · 2,496', '2,671 · 2,080 · 1,074 · 3,092', '3,400 · 2,421 · 2,231 · 3,561'],
]
/** ② 하한선 후보 전수(3,729자, 10-01). 칸 = 하나라도 · 속공간 막힘 · 검기. */
const FLOOR_HEAD = ['가로 · 굵기', '지금', ...FLOOR_RATIOS.map(floorLabel)]
const FLOOR_ROWS: string[][] = [
  ['840 · 600', '2,153 · 428 · 49.8%', '1,925 · 267 · 48.6%', '1,944 · 294 · 48.5%', '1,868 · 402 · 48.3%'],
  ['840 · 700', '3,019 · 935 · 55.2%', '2,911 · 603 · 53.3%', '2,785 · 499 · 52.6%', '2,623 · 610 · 51.8%'],
  ['840 · 900', '3,579 · 2,289 · 65.4%', '3,477 · 1,450 · 60.1%', '3,418 · 1,176 · 59.4%', '3,257 · 1,160 · 57.7%'],
  ['600 · 900', '3,561 · 2,231 · 65.2%', '3,440 · 1,398 · 59.6%', '3,356 · 919 · 58.3%', '3,176 · 945 · 56.4%'],
]
/** 벌어진 쐐기도 지킬 때(10-01 앞선 판). ㅆ · ㄶ이 굵기 400 두께에 묶인다. */
const FLOOR_WEDGE_ROWS: string[][] = [
  ['840 · 600', '2,153 · 428 · 49.8%', '1,408 · 37 · 45.6%', '1,444 · 49 · 45.6%', '1,309 · 167 · 45.2%'],
  ['840 · 700', '3,019 · 935 · 55.2%', '2,323 · 149 · 49.1%', '2,168 · 79 · 48.4%', '2,002 · 208 · 47.7%'],
  ['840 · 900', '3,579 · 2,289 · 65.4%', '2,972 · 478 · 53.7%', '2,861 · 346 · 53.0%', '2,696 · 489 · 51.6%'],
  ['600 · 900', '3,561 · 2,231 · 65.2%', '2,922 · 689 · 53.3%', '2,875 · 416 · 52.0%', '2,697 · 482 · 51.1%'],
]
/** 옛 방식 — 원래 속공간의 몇 %를 남김(10-01 뒤집힘 전). 칸 = 하나라도 · 속공간 막힘 · 검기. */
const KEEP_HEAD = ['가로 · 굵기', '지금', '남길 몫 0.3', '0.5', '0.7']
const KEEP_ROWS = [
  ['840 · 600', '2,153 · 428 · 49.8%', '1,779 · 194 · 47.2%', '1,584 · 42 · 46.2%', '1,246 · 26 · 44.5%'],
  ['840 · 700', '3,019 · 935 · 55.2%', '2,511 · 418 · 50.4%', '2,262 · 62 · 49.0%', '1,684 · 26 · 46.3%'],
  ['840 · 900', '3,579 · 2,289 · 65.4%', '3,220 · 1,043 · 55.8%', '2,962 · 123 · 53.2%', '2,291 · 30 · 48.7%'],
  ['600 · 900', '3,561 · 2,231 · 65.2%', '3,255 · 1,289 · 55.9%', '3,020 · 270 · 53.4%', '2,430 · 54 · 48.7%'],
]
/** 노토 900 ÷ 400, 첫닿자(뒤 ㅏ). 09-25 측정 `reference-data/noto-weight-offsets.v1.json`. 속공간 = 프로브가 읽은 가장 좁은 곳(u). */
const NOTO_JAMO_HEAD = ['첫닿자', '두께 ×', '좁은 속공간 400 → 900', '상자 넓이 ×', '상자 밀림 왼 · 오 · 위 · 아래']
const NOTO_JAMO_ROWS = [
  ['ㅃ (빠)', '1.84', '48 → 24', '1.10', '34 · 21 · 16 · 24'],
  ['ㅌ (타)', '1.88', '185 → 130', '1.02', '19 · −10 · 25 · 30'],
  ['ㄹ (라)', '1.89', '188 → 124', '1.00', '12 · −12 · 26 · 23'],
  ['ㅊ (차)', '1.89', '135 → 44', '1.09', '27 · 21 · 10 · 23'],
  ['ㅈ (자)', '1.91', '62 → 15', '1.09', '23 · 29 · 23 · 17'],
  ['ㅎ (하)', '1.91', '75 → 40', '1.02', '14 · −4 · 10 · 36'],
  ['ㅂ (바)', '1.92', '238 → 146', '1.11', '27 · 18 · 23 · 21'],
  ['ㅁ (마)', '1.95', '253 → 141', '1.11', '27 · 17 · 23 · 24'],
  ['ㅅ (사)', '1.97', '61 → 3', '1.08', '24 · 20 · 27 · 21'],
  ['ㅇ (아)', '1.97', '277 → 173', '1.11', '28 · 23 · 26 · 23'],
]
/** 노토 가변 폰트에서 잰 값(u). */
const NOTO_HEAD = ['굵기', 'ㅣ 폭', 'ㅡ 높이', '이: ㅇ ↔ ㅣ 틈', '한 외곽 왼 · 오 · 위 · 아래']
const NOTO_ROWS = [
  ['400', '83', '69', '165', '52 · 885 · 826 · −58'],
  ['500', '105', '87', '146', '47 · 888 · 831 · −64'],
  ['700', '133', '109', '122', '41 · 892 · 838 · −73'],
  ['900', '162', '131', '98', '34 · 896 · 845 · −81'],
]

const CHOSEONG = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const JUNGSEONG = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
const JONGSEONG = ' ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ'
/** 셈 결과의 자소 이름(CH · JU · JO)을 그 글자의 자모로. */
function jamoNameOf(char: string, part: string): string {
  const index = (char.codePointAt(0) ?? 0) - 0xac00
  if (part === 'CH') return CHOSEONG[Math.floor(index / 588)]
  if (part === 'JU') return JUNGSEONG[Math.floor(index % 588 / 28)]
  return JONGSEONG[index % 28].trim() || part
}

const pathOf = (paths: PathsD) => paths.map((path) => `M${path.map((p) => `${p.x.toFixed(0)} ${p.y.toFixed(0)}`).join('L')}Z`).join('')

/** 글자 하나를 그 조건으로 재 둔 것. */
interface Measured { ink: GlyphInk; verdict: InkVerdict; scales?: Map<string, number> }
type Condition = { padding: Padding; weight: number; floorRatio?: number; horizontalRatio?: number }

/** 모델 상자 해석기. 레이아웃 Δ가 바뀌면 다시 만든다. */
function usePlacementResolver(): GlyphPlacementResolver | null {
  const rules = useLayoutDeltaStore((state) => state.rules)
  const [resolver, setResolver] = useState<GlyphPlacementResolver | null>(null)
  useEffect(() => {
    let alive = true
    void exportPlacementResolver().then((next) => { if (alive) setResolver(() => next) })
    return () => { alive = false }
  }, [rules])
  return resolver
}

/** 폰트 값이 바뀌면 다시 재도록 묶은 열쇠. */
function useFontVersion(): unknown[] {
  return [
    useJamoStore((state) => state.choseong), useJamoStore((state) => state.jungseong), useJamoStore((state) => state.jongseong),
    useGlobalStyleStore((state) => state.style), useGlobalStyleStore((state) => state.exclusions),
    useLayoutStore((state) => state.layoutSchemas), useLayoutStore((state) => state.paddingOverrides),
  ]
}

function measureOf(resolver: GlyphPlacementResolver, char: string, condition: Condition, reference: GlyphReference | undefined): Measured | null {
  const data = collectGlyphDataWithPlacement(char, resolver, { padding: condition.padding, weight: condition.weight })
  if (!data) return null
  const kept = condition.floorRatio === undefined ? undefined : withCounterKeep(data, { fixed: FLOOR_FIXED, ratio: condition.floorRatio, horizontalRatio: condition.horizontalRatio })
  const ink = measureGlyphInk(kept?.data ?? data)
  return { ink, verdict: judgeGlyphInk(ink, reference), scales: kept?.scales }
}

/** 기준(기본 가로 · 굵기 400)에서 잰 글자들. */
function useReferences(resolver: GlyphPlacementResolver | null, version: unknown[]): Map<string, GlyphReference> {
  return useMemo(() => {
    const out = new Map<string, GlyphReference>()
    if (!resolver) return out
    for (const char of CHARS) {
      const measured = measureOf(resolver, char, { padding: REFERENCE_PADDING, weight: 400 }, undefined)
      if (measured) out.set(char, referenceOfGlyph(measured.ink))
    }
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resolver, ...version])
}

/** 자소별 색으로 칠한 잉크. `outline`이 있으면 그 잉크를 빨간 선으로 위에 긋는다. */
function InkGlyph({ ink, size, outline, plain = false, solid = false }: { ink: GlyphInk; size: number; outline?: PathsD; plain?: boolean; solid?: boolean }) {
  return (
    <svg viewBox="0 -880 1000 1000" width={size} height={size} className={styles.glyph}>
      <g transform="scale(1,-1)">
        {ink.parts.map((part) => <path key={part.part} d={pathOf(part.ink)} fill={plain ? '#111' : PART_COLOR[part.part as keyof typeof PART_COLOR] ?? '#000'} fillOpacity={plain || solid ? 1 : outline ? 0.45 : 0.85} />)}
        {outline && <path d={pathOf(outline)} fill="none" stroke="#d64545" strokeWidth={6} />}
      </g>
    </svg>
  )
}

/** 셈 결과 글씨. 비어 있으면 멀쩡하다고 본 것. */
function Verdict({ char, verdict, scales }: { char: string; verdict: InkVerdict; scales?: Map<string, number> }) {
  const splitParts = [...new Set(verdict.split.map((pair) => pair.split('/')[0]))]
  const thinned = scales ? [...scales].filter(([, value]) => value < 0.995) : []
  return (
    <div className={styles.verdict}>
      {verdict.closed.length > 0 && <b data-kind="closed">막힘 {verdict.closed.map((part) => jamoNameOf(char, part)).join(' ')}</b>}
      {splitParts.length > 0 && <b data-kind="split">안 닿음 {splitParts.map((part) => jamoNameOf(char, part)).join(' ')}</b>}
      {verdict.touch.length > 0 && <b data-kind="touch">사이 {verdict.touch.map((pair) => pair.split('-').map((part) => jamoNameOf(char, part)).join('↔')).join(' ')}</b>}
      {thinned.length > 0 && <span>{thinned.map(([part, value]) => `${jamoNameOf(char, part)} ×${value.toFixed(2)}`).join(' · ')}</span>}
    </div>
  )
}

function Table({ head, rows }: { head: string[]; rows: string[][] }) {
  return (
    <table className={styles.table}>
      <thead><tr>{head.map((cell) => <th key={cell}>{cell}</th>)}</tr></thead>
      <tbody>{rows.map((row) => <tr key={row[0]}>{row.map((cell, index) => index === 0 ? <th key={index}>{cell}</th> : <td key={index}>{cell}</td>)}</tr>)}</tbody>
    </table>
  )
}

const Legend = () => (
  <p className={styles.legend}>
    초록 = 첫닿자 · 파랑 = 홀자 · 보라 = 받침. 글씨: <b data-kind="closed">막힘</b>(속공간 닫힘) · <b data-kind="split">안 닿음</b>(같은 자소 안 획이 새로 붙음) · <b data-kind="touch">사이</b>(다른 자소끼리 새로 붙음). 틈이 획 두께의 1/4보다 좁으면 붙었다고 센다. 비어 있으면 멀쩡하다고 본 것.
  </p>
)

/** ① 가로 3 × 굵기 3 그림에 셈 결과. */
function MeasurePanel({ resolver, references, version }: { resolver: GlyphPlacementResolver; references: Map<string, GlyphReference>; version: unknown[] }) {
  const conditions = GRID_WIDTHS.flatMap((width) => GRID_WEIGHTS.map((weight) => ({ width, weight })))
  const cells = useMemo(() => CHARS.map((char) => conditions.map(({ width, weight }) => measureOf(resolver, char, { padding: paddingOf(width), weight }, references.get(char)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolver, references, ...version])
  return (
    <>
      <p className={styles.look}><b>볼 것:</b> 글씨가 없는데 막혀 보이는 칸, 글씨가 있는데 멀쩡해 보이는 칸.</p>
      <Legend />
      <div className={styles.scroll}>
        <table className={styles.grid}>
          <thead><tr><th />{conditions.map(({ width, weight }) => <th key={`${width}-${weight}`}>가로 {width}<br />굵기 {weight}</th>)}</tr></thead>
          <tbody>{CHARS.map((char, row) => <tr key={char}><th>{char}</th>{cells[row].map((cell, column) => <td key={column}>{cell && <><InkGlyph ink={cell.ink} size={84} /><Verdict char={char} verdict={cell.verdict} /></>}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <h3>전수 3,729자 — 자소 사이 닿음 · 자소 안 닿음 · 속공간 막힘 · 하나라도</h3>
      <Table head={CENSUS_HEAD} rows={CENSUS_ROWS} />
    </>
  )
}

/** ② 노토와 앱이 굵어질 때 어느 쪽으로 자라나. 빨간 선 = 굵기 400, 면 = 굵은 쪽. */
function PushPanel({ resolver, padding, weight, version }: { resolver: GlyphPlacementResolver; padding: Padding; weight: number; version: unknown[] }) {
  const glyphs = notoOutlines.glyphs as Record<string, Record<string, { d: string }>>
  const cells = useMemo(() => CHARS.map((char) => {
    const thin = measureOf(resolver, char, { padding, weight: 400 }, undefined)
    const bold = measureOf(resolver, char, { padding, weight }, undefined)
    return thin && bold ? { outline: unionD(thin.ink.parts.flatMap((part) => part.ink), FillRule.NonZero), bold } : null
  }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [resolver, padding, weight, ...version])
  return (
    <>
      <p className={styles.look}><b>볼 것:</b> 빨간 선(굵기 400) 밖으로 면(굵은 쪽)이 나간 방향과, 900에서 남은 속공간. 노토도 속공간이 많이 줄지만 실처럼 남고, 앱은 같은 자리가 메워진다.</p>
      <div className={styles.scroll}>
        <table className={styles.grid}>
          <thead><tr><th /><th>노토 400 → 900</th><th>앱 400 → {weight}</th><th>앱 · 분배 바꾼 뒤</th></tr></thead>
          <tbody>{CHARS.map((char, row) => <tr key={char}>
            <th>{char}</th>
            <td>
              <svg viewBox="0 -880 1000 1000" width={120} height={120} className={styles.glyph}>
                <g transform="scale(1,-1)">
                  <path d={glyphs[char]?.['900']?.d} fill="#3b6fd6" fillOpacity={0.4} />
                  <path d={glyphs[char]?.['400']?.d} fill="none" stroke="#d64545" strokeWidth={6} />
                </g>
              </svg>
            </td>
            <td>{cells[row] && <InkGlyph ink={cells[row]!.bold.ink} outline={cells[row]!.outline} size={120} />}</td>
            <td className={styles.pending}>아직 없음<br /><small>⑤ 필요하면 여기 그린다</small></td>
          </tr>)}</tbody>
        </table>
      </div>
      <h3>노토 자소별 900 ÷ 400 — 앱은 모든 자소 두께 ×1.95, 바깥으로 약 33u(분배 0.5)</h3>
      <Table head={NOTO_JAMO_HEAD} rows={NOTO_JAMO_ROWS} />
      <h3>노토 가변 폰트 잰 값(u)</h3>
      <Table head={NOTO_HEAD} rows={NOTO_ROWS} />
    </>
  )
}

/** ② 하한선 후보별. 글씨 끝 숫자 = 자소별 굵기 배율(하한선을 지키려고 덜 굵어진 만큼). */
function FloorPanel({ resolver, references, padding, weight, version }: { resolver: GlyphPlacementResolver; references: Map<string, GlyphReference>; padding: Padding; weight: number; version: unknown[] }) {
  const columns: { label: string; ratio?: number }[] = [{ label: '지금' }, ...FLOOR_RATIOS.map((ratio) => ({ label: floorLabel(ratio), ratio }))]
  const cells = useMemo(() => CHARS.map((char) => columns.map(({ ratio }) => measureOf(resolver, char, { padding, weight, floorRatio: ratio }, references.get(char)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolver, references, padding, weight, ...version])
  return (
    <>
      <p className={styles.look}><b>볼 것:</b> 하한선을 올릴수록 속공간이 넓게 남지만 그 자소가 덜 굵다. 굵기 400에서 이미 하한선보다 좁던 틈(ㅆ 다리 사이 등)은 놓아 주므로, 하한선이 높으면 그런 틈은 오히려 닫힌다. 숫자 = 그 자소 획 두께 배율.</p>
      <Legend />
      <div className={styles.scroll}>
        <table className={styles.grid}>
          <thead><tr><th />{columns.map(({ label }) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{CHARS.map((char, row) => <tr key={char}><th>{char}</th>{cells[row].map((cell, column) => <td key={column}>{cell && <><InkGlyph ink={cell.ink} size={110} /><Verdict char={char} verdict={cell.verdict} scales={cell.scales} /></>}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <h3>전수 — 하나라도 · 속공간 막힘 · 검기 (하한선 고정 24u, 나란하거나 마주 본 틈만 지킴 = 위 그림)</h3>
      <Table head={FLOOR_HEAD} rows={FLOOR_ROWS} />
      <h3>견줌 — 벌어진 쐐기(ㅆ 안쪽 X · ㄶ)도 지킬 때: 막힘은 적지만 그 자소가 굵기 400 두께에 묶인다</h3>
      <Table head={FLOOR_HEAD} rows={FLOOR_WEDGE_ROWS} />
      <h3>참고 — 옛 방식(원래 속공간의 몇 %를 남김)</h3>
      <Table head={KEEP_HEAD} rows={KEEP_ROWS} />
      <h3>참고 — 노토 자소별 900 ÷ 400</h3>
      <Table head={NOTO_JAMO_HEAD} rows={NOTO_JAMO_ROWS} />
    </>
  )
}

function LimitsPanel() {
  return (
    <>
      <p className={styles.look}>②~⑤를 얹은 뒤 아래 표를 다시 잰다. 그 표를 보고 네모꼴 범위(지금 86 ~ 106%)와, 좁을수록 최대 굵기를 낮출지 정한다.</p>
      <h3>지금(보정 없음) — 자소 사이 닿음 · 자소 안 닿음 · 속공간 막힘 · 하나라도</h3>
      <Table head={CENSUS_HEAD} rows={CENSUS_ROWS} />
    </>
  )
}

/** 공통 문장 줄. 굵기 400과 지금 굵기를 검게 나란히 — 단계가 붙을 때마다 줄이 는다. */
function GraySentence({ resolver, padding, weight, floorRatios = [], version }: { resolver: GlyphPlacementResolver; padding: Padding; weight: number; floorRatios?: number[]; version: unknown[] }) {
  const conditions: { label: string; weight: number; floorRatio?: number }[] = [
    { label: '굵기 400', weight: 400 }, { label: `지금 ${weight}`, weight },
    ...floorRatios.map((ratio) => ({ label: floorLabel(ratio), weight, floorRatio: ratio })),
  ]
  const rows = useMemo(() => conditions.map((row) => ({ ...row, inks: GRAY_SENTENCE.map((char) => measureOf(resolver, char, { padding, weight: row.weight, floorRatio: row.floorRatio }, undefined)) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolver, padding, weight, floorRatios.join(), ...version])
  return (
    <div className={styles.gray} data-testid="counter-gray">
      <span className={styles.grayHead}>회색도 · 모든 단계 공통</span>
      {rows.map(({ label, inks }) => <div key={label} className={styles.grayRow}>
        <small>{label}</small>
        <span>{inks.map((ink, index) => ink && <InkGlyph key={index} ink={ink.ink} size={64} plain />)}</span>
      </div>)}
    </div>
  )
}

/** 그림 그리는 데 필요한 것. 모델이 아직 안 뜨면 `null`. */
interface PreviewContext { resolver: GlyphPlacementResolver; padding: Padding; weight: number; version: unknown[] }

/** 글자마다 고른 카드(선택지 이름). 팝업과 지도 위 카드가 같이 쓴다. */
type Picks = Record<string, string>
const BASE_LABEL = '지금'

/** 한 조건의 글자 그림: 회색도 문장 + 막히기 쉬운 글자, 둘 다 검정(사용자 10-01: 검정이 잘 보인다). 글자를 누르면 "이 글자는 이 카드가 낫다"로 고른다. */
function ConditionPreview({ context, label, floorRatio, horizontalRatio, size, picks, onPick }: { context: PreviewContext; label: string; floorRatio?: number; horizontalRatio?: number; size: number; picks: Picks; onPick: (char: string, label: string) => void }) {
  const { resolver, padding, weight, version } = context
  const inks = useMemo(() => ({
    gray: GRAY_SENTENCE.map((char) => measureOf(resolver, char, { padding, weight, floorRatio, horizontalRatio }, undefined)),
    dense: QUESTION_CHARS.map((char) => measureOf(resolver, char, { padding, weight, floorRatio, horizontalRatio }, undefined)),
  }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [resolver, padding, weight, floorRatio, horizontalRatio, ...version])
  const glyph = (char: string, ink: Measured | null, index: number, kind: 'plain' | 'solid') => ink && (
    <button key={index} type="button" className={styles.pickGlyph} aria-pressed={picks[char] === label} aria-label={`${char} — ${label}이 낫다`} onClick={() => onPick(char, label)}>
      <InkGlyph ink={ink.ink} size={size} plain={kind === 'plain'} solid={kind === 'solid'} />
    </button>
  )
  return (
    <span className={styles.preview}>
      <span><em>회색도</em>{inks.gray.map((ink, index) => glyph(GRAY_SENTENCE[index], ink, index, 'plain'))}</span>
      <span><em>속공간</em>{inks.dense.map((ink, index) => glyph(QUESTION_CHARS[index], ink, index, 'plain'))}</span>
    </span>
  )
}

/** 질문 카드. `popup`이면 화면 가운데 덮개로 띄운다. 선택지마다 그 조건의 글자 그림을 붙이고, 글자 하나하나를 고를 수 있다. */
function QuestionCard({ question, context, picks, onPick, popup = false, onShow, onClose }: { question: Question; context: PreviewContext | null; picks: Picks; onPick: (char: string, label: string) => void; popup?: boolean; onShow: () => void; onClose?: () => void }) {
  const size = popup ? 46 : 38
  const [copied, setCopied] = useState<string | null>(null)
  const copy = (text: string, note: string) => { void navigator.clipboard?.writeText(text).then(() => setCopied(note), () => setCopied(note)) }
  const answer = (label: string) => copy(`${question.title.replace(/\?$/, '')}: ${label}`, label)
  const chars = [...new Set([...GRAY_SENTENCE, ...QUESTION_CHARS])]
  const picked = chars.filter((char) => picks[char])
  const summary = picked.map((char) => `${char} ${picks[char]}`).join(' · ')
  const hasPreview = context && question.options.some((option) => option.floorRatio !== undefined)
  const card = (
    <div className={popup ? styles.askPopup : styles.ask} role={popup ? 'dialog' : 'region'} aria-modal={popup || undefined} aria-label="AI가 묻는 것" data-testid={popup ? 'counter-question-popup' : 'counter-question'}>
      <span className={styles.askTag}>질문 · 답해 주세요</span>
      <strong>{question.title}</strong>
      <p>{question.body}</p>
      {hasPreview && <p className={styles.askLegend}><b>글자마다 고르기:</b> 카드마다 괜찮은 글자가 달라도 된다. 글자마다 가장 나은 카드의 그 글자를 누른다(같은 글자는 한 카드만). 다 고르면 아래 <b>고른 것 복사</b>. <b>회색도</b> = 빽빽한 · 성긴 글자를 섞은 문장(진하기가 고른가), <b>속공간</b> = 막히기 쉬운 글자(흰 틈이 살아 있나).</p>}
      {hasPreview && <div className={styles.askBase}>
        <small>{BASE_LABEL} · 보정 없음 (가로 {Math.round((1 - context.padding.left - context.padding.right) * 1000)} · 굵기 {context.weight})</small>
        <ConditionPreview context={context} label={BASE_LABEL} size={size} picks={picks} onPick={onPick} />
      </div>}
      <div className={styles.askOptions}>
        {question.options.map((option) => (
          <div key={option.label} className={styles.askOption} data-rec={option.recommended || undefined}>
            <b>{option.label}{option.recommended ? ' · 추천' : ''}</b>
            {context && option.floorRatio !== undefined && <ConditionPreview context={context} label={option.label} floorRatio={option.floorRatio} horizontalRatio={option.horizontalRatio} size={size} picks={picks} onPick={onPick} />}
            <small>{option.detail}</small>
            <button type="button" onClick={() => answer(option.label)}>이걸로 통째로</button>
          </div>
        ))}
      </div>
      <div className={styles.askFoot}>
        <span>{copied ? `“${copied}” 복사했어요. 채팅에 붙여 넣어 주세요.` : picked.length ? `고른 것 ${picked.length}/${chars.length}: ${summary}` : '글자를 눌러 고르거나, 카드 하나를 통째로 고르세요.'}</span>
        {picked.length > 0 && <button type="button" data-testid="counter-question-copy" onClick={() => copy(`${question.title.replace(/\?$/, '')} — 글자별: ${summary}`, `글자별 ${picked.length}자`)}>고른 것 복사</button>}
        <button type="button" onClick={() => { onShow(); onClose?.() }}>그림 보며 고르기</button>
        {popup && <button type="button" onClick={onClose}>닫기</button>}
      </div>
    </div>
  )
  return popup ? <div className={styles.askBackdrop} onClick={(event) => { if (event.target === event.currentTarget) onClose?.() }}>{card}</div> : card
}

const Pending = ({ text }: { text: string }) => <p className={styles.pendingNote}>{text}</p>

export function CounterProgressMap() {
  const [selected, setSelected] = useState<StepId>(() => STEPS.find((step) => step.state === 'now')?.id ?? 'measure')
  const padding = useLayoutStore((state) => state.globalPadding)
  const storedWeight = useGlobalStyleStore((state) => state.style.weight)
  const weight = storedWeight > 400 ? storedWeight : FALLBACK_WEIGHT
  const width = Math.round((1 - padding.left - padding.right) * FONT_SPACE.width)
  const resolver = usePlacementResolver()
  const version = useFontVersion()
  const references = useReferences(resolver, version)
  const step = STEPS.find((item) => item.id === selected)!
  const [picks, setPicks] = useState<Picks>({})
  // 같은 카드를 다시 누르면 고른 걸 푼다.
  const pick = (char: string, label: string) => setPicks((current) => {
    const next = { ...current }
    if (next[char] === label) delete next[char]
    else next[char] = label
    return next
  })
  const previewContext: PreviewContext | null = resolver ? { resolver, padding, weight, version } : null
  // 새 질문이면 한 번 팝업. 저장소를 못 쓰면 매번 뜬다.
  const [popupOpen, setPopupOpen] = useState(() => {
    if (!QUESTION) return false
    try { return localStorage.getItem(QUESTION_SEEN_KEY) !== QUESTION.id } catch { return true }
  })
  const closePopup = () => {
    setPopupOpen(false)
    try { if (QUESTION) localStorage.setItem(QUESTION_SEEN_KEY, QUESTION.id) } catch { /* 저장 못 해도 카드는 남는다 */ }
  }
  const showQuestionStep = () => {
    if (!QUESTION) return
    setSelected(QUESTION.step)
    document.querySelector(`[data-testid="counter-panel-${QUESTION.step}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <section className={styles.map} aria-label="속공간 지키기 진행 지도" data-testid="counter-map">
      <div className={styles.mapHead}>
        <strong>속공간 지키기 · 진행 지도</strong>
        <span>굵기를 올려도 빽빽한 자소의 속공간이 남게 한다. 칸을 누르면 그 단계의 확인 그림이 열린다.</span>
      </div>
      {QUESTION && <QuestionCard question={QUESTION} context={previewContext} picks={picks} onPick={pick} onShow={showQuestionStep} />}
      {QUESTION && popupOpen && <QuestionCard question={QUESTION} context={previewContext} picks={picks} onPick={pick} popup onShow={showQuestionStep} onClose={closePopup} />}
      <ol className={styles.steps}>
        {STEPS.map((item, index) => (
          <li key={item.id}>
            <button type="button" aria-pressed={item.id === selected} data-state={item.state} data-asking={QUESTION?.step === item.id || undefined} onClick={() => setSelected(item.id)} data-testid={`counter-step-${item.id}`}>
              <span className={styles.stepTop}><em>{index + 1}</em><strong>{item.title}</strong><small>{item.stateLabel}</small></span>
              <span className={styles.question}>판단 · {item.question}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className={styles.panel} data-testid={`counter-panel-${selected}`}>
        <div className={styles.summary}>
          <p>{step.result}</p>
          {step.decision && <p className={styles.decision}>{step.decision}</p>}
        </div>
        {resolver && <GraySentence resolver={resolver} padding={padding} weight={weight} floorRatios={selected === 'floor' ? FLOOR_RATIOS : []} version={version} />}
        {(selected === 'floor' || selected === 'split') && <p className={styles.condition}>그림 조건: 가로 {width} · 굵기 {weight}{storedWeight <= 400 ? ` (지금 굵기 ${storedWeight}는 볼 게 없어 ${FALLBACK_WEIGHT}로 그림)` : ''} — 위 막대로 바꾼다.</p>}
        {selected === 'table' ? <LimitsPanel />
          : selected === 'horizontal' ? <Pending text="아직 안 함. ② 하한선이 닫히면 가로줄기 배율 하나를 막대로 붙여 그림을 연다." />
            : selected === 'between' ? <Pending text="아직 안 함. 후보 셋 가운데 하나를 고르기 전에, ①의 그림에서 `사이` 글씨가 붙은 칸을 본다." />
              : !resolver ? <p className={styles.condition}>모델 불러오는 중…</p>
                : selected === 'measure' ? <MeasurePanel resolver={resolver} references={references} version={version} />
                  : selected === 'split' ? <PushPanel resolver={resolver} padding={padding} weight={weight} version={version} />
                    : <FloorPanel resolver={resolver} references={references} padding={padding} weight={weight} version={version} />}
      </div>

      <details className={styles.open}>
        <summary>미결정 {OPEN_QUESTIONS.length}</summary>
        <ul>{OPEN_QUESTIONS.map((item) => <li key={item}>{item}</li>)}</ul>
      </details>
    </section>
  )
}
