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
    id: 'floor', title: '최소 속공간', state: 'now', stateLabel: '지금 할 차례',
    question: '하한선 값 — 고정 몇 u, 두께의 몇 배',
    result: '하한선 = max(고정 u, 두께 × 비율). 넘는 자소만 자동으로 덜 굵다. 함수(`counterKeep`)는 있지만 아직 "원래 속공간의 몇 %"로 잰다 — 하한선으로 바꿀 차례. 아래 그림은 지금 함수의 남길 몫 0.3 · 0.5 · 0.7(참고). 노토 900은 속공간을 3~24u까지 줄인다(아래 표).',
    decision: '뒤집힘(사용자 10-01): 기준선 밀기 먼저 → 하한선 먼저. 노토도 바깥 밀림은 앱과 비슷하고 속공간을 안 지킨다.',
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
const KEEPS = [0.3, 0.5, 0.7]
/** 지금 굵기가 400 이하면 볼 게 없으니 이 굵기로 그린다. */
const FALLBACK_WEIGHT = 900

const CENSUS_HEAD = ['가로 \\ 굵기', '400', '600', '700', '900']
/** 1단계 전수(3,729자, 틈 = 두께 1/4). 칸 = 자소 사이 닿음 · 자소 안 닿음 · 속공간 막힘 · 하나라도. */
const CENSUS_ROWS = [
  ['840', '0 · 0 · 0 · 0', '1,525 · 1,344 · 428 · 2,153', '2,687 · 1,767 · 935 · 3,019', '3,415 · 2,310 · 2,289 · 3,579'],
  ['720', '43 · 315 · 19 · 356', '1,595 · 1,450 · 456 · 2,268', '2,736 · 1,918 · 1,043 · 3,093', '3,419 · 2,339 · 2,233 · 3,572'],
  ['600', '97 · 385 · 55 · 474', '1,638 · 1,799 · 621 · 2,496', '2,671 · 2,080 · 1,074 · 3,092', '3,400 · 2,421 · 2,231 · 3,561'],
]
/** 덜 굵게 남길 몫 견주기. 칸 = 하나라도 · 속공간 막힘 · 검기. */
const KEEP_HEAD = ['가로 · 굵기', '지금', '0.3', '0.5', '0.7']
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
type Condition = { padding: Padding; weight: number; keep?: number }

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
  const kept = condition.keep === undefined ? undefined : withCounterKeep(data, condition.keep)
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
function InkGlyph({ ink, size, outline, plain = false }: { ink: GlyphInk; size: number; outline?: PathsD; plain?: boolean }) {
  return (
    <svg viewBox="0 -880 1000 1000" width={size} height={size} className={styles.glyph}>
      <g transform="scale(1,-1)">
        {ink.parts.map((part) => <path key={part.part} d={pathOf(part.ink)} fill={plain ? '#111' : PART_COLOR[part.part as keyof typeof PART_COLOR] ?? '#000'} fillOpacity={plain ? 1 : outline ? 0.45 : 0.85} />)}
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

/** ③ 남길 몫별 덜 굵게. 글씨 끝 숫자 = 자소별 굵기 배율. */
function ThinPanel({ resolver, references, padding, weight, version }: { resolver: GlyphPlacementResolver; references: Map<string, GlyphReference>; padding: Padding; weight: number; version: unknown[] }) {
  const columns: { label: string; keep?: number }[] = [{ label: '지금' }, ...KEEPS.map((keep) => ({ label: `남길 몫 ${keep}`, keep }))]
  const cells = useMemo(() => CHARS.map((char) => columns.map(({ keep }) => measureOf(resolver, char, { padding, weight, keep }, references.get(char)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolver, references, padding, weight, ...version])
  return (
    <>
      <p className={styles.look}><b>볼 것:</b> 속공간이 열리는 몫과, 그 대신 너무 가늘어지는 자소(쏟의 ㅆ · 웨의 ㅞ · 한의 ㅎ). 숫자 = 그 자소 획 두께 배율.</p>
      <Legend />
      <div className={styles.scroll}>
        <table className={styles.grid}>
          <thead><tr><th />{columns.map(({ label, keep }) => <th key={label} data-rec={keep === 0.5 || undefined}>{label}</th>)}</tr></thead>
          <tbody>{CHARS.map((char, row) => <tr key={char}><th>{char}</th>{cells[row].map((cell, column) => <td key={column} data-rec={columns[column].keep === 0.5 || undefined}>{cell && <><InkGlyph ink={cell.ink} size={110} /><Verdict char={char} verdict={cell.verdict} scales={cell.scales} /></>}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <h3>전수 — 하나라도 · 속공간 막힘 · 검기</h3>
      <Table head={KEEP_HEAD} rows={KEEP_ROWS} />
      <h3>하한선 참고 — 노토 자소별 900 ÷ 400</h3>
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
function GraySentence({ resolver, padding, weight, version }: { resolver: GlyphPlacementResolver; padding: Padding; weight: number; version: unknown[] }) {
  const rows = useMemo(() => [400, weight].map((rowWeight) => ({ rowWeight, inks: GRAY_SENTENCE.map((char) => measureOf(resolver, char, { padding, weight: rowWeight }, undefined)) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolver, padding, weight, ...version])
  return (
    <div className={styles.gray} data-testid="counter-gray">
      <span className={styles.grayHead}>회색도 · 모든 단계 공통</span>
      {rows.map(({ rowWeight, inks }) => <div key={rowWeight} className={styles.grayRow}>
        <small>{rowWeight === 400 ? '굵기 400' : `지금 ${rowWeight}`}</small>
        <span>{inks.map((ink, index) => ink && <InkGlyph key={index} ink={ink.ink} size={64} plain />)}</span>
      </div>)}
    </div>
  )
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

  return (
    <section className={styles.map} aria-label="속공간 지키기 진행 지도" data-testid="counter-map">
      <div className={styles.mapHead}>
        <strong>속공간 지키기 · 진행 지도</strong>
        <span>굵기를 올려도 빽빽한 자소의 속공간이 남게 한다. 칸을 누르면 그 단계의 확인 그림이 열린다.</span>
      </div>
      <ol className={styles.steps}>
        {STEPS.map((item, index) => (
          <li key={item.id}>
            <button type="button" aria-pressed={item.id === selected} data-state={item.state} onClick={() => setSelected(item.id)} data-testid={`counter-step-${item.id}`}>
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
        {resolver && <GraySentence resolver={resolver} padding={padding} weight={weight} version={version} />}
        {(selected === 'floor' || selected === 'split') && <p className={styles.condition}>그림 조건: 가로 {width} · 굵기 {weight}{storedWeight <= 400 ? ` (지금 굵기 ${storedWeight}는 볼 게 없어 ${FALLBACK_WEIGHT}로 그림)` : ''} — 위 막대로 바꾼다.</p>}
        {selected === 'table' ? <LimitsPanel />
          : selected === 'horizontal' ? <Pending text="아직 안 함. ② 하한선이 닫히면 가로줄기 배율 하나를 막대로 붙여 그림을 연다." />
            : selected === 'between' ? <Pending text="아직 안 함. 후보 셋 가운데 하나를 고르기 전에, ①의 그림에서 `사이` 글씨가 붙은 칸을 본다." />
              : !resolver ? <p className={styles.condition}>모델 불러오는 중…</p>
                : selected === 'measure' ? <MeasurePanel resolver={resolver} references={references} version={version} />
                  : selected === 'split' ? <PushPanel resolver={resolver} padding={padding} weight={weight} version={version} />
                    : <ThinPanel resolver={resolver} references={references} padding={padding} weight={weight} version={version} />}
      </div>

      <details className={styles.open}>
        <summary>미결정 {OPEN_QUESTIONS.length}</summary>
        <ul>{OPEN_QUESTIONS.map((item) => <li key={item}>{item}</li>)}</ul>
      </details>
    </section>
  )
}
