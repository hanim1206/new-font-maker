import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { FontDataGlyph } from '../fontDataGlyph'
import { previewFontOf } from '../previewFont'
import { SAMPLE_SENTENCES } from '../sampleSentences'
import { BETA_INVITE_API, adminCall, dateOf } from './adminApi'
import type { Account } from './useBetaInvites'

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

/** 계정 상세: 이 친구가 만든 폰트를 미리보기 문장으로 본다. 읽기만 한다 — 이 기기 폰트 저장소는 건드리지 않는다. */
export function AccountFontsPage({ email, account, onBack }: { email: string; account: Account | undefined; onBack: () => void }) {
  const [fonts, setFonts] = useState<AccountFont[] | null>(null)
  const [error, setError] = useState('')
  const [text, setText] = useState<string>(SAMPLE_SENTENCES[0])

  useEffect(() => {
    let alive = true
    setFonts(null)
    setError('')
    adminCall<{ fonts: AccountFont[] }>(`${BETA_INVITE_API}?fonts=${encodeURIComponent(email)}`)
      .then((body) => { if (alive) setFonts(body.fonts) })
      .catch((failure: Error) => { if (alive) setError(failure.message) })
    return () => { alive = false }
  }, [email])

  return <div className="flex max-w-4xl flex-col gap-5" data-testid="admin-account-fonts">
    <div className="flex items-center gap-2">
      <Button size="sm" variant="secondary" onClick={onBack}><ChevronLeft className="h-4 w-4" />계정</Button>
      <strong className="text-base font-bold">{account?.nickname ?? '(닉네임 없음)'}</strong>
      <span className="truncate text-xs text-text-dim-5">{email}</span>
    </div>
    <label className="flex max-w-md flex-col gap-1.5 text-sm text-text-dim-3">
      미리보기 문장
      <Input
        value={text}
        onChange={(event) => setText(event.target.value)}
        maxLength={40}
        data-testid="admin-account-font-text"
      />
    </label>
    {error && <p role="alert" className="text-sm text-[rgb(190_52_48)]">{error}</p>}
    {!error && !fonts && <p className="text-sm text-text-dim-4">불러오는 중…</p>}
    {fonts?.length === 0 && <p className="text-sm text-text-dim-4">아직 만든 폰트가 없어요.</p>}
    {fonts?.map((font) => <FontCard key={font.id} font={font} text={text} />)}
  </div>
}
