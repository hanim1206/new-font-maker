import { useEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import {
  describeError,
  isAbortError,
  parseFontCatalogResponse,
  parseOutlineResponse,
  requireSuccessfulJson,
  validateOutlineCoverage,
  type DisplayContract,
  type FontCatalogResponse,
  type GlyphOutline,
  type OutlineResponse,
  type ReferenceFont,
} from './ReferenceLabPage'
import styles from './FontGuideLabPage.module.css'

const FONT_CATALOG_URL = '/api/reference/v1/fonts'
const OUTLINE_URL = '/api/reference/v1/outlines'
const STORAGE_KEY = 'reference-font-guide-calibrations-v1'
const BASELINE_Y = 880
const MIN_GUIDE_GAP = 30

type GuideId = 'initialTop' | 'initialBottom' | 'finalTop' | 'finalBottom' | 'pillarX'
type ContextId = 'initial-horizontal' | 'initial-horizontal-final' | 'initial-vertical' | 'initial-vertical-final' | 'initial-mixed' | 'initial-mixed-final'
type InitialConsonant = 'ㄱ' | 'ㄲ' | 'ㄴ' | 'ㄷ' | 'ㄸ' | 'ㄹ' | 'ㅁ' | 'ㅂ' | 'ㅃ' | 'ㅅ' | 'ㅆ' | 'ㅇ' | 'ㅈ' | 'ㅉ' | 'ㅊ' | 'ㅋ' | 'ㅌ' | 'ㅍ' | 'ㅎ'

interface GuideSet {
  initialTop: number
  initialBottom: number
  finalTop: number
  finalBottom: number
  pillarX: number
}

interface GuideDefinition {
  id: GuideId
  label: string
  axis: 'x' | 'y'
  color: string
}

interface GuideCalibrationStore {
  schema: 'reference-font-guide-calibrations-v4'
  version: 4
  values: Record<string, FontGuideProfile>
}

interface FontGuideProfile {
  base: Partial<Record<ContextId, GuideSet>>
  overrides: Partial<Record<InitialConsonant, Partial<Record<ContextId, GuideSet>>>>
}

interface PreviousInitialGuideCalibrationStore {
  schema: 'reference-font-guide-calibrations-v3'
  version: 3
  values: Record<string, Partial<Record<InitialConsonant, Partial<Record<ContextId, GuideSet>>>>>
}

interface PreviousGuideCalibrationStore {
  schema: 'reference-font-guide-calibrations-v2'
  version: 2
  values: Record<string, Partial<Record<ContextId, GuideSet>>>
}

interface LegacyGuideCalibrationStore {
  schema: 'reference-font-guide-calibrations-v1'
  version: 1
  values: Record<string, GuideSet>
}

interface CaseContext {
  id: ContextId
  medial: 'ㅏ' | 'ㅗ' | 'ㅘ'
  finalIndex: 0 | 1 | 21
  label: string
  pairLabel: string
  hasFinal: boolean
  showsPillar: boolean
}

const DEFAULT_GUIDES: GuideSet = {
  initialTop: 90,
  initialBottom: 590,
  finalTop: 650,
  finalBottom: 930,
  pillarX: 610,
}

const GUIDE_DEFINITIONS: readonly GuideDefinition[] = [
  { id: 'initialTop', label: '첫닿윗선', axis: 'y', color: '#d97706' },
  { id: 'initialBottom', label: '첫닿밑선', axis: 'y', color: '#d97706' },
  { id: 'finalTop', label: '받침윗선', axis: 'y', color: '#7c3aed' },
  { id: 'finalBottom', label: '받침밑선', axis: 'y', color: '#7c3aed' },
  { id: 'pillarX', label: '기둥선', axis: 'x', color: '#0f766e' },
]

const INITIAL_CONSONANTS: readonly InitialConsonant[] = ['ㄱ', 'ㄲ', 'ㄴ', 'ㄷ', 'ㄸ', 'ㄹ', 'ㅁ', 'ㅂ', 'ㅃ', 'ㅅ', 'ㅆ', 'ㅇ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ', 'ㅌ', 'ㅍ', 'ㅎ']
const INITIAL_INDEX = new Map<InitialConsonant, number>(INITIAL_CONSONANTS.map((consonant, index) => [consonant, index]))
const MEDIAL_INDEX: Readonly<Record<CaseContext['medial'], number>> = { 'ㅏ': 0, 'ㅗ': 8, 'ㅘ': 9 }

const CASE_CONTEXTS: readonly CaseContext[] = [
  { id: 'initial-horizontal', medial: 'ㅏ', finalIndex: 0, label: '가로 첫닿자', pairLabel: '가로 첫닿자 ↔ 오른쪽 홀자 · 받침', hasFinal: false, showsPillar: true },
  { id: 'initial-horizontal-final', medial: 'ㅏ', finalIndex: 1, label: '오른쪽 홀자 · 받침', pairLabel: '가로 첫닿자 ↔ 오른쪽 홀자 · 받침', hasFinal: true, showsPillar: true },
  { id: 'initial-vertical', medial: 'ㅗ', finalIndex: 0, label: '세로 첫닿자', pairLabel: '세로 첫닿자 ↔ 아래 홀자 · 받침', hasFinal: false, showsPillar: false },
  { id: 'initial-vertical-final', medial: 'ㅗ', finalIndex: 1, label: '아래 홀자 · 받침', pairLabel: '세로 첫닿자 ↔ 아래 홀자 · 받침', hasFinal: true, showsPillar: false },
  { id: 'initial-mixed', medial: 'ㅘ', finalIndex: 0, label: '섞임 첫닿자', pairLabel: '섞임 첫닿자 ↔ 섞임 홀자 · 받침', hasFinal: false, showsPillar: true },
  { id: 'initial-mixed-final', medial: 'ㅘ', finalIndex: 21, label: '섞임 홀자 · 받침', pairLabel: '섞임 첫닿자 ↔ 섞임 홀자 · 받침', hasFinal: true, showsPillar: true },
]

const CASE_PAIRS: readonly { label: string; contextIds: readonly ContextId[] }[] = [
  { label: '가로 첫닿자 ↔ 오른쪽 홀자 · 받침', contextIds: ['initial-horizontal', 'initial-horizontal-final'] },
  { label: '섞임 첫닿자 ↔ 섞임 홀자 · 받침', contextIds: ['initial-mixed', 'initial-mixed-final'] },
  { label: '세로 첫닿자 ↔ 아래 홀자 · 받침', contextIds: ['initial-vertical', 'initial-vertical-final'] },
]

const CONTEXT_BY_ID = new Map<ContextId, CaseContext>(CASE_CONTEXTS.map((context) => [context.id, context]))

const clamp = (value: number, min: number, max: number): number => Math.min(Math.max(value, min), max)

function createGuidesByContext(seed: GuideSet = DEFAULT_GUIDES): Record<ContextId, GuideSet> {
  return CASE_CONTEXTS.reduce<Record<ContextId, GuideSet>>((guidesByContext, context) => {
    guidesByContext[context.id] = { ...seed }
    return guidesByContext
  }, {} as Record<ContextId, GuideSet>)
}

function guideDefinitionsFor(context: CaseContext): readonly GuideDefinition[] {
  return GUIDE_DEFINITIONS.filter((guide) => {
    if (guide.id.startsWith('final')) return context.hasFinal
    if (guide.id === 'pillarX') return context.showsPillar
    return true
  })
}

function caseCharacter(context: CaseContext, initial: InitialConsonant): string {
  return String.fromCodePoint(0xac00 + INITIAL_INDEX.get(initial)! * 588 + MEDIAL_INDEX[context.medial] * 28 + context.finalIndex)
}

function caseText(initial: InitialConsonant): string {
  return CASE_CONTEXTS.map((context) => caseCharacter(context, initial)).join('')
}

function calibrationKey(font: ReferenceFont): string {
  const axes = Object.entries(font.axes).sort(([left], [right]) => left.localeCompare(right)).map(([tag, value]) => `${tag}=${value}`).join('&')
  return `${font.id}:${font.fileSha256}:${axes}`
}

function parseStoredCalibrations(): GuideCalibrationStore {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(STORAGE_KEY) ?? 'null')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('missing')
    const record = parsed as Partial<GuideCalibrationStore | PreviousInitialGuideCalibrationStore | PreviousGuideCalibrationStore | LegacyGuideCalibrationStore>
    if (!record.values || typeof record.values !== 'object' || Array.isArray(record.values)) throw new Error('invalid')
    if (record.schema === 'reference-font-guide-calibrations-v4' && record.version === 4) {
      return { schema: 'reference-font-guide-calibrations-v4', version: 4, values: record.values as Record<string, FontGuideProfile> }
    }
    if (record.schema === 'reference-font-guide-calibrations-v3' && record.version === 3) {
      const previousValues = record.values as PreviousInitialGuideCalibrationStore['values']
      return {
        schema: 'reference-font-guide-calibrations-v4',
        version: 4,
        values: Object.fromEntries(Object.entries(previousValues).map(([key, overrides]) => [key, { base: {}, overrides }])),
      }
    }
    if (record.schema === 'reference-font-guide-calibrations-v2' && record.version === 2) {
      const previousValues = record.values as Record<string, Partial<Record<ContextId, GuideSet>>>
      return {
        schema: 'reference-font-guide-calibrations-v4',
        version: 4,
        values: Object.fromEntries(Object.entries(previousValues).map(([key, value]) => [key, { base: {}, overrides: { 'ㄱ': value } }])),
      }
    }
    if (record.schema === 'reference-font-guide-calibrations-v1' && record.version === 1) {
      const legacyValues = record.values as Record<string, unknown>
      return {
        schema: 'reference-font-guide-calibrations-v4',
        version: 4,
        values: Object.fromEntries(Object.entries(legacyValues).flatMap(([key, value]) => isGuideSet(value) ? [[key, { base: {}, overrides: { 'ㄱ': createGuidesByContext(value) } }]] : [])),
      }
    }
    throw new Error('invalid')
  } catch {
    return { schema: 'reference-font-guide-calibrations-v4', version: 4, values: {} }
  }
}

function isGuideSet(value: unknown): value is GuideSet {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as Record<string, unknown>
  return GUIDE_DEFINITIONS.every(({ id }) => typeof candidate[id] === 'number' && Number.isFinite(candidate[id]))
}

function emptyGuideProfile(): FontGuideProfile {
  return { base: {}, overrides: {} }
}

function resolveGuides(profile: FontGuideProfile, initial: InitialConsonant): Record<ContextId, GuideSet> {
  const defaults = createGuidesByContext()
  CASE_CONTEXTS.forEach((context) => {
    const baseGuides = profile.base[context.id]
    const overrideGuides = profile.overrides[initial]?.[context.id]
    if (isGuideSet(baseGuides)) defaults[context.id] = baseGuides
    if (isGuideSet(overrideGuides)) defaults[context.id] = overrideGuides
  })
  return defaults
}

function readGuideProfile(font: ReferenceFont): FontGuideProfile {
  return parseStoredCalibrations().values[calibrationKey(font)] ?? emptyGuideProfile()
}

function hasStoredGuides(profile: FontGuideProfile, initial: InitialConsonant): boolean {
  return CASE_CONTEXTS.some((context) => isGuideSet(profile.base[context.id]) || isGuideSet(profile.overrides[initial]?.[context.id]))
}

function guideSource(profile: FontGuideProfile, initial: InitialConsonant, contextId: ContextId): 'base' | 'override' | 'default' {
  if (isGuideSet(profile.overrides[initial]?.[contextId])) return 'override'
  if (isGuideSet(profile.base[contextId])) return 'base'
  return 'default'
}

function writeGuideProfile(font: ReferenceFont, profile: FontGuideProfile): void {
  const stored = parseStoredCalibrations()
  stored.values[calibrationKey(font)] = profile
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(stored))
}

function updateGuide(context: CaseContext, guides: GuideSet, id: GuideId, value: number): GuideSet {
  const rounded = Math.round(value)
  switch (id) {
    case 'initialTop': return { ...guides, initialTop: clamp(rounded, 0, guides.initialBottom - MIN_GUIDE_GAP) }
    case 'initialBottom': return { ...guides, initialBottom: clamp(rounded, guides.initialTop + MIN_GUIDE_GAP, context.hasFinal ? guides.finalTop - MIN_GUIDE_GAP : BASELINE_Y) }
    case 'finalTop': return { ...guides, finalTop: clamp(rounded, guides.initialBottom + MIN_GUIDE_GAP, guides.finalBottom - MIN_GUIDE_GAP) }
    case 'finalBottom': return { ...guides, finalBottom: clamp(rounded, Math.max(guides.finalTop + MIN_GUIDE_GAP, BASELINE_Y), 1000) }
    case 'pillarX': return { ...guides, pillarX: clamp(rounded, 0, 1000) }
  }
}

function pointerGuideValue(event: ReactPointerEvent<SVGElement>, axis: GuideDefinition['axis'], svg: SVGSVGElement): number {
  const rect = svg.getBoundingClientRect()
  const ratio = axis === 'x'
    ? (event.clientX - rect.left) / rect.width
    : (event.clientY - rect.top) / rect.height
  return clamp(-120 + ratio * 1240, 0, 1000)
}

function GuideTile({
  context,
  display,
  font,
  glyph,
  guides,
  selected,
  onSelectContext,
  onGuidePointerDown,
  onGuidePointerMove,
  onGuidePointerUp,
}: {
  context: CaseContext
  display: DisplayContract
  font: ReferenceFont
  glyph: GlyphOutline
  guides: GuideSet
  selected: boolean
  onSelectContext: (contextId: ContextId) => void
  onGuidePointerDown: (contextId: ContextId, id: GuideId, event: ReactPointerEvent<SVGLineElement>) => void
  onGuidePointerMove: (event: ReactPointerEvent<SVGSVGElement>) => void
  onGuidePointerUp: (event: ReactPointerEvent<SVGSVGElement>) => void
}) {
  const visibleGuides = guideDefinitionsFor(context)

  return (
    <article className={`${styles.caseTile} ${selected ? styles.selectedCaseTile : ''}`} data-testid="font-guide-case" data-glyph={glyph.character} data-context-id={context.id}>
      <header>
        <button type="button" aria-label={`${glyph.character} 사례 기준선 선택`} aria-pressed={selected} onClick={() => onSelectContext(context.id)}>
          <strong>{glyph.character}</strong><span>{context.label}</span>
        </button>
      </header>
      <svg
        className={styles.glyphCanvas}
        viewBox={display.viewBox.join(' ')}
        data-testid="font-guide-glyph"
        data-coordinate-frame="shared-baseline"
        role="img"
        aria-label={`${font.family} ${glyph.character} 기준선 조율`}
        onPointerMove={onGuidePointerMove}
        onPointerUp={onGuidePointerUp}
        onPointerCancel={onGuidePointerUp}
      >
        <rect className={styles.emFrame} x="0" y="0" width="1000" height="1000" />
        <rect className={styles.designBody} x="75" y="75" width="850" height="850" />
        {glyph.missing ? (
          <text className={styles.missingGlyph} x="500" y="500" textAnchor="middle">글리프 없음</text>
        ) : (
          <g transform={`matrix(${display.unitsPerEm / glyph.unitsPerEm} 0 0 ${-(display.unitsPerEm / glyph.unitsPerEm)} 0 ${display.baselineY})`}>
            <path className={styles.glyphInk} d={glyph.path} />
          </g>
        )}
        <line className={styles.baseline} x1="-120" x2="1120" y1={display.baselineY} y2={display.baselineY} />
        {visibleGuides.map((guide) => {
          const value = guides[guide.id]
          return guide.axis === 'y' ? (
            <g key={guide.id}>
              <line className={styles.draggableGuide} x1="-120" x2="1120" y1={value} y2={value} stroke={guide.color} />
              <line className={styles.guideHitArea} data-guide-id={guide.id} x1="-120" x2="1120" y1={value} y2={value} onPointerDown={(event) => onGuidePointerDown(context.id, guide.id, event)} />
            </g>
          ) : (
            <g key={guide.id}>
              <line className={styles.draggableGuide} x1={value} x2={value} y1="-120" y2="1120" stroke={guide.color} />
              <line className={styles.guideHitArea} data-guide-id={guide.id} x1={value} x2={value} y1="-120" y2="1120" onPointerDown={(event) => onGuidePointerDown(context.id, guide.id, event)} />
            </g>
          )
        })}
      </svg>
    </article>
  )
}

export function FontGuideLabPage() {
  const requestedFontId = useMemo(() => new URLSearchParams(window.location.search).get('font'), [])
  const [catalog, setCatalog] = useState<FontCatalogResponse | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [activeFontId, setActiveFontId] = useState(requestedFontId ?? 'noto-sans-kr')
  const [comparison, setComparison] = useState<OutlineResponse | null>(null)
  const [comparisonError, setComparisonError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [guideProfile, setGuideProfile] = useState<FontGuideProfile>(() => emptyGuideProfile())
  const [activeInitial, setActiveInitial] = useState<InitialConsonant>('ㄱ')
  const [activeContextId, setActiveContextId] = useState<ContextId>('initial-horizontal')
  const [showExtraction, setShowExtraction] = useState(false)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)
  const [saveMessage, setSaveMessage] = useState('폰트를 고르면 기준선 값을 불러옵니다.')
  const guideProfileRef = useRef(guideProfile)
  const draggingGuideRef = useRef<{ initial: InitialConsonant; contextId: ContextId; id: GuideId } | null>(null)
  const activeFont = catalog?.fonts.find(({ id }) => id === activeFontId) ?? catalog?.fonts[0] ?? null
  const activeContext = CONTEXT_BY_ID.get(activeContextId)!
  const guidesByContext = useMemo(() => resolveGuides(guideProfile, activeInitial), [guideProfile, activeInitial])
  const activeGuides = guidesByContext[activeContextId]
  const activeGuideSource = guideSource(guideProfile, activeInitial, activeContextId)
  const activeContextCharacter = caseCharacter(activeContext, activeInitial)
  const currentCaseText = useMemo(() => caseText(activeInitial), [activeInitial])
  const extraction = activeFont ? JSON.stringify({
    schema: 'reference-font-guide-export-v1',
    font: { id: activeFont.id, family: activeFont.family, fileSha256: activeFont.fileSha256, axes: activeFont.axes },
    initialConsonant: activeInitial,
    baselineY: BASELINE_Y,
    contexts: CASE_CONTEXTS.map((context) => ({
      id: context.id,
      label: context.pairLabel,
      character: caseCharacter(context, activeInitial),
      source: guideSource(guideProfile, activeInitial, context.id),
      guides: guidesByContext[context.id],
    })),
  }, null, 2) : ''

  const applyGuides = (initial: InitialConsonant, contextId: ContextId, next: GuideSet, persist: boolean) => {
    const nextProfile: FontGuideProfile = {
      ...guideProfileRef.current,
      overrides: {
        ...guideProfileRef.current.overrides,
        [initial]: { ...guideProfileRef.current.overrides[initial], [contextId]: next },
      },
    }
    guideProfileRef.current = nextProfile
    setGuideProfile(nextProfile)
    if (persist && activeFont) {
      writeGuideProfile(activeFont, nextProfile)
      setSaveMessage(`${activeFont.family} · ${initial} · ${CONTEXT_BY_ID.get(contextId)!.label} 개별값을 저장했습니다.`)
    }
  }

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    async function loadCatalog(): Promise<void> {
      try {
        const response = await fetch(FONT_CATALOG_URL, { headers: { Accept: 'application/json' }, credentials: 'same-origin', signal: controller.signal })
        const parsed = parseFontCatalogResponse(await requireSuccessfulJson(response))
        if (active) {
          setCatalog(parsed)
          if (!parsed.fonts.some(({ id }) => id === activeFontId)) setActiveFontId(parsed.fonts[0].id)
        }
      } catch (error) {
        if (active && !isAbortError(error)) setCatalogError(describeError(error))
      }
    }
    void loadCatalog()
    return () => { active = false; controller.abort() }
  }, [])

  useEffect(() => {
    if (!activeFont) return
    const next = readGuideProfile(activeFont)
    guideProfileRef.current = next
    setGuideProfile(next)
    setSaveMessage(hasStoredGuides(next, activeInitial) ? `${activeFont.family} · ${activeInitial} 문맥별 저장값을 불러왔습니다.` : `${activeFont.family} · ${activeInitial} 문맥별 기본 기준선입니다.`)
  }, [activeFont, activeInitial])

  useEffect(() => {
    if (!catalog || !activeFont) return
    const fontForRequest = activeFont
    const controller = new AbortController()
    let active = true
    async function loadOutlines(): Promise<void> {
      setLoading(true)
      setComparisonError(null)
      try {
        const response = await fetch(OUTLINE_URL, {
          method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, credentials: 'same-origin',
          body: JSON.stringify({ text: currentCaseText, fontIds: [fontForRequest.id] }), signal: controller.signal,
        })
        const parsed = parseOutlineResponse(await requireSuccessfulJson(response))
        validateOutlineCoverage(parsed, currentCaseText, [fontForRequest])
        if (active) setComparison(parsed)
      } catch (error) {
        if (active && !isAbortError(error)) setComparisonError(describeError(error))
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadOutlines()
    return () => { active = false; controller.abort() }
  }, [catalog, activeFont, currentCaseText])

  const handleGuidePointerDown = (contextId: ContextId, id: GuideId, event: ReactPointerEvent<SVGLineElement>) => {
    event.preventDefault()
    const svg = event.currentTarget.ownerSVGElement
    if (!svg) return
    setActiveContextId(contextId)
    draggingGuideRef.current = { initial: activeInitial, contextId, id }
    svg.setPointerCapture(event.pointerId)
    const definition = GUIDE_DEFINITIONS.find((guide) => guide.id === id)!
    const currentGuides = resolveGuides(guideProfileRef.current, activeInitial)
    applyGuides(activeInitial, contextId, updateGuide(CONTEXT_BY_ID.get(contextId)!, currentGuides[contextId], id, pointerGuideValue(event, definition.axis, svg)), false)
  }

  const handleGuidePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = draggingGuideRef.current
    if (!drag) return
    const definition = GUIDE_DEFINITIONS.find((guide) => guide.id === drag.id)!
    const currentGuides = resolveGuides(guideProfileRef.current, drag.initial)
    applyGuides(drag.initial, drag.contextId, updateGuide(CONTEXT_BY_ID.get(drag.contextId)!, currentGuides[drag.contextId], drag.id, pointerGuideValue(event, definition.axis, event.currentTarget)), false)
  }

  const handleGuidePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const drag = draggingGuideRef.current
    if (!drag) return
    const definition = GUIDE_DEFINITIONS.find((guide) => guide.id === drag.id)!
    const currentGuides = resolveGuides(guideProfileRef.current, drag.initial)
    const next = updateGuide(CONTEXT_BY_ID.get(drag.contextId)!, currentGuides[drag.contextId], drag.id, pointerGuideValue(event, definition.axis, event.currentTarget))
    draggingGuideRef.current = null
    applyGuides(drag.initial, drag.contextId, next, true)
  }

  const handleGuideInput = (id: GuideId, rawValue: string) => {
    if (rawValue.trim() === '') return
    const value = Number(rawValue)
    if (!Number.isFinite(value)) return
    applyGuides(activeInitial, activeContextId, updateGuide(activeContext, activeGuides, id, value), false)
  }
  const handleGuideInputCommit = () => {
    if (!activeFont) return
    writeGuideProfile(activeFont, guideProfileRef.current)
    setSaveMessage(`${activeFont.family} · ${activeInitial} · ${activeContext.label} 개별값을 저장했습니다.`)
  }
  const handleResetOverride = () => {
    if (!activeFont) return
    const nextOverrides = { ...guideProfileRef.current.overrides }
    delete nextOverrides[activeInitial]
    const nextProfile = { ...guideProfileRef.current, overrides: nextOverrides }
    guideProfileRef.current = nextProfile
    setGuideProfile(nextProfile)
    writeGuideProfile(activeFont, nextProfile)
    setSaveMessage(`${activeFont.family} · ${activeInitial} 개별값을 지우고 기준값으로 돌아갔습니다.`)
  }
  const handleApplyBase = () => {
    if (!activeFont) return
    const nextOverrides = { ...guideProfileRef.current.overrides }
    delete nextOverrides[activeInitial]
    const nextProfile: FontGuideProfile = { base: resolveGuides(guideProfileRef.current, activeInitial), overrides: nextOverrides }
    guideProfileRef.current = nextProfile
    setGuideProfile(nextProfile)
    writeGuideProfile(activeFont, nextProfile)
    setSaveMessage(`${activeFont.family} · ${activeInitial} 6문맥 값을 모든 첫닿자의 기준값으로 적용했습니다.`)
  }
  const handleCopyExtraction = async () => {
    try {
      await navigator.clipboard.writeText(extraction)
      setCopyMessage('추출값을 클립보드에 복사했습니다.')
    } catch {
      setCopyMessage('클립보드 복사 실패. 추출 영역을 직접 선택해 복사하세요.')
    }
  }

  const glyphs = comparison?.samples.find(({ fontId }) => fontId === activeFont?.id)?.glyphs ?? []

  return (
    <main className={styles.page} data-testid="font-guide-lab">
      <header className={styles.hero}>
        <span>R0 분석 보드 · 폰트별 조율값</span>
        <h1>기준선 조율 랩</h1>
        <p>폰트와 조합 문맥마다 기준선 세트를 따로 조율합니다. 이 값은 분석용이며 폰트메이커 레이아웃이나 OTF에 자동 반영되지 않습니다.</p>
        <a href="/reference-group-lab">닿자 위치 변형 랩으로 돌아가기</a>
      </header>

      {catalog && activeFont && (
        <section className={styles.fontSwitch} aria-label="조율 폰트 선택">
          <span>조율할 폰트</span>
          <div>{catalog.fonts.map((font) => (
            <button key={font.id} type="button" aria-pressed={font.id === activeFont.id} className={font.id === activeFont.id ? styles.activeFont : undefined} onClick={() => setActiveFontId(font.id)}>{font.family}</button>
          ))}</div>
        </section>
      )}

      {catalog && activeFont && (
        <section className={styles.initialSwitch} aria-label="첫닿자 비교 선택">
          <span>첫닿자 비교</span>
          <div>{INITIAL_CONSONANTS.map((consonant) => (
            <button key={consonant} type="button" aria-pressed={consonant === activeInitial} className={consonant === activeInitial ? styles.activeInitial : undefined} onClick={() => setActiveInitial(consonant)}>{consonant}</button>
          ))}</div>
        </section>
      )}

      {catalogError && <p className={styles.error} role="alert">{catalogError}</p>}
      {comparisonError && <p className={styles.error} role="alert">{comparisonError}</p>}
      {catalog === null && !catalogError && <p className={styles.status} role="status">로컬 폰트 목록을 읽는 중…</p>}

      {catalog && activeFont && (
        <div className={styles.workspace}>
          <aside className={styles.controls} aria-label="기준선 값 조절">
            <header><span>FONT CALIBRATION</span><h2>{activeFont.family}</h2><p>{activeContextCharacter} · {activeContext.label}</p><p>{activeFont.fileName} · SHA {activeFont.fileSha256.slice(0, 10)}</p></header>
            <p className={styles.fixedBaseline}>기준선 <strong>{BASELINE_Y}</strong><span>폰트 원점 기준. 고정.</span></p>
            <p className={styles.guideSource} data-testid="guide-source">{activeGuideSource === 'override' ? '개별 조율됨' : activeGuideSource === 'base' ? '기준값 사용 중' : '기본값 사용 중'}</p>
            <div className={styles.guideControls}>
              {guideDefinitionsFor(activeContext).map((guide) => (
                <label key={guide.id} className={styles.guideControl} style={{ '--guide-color': guide.color } as CSSProperties}>
                  <span>{guide.label}</span>
                  <input
                    aria-label={guide.label}
                    type="number"
                    min="0"
                    max="1000"
                    step="1"
                    inputMode="numeric"
                    value={activeGuides[guide.id]}
                    onChange={(event) => handleGuideInput(guide.id, event.target.value)}
                    onBlur={handleGuideInputCommit}
                    onKeyDown={(event) => { if (event.key === 'Enter') event.currentTarget.blur() }}
                  />
                </label>
              ))}
            </div>
            <p className={styles.saveMessage} role="status">{saveMessage}</p>
            <button className={styles.applyBaseButton} type="button" onClick={handleApplyBase}>현재 {activeInitial} 6문맥을 기준값으로 적용</button>
            <button className={styles.exportButton} type="button" aria-expanded={showExtraction} onClick={() => setShowExtraction((visible) => !visible)}>기준선값 추출</button>
            {showExtraction && <div className={styles.extractionWrap}>
              <button className={styles.copyButton} type="button" onClick={() => void handleCopyExtraction()}>추출값 복사</button>
              {copyMessage && <p className={styles.copyMessage} role="status">{copyMessage}</p>}
              <pre className={styles.extraction} data-testid="guide-export">{extraction}</pre>
            </div>}
            <button className={styles.resetButton} type="button" onClick={handleResetOverride}>{activeInitial} 개별값 지우기</button>
            <p className={styles.methodNote}>기준값 적용은 다른 첫닿자의 직접 조율값을 덮어쓰지 않습니다. 첫닿자를 바꾸면 기준값을 상속하고, 편집한 문맥만 개별값이 됩니다.</p>
          </aside>

          <section className={styles.guideBoard} aria-label={`${activeFont.family} 기준선 조율 대지`}>
            <header className={styles.boardHeader}>
              <div><span>GUIDE CANVAS</span><h2>문맥별 기준선으로 조합 사례 확인</h2></div>
              <ul className={styles.legend}>
                <li><i className={styles.baselineMark} />기준선</li>
                {guideDefinitionsFor(activeContext).map((guide) => <li key={guide.id}><i style={{ background: guide.color }} />{guide.label}</li>)}
              </ul>
            </header>
            {loading && <p className={styles.status} role="status">조합 사례 윤곽을 읽는 중…</p>}
            {!loading && glyphs.length > 0 && (
              <div className={styles.caseGrid}>
                {CASE_PAIRS.map((pair) => (
                  <section key={pair.label} className={styles.casePair} data-testid="font-guide-pair" aria-label={pair.label}>
                    <h3>{pair.label}</h3>
                    {pair.contextIds.map((contextId) => {
                      const context = CONTEXT_BY_ID.get(contextId)!
                      const glyph = glyphs.find((candidate) => candidate.character === caseCharacter(context, activeInitial))
                      return glyph ? (
                        <GuideTile
                          key={glyph.character}
                          context={context}
                          display={comparison!.display}
                          font={activeFont}
                          glyph={glyph}
                          guides={guidesByContext[contextId]}
                          selected={contextId === activeContextId}
                          onSelectContext={setActiveContextId}
                          onGuidePointerDown={handleGuidePointerDown}
                          onGuidePointerMove={handleGuidePointerMove}
                          onGuidePointerUp={handleGuidePointerUp}
                        />
                      ) : null
                    })}
                  </section>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </main>
  )
}
