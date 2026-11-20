import { useCallback, useMemo, useRef, useState } from 'react'
import type { MouseEvent as ReactMouseEvent, PointerEvent as ReactPointerEvent } from 'react'
import { ChevronRight, Dices, RotateCcw } from 'lucide-react'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { useEffectiveGlobalStyle } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { mergePadding, useLayoutStore } from '../src/stores/layoutStore'
import type { DecomposedSyllable, Part, ResolvedStrokeInkSource } from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { Badge } from './components/ui/badge'
import { Button } from './components/ui/button'
import { ChoiceGroup, ChoiceItem } from './components/ui/choice-group'
import { Pressable } from './components/ui/pressable'
import { EDIT_COLOR } from './editColors'
import { dragValue, groupOfPart, GROUPS, groupsOfSyllable, inSafe, moldBoxes, partAt, positionOf, presetOf, stanceName, valueText, type GroupId, type MoldValues, type Preset } from './moldLab'
import { useContextPlacement } from './notoModel'
import { SAMPLE_SENTENCES } from './sampleSentences'
import styles from './MoldLabPage.module.css'

/**
 * 빚기 시험판(학습 프로토타입). 글자의 어디를 잡았는지로 갈래를 정하고(홀자 → 홀자 갈래, 첫닿자 · 받침 → 짜임),
 * 갈래마다 프리셋 셋(좁게 · 보통 · 넓게)을 고른 뒤 끌어서 다듬는다. 바꾼 값은 같은 갈래 글자 전부에 한 번에 든다.
 * 값은 폰트 분포의 안전선 안에서 시작하고, 끌어도 한계선(벽) 밖으로는 안 나간다. 계산은 `moldLab.ts`.
 * 저장하지 않고 제품 값(자모 · 배치)도 안 바꾼다. 기획: 고양이 `학습-단계-뼈대-2026-11-20.md` "빚기 프리셋을 분류마다".
 */

const FIRST_SENTENCE = '아버지가 바다 너머 저기 산다'

interface Pick { group: GroupId; char: string }

/** 이 글자의 부위가 고른 갈래에 드는가(색 칠하기). */
function partInGroup(part: Part, syllable: DecomposedSyllable, group: GroupId | undefined): boolean {
  if (!group) return false
  const vowelChar = syllable.jungseong?.char
  const mine = groupOfPart(part === 'JU_H' || part === 'JU_V' ? 'JU' : part, syllable.layoutType, vowelChar)
  return mine === group
}

/**
 * 빚은 글자 하나. `AppGlyph`와 같은 길(자모 + 칸 해석 + 전역 스타일)로 상자를 풀고, 그 위에 갈래 값을 입혀 그린다.
 * 누르면 누른 자리의 부위로 갈래를 알린다.
 */
function MoldGlyph({ char, size, values, highlight, onPick, testId }: { char: string; size: number; values: MoldValues; highlight?: GroupId; onPick?: (pick: Pick) => void; testId?: string }) {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const syllable = useMemo(() => decomposeSyllable(char, choseong, jungseong, jongseong), [char, choseong, jungseong, jongseong])
  const globalStyle = useEffectiveGlobalStyle(syllable.layoutType)
  const base = schemas[syllable.layoutType]
  const padding = mergePadding(globalPadding, paddingOverrides[syllable.layoutType])
  const schema = { ...base, padding, designBodyPadding: padding }
  const { placement } = useContextPlacement(syllable, schema, globalStyle)
  const vowelChar = syllable.jungseong?.char
  const boxes = useMemo(() => placement.kind === 'boxes' ? moldBoxes(placement.boxes, syllable.layoutType, vowelChar, values) : undefined, [placement, syllable.layoutType, vowelChar, values])
  const colorOf = useCallback((source: ResolvedStrokeInkSource) => partInGroup(source.part, syllable, highlight) ? EDIT_COLOR.editSelect : undefined, [syllable, highlight])

  const pick = (event: ReactMouseEvent<HTMLButtonElement>) => {
    if (!onPick || !boxes) return
    const rect = event.currentTarget.getBoundingClientRect()
    // 글자 칸은 가로 0–1, 세로도 같은 눈금(높이 비율만 다르다).
    const x = (event.clientX - rect.left) / rect.width
    const y = (event.clientY - rect.top) / rect.width
    const present = { CH: !!syllable.choseong, JU: !!syllable.jungseong, JU_H: !!syllable.jungseong, JU_V: !!syllable.jungseong, JO: !!syllable.jongseong }
    const part = partAt(boxes, x, y, present)
    const group = part && groupOfPart(part === 'JU_H' || part === 'JU_V' ? 'JU' : part, syllable.layoutType, vowelChar)
    if (group) onPick({ group, char })
  }

  const glyph = <SvgRenderer
    syllable={syllable}
    schema={placement.kind === 'schema' ? placement.schema : undefined}
    boxes={boxes}
    size={size}
    globalStyle={globalStyle}
    overflow="visible"
    clipGlyphs={false}
    strokeColorOf={highlight ? colorOf : undefined}
  />
  if (!onPick) return <span className={styles.glyph} data-testid={testId}>{glyph}</span>
  return <Pressable className={styles.glyph} onClick={pick} aria-label={`${char} 잡기`} data-testid={testId}>{glyph}</Pressable>
}

/** 안전선 · 한계선 띠. 끌어서 값을 다듬는다. */
function Ruler({ group, value, onChange }: { group: GroupId; value: number | undefined; onChange: (value: number) => void }) {
  const info = GROUPS[group]
  const range = info.range!
  const drag = useRef<{ id: number; x: number; start: number } | null>(null)
  const current = value ?? range.engine
  const at = (v: number) => `${(positionOf(range, v) * 100).toFixed(2)}%`
  const set = (event: ReactPointerEvent<HTMLDivElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    if (!drag.current) return
    onChange(dragValue(range, drag.current.start, event.clientX - drag.current.x, rect.width))
  }
  return <div
    className={styles.ruler}
    data-testid="mold-ruler"
    onPointerDown={(event) => {
      event.currentTarget.setPointerCapture(event.pointerId)
      // 띠를 누른 자리로 바로 옮기고, 거기서부터 끈다.
      const rect = event.currentTarget.getBoundingClientRect()
      const start = range.wall[0] + (event.clientX - rect.left) / rect.width * (range.wall[1] - range.wall[0])
      drag.current = { id: event.pointerId, x: event.clientX, start }
      onChange(start)
    }}
    onPointerMove={set}
    onPointerUp={() => { drag.current = null }}
    onPointerCancel={() => { drag.current = null }}
  >
    <span className={styles.rulerTrack} />
    <span className={styles.rulerSafe} style={{ left: at(range.safe[0]), width: `calc(${at(range.safe[1])} - ${at(range.safe[0])})` }} />
    {(Object.keys(range.presets) as Preset[]).map((key) => <span key={key} className={styles.rulerTick} style={{ left: at(range.presets[key]) }} />)}
    <span className={styles.rulerEngine} style={{ left: at(range.engine) }} title="처음 값" />
    <span className={styles.rulerThumb} style={{ left: at(current) }} data-out={!inSafe(range, current) || undefined} />
    <span className={styles.rulerWallL}>벽</span>
    <span className={styles.rulerWallR}>벽</span>
  </div>
}

export function MoldLabPage() {
  const [sentence, setSentence] = useState(FIRST_SENTENCE)
  const [pick, setPick] = useState<Pick | null>(null)
  const [values, setValues] = useState<MoldValues>({})
  const [seed, setSeed] = useState(0)
  const focusDrag = useRef<{ x: number; start: number; width: number } | null>(null)

  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)

  const group = pick?.group
  const info = group ? GROUPS[group] : undefined
  const range = info?.range ?? null
  const value = group ? values[group] : undefined

  const groupsOf = useCallback((char: string) => {
    const syllable = decomposeSyllable(char, choseong, jungseong, jongseong)
    return groupsOfSyllable(syllable.layoutType, syllable.jungseong?.char)
  }, [choseong, jungseong, jongseong])

  // 주사위: 같은 갈래 글자를 예시 문장들에서 모아 몇 개 뽑는다.
  const siblings = useMemo(() => {
    if (!group) return []
    const pool = [...new Set(SAMPLE_SENTENCES.join('').replace(/\s/g, ''))].filter((char) => groupsOf(char).includes(group))
    const out: string[] = []
    let s = seed * 7919 + 17
    while (out.length < Math.min(6, pool.length)) {
      s = (s * 1103515245 + 12345) % 2147483648
      const char = pool[s % pool.length]
      if (!out.includes(char)) out.push(char)
    }
    return out
  }, [group, groupsOf, seed])

  const roll = () => {
    setSeed((now) => now + 1)
    const candidates = group ? SAMPLE_SENTENCES.filter((line) => [...line].some((char) => char !== ' ' && groupsOf(char).includes(group))) : SAMPLE_SENTENCES
    const others = candidates.filter((line) => line !== sentence)
    if (others.length) setSentence(others[Math.floor(Math.random() * others.length)])
  }

  const setValue = (next: number) => { if (group) setValues((now) => ({ ...now, [group]: next })) }
  const resetGroup = () => { if (group) setValues((now) => { const copy = { ...now }; delete copy[group]; return copy }) }
  const changed = Object.keys(values).length

  return <main className={styles.page}>
    <header className={styles.header}>
      <span className={styles.eyebrow}>빚기 시험판</span>
      <h1>글자를 잡아 빚어 보세요</h1>
      <p>홀자 · 첫닿자 · 받침 중 한 곳을 누르면, 같은 갈래 글자가 함께 바뀌어요.</p>
    </header>

    <section className={styles.card} aria-label="예시 글줄">
      <div className={styles.line} data-testid="mold-line">
        {[...sentence].map((char, at) => char === ' '
          ? <span key={at} className={styles.space} />
          : <MoldGlyph key={`${sentence}-${at}`} char={char} size={46} values={values} highlight={group} onPick={setPick} testId={`mold-char-${at}`} />)}
      </div>
      <div className={styles.lineActions}>
        <span className={styles.changed}>{changed ? `바꾼 갈래 ${changed}개` : '아직 그대로'}</span>
        <Button variant="ghost" size="sm" onClick={roll} data-testid="mold-dice"><Dices aria-hidden="true" />다른 문장</Button>
      </div>
    </section>

    {info && pick ? <section className={styles.panel} aria-label="갈래" data-testid="mold-panel">
      <nav className={styles.crumbs} aria-label="범위">
        <span>전체</span>
        <ChevronRight aria-hidden="true" />
        <span data-on={info.layer === '짜임' || undefined}>{stanceName(info.stance)}</span>
        {info.layer === '갈래' && <><ChevronRight aria-hidden="true" /><span data-on>{info.name.split(' · ')[1]}</span></>}
      </nav>
      <div className={styles.groupHead}>
        <div>
          <h2 data-testid="mold-group-name">{info.name}</h2>
          <span className={styles.members}>{info.members}{info.handle ? ` · ${info.handleName}` : ''}</span>
        </div>
        <Badge variant={info.source === 'measured' ? 'default' : 'muted'} data-testid="mold-source">{info.source === 'measured' ? '실측' : info.source === 'none' ? '손잡이 없음' : '임시값'}</Badge>
      </div>

      <div className={styles.focusRow}>
        <div
          className={styles.focus}
          data-testid="mold-focus"
          onPointerDown={(event) => {
            if (!range) return
            event.currentTarget.setPointerCapture(event.pointerId)
            focusDrag.current = { x: event.clientX, start: value ?? range.engine, width: event.currentTarget.getBoundingClientRect().width }
          }}
          onPointerMove={(event) => { if (range && focusDrag.current) setValue(dragValue(range, focusDrag.current.start, event.clientX - focusDrag.current.x, focusDrag.current.width * 1.5)) }}
          onPointerUp={() => { focusDrag.current = null }}
          onPointerCancel={() => { focusDrag.current = null }}
        >
          <MoldGlyph char={pick.char} size={136} values={values} highlight={group} />
          {range && <span className={styles.focusHint}>← 좌우로 끌기 →</span>}
        </div>
        <div className={styles.siblings}>
          <span className={styles.siblingsLabel}>같은 갈래</span>
          <div className={styles.siblingGrid} data-testid="mold-siblings">
            {siblings.map((char) => <MoldGlyph key={`${seed}-${char}`} char={char} size={38} values={values} highlight={group} onPick={setPick} />)}
          </div>
          <Button variant="outline" size="chip-sm" onClick={() => setSeed((now) => now + 1)} data-testid="mold-sibling-dice"><Dices aria-hidden="true" />주사위</Button>
        </div>
      </div>

      {range ? <>
        <ChoiceGroup variant="segment" aria-label="프리셋" className={styles.presets}>
          {(Object.keys(range.presets) as Preset[]).map((key) => <ChoiceItem key={key} checked={presetOf(range, value) === key} onClick={() => setValue(range.presets[key])} data-testid={`mold-preset-${key}`}>{info.presetNames[key]}</ChoiceItem>)}
        </ChoiceGroup>
        <Ruler group={info.id} value={value} onChange={setValue} />
        <div className={styles.readout}>
          <strong data-testid="mold-value">{value === undefined ? '처음 값' : presetOf(range, value) ? info.presetNames[presetOf(range, value)!] : valueText(info, value)}</strong>
          <span data-out={value !== undefined && !inSafe(range, value) || undefined}>{value === undefined ? '아직 안 바꿈' : inSafe(range, value) ? '안전선 안' : '안전선 밖 · 개성 (벽까지)'}</span>
        </div>
        <p className={styles.note}>{info.note}</p>
        <Button variant="outline" size="block" onClick={resetGroup} disabled={value === undefined} data-testid="mold-reset"><RotateCcw aria-hidden="true" />이 갈래 처음대로</Button>
      </> : <p className={styles.note}>{info.note}</p>}
    </section> : <p className={styles.ask}>위 글줄에서 글자 한 곳을 눌러 보세요.</p>}

    {changed > 0 && <Button variant="ghost" size="sm" className={styles.resetAll} onClick={() => setValues({})} data-testid="mold-reset-all"><RotateCcw aria-hidden="true" />모두 처음대로</Button>}
  </main>
}
