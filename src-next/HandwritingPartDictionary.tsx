import { useMemo } from 'react'
import { CHOSEONG_LIST, JONGSEONG_LIST, JUNGSEONG_LIST } from '../src/data/Hangul'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import type { JamoData } from '../src/types'
import { Pressable } from './components/ui/pressable'
import { jamoPartList, ScopeMini, SLOT_NAME } from './HandwritingAnatomy'
import type { Slot } from './HandwritingAnatomy'
import styles from './HandwritingPartDictionary.module.css'

/**
 * 부위 사전(손글씨 실험실). 해부도 아티팩트(11-08)의 용어 풀이와 `글자 해부와 부위 묶음` 문서(11-09)의 규칙을 한 화면에 모은다.
 * 뜻 · 성립 조건 · 엔진이 읽는 법은 여기 적어 둔 글이고, 있는 자모 · 늘 함께 있는 부위 · 붙는 속성은 지금 프리셋 자모를
 * 획 문법으로 읽어 그 자리에서 센다 — 글과 실제가 어긋나면 이 화면에서 보인다.
 */
interface Entry {
  /** 해부도 번호. */
  no: number
  name: string
  mean: string
  /** 성립 조건: 어떤 경우에 이 부위가 있는가. */
  when: string
  /** 엔진이 읽는 법. 없으면 아직 안 읽는 말. */
  read?: string
  /** 묶음 키. 끝이 `|*`면 그 낱말로 시작하는 묶음 전부. */
  key?: string
}

const GROUPS: { title: string; note: string; entries: Entry[] }[] = [
  {
    title: '형태 이름 — 줄기 모양',
    note: '획의 각도만 보고 정해요. 어떤 자모인지 몰라도 읽을 수 있어서, 사용자가 꼴을 바꿔도 따라가요.',
    entries: [
      { no: 1, name: '가로줄기', key: '줄기|가로줄기', mean: '가로로 누운 줄기.', when: '어느 자모에나 있을 수 있어요.', read: '마디가 가로축에서 10° 안으로 누워 있으면 가로줄기.' },
      { no: 2, name: '세로줄기', key: '줄기|세로줄기', mean: '세로로 선 줄기.', when: '어느 자모에나 있을 수 있어요.', read: '마디가 세로축에서 10° 안으로 서 있으면 세로줄기.' },
      { no: 3, name: '삐침', key: '줄기|삐침', mean: '오른쪽 위에서 왼쪽 아래로 비스듬히 그은 줄기.', when: '닿자에만 있어요(ㅅ ㅈ ㅊ 계열).', read: '가로 · 세로 어느 축에서도 10° 넘게 벗어나고, 아래 끝이 왼쪽에 있으면 삐침.' },
      { no: 4, name: '내림', key: '줄기|내림', mean: '왼쪽 위에서 오른쪽 아래로 내려 그은 줄기.', when: '닿자에만 있어요(ㅅ ㅈ ㅊ 계열).', read: '가로 · 세로 어느 축에서도 10° 넘게 벗어나고, 아래 끝이 오른쪽에 있으면 내림.' },
      { no: 19, name: '둥근줄기', key: '줄기|둥근줄기', mean: 'ㅇ ㅎ처럼 둥글게 이어진 줄기.', when: '닫힌 둥근 획이 있는 자모(ㅇ ㅎ과 그 겹받침).', read: '꺾임 없이 닫힌 획이면 둥근줄기.' },
    ],
  },
  {
    title: '기능 이름 — 홀자 줄기',
    note: '자모마다 어느 획이 무엇인지 표(획 문법)에 적어 둔 이름이에요. 꼴을 바꿔도 이름은 표가 지켜요.',
    entries: [
      { no: 24, name: '기둥', key: '줄기|기둥', mean: '글자 전체를 지탱하는 세로줄기.', when: '세로홀자와 섞임홀자에 있어요. 둘이면 겹기둥(ㅐ ㅔ).', read: '획 문법 표가 그 획을 기둥이라 적어 둔 것.' },
      { no: 26, name: '보', key: '줄기|보', mean: '곧고 길게 뻗은 가로줄기.', when: '가로홀자와 섞임홀자에 있어요.', read: '획 문법 표가 그 획을 보라 적어 둔 것.' },
      { no: 27, name: '곁줄기', key: '줄기|곁줄기', mean: '밝은 소리와 어두운 소리를 가르려고 기둥 곁에 붙인 짧은 줄기.', when: '기둥이 있어야 생겨요. 기둥 오른쪽이면 밝은 소리(ㅏ), 왼쪽이면 어두운 소리(ㅓ). 둘이면 쌍곁줄기.', read: '표의 이름 + 가장 가까운 기둥의 어느 쪽인지로 방향 속성을 붙여요.' },
      { no: 28, name: '짧은기둥', key: '줄기|짧은기둥', mean: '보에 붙은 짧은 세로줄기.', when: '보가 있어야 생겨요. 보 위로 서면 밝은 소리(ㅗ), 아래로 내리면 어두운 소리(ㅜ).', read: '표의 이름 + 보의 위인지 아래인지로 방향 속성을 붙여요.' },
      { no: 5, name: '걸침', key: '줄기|걸침', mean: '두 세로줄기나 기둥 사이에 걸친 가로줄기.', when: '나란한 세로줄기 둘이 있어야 생겨요(ㅂ, ㅐ ㅒ).', read: '획 문법 표가 그 획을 걸침이라 적어 둔 것.' },
    ],
  },
  {
    title: '기능 이름 — 닿자 줄기',
    note: '닿자 줄기에는 사전 이름이 거의 없어서, 덧줄기 · 꼭지 말고는 "닿자 + 모양"을 이름으로 써요.',
    entries: [
      { no: 20, name: '덧줄기', key: '줄기|덧줄기', mean: '기본 줄기에 덧붙은 줄기.', when: 'ㄱ에 덧붙어 ㅋ, ㄷ에 덧붙어 ㅌ.', read: '획 문법 표가 그 획을 덧줄기라 적어 둔 것.' },
      { no: 21, name: '꼭지', key: '줄기|꼭지', mean: 'ㅎ ㅊ의 맨 위에 붙은 점 또는 짧은 줄기.', when: 'ㅎ ㅊ과 그 겹받침에만.', read: '획 문법 표가 그 획을 꼭지라 적어 둔 것.' },
      { no: 1, name: '닿자 가로줄기', key: '줄기|닿자 가로줄기', mean: '닿자 안의 가로줄기.', when: '이름 없는 닿자 획의 가로 마디.', read: '표에 이름이 없는 닿자 획에서 모양이 가로줄기인 마디. 맨 위 · 가운데 · 맨 아래 층을 속성으로 붙여요.' },
      { no: 2, name: '닿자 세로줄기', key: '줄기|닿자 세로줄기', mean: '닿자 안의 세로줄기.', when: '이름 없는 닿자 획의 세로 마디.', read: '표에 이름이 없는 닿자 획에서 모양이 세로줄기인 마디. 맨 왼 · 가운데 · 맨 오른 층을 속성으로 붙여요.' },
      { no: 3, name: '닿자 삐침', key: '줄기|닿자 삐침', mean: '닿자 안의 삐침.', when: 'ㅅ ㅈ ㅊ 계열의 왼쪽 다리.', read: '표에 이름이 없는 닿자 획에서 모양이 삐침인 마디.' },
      { no: 4, name: '닿자 내림', key: '줄기|닿자 내림', mean: '닿자 안의 내림.', when: 'ㅅ ㅈ ㅊ 계열의 오른쪽 다리.', read: '표에 이름이 없는 닿자 획에서 모양이 내림인 마디.' },
    ],
  },
  {
    title: '부분 — 줄기에 딸린 곳',
    note: '줄기 없이 있을 수 없는 곳이에요. 어느 줄기의 머리 · 맺음인지에 따라 묶음이 갈려요.',
    entries: [
      { no: 6, name: '머리', key: '머리|*', mean: '줄기가 시작되는 부분.', when: '줄기 끝이 다른 획에 안 닿고 열려 있어야 해요. 가로줄기는 왼쪽 끝, 나머지는 위쪽 끝.', read: '쓴 차례가 아니라 마디 모양으로 정해요. 끝에서 0.1(자모 상자 기준) 안에 다른 획이 있으면 닿은 끝으로 보고 뺍니다.' },
      { no: 8, name: '맺음', key: '맺음|*', mean: '줄기가 끝나는 부분.', when: '줄기 끝이 열려 있어야 해요. 가로줄기는 오른쪽 끝, 나머지는 아래쪽 끝.', read: '머리의 반대쪽 끝. 다른 획 밖으로 0.05 넘게 나와 있으면 열린 맺음으로 읽어요(ㅞ의 안 기둥).' },
      { no: 9, name: '꺾임', key: '꺾임', mean: '줄기의 방향이 바뀐 부분.', when: '한 획 안에서 방향이 바뀌거나, 두 획의 끝이 맞닿아 귀를 이룰 때.', read: '방향이 30° 넘게 바뀌고 핸들이 없는 점. 귀의 자리 · 열린 꼴/닫힌 꼴 · 꺾임 각을 속성으로 붙여요.' },
    ],
  },
]

/** 사전에는 있지만 엔진이 아직 따로 읽지 않는 말. */
const UNREAD: { no: number; name: string; why: string }[] = [
  { no: 7, name: '부리', why: '부위가 아니라 머리에 얹는 스타일로 다뤄요.' },
  { no: 10, name: '굴림', why: '꺾임을 둥글게 한 꼴. 지금은 전역 둥글기 값으로만 있어요.' },
  { no: 11, name: '귀', why: '꺾임의 귀 자리(오른 위 귀 …)는 속성으로 읽지만, 튀어나온 돌기는 안 읽어요.' },
  { no: 12, name: '굽', why: 'ㅁ ㅂ의 세로선이 아래로 나온 돌기. 프리셋 꼴에 없어요.' },
  { no: 22, name: '갓머리', why: 'ㅎ에서 동그라미를 뺀 부분. 꼭지 + 가로줄기로 나눠 읽어요.' },
  { no: 25, name: '겹기둥', why: '기둥 둘로 읽고 안 · 바깥 자리말을 붙여요.' },
  { no: 29, name: '이음줄기', why: '섞임홀자에서 기둥에 닿는 보. 따로 이름 붙이지 않아요.' },
  { no: 30, name: '열린겹줄기 · 닫힌겹줄기', why: '걸침이 있는지로 갈리는데, 걸침만 읽어요.' },
  { no: 13, name: '이음 자리 · 닿은 머리 · 닿은 맺음', why: '닿았는지는 계산하지만(그래서 머리 · 맺음에서 빠져요) 목록에는 안 올려요.' },
]

const SLOTS: Slot[] = ['CH', 'JU', 'JO']
const LISTS: Record<Slot, readonly string[]> = { CH: CHOSEONG_LIST, JU: JUNGSEONG_LIST, JO: (JONGSEONG_LIST as readonly string[]).filter(Boolean) }
const SLOT_WORDS = new Set(['첫닿자', '받침', '세로홀자', '가로홀자', '섞임홀자'])
const hitOf = (key: string) => (k: string) => (key.endsWith('|*') ? k.startsWith(key.slice(0, -1)) : k === key)

export function HandwritingPartDictionary({ style, onPick }: { style: GlobalStyle; onPick: (slot: Slot, ch: string) => void }) {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  // 자모마다 부위 목록을 한 번 읽어 둔다.
  const parts = useMemo(() => {
    const maps: Record<Slot, Record<string, JamoData>> = { CH: choseong, JU: jungseong, JO: jongseong }
    return SLOTS.flatMap((slot) => LISTS[slot].flatMap((ch) => (maps[slot][ch] ? [{ slot, ch, list: jamoPartList(maps[slot][ch], slot) }] : [])))
  }, [choseong, jungseong, jongseong])
  const live = useMemo(() => new Map(GROUPS.flatMap((g) => g.entries).filter((e) => e.key).map((entry) => {
    const hit = hitOf(entry.key!)
    const has = parts.filter((p) => p.list.some((it) => hit(it.fn) || hit(it.shape)))
    // 늘 함께 있는 줄기: 이 부위가 있는 자모 모두에 있는 다른 줄기 이름(기능 층).
    const stemSets = has.map((p) => new Set(p.list.filter((it) => it.kind === 'segment' && !hit(it.fn) && !hit(it.shape)).map((it) => it.fn.split('|')[1])))
    const always = stemSets.length ? [...stemSets[0]].filter((name) => stemSets.every((set) => set.has(name))) : []
    const attrs = new Map<string, number>()
    has.forEach((p) => new Set(p.list.filter((it) => hit(it.fn) || hit(it.shape)).flatMap((it) => it.attrs).filter((a) => !SLOT_WORDS.has(a))).forEach((a) => attrs.set(a, (attrs.get(a) ?? 0) + 1)))
    return [entry.name, { bySlot: SLOTS.map((slot) => ({ slot, chars: has.filter((p) => p.slot === slot).map((p) => p.ch) })), always, attrs: [...attrs.entries()].sort((a, b) => b[1] - a[1]) }] as const
  })), [parts])

  return <div className={styles.wrap} data-testid="handwriting-part-dictionary">
    {GROUPS.map((group) => <section key={group.title} className={styles.group}>
      <h2>{group.title}</h2>
      <p className={styles.note}>{group.note}</p>
      {group.entries.map((entry) => {
        const data = live.get(entry.name)
        return <article key={entry.name} className={styles.entry} data-testid={`part-dict-${entry.name}`}>
          <header><i>{entry.no}</i><b>{entry.name}</b><span>{entry.mean}</span></header>
          <dl>
            <dt>성립 조건</dt><dd>{entry.when}</dd>
            <dt>엔진이 읽는 법</dt><dd>{entry.read}</dd>
            {data && data.always.length > 0 && <><dt>늘 함께 있는 줄기</dt><dd className={styles.chips}>{data.always.map((name) => <em key={name}>{name}</em>)}<small>프리셋에서 센 것</small></dd></>}
            {data && data.attrs.length > 0 && <><dt>붙는 속성</dt><dd className={styles.chips}>{data.attrs.map(([name, count]) => <em key={name}>{name} <small>{count}</small></em>)}</dd></>}
          </dl>
          {data?.bySlot.filter((s) => s.chars.length).map(({ slot, chars }) => <div key={slot} className={styles.row}>
            <p>{SLOT_NAME[slot]} <em>{chars.length}/{LISTS[slot].length}</em></p>
            <div className={styles.minis}>{chars.map((ch) => <Pressable key={ch} type="button" className={styles.mini} aria-label={`${SLOT_NAME[slot]} ${ch} 해부로 열기`} onClick={() => onPick(slot, ch)}>
              <ScopeMini ch={ch} slot={slot} scopeKey={entry.key!} style={style} />
            </Pressable>)}</div>
          </div>)}
          {data && data.bySlot.every((s) => !s.chars.length) && <p className={styles.none}>지금 프리셋에는 이 부위가 없어요.</p>}
        </article>
      })}
    </section>)}
    <section className={styles.group}>
      <h2>엔진이 아직 따로 읽지 않는 말</h2>
      <p className={styles.note}>사전에는 있지만 부위 목록에는 안 올라오는 말이에요. 스타일을 걸 주소가 아직 없다는 뜻이기도 해요.</p>
      <ul className={styles.unread}>{UNREAD.map((u) => <li key={u.name}><i>{u.no}</i><b>{u.name}</b><span>{u.why}</span></li>)}</ul>
    </section>
  </div>
}
