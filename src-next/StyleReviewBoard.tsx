/* eslint-disable react-refresh/only-export-components -- 실험실 한 화면의 부품 · 훅 · 항목 표를 한 파일에 둔다 */
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Check, Copy, Plus, Undo2 } from 'lucide-react'
import { BUTTON_BASE, BUTTON_SIZES, BUTTON_VARIANTS, Button } from './components/ui/button'
import { EMPTY_REVIEW, fingerprintOf, reviewStatusOf } from './styleReview'
import type { ReviewFile, ReviewMark, ReviewStatus } from './styleReview'

/**
 * 스타일가이드 검토판(docs/plans/2026-10-03_스타일가이드-검토판.md). 항목 하나 = 카드 하나:
 * 번호 · 실물(상태별) · 값 한 줄 · 쓰는 곳, 그리고 확정 · 요청. 기록은 개발 서버 플러그인이 `src-next/style-review.json`에 쓴다.
 */

const API = '/api/style-review'
const HEADERS = { 'content-type': 'application/json', 'x-beta-admin': '1' }

interface Use { file: string; line: number }
interface Usage { button: { variant: Record<string, Use[]>; size: Record<string, Use[]> } }

export interface StyleReview {
  review: ReviewFile
  usage: Usage | null
  error: string | null
  mark: (id: string, change: { mark: ReviewMark; fingerprint: string; note?: string } | null) => Promise<void>
}

export function useStyleReview(): StyleReview {
  const [review, setReview] = useState<ReviewFile>(EMPTY_REVIEW)
  const [usage, setUsage] = useState<Usage | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    fetch(API, { headers: HEADERS }).then(async (response) => {
      const body = await response.json() as { review?: ReviewFile; usage?: Usage; error?: string }
      if (!response.ok) throw new Error(body.error ?? response.statusText)
      setReview(body.review ?? EMPTY_REVIEW)
      setUsage(body.usage ?? null)
    }).catch((reason: unknown) => setError(`기록을 못 읽었어요: ${reason instanceof Error ? reason.message : String(reason)}`))
  }, [])
  const mark = useCallback(async (id: string, change: { mark: ReviewMark; fingerprint: string; note?: string } | null) => {
    try {
      const response = await fetch(API, { method: 'POST', headers: HEADERS, body: JSON.stringify({ id, mark: change?.mark ?? null, fingerprint: change?.fingerprint, note: change?.note }) })
      const body = await response.json() as { review?: ReviewFile; error?: string }
      if (!response.ok || !body.review) throw new Error(body.error ?? response.statusText)
      setReview(body.review)
      setError(null)
    } catch (reason) {
      setError(`저장 못 했어요: ${reason instanceof Error ? reason.message : String(reason)}`)
    }
  }, [])
  return { review, usage, error, mark }
}

/** 화면 위 집계와 거르기. */
export type ReviewFilter = 'all' | 'todo' | 'request' | 'ok'

const STATUS_LABEL: Record<ReviewStatus, string> = { ok: '확정', request: '요청 있음', unseen: '안 봄', changed: '고침 · 다시 봐 주세요' }
const STATUS_TONE: Record<ReviewStatus, string> = {
  ok: 'border-success bg-success-soft/40',
  request: 'border-warning bg-warning-soft/50',
  changed: 'border-primary bg-primary-light/40',
  unseen: 'border-border bg-card',
}
const PILL_TONE: Record<ReviewStatus, string> = {
  ok: 'bg-success text-inverse-foreground',
  request: 'bg-warning text-inverse-foreground',
  changed: 'bg-primary text-primary-foreground',
  unseen: 'bg-surface-3 text-text-dim-3',
}

export const matchesFilter = (status: ReviewStatus, filter: ReviewFilter) =>
  filter === 'all' || (filter === 'todo' ? status === 'unseen' || status === 'changed' : status === filter)

export function ReviewSummary({ statuses, filter, onFilter }: { statuses: ReviewStatus[]; filter: ReviewFilter; onFilter: (next: ReviewFilter) => void }) {
  const count = (test: (status: ReviewStatus) => boolean) => statuses.filter(test).length
  const chips: [ReviewFilter, string, number][] = [
    ['all', '전체', statuses.length],
    ['todo', '볼 것', count((status) => status === 'unseen' || status === 'changed')],
    ['request', '요청', count((status) => status === 'request')],
    ['ok', '확정', count((status) => status === 'ok')],
  ]
  return <div className="flex flex-wrap items-center gap-2" role="group" aria-label="검토 거르기">
    {chips.map(([id, label, n]) => <Button key={id} type="button" variant="chip" size="chip" aria-pressed={filter === id} onClick={() => onFilter(id)}>{label} {n}</Button>)}
  </div>
}

/** 실물 하나가 실제로 그려진 값. 색은 토큰 이름으로 되읽는다. */
function useMeasured(ref: React.RefObject<HTMLElement | null>, key: string) {
  const [text, setText] = useState('')
  useLayoutEffect(() => {
    const element = ref.current?.querySelector('button')
    if (!element) return
    const style = getComputedStyle(element)
    const root = getComputedStyle(document.documentElement)
    const tokenOf = (value: string) => {
      const rgb = value.match(/\d+(\.\d+)?/g)
      if (!rgb || (rgb.length === 4 && Number(rgb[3]) === 0)) return '투명'
      const triplet = rgb.slice(0, 3).join(' ')
      for (const name of TOKEN_NAMES) if (root.getPropertyValue(`--color-${name}`).trim() === triplet) return name
      return triplet
    }
    const parts = [
      `높이 ${Math.round(element.getBoundingClientRect().height)}`,
      `글자 ${parseFloat(style.fontSize)} · ${style.fontWeight}`,
      `모서리 ${parseFloat(style.borderTopLeftRadius) > 500 ? '둥근 끝' : Math.round(parseFloat(style.borderTopLeftRadius))}`,
      `바탕 ${tokenOf(style.backgroundColor)}`,
      `글자색 ${tokenOf(style.color)}`,
    ]
    if (parseFloat(style.borderTopWidth) > 0) parts.push(`테두리 ${tokenOf(style.borderTopColor)}`)
    setText(parts.join(' · '))
  }, [ref, key])
  return text
}

const TOKEN_NAMES = ['foreground', 'background', 'surface', 'surface-2', 'surface-3', 'surface-4', 'primary', 'primary-foreground', 'primary-light', 'primary-dark', 'secondary', 'secondary-foreground', 'destructive', 'destructive-foreground', 'border', 'text-1', 'text-2', 'text-3', 'text-4', 'text-5', 'text-6', 'inverse-foreground']

export function ReviewCard({ id, title, note: description, fingerprint, status, record, uses, samples, onMark }: {
  id: string
  title: string
  note?: string
  fingerprint: string
  status: ReviewStatus
  record?: { at: string; note?: string }
  uses: Use[]
  samples: { label: string; node: ReactNode }[]
  onMark: (change: { mark: ReviewMark; fingerprint: string; note?: string } | null) => Promise<void>
}) {
  const [writing, setWriting] = useState(false)
  const [draft, setDraft] = useState(record?.note ?? '')
  const [copied, setCopied] = useState(false)
  const sampleRef = useRef<HTMLDivElement>(null)
  const measured = useMeasured(sampleRef, fingerprint)
  const copy = () => {
    navigator.clipboard?.writeText(id).then(() => { setCopied(true); window.setTimeout(() => setCopied(false), 1200) }).catch(() => undefined)
  }
  return <article className={`flex min-w-0 flex-col gap-3 rounded-lg border-2 p-4 ${STATUS_TONE[status]}`} data-review-id={id} data-review-status={status}>
    <header className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 className="text-16 font-bold">{title}</h3>
        <button type="button" onClick={copy} className="mt-0.5 inline-flex items-center gap-1 rounded-xs text-12 text-text-dim-4 hover:text-foreground" title="번호 복사">
          <code>{id}</code>{copied ? <Check className="size-3.5" aria-hidden="true" /> : <Copy className="size-3.5" aria-hidden="true" />}
        </button>
      </div>
      <span className={`shrink-0 rounded-full px-2.5 py-1 text-11 font-bold ${PILL_TONE[status]}`}>{status === 'ok' ? '✔ ' : status === 'request' ? '✎ ' : ''}{STATUS_LABEL[status]}{status === 'ok' && record ? ` · ${record.at.slice(5)}` : ''}</span>
    </header>
    {description && <p className="text-13 text-text-dim-4">{description}</p>}
    <div ref={sampleRef} className="flex flex-wrap items-end gap-4 rounded-md bg-surface px-4 py-4">
      {samples.map((sample) => <div key={sample.label} className="flex flex-col items-start gap-1.5">
        {sample.node}
        <span className="text-11 text-text-dim-5">{sample.label}</span>
      </div>)}
    </div>
    <p className="text-12 tabular-nums text-text-dim-4">{measured}</p>
    <details className="text-12 text-text-dim-4">
      <summary className="cursor-pointer">쓰는 곳 {uses.length}</summary>
      <ul className="mt-1 flex flex-col gap-0.5">{uses.map((use) => <li key={`${use.file}:${use.line}`}><code>{use.file}:{use.line}</code></li>)}</ul>
    </details>
    {(status === 'request' || status === 'changed') && record?.note && <p className={`rounded-md px-3 py-2 text-13 ${status === 'changed' ? 'bg-surface text-text-dim-4 line-through' : 'bg-surface font-semibold'}`}>✎ {record.note}</p>}
    {writing
      ? <div className="flex flex-col gap-2">
        <textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={2} autoFocus placeholder="예: 높이 52로, 회색을 조금 더 옅게" className="w-full resize-y rounded-md border border-border bg-surface px-3 py-2 text-14" />
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="default" disabled={!draft.trim()} onClick={() => { void onMark({ mark: 'request', fingerprint, note: draft }); setWriting(false) }}>요청 남기기</Button>
          <Button type="button" size="sm" variant="ghost" onClick={() => setWriting(false)}>취소</Button>
        </div>
      </div>
      : <div className="flex flex-wrap gap-2">
        {status !== 'ok' && <Button type="button" size="sm" variant="default" onClick={() => void onMark({ mark: 'ok', fingerprint })}><Check aria-hidden="true" />OK</Button>}
        <Button type="button" size="sm" variant="outline" onClick={() => { setDraft(status === 'request' ? record?.note ?? '' : ''); setWriting(true) }}>{status === 'request' ? '요청 고치기' : '요청 적기'}</Button>
        {(status === 'ok' || status === 'request') && <Button type="button" size="sm" variant="ghost" onClick={() => void onMark(null)}><Undo2 aria-hidden="true" />{status === 'ok' ? '확정 풀기' : '요청 지우기'}</Button>}
      </div>}
  </article>
}

/** 단추 항목: 강조 12 · 크기 11. 지문은 그 강조 · 크기의 클래스 묶음(+ 바탕). */
const VARIANT_INFO: Record<keyof typeof BUTTON_VARIANTS, [string, string]> = {
  default: ['검정', '가장 강한 할 일. 시트 아래 오른쪽 · 다운로드 · 저장.'],
  primary: ['주색', '주색을 쓰는 할 일. 지금 제품 화면에서는 거의 안 쓴다.'],
  secondary: ['회색', '취소 · 덜 중요한 할 일. 시트 아래 왼쪽.'],
  outline: ['테두리', '흰 바탕에 테두리. 오류 화면 백업 · 범위 고르기 취소.'],
  ghost: ['옅은 글자 + 누르면 회색', '도구 줄의 가벼운 단추.'],
  destructive: ['빨강', '지우기처럼 되돌릴 수 없는 일.'],
  plain: ['투명 · 검정 글자', '뒤로 · 계정 · 목록 줄.'],
  quiet: ['투명 · 옅은 글자', '로그아웃처럼 눈에 안 띄어야 하는 것.'],
  link: ['밑줄 글자', '`바깥과 같이` 같은 작은 되돌림.'],
  faint: ['더 옅은 글자', '`처음 값으로` 되돌리기.'],
  chip: ['칩', '고르면 검정. 묶기 · 범위 고르기.'],
  soft: ['옅은 알약', '`한임 답 보기`. 새 답이면 주색.'],
}
const SIZE_INFO: Record<keyof typeof BUTTON_SIZES, [string, string]> = {
  default: ['기본', '보통 단추.'],
  sm: ['작게', '카드 안 · 도구 줄.'],
  lg: ['크게', '눈에 띄어야 하는 한 줄 단추.'],
  icon: ['아이콘', '네모 아이콘 단추.'],
  'icon-md': ['둥근 아이콘 40', '폰트 카드 ··· · 다운로드 · 계정.'],
  'icon-lg': ['둥근 아이콘 44', '머리의 뒤로.'],
  block: ['꽉 찬 단추', '오류 · 로그인 카드에 위아래로 쌓는 단추.'],
  sheet: ['시트 큰 단추', '하단 드로어 아래 단추(취소 · 다운로드).'],
  chip: ['칩', '고르기 칩.'],
  'chip-sm': ['작은 칩', '좁은 시트 안 칩.'],
  row: ['목록 줄', '계정 화면의 `내가 보낸 의견`처럼 한 줄 전체.'],
}

type Variant = keyof typeof BUTTON_VARIANTS
type Size = keyof typeof BUTTON_SIZES
const isIconSize = (size: Size) => size.startsWith('icon')
const sampleSizeFor = (variant: Variant): Size => variant === 'chip' ? 'chip' : 'default'

export interface ButtonReviewItem { id: string; title: string; note: string; fingerprint: string; uses: Use[]; samples: { label: string; node: ReactNode }[] }

export function buttonReviewItems(usage: Usage | null): ButtonReviewItem[] {
  const variants = (Object.keys(BUTTON_VARIANTS) as Variant[]).map((variant) => {
    const size = sampleSizeFor(variant)
    const samples = [
      { label: '기본', node: <Button type="button" variant={variant} size={size}>저장하기</Button> },
      { label: '비활성', node: <Button type="button" variant={variant} size={size} disabled>저장하기</Button> },
    ]
    if (variant === 'chip') samples.push({ label: '고름', node: <Button type="button" variant="chip" size="chip" aria-pressed>저장하기</Button> })
    if (variant === 'soft') samples.push({ label: '새 소식(data-highlight)', node: <Button type="button" variant="soft" size="sm" data-highlight>저장하기</Button> })
    return { id: `button.variant.${variant}`, title: `단추 강조 · ${VARIANT_INFO[variant][0]}`, note: VARIANT_INFO[variant][1], fingerprint: fingerprintOf(BUTTON_BASE, BUTTON_VARIANTS[variant]), uses: usage?.button.variant[variant] ?? [], samples }
  })
  const sizes = (Object.keys(BUTTON_SIZES) as Size[]).map((size) => {
    const label = isIconSize(size) ? <Plus aria-hidden="true" /> : size === 'row' ? <strong className="flex-1">내가 보낸 의견</strong> : '저장하기'
    const samples = size === 'row'
      ? [{ label: '목록 줄 · 투명', node: <div className="w-64"><Button type="button" variant="plain" size="row">{label}</Button></div> }]
      : [
        { label: '검정', node: <Button type="button" variant="default" size={size} aria-label={isIconSize(size) ? '더하기' : undefined}>{label}</Button> },
        { label: '회색', node: <Button type="button" variant="secondary" size={size} aria-label={isIconSize(size) ? '더하기' : undefined}>{label}</Button> },
      ]
    return { id: `button.size.${size}`, title: `단추 크기 · ${SIZE_INFO[size][0]}`, note: SIZE_INFO[size][1], fingerprint: fingerprintOf(BUTTON_BASE, BUTTON_SIZES[size]), uses: usage?.button.size[size] ?? [], samples }
  })
  return [...variants, ...sizes]
}

export function statusOfItem(review: ReviewFile, item: { id: string; fingerprint: string }): ReviewStatus {
  return reviewStatusOf(review.items[item.id], item.fingerprint)
}
