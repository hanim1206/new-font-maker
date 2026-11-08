import {
  CHO_SHAPE_LABEL, CHO_SHAPE_TARGET, CHO_TAIL, CHO_TAIL_DROP, JONG_BOTTOM, JONG_SHAPE_LABEL, JONG_SHAPE_TOP, JONG_TOP_OVERRIDE,
  LAYOUT_RULE_LABEL, LAYOUT_RULE_ORDER, PILLAR_REACH, STEM_COLUMN_TARGET, TWO_STEM_CHO_SCALE,
} from '../src/services/layoutRules'
import type { ChoShapeClass, JongShapeClass, LayoutRuleId, LayoutRuleParams } from '../src/services/layoutRules'
import styles from './LayoutRulesLabPage.module.css'

/**
 * "우리가 알아낸 규칙" 판. 규칙마다 무엇을 알아냈는지, 노토에서 잰 근거, 그 규칙 하나만 껐을 때 전수 588자 xor 가운데값을 보여 준다.
 * 끄면 값은 2026-11-08 전수 측정(기본 규칙 전부 켬 = 0.408, 모델 0.193, 처음 규칙 넷 = 0.944). 숫자는 손으로 옮긴 측정 기록이다 — 표본이나 규칙이 바뀌면 다시 재야 한다.
 */

interface Finding {
  origin: '처음 규칙' | '11-08 찾음'
  found: string
  evidence: string
  /** 이 규칙 하나만 껐을 때(기본값에서 꺼져 있는 규칙은 켰을 때) 전수 xor 가운데값. */
  toggled: number
}

const MEASURED_ALL = 0.408
const MEASURED_MODEL = 0.193
const MEASURED_FIRST = 0.944

const FINDINGS: Record<LayoutRuleId, Finding> = {
  faces: { origin: '처음 규칙', found: '스키마 상자는 중심선 상자라 잉크가 반 두께만큼 밖으로 나온다. 잉크 바깥면이 상자 변에 오게 읽는다.', evidence: '모델 상자는 잉크 바깥면 기준', toggled: 0.416 },
  choShape: { origin: '11-08 찾음', found: '네모난 첫닿자는 작게, 열린 꼴은 크게. 꼭지(ㅊ ㅎ)는 몸통 윗선 위 여백까지 쓰고, 꼬리 있는 ㄱ ㅋ ㅅ ㅈ는 아래로 더 내려온다. 기둥 둘인 홀자 옆에서는 폭이 준다.', evidence: `폭 네모 .41 · 열린 .48 · 꼭지 .52 · 쌍 .54 / 윗면 .105, 꼭지 .055 / 두 기둥 옆 ×${TWO_STEM_CHO_SCALE}`, toggled: 0.637 },
  stemColumn: { origin: '11-08 찾음', found: '홀자는 상자 오른끝이 아니라 기둥 줄(.67~.78)에 선다. 오른가지가 없는 ㅣ ㅓ ㅕ는 그만큼 안쪽에 선다. ㅔ ㅖ는 왼가지가 넓다.', evidence: 'ㅣ 오른면 .779 · ㅏ .88 · ㅐ .814 / ㅔ 왼면 .432', toggled: 0.647 },
  finalTop: { origin: '처음 규칙', found: '받침 윗면 = 첫닿자 아래 + 두께 × m. 받침 모양별 높이가 켜져 있으면 그쪽이 덮어쓴다.', evidence: '—', toggled: 0.41 },
  jongShape: { origin: '11-08 찾음', found: '받침 윗면은 모양 갈래로 정해진다. 납작한 받침은 낮게, 층진 꼴(ㄹ ㅂ ㅌ)은 중간, 꼭지(ㅎ ㅊ)는 높게. 사선 · 겹받침은 폭이 넓고, ㄱ ㅋ은 오른면이 안쪽이다.', evidence: `윗면 납작 ${JONG_SHAPE_TOP.flat} · ㄴ ${JONG_TOP_OVERRIDE['ㄴ']} · 층진 ${JONG_SHAPE_TOP.stacked} · 꼭지 ${JONG_SHAPE_TOP.dot} / 아랫면 ${JONG_BOTTOM}`, toggled: 0.491 },
  pillar: { origin: '처음 규칙', found: '홀자 기둥은 몸 위에서 시작해 받침 윗면 조금 위(두께 × m)에서 끝난다.', evidence: '기둥 끝 ≈ 받침 윗면 − .043', toggled: 0.411 },
  pillarReach: { origin: '11-08 찾음', found: '오른 위가 빈 받침(ㄴ ㅅ)이면 기둥이 그 빈자리로 받침 윗면보다 아래까지 내려온다. 꼭지 받침(ㅎ ㅊ)은 꼭지 옆으로 조금.', evidence: `받침 윗면 대비 ${Object.entries(PILLAR_REACH).map(([jong, reach]) => `${jong} +${reach}`).join(' · ')} (ㄴ 위 기둥 끝 .715~.723, 홀자 아홉 모두)`, toggled: 0.409 },
  gap: { origin: '처음 규칙', found: '획 사이 최소 틈(두께 × k). 잉크 바깥 네모로 재서 ㅎ–ㅓ처럼 서로 파고드는 짝을 잘못 밀어낸다. 모양별 규칙과 함께면 오히려 멀어져서 기본은 꺼 둔다.', evidence: '켜면 0.408 → 0.459', toggled: 0.459 },
}

const CHO_ORDER: ChoShapeClass[] = ['square', 'open', 'dot', 'double']
const JONG_ORDER: JongShapeClass[] = ['flat', 'stacked', 'dot']
const n3 = (value: number) => value.toFixed(3).replace(/^0/, '')

export function LayoutRuleFindings({ params }: { params: LayoutRuleParams }) {
  return <section className={styles.findings} data-testid="layout-rule-findings">
    <h3>우리가 알아낸 규칙</h3>
    <p className={styles.note}>
      전수 588자 xor 가운데값: 처음 규칙 넷 {MEASURED_FIRST} → 지금 규칙 {MEASURED_ALL} (모델 {MEASURED_MODEL}). "하나 끄면"은 그 규칙만 바꿨을 때의 값으로, 클수록 그 규칙이 많이 일한다.
      목표값은 노토 몸통(.05 · .89 · .05 · .96)에서 지금 모델이 그린 잉크의 가운데값이다.
    </p>
    <table className={styles.findingTable}>
      <thead><tr><th>규칙</th><th>상태</th><th>알아낸 것</th><th>근거(노토 em)</th><th>하나 {'끄면'}</th></tr></thead>
      <tbody>
        {LAYOUT_RULE_ORDER.map((rule) => {
          const finding = FINDINGS[rule]
          return <tr key={rule} data-new={finding.origin === '11-08 찾음' || undefined}>
            <th>{LAYOUT_RULE_LABEL[rule]}<small>{finding.origin}</small></th>
            <td>{params.rules[rule] ? '켬' : '끔'}</td>
            <td>{finding.found}</td>
            <td>{finding.evidence}</td>
            <td>{rule === 'gap' ? `켜면 ${finding.toggled}` : finding.toggled}</td>
          </tr>
        })}
      </tbody>
    </table>
    <div className={styles.findingTables}>
      <table className={styles.findingTable}>
        <caption>첫닿자 갈래 → 잉크 목표</caption>
        <thead><tr><th>갈래</th><th>왼면</th><th>폭</th><th>윗면</th><th>아랫면</th></tr></thead>
        <tbody>{CHO_ORDER.map((shape) => {
          const target = CHO_SHAPE_TARGET[shape]
          return <tr key={shape}><th>{CHO_SHAPE_LABEL[shape]}</th><td>{n3(target.left)}</td><td>{n3(target.width)}</td><td>{n3(target.top)}</td><td>{n3(target.bottom)}</td></tr>
        })}</tbody>
        <tfoot><tr><td colSpan={5}>꼬리({[...CHO_TAIL].join(' ')}) 아랫면 +{CHO_TAIL_DROP} · 기둥 둘인 홀자(ㅐ ㅒ ㅔ ㅖ) 옆 폭 ×{TWO_STEM_CHO_SCALE}</td></tr></tfoot>
      </table>
      <table className={styles.findingTable}>
        <caption>홀자 → 잉크 가로 목표</caption>
        <thead><tr><th>홀자</th><th>왼면</th><th>오른면</th></tr></thead>
        <tbody>{Object.entries(STEM_COLUMN_TARGET).map(([jung, target]) => <tr key={jung}><th>{jung}</th><td>{target.left === undefined ? '폭 그대로' : n3(target.left)}</td><td>{n3(target.right)}</td></tr>)}</tbody>
      </table>
      <table className={styles.findingTable}>
        <caption>받침 갈래 → 잉크 윗면</caption>
        <thead><tr><th>갈래</th><th>윗면</th></tr></thead>
        <tbody>
          {JONG_ORDER.map((shape) => <tr key={shape}><th>{JONG_SHAPE_LABEL[shape]}</th><td>{n3(JONG_SHAPE_TOP[shape])}</td></tr>)}
          {Object.entries(JONG_TOP_OVERRIDE).map(([jong, top]) => <tr key={jong}><th>{jong} (따로)</th><td>{n3(top)}</td></tr>)}
        </tbody>
      </table>
    </div>
  </section>
}
