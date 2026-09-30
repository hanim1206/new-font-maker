import { useMemo, useState } from 'react'
import { JUNGSEONG_LIST } from '../src/data/Hangul'
import { useJamoStore } from '../src/stores/jamoStore'
import { useStemMasterStore } from '../src/stores/stemMasterStore'
import { baseOf, isStraight, isUnder, masterOf, straightMaster, STEM_BASES, stemMasterLabel, type JamoChannel, type StemBase } from '../src/services/stemMaster'
import { STEM_NAME_LABEL } from '../src/services/strokeGrammar'
import type { JamoData, ResolvedStrokeInkSource } from '../src/types'
import { AppGlyph } from './AppGlyph'
import { StemSpreadSheet } from './StemSpreadSheet'
import {
  ACTIVE_STROKE_COLOR,
  beforeSpreadJamo,
  byLeafRank,
  changedStems,
  defaultPicked,
  entriesOf,
  keyOf,
  lockedKeys,
  pickedMasters,
  sampleSyllable,
  shapeAskForStroke,
  shapePreview,
  uniqueChars,
  type ShapeAsk,
  type StemEntry,
} from './stemShapeSession'
import { LEGACY_CALIBRATION_LAYOUT_PROFILE_V1 } from '../src/data/legacyCalibrationLayoutProfileV1'
import { runLayoutProfileMigrationBootstrap } from '../src/services/layoutProfileMigrationBootstrap'
import { DEFAULT_LAYOUT_SCHEMAS } from '../src/utils/layoutCalculator'
import { CalibrationSentenceEditor } from './CalibrationSentenceEditor'
import { useCalibrationProjectStore } from './calibrationProjectStore'
import { useEditHistoryStore } from './editHistoryStore'
import styles from './StemMasterLabPage.module.css'

/**
 * 홀자 줄기 마스터 랩. 앱의 자소 획 편집기로 홀자 획을 고치고, `저장`하면 앱 획 편집의 `전파`와 같은 창(`StemSpreadSheet` · 계산은 `stemShapeSession`)이
 * 연 뒤 처음 고친 획을 기준으로 뜬다. 편집기는 앱과 같아서 고친 획은 바로 자모에 적힌다. `되돌리기`는 연 때의 모양으로 돌린다.
 * 플랜: docs/plans/2026-09-29_홀자-줄기-마스터.md
 */

const FINALS = [{ id: 'open', label: '받침 없음' }, { id: 'closed', label: '받침 있음' }] as const

const CHANNEL_LABEL: Record<JamoChannel, string> = { strokes: '', horizontalStrokes: '가로부', verticalStrokes: '세로부' }

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

export function StemMasterLabPage() {
  // 랩 화면은 앱 시작의 레이아웃 이관을 건너뛴다(`showDevLab`). 앱 편집기를 띄우기 전에 앱과 같은 이관을 먼저 돌린다 —
  // 안 돌리면 편집기가 옛 키에 쓴 채로 남아 다음에 앱을 열 때 이관이 막힌다. 이미 끝났으면 아무것도 안 한다.
  const [migration] = useState(() => runLayoutProfileMigrationBootstrap({ storage: window.localStorage, defaultSchemas: DEFAULT_LAYOUT_SCHEMAS, presetProfile: LEGACY_CALIBRATION_LAYOUT_PROFILE_V1 }))
  const [base, setBase] = useState<StemBase>('gidung')
  const [editingKey, setEditingKey] = useState<string | null>(null)
  const [session, setSession] = useState<EditSession>(() => openSession('ㅏ', 0))
  /** `곧게 고치기`를 눌렀나. 편집기에서 고친 획 대신 고르는 획의 갈래를 곧은 마스터로 묻는다. */
  const [straight, setStraight] = useState(false)
  /** 반영 창. 저장을 누르면 그때의 물음과 고른 카드로 연다. */
  const [asking, setAsking] = useState<{ ask: ShapeAsk; picked: Set<string> } | null>(null)
  const setMasters = useStemMasterStore((state) => state.setMasters)
  const masters = useStemMasterStore((state) => state.masters)
  const jungseong = useJamoStore((state) => state.jungseong)
  const refollowAll = useStemMasterStore((state) => state.refollowAll)
  const resetAll = useStemMasterStore((state) => state.resetAll)

  const entries = useMemo(() => entriesOf(jungseong, masters, base), [jungseong, masters, base])
  const editing = entries.find((entry) => keyOf(entry) === editingKey) ?? entries.find((entry) => entry.char === session.char) ?? null
  const leaves = [...new Set(entries.map((entry) => entry.name))].sort(byLeafRank(base))
  const released = entries.filter((entry) => !entry.follows).length

  // 편집기에서 고친 줄기 — 연 때와 견줘 처음 달라진 이름 있는 획이 기준(앱 `전파`는 잡은 획이 기준).
  const edited = useMemo(() => changedStems(jungseong, session.snapshot, masters)[0] ?? null, [jungseong, session.snapshot, masters])
  const shapeAsk = useMemo(() => edited ? shapeAskForStroke(jungseong, masters, edited.char, edited.stroke.id) : null, [edited, jungseong, masters])
  // `곧게 고치기`: 고르는 획의 갈래를 곧은 마스터로 묻는다.
  const straightAsk = useMemo((): ShapeAsk | null => {
    if (!straight || !editing) return null
    const all = entriesOf(jungseong, masters, baseOf(editing.name))
    return { sections: [{ leaf: editing.name, master: straightMaster(editing.name), editedKey: keyOf(editing), channel: editing.channel, entries: all.filter((entry) => entry.name === editing.name), extras: all.filter((entry) => entry.name !== editing.name) }] }
  }, [straight, editing, jungseong, masters])
  const pending = straightAsk ?? shapeAsk

  const open = (char: string) => {
    setStraight(false)
    setAsking(null)
    if (char !== session.char) setSession(openSession(char, session.key + 1))
  }
  const save = () => {
    if (!pending) return
    setBase(baseOf(pending.sections[0].leaf))
    setAsking({ ask: pending, picked: defaultPicked(pending) })
  }
  // 되돌리기: 연 때의 모양으로 돌리고, 그동안 쌓인 편집 기록을 걷는다. 편집기는 새로 연다.
  const revert = () => {
    const store = useEditHistoryStore.getState()
    store.history.slice(session.historyLength).forEach((entry) => { if (entry.kind === 'jamo') useCalibrationProjectStore.getState().removeSampleGlyphEdit(entry.edit.id) })
    store.setHistory((items) => items.slice(0, session.historyLength))
    store.setFuture([])
    const jamo = useJamoStore.getState()
    for (const char of JUNGSEONG_LIST) if (jamo.jungseong[char] !== session.snapshot[char] && session.snapshot[char]) jamo.updateJungseong(char, session.snapshot[char])
    setStraight(false)
    setAsking(null)
    setSession(openSession(session.char, session.key + 1))
  }
  // 반영: 고른 획이 든 갈래에 기준 획의 모양을 적고, 뺀 획은 풀림(지금 모양) — 앱 획 편집과 같다.
  const apply = () => {
    if (!asking) return
    setMasters(pickedMasters(asking.ask, asking.picked), (char, strokeId) => !asking.picked.has(`${char}:${strokeId}`))
    setStraight(false)
    setAsking(null)
    // 반영한 모양이 새 기준 — 이어서 고치면 여기서부터 잰다.
    setSession((current) => openSession(current.char, current.key))
  }
  const preview = useMemo(() => asking ? shapePreview(asking.ask, asking.picked, jungseong, masters) : {}, [asking, jungseong, masters])
  const before = useMemo(() => asking ? beforeSpreadJamo(jungseong, masters, asking.ask) : {}, [asking, jungseong, masters])
  const toggle = (keys: readonly string[], on: boolean) => setAsking((current) => {
    if (!current) return current
    const picked = new Set(current.picked)
    const locked = lockedKeys(current.ask)
    for (const key of keys) { if (on) picked.add(key); else if (!locked.has(key)) picked.delete(key) }
    return { ...current, picked }
  })
  const chooseBase = (next: StemBase) => { setStraight(false); setAsking(null); setEditingKey(null); setBase(next) }
  const selected = asking ? asking.picked : null

  return (
    <main className={styles.page} data-testid="stem-master-lab">
      <header className={styles.hero}>
        <span>Stem Master Lab</span>
        <h1>홀자 줄기 마스터</h1>
        <p>앱 편집기로 홀자 획을 고치고 저장하면 앱 획 편집과 같은 반영 창이 뜬다 — 고친 획과 같은 갈래에 퍼진 결과를 보이고, 마음에 안 드는 글자만 툭 쳐서 따로 둔다(지금 모양 그대로 · 풀림). 같은 줄기의 다른 갈래는 `다른 ○○에도` 아래 꺼진 채 보인다. 오른쪽 카드를 누르면 그 홀자를 편집기에 연다. <strong>여기서 반영하면 진짜 자모 획이 바뀐다</strong> — 문장 줄 · 카드 · OTF에도 나온다.</p>
        <div className={styles.names} role="radiogroup" aria-label="줄기">
          {STEM_BASES.map((item) => (
            <button key={item} type="button" role="radio" aria-checked={base === item} data-master={item} onClick={() => chooseBase(item)}>
              {STEM_NAME_LABEL[item]}{Object.entries(masters).some(([name, shape]) => isUnder(name, item) && shape && !isStraight(shape)) ? ' ●' : ''}
            </button>
          ))}
        </div>
        <button type="button" className={styles.reset} data-testid="reset-all" onClick={() => { setStraight(false); setAsking(null); resetAll(); setSession(openSession(session.char, session.key + 1)) }}>전체 리셋 — 마스터를 지우고 줄기를 전부 곧게</button>
      </header>

      <div className={styles.workspace}>
        <section className={styles.editor} aria-label="획 편집">
          <aside className={styles.side}>
            <h2>{edited ? `${edited.char} · ${stemMasterLabel(edited.name)}` : editing ? `${editing.char} · ${stemMasterLabel(editing.name)}` : session.char}</h2>
            <p>{straight ? '곧게 — 저장해서 반영할 곳을 고른다.' : edited ? '고친 획 — 저장하면 이 모양을 형제에게 퍼뜨릴지 묻는다.' : '앱 편집기에서 획을 고친다. 고치면 저장이 켜진다.'}</p>
            <div className={styles.saveBar}>
              <button type="button" className={styles.reset} disabled={Boolean(pending) || !editing || isStraight(masterOf(masters, editing.name))} onClick={() => editing && setStraight(true)}>곧게 고치기</button>
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
      {asking && <StemSpreadSheet ask={asking.ask} picked={asking.picked} preview={preview} before={before} onToggle={toggle} onDone={apply} onCancel={() => setAsking(null)} />}
    </main>
  )
}
