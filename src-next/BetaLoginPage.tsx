import { useState } from 'react'
import type { FormEvent } from 'react'
import { signInWithBetaCode } from './betaAuth'
import type { BetaSignInResult } from './betaAuth'
import styles from './BetaLoginPage.module.css'

const FAILURE_TEXT: Record<Exclude<BetaSignInResult, { ok: true }>['reason'], string> = {
  format: '코드는 4자씩 세 묶음이에요. 다시 확인해 주세요.',
  wrong: '코드를 다시 확인해 주세요.',
  busy: '잠시 뒤에 다시 넣어 주세요.',
  network: '인터넷 연결을 확인하고 다시 넣어 주세요.',
}

/** 로그인 안 된 사람이 보는 첫 화면. 카톡으로 받은 초대 코드 하나만 넣는다. */
export function BetaLoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    if (busy) return
    setBusy(true)
    setFailure('')
    const result = await signInWithBetaCode(code)
    if (result.ok) { onSignedIn(); return }
    setFailure(FAILURE_TEXT[result.reason])
    setBusy(false)
  }

  return <main className={styles.page}>
    <form className={styles.card} onSubmit={submit} data-testid="beta-login">
      <header>
        <h1>한글 폰트 메이커</h1>
        <p>내 손으로 한글 폰트를 만들어 보는 도구예요. 지금은 초대받은 사람만 쓰는 베타예요.</p>
      </header>
      <label>
        <span>초대 코드</span>
        <input
          type="text"
          value={code}
          onChange={(event) => setCode(event.target.value)}
          placeholder="K7QM-4XPA-9TRD"
          autoComplete="one-time-code"
          autoCapitalize="characters"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          aria-invalid={failure ? true : undefined}
          aria-describedby={failure ? 'beta-login-failure' : undefined}
          data-testid="beta-login-code"
        />
      </label>
      {failure ? <small id="beta-login-failure" role="alert" data-testid="beta-login-failure">{failure}</small> : null}
      <button type="submit" disabled={busy || code.trim() === ''} data-testid="beta-login-submit">{busy ? '확인 중…' : '들어가기'}</button>
      <footer>코드를 잊었으면 초대한 사람에게 물어봐 주세요.</footer>
    </form>
  </main>
}

/** 배포 빌드에 Supabase 설정이 빠졌을 때. 로그인 없이 열어 두지 않는다. */
export function AuthMisconfiguredPage() {
  return <main className={styles.page} role="alert">
    <div className={styles.card}>
      <header>
        <h1>지금은 들어갈 수 없어요</h1>
        <p>서버 설정이 빠져 있어요. 초대한 사람에게 알려 주세요.</p>
      </header>
    </div>
  </main>
}

/** 로그인은 됐는데 계정 폰트를 불러오지 못했을 때. 빈 폰트로 열면 자동 저장이 서버를 덮으므로 열지 않는다. */
export function AccountFontFailedPage({ reason, message }: { reason: 'network' | 'invalid-font'; message: string }) {
  return <main className={styles.page} role="alert">
    <div className={styles.card} data-testid="account-font-failed" data-reason={reason}>
      <header>
        <h1>폰트를 불러오지 못했어요</h1>
        <p>{reason === 'network'
          ? '인터넷 연결을 확인하고 다시 시도해 주세요.'
          : '저장된 폰트를 읽을 수 없어요. 초대한 사람에게 알려 주세요. 폰트는 서버에 그대로 있어요.'}</p>
      </header>
      <button type="button" onClick={() => window.location.reload()}>다시 시도</button>
      <footer>{message}</footer>
    </div>
  </main>
}
