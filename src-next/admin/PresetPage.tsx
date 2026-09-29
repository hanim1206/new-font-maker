import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import type { PointerEvent as ReactPointerEvent } from 'react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { designBodySvgTransform, REFERENCE_BODY_PADDING } from '../../src/services/designBodyPlacement'
import { withRepresentative } from '../../src/services/houseLayoutModel'
import type { HouseLayoutModel } from '../../src/services/houseLayoutModel'
import type { VariationModel } from '../../src/services/notoVariationModel'
import { DEFAULT_FONT_PRESET, FONT_PRESET_IDS, NOTO_FONT_PRESET } from '../../src/types/database'
import type { FontPresetId } from '../../src/types/database'
import { FontDataGlyph } from '../fontDataGlyph'
import { FONT_PRESET_LABEL } from '../fontPresetStore'
import { useNotoGhost } from '../notoGhostCompare'
import { fetchHouseLayout, replaceHouseModel, useNotoModel, withHouseLayout } from '../notoModel'
import type { NotoPresetModelBundle } from '../notoPresetGlyphs'
import { presetPreviewFont } from '../previewFont'
import type { PreviewFont } from '../previewFont'
import { DEFAULT_SAMPLE_SENTENCE } from '../sampleSentences'
import { BETA_INVITE_API, HOUSE_PRESET_API, adminCall, dateOf } from './adminApi'
import { PRESET_LAYOUTS, fromView, handlesOf, identityOfChar, predictionOf, representativeFor, targetLabel, toView } from './presetEditor'
import type { PresetHandle } from './presetEditor'

/**
 * 관리자 `프리셋` 메뉴. 플랜 `docs/plans/2026-09-29_하우스-레이아웃-프리셋-편집기.md`.
 * v2 초안(`public/house-preset/basic-gothic-v2.json`)의 레이아웃 대푯값을 노토 고스트 위에서 끌어 고치고, v1(노토)과 나란히 본다.
 * 저장은 레포 파일에 한다. 배포는 커밋, 새 폰트가 v2를 받는 건 `DEFAULT_FONT_PRESET`을 바꾼 뒤다.
 */

const DRAFT_PRESET: FontPresetId = 'basic-gothic-v2'
const SAMPLE_SENTENCE_STORAGE_KEY = 'font-maker-sample-sentence'
const CANVAS_SIZE = 380
const THUMB_SIZE = 52
const LINE_SIZE = 40
const PART_COLOR = { initial: '#d9480f', medial: '#2f9e44', final: '#1971c2' } as const
const SELECTED_COLOR = '#0d99ff'

const isSyllable = (char: string) => char >= '가' && char <= '힣'

function loadSentence(): string {
  try { return localStorage.getItem(SAMPLE_SENTENCE_STORAGE_KEY)?.trim() || DEFAULT_SAMPLE_SENTENCE } catch { return DEFAULT_SAMPLE_SENTENCE }
}

const signed = (value: number) => `${value > 0 ? '+' : ''}${Math.round(value)}`

/** 끄는 동안 쓰는 시작값. 끄는 중 모델이 바뀌어도 시작값 기준으로 옮겨 밀리지 않는다. */
interface DragStart { target: string; axis: 'x' | 'y'; representative: number; predicted: number; pointerId: number }

/** 큰 캔버스: 초안 잉크 + 노토 고스트 + 끌 수 있는 선. */
function PresetCanvas({ font, char, bundle, selected, onSelect, onMove }: {
  font: PreviewFont
  char: string
  bundle: NotoPresetModelBundle
  selected: string | null
  onSelect: (target: string) => void
  onMove: (target: string, representative: number) => void
}) {
  const model = bundle.model as unknown as VariationModel
  const identity = identityOfChar(char)
  const { ghost } = useNotoGhost(char, true)
  const overlay = useRef<SVGSVGElement>(null)
  const drag = useRef<DragStart | null>(null)
  const handles = useMemo(() => identity ? handlesOf(model, identity.contextId, identity.medialJamo) : [], [model, identity])

  if (!identity) return null
  const layer = identity.contextId
  const at = (target: string) => predictionOf(model, target, identity)

  const pointerValue = (event: ReactPointerEvent, axis: 'x' | 'y') => {
    const rect = overlay.current!.getBoundingClientRect()
    return fromView(axis === 'x' ? (event.clientX - rect.left) / rect.width * 100 : (event.clientY - rect.top) / rect.height * 100)
  }
  const start = (event: ReactPointerEvent, handle: PresetHandle) => {
    const predicted = at(handle.target)
    const representative = model.targets[handle.target]?.layers[layer]?.representative
    if (predicted === null || representative === undefined) return
    event.preventDefault()
    ;(event.currentTarget as Element).setPointerCapture(event.pointerId)
    drag.current = { target: handle.target, axis: handle.axis, representative, predicted, pointerId: event.pointerId }
    onSelect(handle.target)
  }
  const move = (event: ReactPointerEvent) => {
    const current = drag.current
    if (!current || current.pointerId !== event.pointerId) return
    onMove(current.target, representativeFor(current.representative, current.predicted, pointerValue(event, current.axis)))
  }
  const end = (event: ReactPointerEvent) => {
    if (drag.current?.pointerId === event.pointerId) drag.current = null
  }

  const ghostPath = ghost && <path d={ghost.path} transform={designBodySvgTransform(REFERENCE_BODY_PADDING, 100)} fill="#3a3a36" fillOpacity={0.22} fillRule="evenodd" data-testid="preset-noto-ghost" />

  return <div className="relative shrink-0 rounded-lg bg-surface-2" style={{ width: CANVAS_SIZE, height: CANVAS_SIZE }} data-testid="preset-canvas">
    <FontDataGlyph font={font} char={char} size={CANVAS_SIZE} model={bundle} underlay={ghostPath} />
    <svg ref={overlay} className="absolute inset-0" width={CANVAS_SIZE} height={CANVAS_SIZE} viewBox="0 0 100 100" style={{ touchAction: 'none' }}>
      {handles.map((handle) => {
        const value = at(handle.target)
        if (value === null) return null
        const from = handle.span ? at(handle.span[0]) : null
        const to = handle.span ? at(handle.span[1]) : null
        const a = from === null ? 0 : toView(Math.min(from, to ?? from))
        const b = to === null ? 100 : toView(Math.max(to, from ?? to))
        const v = toView(value)
        const [x1, y1, x2, y2] = handle.axis === 'x' ? [v, a, v, b] : [a, v, b, v]
        const isSelected = handle.target === selected
        const color = isSelected ? SELECTED_COLOR : PART_COLOR[handle.part]
        return <g key={handle.target} style={{ cursor: handle.axis === 'x' ? 'ew-resize' : 'ns-resize' }}
          onPointerDown={(event) => start(event, handle)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}
          data-testid={`preset-handle-${handle.target}`}>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={3.2} />
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={isSelected ? 0.7 : 0.35} strokeDasharray={handle.part === 'medial' ? undefined : '1.2 0.8'} />
        </g>
      })}
    </svg>
  </div>
}

/** 고른 레이아웃의 대푯값 표. 노토 · 우리 · 차이, 우리 값은 바로 고친다. */
function RepresentativeTable({ layer, draft, noto, selected, onSelect, onSet }: {
  layer: string
  draft: HouseLayoutModel
  noto: VariationModel
  selected: string | null
  onSelect: (target: string) => void
  onSet: (target: string, value: number) => void
}) {
  const rows = Object.keys(noto.targets).filter((target) => noto.targets[target].layers[layer])
  return <table className="w-full text-sm" data-testid="preset-representatives">
    <thead className="text-left text-xs text-text-dim-5">
      <tr><th className="py-1 font-medium">자리</th><th className="w-16 py-1 text-right font-medium">노토</th><th className="w-24 py-1 text-right font-medium">우리</th><th className="w-12 py-1 text-right font-medium">차이</th></tr>
    </thead>
    <tbody>
      {rows.map((target) => {
        const notoValue = noto.targets[target].layers[layer].representative
        const own = draft.representatives[target]?.[layer] ?? notoValue
        const diff = own - notoValue
        return <tr key={target} className={target === selected ? 'bg-surface-3' : undefined} onClick={() => onSelect(target)}>
          <td className="py-0.5 pr-2">{targetLabel(target)}</td>
          <td className="py-0.5 text-right tabular-nums text-text-dim-5">{Math.round(notoValue)}</td>
          <td className="py-0.5 text-right">
            <input
              type="number"
              step={1}
              className="h-7 w-20 rounded border border-border bg-surface px-1.5 text-right tabular-nums"
              value={Math.round(own)}
              onChange={(event) => { const next = Number(event.target.value); if (event.target.value !== '' && Number.isFinite(next)) onSet(target, next) }}
              aria-label={`${targetLabel(target)} 우리 값`}
            />
          </td>
          <td className={`py-0.5 text-right tabular-nums ${Math.abs(diff) >= 0.5 ? 'font-semibold text-foreground' : 'text-text-dim-5'}`}>{Math.abs(diff) >= 0.5 ? signed(diff) : '·'}</td>
        </tr>
      })}
    </tbody>
  </table>
}

/** 같은 문장을 v1 · v2로. 겹쳐 보기면 v1을 흐리게 깔고 v2를 얹는다. */
function CompareLines({ font, text, draftBundle, overlay }: { font: PreviewFont; text: string; draftBundle: NotoPresetModelBundle; overlay: boolean }) {
  const chars = [...text]
  const space = (char: string, at: number) => <span key={at} className="inline-block" style={{ width: char === ' ' ? LINE_SIZE / 3 : LINE_SIZE }}>{char === ' ' ? '' : char}</span>
  if (overlay) {
    return <p className="flex flex-wrap items-center gap-y-2" data-testid="preset-compare-overlay">
      {chars.map((char, at) => isSyllable(char)
        ? <span key={at} className="relative inline-block" style={{ width: LINE_SIZE, height: LINE_SIZE }}>
          <span className="absolute inset-0 opacity-30 [filter:sepia(1)_saturate(6)_hue-rotate(-30deg)]"><FontDataGlyph font={font} char={char} size={LINE_SIZE} model={NOTO_FONT_PRESET} /></span>
          <span className="absolute inset-0"><FontDataGlyph font={font} char={char} size={LINE_SIZE} model={draftBundle} /></span>
        </span>
        : space(char, at))}
    </p>
  }
  return <div className="flex flex-col gap-2">
    {([['v1 노토', NOTO_FONT_PRESET], ['v2 초안', draftBundle]] as const).map(([label, model]) => <div key={label} className="flex items-center gap-3">
      <span className="w-14 shrink-0 text-xs text-text-dim-5">{label}</span>
      <p className="flex flex-wrap items-center gap-y-2" data-testid={`preset-compare-${label.startsWith('v1') ? 'v1' : 'v2'}`}>
        {chars.map((char, at) => isSyllable(char) ? <FontDataGlyph key={at} font={font} char={char} size={LINE_SIZE} model={model} /> : space(char, at))}
      </p>
    </div>)}
  </div>
}

export function PresetPage() {
  const { bundle: noto, error: notoError } = useNotoModel(NOTO_FONT_PRESET)
  const [saved, setSaved] = useState<HouseLayoutModel | null>(null)
  const [draft, setDraft] = useState<HouseLayoutModel | null>(null)
  const [loadError, setLoadError] = useState('')
  const [layer, setLayer] = useState(PRESET_LAYOUTS[0].id)
  const [char, setChar] = useState(PRESET_LAYOUTS[0].samples[0])
  const [selected, setSelected] = useState<string | null>('initial.roleFaces.right')
  const [counts, setCounts] = useState<Record<string, number> | null>(null)
  const [countsError, setCountsError] = useState('')
  const [text, setText] = useState(loadSentence)
  const [overlay, setOverlay] = useState(false)
  const [saving, setSaving] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle')
  const [saveError, setSaveError] = useState('')
  const font = useMemo(() => presetPreviewFont(DRAFT_PRESET), [])

  useEffect(() => {
    let alive = true
    fetchHouseLayout(DRAFT_PRESET)
      .then((house) => { if (alive) { setSaved(house); setDraft(house) } })
      .catch((failure: Error) => { if (alive) setLoadError(failure.message) })
    adminCall<{ counts: Record<string, number> }>(`${BETA_INVITE_API}?presets=1`)
      .then((body) => { if (alive) setCounts(body.counts) })
      .catch((failure: Error) => { if (alive) setCountsError(failure.message) })
    return () => { alive = false }
  }, [])

  const dirty = Boolean(draft && saved && JSON.stringify(draft.representatives) !== JSON.stringify(saved.representatives))
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault() }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [dirty])

  const notoModel = noto?.model as unknown as VariationModel | undefined
  const draftBundle = useMemo(() => noto && draft ? withHouseLayout(noto, draft) : null, [noto, draft])
  // 작은 글자 · 문장 줄은 한 박자 늦게 따라온다. 끄는 캔버스는 바로.
  const laggingBundle = useDeferredValue(draftBundle)

  /** 끄는 동안 한 프레임에 한 번만 초안을 바꾼다. */
  const pending = useRef<{ target: string; layer: string; value: number } | null>(null)
  const frame = useRef(0)
  const setValue = useCallback((target: string, forLayer: string, value: number) => {
    if (!notoModel) return
    pending.current = { target, layer: forLayer, value }
    if (frame.current) return
    frame.current = requestAnimationFrame(() => {
      frame.current = 0
      const next = pending.current
      pending.current = null
      if (next) setDraft((current) => current && withRepresentative(current, notoModel, next.target, next.layer, next.value, new Date().toISOString()))
      setSaving('idle')
    })
  }, [notoModel])
  useEffect(() => () => cancelAnimationFrame(frame.current), [])

  const pickLayout = (id: string) => {
    const layout = PRESET_LAYOUTS.find((item) => item.id === id)!
    setLayer(id)
    setChar(layout.samples[0])
  }

  const save = async () => {
    if (!draft || !noto) return
    setSaving('saving')
    setSaveError('')
    try {
      await adminCall(HOUSE_PRESET_API, 'POST', { house: draft })
      setSaved(draft)
      replaceHouseModel(DRAFT_PRESET, withHouseLayout(noto, draft))
      setSaving('saved')
    } catch (failure) {
      setSaving('error')
      setSaveError(failure instanceof Error ? failure.message : String(failure))
    }
  }

  const layout = PRESET_LAYOUTS.find((item) => item.id === layer)!
  const selectedNoto = selected && notoModel?.targets[selected]?.layers[layer]?.representative
  const selectedOwn = selected && draft ? draft.representatives[selected]?.[layer] : undefined
  const nudge = (amount: number) => {
    if (!selected || selectedOwn === undefined) return
    setValue(selected, layer, selectedOwn + amount)
  }

  if (notoError || loadError) return <p role="alert" className="text-sm text-[rgb(190_52_48)]">{notoError || loadError}</p>
  if (!noto || !draft || !draftBundle || !notoModel) return <p className="text-sm text-text-dim-4">불러오는 중…</p>

  return <div className="flex max-w-6xl flex-col gap-6" data-testid="admin-preset">
    <section className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-lg border border-border-subtle bg-surface p-4 text-sm" data-testid="preset-summary">
      <span>새 폰트 기본 <strong data-testid="preset-default">{FONT_PRESET_LABEL[DEFAULT_FONT_PRESET]}</strong></span>
      <span className="flex items-center gap-2" data-testid="preset-counts">
        {counts
          ? FONT_PRESET_IDS.map((id) => <span key={id}>{FONT_PRESET_LABEL[id]} <strong className="tabular-nums">{counts[id] ?? 0}</strong>개</span>)
          : <span className="text-text-dim-5">{countsError ? `폰트 수를 못 읽었어요: ${countsError}` : '폰트 수 읽는 중…'}</span>}
      </span>
      <span className="text-text-dim-5">v2 초안 · 손댄 값 <strong className="text-foreground tabular-nums" data-testid="preset-authored-count">{draft.authored.length}</strong>개 · 저장 {dateOf(saved?.updatedAt ?? null)}</span>
      <span className="ml-auto flex items-center gap-2">
        {dirty && <Badge variant="alert">저장 안 함</Badge>}
        {saving === 'saved' && !dirty && <span className="text-xs text-text-dim-4">파일에 저장했어요. 배포는 커밋 뒤예요.</span>}
        <Button size="sm" variant="secondary" disabled={!dirty} onClick={() => { setDraft(saved); setSaving('idle') }}>되돌리기</Button>
        <Button size="sm" disabled={!dirty || saving === 'saving'} onClick={() => void save()} data-testid="preset-save">{saving === 'saving' ? '저장 중…' : '저장'}</Button>
      </span>
      {saveError && <p role="alert" className="w-full text-sm text-[rgb(190_52_48)]">{saveError}</p>}
    </section>

    <nav className="flex flex-wrap gap-1.5" aria-label="레이아웃">
      {PRESET_LAYOUTS.map((item) => <Button key={item.id} size="sm" variant={item.id === layer ? 'default' : 'secondary'} onClick={() => pickLayout(item.id)} data-testid={`preset-layout-${item.id}`}>
        {item.samples[0]} {item.label}
      </Button>)}
    </nav>

    <section className="flex flex-col gap-5 lg:flex-row">
      <div className="flex flex-col gap-3">
        <PresetCanvas font={font} char={char} bundle={draftBundle} selected={selected} onSelect={setSelected} onMove={(target, value) => setValue(target, layer, value)} />
        <div className="flex flex-wrap gap-1" aria-label="대표 글자">
          {[...layout.samples].map((sample) => <button key={sample} type="button" onClick={() => setChar(sample)}
            className={`rounded-md p-0.5 ${sample === char ? 'bg-surface-3 ring-1 ring-foreground/40' : 'hover:bg-surface-2'}`} aria-pressed={sample === char} data-testid={`preset-sample-${sample}`}>
            {laggingBundle && <FontDataGlyph font={font} char={sample} size={THUMB_SIZE} model={laggingBundle} />}
          </button>)}
        </div>
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2 rounded-lg bg-surface-2 p-3 text-sm" data-testid="preset-selected">
          {selected && selectedOwn !== undefined && typeof selectedNoto === 'number'
            ? <>
              <strong>{targetLabel(selected)}</strong>
              <span className="tabular-nums text-text-dim-4">노토 {Math.round(selectedNoto)} · 우리 {Math.round(selectedOwn)} · 차이 {signed(selectedOwn - selectedNoto)}u</span>
              <span className="ml-auto flex gap-1">
                {[-10, -1, 1, 10].map((amount) => <Button key={amount} size="sm" variant="outline" onClick={() => nudge(amount)}>{signed(amount)}</Button>)}
                <Button size="sm" variant="ghost" onClick={() => setValue(selected, layer, selectedNoto)}>노토값</Button>
              </span>
            </>
            : <span className="text-text-dim-4">캔버스의 선이나 표의 줄을 고르세요. 점선은 닿자 상자 변, 실선은 홀자 줄기 자리예요.</span>}
        </div>
        <RepresentativeTable layer={layer} draft={draft} noto={notoModel} selected={selected} onSelect={setSelected} onSet={(target, value) => setValue(target, layer, value)} />
      </div>
    </section>

    <section className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-bold">v1 · v2 비교</h2>
        <div className="flex items-end gap-2">
          <label className="flex w-72 flex-col gap-1.5 text-sm text-text-dim-3">
            문장
            <Input value={text} onChange={(event) => setText(event.target.value)} maxLength={40} data-testid="preset-compare-text" />
          </label>
          <Button size="sm" variant={overlay ? 'default' : 'secondary'} onClick={() => setOverlay(!overlay)} aria-pressed={overlay} data-testid="preset-compare-toggle">겹쳐 보기</Button>
        </div>
      </div>
      {laggingBundle && <CompareLines font={font} text={text} draftBundle={laggingBundle} overlay={overlay} />}
    </section>

    <section className="flex flex-col gap-3 rounded-lg border border-border-subtle bg-surface p-4" data-testid="preset-authored">
      <h2 className="text-base font-bold">손댄 대푯값 {draft.authored.length}</h2>
      {draft.authored.length === 0
        ? <p className="text-sm text-text-dim-4">아직 노토와 같아요. 캔버스에서 선을 끌어 보세요.</p>
        : <table className="w-full text-sm">
          <thead className="text-left text-xs text-text-dim-5"><tr><th className="py-1 font-medium">레이아웃</th><th className="py-1 font-medium">자리</th><th className="py-1 text-right font-medium">노토</th><th className="py-1 text-right font-medium">우리</th><th className="py-1 text-right font-medium">차이</th></tr></thead>
          <tbody>
            {draft.authored.map((entry) => <tr key={`${entry.target}|${entry.layer}`} className="cursor-pointer hover:bg-surface-2" onClick={() => { pickLayout(entry.layer); setSelected(entry.target) }}>
              <td className="py-0.5">{PRESET_LAYOUTS.find((item) => item.id === entry.layer)?.label ?? entry.layer}</td>
              <td className="py-0.5">{targetLabel(entry.target)}</td>
              <td className="py-0.5 text-right tabular-nums text-text-dim-5">{Math.round(entry.noto)}</td>
              <td className="py-0.5 text-right tabular-nums">{Math.round(entry.value)}</td>
              <td className="py-0.5 text-right tabular-nums font-semibold">{signed(entry.value - entry.noto)}</td>
            </tr>)}
          </tbody>
        </table>}
      <p className="text-xs text-text-dim-5">자소별 효과 · 짝 칸은 아직 노토 측정값을 빌려 써요. 다음 플랜에서 우리 규칙으로 바꿔요.</p>
    </section>
  </div>
}
