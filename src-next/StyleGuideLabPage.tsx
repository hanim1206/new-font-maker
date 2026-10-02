import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft, ChevronRight, MessageCircle, Plus, Square, Columns3, Type } from 'lucide-react'
import { Button } from './components/ui/button'
import type { ButtonProps } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { ChoiceGroup, ChoiceItem } from './components/ui/choice-group'
import { Field, RangeBar } from './components/ui/range'
import { Tabs, TabsList, TabsTrigger } from './components/ui/tabs'
import { RangeTicks } from './RangeTicks'
import { applyThemePreview, readThemePreview, writeThemePreview } from './themePreview'
import type { ThemePreview } from './themePreview'

/**
 * 스타일가이드 실험실(docs/plans/2026-10-03_스타일-공통화.md). 토큰 세 층 · 단계 · 공용 부품을 실제 부품으로 그린다.
 * 위 손잡이로 주색 · 테마를 바꾸면 이 브라우저의 다른 화면도 따라 바뀐다(`themePreview.ts`). 정해지면 `src/index.css`에 굳힌다.
 */

const PRIMARY_CHOICES: { label: string; hex: string | null }[] = [
  { label: '기본 파랑', hex: null },
  { label: '초록', hex: '#1f9d55' },
  { label: '주황', hex: '#e8590c' },
  { label: '보라', hex: '#7048e8' },
  { label: '검정', hex: '#212529' },
]

const SEMANTIC = [
  'background', 'foreground', 'card', 'popover', 'primary', 'primary-foreground', 'primary-dark', 'primary-light',
  'secondary', 'secondary-foreground', 'muted', 'muted-foreground', 'accent', 'destructive', 'destructive-dark', 'destructive-soft',
  'info', 'info-soft', 'success', 'success-soft', 'warning', 'warning-soft', 'border', 'input', 'ring',
  'surface', 'surface-2', 'surface-3', 'surface-4', 'surface-hover', 'border-light', 'border-lighter', 'border-subtle',
  'text-1', 'text-2', 'text-3', 'text-4', 'text-5', 'text-6',
]
const EDIT = ['edit-select', 'editor-point-selected', 'edit-slot-ch', 'edit-slot-ju', 'edit-slot-jo', 'edit-slot-off', 'edit-ghost', 'edit-guide', 'edit-baseline']
const FONT_STEPS = [10, 11, 12, 13, 14, 16, 18, 20, 24, 28]
const WEIGHTS: [string, string][] = [['medium', '500'], ['semibold', '600'], ['bold', '700'], ['heavy', '800']]
const RADII = ['xs', 'sm', 'md', 'lg', 'xl', 'full']
const SHADOWS = ['sm', 'md', 'overlay']
const SPACES = [1, 2, 3, 4, 5, 6]

const VARIANTS: NonNullable<ButtonProps['variant']>[] = ['default', 'primary', 'secondary', 'outline', 'ghost', 'destructive', 'plain', 'quiet', 'link', 'faint', 'soft']
const SIZES: NonNullable<ButtonProps['size']>[] = ['sm', 'default', 'lg', 'icon', 'icon-lg']

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  return <section className="flex flex-col gap-3 border-t border-border-subtle pt-6">
    <div>
      <h2 className="text-18 font-bold">{title}</h2>
      {note && <p className="mt-1 text-13 text-text-dim-4">{note}</p>}
    </div>
    {children}
  </section>
}

/** 토큰 하나의 지금 값(미리보기가 덮었으면 그 값). */
const tokenValue = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim()

function Swatch({ name }: { name: string }) {
  const value = tokenValue(`--color-${name}`)
  return <div className="flex min-w-0 items-center gap-2.5">
    <span className="size-10 shrink-0 rounded-md border border-border-subtle" style={{ background: `rgb(${value})` }} />
    <span className="min-w-0">
      <code className="block truncate text-12 font-semibold">{name}</code>
      <code className="block text-11 text-text-dim-5">{value}</code>
    </span>
  </div>
}

function ThemeHandles({ preview, onChange }: { preview: ThemePreview; onChange: (next: ThemePreview) => void }) {
  return <div className="flex flex-col gap-4 rounded-lg bg-card p-4 shadow-sm">
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-12 text-13 font-semibold text-text-dim-3">주색</span>
      {PRIMARY_CHOICES.map((choice) => {
        const on = (preview.primary ?? null) === choice.hex
        return <button
          key={choice.label}
          type="button"
          onClick={() => onChange({ ...preview, primary: choice.hex ?? undefined })}
          aria-pressed={on}
          className="flex h-9 items-center gap-2 rounded-full border border-border px-3 text-13 font-semibold aria-pressed:border-foreground"
        >
          <span className="size-4 rounded-full" style={{ background: choice.hex ?? 'rgb(var(--palette-blue-500))' }} />{choice.label}
        </button>
      })}
      <label className="flex h-9 items-center gap-2 rounded-full border border-border px-3 text-13 font-semibold">
        <input type="color" className="size-5 cursor-pointer border-0 bg-transparent p-0" value={preview.primary ?? '#2f6fed'} onChange={(event) => onChange({ ...preview, primary: event.target.value })} />직접
      </label>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      <span className="w-12 text-13 font-semibold text-text-dim-3">테마</span>
      <Button variant={preview.theme === 'dark' ? 'outline' : 'default'} size="sm" onClick={() => onChange({ ...preview, theme: 'light' })}>밝게</Button>
      <Button variant={preview.theme === 'dark' ? 'default' : 'outline'} size="sm" disabled title="다크 값은 5단계에서 채운다">어둡게</Button>
      <span className="text-12 text-text-dim-5">어둡게는 5단계(값이 아직 없다)</span>
    </div>
    <p className="text-12 text-text-dim-4">이 브라우저에만 저장된다. 다른 탭에 열린 화면도 바로 따라 바뀐다. 정해지면 `src/index.css`에 굳힌다.</p>
  </div>
}

export function StyleGuideLabPage() {
  const [preview, setPreview] = useState<ThemePreview>(() => readThemePreview(window.localStorage))
  // 미리보기가 바뀌면 견본 값을 다시 읽는다.
  const [, setTick] = useState(0)
  useEffect(() => {
    applyThemePreview(document.documentElement, preview)
    writeThemePreview(window.localStorage, preview)
    setTick((tick) => tick + 1)
  }, [preview])

  return <main className="min-h-dvh bg-background text-foreground" data-testid="style-guide-lab">
    <div className="mx-auto grid max-w-[1280px] gap-8 px-6 py-8 lg:grid-cols-[minmax(0,1fr)_400px]">
      <div className="flex min-w-0 flex-col gap-8">
        <header className="flex flex-col gap-2">
          <h1 className="text-28 font-extrabold">스타일가이드</h1>
          <p className="text-14 text-text-dim-4">토큰 세 층(원색 → 의미 색 → 편집 색)과 단계, 공용 부품. 모든 견본은 실제 토큰 · 부품으로 그린다.</p>
        </header>

        <ThemeHandles preview={preview} onChange={setPreview} />

        <Section title="의미 색" note="화면은 이 층만 쓴다. 테마가 바꾸는 층. 앞쪽이 shadcn 표준 이름.">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">{SEMANTIC.map((name) => <Swatch key={name} name={name} />)}</div>
        </Section>

        <Section title="편집 색" note="캔버스 안 선택 · 영역 · 고스트 · 격자. 테마가 바뀌어도 그대로. 보선 · 띠는 4단계에서 더한다.">
          <div className="grid grid-cols-[repeat(auto-fill,minmax(180px,1fr))] gap-3">{EDIT.map((name) => <Swatch key={name} name={name} />)}</div>
        </Section>

        <Section title="글자 크기" note="20 위는 머리글(24 · 28)만. 큰 한글 견본은 단계 밖.">
          <div className="flex flex-col gap-2">{FONT_STEPS.map((size) => <div key={size} className="flex items-baseline gap-4">
            <code className="w-16 shrink-0 text-12 text-text-dim-5">--font-{size}</code>
            <span style={{ fontSize: `var(--font-${size})` }}>다람쥐 헌 쳇바퀴에 타고파 Aa 123</span>
          </div>)}</div>
        </Section>

        <Section title="굵기">
          <div className="flex flex-wrap gap-6">{WEIGHTS.map(([name, value]) => <div key={name} className="flex flex-col gap-1">
            <span className="text-20" style={{ fontWeight: `var(--weight-${name})` }}>한글 폰트</span>
            <code className="text-12 text-text-dim-5">{name} {value}</code>
          </div>)}</div>
        </Section>

        <Section title="모서리 · 그림자 · 간격">
          <div className="flex flex-wrap gap-4">{RADII.map((name) => <div key={name} className="flex flex-col items-center gap-1.5">
            <span className="size-14 border border-border bg-surface-3" style={{ borderRadius: `var(--radius-${name})` }} />
            <code className="text-12 text-text-dim-5">{name} {tokenValue(`--radius-${name}`)}</code>
          </div>)}</div>
          <div className="flex flex-wrap gap-6 py-2">{SHADOWS.map((name) => <div key={name} className="flex flex-col items-center gap-2">
            <span className="h-14 w-24 rounded-md bg-card" style={{ boxShadow: `var(--shadow-${name})` }} />
            <code className="text-12 text-text-dim-5">{name}</code>
          </div>)}</div>
          <div className="flex flex-wrap items-end gap-4">{SPACES.map((step) => <div key={step} className="flex flex-col items-center gap-1.5">
            <span className="bg-primary/30" style={{ width: `var(--space-${step})`, height: `var(--space-${step})` }} />
            <code className="text-12 text-text-dim-5">space-{step}</code>
          </div>)}</div>
        </Section>

        <Section title="단추 Button" note="강조 × 크기. plain · quiet · soft와 크기 icon-lg · row는 계정 화면(G0), link · faint는 글로벌 스타일(G1)에서 더했다.">
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-x-3 border-spacing-y-2 text-left">
              <thead><tr>
                <th className="text-12 font-semibold text-text-dim-5">강조 \ 크기</th>
                {SIZES.map((size) => <th key={size} className="text-12 font-semibold text-text-dim-5">{size}</th>)}
                <th className="text-12 font-semibold text-text-dim-5">disabled</th>
              </tr></thead>
              <tbody>{VARIANTS.map((variant) => <tr key={variant}>
                <th className="pr-2 text-13 font-semibold"><code>{variant}</code></th>
                {SIZES.map((size) => <td key={size}>
                  {size.startsWith('icon')
                    ? <Button variant={variant} size={size} aria-label="더하기"><Plus aria-hidden="true" /></Button>
                    : <Button variant={variant} size={size}>{size === 'sm' ? <><MessageCircle aria-hidden="true" />답 보기</> : '저장'}</Button>}
                </td>)}
                <td><Button variant={variant} disabled>저장</Button></td>
              </tr>)}</tbody>
            </table>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="soft" size="sm" data-highlight><MessageCircle aria-hidden="true" />soft · data-highlight</Button>
            <Button variant="plain" size="icon-lg" aria-label="뒤로"><ChevronLeft aria-hidden="true" /></Button>
          </div>
          <div className="w-80 rounded-lg bg-card px-4">
            <Button variant="plain" size="row"><strong className="flex-1">plain · row (목록 줄)</strong><ChevronRight className="text-text-dim-5" aria-hidden="true" /></Button>
          </div>
        </Section>

        <Section title="탭 Tabs" note="default(관리자) · underline · dock(글로벌 스타일 아래 탭 — 여기선 화면 바닥 고정을 풀어 그렸다).">
          <GuideTabs />
        </Section>

        <Section title="고르기 ChoiceGroup" note="radiogroup. tile(그림 + 이름, 크기 default · sm) · segment(회색 길 위 흰 알약) · pill(고른 것만 검정).">
          <GuideChoices />
        </Section>

        <Section title="항목 · 막대 Field · RangeBar · Checkbox" note="이름 왼쪽 · 값 오른쪽, 아래 채움 막대와 눈금. 체크는 tone primary · ink.">
          <GuideFields />
        </Section>

        <Section title="다음 부품" note="시트 · 대화상자 → 카드 → 칩 · 토글 → 입력 → 토스트 · 알림.">
          <p className="text-13 text-text-dim-4">아직 없음.</p>
        </Section>
      </div>

      <aside className="flex flex-col gap-2 lg:sticky lg:top-6 lg:self-start">
        <span className="text-13 font-semibold text-text-dim-3">계정 화면 미리보기</span>
        <iframe src="/account/feedback" title="계정 화면 미리보기" className="h-[720px] w-full rounded-lg border border-border bg-card" />
      </aside>
    </div>
  </main>
}

function GuideTabs() {
  const [tab, setTab] = useState('brush')
  const items = [['body', '네모꼴', Square], ['brush', '획', Columns3], ['beak', '부리', Type]] as const
  return <div className="flex flex-col gap-5">
    {(['default', 'underline'] as const).map((variant) => <Tabs key={variant} value={tab} onValueChange={setTab}>
      <TabsList variant={variant} aria-label={`탭 ${variant}`}>{items.map(([id, label]) => <TabsTrigger key={id} value={id}>{label}</TabsTrigger>)}</TabsList>
    </Tabs>)}
    <Tabs value={tab} onValueChange={setTab}>
      <TabsList variant="dock" aria-label="탭 dock" className="static w-[400px] translate-x-0">
        {items.map(([id, label, Icon]) => <TabsTrigger key={id} value={id} disabled={id === 'body'}><Icon aria-hidden="true" /><span>{label}</span>{id === 'body' && <small>개발 중이에요</small>}</TabsTrigger>)}
      </TabsList>
    </Tabs>
  </div>
}

function GuideChoices() {
  const [tile, setTile] = useState('a')
  const [seg, setSeg] = useState('a')
  return <div className="flex max-w-xl flex-col gap-5">
    <ChoiceGroup variant="tile" className="grid grid-cols-2 gap-2" aria-label="tile">
      {['a', 'b'].map((id) => <ChoiceItem key={id} checked={tile === id} onClick={() => setTile(id)}><Columns3 className="h-[52px] w-16" aria-hidden="true" /><strong>{id === 'a' ? '일반 붓' : '납작 붓'}</strong></ChoiceItem>)}
    </ChoiceGroup>
    <ChoiceGroup variant="tile" size="sm" className="grid grid-cols-6 gap-[5px]" aria-label="tile sm">
      {['a', 'b', 'c', 'd', 'e', 'f'].map((id) => <ChoiceItem key={id} checked={tile === id} onClick={() => setTile(id)}><svg viewBox="0 0 100 100" aria-hidden="true"><rect x="46" y="30" width="20" height="80" /></svg><span>모양 {id}</span></ChoiceItem>)}
    </ChoiceGroup>
    <ChoiceGroup variant="segment" aria-label="segment">
      {['a', 'b', 'c'].map((id) => <ChoiceItem key={id} checked={seg === id} onClick={() => setSeg(id)}>{`칸 ${id}`}</ChoiceItem>)}
    </ChoiceGroup>
    <ChoiceGroup variant="pill" aria-label="pill">
      {['a', 'b'].map((id) => <ChoiceItem key={id} checked={seg === id} onClick={() => setSeg(id)}>{id === 'a' ? '전체' : '「묶음」 12자'}</ChoiceItem>)}
    </ChoiceGroup>
  </div>
}

function GuideFields() {
  const [weight, setWeight] = useState(400)
  const [on, setOn] = useState(true)
  return <div className="flex max-w-md flex-col">
    <Field label="굵기" value={weight}>
      <RangeBar min={100} max={900} step={100} value={weight} onChange={(event) => setWeight(Number(event.target.value))} />
      <RangeTicks min={100} max={900} ticks={[100, 200, 300, 400, 500, 600, 700, 800, 900].map((at) => ({ at, text: at === 100 || at === 400 || at === 900 ? String(at) : undefined }))} />
    </Field>
    <Field label="꺼진 막대" value="–"><RangeBar min={0} max={100} value={30} disabled readOnly /></Field>
    <div className="flex items-center gap-6 pt-6">
      <label className="flex items-center gap-2 text-13 font-semibold"><Checkbox checked={on} onCheckedChange={(checked) => setOn(checked === true)} />primary</label>
      <label className="flex items-center gap-2 text-13 font-semibold"><Checkbox tone="ink" checked={on} onCheckedChange={(checked) => setOn(checked === true)} />ink</label>
    </div>
  </div>
}
