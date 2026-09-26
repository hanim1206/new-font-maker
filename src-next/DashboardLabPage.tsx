import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronLeft, ChevronRight, Copy, Download, Ellipsis, PencilLine, Plus, ScanSearch, Trash2, UserRound } from 'lucide-react'
import { CHOSEONG_LIST, JONGSEONG_LIST, JUNGSEONG_LIST } from '../src/data/Hangul'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { useEffectiveGlobalStyle, useGlobalStyleStore } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { useLayoutStore } from '../src/stores/layoutStore'
import { useUIStore } from '../src/stores/uiStore'
import { useWorkbenchStore, workbenchSyllable } from '../src/stores/workbenchStore'
import type { LayoutSchema, Padding } from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { AppGlyph } from './AppGlyph'
import { flushAccountFont } from './accountFontSync'
import { authGateMode, sessionUser, signOutAndReload } from './betaAuth'
import { navigate } from './router'
import { useContextPlacement } from './notoModel'
import { PART_COLOR } from './partColors'
import styles from './DashboardLabPage.module.css'

/**
 * 대시보드(`/dashboard`). 지금 연 폰트의 한눈 화면 — 셸 머리 `‹ 내 폰트`가 여기로 오고, 내 폰트 목록에서 폰트를 고르면 여기부터.
 * 2026-09-26 사용자 스케치를 앱 부품 · 토큰으로 옮긴 것. 위는 폰트 카드(지금 폰트 하나 + `새 폰트` → 내 폰트 목록), 아래는 왼쪽 레일(목차 · 스크롤 따라감) + 섹션 다섯.
 * 순서는 원칙 "큰 것부터 작은 것": 스타일 → 레이아웃 → 초성 → 중성 → 종성. 전체 목록이고, 손댄 자소는 점.
 * 초 · 중 · 종은 요약 줄이고 화살표가 섹션 홈, 자소 카드는 그 자소 하나만 도마에 올려 자모 에디터로 간다.
 * 아직 시안인 것: 카드의 이름 바꾸기 · 다운로드 · 메뉴, 스타일 타일 · 레이아웃 카드 탭. 파일 이름은 옛 랩 이름 그대로다.
 */

type SectionId = 'style' | 'layout' | 'choseong' | 'jungseong' | 'jongseong'
const SECTIONS: { id: SectionId; label: string }[] = [
  { id: 'style', label: '스타일' },
  { id: 'layout', label: '레이아웃' },
  { id: 'choseong', label: '초성' },
  { id: 'jungseong', label: '중성' },
  { id: 'jongseong', label: '종성' },
]
/** 레이아웃 6칸 대표 글자 — 세로홀자 · 가로홀자 · 섞임홀자 × 받침 유무. */
const LAYOUT_SAMPLES = ['래', '노', '화', '별', '을', '원'] as const
const SENTENCE = '포도밭에 햇살이 쏟아졌다'
const FINALS = JONGSEONG_LIST.filter((char) => char !== '')

const isHangul = (char: string) => { const code = char.codePointAt(0) ?? 0; return code >= 0xac00 && code <= 0xd7a3 }

/** 화면에 들어온 칸만 그린다 — 검수 격자와 같은 이유(67칸이 전부 칸 해석 + 획 렌더). */
function Lazy({ children, className }: { children: ReactNode; className?: string }) {
  const holder = useRef<HTMLSpanElement>(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const element = holder.current
    if (!element || visible) return
    const observer = new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) setVisible(true) }, { rootMargin: '200px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [visible])
  return <span ref={holder} className={className}>{visible ? children : null}</span>
}

function withEffectivePadding(schema: LayoutSchema, globalPadding: Padding, override: Partial<Padding> | undefined): LayoutSchema {
  const padding = { ...globalPadding, ...override }
  return { ...schema, padding, designBodyPadding: padding }
}

/** 레이아웃 칸. `AppGlyph`와 같은 길이로 그리되 첫닿자 상자를 옅게 깔아 "이 구조군의 배치"임을 보인다. */
function LayoutThumb({ char, size }: { char: string; size: number }) {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const syllable = useMemo(() => decomposeSyllable(char, choseong, jungseong, jongseong), [char, choseong, jungseong, jongseong])
  const effectiveStyle = useEffectiveGlobalStyle(syllable.layoutType)
  const globalStyle = useMemo(() => ({ ...effectiveStyle, slant: 0 }), [effectiveStyle])
  const schema = withEffectivePadding(schemas[syllable.layoutType], globalPadding, paddingOverrides[syllable.layoutType])
  const { placement } = useContextPlacement(syllable, schema, globalStyle)
  const box = placement.kind === 'boxes' ? placement.boxes.CH : undefined
  return <SvgRenderer
    syllable={syllable}
    schema={placement.kind === 'schema' ? placement.schema : undefined}
    boxes={placement.kind === 'boxes' ? placement.boxes : undefined}
    size={size}
    globalStyle={globalStyle}
    overflow="visible"
    clipGlyphs={false}
    underlay={box ? <rect x={box.x * 100} y={box.y * 100} width={box.width * 100} height={box.height * 100} fill={PART_COLOR.CH} fillOpacity={0.16} /> : undefined}
  />
}

/**
 * 스타일 그림 넷. 값에 따라 변하지 않는 공통 예시 아이콘 — 줄기 하나로 굵기 · 기울기 · 끝 굴림 · 부리가 무엇인지 보인다.
 * 실제 값은 옆의 숫자로만 읽는다. 흐린 선은 기준(가는 · 직립 · 각진 끝)이라 무엇이 변하는 항목인지 읽힌다.
 */
const PICTO = 52
const PICTO_STEM = 14
const PICTO_SLANT = 14
const PICTO_ROUNDNESS = 0.7
function StylePicto({ kind }: { kind: 'weight' | 'slant' | 'roundness' | 'beak' }) {
  const ink = 'rgb(var(--color-foreground))'
  const ghost = 'rgb(var(--color-text-6))'
  const stem = PICTO_STEM
  const cx = PICTO / 2
  const top = 8
  const bottom = PICTO - 8
  if (kind === 'weight') {
    // 세로줄기 셋 — 왼쪽부터 점점 두꺼워진다. 간격은 같게.
    const widths = [3, 8, 14]
    const gap = 7
    const total = widths.reduce((sum, w) => sum + w, 0) + gap * (widths.length - 1)
    let x = cx - total / 2
    return <svg viewBox={`0 0 ${PICTO} ${PICTO}`} aria-hidden="true">
      {widths.map((w, i) => {
        const rect = <rect key={i} x={x} y={top} width={w} height={bottom - top} fill={ink} />
        x += w + gap
        return rect
      })}
    </svg>
  }
  if (kind === 'slant') {
    return <svg viewBox={`0 0 ${PICTO} ${PICTO}`} aria-hidden="true">
      <rect x={cx - stem / 2} y={top} width={stem} height={bottom - top} fill={ghost} />
      <rect x={cx - stem / 2} y={top} width={stem} height={bottom - top} fill={ink} transform={`skewX(${-PICTO_SLANT})`} transform-origin={`${cx} ${bottom}`} />
    </svg>
  }
  if (kind === 'roundness') {
    const length = 34
    return <svg viewBox={`0 0 ${PICTO} ${PICTO}`} aria-hidden="true">
      <rect x={cx - length / 2} y={cx - stem / 2} width={length} height={stem} rx={PICTO_ROUNDNESS * stem / 2} fill={ink} />
    </svg>
  }
  // 부리는 줄기 머리의 작은 돌기. 기둥 왼쪽 위에 얹는다.
  const size = stem * 0.65
  const rise = Math.tan((25 * Math.PI) / 180) * size
  const path = `M ${cx - stem / 2 - size} ${top + rise} L ${cx - stem / 2} ${top} L ${cx - stem / 2} ${top + size} Z`
  return <svg viewBox={`0 0 ${PICTO} ${PICTO}`} aria-hidden="true">
    <rect x={cx - stem / 2} y={top} width={stem} height={bottom - top} fill={ink} />
    <path d={path} fill={ink} />
  </svg>
}

function FontCard({ name: initialName, note, active, onRenamed }: { name: string; note: string; active: boolean; onRenamed: (name: string) => void }) {
  // 카드가 폰트 상태를 다 말한다 — 이름 · 마지막 고침. 아래 따로 줄을 두지 않는다.
  // 카드 버튼은 둘뿐: 다운로드 · `…`. 이름 바꾸기 · 복사 · 삭제(나중엔 히스토리)는 `…` 안에.
  // 추출 버튼은 원형 아이콘. 탭하면 색이 바뀌며 옆으로 자라 `다운로드`가 들어온다(시안에서는 다시 탭하면 돌아간다).
  const [armed, setArmed] = useState(false)
  const [name, setName] = useState(initialName)
  const [renaming, setRenaming] = useState(false)
  const commitName = (value: string) => {
    const next = value.trim()
    if (next) { setName(next); onRenamed(next) }
    setRenaming(false)
  }
  return <article className={styles.card} data-active={active}>
    <header>
      {renaming
        ? <input className={styles.nameInput} defaultValue={name} aria-label="폰트 이름" autoFocus maxLength={40}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => commitName(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') setRenaming(false)
          }} />
        : <strong>{name}</strong>}
      <span>{note}</span>
    </header>
    <p className={styles.sentence} aria-label={SENTENCE}>
      {SENTENCE.split(' ').map((word, index) => <span key={index} className={styles.word}>
        {[...word].map((char, at) => isHangul(char) ? <AppGlyph key={at} char={char} size={34} /> : <span key={at}>{char}</span>)}
      </span>)}
    </p>
    {/* 추출은 폰트의 속성 — 워크스페이스 폰트 탭과 같은 버튼을 카드 안에. 화면 하단엔 두지 않는다. */}
    <footer>
      <FontCardMenu active={active} onRename={() => setRenaming(true)} />
      <button type="button" className={styles.download} data-armed={armed || undefined} aria-label="다운로드" tabIndex={active ? 0 : -1} onClick={() => setArmed((value) => !value)}><Download size={18} aria-hidden="true" /><span>다운로드</span></button>
    </footer>
  </article>
}

/**
 * 카드의 `…` 메뉴. 캐러셀이 가로 스크롤이라 카드 밖으로 넘치면 잘린다 — 버튼 자리를 재서 화면에 고정해 띄운다.
 * 바깥 탭 · Esc · 스크롤이면 닫힌다. 복사는 베타 폰트 1개 한도라 흐리게, 삭제는 메뉴 안에서 한 번 더 묻는다. 시안이라 복사 · 삭제는 동작하지 않는다.
 */
const MENU_WIDTH = 200

function FontCardMenu({ active, onRename }: { active: boolean; onRename: () => void }) {
  const [anchor, setAnchor] = useState<{ left: number; top: number } | null>(null)
  const [confirming, setConfirming] = useState(false)
  const button = useRef<HTMLButtonElement>(null)
  const panel = useRef<HTMLDivElement>(null)
  const close = () => { setAnchor(null); setConfirming(false) }
  useEffect(() => {
    if (!anchor) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!panel.current?.contains(target) && !button.current?.contains(target)) close()
    }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') close() }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    document.addEventListener('scroll', close, true)
    return () => {
      document.removeEventListener('pointerdown', onPointer)
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('scroll', close, true)
    }
  }, [anchor])
  const toggle = () => {
    if (anchor) return close()
    const rect = button.current?.getBoundingClientRect()
    // 버튼 오른쪽 아래로 연다. 화면 오른쪽 끝에 닿으면 16px 안쪽으로 당긴다.
    if (rect) setAnchor({ left: Math.min(rect.left, window.innerWidth - MENU_WIDTH - 16), top: rect.bottom + 6 })
  }
  return <>
    <button ref={button} type="button" className={styles.more} aria-label="더보기" aria-haspopup="menu" aria-expanded={!!anchor} tabIndex={active ? 0 : -1} onClick={toggle}><Ellipsis size={18} aria-hidden="true" /></button>
    {anchor && <div ref={panel} className={styles.cardMenu} role="menu" style={{ left: anchor.left, top: anchor.top }}>
      {confirming
        ? <div className={styles.cardMenuConfirm}>
          <p>이 폰트를 지울까요? 되돌릴 수 없어요.</p>
          <div>
            <button type="button" onClick={() => setConfirming(false)}>취소</button>
            <button type="button" data-danger onClick={close}>삭제</button>
          </div>
        </div>
        : <>
          <button type="button" role="menuitem" onClick={() => { close(); onRename() }}><PencilLine size={16} aria-hidden="true" />이름 바꾸기</button>
          <button type="button" role="menuitem" disabled><Copy size={16} aria-hidden="true" />복제</button>
          <button type="button" role="menuitem" data-danger onClick={() => setConfirming(true)}><Trash2 size={16} aria-hidden="true" />삭제</button>
        </>}
    </div>}
  </>
}

/**
 * 머리 오른쪽 마이페이지. 아이콘 하나, 누르면 아래로 계정 카드 — 아이디 · 요금제 · 폰트 수, 맨 아래 로그아웃.
 * 게이트가 켜져 있으면 실제 친구 아이디를 읽고, 꺼져 있으면 예시 값(그때는 로그아웃 단추도 없다). 요금제 · 폰트 수는 아직 예시.
 */
function AccountMenu() {
  const [open, setOpen] = useState(false)
  const [nickname, setNickname] = useState<string | null>(null)
  const holder = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (authGateMode() !== 'on') return
    void sessionUser().then((user) => setNickname(user?.nickname ?? null)).catch(() => undefined)
  }, [])
  // 바깥을 누르거나 Esc면 닫는다.
  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => { if (!holder.current?.contains(event.target as Node)) setOpen(false) }
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('pointerdown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('pointerdown', onPointer); document.removeEventListener('keydown', onKey) }
  }, [open])
  const id = nickname ?? 'hanim'
  return <div ref={holder} className={styles.account}>
    <button type="button" className={styles.avatar} aria-label="마이페이지" aria-expanded={open} onClick={() => setOpen((value) => !value)}><UserRound size={20} aria-hidden="true" /></button>
    {open && <div className={styles.accountPanel} role="dialog" aria-label="내 계정">
      <div className={styles.accountWho}>
        <span className={styles.accountMark} aria-hidden="true">{id.slice(0, 1).toUpperCase()}</span>
        <div><strong>{id}</strong><span>베타 참여자</span></div>
      </div>
      <dl className={styles.accountFacts}>
        <div><dt>요금제</dt><dd>베타 · 무료</dd></div>
        <div><dt>폰트</dt><dd>1 / 1개</dd></div>
        <div><dt>가입</dt><dd>2026. 9. 26.</dd></div>
      </dl>
      {authGateMode() === 'on' && <button type="button" className={styles.signOut} onClick={() => void signOutAndReload()}>로그아웃</button>}
    </div>}
  </div>
}

function SectionHead({ title, count, hint, onClick }: { title: string; count?: number; hint?: string; onClick?: () => void }) {
  return <button type="button" className={styles.sectionHead} onClick={onClick}>
    <h2>{title}</h2>
    {count !== undefined && <span>{count}</span>}
    {hint && <em>{hint}</em>}
    <ChevronRight size={18} aria-hidden="true" />
  </button>
}

type JamoType = 'choseong' | 'jungseong' | 'jongseong'
const JAMO_LABEL: Record<JamoType, string> = { choseong: '초성', jungseong: '중성', jongseong: '종성' }
const PREVIEW_COUNT = 4

/**
 * 자모 에디터(획 편집)로. 섹션 홈의 `편집 n`만 부른다. 도마를 그 자소들로 두고 첫 자소의 대표 글자를 그 자소 획 편집으로 연다.
 * 지금 홈 주소(묶기 포함)를 `returnTo`로 남겨 편집기 `‹`가 이 홈으로 돌아온다.
 */
const EDITOR_PART: Record<JamoType, 'CH' | 'JU' | 'JO'> = { choseong: 'CH', jungseong: 'JU', jongseong: 'JO' }
function openEditor(type: JamoType, chars: readonly string[]) {
  useWorkbenchStore.getState().place(type, chars, `${window.location.pathname}${window.location.search}`)
  navigate(`/workspace/jamo?char=${encodeURIComponent(workbenchSyllable(type, chars[0]))}&mode=stroke&part=${EDITOR_PART[type]}`)
}

/** 대시보드의 자소 줄. 앞 네 장만 보이고(손댄 것 우선은 다음), 머리(화살표)가 홈이다. 카드도 편집기로 바로 가지 않는다 — 그 자소 하나만 도마에 올려 홈으로. */
function JamoPreview({ type, chars }: { type: JamoType; chars: readonly string[] }) {
  return <ul className={styles.preview}>
    {chars.slice(0, PREVIEW_COUNT).map((char) => <li key={char}>
      <button type="button" className={styles.thumb} aria-label={`${char} 도마에 올리기`} onClick={() => { useWorkbenchStore.getState().place(type, [char]); navigate(`/dashboard/${type}`) }}>
        <Lazy className={styles.inkSmall}><AppGlyph char={char} size={52} upright /></Lazy>
      </button>
    </li>)}
  </ul>
}

/**
 * 섹션 홈의 묶기. 축 하나만 고른다 — 숨기지 않고 소제목으로 나눈다(전체 목록 원칙).
 * 묶는 기준은 편집이 퍼지는 단위에 가깝게: 줄기 계열(어휘사전) · 홑/쌍 · 우리 획 수.
 */
type Grouping = { id: string; label: string; groups: (chars: readonly string[], strokeCount: (char: string) => number) => { label: string | null; chars: string[] }[] }
const DOUBLE = new Set(['ㄲ', 'ㄸ', 'ㅃ', 'ㅆ', 'ㅉ'])
const WITH_BBICHIM = new Set(['ㄱ', 'ㄲ', 'ㅅ', 'ㅆ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ'])
const ROUND = new Set(['ㅇ', 'ㅎ'])
// `전체`도 소제목을 둔다 — 그래야 전체 선택이 된다. 중성은 묶기가 이것 하나다.
const ALL: Grouping = { id: 'all', label: '전체', groups: (chars) => [{ label: '전체', chars: [...chars] }] }
const BY_STEM: Grouping = {
  id: 'stem', label: '줄기', groups: (chars) => [
    { label: '가로 · 세로줄기만', chars: chars.filter((c) => !WITH_BBICHIM.has(c) && !ROUND.has(c)) },
    { label: '삐침 있음', chars: chars.filter((c) => WITH_BBICHIM.has(c)) },
    { label: '둥근줄기', chars: chars.filter((c) => ROUND.has(c)) },
  ].filter((group) => group.chars.length > 0),
}
const BY_DOUBLE: Grouping = {
  id: 'double', label: '홑 · 쌍', groups: (chars) => [
    { label: '홑자음', chars: chars.filter((c) => !DOUBLE.has(c)) },
    { label: '쌍자음', chars: chars.filter((c) => DOUBLE.has(c)) },
  ].filter((group) => group.chars.length > 0),
}
const BY_STROKES: Grouping = {
  id: 'strokes', label: '획 수', groups: (chars, strokeCount) => {
    const buckets = new Map<number, string[]>()
    for (const char of chars) {
      const n = strokeCount(char)
      buckets.set(n, [...(buckets.get(n) ?? []), char])
    }
    return [...buckets.entries()].sort(([a], [b]) => a - b).map(([n, list]) => ({ label: `${n}획`, chars: list }))
  },
}
// 종성. 쌍받침은 ㄲ ㅆ 둘뿐이고, 홑 · 쌍을 합치면 초성에도 있는 자음 — 겹받침만 초성에 없다.
const DOUBLE_FINAL = new Set(['ㄲ', 'ㅆ'])
const CLUSTER_FINAL: Record<string, string> = { 'ㄳ': 'ㄱ', 'ㄵ': 'ㄴ', 'ㄶ': 'ㄴ', 'ㄺ': 'ㄹ', 'ㄻ': 'ㄹ', 'ㄼ': 'ㄹ', 'ㄽ': 'ㄹ', 'ㄾ': 'ㄹ', 'ㄿ': 'ㄹ', 'ㅀ': 'ㄹ', 'ㅄ': 'ㅂ' }
const BY_FINAL_KIND: Grouping = {
  id: 'kind', label: '홑 · 쌍 · 겹', groups: (chars) => [
    { label: '홑받침', chars: chars.filter((c) => !DOUBLE_FINAL.has(c) && !CLUSTER_FINAL[c]) },
    { label: '쌍받침', chars: chars.filter((c) => DOUBLE_FINAL.has(c)) },
    { label: '겹받침', chars: chars.filter((c) => CLUSTER_FINAL[c]) },
  ].filter((group) => group.chars.length > 0),
}
// 겹받침은 앞 자음(왼쪽 반)이 같은 것끼리. 겹받침 아닌 것도 한 칸에 둬야 전체 선택이 빠짐없다.
const BY_CLUSTER_HEAD: Grouping = {
  id: 'head', label: '겹받침 앞 자음', groups: (chars) => {
    const heads = [...new Set(chars.map((c) => CLUSTER_FINAL[c]).filter(Boolean))]
    return [
      ...heads.map((head) => ({ label: `${head} 겹받침`, chars: chars.filter((c) => CLUSTER_FINAL[c] === head) })),
      { label: '홑 · 쌍받침', chars: chars.filter((c) => !CLUSTER_FINAL[c]) },
    ].filter((group) => group.chars.length > 0)
  },
}
const GROUPINGS: Record<JamoType, Grouping[]> = {
  choseong: [ALL, BY_STEM, BY_DOUBLE, BY_STROKES],
  jungseong: [ALL],
  jongseong: [ALL, BY_FINAL_KIND, BY_CLUSTER_HEAD, BY_STROKES],
}

const HOME_COLUMNS = 4
const HOME_GAP = 6
const HOME_PAD = 12
const GROUP_HEAD = 44
const GROUP_GAP = 28

/**
 * 섹션 홈 페이지(`/dashboard/choseong` · `jungseong` · `jongseong`). 위는 뒤로 · 제목, 그 아래 묶기 칩 한 줄, 그 아래 4열 판.
 * 묶기는 주소 `?group=`에 둔다 — 새로고침 · 편집기에서 `‹`로 돌아와도 남는다. 칩을 바꿀 땐 기록을 쌓지 않고 주소만 고친다.
 * 카드 19장은 한 번만 만들고(key = 글자) 묶기가 바뀌면 자리만 옮긴다 — 절대좌표 + transform 전환이라 글자를 다시 그리지 않는다.
 * 카드 탭 = 도마에 담기 · 빼기, 소제목 = 전체 선택 체크(더하기 · 그 묶음만 빼기, 전부 담겼을 때만 ✔),
 * 아래 칩 탭 = 빼기, 휴지통 = 비우기, `편집 n` = 도마를 들고 편집기로. 담기 · 빼기는 여기서만 한다.
 */
function JamoHome({ type, chars }: { type: JamoType; chars: readonly string[] }) {
  const jamos = useJamoStore((state) => state[type])
  const benchType = useWorkbenchStore((state) => state.type)
  const benchChars = useWorkbenchStore((state) => state.chars)
  const add = useWorkbenchStore((state) => state.add)
  const remove = useWorkbenchStore((state) => state.remove)
  const clear = useWorkbenchStore((state) => state.clear)
  const toggle = useWorkbenchStore((state) => state.toggle)
  const onBench = (char: string) => benchType === type && benchChars.includes(char)
  const benchCount = benchType === type ? benchChars.length : 0
  const strokeCount = (char: string) => {
    const jamo = jamos[char]
    return jamo ? (jamo.strokes?.length ?? 0) + (jamo.horizontalStrokes?.length ?? 0) + (jamo.verticalStrokes?.length ?? 0) : 0
  }
  const groupings = GROUPINGS[type]
  const [groupingId, setGroupingIdState] = useState(() => new URLSearchParams(window.location.search).get('group') ?? groupings[0].id)
  const setGroupingId = (id: string) => {
    setGroupingIdState(id)
    const url = new URL(window.location.href)
    if (id === groupings[0].id) url.searchParams.delete('group')
    else url.searchParams.set('group', id)
    window.history.replaceState(window.history.state, '', url)
  }
  const grouping = groupings.find((g) => g.id === groupingId) ?? groupings[0]
  const groups = useMemo(() => grouping.groups(chars, strokeCount), [grouping, chars, jamos]) // eslint-disable-line react-hooks/exhaustive-deps

  // 판 너비에서 칸 크기를 잰다. 글자마다 (x, y)를 계산해 transform으로 놓는다.
  const board = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(0)
  useLayoutEffect(() => {
    const element = board.current
    if (!element) return
    const measure = () => setWidth(element.clientWidth)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  // 도마 칩 줄은 쌓이며 높이가 바뀐다. 안쪽 높이를 재서 바깥에 px로 준다 — auto는 전환이 안 먹는다.
  const benchInner = useRef<HTMLDivElement>(null)
  const [benchHeight, setBenchHeight] = useState<number | null>(null)
  useLayoutEffect(() => {
    const element = benchInner.current
    if (!element) return
    const measure = () => setBenchHeight(element.offsetHeight)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  // 칩 움직임. 새 칩은 차례로 떠오르고, 자리가 바뀐 칩은 옛 자리에서 미끄러져 온다(FLIP). 높이 전환과 같은 박자.
  // 홈에 들어올 때 이미 담긴 칩은 가만히 둔다.
  const chipSpots = useRef<Map<string, { x: number; y: number }> | null>(null)
  useLayoutEffect(() => {
    const root = benchInner.current
    if (!root) return
    const still = chipSpots.current === null || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const spots = new Map<string, { x: number; y: number }>()
    let fresh = 0
    root.querySelectorAll<HTMLElement>('[data-chip]').forEach((chip) => {
      const spot = { x: chip.offsetLeft, y: chip.offsetTop }
      spots.set(chip.dataset.chip!, spot)
      if (still) return
      const before = chipSpots.current?.get(chip.dataset.chip!)
      if (!before) chip.animate([{ opacity: 0, transform: 'translateY(8px) scale(0.7)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: Math.min(fresh++, 12) * 18, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'backwards' })
      else if (before.x !== spot.x || before.y !== spot.y) chip.animate([{ transform: `translate(${before.x - spot.x}px, ${before.y - spot.y}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
    })
    chipSpots.current = spots
  }, [benchChars, benchType])
  const cell = width > 0 ? (width - HOME_PAD * 2 - HOME_GAP * (HOME_COLUMNS - 1)) / HOME_COLUMNS : 0
  const layout = useMemo(() => {
    const cards = new Map<string, { x: number; y: number }>()
    const heads: { label: string; y: number }[] = []
    let y = 0
    for (const group of groups) {
      if (group.label) { heads.push({ label: group.label, y }); y += GROUP_HEAD }
      group.chars.forEach((char, index) => {
        cards.set(char, { x: HOME_PAD + (index % HOME_COLUMNS) * (cell + HOME_GAP), y: y + Math.floor(index / HOME_COLUMNS) * (cell + HOME_GAP) })
      })
      y += Math.ceil(group.chars.length / HOME_COLUMNS) * (cell + HOME_GAP) - HOME_GAP + GROUP_GAP
    }
    return { cards, heads, height: Math.max(0, y - GROUP_GAP) }
  }, [groups, cell])

  return <div className={styles.home} data-testid="jamo-home" data-type={type}>
    <header className={styles.homeHead}>
      <button type="button" className={styles.back} aria-label="대시보드" onClick={() => navigate('/dashboard')}><ChevronLeft size={22} aria-hidden="true" /></button>
      <h2>{JAMO_LABEL[type]}</h2>
      <span>{chars.length}</span>
    </header>
    <div className={styles.homeScroll}>
      {groupings.length > 1 && <div className={styles.chips} role="tablist" aria-label="묶기">
        {groupings.map((g) => <button key={g.id} type="button" role="tab" aria-selected={g.id === grouping.id} onClick={() => setGroupingId(g.id)}>{g.label}</button>)}
      </div>}
      <div ref={board} className={styles.board} style={{ height: layout.height }}>
        {layout.heads.map(({ label, y }) => {
          const group = groups.find((g) => g.label === label)
          const whole = group ? group.chars.every(onBench) : false
          return <button key={label} type="button" className={styles.groupHead} style={{ transform: `translateY(${y}px)` }} role="checkbox" aria-checked={whole} onClick={() => group && (whole ? remove : add)(type, group.chars)}><span className={styles.check} aria-hidden="true"><Check size={14} strokeWidth={3} /></span>{label}</button>
        })}
        {cell > 0 && chars.map((char) => {
          const at = layout.cards.get(char)
          return <button key={char} type="button" className={styles.homeCard} style={{ width: cell, height: cell, transform: at ? `translate(${at.x}px, ${at.y}px)` : undefined }} aria-label={`${char} 도마에 ${onBench(char) ? '빼기' : '담기'}`} aria-pressed={onBench(char)} onClick={() => toggle(type, char)}>
            <span className={styles.inkSmall}><AppGlyph char={char} size={52} upright /></span>
          </button>
        })}
      </div>
    </div>
    {/* 도마 상태 · 편집 입구. 길어지면 칩이 줄바꿈으로 쌓이고, 단추는 오른쪽 아래에 붙는다. 도마가 비면 단추도 잠긴다. */}
    <footer className={styles.bench}>
      <div className={styles.benchChips} style={benchHeight === null ? undefined : { height: benchHeight }}><div ref={benchInner} aria-label="도마">
        {benchCount === 0 ? <em>카드나 묶음을 눌러 도마에 올리세요</em> : benchChars.map((char) => <button key={char} type="button" data-chip={char} aria-label={`${char} 도마에서 빼기`} onClick={() => toggle(type, char)}>{char}</button>)}
      </div></div>
      {benchCount > 0 && <button type="button" className={styles.benchClear} aria-label="도마 비우기" onClick={clear}><Trash2 size={18} aria-hidden="true" /></button>}
      <button type="button" className={styles.benchGo} disabled={benchCount === 0} onClick={() => openEditor(type, benchChars)}>편집 {benchCount}</button>
    </footer>
  </div>
}

export function DashboardLabPage() {
  const name = useUIStore((state) => state.currentProjectName) ?? '내 폰트'
  const style = useGlobalStyleStore((state) => state.style)
  const isJamoModified = useJamoStore((state) => state.isJamoModified)
  const count = (type: JamoType, chars: readonly string[]) => chars.filter((c) => isJamoModified(type, c)).length
  const modifiedBy = { choseong: count('choseong', CHOSEONG_LIST), jungseong: count('jungseong', JUNGSEONG_LIST), jongseong: count('jongseong', FINALS) }
  const modified = modifiedBy.choseong + modifiedBy.jungseong + modifiedBy.jongseong
  const roundness = Math.round((style.strokeStyle?.mode === 'brush' ? style.strokeStyle.roundness ?? 0 : 0) * 100)

  const [activeCard, setActiveCard] = useState(0)
  // 카드 이름 줄이 머리 뒤로 들어가면 머리 제목이 `내 폰트`에서 폰트 이름으로 바뀐다. 카드에서 바꾼 이름도 따라간다.
  const [renamed, setRenamed] = useState<string | null>(null)
  const [compact, setCompact] = useState(false)
  const carousel = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState<SectionId>('style')
  const scroller = useRef<HTMLDivElement>(null)
  const sections = useRef<Partial<Record<SectionId, HTMLElement | null>>>({})

  // 스크롤 위치에서 지금 섹션을 고른다 — 화면 40% 지점을 덮는 섹션. 머리선 기준이면 긴 섹션이 다음 머리를 지나서도 켜져 있다.
  const onScroll = () => {
    const root = scroller.current
    if (!root) return
    const line = root.offsetTop + root.scrollTop + root.clientHeight * 0.4
    let current: SectionId = 'style'
    for (const { id } of SECTIONS) {
      const element = sections.current[id]
      if (element && element.offsetTop <= line) current = id
    }
    setActive(current)
    const nameRow = carousel.current?.querySelector('article header')
    if (nameRow) setCompact(nameRow.getBoundingClientRect().bottom <= root.getBoundingClientRect().top)
  }
  const jump = (id: SectionId) => {
    const root = scroller.current
    const element = sections.current[id]
    if (!root || !element) return
    root.scrollTo({ top: element.offsetTop - root.offsetTop, behavior: 'smooth' })
  }
  const onCarousel = (event: React.UIEvent<HTMLDivElement>) => {
    const track = event.currentTarget
    const width = track.firstElementChild?.clientWidth ?? 1
    setActiveCard(Math.round(track.scrollLeft / (width + 10)))
  }

  return <main className={styles.page}>
    <div className={styles.shell}>
      <header className={styles.head}>
        {/* 제목 둘을 한 칸에 겹쳐 두고 흐리게 바꾼다. 폰트 이름을 누르면 맨 위 카드로 올라간다. */}
        <h1 className={styles.title} data-compact={compact || undefined}>
          <span aria-hidden={compact || undefined}>내 폰트</span>
          <button type="button" className={styles.titleName} aria-hidden={!compact || undefined} tabIndex={compact ? 0 : -1} onClick={() => scroller.current?.scrollTo({ top: 0, behavior: 'smooth' })}>{renamed ?? name}</button>
        </h1>
        <AccountMenu />
      </header>

      <div ref={scroller} className={styles.scroll} onScroll={onScroll}>
        {/* 폰트 카드. 옆으로 밀면 활성 폰트가 바뀌고 아래 전부가 그 폰트로 바뀐다. 카드 자체는 문이 아니다. */}
        <div ref={carousel} className={styles.carousel} onScroll={onCarousel}>
          <FontCard name={name} note={modified > 0 ? '마지막 고침 · 오늘' : '마지막 고침 · 오늘 · 프리셋 그대로'} active={activeCard === 0} onRenamed={setRenamed} />
          {/* 폰트 목록 · 새로 만들기는 `내 폰트`(`/fonts`)가 한다. 다른 마운트라 진짜 이동 — 못 올린 변경은 먼저 올린다. */}
          <button type="button" className={styles.add} aria-label="새 폰트 만들기 · 내 폰트 목록" data-testid="dashboard-font-list" onClick={() => void flushAccountFont().then(() => window.location.assign('/fonts'))}><Plus size={22} /><span>새 폰트</span></button>
        </div>

        <div className={styles.body}>
          <nav className={styles.rail} aria-label="목차">
            {SECTIONS.map(({ id, label }) => <button key={id} type="button" aria-current={active === id ? 'true' : undefined} onClick={() => jump(id)}>{label}</button>)}
            {/* 검수는 섹션이 아니라 다른 화면(격자). 틈을 두고 따로. */}
            <button type="button" className={styles.railLink}><ScanSearch size={16} aria-hidden="true" />검수</button>
          </nav>

          <div className={styles.content}>
            <section ref={(el) => { sections.current.style = el }}>
              <SectionHead title="스타일" hint="이 폰트 전체" />
              <ul className={styles.tiles}>
                <li><span className={styles.picto}><StylePicto kind="weight" /></span><em>굵기</em><strong>{style.weight}</strong></li>
                <li><span className={styles.picto}><StylePicto kind="slant" /></span><em>기울기</em><strong>{style.slant}°</strong></li>
                <li><span className={styles.picto}><StylePicto kind="roundness" /></span><em>둥글기</em><strong>{roundness}%</strong></li>
                <li><span className={styles.picto}><StylePicto kind="beak" /></span><em>부리</em><strong>{style.stemBeak?.enabled ? '있음' : '없음'}</strong></li>
              </ul>
            </section>

            <section ref={(el) => { sections.current.layout = el }}>
              <SectionHead title="레이아웃" count={6} />
              <ul className={styles.grid}>
                {LAYOUT_SAMPLES.map((char) => <li key={char}>
                  <button type="button" className={styles.thumb} aria-label={`${char} 레이아웃`}>
                    <Lazy className={styles.ink}><LayoutThumb char={char} size={72} /></Lazy>
                  </button>
                </li>)}
              </ul>
            </section>

            {/* 초·중·종은 요약 줄만. 전체 격자와 묶기는 섹션 홈으로 갔다. 레이아웃 6장은 여기서 바로 에디터로. */}
            <section ref={(el) => { sections.current.choseong = el }}>
              <SectionHead title="초성" count={CHOSEONG_LIST.length} onClick={() => navigate('/dashboard/choseong')} />
              <JamoPreview type="choseong" chars={CHOSEONG_LIST} />
            </section>
            <section ref={(el) => { sections.current.jungseong = el }}>
              <SectionHead title="중성" count={JUNGSEONG_LIST.length} onClick={() => navigate('/dashboard/jungseong')} />
              <JamoPreview type="jungseong" chars={JUNGSEONG_LIST} />
            </section>
            <section ref={(el) => { sections.current.jongseong = el }}>
              <SectionHead title="종성" count={FINALS.length} onClick={() => navigate('/dashboard/jongseong')} />
              <JamoPreview type="jongseong" chars={FINALS} />
            </section>
          </div>
        </div>
      </div>
    </div>
  </main>
}

const JAMO_CHARS: Record<JamoType, readonly string[]> = { choseong: CHOSEONG_LIST, jungseong: JUNGSEONG_LIST, jongseong: FINALS }

/** 섹션 홈 주소(`/dashboard/<종류>`). 모르는 종류면 대시보드로 넘긴다. */
export function JamoHomePage() {
  const type = window.location.pathname.split('/')[2] as JamoType
  const known = type in JAMO_CHARS
  useEffect(() => { if (!known) navigate('/dashboard', { replace: true }) }, [known])
  if (!known) return null
  return <main className={styles.page}>
    <div className={styles.shell}>
      <JamoHome type={type} chars={JAMO_CHARS[type]} />
    </div>
  </main>
}
