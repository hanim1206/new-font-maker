/* eslint-disable react-refresh/only-export-components -- 실험실 한 화면의 항목 표와 견본 조각을 한 파일에 둔다 */
import { useState } from 'react'
import type { ReactNode } from 'react'
import { Columns3, Plus, Square, Type } from 'lucide-react'
import { BUTTON_SIZES, BUTTON_VARIANTS, Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { Switch } from './components/ui/switch'
import { ChoiceGroup, ChoiceItem } from './components/ui/choice-group'
import { NoticeIcon } from './components/ui/notice-icon'
import { Pressable } from './components/ui/pressable'
import { Field, RangeBar } from './components/ui/range'
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs'
import { RangeTicks } from './RangeTicks'

/**
 * 스타일가이드 라이브러리의 항목 표(docs/plans/2026-10-03_스타일가이드-검토판.md). 항목 하나 = 번호 · 이름 · 실물 · 쓰는 화면.
 * 보기만 한다 — 의견은 번호를 복사해 채팅으로 준다. 미리보기는 `selector`로 화면 안의 그 부품을 찾아 깜빡인다
 * (공용 부품이 `data-slot` · `data-variant` · `data-size`를 단다).
 */

/** 미리보기로 갈 화면. `show`가 있으면 그 화면에서 부품을 띄우는 동작(알림처럼 주소만으로 안 보이는 것). */
export interface LibraryScreen { name: string; route: string; hint?: string; show?: 'notice-bar' | 'notice-card' }

/** 목록의 묶음. 위 칸(토큰 · 부품) 아래 접히는 묶음 하나. 누르면 그 묶음 한눈 보기. */
export interface LibraryGroup { id: string; label: string; section: '토큰' | '부품'; note: string }
export const LIBRARY_GROUPS: LibraryGroup[] = [
  { id: 'color', label: '색', section: '토큰', note: '의미 색(테마가 바꾸는 층)과 편집 색(캔버스).' },
  { id: 'type', label: '글자', section: '토큰', note: '글자 크기 단계와 굵기.' },
  { id: 'shape', label: '모양', section: '토큰', note: '모서리와 그림자.' },
  { id: 'button-variant', label: '단추 · 강조', section: '부품', note: '단추의 색 · 글자. 크기와 따로 고른다.' },
  { id: 'button-size', label: '단추 · 크기', section: '부품', note: '단추의 높이 · 여백 · 모서리.' },
  { id: 'tabs', label: '탭', section: '부품', note: '화면 안에서 칸을 바꾸는 탭.' },
  { id: 'choice', label: '고르기', section: '부품', note: '하나만 고르는 칸 묶음.' },
  { id: 'range', label: '막대', section: '부품', note: '조절 항목과 채움 막대.' },
  { id: 'checkbox', label: '체크', section: '부품', note: '켬 · 끔.' },
  { id: 'switch', label: '스위치', section: '부품', note: '켬 · 끔 토글(iOS 크기).' },
  { id: 'notice', label: '알림', section: '부품', note: '화면 아래 알림과 저장 토스트.' },
  { id: 'pressable', label: '누르는 덩어리', section: '부품', note: '카드 · 글자 칸 · 목록 줄 · 특수 단추. 공용 생김새 없이 화면 CSS가 그린다 — 통일 후보.' },
]

export interface LibraryItem {
  id: string
  group: string
  title: string
  note?: string
  story: () => ReactNode
  /** 미리보기 화면에서 이 부품을 찾는 선택자. 토큰처럼 화면에서 찾을 게 없으면 비운다. */
  selector?: string
  /** 정해 둔 쓰는 화면. 단추는 코드에서 센 쓰임(`usage`)으로 채운다. */
  screens?: LibraryScreen[]
  usage?: { kind: 'variant' | 'size'; name: string }
}

/** 코드 파일 → 미리보기 화면. 단추 쓰임(파일:줄)을 화면 이름으로 바꿀 때 쓴다. */
export const FILE_SCREEN: Record<string, LibraryScreen> = {
  'src-next/AccountPage.tsx': { name: '계정', route: '/account', hint: '`내가 보낸 의견`의 답 보기 알약은 의견 화면에 답이 있을 때만' },
  'src-next/App.tsx': { name: '개발용 우상단 단추', route: '/dashboard' },
  'src-next/AppErrorBoundary.tsx': { name: '오류 화면', route: '/dashboard?crash=render' },
  'src-next/AppNoticeBar.tsx': { name: '알림 카드(단추 둘)', route: '/dashboard', show: 'notice-card' },
  'src-next/BetaLoginPage.tsx': { name: '로그인', route: '/dashboard', hint: '로그인 게이트를 켠 서버에서만 보인다' },
  'src-next/BrushStyleTrackpad.tsx': { name: '스타일 · 획 탭', route: '/workspace/font', hint: '`바깥과 같이`는 안쪽 둥글기를 따로 바꿨을 때만' },
  'src-next/CalibrationSentenceEditor.tsx': { name: '스타일 · 네모꼴 탭', route: '/workspace/font', hint: '아래 `네모꼴` 탭을 누른다' },
  'src-next/DashboardLabPage.tsx': { name: '대시보드', route: '/dashboard', hint: '시트 단추는 폰트 카드의 ··· · 다운로드를 눌러야 보인다' },
  'src-next/EditLockedPage.tsx': { name: '편집 잠김', route: '/dashboard', hint: '같은 폰트를 다른 탭에서 열면' },
  'src-next/FontExportDonePage.tsx': { name: '추출 완료', route: '/workspace/font/export', hint: '받기가 끝나야 보인다' },
  'src-next/GlobalStyleTrackpad.tsx': { name: '스타일 탭(옛 단독 화면 닫기)', route: '/workspace/font' },
  'src-next/LayoutScopePicker.tsx': { name: '자소 · 범위 고르기', route: '/workspace/jamo', hint: '`+ 옵션 추가`를 눌러야 보인다' },
  'src-next/ReportButton.tsx': { name: '제보 시트', route: '/dashboard', hint: '머리의 빨간 제보 단추를 누른다' },
  'src-next/SlideSheet.tsx': { name: '안내 시트', route: '/dashboard', hint: '제보 시트의 `둘러보기`' },
  'src-next/StemBeakControls.tsx': { name: '스타일 · 부리 탭', route: '/workspace/font', hint: '아래 `부리` 탭을 누른다' },
}

function Samples({ items }: { items: { label: string; node: ReactNode }[] }) {
  return <div className="flex flex-wrap items-end gap-6">
    {items.map((item) => <div key={item.label} className="flex flex-col items-start gap-2">
      {item.node}
      <span className="text-11 text-text-dim-5">{item.label}</span>
    </div>)}
  </div>
}

/** 토큰 하나의 지금 값(미리보기가 덮었으면 그 값). */
export const tokenValue = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

function Swatches({ names }: { names: string[] }) {
  return <div className="grid grid-cols-[repeat(auto-fill,minmax(170px,1fr))] gap-3">{names.map((name) => <div key={name} className="flex min-w-0 items-center gap-2.5">
    <span className="size-10 shrink-0 rounded-md border border-border-subtle" style={{ background: `rgb(${tokenValue(`--color-${name}`)})` }} />
    <span className="min-w-0"><code className="block truncate text-12 font-semibold">{name}</code><code className="block text-11 text-text-dim-5">{tokenValue(`--color-${name}`)}</code></span>
  </div>)}</div>
}

const SEMANTIC = [
  'background', 'foreground', 'card', 'primary', 'primary-foreground', 'primary-dark', 'primary-light',
  'secondary', 'secondary-foreground', 'muted', 'muted-foreground', 'accent', 'destructive', 'destructive-dark', 'destructive-soft',
  'info', 'info-soft', 'success', 'success-soft', 'warning', 'warning-soft', 'border', 'input', 'ring', 'inverse', 'inverse-foreground', 'scrim',
  'surface', 'surface-2', 'surface-3', 'surface-4', 'surface-hover', 'border-light', 'border-lighter', 'border-subtle',
  'text-1', 'text-2', 'text-3', 'text-4', 'text-5', 'text-6',
]
const EDIT = ['edit-select', 'edit-handle', 'editor-point-selected', 'edit-slot-ch', 'edit-slot-ju', 'edit-slot-jo', 'edit-slot-off', 'edit-ghost', 'edit-guide', 'edit-baseline']

const VARIANT_INFO: Record<keyof typeof BUTTON_VARIANTS, [string, string]> = {
  default: ['검정', '가장 강한 할 일. 시트 아래 오른쪽 · 다운로드 · 저장. 비활성은 회색 바탕.'],
  primary: ['주색', '주색을 쓰는 할 일. 지금 앱 화면에서는 안 쓴다.'],
  secondary: ['회색', '취소 · 덜 중요한 할 일. 시트 아래 왼쪽.'],
  outline: ['테두리', '흰 바탕에 테두리. 오류 화면 백업 · 범위 고르기 취소.'],
  ghost: ['옅은 글자 + 누르면 회색', '가벼운 도구 단추. 지금 앱 화면에서는 안 쓴다.'],
  destructive: ['빨강', '지우기처럼 되돌릴 수 없는 일.'],
  plain: ['투명 · 검정 글자', '뒤로 · 계정 · 목록 줄.'],
  quiet: ['투명 · 옅은 글자', '로그아웃 · 닫기처럼 눈에 안 띄어야 하는 것.'],
  link: ['밑줄 글자', '`바깥과 같이` 같은 작은 되돌림.'],
  faint: ['더 옅은 글자', '`처음 값으로` 되돌리기 · 도마 비우기.'],
  chip: ['칩', '고르면 검정. 묶기 · 범위 고르기.'],
  soft: ['옅은 알약', '`한임 답 보기`. 새 답이면 주색.'],
}
const SIZE_INFO: Record<keyof typeof BUTTON_SIZES, [string, string]> = {
  default: ['기본 36', '보통 단추.'],
  sm: ['작게 32', '카드 안 · 도구 줄.'],
  lg: ['크게 44', '한 줄로 눈에 띄어야 하는 단추.'],
  icon: ['아이콘 36', '네모 아이콘 단추.'],
  'icon-md': ['둥근 아이콘 40', '폰트 카드 ··· · 다운로드 · 계정.'],
  'icon-lg': ['둥근 아이콘 44', '머리의 뒤로.'],
  block: ['꽉 찬 48', '오류 · 로그인 카드에 위아래로 쌓는 단추.'],
  sheet: ['시트 큰 단추 56', '하단 드로어 아래 단추(취소 · 다운로드).'],
  chip: ['칩 34', '고르기 칩.'],
  'chip-sm': ['작은 칩 28', '좁은 시트 안 칩.'],
  row: ['목록 줄', '계정 화면의 `내가 보낸 의견`처럼 한 줄 전체.'],
}
type Variant = keyof typeof BUTTON_VARIANTS
type Size = keyof typeof BUTTON_SIZES
const iconSize = (size: Size) => size.startsWith('icon')

function DemoTabs({ variant }: { variant: 'default' | 'underline' | 'dock' }) {
  const [tab, setTab] = useState('brush')
  const items = [['body', '네모꼴', Square], ['brush', '획', Columns3], ['beak', '부리', Type]] as const
  return <Tabs value={tab} onValueChange={setTab}>
    <TabsList variant={variant} aria-label={`탭 ${variant}`} className={variant === 'dock' ? 'static w-[360px] translate-x-0' : undefined}>
      {items.map(([id, label, Icon]) => <TabsTrigger key={id} value={id} disabled={variant === 'dock' && id === 'body'}>
        {variant === 'dock' ? <><Icon aria-hidden="true" /><span>{label}</span>{id === 'body' && <small>개발 중이에요</small>}</> : label}
      </TabsTrigger>)}
    </TabsList>
  </Tabs>
}

function DemoChoice({ variant, size }: { variant: 'tile' | 'segment' | 'pill'; size?: 'default' | 'sm' }) {
  const [on, setOn] = useState('a')
  const ids = variant === 'tile' && size === 'sm' ? ['a', 'b', 'c', 'd', 'e', 'f'] : variant === 'pill' ? ['a', 'b'] : variant === 'tile' ? ['a', 'b'] : ['a', 'b', 'c']
  return <ChoiceGroup variant={variant} size={size} aria-label={variant} className={variant === 'tile' ? (size === 'sm' ? 'grid w-[420px] grid-cols-6 gap-[5px]' : 'grid w-[360px] grid-cols-2 gap-2') : 'w-[360px]'}>
    {ids.map((id) => <ChoiceItem key={id} checked={on === id} onClick={() => setOn(id)}>
      {variant === 'tile'
        ? size === 'sm' ? <><svg viewBox="0 0 100 100" aria-hidden="true"><rect x="46" y="30" width="20" height="80" /></svg><span>모양 {id}</span></> : <><Columns3 className="h-[52px] w-16" aria-hidden="true" /><strong>{id === 'a' ? '일반 붓' : '납작 붓'}</strong></>
        : variant === 'pill' ? (id === 'a' ? '전체' : '「묶음」 12자') : `칸 ${id}`}
    </ChoiceItem>)}
  </ChoiceGroup>
}

function DemoRange() {
  const [weight, setWeight] = useState(400)
  return <div className="w-[360px]">
    <Field label="굵기" value={weight}>
      <RangeBar min={100} max={900} step={100} value={weight} onChange={(event) => setWeight(Number(event.target.value))} />
      <RangeTicks min={100} max={900} ticks={[100, 200, 300, 400, 500, 600, 700, 800, 900].map((at) => ({ at, text: at === 100 || at === 400 || at === 900 ? String(at) : undefined }))} />
    </Field>
    <Field label="꺼진 막대" value="–"><RangeBar min={0} max={100} value={30} disabled readOnly /></Field>
  </div>
}

function DemoSwitch() {
  const [on, setOn] = useState(true)
  return <Samples items={[
    { label: '켬 · 누르면 바뀜', node: <label className="flex items-center gap-3 text-16 font-bold">기본 ㅈ과 연결<Switch checked={on} onCheckedChange={setOn} /></label> },
    { label: '끔', node: <label className="flex items-center gap-3 text-16 font-bold">기본 ㅈ과 연결<Switch checked={false} /></label> },
    { label: '잠김', node: <Switch checked disabled /> },
  ]} />
}
function DemoCheckbox({ tone }: { tone: 'primary' | 'ink' }) {
  const [on, setOn] = useState(true)
  return <Samples items={[
    { label: '켬 · 누르면 바뀜', node: <label className="flex items-center gap-2 text-13 font-semibold"><Checkbox tone={tone} checked={on} onCheckedChange={(checked) => setOn(checked === true)} />자동 보정</label> },
    { label: '끔', node: <label className="flex items-center gap-2 text-13 font-semibold"><Checkbox tone={tone} checked={false} />자동 보정</label> },
  ]} />
}

/** 알림 막대 · 카드의 생김새만 그린 견본(실제 알림은 화면 아래 고정이라 미리보기에서 띄운다). */
function DemoNotice({ card }: { card: boolean }) {
  return card
    ? <div className="flex w-[360px] flex-wrap items-center gap-x-2.5 gap-y-3.5 rounded-xl bg-surface p-[18px] text-16 font-bold shadow-overlay">
      <NoticeIcon tone="error" className="size-6 text-destructive" /><span className="flex-1">다른 기기에서 먼저 저장했어요</span>
      <div className="flex w-full gap-2"><Button type="button" size="sheet" className="flex-1">그걸 불러오기</Button><Button type="button" size="sheet" variant="secondary" className="flex-1">내 것으로 덮기</Button></div>
    </div>
    : <div className="flex w-[360px] items-center gap-2.5 rounded-xl bg-inverse/95 py-3 pl-4 pr-1.5 text-14 font-semibold text-inverse-foreground">
      <NoticeIcon tone="info" className="size-[22px] text-primary-light" /><span className="flex-1">새 버전이 있어요</span>
      <span className="px-2.5 font-bold text-primary-light">새로고침</span>
    </div>
}

export function libraryItems(): LibraryItem[] {
  const items: LibraryItem[] = [
    { id: 'color.semantic', group: '색', title: '의미 색', note: '화면은 이 층만 쓴다. 테마가 바꾸는 층. 앞쪽이 shadcn 표준 이름.', story: () => <Swatches names={SEMANTIC} /> },
    { id: 'color.edit', group: '색', title: '편집 색', note: '캔버스 안 선택 · 영역 · 고스트 · 격자. 테마가 바뀌어도 그대로. SVG 속성용 값은 editColors.ts에 같이 있다.', story: () => <Swatches names={EDIT} /> },
    { id: 'type.size', group: '글자', title: '글자 크기', note: '10–20 단계, 머리글 24 · 28, 큰 숫자 36. 큰 한글 견본은 단계 밖.', story: () => <div className="flex flex-col gap-2">{[10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 36].map((size) => <div key={size} className="flex items-baseline gap-4"><code className="w-16 shrink-0 text-12 text-text-dim-5">font-{size}</code><span style={{ fontSize: `var(--font-${size})` }}>다람쥐 헌 쳇바퀴 Aa 123</span></div>)}</div> },
    { id: 'type.weight', group: '글자', title: '굵기', story: () => <div className="flex flex-wrap gap-6">{([['medium', 500], ['semibold', 600], ['bold', 700], ['heavy', 800]] as const).map(([name, value]) => <div key={name} className="flex flex-col gap-1"><span className="text-20" style={{ fontWeight: `var(--weight-${name})` }}>한글 폰트</span><code className="text-12 text-text-dim-5">{name} {value}</code></div>)}</div> },
    { id: 'shape.radius', group: '모양', title: '모서리', story: () => <div className="flex flex-wrap gap-4">{['xs', 'sm', 'md', 'lg', 'xl', 'full'].map((name) => <div key={name} className="flex flex-col items-center gap-1.5"><span className="size-14 border border-border bg-surface-3" style={{ borderRadius: `var(--radius-${name})` }} /><code className="text-12 text-text-dim-5">{name} {tokenValue(`--radius-${name}`)}</code></div>)}</div> },
    { id: 'shape.shadow', group: '모양', title: '그림자', story: () => <div className="flex flex-wrap gap-6 py-2">{['sm', 'md', 'overlay'].map((name) => <div key={name} className="flex flex-col items-center gap-2"><span className="h-14 w-24 rounded-md bg-card" style={{ boxShadow: `var(--shadow-${name})` }} /><code className="text-12 text-text-dim-5">{name}</code></div>)}</div> },
  ]
  for (const variant of Object.keys(BUTTON_VARIANTS) as Variant[]) {
    const size: Size = variant === 'chip' ? 'chip' : 'default'
    items.push({
      id: `button.variant.${variant}`, group: '단추 · 강조', title: VARIANT_INFO[variant][0], note: VARIANT_INFO[variant][1],
      selector: `[data-slot="button"][data-variant="${variant}"]`, usage: { kind: 'variant', name: variant },
      story: () => <Samples items={[
        { label: '기본', node: <Button type="button" variant={variant} size={size}>저장하기</Button> },
        { label: '비활성', node: <Button type="button" variant={variant} size={size} disabled>저장하기</Button> },
        ...(variant === 'chip' ? [{ label: '고름', node: <Button type="button" variant="chip" size="chip" aria-pressed>저장하기</Button> }] : []),
        ...(variant === 'soft' ? [{ label: '새 소식', node: <Button type="button" variant="soft" size="sm" data-highlight>저장하기</Button> }] : []),
      ]} />,
    })
  }
  for (const size of Object.keys(BUTTON_SIZES) as Size[]) {
    const label = iconSize(size) ? <Plus aria-hidden="true" /> : size === 'row' ? <strong className="flex-1">내가 보낸 의견</strong> : '저장하기'
    const aria = iconSize(size) ? '더하기' : undefined
    items.push({
      id: `button.size.${size}`, group: '단추 · 크기', title: SIZE_INFO[size][0], note: SIZE_INFO[size][1],
      selector: `[data-slot="button"][data-size="${size}"]`, usage: { kind: 'size', name: size },
      story: () => size === 'row'
        ? <div className="w-72 rounded-lg bg-card px-4"><Button type="button" variant="plain" size="row">{label}</Button></div>
        : <Samples items={[
          { label: '검정', node: <Button type="button" size={size} aria-label={aria}>{label}</Button> },
          { label: '회색', node: <Button type="button" variant="secondary" size={size} aria-label={aria}>{label}</Button> },
          { label: '비활성', node: <Button type="button" size={size} aria-label={aria} disabled>{label}</Button> },
        ]} />,
    })
  }
  items.push(
    { id: 'tabs.dock', group: '탭', title: '아래 탭(dock)', note: '스타일 화면 바닥에 붙은 탭. 그림 위 · 이름 아래, 잠긴 탭은 작은 안내.', selector: '[data-slot="tabs"][data-variant="dock"]', screens: [{ name: '스타일', route: '/workspace/font' }], story: () => <DemoTabs variant="dock" /> },
    { id: 'tabs.underline', group: '탭', title: '밑줄 탭', note: '옛 단독 글로벌 스타일 화면.', selector: '[data-slot="tabs"][data-variant="underline"]', screens: [], story: () => <DemoTabs variant="underline" /> },
    { id: 'tabs.default', group: '탭', title: '알약 탭', note: 'shadcn 기본 탭. 지금 앱 화면에서는 안 쓴다.', selector: '[data-slot="tabs"][data-variant="default"]', screens: [], story: () => <DemoTabs variant="default" /> },
    { id: 'choice.tile', group: '고르기', title: '그림 칸', note: '붓 고르기. 고르면 옅은 회색 면, 이름 굵게.', selector: '[data-slot="choice-group"][data-variant="tile"][data-size="default"]', screens: [{ name: '스타일 · 획 탭', route: '/workspace/font' }], story: () => <DemoChoice variant="tile" /> },
    { id: 'choice.tile-sm', group: '고르기', title: '작은 그림 칸', note: '부리 모양 여섯.', selector: '[data-slot="choice-group"][data-variant="tile"][data-size="sm"]', screens: [{ name: '스타일 · 부리 탭', route: '/workspace/font', hint: '아래 `부리` 탭을 누른다' }], story: () => <DemoChoice variant="tile" size="sm" /> },
    { id: 'choice.segment', group: '고르기', title: '회색 길 위 흰 알약', note: '옛 단독 화면의 획 생성 규칙.', selector: '[data-slot="choice-group"][data-variant="segment"]', screens: [], story: () => <DemoChoice variant="segment" /> },
    { id: 'choice.pill', group: '고르기', title: '검정 알약', note: '부리 적용 범위(도마에 묶음이 있을 때).', selector: '[data-slot="choice-group"][data-variant="pill"]', screens: [{ name: '스타일 · 부리 탭', route: '/workspace/font', hint: '도마에 사용자 묶음이 있을 때만' }], story: () => <DemoChoice variant="pill" /> },
    { id: 'range.field', group: '막대', title: '항목 + 채움 막대', note: '이름 왼쪽 · 값 오른쪽, 아래 얇은 채움 막대와 눈금. 글자 칸 아무 데나 눌러도 그 값으로 간다.', selector: '[data-slot="range-bar"]', screens: [{ name: '스타일 · 획 탭', route: '/workspace/font' }], story: () => <DemoRange /> },
    { id: 'checkbox.ink', group: '체크', title: '검정 체크', note: '파랑을 안 쓰는 화면(스타일)의 자동 보정.', selector: '[data-slot="checkbox"][data-tone="ink"]', screens: [{ name: '스타일 · 획 탭', route: '/workspace/font' }], story: () => <DemoCheckbox tone="ink" /> },
    { id: 'switch.primary', group: '스위치', title: '주색 스위치', note: '변형 트리의 `기본 ㅈ과 연결`. 켜면 파랑, 끄면 옅은 회색, 손잡이 흰 원.', selector: '[data-slot="switch"]', screens: [{ name: '획 편집 · 변형 트리', route: '/workspace/jamo?char=자&mode=stroke&part=CH' }], story: () => <DemoSwitch /> },
    { id: 'checkbox.primary', group: '체크', title: '주색 체크', note: 'shadcn 기본 체크. 지금 앱 화면에서는 안 쓴다.', selector: '[data-slot="checkbox"][data-tone="primary"]', screens: [], story: () => <DemoCheckbox tone="primary" /> },
    { id: 'notice.bar', group: '알림', title: '어두운 막대(단추 하나)', note: '토스식. 왼쪽 동그라미 아이콘, 파란 글자 단추. 오류도 바탕은 그대로 아이콘만 빨강. 저장 토스트도 같은 막대.', selector: '[data-testid="app-notice"]', screens: [{ name: '대시보드에 띄우기', route: '/dashboard', show: 'notice-bar' }], story: () => <DemoNotice card={false} /> },
    { id: 'notice.card', group: '알림', title: '흰 카드(단추 둘)', note: '하단 드로어를 줄인 카드. 큰 단추 검정 · 회색.', selector: '[data-testid="app-notice"]', screens: [{ name: '대시보드에 띄우기', route: '/dashboard', show: 'notice-card' }], story: () => <DemoNotice card /> },
    { id: 'pressable.block', group: '누르는 덩어리', title: 'Pressable', note: '브라우저 단추 생김새만 지운 것. 모양은 쓰는 화면의 CSS가 토큰으로 그린다. 대시보드 카드 · 자모 칸 · 도구 줄 · 문장 글자 등 140곳쯤.', selector: '[data-slot="pressable"]', screens: [{ name: '대시보드', route: '/dashboard' }, { name: '자소', route: '/workspace/jamo' }], story: () => <Samples items={[
      { label: '예: 자모 칸(대시보드)', node: <Pressable className="grid size-16 place-items-center rounded-lg bg-surface-2 text-28">ㄱ</Pressable> },
      { label: '예: 목록 줄', node: <Pressable className="w-56 rounded-md px-3 py-2 text-left text-14 hover:bg-surface-2">내 폰트 2</Pressable> },
    ]} /> },
  )
  return items
}

/** 미리보기에서 누른 요소 → 라이브러리 항목 번호들(단추는 크기 · 강조 둘). 공용 부품이 아니면 빈 배열. */
export function itemIdsOfElement(element: Element | null): string[] {
  const slot = element?.closest('[data-slot], [data-testid="app-notice"]')
  if (!slot) return []
  if (slot.getAttribute('data-testid') === 'app-notice') return [slot.getAttribute('data-layout') === 'card' ? 'notice.card' : 'notice.bar']
  const kind = slot.getAttribute('data-slot')
  const variant = slot.getAttribute('data-variant')
  if (kind === 'button') return [`button.size.${slot.getAttribute('data-size') ?? 'default'}`, `button.variant.${variant ?? 'default'}`]
  if (kind === 'tabs') return [`tabs.${variant ?? 'default'}`]
  if (kind === 'choice-group') return [variant === 'tile' ? (slot.getAttribute('data-size') === 'sm' ? 'choice.tile-sm' : 'choice.tile') : `choice.${variant}`]
  if (kind === 'range-bar' || kind === 'field') return ['range.field']
  if (kind === 'checkbox') return [`checkbox.${slot.getAttribute('data-tone') ?? 'primary'}`]
  if (kind === 'switch') return ['switch.primary']
  if (kind === 'pressable') {
    // 알림 막대 안의 글자 단추는 알림으로 본다.
    const notice = slot.closest('[data-testid="app-notice"]')
    return notice ? itemIdsOfElement(notice) : ['pressable.block']
  }
  return []
}
