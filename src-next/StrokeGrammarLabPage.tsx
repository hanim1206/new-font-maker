import { useMemo, useState } from 'react'
import baseJamos from '../src/data/baseJamos.json'
import { useGlobalStyleStore } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { DEFAULT_STEM_BEAK, STEM_BEAK_SHAPES, stemBeakInkGroups, type StemBeakStyle } from '../src/services/stemBeak'
import {
  describeJamoStrokes,
  STEM_NAME_LABEL,
  STEM_SHAPE_LABEL,
  type JamoType,
  type StemName,
  type StrokeDescription,
} from '../src/services/strokeGrammar'
import type { AnchorPoint, JamoData, StrokeDataV2 } from '../src/types'
import { AppGlyph } from './AppGlyph'
import { BeakShapeThumb } from './StemBeakControls'
import styles from './StrokeGrammarLabPage.module.css'

/**
 * 획 문법 확인 화면. 낱자 67개를 줄기 이름별 색으로 그려 표가 맞는지 눈으로 본다.
 * 사용자가 승인하기 전에는 다른 기능이 표를 읽지 않는다 — 여기는 보기만 한다.
 */

type Source = 'preset' | 'mine'

const SECTIONS: ReadonlyArray<{ type: JamoType; title: string }> = [
  { type: 'choseong', title: '첫닿자' },
  { type: 'jungseong', title: '홀자' },
  { type: 'jongseong', title: '받침' },
]

const NAME_COLOR: Readonly<Record<StemName, string>> = {
  gidung: '#1d4f9b',
  bo: '#c2410c',
  gyeotjulgi: '#0f8a5f',
  jjalbeungidung: '#7c3aed',
  geolchim: '#b8860b',
  deotjulgi: '#be185d',
  kkokji: '#0e7490',
}
const UNNAMED_COLOR = '#475569'
const FREE_COLOR = '#dc2626'

const CHANNEL_TITLE: Readonly<Record<StrokeDescription['channel'], string>> = {
  strokes: '',
  horizontalStrokes: '가로부',
  verticalStrokes: '세로부',
}

const PRESETS = baseJamos as unknown as Record<JamoType, Record<string, JamoData>>

const BOX = 100
const PAD = 14
const UNIT_BOX = { x: 0, y: 0, width: 1, height: 1 }
/** 부리를 실제 글자에서 보는 표본. 기둥 · 짧은기둥 · 닿자 세로 마디 · 꼭지 · 겹받침이 고루 들어 있다. */
const BEAK_SAMPLES = '이 아 애 오 나 밥 각 닫 를 흙 화 취 한 뷁'.split(' ')

function centerlineD(stroke: StrokeDataV2): string {
  const at = (point: { x: number; y: number }) => `${(PAD + point.x * BOX).toFixed(1)} ${(PAD + point.y * BOX).toFixed(1)}`
  const points = stroke.points
  const parts = [`M ${at(points[0])}`]
  const curve = (from: AnchorPoint, to: AnchorPoint) => from.handleOut || to.handleIn
    ? `C ${at(from.handleOut ?? from)} ${at(to.handleIn ?? to)} ${at(to)}`
    : `L ${at(to)}`
  for (let index = 1; index < points.length; index += 1) parts.push(curve(points[index - 1], points[index]))
  if (stroke.closed) parts.push(curve(points[points.length - 1], points[0]), 'Z')
  return parts.join(' ')
}

function colorOf(stroke: StrokeDescription): string {
  if (!stroke.bound) return FREE_COLOR
  return stroke.name ? NAME_COLOR[stroke.name] : UNNAMED_COLOR
}

function ChannelFigure({ jamo, channel, described, beak }: { jamo: JamoData; channel: StrokeDescription['channel']; described: StrokeDescription[]; beak: StemBeakStyle }) {
  const strokes = (jamo[channel] ?? []) as StrokeDataV2[]
  if (strokes.length === 0) return null
  // 부리가 붙을 자리. 카드의 획은 굵기를 안 그리므로 실제 굵기로 만든 부리 면을 그대로 겹쳐 자리만 보여 준다.
  const beakContours = stemBeakInkGroups(strokes.map((stroke) => ({ stroke, box: UNIT_BOX, weightMultiplier: 1, group: channel })), beak).flat(2)
  const byId = new Map(described.map((item) => [item.strokeId, item]))
  const xy = (point: { x: number; y: number }) => ({ cx: PAD + point.x * BOX, cy: PAD + point.y * BOX })
  return (
    <figure className={styles.figure}>
      <svg viewBox={`0 0 ${BOX + PAD * 2} ${BOX + PAD * 2}`} role="img" aria-label={`${jamo.char} ${CHANNEL_TITLE[channel]}`.trim()}>
        <rect x={PAD} y={PAD} width={BOX} height={BOX} className={styles.frame} />
        {beakContours.map((contour, index) => <polygon key={`beak-${index}`} points={contour.map((point) => `${PAD + point.x * BOX},${PAD + point.y * BOX}`).join(' ')} className={styles.beak} data-marker="beak" />)}
        {strokes.map((stroke) => {
          const item = byId.get(stroke.id)
          if (!item) return null
          const color = colorOf(item)
          return (
            <g key={stroke.id} data-stroke-id={stroke.id} data-stem-name={item.name ?? ''} data-bound={item.bound}>
              <path d={centerlineD(stroke)} fill="none" stroke={color} strokeWidth={5} strokeLinecap="butt" strokeLinejoin="miter" strokeDasharray={item.bound ? undefined : '6 4'} />
              {item.corners.map((corner) => {
                const { cx, cy } = xy(corner)
                return <rect key={`corner-${corner.point}`} x={cx - 4} y={cy - 4} width={8} height={8} className={styles.corner} data-marker="corner" />
              })}
              {[item.head, item.tail].map((end, index) => {
                if (!end) return null
                const { cx, cy } = xy(end)
                return <circle key={index === 0 ? 'head' : 'tail'} cx={cx} cy={cy} r={index === 0 ? 5.5 : 4} fill={end.open ? 'white' : color} stroke={color} strokeWidth={2} data-marker={index === 0 ? 'head' : 'tail'} data-open={end.open} />
              })}
            </g>
          )
        })}
      </svg>
      {CHANNEL_TITLE[channel] && <figcaption>{CHANNEL_TITLE[channel]}</figcaption>}
    </figure>
  )
}

function JamoCard({ jamo, beak }: { jamo: JamoData; beak: StemBeakStyle }) {
  const described = useMemo(() => describeJamoStrokes(jamo), [jamo])
  return (
    <article className={styles.card} data-jamo={jamo.char} data-jamo-type={jamo.type}>
      <h3>{jamo.char}</h3>
      <div className={styles.figures}>
        {(['strokes', 'horizontalStrokes', 'verticalStrokes'] as const).map((channel) => (
          <ChannelFigure key={channel} jamo={jamo} channel={channel} described={described.filter((item) => item.channel === channel)} beak={beak} />
        ))}
      </div>
      <ul>
        {described.map((item) => (
          <li key={item.strokeId}>
            <i style={{ background: colorOf(item) }} aria-hidden="true" />
            <code>{item.strokeId}</code>
            <strong>{!item.bound ? '자유 획' : item.name ? STEM_NAME_LABEL[item.name] : '이름 없음'}</strong>
            <span>{item.segments.map(({ shape }) => STEM_SHAPE_LABEL[shape]).join(' · ')}</span>
          </li>
        ))}
      </ul>
    </article>
  )
}

export function StrokeGrammarLabPage() {
  const [source, setSource] = useState<Source>('preset')
  const mine = useJamoStore((state) => state)
  const beak = useGlobalStyleStore((state) => state.style.stemBeak) ?? DEFAULT_STEM_BEAK
  const setStemBeak = useGlobalStyleStore((state) => state.setStemBeak)
  const data: Record<JamoType, Record<string, JamoData>> = source === 'preset'
    ? PRESETS
    : { choseong: mine.choseong, jungseong: mine.jungseong, jongseong: mine.jongseong }

  return (
    <main className={styles.page} data-testid="stroke-grammar-lab">
      <header className={styles.hero}>
        <span>Stroke Grammar Lab</span>
        <h1>획 문법</h1>
        <p>낱자마다 어느 획이 어떤 줄기인지 적어 둔 표를 눈으로 확인한다. 이름은 획에 붙고, 마디의 모양 · 꺾임 · 머리와 맺음은 지금 획에서 계산한다. 틀린 이름이 보이면 낱자와 획 id를 알려 달라.</p>
        <div className={styles.sourceSwitch} role="group" aria-label="보여 줄 획">
          <button type="button" aria-pressed={source === 'preset'} onClick={() => setSource('preset')}>프리셋</button>
          <button type="button" aria-pressed={source === 'mine'} onClick={() => setSource('mine')}>내 획</button>
        </div>
      </header>

      <section className={styles.legend} aria-label="범례">
        {(Object.keys(STEM_NAME_LABEL) as StemName[]).map((name) => (
          <span key={name}><i style={{ background: NAME_COLOR[name] }} aria-hidden="true" />{STEM_NAME_LABEL[name]}</span>
        ))}
        <span><i style={{ background: UNNAMED_COLOR }} aria-hidden="true" />이름 없음(모양만)</span>
        <span><i style={{ background: FREE_COLOR }} aria-hidden="true" />자유 획(점선)</span>
        <span><b className={styles.legendCorner} aria-hidden="true" />꺾임</span>
        <span><b className={styles.legendOpen} aria-hidden="true" />열린 끝 · 큰 원이 머리</span>
        <span><b className={styles.legendTouch} aria-hidden="true" />닿은 끝</span>
        <span><b className={styles.legendBeak} aria-hidden="true" />부리 자리(켰을 때)</span>
      </section>

      <section className={styles.beakPanel} aria-label="세로줄기 부리" data-testid="stem-beak-panel">
        <div className={styles.beakControls}>
          <h2>세로줄기 부리</h2>
          <p>세로줄기의 열린 머리 전부에 같은 부리를 얹는다. <strong>여기서 켜면 폰트 전체에 적용된다</strong> — 자소 편집의 글자와 OTF에도 나온다. 획은 안 바뀌고, 끄면 그대로 사라진다.</p>
          <label className={styles.beakToggle}><input type="checkbox" checked={beak.enabled} onChange={(event) => setStemBeak({ enabled: event.target.checked })} /> 부리 켜기</label>
          <div className={styles.beakShapes} role="radiogroup" aria-label="부리 모양">
            {STEM_BEAK_SHAPES.map(({ id, label, note }) => (
              <button key={id} type="button" role="radio" aria-checked={beak.enabled && beak.shape === id} title={note} data-beak-shape={id} onClick={() => setStemBeak({ enabled: true, shape: id })}>
                <BeakShapeThumb shape={id} size={beak.size} angle={beak.angle} />
                <span>{label}</span>
              </button>
            ))}
          </div>
          <label><span>크기 <output>{beak.size.toFixed(1)}</output></span><input aria-label="부리 크기" type="range" min={0.5} max={2} step={0.1} value={beak.size} disabled={!beak.enabled} onChange={(event) => setStemBeak({ size: Number(event.target.value) })} /></label>
          <label><span>각도(각진 부리만) <output>{beak.angle}°</output></span><input aria-label="부리 각도" type="range" min={-60} max={60} step={5} value={beak.angle} disabled={!beak.enabled || beak.shape !== 'angled'} onChange={(event) => setStemBeak({ angle: Number(event.target.value) })} /></label>
        </div>
        <div className={styles.beakSamples} data-testid="stem-beak-samples">
          {BEAK_SAMPLES.map((char) => <AppGlyph key={char} char={char} size={92} />)}
        </div>
      </section>

      {SECTIONS.map(({ type, title }) => (
        <section key={type} className={styles.section} aria-label={title}>
          <h2>{title} <small>{Object.keys(data[type]).length}</small></h2>
          <div className={styles.grid}>
            {Object.values(data[type]).map((jamo) => <JamoCard key={`${type}-${jamo.char}`} jamo={jamo} beak={beak} />)}
          </div>
        </section>
      ))}
    </main>
  )
}
