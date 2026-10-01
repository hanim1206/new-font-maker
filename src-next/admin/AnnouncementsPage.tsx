import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { ArrowDown, ArrowUp, ChevronLeft, ChevronRight, GripVertical, ImagePlus, Megaphone, Plus, Trash2 } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import {
  ANNOUNCEMENT_LIMITS, ANNOUNCEMENT_PLACES, ANNOUNCEMENT_STATUS_LABEL, announcementDraftProblem, placeLabelOf,
} from '../announcements'
import type { Announcement, AnnouncementDraft, AnnouncementPlace, AnnouncementSlide, AnnouncementStatus } from '../announcements'
import { SlideSheet } from '../SlideSheet'
import { ANNOUNCEMENT_API, adminCall, adminUpload, dateOf } from './adminApi'

const emptySlide = (): AnnouncementSlide => ({ image: '', title: '', body: '' })
const emptyDraft = (): AnnouncementDraft => ({ title: '', place: 'dashboard', slides: [emptySlide()] })
const draftOf = ({ title, place, slides }: Announcement): AnnouncementDraft => ({ title, place, slides: slides.map((slide) => ({ ...slide })) })
const sameDraft = (a: AnnouncementDraft, b: AnnouncementDraft) => JSON.stringify(a) === JSON.stringify(b)

const STATUS_VARIANT: Record<AnnouncementStatus, 'default' | 'alert' | 'muted'> = { draft: 'default', published: 'alert', archived: 'muted' }
const ERROR_TEXT = 'text-sm text-[rgb(214_69_65)]'

type Confirm = 'publish' | 'remove' | null

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1.5">
    <span className="flex items-center text-xs font-semibold text-text-dim-3">{label}{hint && <span className="ml-auto font-normal text-text-dim-5">{hint}</span>}</span>
    {children}
  </label>
}

/** 장 카드 하나. 윗줄에 번호 · 순서 · 지우기, 아래에 그림(3:4) + 제목 · 본문. */
function SlideCard({ slide, order, count, onChange, onMove, onRemove, onDragStart, onDrop }: {
  slide: AnnouncementSlide
  order: number
  count: number
  onChange: (patch: Partial<AnnouncementSlide>) => void
  onMove: (delta: number) => void
  onRemove: () => void
  onDragStart: () => void
  onDrop: () => void
}) {
  const file = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [over, setOver] = useState(false)

  const upload = async (picked: File | undefined) => {
    if (!picked) return
    setUploading(true)
    setError('')
    try {
      onChange({ image: (await adminUpload<{ url: string }>(`${ANNOUNCEMENT_API}/image`, picked)).url })
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setUploading(false)
      if (file.current) file.current.value = ''
    }
  }

  return <li
    className={cn('flex flex-col gap-3 rounded-xl bg-surface p-4 ring-1 ring-border-subtle transition-shadow', over && 'ring-2 ring-foreground/30')}
    onDragOver={(event) => { event.preventDefault(); setOver(true) }}
    onDragLeave={() => setOver(false)}
    onDrop={(event) => { event.preventDefault(); setOver(false); onDrop() }}
    data-testid={`announcement-slide-${order}`}
  >
    <div className="flex items-center gap-1">
      <span
        draggable
        onDragStart={(event) => { event.dataTransfer.effectAllowed = 'move'; onDragStart() }}
        className="-ml-1 flex h-7 w-6 cursor-grab items-center justify-center text-text-dim-5 active:cursor-grabbing"
        aria-label="끌어서 순서 바꾸기"
      ><GripVertical className="h-4 w-4" /></span>
      <strong className="text-sm font-bold">{order + 1}번째 장</strong>
      <span className="ml-auto flex items-center">
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={order === 0} onClick={() => onMove(-1)} aria-label="위로"><ArrowUp className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={order === count - 1} onClick={() => onMove(1)} aria-label="아래로"><ArrowDown className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" className="h-7 w-7" disabled={count === 1} onClick={onRemove} aria-label="장 지우기"><Trash2 className="h-4 w-4" /></Button>
      </span>
    </div>
    <div className="flex gap-4">
      <div className="flex w-28 shrink-0 flex-col gap-1.5">
        <button
          type="button"
          onClick={() => file.current?.click()}
          className="flex aspect-[3/4] w-full items-center justify-center overflow-hidden rounded-lg bg-surface-2 text-text-dim-4 ring-1 ring-border-subtle transition-colors hover:bg-surface-3"
          aria-label={slide.image ? '그림 바꾸기' : '그림 올리기'}
        >
          {slide.image
            ? <img src={slide.image} alt="" className="h-full w-full object-cover object-top" />
            : <span className="flex flex-col items-center gap-1.5 text-xs"><ImagePlus className="h-5 w-5" />{uploading ? '올리는 중…' : '그림 올리기'}</span>}
        </button>
        {slide.image && <button type="button" className="text-xs text-text-dim-5 hover:text-foreground" onClick={() => onChange({ image: '' })}>그림 빼기</button>}
      </div>
      <input ref={file} type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="hidden" onChange={(event) => void upload(event.target.files?.[0])} />
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <Field label="제목">
          <Input value={slide.title} maxLength={ANNOUNCEMENT_LIMITS.slideTitle} placeholder="붓 크기를 손끝으로" onChange={(event) => onChange({ title: event.target.value })} />
        </Field>
        <Field label="본문" hint={`${slide.body.length}/${ANNOUNCEMENT_LIMITS.slideBody}`}>
          <Textarea className="min-h-24 resize-y" value={slide.body} maxLength={ANNOUNCEMENT_LIMITS.slideBody} placeholder="두세 줄. 줄바꿈은 그대로 보여요." onChange={(event) => onChange({ body: event.target.value })} />
        </Field>
        {error && <p className={ERROR_TEXT}>{error}</p>}
      </div>
    </div>
  </li>
}

/** 공지 목록. 한 줄 = 이름 · 자리 · 장 수 · 상태. 누르면 편집. */
function AnnouncementList({ list, error, onOpen }: { list: Announcement[] | null; error: string; onOpen: (item: Announcement | 'new') => void }) {
  return <div className="flex max-w-3xl flex-col gap-4">
    <div className="flex items-center gap-3">
      <p className="text-sm text-text-dim-4">게시하면 고른 자리에 처음 들어온 사람한테 한 번 떠요.</p>
      <Button className="ml-auto shrink-0" onClick={() => onOpen('new')} data-testid="announcement-new"><Plus className="h-4 w-4" />새 공지</Button>
    </div>
    {error && <p className={ERROR_TEXT}>{error}</p>}
    {!list && !error && <p className="text-sm text-text-dim-4">불러오는 중…</p>}
    {list?.length === 0 && <div className="flex flex-col items-start gap-3 rounded-xl bg-surface p-6 ring-1 ring-border-subtle">
      <Megaphone className="h-5 w-5 text-text-dim-4" />
      <strong className="text-base font-bold">아직 공지가 없어요</strong>
      <p className="text-sm leading-relaxed text-text-dim-4">기능이 바뀌면 그림 몇 장으로 알려 주세요. 자리를 고르면 그 화면에 처음 들어온 사람한테만 떠요.</p>
    </div>}
    {!!list?.length && <ul className="flex flex-col divide-y divide-border-subtle overflow-hidden rounded-xl bg-surface ring-1 ring-border-subtle">
      {list.map((item) => <li key={item.id}>
        <button type="button" onClick={() => onOpen(item)} className="flex w-full items-center gap-4 px-4 py-3 text-left transition-colors hover:bg-surface-2">
          <span className="flex aspect-[3/4] w-10 shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-2 ring-1 ring-border-subtle">
            {item.slides[0]?.image ? <img src={item.slides[0].image} alt="" className="h-full w-full object-cover object-top" /> : <Megaphone className="h-4 w-4 text-text-dim-5" />}
          </span>
          <span className="flex min-w-0 flex-1 flex-col gap-0.5">
            <strong className="truncate text-sm">{item.title}</strong>
            <span className="truncate text-xs text-text-dim-5">{placeLabelOf(item.place)} · {item.slides.length}장 · {item.publishedAt ? `게시 ${dateOf(item.publishedAt)}` : `고침 ${dateOf(item.updatedAt)}`}</span>
          </span>
          <Badge variant={STATUS_VARIANT[item.status]} className="shrink-0">{ANNOUNCEMENT_STATUS_LABEL[item.status]}</Badge>
          <ChevronRight className="h-4 w-4 shrink-0 text-text-dim-5" />
        </button>
      </li>)}
    </ul>}
  </div>
}

/**
 * 관리자 공지 화면. 목록 → 누르면 편집(왼쪽 폼 · 오른쪽에 유저가 볼 판 그대로 미리보기).
 * 게시하면 고른 자리에 처음 들어온 사람한테 한 번 뜬다(가입 전 게시분 · 읽은 사람 제외). 내리면 더 안 뜬다.
 */
export function AnnouncementsPage() {
  const [list, setList] = useState<Announcement[] | null>(null)
  const [error, setError] = useState('')
  /** 고치는 공지 id. `new`면 아직 저장 안 한 새 공지, null이면 목록. */
  const [selected, setSelected] = useState<string | null>(null)
  const [draft, setDraft] = useState<AnnouncementDraft>(emptyDraft)
  const [busy, setBusy] = useState(false)
  const [confirm, setConfirm] = useState<Confirm>(null)
  const dragFrom = useRef<number | null>(null)

  const refresh = useCallback(async () => {
    try {
      setList((await adminCall<{ announcements: Announcement[] }>(ANNOUNCEMENT_API)).announcements)
      setError('')
    } catch (failure) {
      setError((failure as Error).message)
    }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const saved = list?.find((item) => item.id === selected) ?? null
  const dirty = selected === 'new' || (saved !== null && !sameDraft(draftOf(saved), draft))
  const problem = announcementDraftProblem(draft)

  const leave = () => !dirty || window.confirm('저장하지 않은 고침이 있어요. 버리고 나갈까요?')
  const open = (item: Announcement | 'new') => {
    setSelected(item === 'new' ? 'new' : item.id)
    setDraft(item === 'new' ? emptyDraft() : draftOf(item))
    setError('')
  }
  const back = () => {
    if (!leave()) return
    setSelected(null)
    setError('')
  }

  const setSlides = (slides: AnnouncementSlide[]) => setDraft((value) => ({ ...value, slides }))
  const moveSlide = (from: number, to: number) => {
    if (to < 0 || to >= draft.slides.length || from === to) return
    const slides = [...draft.slides]
    const [moved] = slides.splice(from, 1)
    slides.splice(to, 0, moved)
    setSlides(slides)
  }

  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    try {
      await work()
      setError('')
    } catch (failure) {
      setError((failure as Error).message)
    } finally {
      setBusy(false)
    }
  }

  /** 저장하고 저장된 공지를 돌려준다. 고친 게 없으면 그대로. */
  const save = async (): Promise<Announcement> => {
    if (saved && !dirty) return saved
    const { announcement } = selected === 'new'
      ? await adminCall<{ announcement: Announcement }>(ANNOUNCEMENT_API, 'POST', { draft })
      : await adminCall<{ announcement: Announcement }>(ANNOUNCEMENT_API, 'PATCH', { id: selected, draft })
    setList((value) => [announcement, ...(value ?? []).filter((item) => item.id !== announcement.id)])
    setSelected(announcement.id)
    setDraft(draftOf(announcement))
    return announcement
  }

  const setStatus = (status: AnnouncementStatus) => run(async () => {
    const target = await save()
    const { announcement } = await adminCall<{ announcement: Announcement }>(ANNOUNCEMENT_API, 'PATCH', { id: target.id, status })
    setList((value) => (value ?? []).map((item) => item.id === announcement.id ? announcement : item))
  })

  const remove = () => run(async () => {
    if (!saved) return
    await adminCall(ANNOUNCEMENT_API, 'DELETE', { id: saved.id })
    setList((value) => (value ?? []).filter((item) => item.id !== saved.id))
    setSelected(null)
  })

  if (!selected) return <div data-testid="admin-announcements"><AnnouncementList list={list} error={error} onOpen={open} /></div>

  const status = saved?.status ?? 'draft'

  return <div className="flex flex-col gap-5" data-testid="admin-announcements">
    {/* 머리: 목록으로 · 상태 · 저장 · 게시. */}
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="ghost" size="sm" className="-ml-2" onClick={back}><ChevronLeft className="h-4 w-4" />목록</Button>
      <Badge variant={STATUS_VARIANT[status]}>{selected === 'new' ? '새 공지' : ANNOUNCEMENT_STATUS_LABEL[status]}</Badge>
      {dirty && selected !== 'new' && <span className="text-xs text-text-dim-5">저장 안 한 고침</span>}
      <span className="ml-auto flex items-center gap-2">
        {saved && status !== 'published' && <Button variant="ghost" disabled={busy} onClick={() => setConfirm('remove')}>지우기</Button>}
        <Button variant="outline" disabled={busy || !dirty || !!problem} onClick={() => void run(async () => { await save() })} data-testid="announcement-save">저장</Button>
        {status !== 'published'
          ? <Button disabled={busy || !!problem} onClick={() => setConfirm('publish')} data-testid="announcement-publish">게시</Button>
          : <Button variant="secondary" disabled={busy} onClick={() => void setStatus('archived')} data-testid="announcement-archive">내리기</Button>}
      </span>
    </div>
    {error && <p className={ERROR_TEXT}>{error}</p>}
    {!error && problem && <p className="-mt-2 text-right text-xs text-text-dim-5">{problem}</p>}
    {status === 'published' && dirty && <p className="-mt-2 text-xs text-text-dim-4">게시 중인 공지예요. 저장하면 바로 바뀌지만, 이미 읽은 사람에겐 다시 뜨지 않아요.</p>}

    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_340px]">
      <section className="flex min-w-0 flex-col gap-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="공지 이름" hint="팝업 장 제목 위에 작게 보여요">
            <Input
              value={draft.title}
              maxLength={ANNOUNCEMENT_LIMITS.title}
              placeholder="붓 트랙패드 크기 조절"
              onChange={(event) => setDraft((value) => ({ ...value, title: event.target.value }))}
              data-testid="announcement-title"
            />
          </Field>
          <Field label="뜨는 자리">
            <Select value={draft.place} onValueChange={(place) => setDraft((value) => ({ ...value, place: place as AnnouncementPlace }))}>
              <SelectTrigger aria-label="뜨는 자리"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ANNOUNCEMENT_PLACES.map((place) => <SelectItem key={place.key} value={place.key}>
                  {place.label}<span className="ml-2 text-text-dim-5">{place.hint}</span>
                </SelectItem>)}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="flex flex-col gap-3">
          <div className="flex items-center">
            <h2 className="text-sm font-bold">장 <span className="font-normal text-text-dim-5">{draft.slides.length}/{ANNOUNCEMENT_LIMITS.slides}</span></h2>
            <Button
              variant="outline"
              size="sm"
              className="ml-auto"
              disabled={draft.slides.length >= ANNOUNCEMENT_LIMITS.slides}
              onClick={() => setSlides([...draft.slides, emptySlide()])}
            ><Plus className="h-3.5 w-3.5" />장 추가</Button>
          </div>
          <ol className="flex flex-col gap-3">
            {draft.slides.map((slide, order) => <SlideCard
              key={order}
              slide={slide}
              order={order}
              count={draft.slides.length}
              onChange={(patch) => setSlides(draft.slides.map((item, at) => at === order ? { ...item, ...patch } : item))}
              onMove={(delta) => moveSlide(order, order + delta)}
              onRemove={() => setSlides(draft.slides.filter((_, at) => at !== order))}
              onDragStart={() => { dragFrom.current = order }}
              onDrop={() => { if (dragFrom.current !== null) moveSlide(dragFrom.current, order); dragFrom.current = null }}
            />)}
          </ol>
        </div>
      </section>

      <aside className="flex min-w-0 flex-col gap-2 lg:sticky lg:top-20">
        <span className="text-xs font-semibold text-text-dim-3">미리보기</span>
        <div className="flex justify-center rounded-xl bg-surface-3 px-4 py-6">
          <SlideSheet
            inline
            slides={draft.slides.map((slide, order) => ({ ...slide, title: slide.title || `${order + 1}번째 장` }))}
            label={draft.title || '공지 미리보기'}
            eyebrow={draft.title.trim() || undefined}
            centered
            testId="announcement-preview"
            firstLabel="닫기"
            lastLabel="확인"
            onClose={() => {}}
          />
        </div>
        <span className="text-xs text-text-dim-5">유저가 보는 판 그대로예요. 좌우로 넘겨 보세요.</span>
      </aside>
    </div>

    <AlertDialog open={confirm !== null} onOpenChange={(value) => { if (!value) setConfirm(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{confirm === 'publish' ? '이 공지를 게시할까요?' : '이 공지를 지울까요?'}</AlertDialogTitle>
          <AlertDialogDescription>
            {confirm === 'publish'
              ? `‘${placeLabelOf(draft.place)}’ 자리에 처음 들어온 사람한테 한 번 떠요. 지금 있는 계정만 보고, 나중에 가입한 사람은 둘러보기를 봐요.`
              : '지우면 되돌릴 수 없어요. 올린 그림은 버킷에 남아요.'}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>그만두기</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => { if (confirm === 'publish') void setStatus('published'); else void remove(); setConfirm(null) }}
            data-testid="announcement-confirm"
          >{confirm === 'publish' ? '게시' : '지우기'}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  </div>
}
