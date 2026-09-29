import { useRef, useState } from 'react'
import type { ClipboardEvent, KeyboardEvent } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Sheet, SheetBody, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { isDrawableName } from '../betaWelcome'
import type { BetaInvites, NewRow } from './useBetaInvites'

type Draft = NewRow & { key: number }

/**
 * 초대하기 패널(오른쪽). 닉네임 · 메모 줄을 원하는 만큼 붙여 한 번에 발급한다.
 * 엑셀에서 `닉네임 ⇥ 메모` 여러 줄을 닉네임 칸에 붙여 넣으면 줄로 나뉜다.
 * 다 발급되면 닫히고 `onIssued`로 만든 닉네임을 알린다(계정 표가 `안 보냄`으로 걸러 강조). 일부만 되면 남은 줄과 까닭을 두고 열려 있다.
 * 적던 줄은 패널을 닫아도 남는다.
 */
export function InviteSheet({ invites, open, onOpenChange, onIssued }: {
  invites: BetaInvites
  open: boolean
  onOpenChange: (open: boolean) => void
  onIssued: (nicknames: string[]) => void
}) {
  const { accounts, busy } = invites
  const nextKey = useRef(1)
  const blank = (): Draft => ({ key: nextKey.current++, nickname: '', memo: '' })
  const [drafts, setDrafts] = useState<Draft[]>(() => [blank()])
  const body = useRef<HTMLTableSectionElement>(null)

  const taken = new Set((accounts ?? []).map((account) => account.nickname).filter(Boolean))
  const filled = drafts.filter((draft) => draft.nickname.trim() || draft.memo.trim())
  const problemOf = (draft: Draft): string | null => {
    const name = draft.nickname.trim()
    if (!name) return draft.memo.trim() ? '닉네임을 적어 주세요' : null
    if (!isDrawableName(name)) return '한글 1~6자'
    if (taken.has(name)) return '이미 있는 닉네임'
    if (drafts.filter((other) => other.nickname.trim() === name).length > 1) return '표에 두 번'
    return null
  }
  const ready = filled.length > 0 && filled.every((draft) => !problemOf(draft))

  const update = (key: number, patch: Partial<NewRow>) =>
    setDrafts((rows) => rows.map((row) => row.key === key ? { ...row, ...patch } : row))
  const remove = (key: number) =>
    setDrafts((rows) => rows.length === 1 ? [blank()] : rows.filter((row) => row.key !== key))
  const addRow = () => {
    setDrafts((rows) => [...rows, blank()])
    requestAnimationFrame(() => body.current?.querySelector<HTMLInputElement>('tr:last-child input[data-field="nickname"]')?.focus())
  }

  /** 여러 줄 붙여넣기: 줄마다 한 명, 탭 뒤는 메모. */
  const paste = (key: number, event: ClipboardEvent<HTMLInputElement>) => {
    const lines = event.clipboardData.getData('text').split(/\r?\n/).map((line) => line.trim()).filter(Boolean)
    if (lines.length < 2 && !lines[0]?.includes('\t')) return
    event.preventDefault()
    const pasted = lines.map((line) => {
      const [nickname = '', ...memo] = line.split('\t')
      return { key: nextKey.current++, nickname: nickname.trim(), memo: memo.join(' ').trim() }
    })
    setDrafts((rows) => {
      const at = rows.findIndex((row) => row.key === key)
      const keep = rows[at] && !rows[at].nickname && !rows[at].memo ? 1 : 0
      return [...rows.slice(0, at + 1 - keep), ...pasted, ...rows.slice(at + 1)]
    })
  }

  /** 마지막 줄에서 Enter면 새 줄. */
  const enter = (key: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    if (drafts.at(-1)?.key === key) addRow()
  }

  const submit = async () => {
    const made = await invites.issueMany(filled.map(({ nickname, memo }) => ({ nickname: nickname.trim(), memo: memo.trim() })))
    if (made.length === 0) return
    const left = drafts.filter((row) => !made.includes(row.nickname.trim()) && (row.nickname.trim() || row.memo.trim()))
    setDrafts(left.length ? left : [blank()])
    onIssued(made)
    if (left.length === 0) onOpenChange(false)
  }

  return <Sheet open={open} onOpenChange={onOpenChange}>
    <SheetContent className="sm:max-w-2xl" data-testid="admin-invite">
      <SheetHeader>
        <SheetTitle>친구 초대</SheetTitle>
        <SheetDescription>닉네임 · 메모를 적고 한 번에 발급해요. 엑셀에서 여러 줄을 붙여 넣어도 돼요.</SheetDescription>
      </SheetHeader>
      <SheetBody>
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="w-8 px-1 text-right">#</TableHead>
              <TableHead className="w-[38%]">친구 닉네임</TableHead>
              <TableHead>메모</TableHead>
              <TableHead className="w-10" />
            </TableRow>
          </TableHeader>
          <TableBody ref={body}>
            {drafts.map((draft, index) => {
              const problem = problemOf(draft)
              return <TableRow key={draft.key} className="hover:bg-transparent" data-testid="admin-invite-draft">
                <TableCell className="px-1 py-2 text-right align-top text-xs leading-9 text-text-dim-5">{index + 1}</TableCell>
                <TableCell className="whitespace-normal py-2 align-top">
                  <Input
                    value={draft.nickname}
                    onChange={(event) => update(draft.key, { nickname: event.target.value })}
                    onPaste={(event) => paste(draft.key, event)}
                    onKeyDown={(event) => enter(draft.key, event)}
                    placeholder="민지"
                    maxLength={6}
                    autoComplete="off"
                    aria-label="친구 닉네임"
                    aria-invalid={Boolean(problem) || undefined}
                    data-field="nickname"
                    data-testid="admin-invite-nickname"
                  />
                  {problem && <p className="mt-1 text-xs text-[rgb(190_52_48)]">{problem}</p>}
                </TableCell>
                <TableCell className="py-2 align-top">
                  <Input
                    value={draft.memo}
                    onChange={(event) => update(draft.key, { memo: event.target.value })}
                    onKeyDown={(event) => enter(draft.key, event)}
                    placeholder="어떻게 아는 사이 · 기기 · 부탁할 것"
                    maxLength={200}
                    autoComplete="off"
                    aria-label="메모"
                    data-testid="admin-invite-memo"
                  />
                </TableCell>
                <TableCell className="px-1 py-2 align-top">
                  <Button size="icon" variant="ghost" onClick={() => remove(draft.key)} aria-label="이 줄 지우기"><X /></Button>
                </TableCell>
              </TableRow>
            })}
          </TableBody>
        </Table>
        <Button variant="ghost" size="sm" className="mt-2" onClick={addRow} data-testid="admin-invite-add-row"><Plus />줄 추가</Button>
      </SheetBody>
      <SheetFooter className="border-t border-border-subtle">
        {invites.failure && <p role="alert" className="text-sm text-[rgb(190_52_48)]">{invites.failure}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>닫기</Button>
          <Button variant="primary" disabled={busy || !ready} onClick={() => void submit()} data-testid="admin-invite-submit">
            {busy ? '만드는 중…' : filled.length > 0 ? `${filled.length}명 발급` : '발급'}
          </Button>
        </div>
      </SheetFooter>
    </SheetContent>
  </Sheet>
}
