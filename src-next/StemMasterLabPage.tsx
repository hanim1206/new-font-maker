import { Check, Lock, Minus } from 'lucide-react'
import { useMemo, useState } from 'react'
import { JUNGSEONG_LIST } from '../src/data/Hangul'
import { useJamoStore } from '../src/stores/jamoStore'
import { propagatedJungseong, useStemMasterStore } from '../src/stores/stemMasterStore'
import {
  baseOf,
  boundStrokesOf,
  isStraight,
  isUnder,
  masterFromStroke,
  masterOf,
  straightMaster,
  STEM_BASES,
  STEM_FACETS,
  facetValuesOf,
  stemMasterLabel,
  type JamoChannel,
  type StemBase,
  type StemMaster,
  type StemMasterName,
  type StemMasters,
} from '../src/services/stemMaster'
import { STEM_NAME_LABEL } from '../src/services/strokeGrammar'
import type { JamoData, ResolvedStrokeInkSource } from '../src/types'
import { AppGlyph } from './AppGlyph'
import { LEGACY_CALIBRATION_LAYOUT_PROFILE_V1 } from '../src/data/legacyCalibrationLayoutProfileV1'
import { runLayoutProfileMigrationBootstrap } from '../src/services/layoutProfileMigrationBootstrap'
import { DEFAULT_LAYOUT_SCHEMAS } from '../src/utils/layoutCalculator'
import { CalibrationSentenceEditor } from './CalibrationSentenceEditor'
import { useCalibrationProjectStore } from './calibrationProjectStore'
import { useEditHistoryStore } from './editHistoryStore'
import styles from './StemMasterLabPage.module.css'

/**
 * 홀자 줄기 마스터 랩. 앱의 자소 획 편집기로 홀자 획 하나를 고치고, `저장`하면 그 모양을 마스터로 읽어 형제 어디까지 반영할지 고른다.
 * 편집기는 앱과 같아서 고친 획은 바로 자모에 적힌다. `되돌리기`는 연 때의 모양으로 돌린다. 플랜: docs/plans/2026-09-29_홀자-줄기-마스터.md
 */

const FINALS = [{ id: 'open', label: '받침 없음' }, { id: 'closed', label: '받침 있음' }] as const

const CHANNEL_LABEL: Record<JamoChannel, string> = { strokes: '', horizontalStrokes: '가로부', verticalStrokes: '세로부' }

/** 대표 글자: ㅇ + 홀자 (+ 받침 ㅇ). */
function sampleSyllable(jung: string, final: 'open' | 'closed'): string {
  const index = JUNGSEONG_LIST.indexOf(jung as (typeof JUNGSEONG_LIST)[number])
  return String.fromCharCode(0xac00 + (11 * 21 + index) * 28 + (final === 'closed' ? 21 : 0))
}

/** 형제 카드 · 반영 고르기에서 그 획을 칠하는 색. */
const ACTIVE_STROKE_COLOR = '#d9480f'

/** 이 줄기에 귀속된 획 하나(홀자 · 채널 · 획)와 그 갈래(잎 이름 · 질문 답). */
interface StemEntry { char: string; channel: JamoChannel; strokeId: string; name: StemMasterName; values: Record<string, string>; follows: boolean; curved: boolean }

/**
 * 줄기 안 갈래(잎) 순서 — 단일 · 섞임을 먼저 가르고, 그 안에서 질문 보기 순서대로.
 * 기둥은 바깥 단일 → 안 단일 → 바깥 섞임 → 안 섞임.
 */
function leafRank(base: StemBase, name: StemMasterName): number[] {
  const values = facetValuesOf(name)
  const facets = STEM_FACETS[base]
  const ordered = [...facets.filter((facet) => facet.key === 'kind'), ...facets.filter((facet) => facet.key !== 'kind')]
  return ordered.map((facet) => facet.options.findIndex((option) => option.value === values[facet.key]))
}
const byLeafRank = (base: StemBase) => (a: StemMasterName, b: StemMasterName) => {
  const ra = leafRank(base, a)
  const rb = leafRank(base, b)
  for (let index = 0; index < ra.length; index += 1) if (ra[index] !== rb[index]) return ra[index] - rb[index]
  return 0
}

/** 획 하나를 가리키는 열쇠(홀자 + 획 id). */
const keyOf = (entry: StemEntry) => `${entry.char}:${entry.strokeId}`

const uniqueChars = (entries: readonly StemEntry[]) => [...new Set(entries.map((entry) => entry.char))]

/** 형제 카드 하나(상태 보기). 대표 글자 둘과 이 갈래의 따름 여부. 누르면 캔버스가 이 획을 고친다. */
function SiblingCard({ entry, marked, editing, onEdit }: { entry: StemEntry; marked: boolean; editing: boolean; onEdit: () => void }) {
  const refollow = useStemMasterStore((state) => state.refollow)
  const activeColor = (source: ResolvedStrokeInkSource) => source.jamoId === entry.char && source.strokeId === entry.strokeId ? ACTIVE_STROKE_COLOR : undefined
  return (
    <article className={styles.sibling} data-char={entry.char} data-stroke={entry.strokeId} data-follow={entry.follows} data-curved={entry.curved} data-picked={marked} data-editing={editing || undefined}>
      <button type="button" className={styles.siblingPick} aria-pressed={editing} aria-label={`${entry.char} ${entry.strokeId} 고치기`} onClick={onEdit}>
        <h3>{entry.char}</h3>
        <span className={styles.siblingGlyphs}>
          {FINALS.map((final) => <AppGlyph key={final.id} char={sampleSyllable(entry.char, final.id)} size={72} strokeColorOf={activeColor} />)}
        </span>
      </button>
      <ul>
        <li>
          <code>{entry.strokeId}</code>
          {CHANNEL_LABEL[entry.channel] && <small>{CHANNEL_LABEL[entry.channel]}</small>}
          <strong data-follow={entry.follows}>{entry.follows ? '따름' : '풀림'}</strong>
          {!entry.follows && <button type="button" onClick={() => refollow(entry.char, entry.channel, entry.strokeId)}>다시 따르기</button>}
        </li>
      </ul>
    </article>
  )
}


/**
 * 반영 고르기. 줄기를 고친 뒤 "어디까지 반영할까요?" — 갈래(잎) 묶음을 한 번에 다 보이고, 처음엔 전부 골라져 있다.
 * 도마 고르기처럼 묶음 머리 체크는 묶음 전체, 카드는 획 하나를 켜고 끈다. 카드는 그 획만 주황, 나머지는 옅게.
 * 뺀 카드의 획은 지금 모양 그대로 남아 `풀림`이 된다. 고친 획 카드는 모양의 출처라 뺄 수 없다(묶음 머리를 꺼도 남는다). 카드는 반영하면 될 모양(`preview`)으로 그린다 — 켜면 휘고 끄면 돌아간다.
 */
function ApplyGroups({ base, entries, picked, preview, editedKey, onToggle, onApply, onCancel }: {
  base: StemBase
  preview: Readonly<Record<string, JamoData>>
  entries: readonly StemEntry[]
  picked: ReadonlySet<string>
  editedKey: string | null
  onToggle: (keys: readonly string[], on: boolean) => void
  onApply: () => void
  onCancel: () => void
}) {
  const chars = uniqueChars(entries.filter((entry) => picked.has(keyOf(entry))))
  const leaves = [...new Set(entries.map((entry) => entry.name))].sort(byLeafRank(base))
  return (
    <div className={styles.modalLayer} onPointerDown={(event) => { if (event.target === event.currentTarget) onCancel() }} onKeyDown={(event) => { if (event.key === 'Escape') onCancel() }}>
    <section className={styles.applySheet} role="dialog" aria-modal="true" aria-label="반영 범위" data-testid="apply-questions">
      <header className={styles.applyHead}>
        <h2>{STEM_NAME_LABEL[base]}을 고쳤어요. 어디까지 반영할까요?</h2>
      </header>
      <div className={styles.applyScroll}>
        {leaves.map((leaf) => {
          const inLeaf = entries.filter((entry) => entry.name === leaf)
          const keys = inLeaf.map(keyOf)
          const on = keys.filter((key) => picked.has(key)).length
          const state = on === keys.length ? 'true' : on === 0 ? 'false' : 'mixed'
          return (
            <div key={leaf} className={styles.applyGroup} data-role={leaf}>
              <button type="button" role="checkbox" className={styles.applyGroupHead} aria-checked={state} onClick={() => onToggle(keys, state !== 'true')}>
                <span className={styles.applyCheck} aria-hidden="true">{state === 'mixed' ? <Minus size={14} strokeWidth={3} /> : <Check size={14} strokeWidth={3} />}</span>
                {stemMasterLabel(leaf).split(' · ').slice(1).join(' · ') || STEM_NAME_LABEL[base]}
                <span className={styles.applyCount}>{keys.length}</span>
              </button>
              <div className={styles.applyCards}>
                {inLeaf.map((entry) => {
                  const key = keyOf(entry)
                  const pressed = picked.has(key)
                  const locked = editedKey === key
                  // 글자는 검정, 이 카드의 획만 주황. 뺀 카드는 카드째 흐려진다(도마와 같게).
                  const color = (source: ResolvedStrokeInkSource) => source.jamoId === entry.char && source.strokeId === entry.strokeId ? ACTIVE_STROKE_COLOR : undefined
                  return (
                    <button key={key} type="button" className={styles.applyCard} data-char={entry.char} data-locked={locked || undefined} aria-pressed={pressed} aria-disabled={locked || undefined} aria-label={locked ? `${entry.char} ${stemMasterLabel(leaf)} 고친 획(늘 반영)` : `${entry.char} ${stemMasterLabel(leaf)} ${pressed ? '빼기' : '담기'}`} onClick={() => { if (!locked) onToggle([key], !pressed) }}>
                      <AppGlyph char={sampleSyllable(entry.char, 'open')} size={52} strokeColorOf={color} jungseongOverride={preview} />
                      {locked && <em><Lock size={10} strokeWidth={3} aria-hidden="true" />고친 획</em>}
                    </button>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
      <footer className={styles.applyFoot}>
        <p aria-label="바뀌는 홀자">{chars.length === 0 ? <em>카드나 묶음을 눌러 반영할 곳을 고르세요</em> : chars.join(' ')}</p>
        <button type="button" className={styles.applyCancel} onClick={onCancel}>취소</button>
        <button type="button" className={styles.applyGo} data-testid="apply" disabled={chars.length === 0} onClick={onApply} autoFocus><span key={chars.length} data-testid="apply-count">{chars.length}</span>개 홀자에 반영</button>
      </footer>
    </section>
    </div>
  )
}

/**
 * 앱의 자소 획 편집기(자소 탭 `획` 모드, 중성 잠금)를 그대로 띄운다. 편집기는 주소의 `char` · `mode` · `part`를 열 때 한 번 읽으니
 * 그리기 전에 주소를 맞춘다(편집기가 읽고 지운다). 다른 홀자로 바꿀 땐 `key`로 새로 연다.
 */
function LabStrokeEditor({ syllable }: { syllable: string }) {
  useState(() => {
    const url = new URL(window.location.href)
    url.searchParams.set('char', syllable)
    url.searchParams.set('mode', 'stroke')
    url.searchParams.set('part', 'JU')
    window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`)
    return null
  })
  return <CalibrationSentenceEditor chrome="workspace" />
}

/**
 * 편집기에 연 때의 홀자 전부(`snapshot`)와 편집 기록 길이. 편집기 안에서 문장 줄의 다른 글자를 눌러 다른 홀자를 고칠 수도 있어
 * 연 홀자 하나가 아니라 홀자 전부를 들고 있다가 달라진 것을 찾고, `되돌리기`에 쓴다. `char`는 편집기를 열 때 보여 줄 홀자.
 */
interface EditSession { char: string; snapshot: Readonly<Record<string, JamoData>>; historyLength: number; key: number }

const openSession = (char: string, key: number): EditSession => ({
  char,
  snapshot: useJamoStore.getState().jungseong,
  historyLength: useEditHistoryStore.getState().history.length,
  key,
})

/** 연 때와 달라진 이름 있는 획(마스터 대상). 스토어는 고친 홀자만 새 객체라 같은 참조는 건너뛴다. */
function changedStems(jungseong: Readonly<Record<string, JamoData>>, snapshot: Readonly<Record<string, JamoData>>, masters: StemMasters) {
  return JUNGSEONG_LIST.flatMap((char) => {
    const current = jungseong[char]
    const before = snapshot[char]
    if (!current || current === before) return []
    return boundStrokesOf(current, masters).filter((item) => {
      const was = before?.[item.channel]?.find((stroke) => stroke.id === item.stroke.id)
      return JSON.stringify(was) !== JSON.stringify(item.stroke)
    }).map((item) => ({ ...item, char }))
  })
}

/**
 * 편집기에서 고쳤지만 반영 고르기에서 뺀 획은 고치기 전 모양으로 돌린 홀자들. 뺀 카드는 "안 바뀐다"여야 해서,
 * 편집기에서 이미 바뀐 그 획도 연 때의 모양으로 돌아가야 한다.
 */
function revertedUnpicked(
  jungseong: Readonly<Record<string, JamoData>>,
  snapshot: Readonly<Record<string, JamoData>>,
  changed: readonly { char: string; channel: JamoChannel; stroke: { id: string } }[],
  picked: ReadonlySet<string>,
): Record<string, JamoData> {
  const reverted: Record<string, JamoData> = {}
  for (const item of changed) {
    if (picked.has(`${item.char}:${item.stroke.id}`)) continue
    const before = snapshot[item.char]?.[item.channel]?.find((stroke) => stroke.id === item.stroke.id)
    const jamo = reverted[item.char] ?? jungseong[item.char]
    if (!before || !jamo) continue
    reverted[item.char] = { ...jamo, [item.channel]: (jamo[item.channel] ?? []).map((stroke) => stroke.id === item.stroke.id ? before : stroke) }
  }
  return reverted
}

function entriesOf(jungseong: Readonly<Record<string, JamoData>>, masters: StemMasters, base: StemBase): StemEntry[] {
  return JUNGSEONG_LIST.flatMap((char) => {
    const jamo = jungseong[char]
    if (!jamo) return []
    return boundStrokesOf(jamo, masters).filter((item) => isUnder(item.name, base)).map((item): StemEntry => ({
      char, channel: item.channel, strokeId: item.stroke.id, name: item.name, values: facetValuesOf(item.name), follows: item.follows,
      curved: item.stroke.points.some((point) => point.handleIn || point.handleOut),
    }))
  })
}

export function StemMasterLabPage() {
  // 랩 화면은 앱 시작의 레이아웃 이관을 건너뛴다(`showDevLab`). 앱 편집기를 띄우기 전에 앱과 같은 이관을 먼저 돌린다 —
  // 안 돌리면 편집기가 옛 키에 쓴 채로 남아 다음에 앱을 열 때 이관이 막힌다. 이미 끝났으면 아무것도 안 한다.
  const [migration] = useState(() => runLayoutProfileMigrationBootstrap({ storage: window.localStorage, defaultSchemas: DEFAULT_LAYOUT_SCHEMAS, presetProfile: LEGACY_CALIBRATION_LAYOUT_PROFILE_V1 }))
  const [base, setBase] = useState<StemBase>('gidung')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [session, setSession] = useState<EditSession>(() => openSession('ㅏ', 0))
  /** `곧게 고치기`로 정한 모양. 없으면 편집기에서 고친 획을 읽는다. */
  const [straight, setStraight] = useState<StemMaster | null>(null)
  const [asking, setAsking] = useState(false)
  /** 반영할 획들(`keyOf`). 저장할 때마다 전부로 시작한다. */
  const [picked, setPicked] = useState<ReadonlySet<string>>(new Set())
  const setMasters = useStemMasterStore((state) => state.setMasters)
  const masters = useStemMasterStore((state) => state.masters)
  const jungseong = useJamoStore((state) => state.jungseong)
  const refollowAll = useStemMasterStore((state) => state.refollowAll)
  const resetAll = useStemMasterStore((state) => state.resetAll)

  const entries = useMemo(() => entriesOf(jungseong, masters, base), [jungseong, masters, base])
  const editing = entries.find((entry) => keyOf(entry) === editingKey) ?? entries.find((entry) => entry.char === session.char) ?? null
  const leaves = [...new Set(entries.map((entry) => entry.name))].sort(byLeafRank(base))
  const selected = asking ? picked : null
  const released = entries.filter((entry) => !entry.follows).length

  // 편집기에서 고친 획 — 연 때와 달라진 이름 있는 획 중 첫째. 그 모양이 반영할 마스터다.
  const changed = useMemo(() => changedStems(jungseong, session.snapshot, masters), [jungseong, session, masters])
  const edited = changed[0] ?? null
  const editedMaster = useMemo(() => edited ? masterFromStroke(jungseong[edited.char], edited.channel, edited.stroke.id) : null, [edited, jungseong])
  const pending = straight ?? editedMaster
  const editedKey = straight ? (editing ? keyOf(editing) : null) : edited ? `${edited.char}:${edited.stroke.id}` : null

  const open = (char: string) => {
    setStraight(null)
    setAsking(false)
    if (char !== session.char) setSession(openSession(char, session.key + 1))
  }
  const save = () => {
    if (!pending) return
    const next = baseOf(pending.name)
    setBase(next)
    setPicked(new Set(entriesOf(jungseong, masters, next).map(keyOf)))
    setAsking(true)
  }
  // 되돌리기: 연 때의 모양으로 돌리고, 그동안 쌓인 편집 기록을 걷는다. 편집기는 새로 연다.
  const revert = () => {
    const history = useEditHistoryStore.getState()
    history.history.slice(session.historyLength).forEach((entry) => { if (entry.kind === 'jamo') useCalibrationProjectStore.getState().removeSampleGlyphEdit(entry.edit.id) })
    history.setHistory((items) => items.slice(0, session.historyLength))
    history.setFuture([])
    const store = useJamoStore.getState()
    for (const char of JUNGSEONG_LIST) if (store.jungseong[char] !== session.snapshot[char] && session.snapshot[char]) store.updateJungseong(char, session.snapshot[char])
    setStraight(null)
    setAsking(false)
    setSession(openSession(session.char, session.key + 1))
  }
  const apply = () => {
    if (!pending) return
    // 고른 획이 하나라도 든 갈래에 모양을 적고, 그 갈래에서 뺀 획은 옮기지 않는다(풀림으로 남는다).
    const names = [...new Set(entries.filter((entry) => picked.has(keyOf(entry))).map((entry) => entry.name))]
    // 뺀 카드 중 편집기에서 고친 획은 먼저 고치기 전으로 돌린다.
    for (const [char, jamo] of Object.entries(revertedUnpicked(jungseong, session.snapshot, changed, picked))) useJamoStore.getState().updateJungseong(char, jamo)
    setMasters(names.map((name) => ({ ...pending, name })), (char, strokeId) => !picked.has(`${char}:${strokeId}`))
    setStraight(null)
    setAsking(false)
    // 반영한 모양이 새 기준 — 이어서 고치면 여기서부터 잰다.
    setSession((current) => openSession(current.char, current.key))
  }
  const preview = useMemo(() => {
    if (!pending || !asking) return {}
    const names = [...new Set(entries.filter((entry) => picked.has(keyOf(entry))).map((entry) => entry.name))]
    const after: StemMasters = { ...masters, ...Object.fromEntries(names.map((name) => [name, { ...pending, name }])) }
    const reverted = revertedUnpicked(jungseong, session.snapshot, changed, picked)
    const base = { ...jungseong, ...reverted }
    return { ...reverted, ...propagatedJungseong(base, masters, after, (char, strokeId) => !picked.has(`${char}:${strokeId}`)) }
  }, [pending, asking, entries, picked, masters, jungseong, session.snapshot, changed])
  const toggle = (keys: readonly string[], on: boolean) => setPicked((current) => {
    const next = new Set(current)
    for (const key of keys) {
      if (on) next.add(key)
      else if (key !== editedKey) next.delete(key)
    }
    return next
  })
  const chooseBase = (next: StemBase) => { setStraight(null); setAsking(false); setEditingKey(null); setBase(next) }

  return (
    <main className={styles.page} data-testid="stem-master-lab">
      <header className={styles.hero}>
        <span>Stem Master Lab</span>
        <h1>홀자 줄기 마스터</h1>
        <p>앱 편집기로 홀자 획을 고치고 저장하면 어디까지 반영할지 묻는다 — 갈래 묶음을 한 번에 보이고 전부에서 시작해 묶음 체크나 카드로 뺀다. 뺀 획은 풀림으로 남는다. 같은 줄기라도 역할(바깥 · 안 기둥, 솟는 · 내리는 짧은기둥, 섞임홀자 등)이 달라 갈래로 나뉜다. 오른쪽 카드를 누르면 그 홀자를 편집기에 연다. <strong>여기서 반영하면 진짜 자모 획이 바뀐다</strong> — 문장 줄 · 카드 · OTF에도 나온다.</p>
        <div className={styles.names} role="radiogroup" aria-label="줄기">
          {STEM_BASES.map((item) => (
            <button key={item} type="button" role="radio" aria-checked={base === item} data-master={item} onClick={() => chooseBase(item)}>
              {STEM_NAME_LABEL[item]}{Object.entries(masters).some(([name, shape]) => isUnder(name, item) && shape && !isStraight(shape)) ? ' ●' : ''}
            </button>
          ))}
        </div>
        <button type="button" className={styles.reset} data-testid="reset-all" onClick={() => { setStraight(null); setAsking(false); resetAll(); setSession(openSession(session.char, session.key + 1)) }}>전체 리셋 — 마스터를 지우고 줄기를 전부 곧게</button>
      </header>

      <div className={styles.workspace}>
        <section className={styles.editor} aria-label="획 편집">
          <aside className={styles.side}>
            <h2>{edited ? `${edited.char} · ${stemMasterLabel(edited.name)}` : editing ? `${editing.char} · ${stemMasterLabel(editing.name)}` : session.char}</h2>
            <p>{straight ? '곧게 — 저장해서 반영할 곳을 고른다.' : edited ? `고친 획 — 저장하면 이 모양을 형제에게 반영할지 묻는다.${changed.length > 1 ? ` (고친 획 ${changed.length}개 중 첫째)` : ''}` : '앱 편집기에서 획을 고친다. 고치면 저장이 켜진다.'}</p>
            <div className={styles.saveBar}>
              <button type="button" className={styles.reset} disabled={Boolean(pending) || !editing || isStraight(masterOf(masters, editing.name))} onClick={() => editing && setStraight(straightMaster(editing.name))}>곧게 고치기</button>
              <button type="button" className={styles.reset} data-testid="revert" disabled={!pending} onClick={revert}>되돌리기</button>
              <button type="button" className={styles.apply} data-testid="save" disabled={!pending} onClick={save}>저장</button>
            </div>
          </aside>
          <div className={styles.appEditor} data-testid="lab-stroke-editor">
            {migration.status === 'blocked'
              ? <p role="alert">레이아웃 데이터 이관이 막혀 편집기를 열지 않았어요 — {migration.message}</p>
              : <LabStrokeEditor key={session.key} syllable={sampleSyllable(session.char, 'open')} />}
          </div>
        </section>

        <section className={styles.siblings} aria-label="형제">
          <h2>형제 <small>{uniqueChars(entries).length}</small></h2>
          {released > 0 && <button type="button" data-testid="refollow-all" onClick={() => leaves.forEach((name) => refollowAll(name))}>풀린 획 {released}개 모두 다시 따르기</button>}
          <div className={styles.roleGroups} data-testid="siblings">
            {leaves.map((leaf) => {
              const inLeaf = entries.filter((entry) => entry.name === leaf)
              return (
                <div key={leaf} className={styles.roleGroup} data-role={leaf} data-picked={selected ? inLeaf.some((entry) => selected.has(keyOf(entry))) : undefined}>
                  <h3 className={styles.roleHead}>{stemMasterLabel(leaf)} <small>{inLeaf.length}</small>{masters[leaf] && !isStraight(masters[leaf]!) && <em>휨</em>}</h3>
                  <div className={styles.siblingGrid}>
                    {inLeaf.map((entry) => (
                      <SiblingCard key={keyOf(entry)} entry={entry} marked={selected ? selected.has(keyOf(entry)) : true} editing={editing ? keyOf(editing) === keyOf(entry) : false} onEdit={() => { setEditingKey(keyOf(entry)); open(entry.char) }} />
                    ))}
                  </div>
                </div>
              )
            })}
          </div>
        </section>
      </div>
      {pending && asking && <ApplyGroups base={base} entries={entries} picked={picked} preview={preview} editedKey={editedKey} onToggle={toggle} onApply={apply} onCancel={() => setAsking(false)} />}
    </main>
  )
}
