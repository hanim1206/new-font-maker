import { Button } from '@/components/ui/button'
import type { BetaInvites } from './useBetaInvites'

/** 계정 화면에서 `새 코드`로 다시 발급한 코드와 카톡 메시지. */
export function IssuedCard({ invites }: { invites: BetaInvites }) {
  const { issued, copied, copy } = invites
  if (!issued) return null
  return <section className="flex flex-col gap-3 rounded-lg bg-surface-2 p-4" data-testid="admin-invite-result">
    <div className="flex items-baseline gap-2">
      <strong className="text-lg font-extrabold">{issued.nickname}</strong>
      <span className="text-xs text-text-dim-4">{issued.mode === 'add' ? '새 계정' : '새 코드 · 옛 코드는 이제 안 돼요'}</span>
    </div>
    <code className="select-text text-2xl font-extrabold tracking-widest">{issued.code}</code>
    <pre className="m-0 select-text whitespace-pre-wrap break-all rounded-md bg-surface p-3 font-sans text-sm leading-relaxed text-text-dim-2">{issued.message}</pre>
    <Button variant={copied === 'issued' ? 'default' : 'primary'} size="lg" onClick={() => void copy('issued', issued.message)} data-testid="admin-invite-copy">
      {copied === 'issued' ? '복사했어요 — 카톡에 붙여 넣으세요' : '카톡 메시지 복사'}
    </Button>
  </section>
}
