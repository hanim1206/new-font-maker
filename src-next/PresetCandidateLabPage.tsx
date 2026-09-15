import { useEffect, useMemo, useState } from 'react'
import baseJamos from '../src/data/baseJamos.json'
import { LEGACY_CALIBRATION_LAYOUT_PROFILE_V1 } from '../src/data/legacyCalibrationLayoutProfileV1'
import { CHOSEONG_LIST } from '../src/data/Hangul'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { createCurrentPresetSchemas } from '../src/services/presetCandidateCompiler'
import {
  fitPresetCompositionNoFinal,
  type PresetCompositionFitResult,
} from '../src/services/presetCompositionFitter'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { JamoData, LayoutType } from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { BASE_PRESETS_SCHEMAS } from '../src/utils/layoutCalculator'
import {
  describeError,
  isAbortError,
  parseFontCatalogResponse,
  parseOutlineResponse,
  requireSuccessfulJson,
  validateOutlineCoverage,
  type DisplayContract,
  type GlyphOutline,
} from './ReferenceLabPage'
import {
  INVALIDATED_PRESET_REVISIONS,
  PRESET_COMPOSITION_INPUT_VERSION,
  PRESET_COMPOSITION_STYLE,
  PRESET_FINAL_EVALUATION,
  PRESET_FINAL_SOURCE,
  PRESET_INITIAL_SOURCE,
  buildPresetCompositionBoard,
  presetCompositionEvidence,
  type PresetCompositionTarget,
} from './presetCompositionInput'
import { PRESET_SOURCE_MANIFEST, type PresetSourceElement } from './presetCandidateSource'
import { USER_PRESET_01_JAMOS } from './userPreset01'
import { createPresetCompositionGuideMaster } from '../src/services/presetCompositionGuideMaster'
import { generatePresetGuideGlyph, selectPresetGuideComponentPath } from '../src/services/presetGuideGlyph'
import styles from './PresetCandidateLabPage.module.css'

type BoardFilter = 'all' | 'ready' | 'blocked'

const FONT_CATALOG_URL = '/api/reference/v1/fonts'
const OUTLINE_URL = '/api/reference/v1/outlines'
const OUTLINE_CHUNK_SIZE = 12
const DEFAULT_DISPLAY: DisplayContract = {
  unitsPerEm: 1000,
  baselineY: 880,
  viewBox: [-120, -120, 1240, 1240],
  xOrigin: 0,
  projection: 'matrix(1000/nativeUPM 0 0 -1000/nativeUPM 0 880)',
  inkAutofit: false,
  individualCentering: false,
  advanceNormalization: false,
}
const CURRENT_JAMOS = {
  choseong: { ...(baseJamos.choseong as Record<string, JamoData>), ...USER_PRESET_01_JAMOS.choseong },
  jungseong: { ...(baseJamos.jungseong as Record<string, JamoData>), ...USER_PRESET_01_JAMOS.jungseong },
  jongseong: { ...(baseJamos.jongseong as Record<string, JamoData>), ...USER_PRESET_01_JAMOS.jongseong },
}
const CURRENT_SCHEMAS = createCurrentPresetSchemas(BASE_PRESETS_SCHEMAS, LEGACY_CALIBRATION_LAYOUT_PROFILE_V1)
const R4_STYLE: GlobalStyle = {
  ...PRESET_SOURCE_MANIFEST.currentBaseline.globalStyle.value,
  linecap: 'square',
  linejoin: 'round',
}
const MEDIAL_COLORS = ['#d35418', '#2563eb', '#7c3aed', '#0e7490', '#be123c'] as const

const BOARD_FILTERS: readonly { id: BoardFilter; label: string }[] = [
  { id: 'all', label: '전체 42자' },
  { id: 'ready', label: '무받침 21자' },
  { id: 'blocked', label: 'ㄱ받침 21자 · 대기' },
]

function formatCoordinate(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/u, '').replace(/\.$/u, '')
}

function initialAreaLabel(target: PresetCompositionTarget): string {
  const area = target.initial.source.selectionArea
  if (area.status !== 'candidate') return '초성 영역 없음'
  const { x, y, width, height } = area.value
  return `${formatCoordinate(x)}, ${formatCoordinate(y)} · ${formatCoordinate(width)}×${formatCoordinate(height)}`
}

function finalAreaLabel(target: PresetCompositionTarget): string {
  const area = target.final?.source.selectionArea
  if (!area || area.status !== 'candidate') return '—'
  const { x, y, width, height } = area.value
  return `${formatCoordinate(x)}, ${formatCoordinate(y)} · ${formatCoordinate(width)}×${formatCoordinate(height)}`
}

function projectionLabel(projection: PresetCompositionTarget['initial']['projection']): string {
  return projection === 'exact-reference-context' ? '정확 대표 문맥' : '구조 문맥 투영'
}

function ObservationLines({ elements }: { elements: readonly PresetSourceElement[] }) {
  return elements.flatMap((element, elementIndex) => {
    if (element.face.status !== 'candidate' || element.visibleSpans.status !== 'candidate') return []
    const color = MEDIAL_COLORS[elementIndex % MEDIAL_COLORS.length]
    const faceValue = element.face.value
    const visibleSpans = element.visibleSpans.value
    return visibleSpans.map((span, spanIndex) => {
      const horizontal = element.orientation === 'horizontal'
      return <line
        key={`${element.elementId}-${spanIndex}`}
        className={styles.observationLine}
        x1={horizontal ? span.from : faceValue}
        x2={horizontal ? span.to : faceValue}
        y1={horizontal ? faceValue : span.from}
        y2={horizontal ? faceValue : span.to}
        stroke={color}
        strokeWidth="8"
        strokeLinecap="square"
      />
    })
  })
}

function SourceGlyphCanvas({ target, glyph, display, loading, showGuides }: {
  target: PresetCompositionTarget
  glyph: GlyphOutline | undefined
  display: DisplayContract
  loading: boolean
  showGuides: boolean
}) {
  const initialArea = target.initial.source.selectionArea.status === 'candidate'
    ? target.initial.source.selectionArea.value
    : null
  const finalArea = target.final?.source.selectionArea.status === 'candidate'
    ? target.final.source.selectionArea.value
    : null
  const advanceX = glyph && !glyph.missing ? glyph.advance * display.unitsPerEm : null
  return (
    <figure className={styles.glyphFigure} data-testid="source-glyph-canvas">
      <figcaption className={styles.glyphLabel}>Noto 실제 글자 + 추출/투영 영역</figcaption>
      <svg className={styles.glyphSvg} viewBox={display.viewBox.join(' ')} data-coordinate-frame="shared-baseline" aria-label={`${target.character} Noto 원본과 추출 또는 투영 기준선`}>
        <rect className={styles.canvasBackground} x="0" y="0" width="1000" height="1000" />
        {showGuides && <g data-testid="source-guide-layer">
          <rect className={styles.emFrame} x="0" y="0" width="1000" height="1000" />
          <rect className={styles.designBody} x="75" y="75" width="850" height="850" />
          <line className={styles.baseline} x1="-120" x2="1120" y1={display.baselineY} y2={display.baselineY} />
          <line className={styles.origin} x1="0" x2="0" y1="-120" y2="1120" />
          {advanceX !== null && <line className={styles.advance} x1={advanceX} x2={advanceX} y1="-120" y2="1120" />}
          {initialArea && <rect className={styles.initialArea} x={initialArea.x} y={initialArea.y} width={initialArea.width} height={initialArea.height} />}
          {finalArea && <rect className={styles.finalArea} x={finalArea.x} y={finalArea.y} width={finalArea.width} height={finalArea.height} />}
        </g>}
        {glyph && !glyph.missing && <g transform={`matrix(${display.unitsPerEm / glyph.unitsPerEm} 0 0 ${-(display.unitsPerEm / glyph.unitsPerEm)} 0 ${display.baselineY})`}><path className={styles.referenceInk} d={glyph.path} /></g>}
        {showGuides && <g data-testid="source-observation-layer">
          <ObservationLines elements={target.medial.source.elements} />
          {initialArea && <rect className={styles.initialAreaOutline} x={initialArea.x} y={initialArea.y} width={initialArea.width} height={initialArea.height} />}
          {finalArea && <rect className={styles.finalAreaOutline} x={finalArea.x} y={finalArea.y} width={finalArea.width} height={finalArea.height} />}
        </g>}
        {!glyph && <text className={styles.canvasStatus} x="500" y="510" textAnchor="middle">{loading ? '윤곽 불러오는 중' : '윤곽 없음'}</text>}
        {glyph?.missing && <text className={styles.missing} x="500" y="510" textAnchor="middle">글리프 없음</text>}
      </svg>
    </figure>
  )
}

function CurrentAppCanvas({ target }: { target: PresetCompositionTarget }) {
  const syllable = decomposeSyllable(target.character, CURRENT_JAMOS.choseong, CURRENT_JAMOS.jungseong, CURRENT_JAMOS.jongseong)
  return (
    <figure className={styles.glyphFigure} data-testid="current-app-canvas">
      <figcaption className={styles.glyphLabel}>현재 앱 기준값 · 비교용</figcaption>
      <svg className={styles.glyphSvg} viewBox={DEFAULT_DISPLAY.viewBox.join(' ')} data-coordinate-frame="shared-baseline" aria-label={`${target.character} 현재 앱 기준값`}>
        <rect className={styles.emFrame} x="0" y="0" width="1000" height="1000" />
        <rect className={styles.designBody} x="75" y="75" width="850" height="850" />
        <line className={styles.baseline} x1="-120" x2="1120" y1="880" y2="880" />
        <line className={styles.origin} x1="0" x2="0" y1="-120" y2="1120" />
        <SvgRenderer
          syllable={syllable}
          schema={CURRENT_SCHEMAS[syllable.layoutType]}
          globalStyle={PRESET_SOURCE_MANIFEST.currentBaseline.globalStyle.value}
          size={1000}
          className={styles.internalGlyphLayer}
          overflow="hidden"
        />
      </svg>
    </figure>
  )
}

function candidateSchemaId(target: PresetCompositionTarget): LayoutType {
  if (target.structure === 'right') return target.finalJamo
    ? 'choseong-jungseong-vertical-jongseong'
    : 'choseong-jungseong-vertical'
  if (target.structure === 'bottom') return target.finalJamo
    ? 'choseong-jungseong-horizontal-jongseong'
    : 'choseong-jungseong-horizontal'
  return target.finalJamo
    ? 'choseong-jungseong-mixed-jongseong'
    : 'choseong-jungseong-mixed'
}

function R4CandidateCanvas({ target, fit, initialGlyph, display, showGuides }: {
  target: PresetCompositionTarget
  fit: PresetCompositionFitResult | undefined
  initialGlyph: GlyphOutline | undefined
  display: DisplayContract
  showGuides: boolean
}) {
  const guideMaster = createPresetCompositionGuideMaster(target)
  const guideMasterReady = guideMaster.status === 'ready-direct-guide-master' || guideMaster.status === 'ready-projected-guide-master'
  const generated = generatePresetGuideGlyph(target)
  const initialPath = generated && initialGlyph && !initialGlyph.missing
    ? selectPresetGuideComponentPath(initialGlyph.path, generated.initialContourIds)
    : null
  const initialArea = target.initial.source.selectionArea.status === 'candidate'
    ? target.initial.source.selectionArea.value
    : null
  const finalArea = target.final?.source.selectionArea.status === 'candidate'
    ? target.final.source.selectionArea.value
    : null
  return (
    <figure
      className={styles.glyphFigure}
      data-app-glyph-revision={fit ? 'r4-fit' : 'r4-pending'}
      data-fit-status={fit?.status ?? 'blocked-final-review'}
      data-testid="r4-candidate-canvas"
    >
      <figcaption className={styles.glyphLabel}>{generated ? '기준선 기반 생성 · 직각형' : guideMasterReady ? '추출 기준선 입력 · 자모 형태 생성 전' : fit ? '구형 자모 배치 실험 · 생성본 아님' : '기준선 기반 자모 생성 대기'}</figcaption>
      <svg className={styles.glyphSvg} viewBox={DEFAULT_DISPLAY.viewBox.join(' ')} data-coordinate-frame="shared-baseline" aria-label={`${target.character} r4 생성 대기 캔버스`}>
        <rect className={styles.canvasBackground} x="0" y="0" width="1000" height="1000" />
        {showGuides && <g data-testid="candidate-guide-layer">
          <rect className={styles.emFrame} x="0" y="0" width="1000" height="1000" />
          <rect className={styles.designBody} x="75" y="75" width="850" height="850" />
          <line className={styles.baseline} x1="-120" x2="1120" y1="880" y2="880" />
          {initialArea && <rect className={styles.initialAreaPending} x={initialArea.x} y={initialArea.y} width={initialArea.width} height={initialArea.height} />}
          {finalArea && <rect className={styles.finalAreaPending} x={finalArea.x} y={finalArea.y} width={finalArea.width} height={finalArea.height} />}
        </g>}
        {fit && !guideMasterReady && <SvgRenderer
          syllable={decomposeSyllable(target.character, CURRENT_JAMOS.choseong, CURRENT_JAMOS.jungseong, CURRENT_JAMOS.jongseong)}
          boxes={fit.boxes}
          globalStyle={R4_STYLE}
          size={1000}
          className={styles.internalGlyphLayer}
          overflow="hidden"
        />}
        {showGuides && <g data-testid="candidate-observation-layer"><ObservationLines elements={target.medial.source.elements} /></g>}
        {generated && initialPath && initialGlyph && !initialGlyph.missing && <g data-testid="guide-generated-glyph" fill="#171717">
          <path data-guide-element="CH:source-contours" d={initialPath} transform={`matrix(${display.unitsPerEm / initialGlyph.unitsPerEm} 0 0 ${-(display.unitsPerEm / initialGlyph.unitsPerEm)} 0 ${display.baselineY})`} />
          <g transform="scale(1000)">{generated.rects.map(({ id, ...rect }) => <rect key={id} data-guide-element={id} {...rect} />)}</g>
        </g>}
        {generated && !initialPath && <text className={styles.canvasStatus} x="500" y="510" textAnchor="middle">초성 추출 윤곽 불러오는 중</text>}
        {guideMasterReady && !generated && <text className={styles.canvasStatus} x="500" y="510" textAnchor="middle">기준선 자모 형태 생성 전</text>}
        {!fit && !guideMasterReady && <text className={styles.pendingCharacter} x="500" y="475" textAnchor="middle">{target.character}</text>}
        {!fit && !guideMasterReady && <text className={styles.canvasStatus} x="500" y="555" textAnchor="middle">종성 사용자 검수 후 생성</text>}
      </svg>
      {generated && <small className={styles.fitMetric}>{generated.inferred.join(' / ')} · 시각 검수 대기</small>}
      {fit && !guideMasterReady && <small className={styles.fitMetric}>RMSE {fit.currentRmse.toFixed(1)} → {fit.candidateRmse.toFixed(1)} · 간격 {(fit.collision.gap * 1000).toFixed(1)}</small>}
    </figure>
  )
}

function TargetCard({ target, glyph, initialGlyph, display, loading, fit, showGuides }: {
  target: PresetCompositionTarget
  glyph: GlyphOutline | undefined
  initialGlyph: GlyphOutline | undefined
  display: DisplayContract
  loading: boolean
  fit: PresetCompositionFitResult | undefined
  showGuides: boolean
}) {
  const medialCandidateCount = target.medial.source.elements.filter(({ face, visibleSpans }) => (
    face.status === 'candidate' && visibleSpans.status === 'candidate'
  )).length
  const evidence = presetCompositionEvidence(target)
  const guideMaster = createPresetCompositionGuideMaster(target)
  const ready = guideMaster.status === 'ready-direct-guide-master' || guideMaster.status === 'ready-projected-guide-master'
  const fitLabel = guideMaster.status === 'ready-direct-guide-master' ? '직접 추출 기준선 생성'
    : guideMaster.status === 'ready-projected-guide-master' ? '투영 기준선 생성 · 검수 필요' : '추출 입력 검수 대기'
  return (
    <article
      className={styles.caseCard}
      data-testid="preset-composition-target"
      data-character={target.character}
      data-composition-gate={target.gate}
      data-input-evidence={evidence}
      data-guide-master-status={guideMaster.status}
      data-generation-status={ready ? 'guide-generated' : 'blocked-missing-guide-master'}
    >
      <header className={styles.caseHeader}>
        <div><strong>{target.character}</strong><span>{target.medialJamo} · {target.finalJamo ? 'ㄱ 받침' : '무받침'}</span></div>
        <span className={ready ? styles.approvedBadge : styles.pendingBadge}>
          {fitLabel}
        </span>
      </header>
      <div className={styles.glyphPair}>
        <SourceGlyphCanvas target={target} glyph={glyph} display={display} loading={loading} showGuides={showGuides} />
        <R4CandidateCanvas target={target} fit={fit} initialGlyph={initialGlyph} display={display} showGuides={showGuides} />
        <CurrentAppCanvas target={target} />
      </div>
      <dl className={styles.targetSources}>
        <div><dt>생성 상태</dt><dd>{ready ? '기준선 기반 직각형 생성 · 시각 검수 대기' : '기준선 기반 자모 생성 대기'}<small>직접 추출된 기준면에 획을 생성합니다. 곡률과 미측정 구간은 Noto 원형 복원값이 아닙니다.</small></dd></div>
        <div><dt>초성 v3</dt><dd>{target.initial.source.character} · {projectionLabel(target.initial.projection)}<small>{initialAreaLabel(target)}</small></dd></div>
        <div><dt>홀자</dt><dd>{target.medial.source.character} · {projectionLabel(target.medial.projection)}<small>역할면 {medialCandidateCount}/{target.medial.source.elements.length}</small></dd></div>
        <div><dt>종성 v1</dt><dd>{target.final ? `${target.final.source.identity.character} · ${projectionLabel(target.final.projection)}` : '해당 없음'}<small>{target.final ? finalAreaLabel(target) : '무받침 조합'}</small></dd></div>
      </dl>
    </article>
  )
}

export function PresetCandidateLabPage() {
  const [initialJamo, setInitialJamo] = useState<(typeof CHOSEONG_LIST)[number]>('ㄱ')
  const [filter, setFilter] = useState<BoardFilter>('all')
  const [showGuides, setShowGuides] = useState(true)
  const board = useMemo(() => buildPresetCompositionBoard(initialJamo), [initialJamo])
  const [display, setDisplay] = useState<DisplayContract>(DEFAULT_DISPLAY)
  const [glyphs, setGlyphs] = useState<ReadonlyMap<string, GlyphOutline>>(new Map())
  const [outlineLoading, setOutlineLoading] = useState(true)
  const [outlineError, setOutlineError] = useState<string | null>(null)
  const readyGuideMasterCount = board.filter((target) => (
    ['ready-direct-guide-master', 'ready-projected-guide-master'].includes(createPresetCompositionGuideMaster(target).status)
  )).length
  const fittedCandidates = useMemo(() => new Map(board
    .filter(({ finalJamo }) => finalJamo === null)
    .map((target) => [target.character, fitPresetCompositionNoFinal({
      target,
      baseSchema: CURRENT_SCHEMAS[candidateSchemaId(target)],
      jamos: CURRENT_JAMOS,
    })])), [board])
  const visibleTargets = board.filter(({ gate }) => (
    filter === 'all'
    || (filter === 'ready' && gate === 'ready-for-layout-fit')
    || (filter === 'blocked' && gate === 'blocked-final-visual-review')
  ))

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    async function loadOutlines(): Promise<void> {
      setOutlineLoading(true)
      setOutlineError(null)
      try {
        const catalogResponse = await fetch(FONT_CATALOG_URL, {
          headers: { Accept: 'application/json' }, credentials: 'same-origin', signal: controller.signal,
        })
        const catalog = parseFontCatalogResponse(await requireSuccessfulJson(catalogResponse))
        const font = catalog.fonts.find(({ id }) => id === PRESET_SOURCE_MANIFEST.font.id)
        if (!font) throw new Error('Noto Sans KR 기준 폰트를 찾지 못했습니다.')
        if (font.fileSha256 !== PRESET_SOURCE_MANIFEST.font.fileSha256) throw new Error('Noto Sans KR 파일 SHA가 추출 데이터와 다릅니다.')
        const characters = board.map(({ character }) => character)
        const chunks = Array.from({ length: Math.ceil(characters.length / OUTLINE_CHUNK_SIZE) }, (_, index) => (
          characters.slice(index * OUTLINE_CHUNK_SIZE, (index + 1) * OUTLINE_CHUNK_SIZE).join('')
        ))
        const responses = await Promise.all(chunks.map(async (text) => {
          const response = await fetch(OUTLINE_URL, {
            method: 'POST',
            headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
            credentials: 'same-origin',
            body: JSON.stringify({ text, fontIds: [font.id] }),
            signal: controller.signal,
          })
          const parsed = parseOutlineResponse(await requireSuccessfulJson(response))
          validateOutlineCoverage(parsed, text, [font])
          return parsed
        }))
        const loadedGlyphs = responses.flatMap((response) => response.samples[0]?.glyphs ?? [])
        if (active) {
          setDisplay(catalog.display)
          setGlyphs(new Map(loadedGlyphs.map((glyph) => [glyph.character, glyph])))
        }
      } catch (error) {
        if (active && !isAbortError(error)) {
          setGlyphs(new Map())
          setOutlineError(describeError(error))
        }
      } finally {
        if (active) setOutlineLoading(false)
      }
    }
    void loadOutlines()
    return () => { active = false; controller.abort() }
  }, [board])

  return (
    <main
      className={styles.page}
      data-testid="preset-candidate-lab"
      data-local-storage-policy="read-only"
      data-candidate-revision="r4-input"
    >
      <button
        type="button"
        className={styles.guideToggle}
        aria-pressed={!showGuides}
        onClick={() => setShowGuides((visible) => !visible)}
      >
        <span aria-hidden="true">{showGuides ? '⊘' : '⌗'}</span>
        {showGuides ? '가이드선 숨기기' : '가이드선 보이기'}
      </button>
      <header className={styles.hero}>
        <div className={styles.heroTopline}>
          <span>내부 생성 입력 · 제품 미반영</span>
          <div className={styles.statusChips} aria-label="프리셋 입력 상태">
            <span>초성 114/114 연결</span><span>홀자 42/42 연결</span><span>종성 81/81 후보 · 검수 대기</span><span>production 0</span>
          </div>
        </div>
        <h1>기본 고딕 01<br />공동 조합 입력 r4</h1>
        <p>Noto에서 추출하고 확인한 닿자·홀자 기준선으로 자모와 프리셋 폰트를 만듭니다. 가·고·과는 기준면에서 직접 생성한 직각형 후보를 표시합니다. 다른 조합의 중앙 그림은 구형 자모 배치 실험입니다.</p>
        <nav className={styles.labLinks} aria-label="관련 분석 화면">
          <a href="/font-guide-lab?font=noto-sans-kr">세부 기준선 랩</a>
          <a href="/noto-corpus-lab">전체 추출 진행·검수</a>
          <a href="/reference-group-lab">이용제 구조군 랩</a>
        </nav>
      </header>

      <section className={styles.gate} aria-labelledby="preset-gate-heading">
        <span>입력 계약 · {PRESET_COMPOSITION_INPUT_VERSION}</span>
        <h2 id="preset-gate-heading">추출 입력 확인과 폰트 생성 완료를 구분합니다</h2>
        <p>초성은 사용자 확인 완료된 v3, 홀자는 승인 G0+v9, 종성은 새 v1 후보를 씁니다. 종성 후보는 구조 데이터만 연결됐고 시각 승인은 남았습니다.</p>
        <dl>
          <div><dt>초성</dt><dd>{PRESET_INITIAL_SOURCE.cases.length}건 · 19초성 × 대표 6문맥 · 승인 완료</dd></div>
          <div><dt>홀자</dt><dd>21홀자 × 무받침/ㄱ · 구조 문맥 투영 출처 표시</dd></div>
          <div><dt>종성</dt><dd>{PRESET_FINAL_SOURCE.cases.length}건 · 구조 {PRESET_FINAL_EVALUATION.structuralCheckStatus} · 화면 {PRESET_FINAL_EVALUATION.visualReviewStatus}</dd></div>
          <div><dt>끝면</dt><dd>linecap {PRESET_COMPOSITION_STYLE.linecap} · linejoin {PRESET_COMPOSITION_STYLE.linejoin} · 붓촉 {PRESET_COMPOSITION_STYLE.brushTip}</dd></div>
        </dl>
        <div className={styles.invalidatedList}>
          {INVALIDATED_PRESET_REVISIONS.map(({ revision, reason }) => <p key={revision}><strong>{revision} 폐기</strong>{reason}</p>)}
        </div>
      </section>

      <section className={styles.initialPicker} aria-label="초성 선택">
        <strong>초성</strong>
        <div>{CHOSEONG_LIST.map((jamo) => (
          <button
            key={jamo}
            type="button"
            className={initialJamo === jamo ? styles.activeFilter : undefined}
            aria-pressed={initialJamo === jamo}
            onClick={() => setInitialJamo(jamo)}
          >{jamo}</button>
        ))}</div>
      </section>

      <section className={styles.filters} aria-label="조합 상태 필터">
        <div><strong>조합 상태</strong>{BOARD_FILTERS.map(({ id, label }) => (
          <button key={id} type="button" className={filter === id ? styles.activeFilter : undefined} aria-pressed={filter === id} onClick={() => setFilter(id)}>{label}</button>
        ))}</div>
      </section>

      <section className={styles.caseSection} aria-labelledby="preset-cases-heading">
        <div className={styles.sectionHeading}>
          <div><span>단일 검수 보드</span><h2 id="preset-cases-heading">{initialJamo} × 21홀자 × 무받침/ㄱ</h2></div>
          <p>현재 {visibleTargets.length}자. 추출 기준선 입력 확인 {readyGuideMasterCount}자. 기준선 생성 후보는 직각형으로 표시하며, 문맥 투영은 미확인으로 유지합니다.</p>
        </div>
        {outlineError && <p className={styles.error} role="alert">Noto 윤곽을 표시하지 못했습니다: {outlineError}</p>}
        <div className={styles.caseGrid}>{visibleTargets.map((target) => (
          <TargetCard
            key={target.character}
            target={target}
            glyph={glyphs.get(target.character)}
            initialGlyph={glyphs.get(target.initial.source.character)}
            display={display}
            loading={outlineLoading}
            fit={fittedCandidates.get(target.character)}
            showGuides={showGuides}
          />
        ))}</div>
      </section>

      <footer className={styles.footer}>
        <strong>안전 경계</strong>
        <p>이 화면은 읽기 전용입니다. Zustand, localStorage, 제품 프리셋을 수정하지 않습니다. 종성 사용자 승인 전 받침 포함 후보를 생성하지 않습니다.</p>
      </footer>
    </main>
  )
}
