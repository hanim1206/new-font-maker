import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { isDrawableName } from './betaWelcome'
import styles from './AdminInvitePage.module.css'

/** `scripts/betaInviteApi.ts`와 같은 값. 서버 파일을 가져오면 node 모듈이 번들로 딸려 와서 옮겨 적는다. */
const API = '/api/beta-invites'
const HEADER = 'x-beta-admin'

interface Account { nickname: string | null; email: string; createdAt: string; lastSignInAt: string | null }
interface Invite { nickname: string; code: string; link: string; message: string }
type Issued = Invite & { mode: 'add' | 'reissue' }

async function call<T>(init?: { mode: 'add' | 'reissue'; nickname: string }): Promise<T> {
  const response = await fetch(API, init
    ? { method: 'POST', headers: { [HEADER]: '1', 'content-type': 'application/json' }, body: JSON.stringify(init) }
    : { headers: { [HEADER]: '1' } })
  const body = await response.json().catch(() => ({ error: `서버가 ${response.status}로 답했습니다.` }))
  if (!response.ok) throw Object.assign(new Error(body.error ?? '실패했습니다.'), { invite: body.invite as Invite | undefined })
  return body as T
}

const dateOf = (iso: string | null) => iso
  ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  : '아직'

/**
 * 로컬 관리자 화면. 닉네임 하나 넣으면 계정 · 코드 · 이름 붙은 링크가 한 번에 나오고, 카톡 메시지 한 통으로 복사한다.
 * 개발 서버에서만 열린다(`main.tsx`). 코드는 비번이라 발급한 그 자리에서만 보인다 — 잊으면 `새 코드`.
 */
export function AdminInvitePage() {
  const [nickname, setNickname] = useState('')
  const [accounts, setAccounts] = useState<Account[] | null>(null)
  const [listError, setListError] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [issued, setIssued] = useState<Issued | null>(null)
  const [copied, setCopied] = useState(false)
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
    setCopied(false)
    setConfirming(null)
    try {
      const { invite } = await call<{ invite: Invite }>({ mode, nickname: name })
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

  const submit = (event: FormEvent) => {
    event.preventDefault()
    void issue('add', nickname.trim())
  }

  const copy = async () => {
    if (!issued) return
    try {
      await navigator.clipboard.writeText(issued.message)
      setCopied(true)
    } catch {
      setFailure('복사하지 못했어요. 아래 글을 직접 골라 복사해 주세요.')
    }
  }

  const trimmed = nickname.trim()
  const invalid = trimmed !== '' && !isDrawableName(trimmed)

  return <main className={styles.page}>
    <div className={styles.shell} data-testid="admin-invite">
      <header className={styles.head}>
        <h1>베타 초대</h1>
        <p>이 맥에서만 열려요. 코드는 발급한 자리에서만 보여요.</p>
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
        <button type="button" onClick={() => void copy()} data-copied={copied || undefined} data-testid="admin-invite-copy">
          {copied ? '복사했어요 — 카톡에 붙여 넣으세요' : '카톡 메시지 복사'}
        </button>
      </section>}

      <section className={styles.list}>
        <h2>발급한 친구 {accounts ? accounts.length : ''}</h2>
        {listError && <p className={styles.failure}>{listError}</p>}
        {accounts?.length === 0 && <p className={styles.empty}>아직 없어요.</p>}
        <ul>
          {accounts?.map((account) => {
            const name = account.nickname
            return <li key={account.email}>
              <div>
                <strong>{name ?? '(닉네임 없음)'}</strong>
                <span>마지막 로그인 {dateOf(account.lastSignInAt)}</span>
              </div>
              {name && <button
                type="button"
                disabled={busy}
                data-confirming={confirming === name || undefined}
                onClick={() => confirming === name ? void issue('reissue', name) : setConfirming(name)}
                onBlur={() => setConfirming((current) => current === name ? null : current)}
              >
                {confirming === name ? '옛 코드 끊고 새로' : '새 코드'}
              </button>}
            </li>
          })}
        </ul>
      </section>
    </div>
  </main>
}
