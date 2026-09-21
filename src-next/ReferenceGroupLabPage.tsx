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
import { groupsOf } from './jamoLiteratureGroups'
import styles from './ReferenceGroupLabPage.module.css'

const FONT_CATALOG_URL = '/api/reference/v1/fonts'
const OUTLINE_URL = '/api/reference/v1/outlines'
const OUTLINE_CHUNK_SIZE = 12

type ContextId = 'initial-horizontal' | 'initial-vertical' | 'initial-horizontal-final' | 'initial-vertical-final' | 'final-horizontal-mixed' | 'final-vertical'
type ComparisonSet = Readonly<Partial<Record<ContextId, OutlineResponse>>>

interface ContextEntry { jamo: string; sample: string }
interface ContextGroup { id: number; jamos: readonly string[] }
interface Criterion { id: ContextId; title: string; highlight: GlyphHighlight; groups: readonly ContextGroup[]; entries: readonly ContextEntry[] }
const CHOSEONG_INDEX: Readonly<Record<string, number>> = {
  'ㄱ': 0, 'ㄲ': 1, 'ㄴ': 2, 'ㄷ': 3, 'ㄸ': 4, 'ㄹ': 5, 'ㅁ': 6, 'ㅂ': 7, 'ㅃ': 8,
  'ㅅ': 9, 'ㅆ': 10, 'ㅇ': 11, 'ㅈ': 12, 'ㅉ': 13, 'ㅊ': 14, 'ㅋ': 15, 'ㅌ': 16, 'ㅍ': 17, 'ㅎ': 18,
}

const JONGSEONG_INDEX: Readonly<Record<string, number>> = {
  'ㄱ': 1, 'ㄲ': 2, 'ㄳ': 3, 'ㄴ': 4, 'ㄵ': 5, 'ㄶ': 6, 'ㄷ': 7, 'ㄹ': 8, 'ㄺ': 9,
  'ㄻ': 10, 'ㄼ': 11, 'ㄽ': 12, 'ㄾ': 13, 'ㄿ': 14, 'ㅀ': 15, 'ㅁ': 16, 'ㅂ': 17,
  'ㅄ': 18, 'ㅅ': 19, 'ㅆ': 20, 'ㅇ': 21, 'ㅈ': 22, 'ㅊ': 23, 'ㅋ': 24, 'ㅌ': 25, 'ㅍ': 26, 'ㅎ': 27,
}

const MEDIAL_INDEX = { 'ㅏ': 0, 'ㅗ': 8, 'ㅘ': 9, 'ㅡ': 18 } as const

function syllable(initial: string, medial: keyof typeof MEDIAL_INDEX, final: string | null): string {
  const initialIndex = CHOSEONG_INDEX[initial]
  const finalIndex = final === null ? 0 : JONGSEONG_INDEX[final]
  if (initialIndex === undefined || finalIndex === undefined) throw new Error(`지원하지 않는 자모: ${initial}${medial}${final ?? ''}`)
  return String.fromCodePoint(0xac00 + ((initialIndex * 21 + MEDIAL_INDEX[medial]) * 28) + finalIndex)
}

function initialEntries(jamos: readonly string[], medial: keyof typeof MEDIAL_INDEX, final: string | null): ContextEntry[] {
  return jamos.map((jamo) => ({ jamo, sample: syllable(jamo, medial, final) }))
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

/** 구조군 표는 `src/data/jamoLiteratureGroups.json` 하나가 출처다. 여기서는 기준마다 그룹 목록으로 펴서 쓴다. */
const INITIAL_HORIZONTAL_GROUPS: readonly ContextGroup[] = groupsOf('initialHorizontal')
const INITIAL_HORIZONTAL_NO_FINAL_GROUPS: readonly ContextGroup[] = groupsOf('initialHorizontalNoFinal')
const INITIAL_VERTICAL_GROUPS: readonly ContextGroup[] = groupsOf('initialVertical')
const INITIAL_VERTICAL_NO_FINAL_GROUPS: readonly ContextGroup[] = groupsOf('initialVerticalNoFinal')
const FINAL_HORIZONTAL_MIXED_GROUPS: readonly ContextGroup[] = groupsOf('finalHorizontalMixed')
const FINAL_VERTICAL_GROUPS: readonly ContextGroup[] = groupsOf('finalVertical')

const CRITERIA: readonly Criterion[] = [
  {
    id: 'initial-horizontal', title: '가로모임꼴 · 첫닿자', highlight: 'initial-left',
    groups: INITIAL_HORIZONTAL_NO_FINAL_GROUPS, entries: initialEntries(groupJamos(INITIAL_HORIZONTAL_NO_FINAL_GROUPS), 'ㅏ', null),
  },
  {
    id: 'initial-vertical', title: '세로모임꼴 · 첫닿자', highlight: 'initial-top',
    groups: INITIAL_VERTICAL_NO_FINAL_GROUPS, entries: initialEntries(groupJamos(INITIAL_VERTICAL_NO_FINAL_GROUPS), 'ㅗ', null),
  },
  {
    id: 'initial-horizontal-final', title: '가로모임꼴 받친글자 · 첫닿자', highlight: 'initial-left',
    groups: INITIAL_HORIZONTAL_GROUPS, entries: initialEntries(groupJamos(INITIAL_HORIZONTAL_GROUPS), 'ㅏ', 'ㅁ'),
  },
  {
    id: 'initial-vertical-final', title: '세로모임꼴 받친글자 · 첫닿자', highlight: 'initial-top',
    groups: INITIAL_VERTICAL_GROUPS, entries: initialEntries(groupJamos(INITIAL_VERTICAL_GROUPS), 'ㅗ', 'ㅁ'),
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

const GROUP_METHOD_NOTE = '이용제가 닿자의 면적·시각 공간·홀자와의 상대 위치로 단순화한 비교용 그룹이다. 홀자의 세부 형태와 닿자 끝맺음은 이 표만으로 설명되지 않으며, 실제 조합에서 별도 검증이 필요하다.'

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
        <a className={styles.guideLabLink} href={`/font-guide-lab${activeFont ? `?font=${encodeURIComponent(activeFont.id)}` : ''}`}>기준선 조율 랩 열기</a>
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
                    <table>
                      <thead><tr><th scope="col">그룹</th><th scope="col">닿자</th></tr></thead>
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
                {group && <footer className={styles.groupDescription}><strong>분류 메모</strong><p>{GROUP_METHOD_NOTE}</p></footer>}
              </section>
            )
          })}
        </section>
      )}
    </main>
  )
}
