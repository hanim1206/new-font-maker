import { useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Check, ChevronDown, ChevronLeft, ChevronRight, Copy, Download, Ellipsis, PencilLine, Plus, ScanSearch, Trash2, UserRound } from 'lucide-react'
import { CHOSEONG_LIST, JONGSEONG_LIST, JUNGSEONG_LIST } from '../src/data/Hangul'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { useEffectiveGlobalStyle, useGlobalStyleStore } from '../src/stores/globalStyleStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { useLayoutStore } from '../src/stores/layoutStore'
import { useUIStore } from '../src/stores/uiStore'
import { useWorkbenchStore, workbenchSyllable } from '../src/stores/workbenchStore'
import { groupMatching, sameChars, useJamoGroupStore, type JamoGroup } from '../src/stores/jamoGroupStore'
import type { LayoutSchema, Padding, Part } from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { AppGlyph } from './AppGlyph'
import { editedDayText, FONT_LIMIT, nextFontName } from './accountFont'
import { deleteFont, listFonts, renameFont } from './accountFontApi'
import type { FontSummary } from './accountFontApi'
import { accountFontSession, renamedAccountFont } from './accountFontSync'
import { showAppNotice } from './appNotice'
import { leaveDeletedFont, openFont, openNewFont } from './fontSwitch'
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
 * 홀자 · 받침 카드. 단독 상자는 정사각에 가까워 ㅏ가 옆으로 퍼지고 받침은 좁아진다 — 대표 글자(아 · 오 · 와 / 악 · 앙) 속 그 자소만 꺼내 그린다.
 * 창은 1em 그대로 그 자소 상자 가운데에 맞춘다. 그래서 글자 속 가로세로 비율과 크기가 그대로 보인다.
 */
const SHOWN_PARTS = { jungseong: ['JU', 'JU_H', 'JU_V'], jongseong: ['JO'] } as const satisfies Record<'jungseong' | 'jongseong', readonly Part[]>
const HIDDEN_PARTS = { jungseong: { CH: { hidden: true }, JO: { hidden: true } }, jongseong: { CH: { hidden: true }, JU: { hidden: true }, JU_H: { hidden: true }, JU_V: { hidden: true } } } as const
function InSyllableGlyph({ type, char, size }: { type: 'jungseong' | 'jongseong'; char: string; size: number }) {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const syllable = useMemo(() => decomposeSyllable(workbenchSyllable(type, char), choseong, jungseong, jongseong), [type, char, choseong, jungseong, jongseong])
  const effectiveStyle = useEffectiveGlobalStyle(syllable.layoutType)
  const globalStyle = useMemo(() => ({ ...effectiveStyle, slant: 0 }), [effectiveStyle])
  const schema = withEffectivePadding(schemas[syllable.layoutType], globalPadding, paddingOverrides[syllable.layoutType])
  const { placement } = useContextPlacement(syllable, schema, globalStyle)
  const boxes = placement.kind === 'boxes' ? SHOWN_PARTS[type].map((part: Part) => placement.boxes[part]).filter((box) => !!box) : []
  const viewportBox = boxes.length > 0 ? (() => {
    const left = Math.min(...boxes.map((box) => box.x))
    const top = Math.min(...boxes.map((box) => box.y))
    const right = Math.max(...boxes.map((box) => box.x + box.width))
    const bottom = Math.max(...boxes.map((box) => box.y + box.height))
    return { x: (left + right) / 2 - 0.5, y: (top + bottom) / 2 - 0.5, width: 1, height: 1 }
  })() : undefined
  return <SvgRenderer
    syllable={syllable}
    schema={placement.kind === 'schema' ? placement.schema : undefined}
    boxes={placement.kind === 'boxes' ? placement.boxes : undefined}
    size={size}
    globalStyle={globalStyle}
    viewportBox={viewportBox}
    partStyles={HIDDEN_PARTS[type]}
    overflow="visible"
    clipGlyphs={false}
  />
}

/** 자소 카드 잉크. 첫닿자는 단독으로, 홀자 · 받침은 글자 속 비율로. */
function JamoGlyph({ type, char, size }: { type: JamoType; char: string; size: number }) {
  return type === 'choseong' ? <AppGlyph char={char} size={size} upright /> : <InSyllableGlyph type={type} char={char} size={size} />
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

/**
 * 지금 폰트 카드. 이름은 머리 알약에 있어 여기선 마지막 고침과 예시 문장만.
 * 버튼은 둘: `…`(이름 바꾸기 · 복제 · 삭제) · 다운로드. 이름 바꾸기는 카드 맨 위 줄이 잠깐 입력칸이 된다.
 */
function FontCard({ name, note, onRename, onDelete }: {
  name: string
  note: string
  onRename: (name: string) => void
  /** 없으면(계정 폰트를 안 연 랩 화면) 삭제를 흐리게. */
  onDelete?: () => void
}) {
  // 추출 버튼은 원형 아이콘. 탭하면 색이 바뀌며 옆으로 자라 `다운로드`가 들어온다(시안에서는 다시 탭하면 돌아간다).
  const [armed, setArmed] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const commit = (value: string) => {
    setRenaming(false)
    const next = value.trim()
    if (next && next !== name) onRename(next)
  }
  return <article className={styles.card}>
    <header>
      {renaming
        ? <input className={styles.nameInput} defaultValue={name} aria-label="폰트 이름" autoFocus maxLength={40}
          onFocus={(event) => event.currentTarget.select()}
          onBlur={(event) => commit(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') event.currentTarget.blur()
            if (event.key === 'Escape') setRenaming(false)
          }} />
        : <><strong>{name}</strong><span>{note}</span></>}
    </header>
    <p className={styles.sentence} aria-label={SENTENCE}>
      {SENTENCE.split(' ').map((word, index) => <span key={index} className={styles.word}>
        {[...word].map((char, at) => isHangul(char) ? <AppGlyph key={at} char={char} size={34} /> : <span key={at}>{char}</span>)}
      </span>)}
    </p>
    {/* 추출은 폰트의 속성 — 워크스페이스 폰트 탭과 같은 버튼을 카드 안에. 화면 하단엔 두지 않는다. */}
    <footer>
      <FontCardMenu label="더보기" onRename={() => setRenaming(true)} onDelete={onDelete} />
      <button type="button" className={styles.download} data-armed={armed || undefined} aria-label="다운로드" onClick={() => setArmed((value) => !value)}><Download size={18} aria-hidden="true" /><span>다운로드</span></button>
    </footer>
  </article>
}

/**
 * 폰트 카드의 `…` 메뉴. 스크롤 영역에서 잘리지 않게 버튼 자리를 재서 화면에 고정해 띄운다.
 * 바깥 탭 · Esc · 스크롤이면 닫힌다. 복제는 아직 없어 흐리게, 삭제는 메뉴 안에서 한 번 더 묻는다.
 */
const MENU_WIDTH = 200

function FontCardMenu({ label, onRename, onDelete }: { label: string; onRename: () => void; onDelete?: () => void }) {
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
    <button ref={button} type="button" className={styles.more} aria-label={label} aria-haspopup="menu" aria-expanded={!!anchor} onClick={toggle}><Ellipsis size={18} aria-hidden="true" /></button>
    {anchor && <div ref={panel} className={styles.cardMenu} role="menu" style={{ left: anchor.left, top: anchor.top }}>
      {confirming
        ? <div className={styles.cardMenuConfirm}>
          <p>이 폰트를 지울까요? 되돌릴 수 없어요.</p>
          <div>
            <button type="button" onClick={() => setConfirming(false)}>취소</button>
            <button type="button" data-danger data-testid="dashboard-font-delete-confirm" onClick={() => { close(); onDelete?.() }}>삭제</button>
          </div>
        </div>
        : <>
          <button type="button" role="menuitem" onClick={() => { close(); onRename() }}><PencilLine size={16} aria-hidden="true" />이름 바꾸기</button>
          <button type="button" role="menuitem" disabled><Copy size={16} aria-hidden="true" />복제</button>
          <button type="button" role="menuitem" data-danger disabled={!onDelete} data-testid="dashboard-font-delete" onClick={() => setConfirming(true)}><Trash2 size={16} aria-hidden="true" />삭제</button>
        </>}
    </div>}
  </>
}

/**
 * 머리 오른쪽 마이페이지. 아이콘 하나, 누르면 아래로 계정 카드 — 아이디 · 요금제 · 폰트 수, 맨 아래 로그아웃.
 * 게이트가 켜져 있으면 실제 친구 아이디를 읽고, 꺼져 있으면 예시 값(그때는 로그아웃 단추도 없다). 요금제는 아직 예시.
 */
function AccountMenu({ fontCount }: { fontCount: number | null }) {
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
        <div><dt>폰트</dt><dd>{fontCount ?? '–'} / {FONT_LIMIT}개</dd></div>
        <div><dt>가입</dt><dd>2026. 9. 26.</dd></div>
      </dl>
      {authGateMode() === 'on' && <button type="button" className={styles.signOut} onClick={() => void signOutAndReload()}>로그아웃</button>}
    </div>}
  </div>
}

function SectionHead({ title, count, hint, onClick, testId }: { title: string; count?: number; hint?: string; onClick?: () => void; testId?: string }) {
  return <button type="button" className={styles.sectionHead} onClick={onClick} data-testid={testId}>
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
        <Lazy className={styles.inkSmall}><JamoGlyph type={type} char={char} size={52} /></Lazy>
      </button>
    </li>)}
  </ul>
}

/**
 * 섹션 홈의 묶기. 축 하나만 고른다. 그 기준에 해당하는 것만 소제목으로 나누고, 해당 없는 글자는 숨긴다
 * (`해당 없음` 묶음을 억지로 만들지 않는다 — 전부 보려면 `전체`).
 * 묶는 기준은 편집이 퍼지는 단위에 가깝게: 줄기 계열(어휘사전) · 홑/쌍 · 우리 획 수.
 */
type Grouping = { id: string; label: string; groups: (chars: readonly string[], strokeCount: (char: string) => number) => { id?: string; label: string | null; chars: string[] }[] }
const DOUBLE = new Set(['ㄲ', 'ㄸ', 'ㅃ', 'ㅆ', 'ㅉ'])
const WITH_BBICHIM = new Set(['ㄱ', 'ㄲ', 'ㅅ', 'ㅆ', 'ㅈ', 'ㅉ', 'ㅊ', 'ㅋ'])
const ROUND = new Set(['ㅇ', 'ㅎ'])
// `전체`도 소제목을 둔다 — 그래야 전체 선택이 된다.
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
// 겹받침은 앞 자음(왼쪽 반)이 같은 것끼리. 홑 · 쌍받침은 숨긴다.
const BY_CLUSTER_HEAD: Grouping = {
  id: 'head', label: '겹받침 앞 자음', groups: (chars) => {
    const heads = [...new Set(chars.map((c) => CLUSTER_FINAL[c]).filter(Boolean))]
    return heads.map((head) => ({ label: `${head} 겹받침`, chars: chars.filter((c) => CLUSTER_FINAL[c] === head) }))
  },
}
// 중성. 곁줄기가 뻗는 쪽 — 모양이 닮은 것끼리 모인다. 섞임홀자는 가로 쪽(ㅗ · ㅜ)으로 묶고, ㅢ는 `없음`에 둔다.
const BY_SIDE_STEM: Grouping = {
  id: 'side', label: '곁줄기 방향', groups: (chars) => [
    { label: '오른쪽', members: 'ㅏㅐㅑㅒ' },
    { label: '왼쪽', members: 'ㅓㅔㅕㅖ' },
    { label: '위', members: 'ㅗㅛ' },
    { label: '아래', members: 'ㅜㅠ' },
    { label: 'ㅗ 섞임', members: 'ㅘㅙㅚ' },
    { label: 'ㅜ 섞임', members: 'ㅝㅞㅟ' },
    { label: '곁줄기 없음', members: 'ㅡㅣㅢ' },
  ].map(({ label, members }) => ({ label, chars: chars.filter((c) => members.includes(c)) })).filter((group) => group.chars.length > 0),
}
// 중성. 레이아웃 6칸과 같은 말 — 세로 · 가로 · 섞임홀자.
const BY_MEDIAL_KIND: Grouping = {
  id: 'kind', label: '홀자', groups: (chars) => [
    { label: '세로홀자', members: 'ㅏㅐㅑㅒㅓㅔㅕㅖㅣ' },
    { label: '가로홀자', members: 'ㅗㅛㅜㅠㅡ' },
    { label: '섞임홀자', members: 'ㅘㅙㅚㅝㅞㅟㅢ' },
  ].map(({ label, members }) => ({ label, chars: chars.filter((c) => members.includes(c)) })).filter((group) => group.chars.length > 0),
}
const GROUPINGS: Record<JamoType, Grouping[]> = {
  choseong: [ALL, BY_STEM, BY_DOUBLE, BY_STROKES],
  jungseong: [ALL, BY_MEDIAL_KIND, BY_SIDE_STEM, BY_STROKES],
  jongseong: [ALL, BY_FINAL_KIND, BY_CLUSTER_HEAD, BY_STROKES],
}
// 칩을 안 골랐을 때. 중성은 홀자(레이아웃 6칸과 같은 말), 종성은 홑 · 쌍 · 겹이 `전체`보다 먼저 쓸모 있다.
const DEFAULT_GROUPING: Record<JamoType, string> = { choseong: 'all', jungseong: 'kind', jongseong: 'kind' }

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
 * 아래 칩 탭 = 빼기, 휴지통 = 비우기, `n개 고치기` = 도마를 들고 편집기로. 담기 · 빼기는 여기서만 한다.
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
  // 사용자 묶음은 맨 뒤 `내 묶음` 칩 하나에 소제목으로 쌓인다. 한 글자가 여러 묶음에 들 수 있다(판에 카드가 겹쳐 놓인다).
  const userGroups = useJamoGroupStore((state) => state.groups)
  const mine = useMemo(() => userGroups.filter((group) => group.type === type), [userGroups, type])
  const groupings = useMemo(() => {
    const base = GROUPINGS[type]
    if (!mine.length) return base
    const MINE: Grouping = { id: 'mine', label: '내 묶음', groups: () => mine.map((group) => ({ id: group.id, label: group.name, chars: group.chars })) }
    return [...base, MINE]
  }, [type, mine])
  const benchGroup = groupMatching(mine, benchType, benchChars)
  const [sheet, setSheet] = useState<{ kind: 'create' } | { kind: 'edit'; id: string } | null>(null)
  const [toast, setToast] = useState<{ text: string; undo: () => void } | null>(null)
  useEffect(() => {
    if (!toast) return
    const timer = window.setTimeout(() => setToast(null), 4000)
    return () => window.clearTimeout(timer)
  }, [toast])
  const defaultGrouping = groupings.find((g) => g.id === DEFAULT_GROUPING[type]) ?? groupings[0]
  const [groupingId, setGroupingIdState] = useState(() => new URLSearchParams(window.location.search).get('group') ?? defaultGrouping.id)
  const setGroupingId = (id: string) => {
    setGroupingIdState(id)
    const url = new URL(window.location.href)
    if (id === defaultGrouping.id) url.searchParams.delete('group')
    else url.searchParams.set('group', id)
    window.history.replaceState(window.history.state, '', url)
  }
  const grouping = groupings.find((g) => g.id === groupingId) ?? defaultGrouping
  const groups = useMemo(() => grouping.groups(chars, strokeCount), [grouping, chars, jamos]) // eslint-disable-line react-hooks/exhaustive-deps
  const saveGroup = (name: string, members: readonly string[]) => {
    useJamoGroupStore.getState().create(type, name, members)
    setSheet(null)
    setGroupingId('mine')
  }
  const deleteGroup = (id: string) => {
    const removed = useJamoGroupStore.getState().remove(id)
    setSheet(null)
    if (removed) setToast({ text: `「${removed.group.name}」 묶음을 지웠어요`, undo: () => useJamoGroupStore.getState().restore(removed.group, removed.index) })
  }

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
  // 도마 칩 줄은 한 줄 가로 스크롤. 오른쪽에 가려진 칩이 있으면 끝을 흐린다.
  const benchInner = useRef<HTMLDivElement>(null)
  const [benchMore, setBenchMore] = useState(false)
  useLayoutEffect(() => {
    const scroller = benchInner.current?.parentElement
    if (!scroller) return
    const measure = () => setBenchMore(scroller.scrollLeft + scroller.clientWidth < scroller.scrollWidth - 1)
    measure()
    scroller.addEventListener('scroll', measure, { passive: true })
    const observer = new ResizeObserver(measure)
    observer.observe(scroller)
    observer.observe(benchInner.current!)
    return () => { scroller.removeEventListener('scroll', measure); observer.disconnect() }
  }, [])
  // 칩 움직임. 새 칩은 차례로 떠오르고, 자리가 바뀐 칩은 옛 자리에서 미끄러져 온다(FLIP).
  // 카드 하나를 담아 새 칩이 줄 밖에 붙으면 거기까지 스크롤한다. 묶음으로 여럿 담을 땐 제자리. 홈에 들어올 때 이미 담긴 칩은 가만히 둔다.
  const chipSpots = useRef<Map<string, { x: number; y: number }> | null>(null)
  useLayoutEffect(() => {
    const root = benchInner.current
    if (!root) return
    const still = chipSpots.current === null || window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const spots = new Map<string, { x: number; y: number }>()
    let fresh = 0
    let reach = 0
    let added = 0
    root.querySelectorAll<HTMLElement>('[data-chip]').forEach((chip) => {
      const spot = { x: chip.offsetLeft, y: chip.offsetTop }
      spots.set(chip.dataset.chip!, spot)
      if (chipSpots.current !== null && !chipSpots.current.has(chip.dataset.chip!) && chip.dataset.chip !== '__group') { added += 1; reach = chip.offsetLeft + chip.offsetWidth }
      if (still) return
      const before = chipSpots.current?.get(chip.dataset.chip!)
      if (!before) chip.animate([{ opacity: 0, transform: 'translateY(8px) scale(0.7)' }, { opacity: 1, transform: 'none' }], { duration: 260, delay: Math.min(fresh++, 12) * 18, easing: 'cubic-bezier(0.2, 0, 0, 1)', fill: 'backwards' })
      else if (before.x !== spot.x || before.y !== spot.y) chip.animate([{ transform: `translate(${before.x - spot.x}px, ${before.y - spot.y}px)` }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.2, 0, 0, 1)' })
    })
    chipSpots.current = spots
    const scroller = root.parentElement
    if (scroller && added === 1 && reach > scroller.scrollLeft + scroller.clientWidth) scroller.scrollTo({ left: reach - scroller.clientWidth, behavior: still ? 'auto' : 'smooth' })
  }, [benchChars, benchType])
  const cell = width > 0 ? (width - HOME_PAD * 2 - HOME_GAP * (HOME_COLUMNS - 1)) / HOME_COLUMNS : 0
  const layout = useMemo(() => {
    const cards = new Map<string, { x: number; y: number }>()
    // 사용자 묶음끼리 겹친 글자는 두 번째 자리부터 카드를 하나 더 놓는다. 담기 · 빼기는 같은 글자라 같이 켜진다.
    const extras: { key: string; char: string; x: number; y: number }[] = []
    const heads: { key: string; group: (typeof groups)[number]; y: number }[] = []
    let y = 0
    for (const group of groups) {
      const key = group.id ?? group.label ?? ''
      if (group.label) { heads.push({ key, group, y }); y += GROUP_HEAD }
      group.chars.forEach((char, index) => {
        const at = { x: HOME_PAD + (index % HOME_COLUMNS) * (cell + HOME_GAP), y: y + Math.floor(index / HOME_COLUMNS) * (cell + HOME_GAP) }
        if (cards.has(char)) extras.push({ key: `${key}:${char}`, char, ...at })
        else cards.set(char, at)
      })
      y += Math.ceil(group.chars.length / HOME_COLUMNS) * (cell + HOME_GAP) - HOME_GAP + GROUP_GAP
    }
    return { cards, extras, heads, height: Math.max(0, y - GROUP_GAP) }
  }, [groups, cell])
  // 숨는 카드는 마지막 자리에서 흐려진다. 자리를 옮기며 사라지면 어디서 빠졌는지 안 보인다.
  const lastAt = useRef(new Map<string, { x: number; y: number }>())
  useLayoutEffect(() => { for (const [char, at] of layout.cards) lastAt.current.set(char, at) }, [layout])

  return <div className={styles.home} data-testid="jamo-home" data-type={type}>
    <header className={styles.homeHead}>
      <button type="button" className={styles.back} aria-label="대시보드" onClick={() => navigate('/dashboard')}><ChevronLeft size={22} aria-hidden="true" /></button>
      <h2>고칠 {JAMO_LABEL[type]}</h2>
    </header>
    <div className={styles.homeScroll} data-locked={sheet ? true : undefined}>
      <div className={styles.chips} role="tablist" aria-label="묶기">
        {groupings.map((g) => <button key={g.id} type="button" role="tab" aria-selected={g.id === grouping.id} onClick={() => setGroupingId(g.id)}>{g.label}</button>)}
        {/* 묶음 만들기. 늘 켜져 있다 — 시트 판에서 글자를 고르고, 도마에 담긴 게 있으면 미리 켜 둔다. */}
        <button type="button" className={styles.chipAdd} aria-label="묶음 만들기" onClick={() => setSheet({ kind: 'create' })}><Plus size={18} aria-hidden="true" /></button>
      </div>
      <div ref={board} className={styles.board} style={{ height: layout.height }}>
        {/* 소제목도 칸 크기를 잰 뒤에 놓는다 — 먼저 놓으면 칸 0 자리에서 제자리로 미끄러져 내려온다. */}
        {cell > 0 && layout.heads.map(({ key, group, y }) => {
          const whole = group.chars.every(onBench)
          return [
            <button key={key} type="button" className={styles.groupHead} style={{ transform: `translateY(${y}px)` }} role="checkbox" aria-checked={whole} onClick={() => (whole ? remove : add)(type, group.chars)}><span className={styles.check} aria-hidden="true"><Check size={14} strokeWidth={3} /></span>{group.label}<span className={styles.groupCount}>{group.chars.length}</span></button>,
            group.id && <button key={`${key}:more`} type="button" className={styles.groupMore} style={{ transform: `translateY(${y}px)` }} aria-label={`${group.label} 고치기`} onClick={() => setSheet({ kind: 'edit', id: group.id! })}><Ellipsis size={18} aria-hidden="true" /></button>,
          ]
        })}
        {cell > 0 && chars.map((char) => {
          const shown = layout.cards.has(char)
          const at = layout.cards.get(char) ?? lastAt.current.get(char)
          return <button key={char} type="button" className={styles.homeCard} style={{ width: cell, height: cell, transform: at ? `translate(${at.x}px, ${at.y}px)` : undefined }} data-hidden={shown ? undefined : true} aria-hidden={shown ? undefined : true} tabIndex={shown ? undefined : -1} aria-label={`${char} 도마에 ${onBench(char) ? '빼기' : '담기'}`} aria-pressed={onBench(char)} onClick={() => toggle(type, char)}>
            <span className={styles.inkSmall}><JamoGlyph type={type} char={char} size={52} /></span>
          </button>
        })}
        {cell > 0 && layout.extras.map(({ key, char, x, y }) => <button key={key} type="button" className={styles.homeCard} style={{ width: cell, height: cell, transform: `translate(${x}px, ${y}px)` }} aria-label={`${char} 도마에 ${onBench(char) ? '빼기' : '담기'}`} aria-pressed={onBench(char)} onClick={() => toggle(type, char)}>
          <span className={styles.inkSmall}><JamoGlyph type={type} char={char} size={52} /></span>
        </button>)}
      </div>
    </div>
    {/* 도마 상태 · 편집 입구. 칩은 왼쪽 한 줄(넘치면 가로 스크롤), 단추는 오른쪽에 고정. 도마가 비면 단추도 잠긴다. */}
    <footer className={styles.bench}>
      <div className={styles.benchChips} data-more={benchMore || undefined}><div ref={benchInner} aria-label="도마">
        {benchCount === 0 ? <em>카드나 묶음을 눌러 도마에 올리세요</em> : benchChars.map((char) => <button key={char} type="button" data-chip={char} aria-label={`${char} 도마에서 빼기`} onClick={() => toggle(type, char)}>{char}</button>)}
        {/* 도마가 이미 있는 묶음과 같으면 그 이름을 칩 끝에 보인다. */}
        {benchGroup && <span key="group" data-chip="__group" className={styles.benchGroupName}>{benchGroup.name}</span>}
      </div></div>
      {benchCount > 0 && <button type="button" className={styles.benchClear} aria-label="도마 비우기" onClick={clear}><Trash2 size={18} aria-hidden="true" /></button>}
      <button type="button" className={styles.benchGo} disabled={benchCount === 0} onClick={() => openEditor(type, benchChars)}>{/* 숫자가 바뀔 때마다 새로 떠오른다 — key가 바뀌면 애니메이션이 다시 돈다. */}<span key={benchCount} className={styles.benchCount}>{benchCount}</span>개 고치기</button>
    </footer>
    {toast && <div className={styles.toast} role="status">{toast.text}<button type="button" onClick={() => { toast.undo(); setToast(null) }}>되돌리기</button></div>}
    {sheet && <GroupSheet
      type={type}
      all={chars}
      key={sheet.kind === 'edit' ? sheet.id : 'create'}
      group={sheet.kind === 'edit' ? mine.find((group) => group.id === sheet.id) ?? null : null}
      benchChars={benchType === type ? benchChars : []}
      builtinNameOf={(members) => GROUPINGS[type].slice(1).flatMap((g) => g.groups(chars, strokeCount)).find((g) => g.label && sameChars(g.chars, members))?.label ?? null}
      onClose={() => setSheet(null)}
      onCreate={saveGroup}
      onDelete={deleteGroup}
    />}
  </div>
}

/** 새 묶음 이름의 기본값. 글자 그대로, 넷을 넘으면 `ㄱ ㄲ ㅋ 외 5`. */
function suggestedName(chars: readonly string[]): string {
  return chars.length <= 4 ? chars.join(' ') : `${chars.slice(0, 3).join(' ')} 외 ${chars.length - 3}`
}

/**
 * 묶음 바텀시트. 이름 + 그 종류 자소 판에서 칸을 탭해 넣고 뺀다(한 화면에서 끝난다).
 * 만들 때는 도마에 담긴 글자를 미리 켜 두고, 이름은 고른 글자로 미리 채운다(사용자가 이름을 치기 전까지 따라간다).
 * 묶음을 가리키는 값(부리)이 글자를 따라간다는 걸 저장 전에 한 줄로 보인다. 지우기는 확인하지 않는다 — 대신 되돌리기 토스트.
 */
function GroupSheet({ type, all, group, benchChars, builtinNameOf, onClose, onCreate, onDelete }: {
  type: JamoType
  /** 그 종류 자소 전부(ㄱㄴㄷ 순). 고칠 때 판으로 깐다. */
  all: readonly string[]
  group: JamoGroup | null
  benchChars: readonly string[]
  /** 고른 글자가 기본 묶음 하나와 똑같으면 그 이름(`삐침 있음`). 새 묶음 이름의 기본값. */
  builtinNameOf: (chars: readonly string[]) => string | null
  onClose: () => void
  onCreate: (name: string, chars: readonly string[]) => void
  onDelete: (id: string) => void
}) {
  const [draft, setDraft] = useState<readonly string[]>(() => group?.chars ?? benchChars)
  const [typedName, setTypedName] = useState<string | null>(() => group?.name ?? null)
  const name = typedName ?? (builtinNameOf(draft) ?? suggestedName(draft))
  // 입력칸은 저절로 켜지 않는다 — 폰에서 키보드가 올라와 판을 가린다. 고르기가 먼저다.
  const toggleDraft = (char: string) => setDraft((current) => (current.includes(char) ? current.filter((c) => c !== char) : all.filter((c) => c === char || current.includes(c))))
  const added = group ? draft.filter((char) => !group.chars.includes(char)) : []
  const dropped = group ? group.chars.filter((char) => !draft.includes(char)) : []
  const changed = added.length > 0 || dropped.length > 0
  const save = () => {
    if (!group) { onCreate(name, draft); return }
    const store = useJamoGroupStore.getState()
    store.rename(group.id, name)
    if (changed) store.setChars(group.id, draft)
    onClose()
  }
  return <div className={styles.sheetLayer} onClick={onClose}>
    <form className={styles.sheet} role="dialog" aria-label={group ? '묶음 고치기' : '묶음으로 저장'} onClick={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); save() }}>
      <h3>{group ? '묶음 고치기' : '새 묶음'}</h3>
      <label className={styles.sheetField}><span>이름</span><input value={name} onChange={(event) => setTypedName(event.target.value)} onFocus={(event) => event.currentTarget.select()} maxLength={20} aria-label="묶음 이름" /></label>
      <div className={styles.sheetField}>
        <span>글자 <b>{draft.length}자</b></span>
        <div className={styles.sheetGrid} role="group" aria-label="묶음 글자">
          {all.map((char) => <button key={char} type="button" aria-pressed={draft.includes(char)} aria-label={`${char} ${draft.includes(char) ? '빼기' : '넣기'}`} onClick={() => toggleDraft(char)}>
            <JamoGlyph type={type} char={char} size={22} />
          </button>)}
        </div>
        <em className={styles.sheetDiff} data-empty={draft.length === 0 || undefined}>{draft.length === 0
          ? (group ? '글자를 하나 이상 남겨 주세요 · 묶음을 없애려면 지우기' : '')
          : group && changed
            ? `${[added.length ? `+ ${added.join(' ')}` : '', dropped.length ? `− ${dropped.join(' ')}` : ''].filter(Boolean).join('  ')}${group.stemBeak ? ' · 이 묶음 부리가 글자를 따라가요' : ''}`
            : ''}</em>
      </div>
      <div className={styles.sheetActions}>
        {group && <button type="button" className={styles.sheetDelete} onClick={() => onDelete(group.id)}>지우기</button>}
        <button type="submit" className={styles.sheetSave} disabled={!name.trim() || draft.length === 0}>저장</button>
      </div>
    </form>
  </div>
}

const FONT_SAVE_FAILED = '지금 폰트를 저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.'
const fontListFailed = (message: string) => showAppNotice('font-list', { tone: 'error', message, dismissable: true })

/**
 * 머리 알약 드로어의 폰트 목록과 동작. 만든 순서대로(고르거나 고쳐도 자리가 안 바뀐다).
 * 바꾸기 · 만들기 · 지금 폰트 지우기는 이름표를 고쳐 대시보드를 다시 연다(`fontSwitch`). 계정 폰트를 안 연 화면(랩)이면 목록 없이 이름만.
 */
function useFontList() {
  const [session] = useState(accountFontSession)
  const [fonts, setFonts] = useState<FontSummary[] | null>(null)
  const [nickname, setNickname] = useState<string | null>(null)
  const [moving, setMoving] = useState(false)
  useEffect(() => {
    if (!session) return
    void listFonts(session.me).then((listed) => { if (listed.ok) setFonts(listed.value) })
    if (authGateMode() === 'on') void sessionUser().then((user) => setNickname(user?.nickname ?? null)).catch(() => undefined)
    else setNickname('내 폰트')
  }, [session])

  const go = async (move: () => Promise<boolean>) => {
    if (moving) return
    setMoving(true)
    if (await move()) return
    setMoving(false)
    fontListFailed(FONT_SAVE_FAILED)
  }
  return {
    canList: session !== null,
    currentId: session?.fontId ?? null,
    // 만든 순서 그대로. 고르거나 고쳐도 자리가 바뀌지 않는다.
    fonts: fonts && [...fonts].sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    full: (fonts?.length ?? FONT_LIMIT) >= FONT_LIMIT,
    moving,
    open: (fontId: string) => { if (session && fontId !== session.fontId) void go(() => openFont(session.me, fontId)) },
    create: () => {
      if (!session || !fonts || fonts.length >= FONT_LIMIT) return
      void go(() => openNewFont(session.me, nextFontName(nickname, fonts.map((font) => font.name))))
    },
    /** 카드 `…` 이름 바꾸기. 계정 폰트를 안 연 랩 화면이면 머리 이름만 바꾼다. */
    renameCurrent: (next: string) => {
      if (!session) { renamedAccountFont(next); return }
      void renameFont(session.fontId, next).then((renamed) => {
        if (!renamed.ok) { fontListFailed('이름을 바꾸지 못했어요. 다시 해 주세요.'); return }
        renamedAccountFont(next)
        setFonts((list) => list?.map((font) => font.id === session.fontId ? { ...font, name: next } : font) ?? list)
      })
    },
    /** 카드 `…` 삭제. 지우면 최근 폰트(없으면 새 폰트)로 다시 연다. */
    removeCurrent: session ? () => {
      if (moving) return
      setMoving(true)
      void deleteFont(session.fontId).then((deleted) => {
        if (deleted.ok) return leaveDeletedFont(session.me)
        setMoving(false)
        fontListFailed('지우지 못했어요. 다시 해 주세요.')
      })
    } : undefined,
  }
}

type FontList = ReturnType<typeof useFontList>

/**
 * 머리 알약을 누르면 머리 아래로 내려오는 내 폰트 드로어. 줄을 누르면 그 폰트로, 맨 아래 `새 폰트`. 이름 · 삭제는 카드 `…`.
 * 머리는 가리지 않는다 — 알약을 다시 누르면 닫힌다.
 * 지금 폰트 줄만 고친 자소 수를 보인다 — 다른 폰트는 데이터를 받아야 알 수 있다.
 */
function FontSheet({ list, modified, top, closing, onClose, onClosed }: {
  list: FontList
  modified: number
  top: number
  /** 닫히는 중 — 거꾸로 올라가는 애니메이션이 끝나면 `onClosed`. */
  closing: boolean
  onClose: () => void
  onClosed: () => void
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  const fonts = list.fonts
  return <div className={styles.fontDrawerLayer} style={{ top }} data-closing={closing || undefined} onClick={onClose}>
    <div className={styles.fontDrawer} onAnimationEnd={(event) => { if (closing && event.target === event.currentTarget) onClosed() }} role="dialog" aria-label="내 폰트" aria-busy={list.moving || undefined} onClick={(event) => event.stopPropagation()} data-testid="dashboard-font-sheet">
      {fonts === null
        ? <p className={styles.fontSheetNote}>불러오는 중…</p>
        : <ul className={styles.fontRows}>
          {fonts.map((font) => {
            const current = font.id === list.currentId
            const sub = current
              ? `${modified > 0 ? `고친 자소 ${modified}` : '프리셋 그대로'} · ${editedDayText(font.updatedAt)}`
              : editedDayText(font.updatedAt)
            return <li key={font.id} data-current={current || undefined} data-testid="dashboard-font-row">
              <button type="button" className={styles.fontRowOpen} disabled={list.moving} onClick={() => current ? onClose() : list.open(font.id)}>
                <strong>{font.name}</strong>
                <span>{sub}</span>
              </button>
              {current && <Check size={20} aria-label="지금 연 폰트" />}
            </li>
          })}
        </ul>}
      <button type="button" className={styles.fontSheetCreate} disabled={list.moving || list.full} onClick={list.create} data-testid="dashboard-font-create"><Plus size={20} aria-hidden="true" />새 폰트</button>
      {list.full && <p className={styles.fontSheetNote}>폰트는 {FONT_LIMIT}개까지 만들 수 있어요. 하나를 지우면 새로 만들 수 있어요.</p>}
    </div>
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

  // 머리 알약 = 지금 폰트 이름(시트에서 바꾼 이름도 따라간다, `renamedAccountFont`). 누르면 내 폰트 시트.
  const fontList = useFontList()
  // 닫힐 때도 거꾸로 올라가야 해서 `closing`을 거친 뒤에 뺀다.
  const [sheet, setSheet] = useState<'closed' | 'open' | 'closing'>('closed')
  const sheetOpen = sheet === 'open'
  const closeSheet = () => setSheet((state) => state === 'open' ? 'closing' : state)
  const head = useRef<HTMLElement>(null)
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
  }
  const jump = (id: SectionId) => {
    const root = scroller.current
    const element = sections.current[id]
    if (!root || !element) return
    root.scrollTo({ top: element.offsetTop - root.offsetTop, behavior: 'smooth' })
  }

  return <main className={styles.page}>
    <div className={styles.shell}>
      <header ref={head} className={styles.head}>
        {/* 회색 알약 = 지금 폰트. 누르면 내 폰트 시트(바꾸기 · 새로 · 이름 · 삭제). 계정 폰트를 안 연 랩 화면이면 이름만. */}
        <h1 className={styles.title}>
          <button type="button" className={styles.switcher} disabled={!fontList.canList} aria-haspopup="dialog" aria-expanded={sheetOpen} onClick={() => sheetOpen ? closeSheet() : setSheet('open')} data-testid="dashboard-font-switcher">
            <span>{name}</span>{fontList.canList && <ChevronDown size={18} aria-hidden="true" data-open={sheetOpen || undefined} />}
          </button>
        </h1>
        <AccountMenu fontCount={fontList.fonts?.length ?? null} />
      </header>

      <div ref={scroller} className={styles.scroll} onScroll={onScroll}>
        {/* 지금 폰트 카드 하나. 다른 폰트는 머리 알약 시트에서. */}
        <div className={styles.fontCardRow}>
          <FontCard name={name} note={modified > 0 ? '마지막 고침 · 오늘' : '마지막 고침 · 오늘 · 프리셋 그대로'} onRename={fontList.renameCurrent} onDelete={fontList.removeCurrent} />
        </div>

        <div className={styles.body}>
          <nav className={styles.rail} aria-label="목차">
            {SECTIONS.map(({ id, label }) => <button key={id} type="button" aria-current={active === id ? 'true' : undefined} onClick={() => jump(id)}>{label}</button>)}
            {/* 검수는 섹션이 아니라 다른 화면(격자). 틈을 두고 따로. */}
            <button type="button" className={styles.railLink} onClick={() => navigate('/workspace/review')} data-testid="dashboard-review"><ScanSearch size={16} aria-hidden="true" />검수</button>
          </nav>

          <div className={styles.content}>
            <section ref={(el) => { sections.current.style = el }}>
              <SectionHead title="스타일" hint="이 폰트 전체" onClick={() => navigate('/workspace/font')} testId="dashboard-style" />
              <ul className={styles.tiles}>
                <li><span className={styles.picto}><StylePicto kind="weight" /></span><em>굵기</em><strong>{style.weight}</strong></li>
                <li><span className={styles.picto}><StylePicto kind="slant" /></span><em>기울기</em><strong>{style.slant}°</strong></li>
                <li><span className={styles.picto}><StylePicto kind="roundness" /></span><em>둥글기</em><strong>{roundness}%</strong></li>
                <li><span className={styles.picto}><StylePicto kind="beak" /></span><em>부리</em><strong>{style.stemBeak?.enabled ? '있음' : '없음'}</strong></li>
              </ul>
            </section>

            <section ref={(el) => { sections.current.layout = el }}>
              <SectionHead title="레이아웃" count={6} onClick={() => navigate('/workspace/jamo')} testId="dashboard-layout" />
              <ul className={styles.grid}>
                {LAYOUT_SAMPLES.map((char) => <li key={char}>
                  <button type="button" className={styles.thumb} aria-label={`${char} 레이아웃`} onClick={() => navigate(`/workspace/jamo?char=${encodeURIComponent(char)}`)}>
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
      {sheet !== 'closed' && <FontSheet list={fontList} modified={modified} top={head.current?.offsetHeight ?? 50} closing={sheet === 'closing'} onClose={closeSheet} onClosed={() => setSheet('closed')} />}
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
