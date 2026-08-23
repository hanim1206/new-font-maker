import { useEffect, useMemo, useState } from 'react'
import { X } from 'lucide-react'
import type { JamoData, StrokeDataV2 } from '../src/types'
import { pointsToSvgD } from '../src/utils/pathUtils'
import { analyzeTerminal, directionOf, terminalTangentPoints, writingTerminalAngle, writingTerminalSides, type ApplicationScope, type TerminalSide } from './ruleLabMetadata'
import styles from './ShapeRulePanel.module.css'

const STORAGE_KEY = 'font-maker-shape-rules-v3'
const SCOPE_OPTIONS: ApplicationScope[] = ['이 지점만', '같은 자모', '같은 끝 형태', '직접 지정']
const BOX = { x: .12, y: .12, width: .76, height: .76 }

type ShapeFeature = 'none' | 'buri'
type BuriStyle = 'round' | 'square' | 'angled'
interface RuleDraft { etiquette: string; scope: ApplicationScope; scopeNote: string; feature: ShapeFeature; size: number; angle: number; buriStyle: BuriStyle }
type RuleMap = Record<string, RuleDraft>

function strokesOf(jamo: JamoData): StrokeDataV2[] {
  return [...(jamo.strokes ?? []), ...(jamo.horizontalStrokes ?? []), ...(jamo.verticalStrokes ?? [])]
}

function load<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback } catch { return fallback }
}

function ruleKey(jamo: JamoData, strokeId: string, side: TerminalSide): string {
  return `${jamo.type}:${jamo.char}:${strokeId}:${side}`
}

const EMPTY_RULE: RuleDraft = { etiquette: '', scope: '이 지점만', scopeNote: '', feature: 'none', size: 1, angle: 0, buriStyle: 'round' }

function ruleWithDefaults(rule?: Partial<RuleDraft>): RuleDraft {
  return { ...EMPTY_RULE, ...rule }
}

function mainDirection(stroke: StrokeDataV2): string {
  const first = stroke.points[0]
  const last = stroke.points.at(-1)!
  const dx = Math.abs(last.x - first.x)
  const dy = Math.abs(last.y - first.y)
  if (dx > dy * 1.5) return '가로'
  if (dy > dx * 1.5) return '세로'
  return '혼합·사선'
}

function automaticStrokeOrder(strokes: StrokeDataV2[]): Map<string, number> {
  const ranked = strokes.map((stroke, index) => ({
    id: stroke.id,
    index,
    top: Math.min(...stroke.points.map((point) => point.y)),
    left: Math.min(...stroke.points.map((point) => point.x)),
  })).sort((a, b) => Math.abs(a.top - b.top) > .05 ? a.top - b.top : Math.abs(a.left - b.left) > .025 ? a.left - b.left : a.index - b.index)
  return new Map(ranked.map((stroke, index) => [stroke.id, index + 1]))
}

function connectedStrokeIds(stroke: StrokeDataV2, strokes: StrokeDataV2[]): string[] {
  const ends = [stroke.points[0], stroke.points.at(-1)!]
  return strokes.filter((candidate) => candidate.id !== stroke.id).filter((candidate) => {
    const candidateEnds = [candidate.points[0], candidate.points.at(-1)!]
    return ends.some((a) => candidateEnds.some((b) => Math.hypot(a.x - b.x, a.y - b.y) <= .025))
  }).map((candidate) => candidate.id)
}

function buriPath(stroke: StrokeDataV2, side: TerminalSide, size: number, angleOffset: number, style: BuriStyle): string {
  const endpoint = side === 'start' ? stroke.points[0] : stroke.points.at(-1)!
  const [from, to] = terminalTangentPoints(stroke, side)
  const baseAngle = side === 'start' ? Math.atan2(from.y - to.y, from.x - to.x) : Math.atan2(to.y - from.y, to.x - from.x)
  const angle = baseAngle + angleOffset * Math.PI / 180
  const tangent = { x: Math.cos(angle), y: Math.sin(angle) }
  const normal = { x: -tangent.y, y: tangent.x }
  const radius = stroke.thickness * (.56 + size * .12)
  const outward = radius * .18
  const point = (along: number, across: number) => ({ x: (BOX.x + (endpoint.x + tangent.x * along + normal.x * across) * BOX.width) * 1000, y: (BOX.y + (endpoint.y + tangent.y * along + normal.y * across) * BOX.height) * 1000 })
  const p = (along: number, across: number) => { const value = point(along, across); return `${value.x},${value.y}` }
  if (style === 'round') {
    const center = point(outward, 0)
    const r = radius * BOX.width * 1000
    return `M ${center.x - r},${center.y} A ${r},${r} 0 1 0 ${center.x + r},${center.y} A ${r},${r} 0 1 0 ${center.x - r},${center.y} Z`
  }
  if (style === 'square') return `M ${p(outward - radius, -radius)} L ${p(outward + radius, -radius)} L ${p(outward + radius, radius)} L ${p(outward - radius, radius)} Z`
  return `M ${p(outward - radius, -radius * .72)} L ${p(outward + radius * .75, -radius)} L ${p(outward + radius, radius * .72)} L ${p(outward - radius * .75, radius)} Z`
}

function terminalSvgPoint(stroke: StrokeDataV2, side: TerminalSide): { x: number; y: number } {
  const point = side === 'start' ? stroke.points[0] : stroke.points.at(-1)!
  return { x: (BOX.x + point.x * BOX.width) * 1000, y: (BOX.y + point.y * BOX.height) * 1000 }
}

export function ShapeRulePanel({ jamo, selectedStrokeId, onClose }: { jamo: JamoData; selectedStrokeId: string | null; onClose: () => void }) {
  const strokes = useMemo(() => strokesOf(jamo), [jamo])
  const strokeOrder = useMemo(() => automaticStrokeOrder(strokes), [strokes])
  const [rules, setRules] = useState<RuleMap>(() => load(STORAGE_KEY, {}))
  const [active, setActive] = useState<{ strokeId: string; side: TerminalSide | null } | null>(() => {
    const stroke = strokes.find((item) => item.id === selectedStrokeId) ?? strokes[0]
    return stroke ? { strokeId: stroke.id, side: stroke.closed ? null : writingTerminalSides(stroke).start } : null
  })

  useEffect(() => { localStorage.setItem(STORAGE_KEY, JSON.stringify(rules)) }, [rules])

  const activeStroke = active ? strokes.find((stroke) => stroke.id === active.strokeId) ?? null : null
  const activeConnections = activeStroke ? connectedStrokeIds(activeStroke, strokes) : []
  const activeStartAngle = activeStroke && !activeStroke.closed ? writingTerminalAngle(activeStroke, 'start') : null
  const activeEndAngle = activeStroke && !activeStroke.closed ? writingTerminalAngle(activeStroke, 'end') : null
  const activeWritingSides = activeStroke && !activeStroke.closed ? writingTerminalSides(activeStroke) : null
  const activeRole = active && activeWritingSides ? active.side === activeWritingSides.start ? 'start' : 'end' : null
  const activeRuleKey = active && active.side ? ruleKey(jamo, active.strokeId, active.side) : null
  const activeRule = ruleWithDefaults(activeRuleKey ? rules[activeRuleKey] : undefined)

  const updateRule = (key: string, patch: Partial<RuleDraft>) => {
    const current = ruleWithDefaults(rules[key])
    setRules((value) => ({ ...value, [key]: { ...current, ...patch } }))
  }

  return <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label={`${jamo.char} 형태 규칙`}>
    <section className={styles.panel}>
      <header><div><span>현재 에디터 데이터</span><h2>{jamo.char} 형태 규칙</h2><p>방향과 연결은 현재 좌표에서 자동 계산됩니다.</p></div><button type="button" onClick={onClose} aria-label="형태 규칙 닫기"><X size={19} /></button></header>
      <div className={styles.workspace}>
        <section className={styles.canvasCard} aria-label={`${jamo.char} 현재 획`}>
          <svg viewBox="0 0 1000 1000" role="img" aria-label={`${jamo.char} 실제 편집 데이터`}>
            {Array.from({ length: 9 }, (_, index) => (index + 1) * 100).flatMap((position) => [<line key={`v${position}`} x1={position} y1="0" x2={position} y2="1000" />, <line key={`h${position}`} x1="0" y1={position} x2="1000" y2={position} />])}
            {strokes.map((stroke) => <path key={stroke.id} d={pointsToSvgD(stroke.points, stroke.closed, BOX, 1000)} data-active={active?.strokeId === stroke.id} data-muted={active !== null && active.strokeId !== stroke.id} onClick={() => setActive({ strokeId: stroke.id, side: stroke.closed ? null : writingTerminalSides(stroke).start })} role="button" tabIndex={0} aria-label={`자동 ${strokeOrder.get(stroke.id)}번째 획 선택`} />)}
            {strokes.flatMap((stroke) => stroke.closed ? [] : (['start', 'end'] as TerminalSide[]).flatMap((side) => {
              const rule = ruleWithDefaults(rules[ruleKey(jamo, stroke.id, side)])
              return rule.feature === 'buri' ? [<path key={`buri:${stroke.id}:${side}`} d={buriPath(stroke, side, rule.size, rule.angle, rule.buriStyle)} className={styles.buriPreview} data-active={active?.strokeId === stroke.id && active.side === side} />] : []
            }))}
            {activeStroke && !activeStroke.closed && (['start', 'end'] as const).map((role) => {
              const side = writingTerminalSides(activeStroke)[role]
              const point = terminalSvgPoint(activeStroke, side)
              const selected = active?.side === side
              return <circle key={`terminal:${role}`} cx={point.x} cy={point.y} r={selected ? 20 : 15} className={selected ? styles.activeTerminal : styles.terminalPoint} onClick={() => setActive({ strokeId: activeStroke.id, side })} role="button" tabIndex={0} aria-label={`${strokeOrder.get(activeStroke.id)}번째 획 ${role === 'start' ? '시작점' : '끝점'} 선택`} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') setActive({ strokeId: activeStroke.id, side }) }} />
            })}
          </svg>
          <div className={styles.canvasSummary}><strong>{strokes.length}개 획</strong><span>{jamo.type === 'choseong' ? '첫닿자' : jamo.type === 'jungseong' ? '홀자' : '받침닿자'}</span></div>
          {activeStroke && <div className={styles.metadataTags} aria-label="선택 획 자동 메타데이터">
            <span>{strokeOrder.get(activeStroke.id)}번째 획</span><span>{mainDirection(activeStroke)}</span>
            <span>{activeConnections.length ? `${activeConnections.length}개 획과 연결` : '독립 획'}</span><span>{activeStroke.closed ? '닫힌 경로' : '열린 경로'}</span>
            {activeStartAngle !== null && <span>시작 {directionOf(activeStartAngle)} {activeStartAngle}°</span>}
            {activeEndAngle !== null && <span>끝 {directionOf(activeEndAngle)} {activeEndAngle}°</span>}
          </div>}
        </section>
        <section className={styles.tableCard}>
          <header><strong>획과 끝점</strong><span>순서·방향·연결은 현재 좌표에서 자동 계산</span></header>
          {activeRuleKey && <div className={styles.featureControls} aria-label="선택 끝점 형태 기능">
            <strong>{activeRole === 'start' ? '시작점' : '끝점'} 형태 선택</strong>
            <><div className={styles.featureChoices}>
              <button type="button" aria-pressed={activeRule.feature === 'none'} onClick={() => updateRule(activeRuleKey, { feature: 'none' })}><i data-style="none" />형태 없음</button>
              <button type="button" aria-pressed={activeRule.feature === 'buri' && activeRule.buriStyle === 'round'} onClick={() => updateRule(activeRuleKey, { feature: 'buri', buriStyle: 'round' })}><i data-style="round" />원형 부리</button>
              <button type="button" aria-pressed={activeRule.feature === 'buri' && activeRule.buriStyle === 'square'} onClick={() => updateRule(activeRuleKey, { feature: 'buri', buriStyle: 'square' })}><i data-style="square" />사각 부리</button>
              <button type="button" aria-pressed={activeRule.feature === 'buri' && activeRule.buriStyle === 'angled'} onClick={() => updateRule(activeRuleKey, { feature: 'buri', buriStyle: 'angled' })}><i data-style="angled" />각진 부리</button>
            </div>{activeRule.feature === 'buri' && <div className={styles.featureSliders}><label><span>크기 <output>{activeRule.size.toFixed(1)}</output></span><input aria-label="부리 크기" type="range" min="0.5" max="2" step="0.1" value={activeRule.size} onChange={(event) => updateRule(activeRuleKey, { size: Number(event.target.value) })} /></label>{activeRule.buriStyle !== 'round' && <label><span>각도 <output>{activeRule.angle}°</output></span><input aria-label="부리 각도" type="range" min="-60" max="60" step="5" value={activeRule.angle} onChange={(event) => updateRule(activeRuleKey, { angle: Number(event.target.value) })} /></label>}</div>}</>
          </div>}
          <div className={styles.tableScroll}><table>
            <thead><tr><th>획</th><th>순서</th><th>주방향</th><th>연결</th><th>경로 지점</th><th>접선</th><th>형태 기능</th><th>형태의 예절</th><th>적용 범위</th></tr></thead>
            <tbody>{strokes.flatMap((stroke, strokeIndex) => {
              const connections = connectedStrokeIds(stroke, strokes)
              const writingSides = stroke.closed ? null : writingTerminalSides(stroke)
              const sides: Array<{ role: 'start' | 'end' | 'closed'; side: TerminalSide | 'closed' }> = writingSides ? [{ role: 'start', side: writingSides.start }, { role: 'end', side: writingSides.end }] : [{ role: 'closed', side: 'closed' }]
              return sides.map(({ role, side }, sideIndex) => {
                const key = side === 'closed' ? '' : ruleKey(jamo, stroke.id, side)
                const draft = ruleWithDefaults(rules[key])
                const geometry = side === 'closed' ? null : analyzeTerminal(stroke, side)
                return <tr key={`${stroke.id}:${side}`} data-active={active?.strokeId === stroke.id && (side === 'closed' ? active.side === null : active.side === side)} onClick={() => setActive({ strokeId: stroke.id, side: side === 'closed' ? null : side })}>
                  {sideIndex === 0 && <th rowSpan={sides.length}>획 {strokeIndex + 1}</th>}
                  {sideIndex === 0 && <td rowSpan={sides.length}>{strokeOrder.get(stroke.id)}번째</td>}
                  {sideIndex === 0 && <td rowSpan={sides.length}>{mainDirection(stroke)}</td>}
                  {sideIndex === 0 && <td rowSpan={sides.length}>{connections.length ? `${connections.length}개 획` : '독립'}</td>}
                  <td>{role === 'closed' ? '닫힌 경로' : role === 'start' ? '시작' : '끝'}</td>
                  <td>{geometry ? `${directionOf(writingTerminalAngle(stroke, role as 'start' | 'end'))} ${writingTerminalAngle(stroke, role as 'start' | 'end')}°` : '—'}</td>
                  <td>{side === 'closed' ? '—' : <select aria-label={`획 ${strokeIndex + 1} ${role === 'start' ? '시작' : '끝'} 형태 기능`} value={draft.feature} onClick={(event) => event.stopPropagation()} onChange={(event) => updateRule(key, { feature: event.target.value as ShapeFeature })}><option value="none">없음</option><option value="buri">부리</option></select>}</td>
                  <td>{side === 'closed' ? '—' : <input aria-label={`획 ${strokeIndex + 1} ${role === 'start' ? '시작' : '끝'} 형태의 예절`} value={draft.etiquette} onClick={(event) => event.stopPropagation()} onChange={(event) => updateRule(key, { etiquette: event.target.value })} placeholder="예절 입력" />}</td>
                  <td>{side === 'closed' ? '—' : <select aria-label={`획 ${strokeIndex + 1} ${role === 'start' ? '시작' : '끝'} 적용 범위`} value={draft.scope} onClick={(event) => event.stopPropagation()} onChange={(event) => updateRule(key, { scope: event.target.value as ApplicationScope })}>{SCOPE_OPTIONS.map((option) => <option key={option}>{option}</option>)}</select>}</td>
                </tr>
              })
            })}</tbody>
          </table></div>
        </section>
      </div>
      <footer><span>규칙은 획 ID에 저장되고, 형상 정보는 패널을 열 때 다시 계산됩니다.</span><button type="button" onClick={onClose}>완료</button></footer>
    </section>
  </div>
}
