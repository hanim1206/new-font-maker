import { useEffect, useMemo, useState } from 'react'
// @ts-expect-error opentype.js에 타입 정의 파일 없음
import * as opentype from 'opentype.js'
import { SPECTRUM_FONT_API, SPECTRUM_FONTS, type SpectrumFont } from './spectrumFonts'
import styles from './SpectrumLabPage.module.css'

/**
 * 성격 스펙트럼 실험실. 플랜 `첫 생성 패드`의 재료 — 여러 폰트의 대표 글자를 같은 잣대로 놓고 본다.
 * 지금은 보기만 한다. 축(`꽉 참 ↔ 성김`, `위로 ↔ 아래로`)을 재고 패드에 찍는 건 다음 단계에서 이 화면에 더한다.
 * 저장하지 않고 제품 값도 안 바꾼다.
 */

const DEFAULT_TEXT = '가각고곡과곽률뷁'
const DEFAULT_SENTENCE = '다람쥐 헌 쳇바퀴에 타고파'
/** 네모꼴 세로 가운데를 잡는 글자들. 입력 글자와 상관없이 폰트마다 한 번 정한다. */
const BODY_PROBE = '가나다라마바사아자차카타파하한글'

/** 이 화면이 쓰는 opentype.js 조각. */
interface OtGlyph {
  index: number
  advanceWidth?: number
  getBoundingBox(): { y1: number; y2: number }
  getPath(x: number, y: number, fontSize: number): { toPathData(decimals: number): string }
}

interface OtFont {
  unitsPerEm: number
  charToGlyph(ch: string): OtGlyph | null
}

const parseFont = (buffer: ArrayBuffer): OtFont => (opentype as { parse(buffer: ArrayBuffer): OtFont }).parse(buffer)

interface LoadedFont {
  meta: SpectrumFont
  font: OtFont
  upm: number
  /** 한글 잉크 위아래 가운데(폰트 단위, 위가 +). 네모꼴을 이 높이에 세운다. */
  bodyMid: number
}

type LoadState = { font: LoadedFont } | { error: string }

interface GlyphShape {
  path: string
  advance: number
  missing: boolean
}

function bodyMidOf(font: OtFont): number {
  let min = Infinity
  let max = -Infinity
  for (const ch of BODY_PROBE) {
    const glyph = font.charToGlyph(ch)
    if (!glyph || glyph.index === 0) continue
    const box = glyph.getBoundingBox()
    min = Math.min(min, box.y1)
    max = Math.max(max, box.y2)
  }
  return Number.isFinite(min) ? (min + max) / 2 : font.unitsPerEm * 0.38
}

async function loadFont(meta: SpectrumFont): Promise<LoadedFont> {
  const response = await fetch(`${SPECTRUM_FONT_API}/${meta.id}`)
  if (!response.ok) throw new Error(await response.text())
  const font = parseFont(await response.arrayBuffer())
  return { meta, font, upm: font.unitsPerEm, bodyMid: bodyMidOf(font) }
}

function shapeOf(font: LoadedFont, ch: string): GlyphShape {
  const glyph = font.font.charToGlyph(ch)
  const missing = !glyph || glyph.index === 0
  const advance = glyph?.advanceWidth ?? font.upm
  return { path: missing || !glyph ? '' : glyph.getPath(0, 0, font.upm).toPathData(1), advance, missing }
}

function GlyphTile({ font, ch, size, showBox }: { font: LoadedFont; ch: string; size: number; showBox: boolean }) {
  const shape = useMemo(() => shapeOf(font, ch), [font, ch])
  const top = -(font.bodyMid + font.upm / 2)
  const width = (shape.advance / font.upm) * size
  return (
    <svg className={styles.tile} width={width} height={size} viewBox={`0 ${top} ${shape.advance} ${font.upm}`} data-missing={shape.missing || undefined}>
      {showBox && <rect className={styles.box} x={0} y={top} width={shape.advance} height={font.upm} />}
      {showBox && <line className={styles.mid} x1={0} x2={shape.advance} y1={-font.bodyMid} y2={-font.bodyMid} />}
      {shape.missing ? <text className={styles.missing} x={shape.advance / 2} y={-font.bodyMid} fontSize={font.upm * 0.14}>없음</text> : <path className={styles.ink} d={shape.path} />}
    </svg>
  )
}

function SentenceLine({ font, text, size }: { font: LoadedFont; text: string; size: number }) {
  const shapes = useMemo(() => {
    let x = 0
    return [...text].map((ch) => {
      const shape = ch === ' ' ? { path: '', advance: font.upm * 0.25, missing: false } : shapeOf(font, ch)
      const placed = { ...shape, x }
      x += shape.advance
      return placed
    })
  }, [font, text])
  const total = shapes.reduce((sum, shape) => sum + shape.advance, 0) || font.upm
  const top = -(font.bodyMid + font.upm / 2)
  return (
    <svg className={styles.sentence} width={(total / font.upm) * size} height={size} viewBox={`0 ${top} ${total} ${font.upm}`}>
      {shapes.map((shape, index) => shape.path && <path key={index} className={styles.ink} d={shape.path} transform={`translate(${shape.x} 0)`} />)}
    </svg>
  )
}

export function SpectrumLabPage() {
  const [loaded, setLoaded] = useState<Record<string, LoadState>>({})
  const [text, setText] = useState(DEFAULT_TEXT)
  const [sentence, setSentence] = useState(DEFAULT_SENTENCE)
  const [size, setSize] = useState(72)
  const [showBox, setShowBox] = useState(true)
  const [showDisplay, setShowDisplay] = useState(true)

  useEffect(() => {
    let alive = true
    for (const meta of SPECTRUM_FONTS) {
      loadFont(meta).then(
        (font) => alive && setLoaded((prev) => ({ ...prev, [meta.id]: { font } })),
        (error: unknown) => alive && setLoaded((prev) => ({ ...prev, [meta.id]: { error: error instanceof Error ? error.message : String(error) } })),
      )
    }
    return () => { alive = false }
  }, [])

  const fonts = SPECTRUM_FONTS.filter((meta) => showDisplay || meta.use === '본문')
  const chars = [...text].filter((ch) => ch.trim() !== '')
  const done = Object.keys(loaded).length

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <div>
          <span>Spectrum Lab</span>
          <h1>성격 스펙트럼</h1>
          <p>첫 생성 패드의 재료. 여러 폰트의 대표 글자를 같은 크기의 네모꼴에 세워 본다. 네모꼴은 글자 폭 × em이고, 세로는 한글 잉크 가운데에 맞췄다.</p>
        </div>
      </header>

      <section className={styles.controls}>
        <label className={styles.field}>
          <span>글자</span>
          <input value={text} onChange={(event) => setText(event.target.value)} />
        </label>
        <label className={styles.field}>
          <span>문장</span>
          <input value={sentence} onChange={(event) => setSentence(event.target.value)} />
        </label>
        <label className={styles.slider}>
          <span>크기 <strong>{size}</strong></span>
          <input type="range" min={40} max={160} value={size} onChange={(event) => setSize(Number(event.target.value))} />
        </label>
        <div className={styles.toggles}>
          <label><input type="checkbox" checked={showBox} onChange={(event) => setShowBox(event.target.checked)} /> 네모꼴 보기</label>
          <label><input type="checkbox" checked={showDisplay} onChange={(event) => setShowDisplay(event.target.checked)} /> 제목용 폰트도</label>
          <span className={styles.status}>{done < SPECTRUM_FONTS.length ? `불러오는 중 ${done}/${SPECTRUM_FONTS.length}` : `${SPECTRUM_FONTS.length}개`}</span>
        </div>
      </section>

      <section className={styles.rows}>
        {fonts.map((meta) => {
          const state = loaded[meta.id]
          return (
            <article key={meta.id} className={styles.row}>
              <div className={styles.name}>
                <strong>{meta.name}</strong>
                <small>{meta.use}{state && 'font' in state ? ` · upm ${state.font.upm}` : ''}</small>
              </div>
              {!state && <p className={styles.status}>불러오는 중</p>}
              {state && 'error' in state && <p className={styles.status} data-state="error">{state.error}</p>}
              {state && 'font' in state && (
                <div className={styles.glyphs}>
                  <div className={styles.tiles}>
                    {chars.map((ch, index) => <GlyphTile key={`${ch}-${index}`} font={state.font} ch={ch} size={size} showBox={showBox} />)}
                  </div>
                  {sentence.trim() && <SentenceLine font={state.font} text={sentence} size={Math.round(size * 0.5)} />}
                </div>
              )}
            </article>
          )
        })}
      </section>
    </main>
  )
}
