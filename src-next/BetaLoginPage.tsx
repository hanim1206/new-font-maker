import { lazy, Suspense, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { FormEvent } from 'react'
import { signInWithBetaCode } from './betaAuth'
import type { BetaSignInResult } from './betaAuth'
import { welcomeNameOf } from './betaWelcome'
import styles from './BetaLoginPage.module.css'

const BetaWelcomeGlyphs = lazy(() => import('./BetaWelcomeGlyphs'))

/** 인사 글자가 늦거나 못 오면 이만큼 뒤 아래 내용을 그냥 보인다 — 폼이 숨은 채로 남으면 안 된다. */
const REVEAL_FALLBACK_MS = 5000

/** 인사가 다 그어진 뒤 아래 내용이 하나씩 떠오른다. `order`번째 차례. */
const revealStep = (order: number) => ({ 'data-reveal': '', style: { '--reveal-order': order } as CSSProperties })

const FAILURE_TEXT: Record<Exclude<BetaSignInResult, { ok: true }>['reason'], string> = {
  format: '코드는 4자씩 세 묶음이에요. 다시 확인해 주세요.',
  wrong: '코드를 다시 확인해 주세요.',
  busy: '잠시 뒤에 다시 넣어 주세요.',
  network: '인터넷 연결을 확인하고 다시 넣어 주세요.',
}

/**
 * 로그인 안 된 사람이 보는 첫 화면. 머리 줄 없이 맨 위에 앱 글자로 인사(`환영합니다 민지`), 아래 엄지 자리에 초대 코드 하나.
 * 이름은 초대 링크의 `?to=`에서 온다 — 로그인 전이라 계정 이름은 아직 모른다.
 */
export function BetaLoginPage({ onSignedIn }: { onSignedIn: () => void }) {
  const [name] = useState(() => welcomeNameOf(window.location.search, window.localStorage))
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [revealed, setRevealed] = useState(false)
  useEffect(() => {
    const fallback = window.setTimeout(() => setRevealed(true), REVEAL_FALLBACK_MS)
    return () => window.clearTimeout(fallback)
  }, [])

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

  return <main className={styles.loginPage}>
    <form className={styles.shell} onSubmit={submit} data-revealed={revealed || undefined} data-testid="beta-login">
      <h1 className={styles.srOnly}>한글 폰트 메이커</h1>
      <div className={styles.hello}>
        {/* 글자는 따로 불러와 늦게 뜬다. 줄 수만큼 자리를 미리 잡아 아래 문구가 밀리지 않게 한다. */}
        <div className={styles.greeting} data-lines={name ? 2 : 1} role="img" aria-label={name ? `환영합니다 ${name}` : '환영합니다'} data-testid="beta-login-hello">
          <Suspense fallback={null}><BetaWelcomeGlyphs name={name} onDrawn={() => setRevealed(true)} /></Suspense>
        </div>
        <p className={styles.lead}>
          <strong {...revealStep(0)}>베타 테스터로 뽑히셨어요.</strong>
          <span {...revealStep(1)}>재밌게 폰트 하나 만들다 가세요.</span>
          <span {...revealStep(2)}>피드백은 한임에게 편하게 보내 주세요.</span>
        </p>
      </div>
      <div className={styles.form}>
        <label {...revealStep(3)}>
          <span>전달받은 초대 코드를 입력해 주세요</span>
          <input
            type="text"
            value={code}
            onChange={(event) => setCode(event.target.value)}
            placeholder="K7QM-4XPA-9TRD"
            autoComplete="one-time-code"
            autoCapitalize="characters"
            autoCorrect="off"
            spellCheck={false}
            aria-invalid={failure ? true : undefined}
            aria-describedby={failure ? 'beta-login-failure' : undefined}
            data-testid="beta-login-code"
          />
        </label>
        {failure ? <small id="beta-login-failure" role="alert" data-testid="beta-login-failure">{failure}</small> : null}
        <button type="submit" {...revealStep(4)} disabled={busy || code.trim() === ''} data-testid="beta-login-submit">{busy ? '확인 중…' : '들어가기'}</button>
      </div>
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
