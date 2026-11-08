import { useEffect, useMemo, useRef, useState } from 'react'
import { DEFAULT_LAYOUT_RULE_PARAMS, LAYOUT_RULE_LABEL, LAYOUT_RULE_ORDER, RULE_PARTS } from '../src/services/layoutRules'
import type { LayoutRuleId, LayoutRuleParams, RuleBoxes } from '../src/services/layoutRules'
import { DEFAULT_STYLE } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import type { BoxConfig } from '../src/types'
import { EDIT_COLOR } from './editColors'
import { medianOf, NOTO_DELTA_TOLERANCE, regionsToPath, REPRESENTATIVE_CHARS, sampleChars, scoreGlyph } from './layoutRulesScore'
import type { JamoMaps, ScoredGlyph } from './layoutRulesScore'
import { useNotoModel } from './notoModel'
import { notoPresetGlyphs } from './notoPresetGlyphs'
import { PART_COLOR, PART_LABEL } from './partColors'
import { LayoutRuleFindings } from './layoutRuleFindings'
import styles from './LayoutRulesLabPage.module.css'

/**
 * 배치 규칙 채점판. 플랜 `2026-11-08_배치-규칙-역추론-실험.md`의 A.
 * 글자마다 세 자리(모델 · 스키마 · 규칙)에 그려 노토와의 xor를 재고, 규칙이 모델보다 얼마나 가깝거나 먼지 색으로 칠한다.
 * 규칙 스위치와 변수(k · m)를 바꾸면 표본이 다시 계산된다. 차이가 큰 글자 상위 20이 "아직 못 찾은 규칙" 목록이다.
 * 전역 스타일은 기본값으로 고정한다 — 여기서 재는 것은 배치뿐이다.
 */

type SampleKind = 'six' | 'full'
const VIEW = 300
const WORST_COUNT = 20
const BATCH = 6

function useScores(input: { chars: string[]; maps: JamoMaps; params: LayoutRuleParams; snapStems: boolean; modelReady: boolean; model: Parameters<typeof scoreGlyph>[0]['model'] }) {
  const { chars, maps, params, snapStems, modelReady, model } = input
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
            next.set(item.char, { char: item.char, ok: false, message: item.error, xor: { model: null, schema: 0, rule: 0 }, boxes: { schema: {}, rule: {}, model: null }, steps: [], limited: false, ink: { rule: [], ghost: [] } })
            continue
          }
          next.set(item.char, scoreGlyph({ char: item.char, maps, style: DEFAULT_STYLE, model, outline: item.glyph.outline, params, snapStems }))
        }
        setScores(new Map(next))
        setProgress({ done: Math.min(index + BATCH, chars.length), total: chars.length })
        await new Promise((resolve) => setTimeout(resolve, 0))
      }
    }
    void work()
    return () => { cancelled = true }
  }, [chars, maps, params, snapStems, modelReady, model])

  return { scores, progress }
}

/** 규칙 − 모델 차이를 색으로. 음수(규칙이 더 가까움)는 초록, 허용 안은 회색, 그 밖은 빨강이 짙어진다. */
function deltaColor(delta: number | null): string {
  if (delta === null) return 'rgb(var(--color-surface-3))'
  if (delta <= 0) return 'rgba(60, 170, 90, 0.35)'
  if (delta <= NOTO_DELTA_TOLERANCE) return 'rgba(120, 120, 120, 0.18)'
  const strength = Math.min(1, (delta - NOTO_DELTA_TOLERANCE) / 0.15)
  return `rgba(220, 60, 40, ${(0.2 + strength * 0.6).toFixed(2)})`
}

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
      <table className={styles.xorTable}><tbody>
        <tr><th>모델(지금 엔진)</th><td>{pct(score.xor.model)}</td></tr>
        <tr><th>스키마(규칙 끔)</th><td>{pct(score.xor.schema)}</td></tr>
        <tr><th>규칙</th><td>{pct(score.xor.rule)}</td></tr>
        <tr><th>규칙 − 모델</th><td>{signed(deltaOf(score))}</td></tr>
      </tbody></table>
      <ol className={styles.steps}>
        {score.steps.length === 0 && <li>움직인 규칙 없음</li>}
        {score.steps.map((step, index) => <li key={index} data-limited={step.limited || undefined}>
          <span style={{ color: PART_COLOR[step.part] }}>{PART_LABEL[step.part]}</span> · {LAYOUT_RULE_LABEL[step.rule]} — {step.note}
        </li>)}
      </ol>
    </div>
  </div>
}

export function LayoutRulesLabPage() {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const maps = useMemo<JamoMaps>(() => ({ choseong, jungseong, jongseong }), [choseong, jungseong, jongseong])
  const { bundle, error: modelError } = useNotoModel()

  const [params, setParams] = useState<LayoutRuleParams>(DEFAULT_LAYOUT_RULE_PARAMS)
  const [snapStems, setSnapStems] = useState(true)
  const [sample, setSample] = useState<SampleKind>('six')
  const [selected, setSelected] = useState<string>(REPRESENTATIVE_CHARS[1])
  const [show, setShow] = useState({ ghost: true, ink: true, schema: false, model: true, rule: true })

  const chars = useMemo(() => sample === 'six' ? [...REPRESENTATIVE_CHARS] : sampleChars(), [sample])
  const { scores, progress } = useScores({ chars, maps, params, snapStems, modelReady: Boolean(bundle) || Boolean(modelError), model: bundle })

  const list = useMemo(() => chars.map((char) => scores.get(char)).filter((score): score is ScoredGlyph => Boolean(score)), [chars, scores])
  const summary = useMemo(() => {
    const ok = list.filter((score) => score.ok)
    const withModel = ok.filter((score) => score.xor.model !== null)
    const deltas = withModel.map((score) => score.xor.rule - (score.xor.model ?? 0))
    return {
      count: ok.length,
      failed: list.length - ok.length,
      model: medianOf(withModel.map((score) => score.xor.model ?? 0)),
      schema: medianOf(ok.map((score) => score.xor.schema)),
      rule: medianOf(ok.map((score) => score.xor.rule)),
      within: deltas.filter((delta) => delta <= NOTO_DELTA_TOLERANCE).length,
      better: deltas.filter((delta) => delta <= 0).length,
      limited: ok.filter((score) => score.limited).length,
    }
  }, [list])
  const worst = useMemo(() => list.filter((score) => deltaOf(score) !== null).sort((a, b) => (deltaOf(b) ?? 0) - (deltaOf(a) ?? 0)).slice(0, WORST_COUNT), [list])
  const selectedScore = scores.get(selected) ?? null

  const toggleRule = (rule: LayoutRuleId) => setParams((prev) => ({ ...prev, rules: { ...prev.rules, [rule]: !prev.rules[rule] } }))
  const gateColor = (value: number | null, base: number | null) => value === null || base === null ? undefined : value <= base + NOTO_DELTA_TOLERANCE ? styles.pass : styles.over

  return <div className={styles.page} data-testid="layout-rules-lab">
    <header className={styles.header}>
      <span>Layout rules lab</span>
      <h1>배치 규칙 채점판</h1>
      <p>Split + Padding 상자에서 출발해 규칙을 먹인 자리와, 지금 엔진(노토 변화량 모델)의 자리가 노토와 얼마나 가까운지 xor로 잰다. 숫자가 작을수록 노토에 가깝다. 색은 규칙 − 모델: 초록이면 규칙이 더 가깝고, 회색은 +{NOTO_DELTA_TOLERANCE} 안, 빨강은 그보다 멀다.</p>
    </header>

    <LayoutRuleFindings params={params} />

    <section className={styles.controls}>
      <div className={styles.group}>
        <h3>규칙</h3>
        {LAYOUT_RULE_ORDER.map((rule) => <label key={rule}><input type="checkbox" checked={params.rules[rule]} onChange={() => toggleRule(rule)} data-testid={`rule-${rule}`} /> {LAYOUT_RULE_LABEL[rule]}</label>)}
        <label><input type="checkbox" checked={snapStems} onChange={() => setSnapStems((value) => !value)} /> 홀자 안쪽 줄기를 노토 보선에 맞춤</label>
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
        <h3>그림</h3>
        {(['ghost', 'ink', 'rule', 'model', 'schema'] as const).map((key) => <label key={key}><input type="checkbox" checked={show[key]} onChange={() => setShow((prev) => ({ ...prev, [key]: !prev[key] }))} /> {({ ghost: '노토 고스트', ink: '우리 잉크(규칙 자리)', rule: '규칙 상자', model: '모델 상자(점선)', schema: '스키마 상자(파선)' })[key]}</label>)}
      </div>
    </section>

    <section className={styles.summary} data-testid="layout-rules-summary">
      {modelError && <span className={styles.fail}>모델을 못 읽었다: {modelError}</span>}
      <span>계산 {progress.done}/{progress.total}{summary.failed ? ` · 실패 ${summary.failed}` : ''}</span>
      <span>xor 중앙값 — 모델 <b>{pct(summary.model)}</b> · 스키마 <b>{pct(summary.schema)}</b> · 규칙 <b className={gateColor(summary.rule, summary.model)}>{pct(summary.rule)}</b></span>
      <span>모델 + {NOTO_DELTA_TOLERANCE} 안 <b>{summary.within}</b>/{summary.count} · 규칙이 더 가까움 <b>{summary.better}</b> · 한계에 닿음 <b>{summary.limited}</b></span>
    </section>

    <section className={styles.body}>
      <div className={styles.gridWrap}>
        <div className={styles.grid} data-testid="layout-rules-grid">
          {chars.map((char) => {
            const score = scores.get(char)
            const delta = score ? deltaOf(score) : null
            return <button key={char} type="button" className={styles.cell} style={{ background: score ? deltaColor(delta) : undefined }} aria-pressed={char === selected} onClick={() => setSelected(char)} title={score?.ok ? `규칙 ${pct(score.xor.rule)} · 모델 ${pct(score.xor.model)}` : score?.message} data-failed={score && !score.ok ? '' : undefined}>
              <span className={styles.cellChar}>{char}</span>
              <span className={styles.cellValue}>{score?.ok ? signed(delta) : score ? '!' : ''}</span>
            </button>
          })}
        </div>
        <div className={styles.worst}>
          <h3>차이 큰 글자 {WORST_COUNT} — 아직 못 찾은 규칙</h3>
          <ol>
            {worst.map((score) => <li key={score.char}><button type="button" onClick={() => setSelected(score.char)} aria-pressed={score.char === selected}>{score.char}</button> 규칙 {pct(score.xor.rule)} · 모델 {pct(score.xor.model)} · <b>{signed(deltaOf(score))}</b>{score.limited ? ' · 한계' : ''}</li>)}
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
