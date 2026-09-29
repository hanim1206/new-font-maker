import { useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { FontDataGlyph } from '../fontDataGlyph'
import { previewFontOf } from '../previewFont'
import { SAMPLE_SENTENCES } from '../sampleSentences'
import { BETA_INVITE_API, adminCall, dateOf, dayOf } from './adminApi'
import { MEMO_MAX_LENGTH, nicknameProblemOf } from './accountProfile'
import type { Account, BetaInvites } from './useBetaInvites'

interface AccountFont { id: string; name: string; createdAt: string; updatedAt: string; fontData: unknown }

const GLYPH_SIZE = 44
const isSyllable = (char: string) => char >= '가' && char <= '힣'

/** 한 폰트 카드. 이름 · 고친 때 · 미리보기 문장. 폰트 JSON이 틀리면 까닭만 적는다. */
function FontCard({ font, text }: { font: AccountFont; text: string }) {
  const prepared = useMemo(() => previewFontOf(font.fontData), [font.fontData])
  return <section className="flex flex-col gap-3 rounded-lg bg-surface-2 p-4" data-testid="admin-account-font">
    <div className="flex items-baseline gap-2">
      <strong className="text-base font-bold">{font.name}</strong>
      <span className="text-xs text-text-dim-4">고친 때 {dateOf(font.updatedAt)} · 만든 때 {dateOf(font.createdAt)}</span>
    </div>
    {prepared.ok
      ? <p className="flex flex-wrap items-center gap-y-2 text-text-dim-4" aria-label={`${font.name} 미리보기`}>
        {[...text].map((char, at) => isSyllable(char)
          ? <FontDataGlyph key={at} font={prepared.font} char={char} size={GLYPH_SIZE} />
          : <span key={at} className="inline-block text-2xl" style={{ minWidth: char === ' ' ? GLYPH_SIZE / 3 : undefined }}>{char}</span>)}
      </p>
      : <p className="text-sm text-[rgb(190_52_48)]">폰트를 읽지 못했어요: {prepared.message}</p>}
  </section>
}

/**
 * 친구 정보 고치기: 닉네임 · 메모. 바꾼 칸만 보낸다. 저장이 끝나 목록이 새로 오면 부르는 쪽이 `key`로 새로 그린다 — 그래서 `저장했어요`는 부르는 쪽이 들고 있다.
 * 닉네임은 다른 계정과 겹치면 안 된다(서버도 다시 본다).
 */
function ProfileForm({ account, invites, saved, setSaved }: { account: Account; invites: BetaInvites; saved: boolean; setSaved: (saved: boolean) => void }) {
  const [nickname, setNickname] = useState(account.nickname ?? '')
  const [memo, setMemo] = useState(account.memo)
  const nameChanged = nickname.trim() !== (account.nickname ?? '')
  const memoChanged = memo.trim() !== account.memo
  const taken = (invites.accounts ?? []).filter((other) => other.email !== account.email).map((other) => other.nickname)
  const problem = nameChanged ? nicknameProblemOf(nickname, taken) : null

  const save = async () => {
    setSaved(false)
    const ok = await invites.updateProfile(account.email, {
      ...(nameChanged ? { nickname: nickname.trim() } : {}),
      ...(memoChanged ? { memo: memo.trim() } : {}),
    })
    if (ok) setSaved(true)
  }

  return <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); void save() }} data-testid="admin-account-profile">
    <label className="flex flex-col gap-1.5 text-sm font-medium text-text-dim-2">
      닉네임
      <Input
        value={nickname}
        onChange={(event) => { setNickname(event.target.value); setSaved(false) }}
        maxLength={6}
        autoComplete="off"
        aria-invalid={Boolean(problem) || undefined}
        data-testid="admin-account-nickname"
      />
      {problem
        ? <span className="text-xs font-normal text-[rgb(190_52_48)]">{problem}</span>
        : <span className="text-xs font-normal text-text-dim-5">친구 앱의 이름 · 새 폰트 이름에 써요. 이미 들어와 있는 친구는 1시간 안에 바뀌어요.</span>}
    </label>
    <label className="flex flex-col gap-1.5 text-sm font-medium text-text-dim-2">
      메모
      <Textarea
        value={memo}
        onChange={(event) => { setMemo(event.target.value); setSaved(false) }}
        maxLength={MEMO_MAX_LENGTH}
        placeholder="어떻게 아는 사이 · 기기 · 부탁할 것"
        className="min-h-24 font-normal"
        data-testid="admin-account-memo"
      />
      <span className="text-xs font-normal text-text-dim-5">이 맥에만 남아요. 친구는 못 봐요.</span>
    </label>
    <div className="flex items-center justify-end gap-2">
      {invites.failure && <p role="alert" className="mr-auto text-sm text-[rgb(190_52_48)]">{invites.failure}</p>}
      {saved && !invites.failure && <span className="mr-auto text-sm text-text-dim-4">저장했어요</span>}
      <Button type="button" variant="outline" disabled={invites.busy || (!nameChanged && !memoChanged)} onClick={() => { setNickname(account.nickname ?? ''); setMemo(account.memo) }}>되돌리기</Button>
      <Button type="submit" disabled={invites.busy || (!nameChanged && !memoChanged) || Boolean(problem)} data-testid="admin-account-save">
        {invites.busy ? '저장 중…' : '저장'}
      </Button>
    </div>
  </form>
}

/** 읽기만 하는 계정 정보 한 줄. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return <>
    <dt className="text-text-dim-5">{label}</dt>
    <dd className="min-w-0 [overflow-wrap:anywhere]">{children}</dd>
  </>
}

/**
 * 계정 상세: 위에 계정 정보(닉네임 · 메모 고치기 + 읽기만 하는 값), 아래 이 친구가 만든 폰트 미리보기.
 * 폰트는 읽기만 한다 — 이 기기 폰트 저장소는 건드리지 않는다.
 */
export function AccountFontsPage({ email, invites, onBack }: { email: string; invites: BetaInvites; onBack: () => void }) {
  const account = invites.accounts?.find((item) => item.email === email)
  const [fonts, setFonts] = useState<AccountFont[] | null>(null)
  const [error, setError] = useState('')
  const [text, setText] = useState<string>(SAMPLE_SENTENCES[0])
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    let alive = true
    setFonts(null)
    setError('')
    adminCall<{ fonts: AccountFont[] }>(`${BETA_INVITE_API}?fonts=${encodeURIComponent(email)}`)
      .then((body) => { if (alive) setFonts(body.fonts) })
      .catch((failure: Error) => { if (alive) setError(failure.message) })
    return () => { alive = false }
  }, [email])

  return <div className="flex max-w-4xl flex-col gap-6" data-testid="admin-account-fonts">
    <div className="flex items-center gap-2">
      <Button size="sm" variant="secondary" onClick={onBack}><ChevronLeft className="h-4 w-4" />계정</Button>
      <strong className="text-base font-bold">{account?.nickname ?? '(닉네임 없음)'}</strong>
      {account?.suspended && <Badge variant="muted">정지</Badge>}
      <span className="truncate text-xs text-text-dim-5">{email}</span>
    </div>

    <section className="rounded-lg border border-border-subtle bg-surface p-5">
      <h2 className="mb-4 text-base font-bold">계정 정보</h2>
      {!account && <p className="text-sm text-text-dim-4">{invites.accounts ? '없는 계정이에요.' : '불러오는 중…'}</p>}
      {account && <div className="grid gap-6 md:grid-cols-[1fr_16rem]">
        <ProfileForm key={`${account.email}|${account.nickname}|${account.memo}`} account={account} invites={invites} saved={saved} setSaved={setSaved} />
        <dl className="grid h-fit grid-cols-[5.5rem_1fr] gap-x-3 gap-y-2 rounded-lg bg-surface-2 p-4 text-sm" data-testid="admin-account-facts">
          <Fact label="이메일">{account.email}</Fact>
          <Fact label="코드">{account.invite ? <code className="select-text font-semibold tracking-wider">{account.invite.code}</code> : <span className="text-text-dim-5">모름</span>}</Fact>
          <Fact label="초대 메시지">{account.sentAt ? `${dayOf(account.sentAt)} 보냄` : account.invite ? '안 보냄' : '—'}</Fact>
          <Fact label="가입">{dateOf(account.createdAt)}</Fact>
          <Fact label="마지막 로그인">{dateOf(account.lastSignInAt)}</Fact>
          <Fact label="상태">{account.suspended ? '정지' : '사용 중'}</Fact>
        </dl>
      </div>}
    </section>

    <section className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-base font-bold">폰트 {fonts ? fonts.length : ''}</h2>
        <label className="flex w-full max-w-sm flex-col gap-1.5 text-sm text-text-dim-3">
          미리보기 문장
          <Input
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={40}
            data-testid="admin-account-font-text"
          />
        </label>
      </div>
      {error && <p role="alert" className="text-sm text-[rgb(190_52_48)]">{error}</p>}
      {!error && !fonts && <p className="text-sm text-text-dim-4">불러오는 중…</p>}
      {fonts?.length === 0 && <p className="text-sm text-text-dim-4">아직 만든 폰트가 없어요.</p>}
      {fonts?.map((font) => <FontCard key={font.id} font={font} text={text} />)}
    </section>
  </div>
}
