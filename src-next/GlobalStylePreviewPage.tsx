import { useId, useMemo, useRef, useState } from 'react'
import * as Slider from '@radix-ui/react-slider'
import * as ToggleGroup from '@radix-ui/react-toggle-group'
import { ArrowLeft, ArrowUpRight, Check, ChevronRight, Columns2, Italic, Paintbrush, Redo2, RotateCcw, Scan, Undo2 } from 'lucide-react'
import { CHOSEONG_MAP, JONGSEONG_MAP, JUNGSEONG_MAP } from '../src/data/Hangul'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { brushInkGroupsToSvgPaths, strokeToBrushInkGroups } from '../src/services/brushGeometry'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { BrushStyle, BrushTip, StrokeDataV2 } from '../src/types'
import { weightToMultiplier } from '../src/utils/globalStyleUtils'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { DEFAULT_LAYOUT_SCHEMAS } from '../src/utils/layoutCalculator'
import styles from './GlobalStylePreviewPage.module.css'

type Panel = 'overview' | 'brush' | 'body'
type PreviewValues = { weight: number; slant: number; width: number; height: number; brush: BrushStyle }
const INITIAL: PreviewValues = { weight: 400, slant: 0, width: 850, height: 850, brush: { tip: 'round', aspectRatio: 0.5, angle: 0 } }
const TIPS: { tip: BrushTip; label: string }[] = [{ tip: 'round', label: '원형' }, { tip: 'ellipse', label: '납작형' }, { tip: 'rectangle', label: '네모형' }]
const TITLES: Record<Panel, string> = { overview: '글로벌 스타일', brush: '획 모양', body: '네모꼴' }
const CURVE: StrokeDataV2 = {
  id: 'style-preview-curve', closed: false, thickness: 0.07,
  points: [{ x: 0.1, y: 0.58, handleOut: { x: 0.32, y: 0.13 } }, { x: 0.9, y: 0.42, handleIn: { x: 0.68, y: 0.87 } }],
}

/** 시안은 기본 자모와 공통 렌더러만 읽는다. 프로젝트 저장소를 불러오거나 변경하지 않는다. */
function PreviewGlyph({ char, values, size }: { char: string; values: PreviewValues; size: number }) {
  const syllable = useMemo(() => decomposeSyllable(char, CHOSEONG_MAP, JUNGSEONG_MAP, JONGSEONG_MAP), [char])
  const padding = { left: (1 - values.width / 1000) / 2, right: (1 - values.width / 1000) / 2, top: (1 - values.height / 1000) / 2, bottom: (1 - values.height / 1000) / 2 }
  const globalStyle: GlobalStyle = {
    weight: values.weight, slant: values.slant, letterSpacing: 0, linecap: 'butt', linejoin: 'miter',
    brush: values.brush, strokeStyle: { mode: 'brush', brush: values.brush },
  }
  return <SvgRenderer syllable={syllable} schema={{ ...DEFAULT_LAYOUT_SCHEMAS[syllable.layoutType], padding, designBodyPadding: padding }} globalStyle={globalStyle} size={size} />
}

function StrokeSample({ values }: { values: PreviewValues }) {
  const paths = useMemo(() => brushInkGroupsToSvgPaths(strokeToBrushInkGroups(CURVE, { x: 0, y: 0, width: 1, height: 1 }, weightToMultiplier(values.weight), values.brush), 100), [values.weight, values.brush])
  return <svg viewBox="0 15 100 70" fill="currentColor" aria-hidden="true">
    {values.brush.tip === 'round'
      ? <path d="M10 58 C32 13 68 87 90 42" fill="none" stroke="currentColor" strokeWidth={7 * weightToMultiplier(values.weight)} />
      : paths.map((path, index) => <path key={index} d={path} />)}
  </svg>
}

function TipIcon({ tip }: { tip: BrushTip }) {
  return <svg viewBox="0 0 32 32" aria-hidden="true" fill="currentColor">
    {tip === 'round' ? <circle cx="16" cy="16" r="9" /> : tip === 'ellipse' ? <ellipse cx="16" cy="16" rx="11" ry="5" transform="rotate(-30 16 16)" /> : <rect x="7" y="9" width="18" height="14" />}
  </svg>
}

function ValueSlider({ label, value, min, max, step = 1, suffix = '', marks, onChange, onCommit, onCancel }: {
  label: string; value: number; min: number; max: number; step?: number; suffix?: string; marks: string[]
  onChange: (value: number) => void; onCommit: (value: number) => void; onCancel: () => void
}) {
  const id = useId()
  return <div className={styles.valueControl}>
    <div className={styles.valueHeading}><span id={id}>{label}</span><output>{value}{suffix}</output></div>
    <Slider.Root className={styles.slider} value={[value]} min={min} max={max} step={step}
      onValueChange={([next]) => onChange(next)} onValueCommit={([next]) => onCommit(next)} onPointerCancel={onCancel}>
      <Slider.Track className={styles.sliderTrack}><Slider.Range className={styles.sliderRange} /></Slider.Track>
      <Slider.Thumb className={styles.sliderThumb} aria-labelledby={id} aria-valuetext={`${value}${suffix}`} />
    </Slider.Root>
    <div className={styles.sliderLabels} aria-hidden="true">{marks.map((mark) => <span key={mark}>{mark}</span>)}</div>
  </div>
}

export function GlobalStylePreviewPage() {
  const [panel, setPanel] = useState<Panel>('overview')
  const [history, setHistory] = useState<{ past: PreviewValues[]; present: PreviewValues; future: PreviewValues[] }>({ past: [], present: INITIAL, future: [] })
  const [draft, setDraft] = useState<PreviewValues | null>(null)
  const [compare, setCompare] = useState(false)
  const [finished, setFinished] = useState(false)
  const [bodyChar, setBodyChar] = useState('한')
  const panelTitle = useRef<HTMLHeadingElement>(null)
  const brushEntry = useRef<HTMLButtonElement>(null)
  const bodyEntry = useRef<HTMLButtonElement>(null)
  const scrollArea = useRef<HTMLDivElement>(null)
  const current = draft ?? history.present
  const preview = compare ? INITIAL : current
  const changed = JSON.stringify(history.present) !== JSON.stringify(INITIAL)
  const tipLabel = TIPS.find(({ tip }) => tip === current.brush.tip)!.label

  const commit = (next: PreviewValues) => {
    setDraft(null)
    setCompare(false)
    setFinished(false)
    setHistory((previous) => JSON.stringify(previous.present) === JSON.stringify(next) ? previous : { past: [...previous.past, previous.present], present: next, future: [] })
  }
  const navigate = (next: Panel) => {
    const previous = panel
    setPanel(next)
    setCompare(false)
    setDraft(null)
    setFinished(false)
    requestAnimationFrame(() => {
      scrollArea.current?.scrollTo(0, 0)
      if (next === 'overview') (previous === 'brush' ? brushEntry : bodyEntry).current?.focus()
      else panelTitle.current?.focus()
    })
  }
  const undo = () => {
    setDraft(null); setFinished(false); setCompare(false)
    setHistory((previous) => previous.past.length ? { past: previous.past.slice(0, -1), present: previous.past.at(-1)!, future: [previous.present, ...previous.future] } : previous)
  }
  const redo = () => {
    setDraft(null); setFinished(false); setCompare(false)
    setHistory((previous) => previous.future.length ? { past: [...previous.past, previous.present], present: previous.future[0], future: previous.future.slice(1) } : previous)
  }
  const slider = (key: 'weight' | 'slant' | 'width' | 'height', label: string, min: number, max: number, step: number, marks: string[], suffix = '') => <ValueSlider
    label={label} value={current[key]} min={min} max={max} step={step} marks={marks} suffix={suffix}
    onChange={(value) => { setCompare(false); setDraft({ ...current, [key]: value }) }}
    onCommit={(value) => commit({ ...current, [key]: value })} onCancel={() => setDraft(null)} />
  const reset = () => commit(panel === 'brush' ? { ...current, brush: INITIAL.brush } : panel === 'body' ? { ...current, width: 850, height: 850 } : INITIAL)
  const canReset = panel === 'brush' ? JSON.stringify(current.brush) !== JSON.stringify(INITIAL.brush) : panel === 'body' ? current.width !== 850 || current.height !== 850 : changed

  return <main className={styles.stage}>
    <div className={styles.previewNotice}><span className={styles.previewTag}>디자인 시안</span><span>기본 글꼴로 체험 · 프로젝트에 저장되지 않아요</span></div>
    <section className={styles.app} aria-label="글로벌 스타일 디자인 시안">
      <header className={styles.header}>
        <div className={styles.headerTitle}>
          {panel !== 'overview' && <button className={styles.iconButton} onClick={() => navigate('overview')} aria-label="전체 스타일로 돌아가기"><ArrowLeft size={20} /></button>}
          <h1 ref={panelTitle} tabIndex={-1}>{TITLES[panel]}</h1>
        </div>
        <span className={styles.scope}><span />폰트 전체</span>
      </header>

      <section className={styles.preview} aria-label="글꼴 미리보기" data-comparing={compare}>
        <div className={styles.previewTop}><span>{compare ? '처음 스타일' : '미리보기'}</span>
          <button className={styles.compareButton} aria-pressed={compare} onClick={() => setCompare(!compare)} disabled={!changed && !draft}><Columns2 size={14} />처음과 비교</button>
        </div>
        <div className={styles.sentence} aria-label="한 벌을 노래하는 마음으로" role="img">
          {['한 벌을 노래하는', '마음으로'].map((line) => <div key={line} aria-hidden="true">{Array.from(line).map((char, index) => char === ' ' ? <span key={index} className={styles.wordSpace} /> : <PreviewGlyph key={index} char={char} values={preview} size={36} />)}</div>)}
        </div>
        <div className={styles.sampleLine} aria-label="임 명 집 실 것 없 력 년 있 심" role="img" aria-hidden={false}>
          {'임명집실것없력년있심'.split('').map((char) => <span key={char} aria-hidden="true"><PreviewGlyph char={char} values={preview} size={23} /></span>)}
        </div>
      </section>

      <div className={styles.content} ref={scrollArea}>
        {panel === 'overview' && <>
          <div className={styles.sectionHeading}><h2>글자의 인상</h2><span>모든 글자에 함께 적용</span></div>
          <section className={styles.controlsCard} aria-label="굵기와 기울기">
            {slider('weight', '굵기', 100, 900, 100, ['가늘게', '기본 400', '굵게'])}
            <div className={styles.rule} />
            {slider('slant', '기울기', -30, 30, 1, ['−30°', '곧게', '30°'], '°')}
          </section>
          <div className={styles.sectionHeading}><h2>세부 조절</h2></div>
          <section className={styles.options} aria-label="세부 스타일 항목">
            <button ref={brushEntry} className={styles.option} onClick={() => navigate('brush')}>
              <span className={`${styles.optionIcon} ${styles.brushSwatch}`}><StrokeSample values={current} /></span>
              <span className={styles.optionText}><strong>획 모양</strong><small>{tipLabel}{current.brush.tip !== 'round' && ` · ${current.brush.angle}°`}</small></span><ChevronRight size={18} />
            </button>
            <button ref={bodyEntry} className={styles.option} onClick={() => navigate('body')}>
              <span className={`${styles.optionIcon} ${styles.bodySwatch}`}><Scan size={24} /></span>
              <span className={styles.optionText}><strong>네모꼴</strong><small>가로 {current.width} · 세로 {current.height}</small></span><ChevronRight size={18} />
            </button>
          </section>
          <p className={styles.contextNote}><Paintbrush size={14} />글자 배치와 개별 획은 원래 편집 화면에서 조절해요.</p>
        </>}

        {panel === 'brush' && <>
          <div className={styles.sectionHeading}><h2>붓촉 모양</h2><span>그리는 도구의 단면</span></div>
          <ToggleGroup.Root type="single" className={styles.tipChoices} value={current.brush.tip} aria-label="붓촉 모양" onValueChange={(tip) => {
            if (TIPS.some((option) => option.tip === tip)) commit({ ...current, brush: { ...current.brush, tip: tip as BrushTip } })
          }}>
            {TIPS.map(({ tip, label }) => <ToggleGroup.Item key={tip} value={tip} className={styles.tipChoice} aria-label={label}><TipIcon tip={tip} /><span>{label}</span><Check className={styles.tipCheck} size={14} /></ToggleGroup.Item>)}
          </ToggleGroup.Root>
          <div className={styles.strokePreview}><span>획에 적용하면</span><StrokeSample values={preview} /><small>{tipLabel}</small></div>
          {current.brush.tip === 'round' ? <div className={styles.roundHint}><span className={styles.hintIcon}><Paintbrush size={18} /></span><p><strong>방향에 따라 굵기가 달라지지 않아요.</strong><span>납작형·네모형을 고르면 납작함과 각도를 조절할 수 있어요.</span></p></div>
            : <section className={styles.controlsCard} aria-label="붓촉 세부 조절">
              <ValueSlider label="납작함" value={Math.round((1 - current.brush.aspectRatio) / 0.8 * 100)} min={0} max={100} suffix="%" marks={['통통하게', '납작하게']}
                onChange={(value) => { setCompare(false); setDraft({ ...current, brush: { ...current.brush, aspectRatio: 1 - value / 100 * 0.8 } }) }}
                onCommit={(value) => commit({ ...current, brush: { ...current.brush, aspectRatio: 1 - value / 100 * 0.8 } })} onCancel={() => setDraft(null)} />
              <div className={styles.rule} />
              <ValueSlider label="각도" value={current.brush.angle} min={-90} max={90} suffix="°" marks={['−90°', '가로 0°', '90°']}
                onChange={(value) => { setCompare(false); setDraft({ ...current, brush: { ...current.brush, angle: value } }) }}
                onCommit={(value) => commit({ ...current, brush: { ...current.brush, angle: value } })} onCancel={() => setDraft(null)} />
            </section>}
        </>}

        {panel === 'body' && <>
          <div className={styles.bodyPreview}>
            <div className={styles.bodyCanvas} role="img" aria-label={`${bodyChar} 네모꼴 가로 ${preview.width}, 세로 ${preview.height}`}>
              <div className={styles.bodyBox} style={{ width: `${preview.width / 10}%`, height: `${preview.height / 10}%` }}><i /><i /><i /><i /></div>
              <PreviewGlyph char={bodyChar} values={preview} size={164} />
            </div>
            <div className={styles.bodyCaption}><span><i />글자가 놓이는 네모꼴</span><output>{preview.width} × {preview.height}</output></div>
            <ToggleGroup.Root type="single" className={styles.samplePicker} value={bodyChar} aria-label="네모꼴 미리보기 글자" onValueChange={(char) => { if (char) setBodyChar(char) }}>
              {['한', '가', '고', '과', '곽', '의'].map((char) => <ToggleGroup.Item key={char} value={char} aria-label={`${char} 보기`}>{char}</ToggleGroup.Item>)}
            </ToggleGroup.Root>
          </div>
          <section className={styles.controlsCard} aria-label="네모꼴 크기">
            {slider('width', '가로', 500, 1000, 5, ['좁게', '넓게'])}
            <div className={styles.rule} />
            {slider('height', '세로', 500, 1000, 5, ['낮게', '높게'])}
          </section>
          <p className={styles.contextNote}><Italic size={14} />획 굵기를 유지하며 글자가 차지하는 크기를 바꿔요.</p>
        </>}
      </div>

      {finished && <div className={styles.doneNotice} role="status"><Check size={16} /><span>시안 확인 완료. 조절한 값은 이 화면에만 남아요.</span><button onClick={() => setFinished(false)} aria-label="완료 안내 닫기">닫기</button></div>}
      <footer className={styles.footer}>
        <div className={styles.historyButtons}><button className={styles.iconButton} onClick={undo} disabled={!history.past.length} aria-label="되돌리기" title="되돌리기"><Undo2 size={19} /></button><button className={styles.iconButton} onClick={redo} disabled={!history.future.length} aria-label="다시 실행" title="다시 실행"><Redo2 size={19} /></button></div>
        <button className={styles.resetButton} disabled={!canReset} onClick={reset}><RotateCcw size={14} />{panel === 'overview' ? '초기화' : '기본값'}</button>
        <button className={styles.primaryButton} onClick={() => panel === 'overview' ? setFinished(true) : navigate('overview')}>{panel === 'overview' ? '완료' : '조절 마침'}<Check size={16} /></button>
      </footer>
    </section>
    <a className={styles.returnLink} href="/workspace/jamo">원래 편집 화면<ArrowUpRight size={13} /></a>
  </main>
}
