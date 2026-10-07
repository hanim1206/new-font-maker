import { lazy, Suspense, useEffect, useState } from 'react'
import type { CSSProperties } from 'react'
import type { FormEvent } from 'react'
import { signInWithBetaCode, signInWithKakao } from './betaAuth'
import type { BetaSignInResult } from './betaAuth'
import { welcomeNameOf } from './betaWelcome'
import { markBetaGuidePending } from './betaGuide'
import styles from './BetaLoginPage.module.css'
import { Button } from './components/ui/button'

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
 * `kakao`(받을 때 로그인 모드의 `/login`): 카카오 단추가 앞이고 초대 코드는 작은 링크 뒤에 접혀 있다.
 */
export function BetaLoginPage({ onSignedIn, kakao = false }: { onSignedIn: () => void; kakao?: boolean }) {
  const [name] = useState(() => welcomeNameOf(window.location.search, window.localStorage))
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [revealed, setRevealed] = useState(false)
  const [codeOpen, setCodeOpen] = useState(!kakao)
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
    // 처음 들어온 사람은 대시보드에서 둘러보기 안내가 뜬다(`BetaGuideSheet`).
    if (result.ok) { markBetaGuidePending(window.localStorage); onSignedIn(); return }
    setFailure(FAILURE_TEXT[result.reason])
    setBusy(false)
  }

  // 카카오로 가면 이 화면을 떠난다. 돌아오는 곳은 대시보드(`signInWithKakao`의 기본 주소).
  const goKakao = async () => {
    if (busy) return
    setBusy(true)
    setFailure('')
    const result = await signInWithKakao()
    if (result.ok) return
    setFailure(FAILURE_TEXT[result.reason])
    setBusy(false)
  }

  return <main className={styles.loginPage}>
    <form className={styles.shell} onSubmit={submit} data-revealed={revealed || undefined} data-testid="beta-login">
      <h1 className={styles.srOnly}>한글칸글</h1>
      <div className={styles.hello}>
        {/* 글자는 따로 불러와 늦게 뜬다. 줄 수만큼 자리를 미리 잡아 아래 문구가 밀리지 않게 한다. */}
        <div className={styles.greeting} data-lines={name ? 2 : 1} role="img" aria-label={name ? `환영합니다 ${name}` : '환영합니다'} data-testid="beta-login-hello">
          <Suspense fallback={null}><BetaWelcomeGlyphs name={name} onDrawn={() => setRevealed(true)} /></Suspense>
        </div>
        {kakao
          ? <p className={styles.lead}>
            <strong {...revealStep(0)}>폰트를 받으려면 로그인이 필요해요.</strong>
            <span {...revealStep(1)}>만든 폰트는 계정에 저장돼요.</span>
          </p>
          : <p className={styles.lead}>
            <strong {...revealStep(0)}>베타 테스터로 뽑히셨어요.</strong>
            <span {...revealStep(1)}>재밌게 폰트 하나 만들다 가세요.</span>
            <span {...revealStep(2)}>피드백은 한임에게 편하게 보내 주세요.</span>
          </p>}
      </div>
      <div className={styles.form}>
        {kakao && <>
          <Button type="button" size="block" variant="default" className={styles.kakao} {...revealStep(2)} disabled={busy} onClick={() => void goKakao()} data-testid="login-kakao">{busy && !codeOpen ? '카카오로 가는 중…' : '카카오로 시작하기'}</Button>
          {!codeOpen && <Button type="button" variant="plain" size="sm" className={styles.codeLink} {...revealStep(3)} onClick={() => setCodeOpen(true)} data-testid="login-beta-code-link">초대 코드가 있어요</Button>}
        </>}
        {codeOpen && <label {...revealStep(3)}>
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
        </label>}
        {failure ? <small id="beta-login-failure" role="alert" data-testid="beta-login-failure">{failure}</small> : null}
        {codeOpen && <Button type="submit" size="block" variant={kakao ? 'secondary' : 'default'} className={styles.submit} {...revealStep(4)} disabled={busy || code.trim() === ''} data-testid="beta-login-submit">{busy && codeOpen ? '확인 중…' : '들어가기'}</Button>}
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
      <Button type="button" size="block" variant="default" onClick={() => window.location.reload()}>다시 시도</Button>
      <footer>{message}</footer>
    </div>
  </main>
}
