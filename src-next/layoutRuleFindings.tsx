import { LAYOUT_RULE_LABEL, LAYOUT_RULE_ORDER } from '../src/services/layoutRules'
import type { LayoutRuleId, LayoutRuleParams } from '../src/services/layoutRules'
import { BRANCH_INSET_BY_CHO, CHO_GAP, CHO_TARGET, JONG_GAP_OFFSET, JONG_LEFT_BY_JUNG, JONG_RIGHT_BY_JUNG, JONG_TARGET, JUNG_TARGET, PILLAR_BOTTOM_NO_FINAL } from '../src/services/layoutRuleTargets'
import styles from './LayoutRulesLabPage.module.css'

/**
 * "우리가 알아낸 규칙" 판. 규칙마다 무엇을 알아냈는지, 근거, 그 규칙 하나만 껐을 때(기본값에서 꺼진 규칙은 켰을 때) 전수 588자 박스 점수를 보여 준다.
 * 박스 점수 = 부품별 잉크 바깥 네모 네 변이 모델과 어긋난 최대치(em)의 가운데값, 그리고 ±0.02 안에 든 글자 수.
 * 숫자는 2026-11-08 전수 측정을 손으로 옮긴 것이다 — 표본이나 규칙이 바뀌면 다시 재야 한다.
 */

interface Finding {
  origin: '처음 규칙' | '11-08 찾음'
  found: string
  evidence: string
  /** 이 규칙 하나만 바꿨을 때 전수 박스 점수 가운데값과 ±0.02 안 글자 수. */
  toggled: { median: number; within: number }
}

const SAMPLE = 588
const MEASURED_ALL = { median: 0.015, within: 435 }
const MEASURED_NONE = { median: 0.134, within: 0 }
/** 모양 갈래 규칙(11-08 아침)의 박스 점수. 같은 표본. */
const MEASURED_SHAPE_RULES = { median: 0.042, within: 30 }

const FINDINGS: Record<LayoutRuleId, Finding> = {
  faces: { origin: '처음 규칙', found: '스키마 상자는 중심선 상자라 잉크가 반 두께만큼 밖으로 나온다. 잉크 바깥면이 상자 변에 오게 읽는다.', evidence: '모델 상자는 잉크 바깥면 기준', toggled: { median: 0.016, within: 406 } },
  choTable: { origin: '11-08 찾음', found: '첫닿자 왼 · 오른 · 위는 글자마다 거의 같다 — 어떤 홀자 · 받침과 만나도. 기둥 둘인 홀자(ㅐ ㅒ ㅔ ㅖ) 옆에서만 폭이 준다. 받침이 없으면 아래도 정해진다.', evidence: `19자 표(아래). 두 기둥 옆 폭 ×${CHO_TARGET['ㅁ'].twoStemScale}(ㅁ)~×${CHO_TARGET['ㅇ'].twoStemScale}(ㅇ)`, toggled: { median: 0.071, within: 4 } },
  jungTable: { origin: '11-08 찾음', found: '홀자 오른면은 홀자별로 고정(기둥 줄). 왼면은 둘로 갈린다 — ㅏ ㅑ ㅐ ㅒ ㅣ는 홀자별 고정, 왼가지 홀자 ㅓ ㅕ ㅔ ㅖ는 첫닿자 오른면에 기댄다(오른쪽이 열린 ㄴ 안으로 깊이, 닫힌 ㄹ은 틈을 두고). 첫닿자가 쌍자음이면 조금 안쪽.', evidence: `ㅣ 오른면 ${JUNG_TARGET['ㅣ'].right} · ㅏ ${JUNG_TARGET['ㅏ'].right} / 왼가지 파고듦 ㄴ ${BRANCH_INSET_BY_CHO['ㄴ']} · ㄱ ${BRANCH_INSET_BY_CHO['ㄱ']} · ㄹ +${BRANCH_INSET_BY_CHO['ㄹ']}`, toggled: { median: 0.095, within: 63 } },
  jongTable: { origin: '11-08 찾음', found: '받침 네 변은 받침별로 고정. 왼 · 오른만 홀자를 따라 치우친다 — ㅏ ㅑ 옆은 안쪽으로, ㅐ ㅔ 옆은 바깥으로.', evidence: `27자 표(아래). 오른면 치우침 ㅏ ${JONG_RIGHT_BY_JUNG['ㅏ']} · ㅐ +${JONG_RIGHT_BY_JUNG['ㅐ']}`, toggled: { median: 0.063, within: 0 } },
  choBottom: { origin: '11-08 찾음', found: '첫닿자 아래는 받침 윗면에서 틈만큼 위다. 틈은 받침이 아니라 첫닿자가 정한다 — 꼬리 있는 ㄱ ㅋ은 받침 가까이 내려오고, 네모난 ㅁ ㄴ ㄷ은 두께 하나 반쯤 띈다. 받침 쪽은 꼭지 솟은 ㅎ ㅀ ㅊ이 틈을 줄이는 잔차만.', evidence: `두께 배수: ㅋ ${CHO_GAP['ㅋ']} · ㄱ ${CHO_GAP['ㄱ']} · ㅅ ${CHO_GAP['ㅅ']} · ㅇ ${CHO_GAP['ㅇ']} · ㅁ ${CHO_GAP['ㅁ']} / 받침 잔차 ㅎ ${JONG_GAP_OFFSET['ㅎ']} · ㄱ +${JONG_GAP_OFFSET['ㄱ']}`, toggled: { median: 0.031, within: 153 } },
  pillar: { origin: '처음 규칙', found: '홀자 기둥은 몸 위에서 시작해 받침 윗면 근처에서 끝난다. 끝 높이는 받침별 — 오른 위가 빈 ㄴ ㅅ이면 그 빈자리로 받침 윗면보다 아래까지, 보통은 조금 위. 받침이 없으면 몸 아래 가까이.', evidence: `받침 윗면 대비 ㄴ +${JONG_TARGET['ㄴ'].pillarReach} · ㅅ +${JONG_TARGET['ㅅ'].pillarReach} · ㄱ ${JONG_TARGET['ㄱ'].pillarReach} · ㅁ ${JONG_TARGET['ㅁ'].pillarReach} / 받침 없음 ${PILLAR_BOTTOM_NO_FINAL}`, toggled: { median: 0.03, within: 179 } },
  gap: { origin: '처음 규칙', found: '획 사이 최소 틈(두께 × k). 잉크 바깥 네모로 재서 ㅎ–ㅓ처럼 서로 파고드는 짝을 잘못 밀어낸다. 표 규칙이 자리를 다 정한 뒤라 켜면 오히려 멀어진다 — 기본은 꺼 둔다.', evidence: '켜면 ±0.02 안 435 → 264', toggled: { median: 0.023, within: 264 } },
}

const n3 = (value: number) => value.toFixed(3).replace(/^(-?)0/, '$1')
const signed = (value: number) => (value > 0 ? '+' : '') + n3(value)
const score = ({ median, within }: { median: number; within: number }) => `${n3(median)} · ${within}자`

export function LayoutRuleFindings({ params }: { params: LayoutRuleParams }) {
  return <section className={styles.findings} data-testid="layout-rule-findings">
    <h3>우리가 알아낸 규칙</h3>
    <p className={styles.note}>
      전수 {SAMPLE}자 박스 점수(네 변 최대 차이 가운데값 · ±0.02 안 글자 수): 규칙 끔 {score(MEASURED_NONE)} → 모양 갈래 규칙 {score(MEASURED_SHAPE_RULES)} → 지금 표 규칙 {score(MEASURED_ALL)}.
      "하나 끄면"은 그 규칙만 바꿨을 때의 값으로, 나빠질수록 그 규칙이 많이 일한다.
      목표값은 노토 몸통(.05 · .89 · .05 · .96)에서 지금 모델이 그린 잉크의 자모별 가운데값(4788자)이다 — 노토 윤곽을 직접 잰 것이 아니다.
    </p>
    <table className={styles.findingTable}>
      <thead><tr><th>규칙</th><th>상태</th><th>알아낸 것</th><th>근거(노토 em)</th><th>하나 끄면</th></tr></thead>
      <tbody>
        {LAYOUT_RULE_ORDER.map((rule) => {
          const finding = FINDINGS[rule]
          return <tr key={rule} data-new={finding.origin === '11-08 찾음' || undefined}>
            <th>{LAYOUT_RULE_LABEL[rule]}<small>{finding.origin}</small></th>
            <td>{params.rules[rule] ? '켬' : '끔'}</td>
            <td>{finding.found}</td>
            <td>{finding.evidence}</td>
            <td>{rule === 'gap' ? '켜면 ' : ''}{score(finding.toggled)}</td>
          </tr>
        })}
      </tbody>
    </table>
    <div className={styles.findingTables}>
      <table className={styles.findingTable}>
        <caption>첫닿자 표 — 네 변 · 두 기둥 옆 폭 비율 · 받침과의 틈(두께 배수) · 왼가지 파고듦</caption>
        <thead><tr><th>첫닿자</th><th>왼</th><th>오른</th><th>위</th><th>×두 기둥</th><th>아래(받침 없음)</th><th>틈</th><th>파고듦</th></tr></thead>
        <tbody>{Object.entries(CHO_TARGET).map(([cho, t]) => <tr key={cho}><th>{cho}</th><td>{n3(t.left)}</td><td>{n3(t.right)}</td><td>{n3(t.top)}</td><td>{t.twoStemScale}</td><td>{n3(t.bottomNoFinal)}</td><td>{CHO_GAP[cho]}</td><td>{signed(BRANCH_INSET_BY_CHO[cho])}</td></tr>)}</tbody>
      </table>
      <table className={styles.findingTable}>
        <caption>홀자 표 — 왼 · 오른 · 쌍자음 옆 왼 · 받침 왼 · 오른면 치우침</caption>
        <thead><tr><th>홀자</th><th>왼</th><th>오른</th><th>왼(쌍자음 옆)</th><th>받침 왼</th><th>받침 오른</th></tr></thead>
        <tbody>{Object.entries(JUNG_TARGET).map(([jung, t]) => <tr key={jung}><th>{jung}</th><td>{n3(t.left)}</td><td>{n3(t.right)}</td><td>{n3(t.leftNextToDouble)}</td><td>{signed(JONG_LEFT_BY_JUNG[jung])}</td><td>{signed(JONG_RIGHT_BY_JUNG[jung])}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={6}>ㅓ ㅕ ㅔ ㅖ의 왼면은 표 대신 첫닿자 오른면 + 파고듦(첫닿자 표)</td></tr></tfoot>
      </table>
      <table className={styles.findingTable}>
        <caption>받침 표 — 네 변 · 기둥 끝(받침 윗면 대비, + = 아래) · 첫닿자 틈 잔차</caption>
        <thead><tr><th>받침</th><th>왼</th><th>오른</th><th>위</th><th>아래</th><th>기둥 끝</th><th>틈 잔차</th></tr></thead>
        <tbody>{Object.entries(JONG_TARGET).map(([jong, t]) => <tr key={jong}><th>{jong}</th><td>{n3(t.left)}</td><td>{n3(t.right)}</td><td>{n3(t.top)}</td><td>{n3(t.bottom)}</td><td>{signed(t.pillarReach)}</td><td>{signed(JONG_GAP_OFFSET[jong])}</td></tr>)}</tbody>
      </table>
    </div>
  </section>
}
