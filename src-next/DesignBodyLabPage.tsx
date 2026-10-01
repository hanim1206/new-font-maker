import { useMemo, useState } from 'react'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { stemScaleExponentFor, stemScaleForBody, withBodyCompensation } from '../src/services/bodyCompensation'
import { designBodyPaddingForSize, isReferenceBody, REFERENCE_HEIGHT, REFERENCE_WIDTH } from '../src/services/designBodyPlacement'
import { hangulAdvance, hangulOriginX, SPACE_ADVANCE, UPM } from '../src/services/fontMetrics'
import { effectiveStyleOf, useGlobalStyleStore } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { useLayoutStore } from '../src/stores/layoutStore'
import type { ResolvedStrokeInkSource } from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { GlyphLayoutEditor } from './GlyphLayoutEditor'
import { useContextPlacement } from './notoModel'
import { PART_COLOR } from './partColors'
import styles from './DesignBodyLabPage.module.css'

/**
 * 네모꼴 실험실. 플랜 `docs/plans/2026-10-01_네모꼴-열기.md`의 확인 화면이다.
 * 제품의 네모꼴 탭이 잠겨 있는 동안 여기서 네모꼴 · 굵기를 바꾸고, 문장과 레이아웃 편집(제품과 같은 부품)이 같은 글자인지 본다.
 * 값은 지금 연 폰트의 것을 그대로 고친다 — 따로 저장하는 실험값이 아니다.
 * 네모꼴은 가로만 바꾼다(2026-10-01 사용자 결정). 세로는 노토 몸통 높이에 고정이고, 막대를 움직이면 세로도 그 높이로 돌아온다.
 */

const FONT_SPACE = { width: 1000, height: 1000 }
const BODY_W = Math.round(REFERENCE_WIDTH * 1000)
const BODY_H = Math.round(REFERENCE_HEIGHT * 1000)
const BODY_MIN = 500
const BODY_MAX = 1000
const DEFAULT_SENTENCE = '한 포도밭에 햇살이 쏟아졌다 빼 웨 를 뷁'
const PRESETS: { label: string; width: number }[] = [
  { label: '500', width: 500 },
  { label: '600', width: 600 },
  { label: '700', width: 700 },
  { label: `기본 ${BODY_W}`, width: BODY_W },
  { label: '920', width: 920 },
  { label: '1000', width: 1000 },
]
/** 기본 가로에 대한 비율(%). 가변 폰트의 폭 축과 같은 읽기다. */
const percentOf = (width: number) => Math.round(width / BODY_W * 100)
/** 문장 줄의 글자 크기(px). 1em이 이만큼이다. */
const SENTENCE_EM = 64
/** 크게 보기 칸의 글자 크기(px). */
const ZOOM_EM = 220
const isSyllable = (ch: string) => { const code = ch.codePointAt(0) ?? 0; return code >= 0xac00 && code <= 0xd7a3 }

/**
 * 견줘 볼 보정 세기. 세로줄기 배율 = 가로 비율 ^ 세기. `null`은 보정 끔(2단계까지의 글자), `'auto'`는 제품이 지금 굵기에 맞춰 고르는 세기다.
 * 고정 세기 셋은 이 화면에서만 그려 본다.
 */
type Strength = number | null | 'auto'
const STRENGTHS: { exponent: Strength; label: string }[] = [
  { exponent: null, label: '보정 끔' },
  { exponent: 0.5, label: '약 0.5' },
  { exponent: 0.75, label: '중 0.75' },
  { exponent: 1, label: '강 1' },
  { exponent: 'auto', label: '제품' },
]
const partColorOf = (source: ResolvedStrokeInkSource) => PART_COLOR[source.part]

/** 지금 폰트의 글자 하나를 주어진 보정 세기로 그린다. `colored`면 자소마다 색을 달리한다. */
function LabGlyph({ char, size, exponent, colored = false }: { char: string; size: number; exponent: Strength; colored?: boolean }) {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const padding = useLayoutStore((state) => state.globalPadding)
  const stored = useGlobalStyleStore((state) => state.style)
  const exclusions = useGlobalStyleStore((state) => state.exclusions)
  const syllable = useMemo(() => decomposeSyllable(char, choseong, jungseong, jongseong), [char, choseong, jungseong, jongseong])
  // 제품의 켬 · 끔과 상관없이 이 줄의 세기로 얹는다.
  const globalStyle = useMemo(() => {
    const base = { ...effectiveStyleOf(stored, exclusions, syllable.layoutType), autoCompensation: undefined }
    return exponent === null ? base : exponent === 'auto' ? withBodyCompensation(base, padding) : withBodyCompensation(base, padding, exponent)
  }, [stored, exclusions, syllable.layoutType, padding, exponent])
  const schema = { ...schemas[syllable.layoutType], padding, designBodyPadding: padding }
  const { placement } = useContextPlacement(syllable, schema, globalStyle)
  return <SvgRenderer syllable={syllable} schema={placement.kind === 'schema' ? placement.schema : undefined} boxes={placement.kind === 'boxes' ? placement.boxes : undefined} size={size} globalStyle={globalStyle} overflow="visible" clipGlyphs={false} strokeColorOf={colored ? partColorOf : undefined} />
}

export function DesignBodyLabPage() {
  const padding = useLayoutStore((state) => state.globalPadding)
  const setGlobalPadding = useLayoutStore((state) => state.setGlobalPadding)
  const weight = useGlobalStyleStore((state) => state.style.weight)
  const letterSpacing = useGlobalStyleStore((state) => state.style.letterSpacing)
  const updateStyle = useGlobalStyleStore((state) => state.updateStyle)
  const autoOn = useGlobalStyleStore((state) => state.style.autoCompensation !== false)
  const setAutoCompensation = useGlobalStyleStore((state) => state.setAutoCompensation)
  const width = Math.round((1 - padding.left - padding.right) * FONT_SPACE.width)
  const height = Math.round((1 - padding.top - padding.bottom) * FONT_SPACE.height)
  const setWidth = (nextWidth: number) => setGlobalPadding(designBodyPaddingForSize(nextWidth, BODY_H, FONT_SPACE))

  const [sentence, setSentence] = useState(DEFAULT_SENTENCE)
  const chars = useMemo(() => [...sentence], [sentence])
  const [picked, setPicked] = useState('한')
  const shown = isSyllable(picked) ? picked : chars.find(isSyllable) ?? '한'
  const encoded = encodeURIComponent(shown)
  // 뽑은 폰트와 같은 글자 폭 · 원점으로 놓는다 — 자간까지 실제와 같게 본다.
  const advance = hangulAdvance(padding, letterSpacing) / UPM * SENTENCE_EM
  const origin = hangulOriginX(padding) * SENTENCE_EM
  const same = isReferenceBody(padding)
  const sentenceRow = (exponent: Strength) => chars.map((ch, index) => isSyllable(ch)
    ? <button key={`${ch}-${index}`} type="button" style={{ width: advance, height: SENTENCE_EM }} aria-pressed={ch === shown} onClick={() => setPicked(ch)} aria-label={`${ch} 열기`}><span style={{ marginLeft: -origin }}><LabGlyph char={ch} size={SENTENCE_EM} exponent={exponent} /></span></button>
    : <span key={`gap-${index}`} style={{ flex: `0 0 ${SPACE_ADVANCE / UPM * SENTENCE_EM}px` }} />)
  /** 세로줄기가 얼마나 얇아지나(%). 0이면 그대로. */
  const productExponent = stemScaleExponentFor(weight)
  const thinnedBy = (exponent: Strength) => exponent === null ? 0 : Math.round((1 - stemScaleForBody(padding, exponent === 'auto' ? productExponent : exponent)) * 100)
  // 제품 줄에는 지금 굵기에서 고른 세기를 같이 적는다.
  const rowLabel = (item: (typeof STRENGTHS)[number]) => item.exponent === 'auto' ? `제품 ${productExponent.toFixed(2)}` : item.label

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <span>Design Body Lab</span>
        <h1>네모꼴</h1>
        <p>네모꼴과 굵기를 바꿔 자동 굵기 보정을 세기별로 견준다. 가로를 좁히면 세로줄기만 얇아지고, 굵을수록 세게 얇아진다. 지금 연 폰트의 값을 그대로 고친다.</p>
      </header>

      <section className={styles.controls}>
        <label className={`${styles.slider} ${styles.wide}`}>
          <span>가로 <strong>{width}</strong> · {percentOf(width)}%</span>
          <input type="range" min={BODY_MIN} max={BODY_MAX} step={5} value={width} onChange={(event) => setWidth(Number(event.target.value))} data-testid="body-lab-width" />
        </label>
        <label className={styles.slider}>
          <span>굵기 <strong>{weight}</strong></span>
          <input type="range" min={100} max={900} step={100} value={weight} onChange={(event) => updateStyle('weight', Number(event.target.value))} data-testid="body-lab-weight" />
        </label>
        <div className={styles.presets}>
          {PRESETS.map((preset) => <button key={preset.label} type="button" aria-pressed={preset.width === width && height === BODY_H} onClick={() => setWidth(preset.width)}>{preset.label}</button>)}
          {height !== BODY_H && <span className={styles.note} data-testid="body-lab-height-note">세로가 {height}로 저장돼 있어요. 가로를 움직이면 {BODY_H}로 돌아와요.</span>}
        </div>
        <label className={styles.toggle}>
          <input type="checkbox" checked={autoOn} onChange={(event) => setAutoCompensation(event.target.checked)} data-testid="body-lab-auto" />
          <span>자동 보정{autoOn ? thinnedBy('auto') > 0 ? ` · 세로줄기 −${thinnedBy('auto')}%` : ' · 지금은 보정할 게 없어요' : ' 끔'}</span>
          <small>제품과 아래 레이아웃 편집에 먹는 값. 폰트에 저장된다.</small>
        </label>
        <label className={styles.field}>
          <span>문장</span>
          <input value={sentence} onChange={(event) => setSentence(event.target.value)} />
        </label>
      </section>

      {/* 보정 세기별 문장. 기본 가로 · 넓힌 가로에서는 네 줄이 같다. 문장은 뽑은 폰트와 같은 글자 폭으로 놓는다. */}
      <section className={styles.compare} aria-label="보정 세기별 문장" data-testid="body-lab-sentence">
        {STRENGTHS.map((item) => <div key={item.label} className={styles.row} data-product={item.exponent === 'auto' || undefined}>
          <span className={styles.rowLabel}>{rowLabel(item)}<small>{thinnedBy(item.exponent) > 0 ? `세로줄기 −${thinnedBy(item.exponent)}%` : '그대로'}</small></span>
          <div className={styles.sentence}>{sentenceRow(item.exponent)}</div>
        </div>)}
        {same && <p className={styles.note}>기본 가로에서는 네 줄이 같아요. 가로를 좁혀 보세요.</p>}
      </section>

      {/* 고른 글자를 크게. 자소마다 색을 달리해 자소 사이 틈과 자소 안 속공간이 보인다. */}
      <section className={styles.zoom} aria-label={`${shown} 크게 보기`} data-testid="body-lab-zoom">
        {STRENGTHS.map((item) => <figure key={item.label} data-product={item.exponent === 'auto' || undefined}>
          <div className={styles.zoomGlyph} style={{ width: ZOOM_EM, height: ZOOM_EM }}><LabGlyph char={shown} size={ZOOM_EM} exponent={item.exponent} colored /></div>
          <figcaption>{rowLabel(item)}</figcaption>
        </figure>)}
        <p className={styles.zoomHelp}><b>볼 곳:</b> 같은 색 안의 흰 속공간(ㅃ · ㅐ의 기둥 사이)이 살아 있는지, 세로줄기가 가로줄기보다 너무 가늘어 보이지 않는지. 초록 = 첫닿자, 파랑 = 홀자, 보라 = 받침.</p>
      </section>

      <section className={styles.editor}>
        <div className={styles.editorHead}>
          <strong>레이아웃 편집 · {shown}</strong>
          <span>
            <a href={`/workspace/jamo?char=${encoded}`}>제품 화면에서 열기</a>
            <a href={`/workspace/jamo?mode=stroke&char=${encoded}`}>획 편집으로 열기</a>
          </span>
        </div>
        <GlyphLayoutEditor key={shown} codepoint={shown.codePointAt(0)!} onPickCharacter={setPicked} />
      </section>
    </main>
  )
}
