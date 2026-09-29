import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import type { BetaInvites } from './useBetaInvites'

/** `새 코드`로 다시 발급한 코드와 카톡 메시지 창. 닫으면 결과를 버린다. */
export function IssuedDialog({ invites }: { invites: BetaInvites }) {
  const { issued, copied, copy, dismissIssued } = invites
  const open = issued?.mode === 'reissue'
  return <Dialog open={open} onOpenChange={(next) => { if (!next) dismissIssued() }}>
    <DialogContent data-testid="admin-invite-result">
      {issued && <>
        <DialogHeader>
          <DialogTitle>{issued.nickname} 새 코드</DialogTitle>
          <DialogDescription>옛 코드는 이제 안 돼요. 아래 메시지를 다시 보내 주세요.</DialogDescription>
        </DialogHeader>
        <code className="select-text text-2xl font-extrabold tracking-widest">{issued.code}</code>
        <pre className="m-0 select-text whitespace-pre-wrap break-all rounded-md bg-surface-2 p-3 font-sans text-sm leading-relaxed text-text-dim-2">{issued.message}</pre>
        <Button variant={copied === 'issued' ? 'default' : 'primary'} size="lg" onClick={() => void copy('issued', issued.message)} data-testid="admin-invite-copy">
          {copied === 'issued' ? '복사했어요 — 카톡에 붙여 넣으세요' : '카톡 메시지 복사'}
        </Button>
      </>}
    </DialogContent>
  </Dialog>
}
