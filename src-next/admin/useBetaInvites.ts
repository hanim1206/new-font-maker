import { useCallback, useEffect, useState } from 'react'
import { AdminApiError, BETA_INVITE_API, adminCall } from './adminApi'

export interface Invite { nickname: string; code: string; link: string; message: string }
export interface Account { nickname: string | null; email: string; createdAt: string; lastSignInAt: string | null; invite?: Invite; suspended: boolean; memo: string; sentAt: string | null }
export interface NewRow { nickname: string; memo: string }
export type Issued = Invite & { mode: 'add' | 'reissue' }

/**
 * 베타 계정 목록 · 발급 · 정지 · 삭제. 초대 화면과 계정 화면이 한 벌을 같이 쓴다 — 계정 화면에서 `새 코드`를 누르면 결과 카드가 거기 뜬다.
 * 발급한 코드는 이 맥 파일(`beta-accounts/`)에 남는다. 그 전 계정은 코드를 몰라 `새 코드`로.
 */
export function useBetaInvites() {
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [listError, setListError] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [issued, setIssued] = useState<Issued | null>(null)
  /** 방금 복사한 메시지 — 결과 카드는 `issued`, 목록 줄은 계정 이메일. */
  const [copied, setCopied] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setAccounts((await adminCall<{ accounts: Account[] }>(BETA_INVITE_API)).accounts)
      setListError('')
    } catch (error) {
      setListError((error as Error).message)
    }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const issue = async (mode: 'add' | 'reissue', nickname: string): Promise<boolean> => {
    if (busy) return false
    setBusy(true)
    setFailure('')
    setCopied(null)
    let ok = false
    try {
      const { invite } = await adminCall<{ invite: Invite }>(BETA_INVITE_API, 'POST', { mode, nickname })
      setIssued({ ...invite, mode })
      ok = true
    } catch (error) {
      setFailure((error as Error).message)
      const partial = error instanceof AdminApiError ? error.body.invite as Invite | undefined : undefined
      if (partial) setIssued({ ...partial, mode })
    }
    setBusy(false)
    void refresh()
    return ok
  }

  /**
   * 초대 표의 새 줄들을 한 번에 발급. 서버가 한 명씩 만들다 멈추면 그때까지 만든 사람은 계정이 되어 목록에 들어온다.
   * 돌려주는 값: 만들어진 닉네임들(표에서 그 줄을 지운다).
   */
  const issueMany = async (rows: NewRow[]): Promise<string[]> => {
    if (busy) return []
    setBusy(true)
    setFailure('')
    setCopied(null)
    let made: Invite[] = []
    try {
      made = (await adminCall<{ invites: Invite[] }>(BETA_INVITE_API, 'POST', { mode: 'add', rows })).invites
    } catch (error) {
      setFailure((error as Error).message)
      if (error instanceof AdminApiError) made = (error.body.invites as Invite[] | undefined) ?? []
    }
    setBusy(false)
    await refresh()
    return made.map((invite) => invite.nickname)
  }

  /** 소프트 삭제(정지) · 되살리기. 폰트와 코드는 그대로다. */
  const suspend = async (email: string, suspended: boolean) => {
    if (busy) return
    setBusy(true)
    setFailure('')
    try {
      await adminCall(BETA_INVITE_API, 'PATCH', { email, suspended })
    } catch (error) {
      setFailure((error as Error).message)
    }
    setBusy(false)
    void refresh()
  }

  /** 완전 삭제. 정지한 계정만 서버가 받는다. 폰트 · 의견 · 이 맥의 코드 · 메모까지 없어진다. */
  const remove = async (email: string) => {
    if (busy) return
    setBusy(true)
    setFailure('')
    try {
      await adminCall(BETA_INVITE_API, 'DELETE', { email })
    } catch (error) {
      setFailure((error as Error).message)
    }
    setBusy(false)
    void refresh()
  }

  /** 링크 보냄 체크. 목록을 바로 고쳐 두고 서버에 적는다 — 실패하면 다시 불러와 되돌린다. */
  const markSent = async (email: string, sent: boolean) => {
    setFailure('')
    setAccounts((current) => current?.map((account) => account.email === email
      ? { ...account, sentAt: sent ? new Date().toISOString() : null }
      : account) ?? current)
    try {
      await adminCall(BETA_INVITE_API, 'PATCH', { email, sent })
    } catch (error) {
      setFailure((error as Error).message)
      void refresh()
    }
  }

  const copy = async (key: string, message: string) => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(key)
    } catch {
      setFailure('복사하지 못했어요. 글을 직접 골라 복사해 주세요.')
    }
  }

  return { accounts, listError, busy, failure, issued, copied, issue, issueMany, suspend, remove, markSent, copy }
}

export type BetaInvites = ReturnType<typeof useBetaInvites>
