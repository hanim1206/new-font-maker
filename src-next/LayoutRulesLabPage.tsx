import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_LAYOUT_RULE_PARAMS, LAYOUT_RULE_LABEL, LAYOUT_RULE_ORDER, RULE_PARTS } from '../src/services/layoutRules'
import type { LayoutRuleId, LayoutRuleParams, RuleBoxes } from '../src/services/layoutRules'
import { DEFAULT_STYLE } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import type { BoxConfig } from '../src/types'
import { DEFAULT_STROKE_SHAPE_PARAMS } from '../src/services/strokeShapeRules'
import type { StrokeShapeParams } from '../src/services/strokeShapeRules'
import { strokeXorShares } from './layoutRulesStrokeXor'
import { EDIT_COLOR } from './editColors'
import { BOX_TOLERANCE, EDGE_LABEL, EDGES, GLYPH_KIND_LABEL, glyphKindOf, INK_CLOSE_TOLERANCE, medianOf, noFinalChars, NOTO_DELTA_TOLERANCE, regionsToPath, REPRESENTATIVE_CHARS, sampleChars, scoreGlyph } from './layoutRulesScore'
import type { JamoMaps, ScoredGlyph } from './layoutRulesScore'
import { useNotoModel } from './notoModel'
import { notoPresetGlyphs } from './notoPresetGlyphs'
import { PART_COLOR, PART_LABEL } from './partColors'
import { LayoutRuleFindings } from './layoutRuleFindings'
import styles from './LayoutRulesLabPage.module.css'

/**
 * 배치 규칙 채점판. 플랜 `2026-11-08_배치-규칙-역추론-실험.md`의 A.
 * 1차(박스): 글자마다 세 자리(모델 · 스키마 · 규칙)에 그려 부품별 잉크 바깥 네모 네 변이 모델과 얼마나 어긋나는지 재고, 그 최대치로 색을 칠한다. 잉크 xor는 참고로만 보인다.
 * 규칙 스위치와 변수(k · m)를 바꾸면 표본이 다시 계산된다. 차이가 큰 글자 상위 20이 "아직 못 찾은 규칙" 목록이다.
 * 전역 스타일은 기본값으로 고정한다 — 여기서 재는 것은 배치뿐이다.
 */

type SampleKind = 'six' | 'full' | 'noFinal'
const VIEW = 300
const WORST_COUNT = 20
const BATCH = 6

function useScores(input: { chars: string[]; maps: JamoMaps; params: LayoutRuleParams; snapStems: boolean; shapes: StrokeShapeParams; modelReady: boolean; model: Parameters<typeof scoreGlyph>[0]['model'] }) {
  const { chars, maps, params, snapStems, shapes, modelReady, model } = input
  const [scores, setScores] = useState<Map<string, ScoredGlyph>>(new Map())
  const [progress, setProgress] = useState({ done: 0, total: 0 })
  const run = useRef(0)

  useEffect(() => {
    if (!modelReady) return
    const token = run.current + 1
    run.current = token
    const next = new Map<string, ScoredGlyph>()
    setScores(new Map())
    setProgress({ done: 0, total: chars.length })
    let cancelled = false
    const work = async () => {
      for (let index = 0; index < chars.length; index += BATCH) {
        const slice = chars.slice(index, index + BATCH)
        const glyphs = await Promise.all(slice.map((char) => notoPresetGlyphs.glyph(char.codePointAt(0) ?? 0).then((glyph) => ({ char, glyph }), (failure: Error) => ({ char, error: failure.message }))))
        if (cancelled || run.current !== token) return
        for (const item of glyphs) {
          if ('error' in item) {
            next.set(item.char, { char: item.char, ok: false, message: item.error, xor: { model: null, schema: 0, rule: 0 }, boxes: { schema: {}, rule: {}, model: null }, box: null, steps: [], limited: false, ink: { rule: [], ghost: [] }, drawn: null })
            continue
          }
          next.set(item.char, scoreGlyph({ char: item.char, maps, style: DEFAULT_STYLE, model, outline: item.glyph.outline, params, snapStems, shapes }))
        }
        setScores(new Map(next))
        setProgress({ done: Math.min(index + BATCH, chars.length), total: chars.length })
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }
    void work()
    return () => { cancelled = true }
  }, [chars, maps, params, snapStems, shapes, modelReady, model])

  return { scores, progress }
}

/** 칸 바탕색: 초록(0.01 안) · 회색(0.02 안) · 노랑(끝 길이 — 한 변만 튀고 획은 가까움) · 빨강(자리, 차이가 클수록 짙게). */
function cellBackground(score: ScoredGlyph): string {
  const kind = glyphKindOf(score)
  if (kind === 'fail') return 'rgb(var(--color-surface-3))'
  if (kind === 'good') return 'rgba(60, 170, 90, 0.35)'
  if (kind === 'ok') return 'rgba(120, 120, 120, 0.18)'
  if (kind === 'tip') return 'rgba(230, 170, 30, 0.45)'
  const strength = Math.min(1, ((score.box?.maxAbs ?? 0) - BOX_TOLERANCE) / 0.1)
  return `rgba(220, 60, 40, ${(0.2 + strength * 0.6).toFixed(2)})`
}
/** 칸 점: xor 규칙 − 모델. 0.02 안 초록 · 0.05 안 회색 · 그 밖 빨강. */
function inkDotColor(delta: number | null): string {
  if (delta === null) return 'transparent'
  if (delta <= NOTO_DELTA_TOLERANCE) return 'rgb(60, 170, 90)'
  if (delta <= 0.05) return 'rgb(140, 140, 140)'
  return 'rgb(220, 60, 40)'
}
const boxMaxOf = (score: ScoredGlyph): number | null => score.ok && score.box ? score.box.maxAbs : null
const PART_SHORT: Record<'CH' | 'JU' | 'JO', string> = { CH: '첫', JU: '홀', JO: '받' }
const worstLabel = (score: ScoredGlyph) => score.box?.worst ? `${PART_SHORT[score.box.worst.part]} ${EDGE_LABEL[score.box.worst.edge]} ${signed(score.box.worst.diff)}` : ''

const pct = (value: number | null) => value === null ? '—' : value.toFixed(3)
const signed = (value: number | null) => value === null ? '—' : `${value > 0 ? '+' : ''}${value.toFixed(3)}`
const deltaOf = (score: ScoredGlyph): number | null => score.ok && score.xor.model !== null ? score.xor.rule - score.xor.model : null

function BoxRects({ boxes, dash, opacity, body }: { boxes: RuleBoxes; dash?: string; opacity?: number; body?: boolean }) {
  return <g opacity={opacity ?? 1}>
    {RULE_PARTS.map((part) => {
      const box: BoxConfig | undefined = boxes[part]
      return box ? <rect key={part} x={box.x * VIEW} y={box.y * VIEW} width={box.width * VIEW} height={box.height * VIEW} fill="none" stroke={body ? EDIT_COLOR.editSlotOff : PART_COLOR[part]} strokeWidth={body ? 1 : 1.5} strokeDasharray={dash} /> : null
    })}
  </g>
}

function Detail({ score, show }: { score: ScoredGlyph; show: { ghost: boolean; ink: boolean; schema: boolean; model: boolean; rule: boolean } }) {
  if (!score.ok) return <div className={styles.detail}><p className={styles.fail}>{score.char}: {score.message}</p></div>
  return <div className={styles.detail}>
    <svg viewBox={`0 0 ${VIEW} ${VIEW}`} className={styles.figure} role="img" aria-label={`${score.char} 규칙 자리와 노토`}>
      <rect x={0} y={0} width={VIEW} height={VIEW} fill="rgb(var(--color-surface))" />
      {show.ghost && <path d={regionsToPath(score.ink.ghost, VIEW)} fill={EDIT_COLOR.editGhost} fillRule="evenodd" opacity={0.22} />}
      {show.ink && <path d={regionsToPath(score.ink.rule, VIEW)} fill="rgb(var(--color-foreground))" fillRule="evenodd" opacity={0.8} />}
      {show.schema && <BoxRects boxes={score.boxes.schema} dash="4 3" opacity={0.6} body />}
      {show.model && score.boxes.model && <BoxRects boxes={score.boxes.model} dash="1.5 2.5" opacity={0.75} />}
      {show.rule && <BoxRects boxes={score.boxes.rule} />}
    </svg>
    <div className={styles.detailText}>
      <h2>{score.char} <small>{score.limited ? '한계에 닿음' : ''}</small></h2>
      {score.box && <table className={styles.edgeTable}>
        <thead><tr><th>박스 차이(규칙 − 모델)</th>{EDGES.map((edge) => <th key={edge}>{EDGE_LABEL[edge]}</th>)}</tr></thead>
        <tbody>{RULE_PARTS.map((part) => {
          const row = score.box!.parts[part]
          return row ? <tr key={part}><th style={{ color: PART_COLOR[part] }}>{PART_LABEL[part]}</th>{EDGES.map((edge) => <td key={edge} data-over={Math.abs(row.diff[edge]) > BOX_TOLERANCE || undefined}>{signed(row.diff[edge])}</td>)}</tr> : null
        })}</tbody>
      </table>}
      <table className={styles.xorTable}><tbody>
        <tr><th>박스 최대 차이</th><td>{pct(boxMaxOf(score))}</td></tr>
        <tr><th>박스 차이 · 규칙 끔</th><td>{pct(score.box?.schemaMaxAbs ?? null)}</td></tr>
        <tr><th>잉크 xor · 모델(지금 엔진)</th><td>{pct(score.xor.model)}</td></tr>
        <tr><th>잉크 xor · 규칙 끔</th><td>{pct(score.xor.schema)}</td></tr>
        <tr><th>잉크 xor · 규칙</th><td>{pct(score.xor.rule)}</td></tr>
        <tr><th>잉크 xor · 규칙 − 모델</th><td>{signed(deltaOf(score))}</td></tr>
      </tbody></table>
      <StrokeShares score={score} />
      <ol className={styles.steps}>
        {score.steps.length === 0 && <li>움직인 규칙 없음</li>}
        {score.steps.map((step, index) => <li key={index} data-limited={step.limited || undefined}>
          <span style={{ color: PART_COLOR[step.part] }}>{PART_LABEL[step.part]}</span> · {LAYOUT_RULE_LABEL[step.rule]} — {step.note}
        </li>)}
      </ol>
    </div>
  </div>
}

/** 2차 채점: 노토와 어긋난 잉크를 획마다 나눈 것. 남는 = 우리 잉크 중 노토 밖, 모자란 = 노토 잉크 중 우리 밖(가장 가까운 획 몫). */
function StrokeShares({ score }: { score: ScoredGlyph }) {
  const shares = useMemo(() => score.drawn ? strokeXorShares({ syllable: score.drawn, boxes: score.boxes.rule, style: DEFAULT_STYLE, ghost: score.ink.ghost }) : [], [score])
  if (shares.length === 0) return null
  const total = shares.reduce((sum, share) => sum + share.extra + share.missing, 0)
  const rows = [...shares].sort((a, b) => (b.extra + b.missing) - (a.extra + a.missing))
  return <table className={styles.edgeTable} data-testid="stroke-shares">
    <thead><tr><th>획별 어긋남(노토 잉크 대비)</th><th>남는</th><th>모자란</th><th>몫</th></tr></thead>
    <tbody>{rows.map((share) => {
      const sum = share.extra + share.missing
      return <tr key={`${share.part}:${share.strokeId}`}><th style={{ color: PART_COLOR[share.part] }}>{share.strokeId}</th><td>{pct(share.extra)}</td><td>{pct(share.missing)}</td><td data-over={total > 0 && sum / total >= 0.5 || undefined}>{total > 0 ? `${Math.round((sum / total) * 100)}%` : '-'}</td></tr>
    })}</tbody>
  </table>
}

export function LayoutRulesLabPage() {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const maps = useMemo<JamoMaps>(() => ({ choseong, jungseong, jongseong }), [choseong, jungseong, jongseong])
  const { bundle, error: modelError } = useNotoModel()

  const [params, setParams] = useState<LayoutRuleParams>(DEFAULT_LAYOUT_RULE_PARAMS)
  const [snapStems, setSnapStems] = useState(true)
  const [shapes, setShapes] = useState<StrokeShapeParams>(DEFAULT_STROKE_SHAPE_PARAMS)
  const [sample, setSample] = useState<SampleKind>('six')
  const [selected, setSelected] = useState<string>(REPRESENTATIVE_CHARS[1])
  const [show, setShow] = useState({ ghost: true, ink: true, schema: false, model: true, rule: true })

  const chars = useMemo(() => sample === 'six' ? [...REPRESENTATIVE_CHARS] : sample === 'noFinal' ? noFinalChars() : sampleChars(), [sample])
  const { scores, progress } = useScores({ chars, maps, params, snapStems, shapes, modelReady: Boolean(bundle) || Boolean(modelError), model: bundle })

  const list = useMemo(() => chars.map((char) => scores.get(char)).filter((score): score is ScoredGlyph => Boolean(score)), [chars, scores])
  const summary = useMemo(() => {
    const ok = list.filter((score) => score.ok)
    const withModel = ok.filter((score) => score.xor.model !== null)
    const deltas = withModel.map((score) => score.xor.rule - (score.xor.model ?? 0))
    const boxes = ok.map(boxMaxOf).filter((value): value is number => value !== null)
    return {
      count: ok.length,
      failed: list.length - ok.length,
      boxMedian: medianOf(boxes),
      boxSchemaMedian: medianOf(ok.map((score) => score.box?.schemaMaxAbs ?? null).filter((value): value is number => value !== null)),
      boxWithin: boxes.filter((value) => value <= BOX_TOLERANCE).length,
      tip: ok.filter((score) => glyphKindOf(score) === 'tip').length,
      place: ok.filter((score) => glyphKindOf(score) === 'place').length,
      boxCount: boxes.length,
      model: medianOf(withModel.map((score) => score.xor.model ?? 0)),
      schema: medianOf(ok.map((score) => score.xor.schema)),
      rule: medianOf(ok.map((score) => score.xor.rule)),
      within: deltas.filter((delta) => delta <= NOTO_DELTA_TOLERANCE).length,
      better: deltas.filter((delta) => delta <= 0).length,
      limited: ok.filter((score) => score.limited).length,
    }
  }, [list])
  const worst = useMemo(() => list.filter((score) => boxMaxOf(score) !== null).sort((a, b) => (boxMaxOf(b) ?? 0) - (boxMaxOf(a) ?? 0)).slice(0, WORST_COUNT), [list])
  const selectedScore = scores.get(selected) ?? null

  const toggleRule = (rule: LayoutRuleId) => setParams((prev) => ({ ...prev, rules: { ...prev.rules, [rule]: !prev.rules[rule] } }))
  const gateColor = (value: number | null, base: number | null) => value === null || base === null ? undefined : value <= base + NOTO_DELTA_TOLERANCE ? styles.pass : styles.over

  return <div className={styles.page} data-testid="layout-rules-lab">
    <header className={styles.header}>
      <span>Layout rules lab</span>
      <h1>배치 규칙 채점판</h1>
      <p>1차는 박스로 맞춘다. 규칙이 놓은 자리에 그린 부품별 잉크 바깥 네모(왼 · 오른 · 위 · 아래)가 지금 엔진(노토 변화량 모델)의 네모와 얼마나 어긋나는지 em으로 잰다. 글자 점수는 열두 변 중 가장 큰 차이다. 초록 {BOX_TOLERANCE / 2} 안 · 회색 {BOX_TOLERANCE} 안(일치) · 빨강은 그 밖. 잉크 xor는 2차(획)용 참고로 같이 둔다.</p>
    </header>

    <LayoutRuleFindings params={params} />

    <section className={styles.controls}>
      <div className={styles.group}>
        <h3>규칙</h3>
        {LAYOUT_RULE_ORDER.map((rule) => <label key={rule}><input type="checkbox" checked={params.rules[rule]} onChange={() => toggleRule(rule)} data-testid={`rule-${rule}`} /> {LAYOUT_RULE_LABEL[rule]}</label>)}
        <label><input type="checkbox" checked={params.formulas} onChange={() => setParams((prev) => ({ ...prev, formulas: !prev.formulas }))} data-testid="rule-formulas" /> 표 대신 공식(G0 — 첫닿자 아래, 받침 없음. 나머지 열은 아직 표)</label>
        <label><input type="checkbox" checked={params.jungKinds} onChange={() => setParams((prev) => ({ ...prev, jungKinds: !prev.jungKinds }))} data-testid="rule-jung-kinds" /> 홀자 표 대신 가지 갈래 넷(기둥은 가지 반대쪽으로 비켜서고 오른가지는 기둥 밖으로)</label>
        <label><input type="checkbox" checked={snapStems} onChange={() => setSnapStems((value) => !value)} /> 홀자 안쪽 줄기를 노토 보선에 맞춤</label>
        <h3>획 꼴(2차)</h3>
        <label><input type="checkbox" checked={shapes.giyeokSweep} onChange={() => setShapes((prev) => ({ ...prev, giyeokSweep: !prev.giyeokSweep }))} data-testid="shape-giyeokSweep" /> ㄱ ㅋ ㄲ 세로줄기를 삐침으로(오른홀자 옆)</label>
        <label><input type="checkbox" checked={shapes.bottomKick} onChange={() => setShapes((prev) => ({ ...prev, bottomKick: !prev.bottomKick }))} data-testid="shape-bottomKick" /> ㄴ ㄷ ㄸ ㄹ ㅌ ㅍ 맨 아래 가로줄기 치킴(왼가지 옆은 짧게, 받침 ㄵ의 ㄴ도)</label>
        <label><input type="checkbox" checked={shapes.tailSweep} onChange={() => setShapes((prev) => ({ ...prev, tailSweep: !prev.tailSweep }))} data-testid="shape-tailSweep" /> ㅈ ㅊ ㅉ 삐침 · 내림 끝을 바깥으로 휘어 빼기(오른홀자 옆)</label>
        <label><input type="checkbox" checked={shapes.compoundJong} onChange={() => setShapes((prev) => ({ ...prev, compoundJong: !prev.compoundJong }))} data-testid="shape-compoundJong" /> 섞임받침 ㅀ ㄶ ㅄ을 홑받침 둘로 다시 그리기</label>
        <label><input type="checkbox" checked={shapes.hieutParts} onChange={() => setShapes((prev) => ({ ...prev, hieutParts: !prev.hieutParts }))} data-testid="shape-hieutParts" /> ㅎ(첫닿자 · 받침) 머리와 동그라미 자리 노토에 맞추기</label>
      </div>
      <div className={styles.group}>
        <h3>변수</h3>
        <label>최소 틈 k <b>{params.k.toFixed(2)}</b> × 두께
          <input type="range" min={0} max={1} step={0.05} value={params.k} onChange={(event) => setParams((prev) => ({ ...prev, k: Number(event.target.value) }))} data-testid="rule-k" /></label>
        <label>받침 윗면 여백 m <b>{params.m.toFixed(2)}</b> × 두께
          <input type="range" min={0} max={1.5} step={0.05} value={params.m} onChange={(event) => setParams((prev) => ({ ...prev, m: Number(event.target.value) }))} data-testid="rule-m" /></label>
        <button type="button" onClick={() => setParams(DEFAULT_LAYOUT_RULE_PARAMS)}>기본값으로</button>
      </div>
      <div className={styles.group}>
        <h3>표본</h3>
        <label><input type="radio" name="sample" checked={sample === 'six'} onChange={() => setSample('six')} /> 대표 여섯 (가 각 갈 날 말 할)</label>
        <label><input type="radio" name="sample" checked={sample === 'full'} onChange={() => setSample('full')} /> 전수 {sampleChars().length}자 (오른홀자 + 받침)</label>
        <label><input type="radio" name="sample" checked={sample === 'noFinal'} onChange={() => setSample('noFinal')} data-testid="sample-no-final" /> 받침 없음 {noFinalChars().length}자 (첫닿자 19 × 오른홀자 9)</label>
        <h3>그림</h3>
        {(['ghost', 'ink', 'rule', 'model', 'schema'] as const).map((key) => <label key={key}><input type="checkbox" checked={show[key]} onChange={() => setShow((prev) => ({ ...prev, [key]: !prev[key] }))} /> {({ ghost: '노토 고스트', ink: '우리 잉크(규칙 자리)', rule: '규칙 상자', model: '모델 상자(점선)', schema: '스키마 상자(파선)' })[key]}</label>)}
      </div>
    </section>

    <section className={styles.summary} data-testid="layout-rules-summary">
      {modelError && <span className={styles.fail}>모델을 못 읽었다: {modelError}</span>}
      <span>계산 {progress.done}/{progress.total}{summary.failed ? ` · 실패 ${summary.failed}` : ''}</span>
      <span>박스 최대 차이 중앙값 — 규칙 <b className={summary.boxMedian !== null && summary.boxMedian <= BOX_TOLERANCE ? styles.pass : styles.over}>{pct(summary.boxMedian)}</b> · 규칙 끔 <b>{pct(summary.boxSchemaMedian)}</b> · 박스 일치({BOX_TOLERANCE} 안) <b>{summary.boxWithin}</b>/{summary.boxCount} · 밖 — 자리 <b className={styles.over}>{summary.place}</b> · 끝 길이 <b className={styles.tip}>{summary.tip}</b>(한 변만 튐 · xor 모델 + {INK_CLOSE_TOLERANCE} 안, 2차 몫) · 한계에 닿음 <b>{summary.limited}</b></span>
      <span className={styles.aside}>잉크 xor 중앙값 — 모델 <b>{pct(summary.model)}</b> · 스키마 <b>{pct(summary.schema)}</b> · 규칙 <b className={gateColor(summary.rule, summary.model)}>{pct(summary.rule)}</b> · 모델 + {NOTO_DELTA_TOLERANCE} 안 {summary.within} · 더 가까움 {summary.better}</span>
    </section>

    <section className={styles.body}>
      <div className={styles.gridWrap}>
        <p className={styles.legend}>바탕 = 박스(초록 0.01 안 · 회색 0.02 안 · <span className={styles.tip}>노랑 끝 길이</span> · <span className={styles.over}>빨강 자리</span>) · 점 = xor 규칙 − 모델(초록 0.02 안 · 회색 0.05 안 · 빨강 밖)</p>
        <div className={styles.grid} data-testid="layout-rules-grid">
          {chars.map((char) => {
            const score = scores.get(char)
            const boxMax = score ? boxMaxOf(score) : null
            const delta = score ? deltaOf(score) : null
            return <button key={char} type="button" className={styles.cell} style={{ background: score ? cellBackground(score) : undefined }} aria-pressed={char === selected} onClick={() => setSelected(char)} title={score?.ok ? `${GLYPH_KIND_LABEL[glyphKindOf(score)]} · 박스 최대 차이 ${pct(boxMax)} (${worstLabel(score)}) · xor 규칙 − 모델 ${signed(delta)}` : score?.message} data-failed={score && !score.ok ? '' : undefined} data-kind={score ? glyphKindOf(score) : undefined}>
              <span className={styles.cellChar}>{char}</span>
              <span className={styles.cellValue}>{score?.ok ? pct(boxMax) : score ? '!' : ''}</span>
              {score?.ok && <span className={styles.cellDot} style={{ background: inkDotColor(delta) }} aria-hidden="true" />}
            </button>
          })}
        </div>
        <div className={styles.worst}>
          <h3>박스 차이 큰 글자 {WORST_COUNT} — 아직 못 찾은 규칙</h3>
          <ol>
            {worst.map((score) => <li key={score.char}><button type="button" onClick={() => setSelected(score.char)} aria-pressed={score.char === selected}>{score.char}</button> <b>{pct(boxMaxOf(score))}</b> · {worstLabel(score)}{glyphKindOf(score) === 'tip' ? <span className={styles.tip}> · 끝 길이</span> : null}{score.limited ? ' · 한계' : ''}</li>)}
          </ol>
        </div>
      </div>
      {selectedScore ? <Detail score={selectedScore} show={show} /> : <div className={styles.detail}><p className={styles.note}>글자를 고르면 자리와 규칙 기록이 여기 보인다.</p></div>}
    </section>

    <p className={styles.note}>
      모델 = 지금 엔진의 상자 · 스키마 = Split + Padding 기본 상자 그대로(규칙 끔) · 규칙 = 스키마에서 출발해 {LAYOUT_RULE_ORDER.map((rule) => LAYOUT_RULE_LABEL[rule]).join(' → ')} 순으로 움직인 상자.
      전역 스타일은 기본값(굵기 400 · 끝 네모 · 꺾임 뾰족) 고정. 노토 윤곽은 채점에만 쓰고 잉크에 섞지 않는다.
    </p>
  </div>
}
