import { useMemo, useState } from 'react'
import ghosts from '../reference-data/noto-weight-ghosts.v1.json'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { useEffectiveGlobalStyle, weightToMultiplier, type GlobalStyle } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { useLayoutStore } from '../src/stores/layoutStore'
import type { BoxConfig, LayoutSchema, Padding, Part } from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { useContextPlacement, useNotoModel } from './notoModel'
import { NOTO_WEIGHT_STEPS, appThicknessErrorAt, notoCenterlineInset, notoOuterEdgeGrowthShare, notoThicknessMultiplier, notoWeightRow } from './notoWeightCurve'
import styles from './WeightLabPage.module.css'

/**
 * 굵기 보정 실험실. 플랜 `2026-09-25_굵기-보정-층`의 화면.
 * 같은 글자를 세 칸에 놓는다 — 지금 앱처럼 중심선을 두고 배율만 곱한 것, 노토 굵기 곡선을 얹은 것, 노토 실제 윤곽.
 * 굵기 막대를 움직이며 두께 · 속공간 · 상자가 어디서 벌어지는지 본다. 저장하지 않고 제품 값도 안 바꾼다.
 */

interface GhostTable {
  weights: number[]
  characters: Record<string, { initialJamo: string; medialJamo: string; weights: Record<string, { path: string; componentPath: string | null }> }>
}

const GHOSTS = ghosts as unknown as GhostTable
const CHARACTERS = Object.keys(GHOSTS.characters)
/** 앱 획 데이터의 기본 두께(정규화). 옛 편집기의 `BASE_THICKNESS`와 같은 값 — 상자 밀기의 Δt 계산에만 쓴다. */
const BASE_THICKNESS = 0.07
const VIEW_BOX = 100
const GLYPH_SIZE = 280

type Mode = 'naive' | 'corrected'

function withEffectivePadding(schema: LayoutSchema, globalPadding: Padding, override: Partial<Padding> | undefined): LayoutSchema {
  const padding = { ...globalPadding, ...override }
  return { ...schema, padding, designBodyPadding: padding }
}

function insetBoxes(boxes: Partial<Record<Part, BoxConfig>>, inset: number): Partial<Record<Part, BoxConfig>> {
  const out: Partial<Record<Part, BoxConfig>> = {}
  for (const [part, box] of Object.entries(boxes) as [Part, BoxConfig][]) {
    out[part] = { x: box.x + inset, y: box.y + inset, width: Math.max(box.width - inset * 2, 0), height: Math.max(box.height - inset * 2, 0) }
  }
  return out
}

/** 지금 프로젝트의 획으로 그린 글자. `AppGlyph`와 같은 길이지만 굵기와 배율을 밖에서 준다. */
function LabGlyph({ char, weight, mode, ghostPath, showGhost }: { char: string; weight: number; mode: Mode; ghostPath: string | undefined; showGhost: boolean }) {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const syllable = useMemo(() => decomposeSyllable(char, choseong, jungseong, jongseong), [char, choseong, jungseong, jongseong])
  const effectiveStyle = useEffectiveGlobalStyle(syllable.layoutType)
  // 기울기는 빼고 굵기만 바꾼다. 실험은 굵기 하나만 본다.
  const globalStyle = useMemo<GlobalStyle>(() => ({ ...effectiveStyle, slant: 0, weight }), [effectiveStyle, weight])
  const schema = withEffectivePadding(schemas[syllable.layoutType], globalPadding, paddingOverrides[syllable.layoutType])
  const { placement } = useContextPlacement(syllable, schema, globalStyle)
  const multiplier = mode === 'naive' ? weightToMultiplier(weight) : notoThicknessMultiplier(weight)
  const inset = mode === 'corrected' ? notoCenterlineInset(weight, BASE_THICKNESS) : 0
  const boxes = placement.kind === 'boxes' ? (inset === 0 ? placement.boxes : insetBoxes(placement.boxes, inset)) : undefined

  return (
    <div className={styles.glyph} data-testid={`weight-lab-glyph-${mode}`} data-multiplier={multiplier.toFixed(3)} data-placement={placement.kind}>
      <SvgRenderer
        syllable={syllable}
        schema={placement.kind === 'schema' ? placement.schema : undefined}
        boxes={boxes}
        size={GLYPH_SIZE}
        globalStyle={globalStyle}
        weightMultiplier={multiplier}
        overflow="visible"
        clipGlyphs={false}
        underlay={showGhost && ghostPath ? <path d={ghostPath} transform={`scale(${VIEW_BOX / 1000})`} className={styles.ghostUnder} /> : undefined}
      />
    </div>
  )
}

function percent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined) return '—'
  return `${(value * 100).toFixed(digits)}%`
}

function ratio(value: { median: number; q1: number; q3: number } | null | undefined): string {
  if (!value) return '—'
  return `${value.median.toFixed(2)} (${value.q1.toFixed(2)}–${value.q3.toFixed(2)})`
}

export function WeightLabPage() {
  const [char, setChar] = useState(CHARACTERS.includes('마') ? '마' : CHARACTERS[0])
  const { bundle, error: modelError } = useNotoModel()
  const [weight, setWeight] = useState(900)
  const [showGhost, setShowGhost] = useState(true)
  const ghost = GHOSTS.characters[char]?.weights[String(weight)]
  const row = notoWeightRow(weight)
  const appMultiplier = weightToMultiplier(weight)
  const notoVertical = notoThicknessMultiplier(weight)
  const notoHorizontal = notoThicknessMultiplier(weight, 'horizontal')
  const error = appThicknessErrorAt(weight)
  const share = notoOuterEdgeGrowthShare(weight)
  const inset = notoCenterlineInset(weight, BASE_THICKNESS)

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>Weight lab</span>
          <h1>굵기 보정 실험실</h1>
          <p>같은 글자를 세 칸에 놓고 굵기를 움직인다. 왼쪽은 지금 앱(중심선 고정 · 배율만), 가운데는 노토 굵기 곡선을 얹은 것, 오른쪽은 노토 실제 윤곽. 저장하지 않는다.</p>
        </div>
        <a href="/workspace/jamo">자소 편집으로</a>
      </header>

      <section className={styles.controls} aria-label="실험 조건">
        <div className={styles.chips} role="tablist" aria-label="글자">
          {CHARACTERS.map((item) => (
            <button key={item} type="button" role="tab" aria-selected={item === char} onClick={() => setChar(item)}>{item}</button>
          ))}
        </div>
        <label className={styles.slider}>
          <span>굵기 <strong data-testid="weight-lab-weight">{weight}</strong></span>
          <input type="range" min={NOTO_WEIGHT_STEPS[0]} max={NOTO_WEIGHT_STEPS[NOTO_WEIGHT_STEPS.length - 1]} step={100} value={weight} aria-label="굵기" onChange={(event) => setWeight(Number(event.target.value))} />
        </label>
        <label className={styles.toggle}>
          <input type="checkbox" checked={showGhost} onChange={(event) => setShowGhost(event.target.checked)} />
          앱 글자 아래에 노토 고스트 깔기
        </label>
        <p className={styles.status} data-testid="weight-lab-model" data-state={bundle ? 'ready' : modelError ? 'error' : 'loading'}>
          {bundle ? '노토 모델 상자로 배치한다. 가운데 칸의 상자 밀기가 살아 있다.' : modelError ? `노토 모델을 못 읽어 스키마 배치로 그린다. 상자 밀기는 안 걸린다 — ${modelError}` : '노토 모델을 읽는 중…'}
        </p>
      </section>

      <section className={styles.panels}>
        <article className={styles.panel}>
          <h2>단순 두껍게 <small>지금 앱 · 배율 {appMultiplier.toFixed(2)}</small></h2>
          <LabGlyph char={char} weight={weight} mode="naive" ghostPath={ghost?.path} showGhost={showGhost} />
          <p>중심선은 그대로, 두께만 <code>weightToMultiplier</code>로 곱한다.</p>
        </article>
        <article className={styles.panel}>
          <h2>노토 곡선 보정 <small>배율 {notoVertical.toFixed(2)} · 상자 {inset >= 0 ? '−' : '+'}{Math.abs(inset * 1000).toFixed(1)}u</small></h2>
          <LabGlyph char={char} weight={weight} mode="corrected" ghostPath={ghost?.path} showGhost={showGhost} />
          <p>두께는 노토가 잰 배율, 중심선 상자는 바깥 변이 노토만큼만 자라게 안으로 민다.</p>
        </article>
        <article className={styles.panel}>
          <h2>노토 실제 <small>wght {weight}</small></h2>
          <div className={styles.glyph}>
            <svg width={GLYPH_SIZE} height={GLYPH_SIZE} viewBox={`0 0 ${VIEW_BOX} ${VIEW_BOX}`} role="img" aria-label={`${char} 노토 ${weight}`}>
              {ghost ? <path d={ghost.path} transform={`scale(${VIEW_BOX / 1000})`} className={styles.ghost} data-testid="weight-lab-ghost" /> : null}
            </svg>
          </div>
          <p>같은 파일의 <code>wght</code> 축을 옮겨 그린 윤곽. 곡선은 편 폴리곤이다.</p>
        </article>
      </section>

      <section className={styles.numbers} aria-label="측정값">
        <h2>노토가 400 대비 {weight}에서 한 일 <small>첫닿자 19자 × ㅏ · ㅗ, 중앙값(사분위)</small></h2>
        <table>
          <tbody>
            <tr><th>세로줄기 두께 배율</th><td data-testid="weight-lab-noto-vertical">{ratio(row?.verticalThicknessRatio)}</td><th>앱 배율</th><td>{appMultiplier.toFixed(2)}</td><th>앱이 더 두꺼운 정도</th><td data-testid="weight-lab-error">{percent(error)}</td></tr>
            <tr><th>가로줄기 두께 배율</th><td>{ratio(row?.horizontalThicknessRatio)}</td><th>세로 ÷ 가로</th><td>{(notoVertical / notoHorizontal).toFixed(3)}</td><th>홀자 기둥 · 보 배율</th><td>{row?.medialStemRatio?.median.toFixed(2) ?? '—'} · {row?.medialBeamRatio?.median.toFixed(2) ?? '—'}</td></tr>
            <tr><th>속공간 배율 (가로 · 세로)</th><td>{ratio(row?.counterRatioAcrossX)}</td><td colSpan={2}>{ratio(row?.counterRatioAcrossY)}</td><th>첫닿자 상자 폭 · 높이 배율</th><td>{row?.boxWidthRatio?.median.toFixed(3) ?? '—'} · {row?.boxHeightRatio?.median.toFixed(3) ?? '—'}</td></tr>
            <tr><th>바깥 변으로 나간 몫</th><td>{ratio(row?.outerEdgeGrowthShare)}</td><th>중심선 안쪽 밀림 ÷ Δt</th><td>{ratio(row?.centerShiftPerThicknessDelta)}</td><th>보정 상자 한 변 밀기</th><td>{(inset * 1000).toFixed(1)}u (몫 {share.toFixed(2)})</td></tr>
          </tbody>
        </table>
        <p className={styles.note}>바깥 변 몫이 0.5면 지금 앱처럼 중심선이 고정된 것이다. 곧은 줄기(ㅁ · ㄴ · ㅇ)는 0.3 안팎으로 안쪽으로 더 자라고, 사선과 겹닿자는 0.5 근처라 중앙값이 0.47이다. 굵기별 표는 <code>reference-data/noto-weight-pooled.v1.json</code>.</p>
      </section>
    </main>
  )
}
