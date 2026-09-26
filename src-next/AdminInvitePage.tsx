import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { isDrawableName } from './betaWelcome'
import styles from './AdminInvitePage.module.css'

/** `scripts/betaInviteApi.ts`와 같은 값. 서버 파일을 가져오면 node 모듈이 번들로 딸려 와서 옮겨 적는다. */
const API = '/api/beta-invites'
const HEADER = 'x-beta-admin'

interface Invite { nickname: string; code: string; link: string; message: string }
interface Account { nickname: string | null; email: string; createdAt: string; lastSignInAt: string | null; invite?: Invite; suspended: boolean }
type Issued = Invite & { mode: 'add' | 'reissue' }

async function call<T>(method: 'GET' | 'POST' | 'PATCH' = 'GET', payload?: unknown): Promise<T> {
  const response = await fetch(API, payload === undefined
    ? { method, headers: { [HEADER]: '1' } }
    : { method, headers: { [HEADER]: '1', 'content-type': 'application/json' }, body: JSON.stringify(payload) })
  const body = await response.json().catch(() => ({ error: `서버가 ${response.status}로 답했습니다.` }))
  if (!response.ok) throw Object.assign(new Error(body.error ?? '실패했습니다.'), { invite: body.invite as Invite | undefined })
  return body as T
}

const dateOf = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '아직'

/**
 * 로컬 관리자 화면. 닉네임 하나 넣으면 계정 · 코드 · 이름 붙은 링크가 한 번에 나오고, 카톡 메시지 한 통으로 복사한다.
 * 개발 서버에서만 열린다(`main.tsx`). 발급한 코드는 이 맥 파일에 남아 목록에서 다시 복사한다. 그 전 계정은 코드를 몰라 `새 코드`로.
 */
export function AdminInvitePage() {
  const [nickname, setNickname] = useState('')
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [listError, setListError] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [issued, setIssued] = useState<Issued | null>(null)
  /** 방금 복사한 메시지의 계정 이메일, 위 결과 카드는 `issued`. */
  const [copied, setCopied] = useState<string | null>(null)
  const [confirming, setConfirming] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    try {
      setAccounts((await call<{ accounts: Account[] }>()).accounts)
      setListError('')
    } catch (error) {
      setListError((error as Error).message)
    }
  }, [])
  useEffect(() => { void refresh() }, [refresh])

  const issue = async (mode: 'add' | 'reissue', name: string) => {
    if (busy) return
    setBusy(true)
    setFailure('')
    setCopied(null)
    setConfirming(null)
    try {
      const { invite } = await call<{ invite: Invite }>('POST', { mode, nickname: name })
      setIssued({ ...invite, mode })
      if (mode === 'add') setNickname('')
    } catch (error) {
      setFailure((error as Error).message)
      const partial = (error as { invite?: Invite }).invite
      if (partial) setIssued({ ...partial, mode })
    }
    setBusy(false)
    void refresh()
  }

  /** 소프트 삭제(정지) · 되살리기. 폰트와 코드는 그대로다. */
  const suspend = async (email: string, suspended: boolean) => {
    if (busy) return
    setBusy(true)
    setFailure('')
    setConfirming(null)
    try {
      await call('PATCH', { email, suspended })
    } catch (error) {
      setFailure((error as Error).message)
    }
    setBusy(false)
    void refresh()
  }

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void issue('add', nickname.trim())
  }

  const copy = async (key: string, message: string) => {
    try {
      await navigator.clipboard.writeText(message)
      setCopied(key)
    } catch {
      setFailure('복사하지 못했어요. 아래 글을 직접 골라 복사해 주세요.')
    }
  }

  const active = accounts?.filter((account) => !account.suspended)
  const suspended = accounts?.filter((account) => account.suspended)
  const trimmed = nickname.trim()
  const invalid = trimmed !== '' && !isDrawableName(trimmed)

  return <main className={styles.page}>
    <div className={styles.shell} data-testid="admin-invite">
      <header className={styles.head}>
        <h1>베타 초대</h1>
        <p>이 맥에서만 열려요. 발급한 코드는 이 맥에 남아요.</p>
      </header>

      <form className={styles.issue} onSubmit={submit}>
        <label>
          <span>친구 닉네임</span>
          <input
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="민지"
            maxLength={6}
            autoComplete="off"
            aria-invalid={invalid || undefined}
            data-testid="admin-invite-nickname"
          />
        </label>
        {invalid && <small>한글 1~6자로 넣어 주세요. 로그인 화면이 이 이름으로 인사해요.</small>}
        <button type="submit" disabled={busy || !trimmed || invalid} data-testid="admin-invite-submit">{busy ? '만드는 중…' : '코드 발급'}</button>
      </form>

      {failure && <p className={styles.failure} role="alert">{failure}</p>}

      {issued && <section className={styles.result} data-testid="admin-invite-result">
        <div className={styles.resultHead}>
          <strong>{issued.nickname}</strong>
          <span>{issued.mode === 'add' ? '새 계정' : '새 코드 · 옛 코드는 이제 안 돼요'}</span>
        </div>
        <code className={styles.code}>{issued.code}</code>
        <pre className={styles.message}>{issued.message}</pre>
        <button type="button" onClick={() => void copy('issued', issued.message)} data-copied={copied === 'issued' || undefined} data-testid="admin-invite-copy">
          {copied === 'issued' ? '복사했어요 — 카톡에 붙여 넣으세요' : '카톡 메시지 복사'}
        </button>
      </section>}

      <section className={styles.list}>
        <h2>발급한 친구 {active ? active.length : ''}</h2>
        {listError && <p className={styles.failure}>{listError}</p>}
        {active?.length === 0 && <p className={styles.empty}>아직 없어요.</p>}
        <ul>
          {active?.map((account) => {
            const name = account.nickname
            const confirm = (action: string) => confirming === `${action}:${account.email}`
            const ask = (action: string) => setConfirming(`${action}:${account.email}`)
            const drop = () => setConfirming((current) => current?.endsWith(`:${account.email}`) ? null : current)
            return <li key={account.email}>
              <div>
                <strong>{name ?? '(닉네임 없음)'}</strong>
                {account.invite ? <code>{account.invite.code}</code> : <em>코드 모름</em>}
                <span>마지막 로그인 {dateOf(account.lastSignInAt)}</span>
              </div>
              <nav>
                {account.invite && <button
                  type="button"
                  data-copied={copied === account.email || undefined}
                  onClick={() => void copy(account.email, account.invite!.message)}
                >
                  {copied === account.email ? '복사함' : '메시지 복사'}
                </button>}
                {name && <button
                  type="button"
                  disabled={busy}
                  data-confirming={confirm('reissue') || undefined}
                  onClick={() => confirm('reissue') ? void issue('reissue', name) : ask('reissue')}
                  onBlur={drop}
                >
                  {confirm('reissue') ? '옛 코드 끊고 새로' : '새 코드'}
                </button>}
                <button
                  type="button"
                  disabled={busy}
                  data-confirming={confirm('suspend') || undefined}
                  onClick={() => confirm('suspend') ? void suspend(account.email, true) : ask('suspend')}
                  onBlur={drop}
                >
                  {confirm('suspend') ? '로그인 막기' : '정지'}
                </button>
              </nav>
            </li>
          })}
        </ul>
      </section>

      {suspended && suspended.length > 0 && <section className={styles.list} data-suspended>
        <h2>정지한 친구 {suspended.length}</h2>
        <p className={styles.empty}>로그인만 막았어요. 폰트와 코드는 그대로라 되살리면 같은 코드로 이어서 써요.</p>
        <ul>
          {suspended.map((account) => <li key={account.email}>
            <div>
              <strong>{account.nickname ?? '(닉네임 없음)'}</strong>
              <span>마지막 로그인 {dateOf(account.lastSignInAt)}</span>
            </div>
            <nav>
              <button type="button" disabled={busy} onClick={() => void suspend(account.email, false)}>되살리기</button>
            </nav>
          </li>)}
        </ul>
      </section>}
    </div>
  </main>
}
