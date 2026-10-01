import { useEffect, useMemo, useState } from 'react'
import { areaPathsD, differenceD, FillRule, intersectD, unionD } from 'clipper2-ts'
import type { PathsD } from 'clipper2-ts'
import { designBodyPaddingForSize, REFERENCE_HEIGHT, REFERENCE_WIDTH } from '../src/services/designBodyPlacement'
import { collectGlyphDataWithPlacement } from '../src/services/fontExportUtils'
import type { GlyphPlacementResolver } from '../src/services/fontExportUtils'
import { judgeGlyphInk, measureGlyphInk, referenceOfGlyph, withCounterKeep, withHorizontalShare } from '../src/services/inkCounterMeasure'
import type { GlyphInk, GlyphReference, InkVerdict } from '../src/services/inkCounterMeasure'
import { useGlobalStyleStore } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { useLayoutStore } from '../src/stores/layoutStore'
import type { Padding } from '../src/types'
import notoOutlines from './counterLabNoto.json'
import weightProbeLab from './weightProbeLab.json'
import { exportPlacementResolver } from './fontExportStore'
import { useLayoutDeltaStore } from './layoutDeltaStore'
import { PART_COLOR } from './partColors'
import styles from './CounterProgressMap.module.css'

/**
 * 속공간 지키기 진행 지도. 플랜 `docs/plans/2026-10-01_속공간-지키기.md`의 확인 화면이다.
 * 위는 단계 지도(상태 · 판단 하나 · 결과), 아래는 고른 단계의 확인 그림. 그림은 추출과 같은 윤곽(OTF 잉크)이고, 밑 글씨는 전수 테스트와 같은 셈이다.
 * 단계 내용은 `STEPS` 한 곳에 적는다 — 플랜 진행 기록을 고칠 때 같이 고친다.
 */

type StepId = 'ruler' | 'error' | 'fit900' | 'pattern' | 'gate' | 'measure' | 'floor' | 'horizontal' | 'between' | 'split' | 'table'
type StepState = 'done' | 'now' | 'partial' | 'wait'
interface Step { id: StepId; title: string; state: StepState; stateLabel: string; question: string; result: string; decision?: string }

/** 10-01 두 번째 다시 짬(역추론): 참고 폰트 100 · 900을 같은 자로 재서 손잡이 값을 숫자로 맞춘다. 눈 검증은 세 번(① 자 · ② 900 월드컵 · ③ 굵기 막대). */
const STEPS: Step[] = [
  {
    id: 'ruler', title: '같은 자', state: 'done', stateLabel: '닫힘 · 10-01 눈 ①',
    question: '프로브가 줄기를 제대로 짚었나 (눈 ①)',
    result: '참고 폰트 측정과 같은 프로브(상자 비율 자리 다섯 줄)를 우리 윤곽에도 돌렸다. 지금 제품 900 = 세로 ×1.95 — 노토 ×1.95와 같다. 두께는 이미 노토인데 속공간 처리가 다르다. B′ + 가로 ×1.5는 노토보다 많이 얇다: 하한선 걸린 자소가 ×1.1~1.3(노토는 1.84~2.0), 꺾인 획(ㅁ · ㄷ · ㄹ)의 세로 부분도 ×1.6으로 끌려 내려간다.',
    decision: '사용자 10-01 눈 ①: 프로브가 제자리를 짚었다.',
  },
  {
    id: 'error', title: '오차 하나', state: 'done', stateLabel: '닫힘 · 10-01',
    question: '참고 폰트와의 차이를 점수 하나로 어떻게 접을까',
    result: '글자마다 |세로 차| + |가로 차| + |속공간 차| × 0.5 + |상자 밀림 차| × 0.3/100u의 가중 합, 전체는 중앙값. 지금 제품 0.22 · B′ + ×1.5는 0.62. 막힘 개수는 점수 밖 — 노토 900을 같은 자로 잰 값과 견주는 상대 지표로 따로 본다.',
  },
  {
    id: 'fit900', title: '900 맞추기', state: 'now', stateLabel: '눈 ② 둘째 판',
    question: '어느 900이 더 좋은가 (눈 ② 월드컵)',
    result: '격자 65조합 1등(노토식: 가로 ×1.88 · 하한선 0.5 · 바닥 0.95, 오차 0.20)과 눈 고름(B′ + ×1.5)을 첫 판에 붙였다 — 사용자: 가독성으로 눈 고름 승, 다만 자소 간 굵기 차이가 커서 안 예쁘다. 둘째 판 = 그 위에 바닥만 올린다(없음 0.55 · 0.8 = 0.68 · 0.9 = 0.76, 노토 띠 0.75).',
    decision: '사용자 10-01 눈 ② 첫 판: 노토 따라가기보다 가독성(열림) — 눈 고름 승.',
  },
  {
    id: 'pattern', title: '패턴 100 · 중간', state: 'wait', stateLabel: '대기',
    question: '400 · 900에서 나온 값이 다른 굵기도 설명하나',
    result: '손잡이 값을 굵기의 함수로 놓고 100으로 바깥을 확인한다. 300 · 500 · 700은 맞추는 데 쓰지 않고 예측 검증용으로 남긴다. 다른 폰트에 다시 쓰는 부분이 여기다.',
  },
  {
    id: 'gate', title: '통과선 · 제품', state: 'wait', stateLabel: '눈 ③',
    question: '제품 굵기 막대에서 튀는 굵기가 있나 (눈 ③)',
    result: '남긴 글자 · 중간 굵기 오차가 통과선 아래일 때만 제품 화면에 붙인다. 그 뒤 네모꼴 범위와 굵기 한계를 표로 정한다.',
  },
]
/** 역추론으로 바뀌기 전 손잡이 단계(10-01 뒤집힘). 결정과 그림은 그대로 두고 아래 보관함에서 연다. */
const LEGACY_STEPS: Step[] = [
  {
    id: 'measure', title: '재는 법', state: 'done', stateLabel: '닫힘 · 10-01',
    question: '표가 눈으로 본 것과 맞나',
    result: '맞다. 진짜 잉크로 막힘 · 자소 안 닿음 · 자소 사이 닿음을 센다. 굵기 600에서 58%, 900에서 96%가 하나 이상 걸린다.',
    decision: '틈 기준을 고정 10u에서 획 두께의 1/4로(밭 · 받침 ㅌ이 붙어 보여서).',
  },
  {
    id: 'floor', title: '최소 속공간', state: 'done', stateLabel: '닫힘 · 10-01',
    question: '하한선 — 두께의 몇 배를 남길까',
    result: 'B′: 하한선 = max(24u, 굵어진 두께 × 0.5), 쌓인 가로줄기 틈(ㄹ · ㅌ)만 × 0.25. 하한선 아래로 가는 자소만 덜 굵다. 원래 좁던 틈과 벌어진 쐐기(ㅅ 다리 · ㅆ 안쪽 X)는 놓아 준다. 840 · 900 막힘 2,289 → 1,307자, 검기 65.4 → 59.2%. 실험실에만 있고 제품 화면엔 안 붙었다.',
    decision: '사용자 10-01: 글자별로 골라 를은 B′(쌓인 가로줄기만 낮게), 나머지는 0.5 — 쐐기는 놓아 준다.',
  },
  {
    id: 'horizontal', title: '가로줄기 비율', state: 'done', stateLabel: '닫힘 · 10-01',
    question: '굵을수록 가로줄기를 얼마나 덜 굵게',
    result: '굵기 900에서 가로줄기 ×1.5(세로줄기 ×1.95 그대로) — 획마다 누운 만큼 덜 굵게, 붓 모양 상관없이. ② B′와 합쳐 840 · 900 막힘 2,289 → 496자, 검기 65.4 → 54.0%(둥근 붓 기준). 를 · 밭 · 한의 ㅎ이 열린다. 실험실에만 있고 제품 화면엔 안 붙었다.',
    decision: '사용자 10-01 이상형 월드컵: ×1.5 > ×1.95, ×1.3 > ×1.7, 결승 ×1.5 > ×1.3.',
  },
  {
    id: 'between', title: '자소 사이', state: 'wait', stateLabel: '③ 임시판으로',
    question: '굵어질 때 이웃 자소 쪽으로 어떻게 자라게',
    result: '굵기 900에서 자소 사이 닿음 3,415자 — 셋 가운데 가장 크다. 역추론에서는 임시판(이웃을 마주 본 획만 덜 굵게)으로 900을 먼저 완성한다.',
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
  '가로 ×1.5가 획 단위 눕기 평균이라 꺾인 획(ㅁ · ㄷ · ㄹ)의 세로 부분까지 ×1.6으로 얇아진다(ㅣ는 ×1.95) — 역추론에서 토막 단위로 바꿀지.',
  '네모꼴 보정(세로줄기만 얇게, 폰트 전체)과 합칠지 — ③ 가로줄기 비율과 같이 본다.',
  '자소마다 굵기가 달라 한 글자 안에서 들쑥날쑥해 보이나 — 공통 문장 줄로 본다.',
  '얇아진 획이 칸 변에서 떨어지는 만큼 — 처음엔 안 맞추고 잰다.',
  '제품에 붙이기 전에 실효 스타일 입구를 한 곳으로 모으는 일(다른 세션)이 먼저다.',
]
/** ② 결정(B′): 하한선 0.5, 쌓인 가로줄기 틈 0.25. ③부터는 이걸 깔고 본다. */
const FLOOR_DECIDED = { floorRatio: 0.5, horizontalRatio: 0.25 } as const
/** ③ 가로줄기 후보: 400 대비 늘어난 두께 가운데 가로줄기가 받는 몫. 이름은 굵기 900에서의 가로줄기 배율(세로줄기는 ×1.95 그대로). */
// 노토(×1.88)는 지금(×1.95)과 5u 차이라 눈으로 안 갈렸다(10-01 사용자 "두 개 똑같음") — 눈에 보이는 간격(20~30u)으로 잡는다.
const HORIZONTAL_SHARES = [
  { share: 0.737, label: '가로 ×1.7' },
  { share: 0.526, label: '가로 ×1.5' },
  { share: 0.316, label: '가로 ×1.3' },
]

/**
 * 지금 사용자에게 묻는 것 하나. 실험실을 열면 질문 id마다 한 번 팝업으로 뜨고, 닫아도 지도 맨 위 카드로 남는다.
 * 답은 채팅으로 받는다 — 선택지를 누르면 답 문장이 복사된다. 물을 게 없으면 `null`.
 */
/** `floorRatio`: 선택지 그림을 그릴 하한선 비율. `undefined`면 그림 없이 글만. */
interface QuestionOption { label: string; detail: string; recommended?: boolean; floorRatio?: number; horizontalRatio?: number; horizontalShare?: number; minScale?: number }
/** `compare`가 있으면 그 조건들을 위에 줄줄이 그리고, 선택지는 그림 없는 답 단추(하나 고르기)다. 없으면 선택지끼리 이상형 월드컵. */
interface Question { id: string; step: StepId; title: string; body: string; options: QuestionOption[]; compare?: { label: string; condition: Omit<Condition, 'padding' | 'weight'> }[] }
/**
 * 눈 ② 둘째 판 — 바닥(자소 배율 하한). 첫 판(10-01)은 가독성으로 B′ + ×1.5가 숫자 맞춤(노토식)을 이겼다.
 * 남은 불만 = 자소 간 굵기 들쑥날쑥(호 ×1.1 ~ 포 ×1.96). 열림은 그대로 두고 바닥만 올려 본다.
 * 숫자(840 · 900): 바닥 없음 = 막힘 496 · 검기 54.0% · 띠 0.55 / 0.8 = 538 · 55.1% · 0.68 / 0.9 = 815 · 56.2% · 0.76(노토 0.75).
 */
const FIT900_QUESTION: Question = {
  id: 'fit900-floor-2026-10-01',
  step: 'fit900',
  title: '자소 굵기 바닥 — 어느 쪽이 나아요?',
  body: 'B′ + 가로 ×1.5 위에서, 하한선 때문에 깎이는 자소를 이 값 아래로 안 깎는다. 높을수록 한 글자 안 굵기가 고르고(예쁨), 대신 빽빽한 자소 속공간이 조금 닫힌다(막힘 ↑).',
  options: [
    { label: '바닥 0.8', floorRatio: 0.5, horizontalRatio: 0.25, horizontalShare: 0.526, minScale: 0.8, recommended: true, detail: '균형. 막힘 496 → 538, 굵기 띠 0.55 → 0.68.' },
    { label: '바닥 0.9', floorRatio: 0.5, horizontalRatio: 0.25, horizontalShare: 0.526, minScale: 0.9, detail: '노토만큼 고름(띠 0.76). 막힘 496 → 815.' },
    { label: '바닥 없음', floorRatio: 0.5, horizontalRatio: 0.25, horizontalShare: 0.526, detail: '첫 판 우승 그대로. 가장 열려 있지만 호 ×1.1 ~ 포 ×1.96으로 들쑥날쑥.' },
  ],
}
const QUESTION: Question | null = FIT900_QUESTION
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
/** ③ 가로줄기 후보 전수(B′ 깔고, 10-01 main 병합 뒤, 기본 폰트 = 둥근 붓). 칸 = 하나라도 · 속공간 막힘 · 검기. */
const HORIZONTAL_HEAD = ['가로 · 굵기', 'B′만 (×1.95)', ...HORIZONTAL_SHARES.map((item) => item.label)]
const HORIZONTAL_ROWS: string[][] = [
  ['840 · 600', '1,921 · 386 · 48.9%', '1,629 · 248 · 47.0%', '1,425 · 165 · 45.4%', '1,258 · 134 · 43.8%'],
  ['840 · 700', '2,815 · 677 · 53.3%', '2,325 · 386 · 50.9%', '1,967 · 245 · 48.8%', '1,674 · 148 · 46.7%'],
  ['840 · 900', '3,443 · 1,307 · 59.2%', '3,229 · 752 · 56.5%', '2,910 · 496 · 54.0%', '2,552 · 277 · 51.2%'],
  ['600 · 900', '3,387 · 1,273 · 58.0%', '3,186 · 884 · 55.5%', '2,981 · 758 · 53.3%', '2,703 · 547 · 50.9%'],
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
/** `horizontalShare`: ③ 가로줄기가 받는 두께 몫(하한선보다 먼저 얹는다). */
type Condition = { padding: Padding; weight: number; floorRatio?: number; horizontalRatio?: number; horizontalShare?: number; minScale?: number }

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
  const share = condition.horizontalShare ?? 1
  const kept = condition.floorRatio === undefined ? undefined : withCounterKeep(data, { fixed: FLOOR_FIXED, ratio: condition.floorRatio, horizontalRatio: condition.horizontalRatio }, share, condition.minScale)
  const ink = measureGlyphInk(kept?.data ?? withHorizontalShare(data, share))
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
/** 회색도 줄에 더 그릴 후보 하나. */
interface GrayCandidate { label: string; condition: Omit<Condition, 'padding' | 'weight'> }
function GraySentence({ resolver, padding, weight, candidates = [], version }: { resolver: GlyphPlacementResolver; padding: Padding; weight: number; candidates?: GrayCandidate[]; version: unknown[] }) {
  const conditions: { label: string; weight: number; condition?: GrayCandidate['condition'] }[] = [
    { label: '굵기 400', weight: 400 }, { label: `지금 ${weight}`, weight },
    ...candidates.map((item) => ({ label: item.label, weight, condition: item.condition })),
  ]
  const rows = useMemo(() => conditions.map((row) => ({ ...row, inks: GRAY_SENTENCE.map((char) => measureOf(resolver, char, { padding, weight: row.weight, ...row.condition }, undefined)) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolver, padding, weight, candidates.map((item) => item.label).join(), ...version])
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
function ConditionPreview({ context, label, floorRatio, horizontalRatio, horizontalShare, minScale, size, picks, onPick }: { context: PreviewContext; label: string; floorRatio?: number; horizontalRatio?: number; horizontalShare?: number; minScale?: number; size: number; picks: Picks; onPick: (char: string, label: string) => void }) {
  const { resolver, padding, weight, version } = context
  const inks = useMemo(() => ({
    gray: GRAY_SENTENCE.map((char) => measureOf(resolver, char, { padding, weight, floorRatio, horizontalRatio, horizontalShare, minScale }, undefined)),
    dense: QUESTION_CHARS.map((char) => measureOf(resolver, char, { padding, weight, floorRatio, horizontalRatio, horizontalShare, minScale }, undefined)),
  }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [resolver, padding, weight, floorRatio, horizontalRatio, horizontalShare, minScale, ...version])
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

/** 월드컵 한 판의 기록. */
interface CupMatch { left: number; right: number; winner: number; tie: boolean }
/** 이상형 월드컵: 후보 둘씩 붙여 이긴 쪽이 올라간다. 팝업과 지도 위 카드가 같은 진행을 본다. */
interface Cup { round: number[]; next: number[]; at: number; log: CupMatch[]; champion: number | null }
const startCup = (count: number): Cup => advanceCup({ round: Array.from({ length: count }, (_, index) => index), next: [], at: 0, log: [], champion: null })
/** 짝이 없는 마지막 후보는 그냥 올라가고, 판이 끝나면 다음 판을 연다. */
function advanceCup(cup: Cup): Cup {
  let { round, next, at } = cup
  for (;;) {
    if (at + 1 < round.length) return { ...cup, round, next, at }
    if (at < round.length) next = [...next, round[at]]
    if (next.length <= 1) return { ...cup, round, next, at: round.length, champion: next[0] ?? null }
    round = next
    next = []
    at = 0
  }
}

/** 두 그림이 서로 다른 넓이(u²) — 합친 넓이 − 겹친 넓이. */
function differenceArea(a: Measured | null, b: Measured | null): number {
  if (!a || !b) return 0
  const inkA = unionD(a.ink.parts.flatMap((part) => part.ink), FillRule.NonZero)
  const inkB = unionD(b.ink.parts.flatMap((part) => part.ink), FillRule.NonZero)
  return areaPathsD(unionD([...inkA, ...inkB], FillRule.NonZero)) - areaPathsD(intersectD(inkA, inkB, FillRule.NonZero))
}
/** 월드컵에서 크게 보여 줄 글자 수 — 가장 많이 달라진 것부터. */
const CUP_TOP = 4

/** 라이트박스 보기: 왼쪽만 · 겹쳐 · 오른쪽만. */
type LightboxMode = 'left' | 'both' | 'right'
const LIGHTBOX_LEFT = '#2f6fd6'
const LIGHTBOX_RIGHT = '#d64545'

/**
 * 두 후보를 한 자리에 포갠 글자. 겹쳐 볼 때는 같은 곳 = 연한 회색, 왼쪽에만 있는 곳 = 진한 파랑, 오른쪽에만 = 진한 빨강(차이만 진하게).
 * 한쪽만 볼 때는 검정.
 */
function LightboxGlyph({ left, right, mode, size }: { left: Measured | null; right: Measured | null; mode: LightboxMode; size: number }) {
  const inkOf = (measured: Measured | null): PathsD => measured ? unionD(measured.ink.parts.flatMap((part) => part.ink), FillRule.NonZero) : []
  const shapes = useMemo(() => {
    const a = inkOf(left)
    const b = inkOf(right)
    return { a, b, common: intersectD(a, b, FillRule.NonZero), onlyA: differenceD(a, b, FillRule.NonZero), onlyB: differenceD(b, a, FillRule.NonZero) }
  }, [left, right])
  return (
    <svg viewBox="0 -880 1000 1000" width={size} height={size} className={styles.glyph}>
      <g transform="scale(1,-1)">
        {mode === 'both'
          ? <><path d={pathOf(shapes.common)} fill="#c9c5bb" /><path d={pathOf(shapes.onlyA)} fill={LIGHTBOX_LEFT} /><path d={pathOf(shapes.onlyB)} fill={LIGHTBOX_RIGHT} /></>
          : <path d={pathOf(mode === 'left' ? shapes.a : shapes.b)} fill="#111" />}
      </g>
    </svg>
  )
}

/** 두 후보 견주기(라이트박스): 같은 자리에 포개고 위 장을 껐다 켰다. 위엔 회색도 문장, 아래엔 가장 많이 달라진 글자 넷. */
function CupPair({ question, context, left, right }: { question: Question; context: PreviewContext; left: number; right: number }) {
  const { resolver, padding, weight, version } = context
  const chars = useMemo(() => [...new Set([...GRAY_SENTENCE, ...CHARS, ...QUESTION_CHARS])], [])
  const inks = useMemo(() => [left, right].map((index) => {
    const option = question.options[index]
    return chars.map((char) => measureOf(resolver, char, { padding, weight, floorRatio: option.floorRatio, horizontalRatio: option.horizontalRatio, horizontalShare: option.horizontalShare, minScale: option.minScale }, undefined))
  }),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [question, left, right, resolver, padding, weight, ...version])
  const top = useMemo(() => chars.map((char, index) => ({ char, index, area: differenceArea(inks[0][index], inks[1][index]) }))
    .filter((item) => item.area > 1).sort((a, b) => b.area - a.area).slice(0, CUP_TOP), [chars, inks])
  const [mode, setMode] = useState<LightboxMode>('both')
  // 스페이스를 누르고 있으면 오른쪽, 떼면 왼쪽 — 껐다 켰다.
  useEffect(() => {
    const down = (event: KeyboardEvent) => { if (event.code === 'Space') { event.preventDefault(); setMode('right') } }
    const up = (event: KeyboardEvent) => { if (event.code === 'Space') { event.preventDefault(); setMode('left') } }
    window.addEventListener('keydown', down)
    window.addEventListener('keyup', up)
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up) }
  }, [])
  const glyph = (index: number, size: number) => <LightboxGlyph key={index} left={inks[0][index]} right={inks[1][index]} mode={mode} size={size} />
  return (
    <>
      <p className={styles.askLegend}>라이트박스: 두 후보를 같은 자리에 포갭니다. <b>겹쳐</b>에서 회색 = 둘이 같은 곳, <b style={{ color: LIGHTBOX_LEFT }}>파랑</b> = 왼쪽만 굵은 곳, <b style={{ color: LIGHTBOX_RIGHT }}>빨강</b> = 오른쪽만 굵은 곳. <b>스페이스를 누르고 있으면 오른쪽, 떼면 왼쪽</b>(껐다 켰다). 아래 큰 글자 = 가장 많이 달라진 {top.length}자{top.length ? ` (${top.map((item) => item.char).join(' ')})` : ''}.</p>
      <span className={styles.lightboxModes} role="group" aria-label="라이트박스">
        {(['left', 'both', 'right'] as const).map((item) => <button key={item} type="button" aria-pressed={mode === item} onClick={() => setMode(item)} data-testid={`counter-lightbox-${item}`}>{item === 'left' ? '왼쪽' : item === 'right' ? '오른쪽' : '겹쳐'}</button>)}
      </span>
      <div className={styles.cupSide}>
        <span className={styles.cupName}>{mode === 'both' ? '겹쳐 — 회색 같음 · 파랑 왼쪽만 · 빨강 오른쪽만' : mode === 'left' ? '왼쪽' : '오른쪽'}</span>
        <span className={styles.cupRow}>{GRAY_SENTENCE.map((char) => glyph(chars.indexOf(char), 64))}</span>
        <span className={styles.cupRow}>{top.map(({ index }) => glyph(index, 150))}</span>
      </div>
    </>
  )
}

/** 월드컵 진행 화면. 이름은 끝날 때까지 가린다. */
function CupView({ question, context, cup, onCup, onCopy, copied }: { question: Question; context: PreviewContext; cup: Cup; onCup: (cup: Cup) => void; onCopy: (text: string, note: string) => void; copied: string | null }) {
  const total = question.options.length
  const recommended = question.options.findIndex((option) => option.recommended)
  const pick = (winner: number, tie: boolean) => {
    const [left, right] = [cup.round[cup.at], cup.round[cup.at + 1]]
    onCup(advanceCup({ ...cup, next: [...cup.next, winner], at: cup.at + 2, log: [...cup.log, { left, right, winner, tie }] }))
  }
  const labelOf = (index: number) => question.options[index].label
  if (cup.champion !== null) {
    const log = cup.log.map((match) => `${labelOf(match.winner)} > ${labelOf(match.winner === match.left ? match.right : match.left)}${match.tie ? '(비슷)' : ''}`).join(', ')
    const text = `${question.title.replace(/\?$/, '')}: 월드컵 우승 ${labelOf(cup.champion)} (${log})`
    return (
      <div className={styles.cupDone}>
        <span>우승</span>
        <strong>{labelOf(cup.champion)}</strong>
        <small>{question.options[cup.champion].detail}</small>
        <small>{log}</small>
        <span className={styles.cupActions}>
          <button type="button" data-testid="counter-cup-copy" onClick={() => onCopy(text, '월드컵 결과')}>결과 복사</button>
          <button type="button" onClick={() => onCup(startCup(total))}>다시 하기</button>
          {copied && <small>복사했어요. 채팅에 붙여 넣어 주세요.</small>}
        </span>
      </div>
    )
  }
  const left = cup.round[cup.at]
  const right = cup.round[cup.at + 1]
  const tieWinner = left === recommended || right === recommended ? recommended : left
  const stage = cup.round.length <= 2 ? '결승' : `${cup.round.length}강 ${cup.at / 2 + 1}/${Math.floor(cup.round.length / 2)}`
  return (
    <div className={styles.cup} data-testid="counter-cup">
      <span className={styles.cupStage}>이상형 월드컵 · {stage} — 둘 중 나은 쪽을 고르세요</span>
      <CupPair question={question} context={context} left={left} right={right} />
      <span className={styles.cupActions}>
        <button type="button" data-testid="counter-cup-left" onClick={() => pick(left, false)}>← 왼쪽이 낫다</button>
        <button type="button" onClick={() => pick(tieWinner, true)}>차이 모르겠다</button>
        <button type="button" data-testid="counter-cup-right" onClick={() => pick(right, false)}>오른쪽이 낫다 →</button>
      </span>
    </div>
  )
}

/** 질문 카드. `popup`이면 화면 가운데 덮개로 띄운다. 선택지마다 그 조건의 글자 그림을 붙이고, 글자 하나하나를 고를 수 있다. */
function QuestionCard({ question, context, picks, onPick, cup, onCup, popup = false, onShow, onClose }: { question: Question; context: PreviewContext | null; picks: Picks; onPick: (char: string, label: string) => void; cup: Cup; onCup: (cup: Cup) => void; popup?: boolean; onShow: () => void; onClose?: () => void }) {
  const size = popup ? 46 : 38
  const [showAll, setShowAll] = useState(false)
  const [copied, setCopied] = useState<string | null>(null)
  const copy = (text: string, note: string) => { void navigator.clipboard?.writeText(text).then(() => setCopied(note), () => setCopied(note)) }
  const answer = (label: string) => copy(`${question.title.replace(/\?$/, '')}: ${label}`, label)
  const chars = [...new Set([...GRAY_SENTENCE, ...QUESTION_CHARS])]
  const picked = chars.filter((char) => picks[char])
  const summary = picked.map((char) => `${char} ${picks[char]}`).join(' · ')
  const hasPreview = context && !question.compare && question.options.some((option) => option.floorRatio !== undefined || option.horizontalShare !== undefined)
  const card = (
    <div className={popup ? styles.askPopup : styles.ask} role={popup ? 'dialog' : 'region'} aria-modal={popup || undefined} aria-label="AI가 묻는 것" data-testid={popup ? 'counter-question-popup' : 'counter-question'}>
      <span className={styles.askTag}>질문 · 답해 주세요</span>
      <strong>{question.title}</strong>
      {hasPreview && !showAll && context && <CupView question={question} context={context} cup={cup} onCup={onCup} onCopy={copy} copied={copied} />}
      {hasPreview && <button type="button" className={styles.cupToggle} onClick={() => setShowAll(!showAll)}>{showAll ? '← 둘씩 고르기로' : '후보 전부 한꺼번에 보기'}</button>}
      {(showAll || !hasPreview) && <p>{question.body}</p>}
      {question.compare && context && <div className={styles.askBase}>
        {question.compare.map((row) => <div key={row.label} className={styles.askCompareRow}>
          <b>{row.label}</b>
          <ConditionPreview context={context} label={row.label} {...row.condition} size={popup ? 60 : 44} picks={{}} onPick={() => undefined} />
        </div>)}
      </div>}
      {question.compare && <div className={styles.askChoices}>
        {question.options.map((option) => <button key={option.label} type="button" data-rec={option.recommended || undefined} onClick={() => answer(option.label)}>{option.label}{option.recommended ? ' · 추천' : ''}</button>)}
      </div>}
      {showAll && hasPreview && <p className={styles.askLegend}><b>글자마다 고르기:</b> 카드마다 괜찮은 글자가 달라도 된다. 글자마다 가장 나은 카드의 그 글자를 누른다(같은 글자는 한 카드만). 다 고르면 아래 <b>고른 것 복사</b>. <b>회색도</b> = 빽빽한 · 성긴 글자를 섞은 문장(진하기가 고른가), <b>속공간</b> = 막히기 쉬운 글자(흰 틈이 살아 있나).</p>}
      {showAll && hasPreview && <div className={styles.askBase}>
        <small>{BASE_LABEL} · 보정 없음 (가로 {Math.round((1 - context.padding.left - context.padding.right) * 1000)} · 굵기 {context.weight})</small>
        <ConditionPreview context={context} label={BASE_LABEL} size={size} picks={picks} onPick={onPick} />
      </div>}
      {(showAll || !hasPreview) && !question.compare && <div className={styles.askOptions}>
        {question.options.map((option) => (
          <div key={option.label} className={styles.askOption} data-rec={option.recommended || undefined}>
            <b>{option.label}{option.recommended ? ' · 추천' : ''}</b>
            {context && (option.floorRatio !== undefined || option.horizontalShare !== undefined) && <ConditionPreview context={context} label={option.label} floorRatio={option.floorRatio} horizontalRatio={option.horizontalRatio} horizontalShare={option.horizontalShare} minScale={option.minScale} size={size} picks={picks} onPick={onPick} />}
            <small>{option.detail}</small>
            <button type="button" onClick={() => answer(option.label)}>이걸로 통째로</button>
          </div>
        ))}
      </div>}
      <div className={styles.askFoot}>
        <span>{question.compare ? (copied ? `“${copied}” 복사했어요. 채팅에 붙여 넣어 주세요.` : '하나를 누르면 답이 복사돼요. 채팅에 붙여 넣어 주세요.') : !showAll && hasPreview ? '' : copied ? `“${copied}” 복사했어요. 채팅에 붙여 넣어 주세요.` : picked.length ? `고른 것 ${picked.length}/${chars.length}: ${summary}` : '글자를 눌러 고르거나, 카드 하나를 통째로 고르세요.'}</span>
        {picked.length > 0 && <button type="button" data-testid="counter-question-copy" onClick={() => copy(`${question.title.replace(/\?$/, '')} — 글자별: ${summary}`, `글자별 ${picked.length}자`)}>고른 것 복사</button>}
        <button type="button" onClick={() => { onShow(); onClose?.() }}>그림 보며 고르기</button>
        {popup && <button type="button" onClick={onClose}>닫기</button>}
      </div>
    </div>
  )
  return popup ? <div className={styles.askBackdrop} onClick={(event) => { if (event.target === event.currentTarget) onClose?.() }}>{card}</div> : card
}

/** 단계마다 회색도 줄에 더 그릴 후보. */
function grayCandidatesOf(step: StepId): GrayCandidate[] {
  if (step === 'floor') return [{ label: 'B′ (결정)', condition: FLOOR_DECIDED }]
  if (step === 'horizontal') return [{ label: 'B′만', condition: FLOOR_DECIDED }, ...HORIZONTAL_SHARES.map((item) => ({ label: item.label, condition: { ...FLOOR_DECIDED, horizontalShare: item.share } }))]
  return []
}

/** ③ 가로줄기 후보별. ② B′를 깐다. 숫자 = 하한선 때문에 덜 굵어진 자소 배율. */
function HorizontalPanel({ resolver, references, padding, weight, version }: { resolver: GlyphPlacementResolver; references: Map<string, GlyphReference>; padding: Padding; weight: number; version: unknown[] }) {
  const columns: { label: string; condition: Omit<Condition, 'padding' | 'weight'> }[] = [
    { label: '지금(보정 없음)', condition: {} },
    { label: 'B′만', condition: FLOOR_DECIDED },
    ...HORIZONTAL_SHARES.map((item) => ({ label: item.label, condition: { ...FLOOR_DECIDED, horizontalShare: item.share } })),
  ]
  const cells = useMemo(() => CHARS.map((char) => columns.map(({ condition }) => measureOf(resolver, char, { padding, weight, ...condition }, references.get(char)))),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [resolver, references, padding, weight, ...version])
  return (
    <>
      <p className={styles.look}><b>볼 것:</b> 가로줄기가 쌓인 를 · 밭 · 뷁의 흰 틈이 살아나는지, 가로줄기만 너무 가늘어 세로 줄무늬처럼 보이지 않는지. 숫자 = 하한선 때문에 더 덜 굵어진 자소 배율(가로줄기를 덜 굵게 하면 이 숫자가 1로 돌아온다).</p>
      <Legend />
      <div className={styles.scroll}>
        <table className={styles.grid}>
          <thead><tr><th />{columns.map(({ label }) => <th key={label}>{label}</th>)}</tr></thead>
          <tbody>{CHARS.map((char, row) => <tr key={char}><th>{char}</th>{cells[row].map((cell, column) => <td key={column}>{cell && <><InkGlyph ink={cell.ink} size={100} /><Verdict char={char} verdict={cell.verdict} scales={cell.scales} /></>}</td>)}</tr>)}</tbody>
        </table>
      </div>
      <h3>전수 — 하나라도 · 속공간 막힘 · 검기 (② B′ 깔고)</h3>
      <Table head={HORIZONTAL_HEAD} rows={HORIZONTAL_ROWS} />
    </>
  )
}

const Pending = ({ text }: { text: string }) => <p className={styles.pendingNote}>{text}</p>

/** ① 같은 자 그림 데이터(`build_weight_probe_lab.py`가 만든 `weightProbeLab.json`). */
interface ProbeCell { box: { left: number; top: number; right: number; bottom: number }; probes: Record<'horizontal' | 'vertical', { position: number; intervals: [number, number][] }[]>; component: string; rest?: string; full?: string }
interface ProbeSide { weights: Record<string, ProbeCell | null>; vertical900: number | null; horizontal900: number | null }
const PROBE_LAB = weightProbeLab as unknown as { weights: string[]; pooled900: Record<string, { ours: number | null; reference: number | null }>; characters: Record<string, { ours: ProbeSide; reference: ProbeSide }> }
/** pooled 표에서 보여 줄 항목과 한글 이름. */
const PROBE_POOLED_LABELS: [string, string][] = [
  ['verticalThicknessRatio', '세로줄기 두께 ×'], ['horizontalThicknessRatio', '가로줄기 두께 ×'],
  ['counterRatioAcrossX', '속공간(좌우) ×'], ['counterRatioAcrossY', '속공간(위아래) ×'],
  ['outerEdgeGrowthShare', '바깥 변 몫'], ['boxWidthRatio', '상자 너비 ×'], ['boxHeightRatio', '상자 높이 ×'],
]

/** 윤곽 위에 프로브 선(파랑)과 그 선이 읽은 잉크 구간(빨강)을 긋는다. 좌표는 JSON과 같은 y-아래 틀이라 그대로 그린다. */
function ProbeGlyph({ cell, size }: { cell: ProbeCell; size: number }) {
  const pad = 30
  return (
    <svg viewBox="0 0 1000 1000" width={size} height={size} className={styles.glyph}>
      {cell.full && <path d={cell.full} fill="#e4e1d8" />}
      {cell.rest && <path d={cell.rest} fill="#e4e1d8" />}
      <path d={cell.component} fill="#b9b4a6" />
      {cell.probes.horizontal.map((row) => <g key={`h${row.position}`}>
        <line x1={cell.box.left - pad} x2={cell.box.right + pad} y1={row.position} y2={row.position} stroke="#2f6fd6" strokeWidth={2.5} />
        {row.intervals.map(([start, end], index) => <line key={index} x1={start} x2={end} y1={row.position} y2={row.position} stroke="#d64545" strokeWidth={10} />)}
      </g>)}
      {cell.probes.vertical.map((row) => <g key={`v${row.position}`}>
        <line y1={cell.box.top - pad} y2={cell.box.bottom + pad} x1={row.position} x2={row.position} stroke="#2f6fd6" strokeWidth={2.5} />
        {row.intervals.map(([start, end], index) => <line key={index} y1={start} y2={end} x1={row.position} x2={row.position} stroke="#d64545" strokeWidth={10} />)}
      </g>)}
    </svg>
  )
}

/** ① 같은 자 — 눈 ①: 프로브(파랑 선)가 읽은 구간(빨강)이 줄기를 짚었는지 본다. */
function ProbePanel() {
  const chars = Object.keys(PROBE_LAB.characters)
  const [copied, setCopied] = useState<string | null>(null)
  const answer = (text: string, note: string) => { void navigator.clipboard?.writeText(text).then(() => setCopied(note), () => setCopied(note)) }
  const fmt = (value: number | null | undefined) => value == null ? '−' : value.toFixed(2)
  return (
    <>
      <div className={styles.ask} role="region" aria-label="AI가 묻는 것" data-testid="counter-ruler-question">
        <span className={styles.askTag}>질문 · 답해 주세요 (눈 ①)</span>
        <strong>파란 선이 지나간 자리의 빨간 구간이 줄기(잉크)를 제대로 짚고 있나요?</strong>
        <p>빨간 구간이 잉크 밖을 짚거나, 줄기를 건너뛴 칸이 있으면 `아니오`를 누르고 채팅에 그 글자를 적어 주세요. 꺾인 곳 · 동그라미를 지나는 선은 구간이 길어도 됩니다(숫자 쪽에서 거릅니다).</p>
        <div className={styles.askChoices}>
          <button type="button" data-rec onClick={() => answer('눈 ① 같은 자: 프로브가 제자리를 짚었다 (예)', '예')}>예 — 제자리를 짚었다</button>
          <button type="button" onClick={() => answer('눈 ① 같은 자: 아니오 — 이상한 칸: ', '아니오')}>아니오 — 이상한 칸이 있다</button>
        </div>
        <div className={styles.askFoot}><span>{copied ? `“${copied}” 복사했어요. 채팅에 붙여 넣어 주세요.` : '하나를 누르면 답이 복사돼요.'}</span></div>
      </div>
      <p className={styles.look}><b>볼 것:</b> 파랑 = 프로브 선(첫닿자 상자의 20 · 35 · 50 · 65 · 80% 자리), 빨강 = 그 선이 읽은 잉크 구간. 구간 폭이 곧 줄기 두께, 구간 사이가 속공간이다. 양쪽(우리 · 노토)이 같은 자리를 짚어야 숫자를 견줄 수 있다.</p>
      <div className={styles.scroll}>
        <table className={styles.grid}>
          <thead><tr><th />{PROBE_LAB.weights.map((weight) => <th key={`o${weight}`}>우리 {weight}</th>)}{PROBE_LAB.weights.map((weight) => <th key={`r${weight}`}>노토 {weight}</th>)}<th>세로 · 가로 ×900<br /><small>우리 / 노토 (거른 뒤)</small></th></tr></thead>
          <tbody>{chars.map((char) => {
            const row = PROBE_LAB.characters[char]
            return (
              <tr key={char}>
                <th>{char}</th>
                {PROBE_LAB.weights.map((weight) => <td key={`o${weight}`}>{row.ours.weights[weight] && <ProbeGlyph cell={row.ours.weights[weight]!} size={130} />}</td>)}
                {PROBE_LAB.weights.map((weight) => <td key={`r${weight}`}>{row.reference.weights[weight] && <ProbeGlyph cell={row.reference.weights[weight]!} size={130} />}</td>)}
                <td><small>{fmt(row.ours.vertical900)} / {fmt(row.reference.vertical900)}<br />{fmt(row.ours.horizontal900)} / {fmt(row.reference.horizontal900)}</small></td>
              </tr>
            )
          })}</tbody>
        </table>
      </div>
      <h3>굵기 900 ÷ 400 — 전체 중앙값 (우리 지금 제품 · 노토, 같은 자)</h3>
      <Table head={['항목', '우리', '노토']} rows={PROBE_POOLED_LABELS.map(([key, label]) => {
        const row = PROBE_LAB.pooled900[key]
        return [label, fmt(row?.ours), fmt(row?.reference)]
      })} />
      <p className={styles.look}>읽기: 세로 ×1.95 = 노토와 같다. 가로도 ×1.96 대 ×1.88 — 두께 자체는 이미 노토인데, 노토는 빽빽한 자소만 조금 덜 굵게(ㅃ 1.84) 그리고 속공간이 실처럼 남는다. B′ + 가로 ×1.5를 얹으면 우리는 세로 ×1.69 · 하한선 걸린 자소 ×1.1~1.3으로 노토보다 많이 얇다 — 이 틈을 ③ 900 맞추기가 숫자로 줄인다.</p>
    </>
  )
}

export function CounterProgressMap() {
  const [selected, setSelected] = useState<StepId>(() => STEPS.find((step) => step.state === 'now')?.id ?? 'ruler')
  const padding = useLayoutStore((state) => state.globalPadding)
  const storedWeight = useGlobalStyleStore((state) => state.style.weight)
  const weight = storedWeight > 400 ? storedWeight : FALLBACK_WEIGHT
  const width = Math.round((1 - padding.left - padding.right) * FONT_SPACE.width)
  const resolver = usePlacementResolver()
  const version = useFontVersion()
  const references = useReferences(resolver, version)
  const step = [...STEPS, ...LEGACY_STEPS].find((item) => item.id === selected)!
  const [picks, setPicks] = useState<Picks>({})
  const [cup, setCup] = useState<Cup>(() => startCup(QUESTION?.options.length ?? 0))
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
      {QUESTION && <QuestionCard question={QUESTION} context={previewContext} picks={picks} onPick={pick} cup={cup} onCup={setCup} onShow={showQuestionStep} />}
      {QUESTION && popupOpen && <QuestionCard question={QUESTION} context={previewContext} picks={picks} onPick={pick} cup={cup} onCup={setCup} popup onShow={showQuestionStep} onClose={closePopup} />}
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
        {resolver && <GraySentence resolver={resolver} padding={padding} weight={weight} candidates={grayCandidatesOf(selected)} version={version} />}
        {(selected === 'floor' || selected === 'horizontal' || selected === 'split') && <p className={styles.condition}>그림 조건: 가로 {width} · 굵기 {weight}{storedWeight <= 400 ? ` (지금 굵기 ${storedWeight}는 볼 게 없어 ${FALLBACK_WEIGHT}로 그림)` : ''} — 위 막대로 바꾼다.</p>}
        {selected === 'ruler' ? <ProbePanel />
          : selected === 'error' ? <Pending text="아직 안 함. ① 자가 확인되면 글자마다 두께 · 속공간 · 상자 밀림 · 검기 차이를 점수 하나로 접는다." />
          : selected === 'fit900' ? <Pending text="아직 안 함. ② 점수가 생기면 손잡이를 격자로 훑어 900을 맞추고, 월드컵(숫자 맞춤 대 B′ + ×1.5)으로 묻는다." />
          : selected === 'pattern' ? <Pending text="아직 안 함. ③에서 900이 정해지면 100으로 바깥을 확인하고, 중간 굵기는 예측 검증용으로 남긴다." />
          : selected === 'gate' ? <Pending text="아직 안 함. 통과선 아래로 들어오면 제품 굵기 막대로 확인한다(눈 ③)." />
          : selected === 'table' ? <LimitsPanel />
          : selected === 'horizontal' && !resolver ? <p className={styles.condition}>모델 불러오는 중…</p>
            : selected === 'horizontal' && resolver ? <HorizontalPanel resolver={resolver} references={references} padding={padding} weight={weight} version={version} />
            : selected === 'between' ? <Pending text="역추론에서는 임시판(이웃을 마주 본 획만 덜 굵게)으로 들어간다. ①의 그림에서 `사이` 글씨가 붙은 칸을 본다." />
              : !resolver ? <p className={styles.condition}>모델 불러오는 중…</p>
                : selected === 'measure' ? <MeasurePanel resolver={resolver} references={references} version={version} />
                  : selected === 'split' ? <PushPanel resolver={resolver} padding={padding} weight={weight} version={version} />
                    : <FloorPanel resolver={resolver} references={references} padding={padding} weight={weight} version={version} />}
      </div>

      <details className={styles.open}>
        <summary>지난 손잡이 단계 (10-01 뒤집힘 전 — 결정은 그대로, 그림 보관)</summary>
        <ol className={styles.steps}>
          {LEGACY_STEPS.map((item, index) => (
            <li key={item.id}>
              <button type="button" aria-pressed={item.id === selected} data-state={item.state} onClick={() => setSelected(item.id)} data-testid={`counter-step-${item.id}`}>
                <span className={styles.stepTop}><em>{index + 1}</em><strong>{item.title}</strong><small>{item.stateLabel}</small></span>
                <span className={styles.question}>판단 · {item.question}</span>
              </button>
            </li>
          ))}
        </ol>
      </details>

      <details className={styles.open}>
        <summary>미결정 {OPEN_QUESTIONS.length}</summary>
        <ul>{OPEN_QUESTIONS.map((item) => <li key={item}>{item}</li>)}</ul>
      </details>
    </section>
  )
}
