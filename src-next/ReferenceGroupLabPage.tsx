import { useEffect, useRef, useState } from 'react'
import {
  GlyphSpecimen,
  describeError,
  isAbortError,
  parseFontCatalogResponse,
  parseOutlineResponse,
  requireSuccessfulJson,
  validateOutlineCoverage,
  type FontCatalogResponse,
  type GlyphHighlight,
  type GlyphOutline,
  type OutlineResponse,
} from './ReferenceLabPage'
import styles from './ReferenceGroupLabPage.module.css'

const FONT_CATALOG_URL = '/api/reference/v1/fonts'
const OUTLINE_URL = '/api/reference/v1/outlines'
const OUTLINE_CHUNK_SIZE = 12

type ContextId = 'initial-horizontal-final' | 'initial-vertical-final' | 'final-horizontal-mixed' | 'final-vertical'
type ComparisonSet = Readonly<Partial<Record<ContextId, OutlineResponse>>>

interface ContextEntry { jamo: string; sample: string }
interface ContextGroup { id: number; jamos: readonly string[] }
interface Criterion { id: ContextId; title: string; highlight: GlyphHighlight; groups: readonly ContextGroup[]; entries: readonly ContextEntry[] }
interface JamoFeature { height: string; innerSpace: string }

const CHOSEONG_INDEX: Readonly<Record<string, number>> = {
  'ㄱ': 0, 'ㄲ': 1, 'ㄴ': 2, 'ㄷ': 3, 'ㄸ': 4, 'ㄹ': 5, 'ㅁ': 6, 'ㅂ': 7, 'ㅃ': 8,
  'ㅅ': 9, 'ㅆ': 10, 'ㅇ': 11, 'ㅈ': 12, 'ㅉ': 13, 'ㅊ': 14, 'ㅋ': 15, 'ㅌ': 16, 'ㅍ': 17, 'ㅎ': 18,
}

const JONGSEONG_INDEX: Readonly<Record<string, number>> = {
  'ㄱ': 1, 'ㄲ': 2, 'ㄳ': 3, 'ㄴ': 4, 'ㄵ': 5, 'ㄶ': 6, 'ㄷ': 7, 'ㄹ': 8, 'ㄺ': 9,
  'ㄻ': 10, 'ㄼ': 11, 'ㄽ': 12, 'ㄾ': 13, 'ㄿ': 14, 'ㅀ': 15, 'ㅁ': 16, 'ㅂ': 17,
  'ㅄ': 18, 'ㅅ': 19, 'ㅆ': 20, 'ㅇ': 21, 'ㅈ': 22, 'ㅊ': 23, 'ㅋ': 24, 'ㅌ': 25, 'ㅍ': 26, 'ㅎ': 27,
}

const JAMO_FEATURES: Readonly<Record<string, JamoFeature>> = {
  'ㄱ': { height: '2칸', innerSpace: '기본형' }, 'ㄴ': { height: '2칸', innerSpace: '기본형' },
  'ㄷ': { height: '2칸', innerSpace: '기본형' }, 'ㅁ': { height: '2칸', innerSpace: '기본형' },
  'ㅅ': { height: '2칸', innerSpace: '기본형' }, 'ㅇ': { height: '2칸', innerSpace: '기본형' },
  'ㅈ': { height: '2칸', innerSpace: 'ㅈ형' }, 'ㅍ': { height: '2칸', innerSpace: 'ㅍ·ㄲ·ㅆ형' },
  'ㄲ': { height: '2칸', innerSpace: 'ㅍ·ㄲ·ㅆ형' }, 'ㄸ': { height: '2칸', innerSpace: 'ㄹ·ㅂ·ㅌ·ㄸ형' },
  'ㅆ': { height: '2칸', innerSpace: 'ㅍ·ㄲ·ㅆ형' }, 'ㄹ': { height: '3칸 이상', innerSpace: 'ㄹ·ㅂ·ㅌ·ㄸ형' },
  'ㅂ': { height: '3칸 이상', innerSpace: 'ㄹ·ㅂ·ㅌ·ㄸ형' }, 'ㅌ': { height: '3칸 이상', innerSpace: 'ㄹ·ㅂ·ㅌ·ㄸ형' },
  'ㅋ': { height: '3칸 이상', innerSpace: 'ㅋ형' }, 'ㅊ': { height: '3칸 이상', innerSpace: 'ㅊ·ㅎ형' },
  'ㅎ': { height: '3칸 이상', innerSpace: 'ㅊ·ㅎ형' }, 'ㅃ': { height: '3칸 이상', innerSpace: 'ㅃ·ㅉ형' },
  'ㅉ': { height: '3칸 이상', innerSpace: 'ㅃ·ㅉ형' },
}

const MEDIAL_INDEX = { 'ㅏ': 0, 'ㅗ': 8, 'ㅘ': 9, 'ㅡ': 18 } as const

function syllable(initial: string, medial: keyof typeof MEDIAL_INDEX, final: string): string {
  const initialIndex = CHOSEONG_INDEX[initial]
  const finalIndex = JONGSEONG_INDEX[final]
  if (initialIndex === undefined || finalIndex === undefined) throw new Error(`지원하지 않는 자모: ${initial}${medial}${final}`)
  return String.fromCodePoint(0xac00 + ((initialIndex * 21 + MEDIAL_INDEX[medial]) * 28) + finalIndex)
}

function initialEntries(jamos: readonly string[], medial: keyof typeof MEDIAL_INDEX): ContextEntry[] {
  return jamos.map((jamo) => ({ jamo, sample: syllable(jamo, medial, 'ㅁ') }))
}

function finalEntries(jamos: readonly string[], medials: readonly (keyof typeof MEDIAL_INDEX)[]): ContextEntry[] {
  return jamos.map((jamo) => ({
    jamo,
    sample: medials.map((medial) => syllable(medial === 'ㅡ' ? 'ㄱ' : 'ㅁ', medial, jamo)).join(''),
  }))
}

function groupJamos(groups: readonly ContextGroup[]): string[] {
  return groups.flatMap(({ jamos }) => jamos)
}

const INITIAL_HORIZONTAL_GROUPS: readonly ContextGroup[] = [
  { id: 1, jamos: ['ㄱ'] },
  { id: 2, jamos: ['ㄴ', 'ㄷ', 'ㅁ', 'ㅅ', 'ㅇ'] },
  { id: 3, jamos: ['ㅈ', 'ㅋ'] },
  { id: 4, jamos: ['ㅍ', 'ㄲ', 'ㅆ'] },
  { id: 5, jamos: ['ㄹ', 'ㅂ', 'ㅊ', 'ㅌ', 'ㄸ'] },
  { id: 6, jamos: ['ㅎ', 'ㅃ', 'ㅉ'] },
]

const INITIAL_VERTICAL_GROUPS: readonly ContextGroup[] = [
  { id: 1, jamos: ['ㄱ', 'ㅅ'] },
  { id: 2, jamos: ['ㄴ'] },
  { id: 3, jamos: ['ㄷ', 'ㅁ', 'ㅇ', 'ㅈ', 'ㅋ'] },
  { id: 4, jamos: ['ㅍ', 'ㄲ', 'ㅆ'] },
  { id: 5, jamos: ['ㄹ', 'ㅂ', 'ㅊ', 'ㅌ', 'ㄸ'] },
  { id: 6, jamos: ['ㅎ', 'ㅃ', 'ㅉ'] },
]

const FINAL_HORIZONTAL_MIXED_GROUPS: readonly ContextGroup[] = [
  { id: 1, jamos: ['ㄱ', 'ㄷ', 'ㅁ', 'ㅅ', 'ㅇ'] },
  { id: 2, jamos: ['ㄴ'] },
  { id: 3, jamos: ['ㅈ', 'ㅋ', 'ㅍ', 'ㄲ'] },
  { id: 4, jamos: ['ㄹ', 'ㅂ', 'ㅌ', 'ㄳ', 'ㅆ'] },
  { id: 5, jamos: ['ㅊ', 'ㅎ'] },
  { id: 6, jamos: ['ㄵ', 'ㄶ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅄ'] },
]

const FINAL_VERTICAL_GROUPS: readonly ContextGroup[] = [
  { id: 1, jamos: ['ㄱ', 'ㄷ', 'ㅁ', 'ㅇ'] },
  { id: 2, jamos: ['ㄴ'] },
  { id: 3, jamos: ['ㅅ', 'ㅈ', 'ㅋ', 'ㅍ', 'ㄲ'] },
  { id: 4, jamos: ['ㄹ', 'ㅂ', 'ㅌ', 'ㄳ', 'ㅆ'] },
  { id: 5, jamos: ['ㅊ', 'ㅎ'] },
  { id: 6, jamos: ['ㄵ', 'ㄶ', 'ㄺ', 'ㄻ', 'ㄼ', 'ㄽ', 'ㄾ', 'ㄿ', 'ㅀ', 'ㅄ'] },
]

const CRITERIA: readonly Criterion[] = [
  {
    id: 'initial-horizontal-final', title: '가로모임꼴 받친글자 · 첫닿자', highlight: 'initial-left',
    groups: INITIAL_HORIZONTAL_GROUPS, entries: initialEntries(groupJamos(INITIAL_HORIZONTAL_GROUPS), 'ㅏ'),
  },
  {
    id: 'initial-vertical-final', title: '세로모임꼴 받친글자 · 첫닿자', highlight: 'initial-top',
    groups: INITIAL_VERTICAL_GROUPS, entries: initialEntries(groupJamos(INITIAL_VERTICAL_GROUPS), 'ㅗ'),
  },
  {
    id: 'final-horizontal-mixed', title: '가로·섞임모임꼴 · 받침닿자', highlight: 'final',
    groups: FINAL_HORIZONTAL_MIXED_GROUPS, entries: finalEntries(groupJamos(FINAL_HORIZONTAL_MIXED_GROUPS), ['ㅏ', 'ㅘ']),
  },
  {
    id: 'final-vertical', title: '세로모임꼴 · 받침닿자', highlight: 'final',
    groups: FINAL_VERTICAL_GROUPS, entries: finalEntries(groupJamos(FINAL_VERTICAL_GROUPS), ['ㅡ']),
  },
]

const JAMO_CHIPS = Array.from(new Set(CRITERIA.flatMap(({ entries }) => entries.map(({ jamo }) => jamo))))
const JAMO_CHIP_ROWS = [
  JAMO_CHIPS.filter((jamo) => CHOSEONG_INDEX[jamo] !== undefined),
  JAMO_CHIPS.filter((jamo) => CHOSEONG_INDEX[jamo] === undefined),
] as const

function orderedGroupEntries(criterion: Criterion, selectedJamo: string): readonly ContextEntry[] {
  const group = criterion.groups.find(({ jamos }) => jamos.includes(selectedJamo))
  const activeEntry = criterion.entries.find(({ jamo }) => jamo === selectedJamo)
  if (!group || !activeEntry) return []
  return [activeEntry, ...group.jamos.filter((jamo) => jamo !== selectedJamo).map((jamo) => {
    const entry = criterion.entries.find((candidate) => candidate.jamo === jamo)
    if (!entry) throw new Error(`그룹 닿자 예시를 찾지 못했습니다: ${jamo}`)
    return entry
  })]
}

function glyphsByEntry(entries: readonly ContextEntry[], glyphs: readonly GlyphOutline[]): ReadonlyArray<{ entry: ContextEntry; glyphs: readonly GlyphOutline[] }> {
  let offset = 0
  return entries.map((entry) => {
    const length = Array.from(entry.sample).length
    const entryGlyphs = glyphs.slice(offset, offset + length)
    offset += length
    return { entry, glyphs: entryGlyphs }
  })
}

function variantLabel(criterion: Criterion, index: number): string | null {
  if (criterion.id !== 'final-horizontal-mixed') return null
  return index === 0 ? '가로모임' : '섞임모임'
}

function groupRationale(criterion: Criterion, group: ContextGroup): Readonly<Record<string, string>> {
  const features = group.jamos.map((jamo) => ({ jamo, ...(JAMO_FEATURES[jamo] ?? { height: '겹받침', innerSpace: '겹받침형' }) }))
  const heights = Array.from(new Set(features.map(({ height }) => height)))
  const innerSpaces = Array.from(new Set(features.map(({ innerSpace }) => innerSpace)))
  const innerSpaceMembers = innerSpaces.map((innerSpace) => `${innerSpace}(${features.filter((feature) => feature.innerSpace === innerSpace).map(({ jamo }) => jamo).join('·')})`).join(' / ')
  return {
    높이: heights.join(' · '),
    속공간: innerSpaces.length === 1 ? innerSpaces[0] : '단일 기준 아님',
    ...(innerSpaces.length > 1 ? { 구성: innerSpaceMembers } : {}),
    예외: criterion.id === 'final-vertical' && group.jamos.includes('ㅅ') ? 'ㅅ·ㅜ/ㅠ 접촉 점검' : '없음',
    판정: heights.length === 1 && innerSpaces.length === 1 ? '기본 특성 일치' : '문맥 규칙으로 통합',
  }
}

const GROUP_DESCRIPTIONS: Readonly<Record<ContextId, Readonly<Record<number, string>>>> = {
  'initial-horizontal-final': {
    1: '홀자 쪽 세로획이 바로 서고, 아래·왼쪽 열린 공간이 받침 쪽으로 이어지는 비대칭 L자.',
    2: '2칸 높이의 기본 속공간 계열. 홀자와 나란한 문맥에서 오른쪽 여백과 받침 위 빈 공간을 같은 규칙으로 맞춘다.',
    3: 'ㅈ의 아래 열린 끝과 ㅋ의 계단형 가로획은 다르다. 결론표에서 나란한 문맥의 같은 조합 규칙으로 단순화한 묶음.',
    4: '반복 가로획으로 속공간이 여러 칸으로 나뉘는 계열. 2칸 높이 안에서 시각 밀도가 높다.',
    5: '3칸 이상을 쓰는 다층 골격 계열. 가로획 층과 안쪽 빈 공간이 커서 2칸 계열과 다른 크기 규칙이 필요하다.',
    6: '3칸 이상 계열. 원형 또는 겹친 획 때문에 중심부 밀도가 높은 묶음.',
  },
  'initial-vertical-final': {
    1: '홀자와 마주 보는 아래 면이 열린 형태.',
    2: '아래 가로획이 홀자 위를 수평으로 닫는 형태. 위아래 사이 빈 공간과 무게가 그룹 1과 다르다.',
    3: 'ㄷ·ㅁ·ㅇ의 닫힌 하단과 ㅈ·ㅋ의 열린·계단형 하단이 섞인다. 결론표에서 홀자 위 문맥의 같은 조합 규칙으로 단순화한 묶음.',
    4: '반복 가로획으로 속공간이 여러 칸으로 나뉘는 계열. 홀자 위에서 아래 경계의 밀도를 함께 맞춘다.',
    5: '3칸 이상을 쓰는 다층 골격 계열. 홀자 위에서 아래쪽 끝과 속공간의 크기를 별도로 조절한다.',
    6: '3칸 이상 계열. 원형 또는 겹친 획 때문에 중심부 밀도가 높은 묶음.',
  },
  'final-horizontal-mixed': {
    1: '홀자와 마주 보는 윗면이 홀자 아래 공간을 비교적 막거나 경계 짓는 형태.',
    2: '홀자와 마주 보는 윗면이 크게 열린 형태. 홀자 아래 빈 공간이 안쪽까지 이어진다.',
    3: 'ㅈ·ㅋ·ㅍ·ㄲ은 높이와 속공간이 다르다. 결론표에서 홀자 아래 문맥의 같은 조합 규칙으로 단순화한 묶음.',
    4: '다층 골격과 겹친 받침이 섞인 고밀도 묶음. 획 수보다 윗면의 시각적 무게와 속공간을 함께 본다.',
    5: '3칸 이상 계열. 위아래로 벌어진 획과 중심부 공간 때문에 단순 2칸 받침과 분리한다.',
    6: '두 닿자가 결합한 겹받침 계열. 가로 폭과 중심부 밀도가 커서 홑받침과 다른 규칙이 필요하다.',
  },
  'final-vertical': {
    1: '홀자와 마주 보는 윗면이 홀자 아래 공간을 비교적 막거나 경계 짓는 형태.',
    2: '홀자와 마주 보는 윗면이 크게 열린 형태. 홀자 아래 빈 공간이 안쪽까지 이어진다.',
    3: 'ㅅ은 ㅜ·ㅠ의 짧은 기둥과 붙을 위험을 별도 확인한다. 나머지와 함께 결론표에서 단순화한 묶음.',
    4: '다층 골격과 겹친 받침이 섞인 고밀도 묶음. 획 수보다 윗면의 시각적 무게와 속공간을 함께 본다.',
    5: '3칸 이상 계열. 위아래로 벌어진 획과 중심부 공간 때문에 단순 2칸 받침과 분리한다.',
    6: '두 닿자가 결합한 겹받침 계열. 가로 폭과 중심부 밀도가 커서 홑받침과 다른 규칙이 필요하다.',
  },
}

function groupDescription(criterion: Criterion, group: ContextGroup): string {
  return GROUP_DESCRIPTIONS[criterion.id][group.id]
}

async function requestOutline(text: string, catalog: FontCatalogResponse, signal: AbortSignal): Promise<OutlineResponse> {
  const chunks = Array.from(text).reduce<string[]>((result, character, index) => {
    const chunkIndex = Math.floor(index / OUTLINE_CHUNK_SIZE)
    result[chunkIndex] = `${result[chunkIndex] ?? ''}${character}`
    return result
  }, [])
  const responses = await Promise.all(chunks.map(async (chunk) => {
    const response = await fetch(OUTLINE_URL, {
      method: 'POST', headers: { Accept: 'application/json', 'Content-Type': 'application/json' }, credentials: 'same-origin',
      body: JSON.stringify({ text: chunk, fontIds: catalog.fonts.map(({ id }) => id) }), signal,
    })
    const parsed = parseOutlineResponse(await requireSuccessfulJson(response))
    validateOutlineCoverage(parsed, chunk, catalog.fonts)
    return parsed
  }))
  if (responses.length === 1) return responses[0]
  const first = responses[0]
  const combined: OutlineResponse = {
    ...first,
    text,
    samples: catalog.fonts.map(({ id }) => ({
      fontId: id,
      glyphs: responses.flatMap((response) => response.samples.find(({ fontId }) => fontId === id)?.glyphs ?? []),
    })),
  }
  validateOutlineCoverage(combined, text, catalog.fonts)
  return combined
}

export function ReferenceGroupLabPage() {
  const [catalog, setCatalog] = useState<FontCatalogResponse | null>(null)
  const [catalogError, setCatalogError] = useState<string | null>(null)
  const [selectedJamo, setSelectedJamo] = useState('ㄱ')
  const [activeFontId, setActiveFontId] = useState('noto-sans-kr')
  const comparisonCacheRef = useRef(new Map<string, ComparisonSet>())
  const [comparisonCache, setComparisonCache] = useState<Readonly<Record<string, ComparisonSet>>>({})
  const [loading, setLoading] = useState(false)
  const [comparisonError, setComparisonError] = useState<string | null>(null)
  const activeFont = catalog?.fonts.find(({ id }) => id === activeFontId) ?? catalog?.fonts[0] ?? null
  const comparisons = comparisonCache[selectedJamo]

  useEffect(() => {
    const controller = new AbortController()
    let active = true
    async function loadCatalog(): Promise<void> {
      try {
        const response = await fetch(FONT_CATALOG_URL, { headers: { Accept: 'application/json' }, credentials: 'same-origin', signal: controller.signal })
        const parsed = parseFontCatalogResponse(await requireSuccessfulJson(response))
        if (active) setCatalog(parsed)
      } catch (error) {
        if (active && !isAbortError(error)) setCatalogError(describeError(error))
      }
    }
    void loadCatalog()
    return () => { active = false; controller.abort() }
  }, [])

  useEffect(() => {
    if (catalog === null) return
    const catalogForRequest = catalog
    const controller = new AbortController()
    let active = true
    const cached = comparisonCacheRef.current.get(selectedJamo)
    if (cached) {
      setComparisonError(null)
      setLoading(false)
      return () => { active = false; controller.abort() }
    }
    const selectedCriteria = CRITERIA.flatMap((criterion) => {
      const entries = orderedGroupEntries(criterion, selectedJamo)
      return entries.length > 0 ? [{ criterion, entries }] : []
    })
    async function loadVariants(): Promise<void> {
      setLoading(true)
      setComparisonError(null)
      try {
        const entries = await Promise.all(selectedCriteria.map(async ({ criterion, entries: groupEntries }) => {
          const text = groupEntries.map(({ sample }) => sample).join('')
          const response = await requestOutline(text, catalogForRequest, controller.signal)
          return [criterion.id, response] as const
        }))
        if (active) {
          const comparisonSet = Object.fromEntries(entries) as ComparisonSet
          comparisonCacheRef.current.set(selectedJamo, comparisonSet)
          setComparisonCache((cache) => ({ ...cache, [selectedJamo]: comparisonSet }))
        }
      } catch (error) {
        if (active && !isAbortError(error)) setComparisonError(describeError(error))
      } finally {
        if (active) setLoading(false)
      }
    }
    void loadVariants()
    return () => { active = false; controller.abort() }
  }, [catalog, selectedJamo])

  return (
    <main className={styles.page} data-testid="reference-group-lab">
      <header className={styles.hero}>
        <span>R0 복제본 · 문맥별 윤곽 비교</span>
        <h1>닿자 위치 변형 랩</h1>
        <p>닿자 하나가 첫닿자·받침닿자, 모임꼴 문맥에 따라 만드는 형태 변형을 비교합니다.</p>
      </header>

      <section className={styles.chipSelector} aria-labelledby="jamo-heading">
        <div><span>01 · 닿자 선택</span><h2 id="jamo-heading">활성 닿자</h2></div>
        <div className={styles.chips} aria-label="활성 닿자 선택">
          {JAMO_CHIP_ROWS.map((row, rowIndex) => (
            <div key={rowIndex} className={styles.chipRow}>
              {row.map((jamo) => (
                <button key={jamo} type="button" aria-pressed={jamo === selectedJamo} className={jamo === selectedJamo ? styles.activeChip : undefined} onClick={() => setSelectedJamo(jamo)}>{jamo}</button>
              ))}
            </div>
          ))}
        </div>
      </section>

      {catalog && activeFont && (
        <nav className={styles.fontSwitch} aria-label="비교 폰트 선택">
          <span>현재 비교 폰트</span>
          <div>{catalog.fonts.map((font) => (
            <button key={font.id} type="button" aria-pressed={font.id === activeFont.id} className={font.id === activeFont.id ? styles.activeFont : undefined} onClick={() => setActiveFontId(font.id)}>{font.family}</button>
          ))}</div>
        </nav>
      )}

      {catalogError && <p className={styles.error} role="alert">{catalogError}</p>}
      {comparisonError && <p className={styles.error} role="alert">{comparisonError}</p>}
      {catalog === null && !catalogError && <p className={styles.status} role="status">로컬 폰트 목록을 읽는 중…</p>}
      {catalog && loading && <p className={styles.status} role="status">{selectedJamo} 위치 변형을 읽는 중…</p>}

      {catalog && activeFont && (
        <section className={styles.criterionGrid} aria-label={`${selectedJamo} 위치 변형`}>
          {CRITERIA.map((criterion) => {
            const entry = criterion.entries.find(({ jamo }) => jamo === selectedJamo)
            const group = criterion.groups.find(({ jamos }) => jamos.includes(selectedJamo))
            const groupEntries = orderedGroupEntries(criterion, selectedJamo)
            const comparison = comparisons?.[criterion.id]
            const sample = comparison?.samples.find(({ fontId }) => fontId === activeFont.id)
            const members = sample ? glyphsByEntry(groupEntries, sample.glyphs) : []
            const variantCount = groupEntries.length > 0 ? Array.from(groupEntries[0].sample).length : 0
            return (
              <section key={criterion.id} className={styles.criterion} aria-labelledby={`${criterion.id}-heading`}>
                <header className={styles.criterionHeader}>
                  <div><h2 id={`${criterion.id}-heading`}>{criterion.title}</h2></div>
                  {group && <p className={styles.groupLabel}>{selectedJamo} · 그룹 {group.id}</p>}
                </header>
                <div className={styles.criterionBody}>
                  <div className={styles.groupTable} aria-label={`${criterion.title} 전체 닿자 그룹표`}>
                    {group && (
                      <dl className={styles.groupRationale} aria-label={`${selectedJamo} 그룹 ${group.id} 분류 근거`}>
                        <div className={styles.rationaleTitle}><dt>그룹 {group.id}</dt><dd>분류 근거</dd></div>
                        {Object.entries(groupRationale(criterion, group)).map(([label, value]) => (
                          <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
                        ))}
                      </dl>
                    )}
                    <table>
                      <tbody>{criterion.groups.map(({ id, jamos }) => {
                        const representative = jamos[0]
                        return (
                        <tr
                          key={id}
                          role="button"
                          tabIndex={0}
                          aria-label={`그룹 ${id}: ${jamos.join(', ')}. ${representative} 선택`}
                          data-active={id === group?.id || undefined}
                          onClick={() => setSelectedJamo(representative)}
                          onKeyDown={(event) => {
                            if (event.key !== 'Enter' && event.key !== ' ') return
                            event.preventDefault()
                            setSelectedJamo(representative)
                          }}
                        >
                          <th scope="row">{id}</th><td>{jamos.join(' · ')}</td>
                        </tr>
                        )
                      })}</tbody>
                    </table>
                  </div>
                  {!entry ? (
                    <div className={styles.unavailable}><strong>해당 위치 없음</strong><span>{selectedJamo}은 이 문맥에서 쓰이지 않습니다.</span></div>
                  ) : !comparison || !sample ? (
                    <div className={styles.pending}><strong>{comparisonError ? '윤곽을 불러오지 못했습니다.' : '윤곽을 읽는 중…'}</strong></div>
                  ) : (
                    <div className={styles.exampleVariants} data-font-id={activeFont.id}>
                      {Array.from({ length: variantCount }, (_, index) => (
                        <section key={`${selectedJamo}-${index}`} className={styles.exampleVariant} aria-label={variantLabel(criterion, index) ?? `${criterion.title} 그룹 예시`}>
                          {variantLabel(criterion, index) && <h3>{variantLabel(criterion, index)}</h3>}
                          <div className={styles.exampleRail}>
                            {members.map(({ entry: member, glyphs }) => {
                              const glyph = glyphs[index]
                              if (!glyph) return null
                              return (
                                <article key={`${member.jamo}-${glyph.character}`} className={styles.groupExample} data-active={member.jamo === selectedJamo || undefined} data-glyph={glyph.character}>
                                  <div className={styles.groupExampleHeading}><strong>{member.jamo}</strong></div>
                                  <GlyphSpecimen display={comparison.display} font={activeFont} glyph={glyph} highlight={criterion.highlight} />
                                </article>
                              )
                            })}
                          </div>
                        </section>
                      ))}
                    </div>
                  )}
                </div>
                {group && <footer className={styles.groupDescription}><strong>그룹 설명</strong><p>{groupDescription(criterion, group)}</p></footer>}
              </section>
            )
          })}
        </section>
      )}
    </main>
  )
}
