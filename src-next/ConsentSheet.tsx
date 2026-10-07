import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Button } from './components/ui/button'
import { Checkbox } from './components/ui/checkbox'
import { signInWithKakao } from './betaAuth'
import { allChecked, ensureDownloadConsent, NO_CHECKS, recordConsent, savePendingDownload, TERMS_VERSION, useConsentStore } from './downloadConsent'
import { setExportGate } from './fontExportStore'
import { useFontPresetStore } from './fontPresetStore'
import type { ConsentChecks, ConsentItem, ConsentRequest } from './downloadConsent'
import styles from './ConsentSheet.module.css'

/**
 * 다운로드 직전 동의 시트(플랜 `2026-10-06_카카오-로그인-다운로드-게이트.md`). 앱 어디서 받든 한 장 — `main.tsx`가 알림 줄 옆에 늘 둔다.
 * 필수 넷을 다 체크해야 단추가 켜진다. 손님은 `동의하고 카카오로 계속`(체크한 것과 받던 폰트 이름을 남기고 떠난다),
 * 회원은 `동의하고 받기`(프로필에 적고 바로 받는다). 베타 계정도 처음 받을 때 한 번 본다.
 */
// 추출 들머리에 동의 문지기를 끼운다. 이 모듈이 앱에 한 번 실리면 된다(`main.tsx`).
setExportGate((familyName) => ensureDownloadConsent(familyName, useFontPresetStore.getState().preset))

export function ConsentSheet() {
  const request = useConsentStore((state) => state.request)
  if (!request) return null
  return <ConsentSheetBody key={request.fontName} request={request} />
}

function ConsentSheetBody({ request }: { request: ConsentRequest }) {
  const [checks, setChecks] = useState<ConsentChecks>(NO_CHECKS)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const ready = allChecked(checks)
  const toggle = (item: ConsentItem, on: boolean) => setChecks((prev) => ({ ...prev, [item]: on }))
  const toggleAll = (on: boolean) => setChecks({ terms: on, age: on, public: on, license: on })
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape' && !busy) request.resolve(false) }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [request, busy])

  const agree = async () => {
    if (!ready || busy) return
    setBusy(true)
    setFailed(false)
    if (request.guest) {
      // 카카오 갔다 와서 같은 폰트 이름으로 이름 시트를 다시 연다(`FontCardDownload`).
      savePendingDownload(window.sessionStorage, { fontName: request.fontName, version: TERMS_VERSION, license: request.license.id })
      const went = await signInWithKakao('/dashboard')
      if (went.ok) return
      setFailed(true)
      setBusy(false)
      return
    }
    if (await recordConsent(request.license)) { request.resolve(true); return }
    setFailed(true)
    setBusy(false)
  }

  const items: { key: ConsentItem; title: ReactNode; detail?: ReactNode }[] = [
    { key: 'terms', title: <><a href="/terms" target="_blank" rel="noreferrer">이용약관</a>과 <a href="/privacy" target="_blank" rel="noreferrer">개인정보 처리방침</a>에 동의해요</> },
    { key: 'age', title: '만 14세 이상이에요' },
    { key: 'public', title: '저장한 폰트는 공개되고, 서비스 소개에 쓰일 수 있어요', detail: '다른 사람이 내 폰트로 문장을 써 볼 수 있어요. 파일은 나만 받아요. 소개 · 홍보에 쓸 때 내 이름은 넣지 않아요.' },
    { key: 'license', title: `폰트 사용 조건을 확인했어요 (${request.license.label})`, detail: request.license.lines.join(' ') },
  ]

  return <div className={styles.layer} onPointerDown={(event) => { if (event.target === event.currentTarget && !busy) request.resolve(false) }} data-testid="consent-sheet">
    <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="폰트 받기 전 동의">
      <h3>받기 전에 확인해 주세요</h3>
      <p>처음 받을 때 한 번만 물어요.</p>
      <label className={styles.all} data-checked={ready || undefined}>
        <Checkbox tone="ink" checked={ready} onCheckedChange={(on) => toggleAll(on === true)} data-testid="consent-all" />
        <span>모두 동의해요</span>
      </label>
      <ul className={styles.items}>
        {items.map((item) => <li key={item.key}>
          <label>
            <Checkbox tone="ink" checked={checks[item.key]} onCheckedChange={(on) => toggle(item.key, on === true)} data-testid={`consent-${item.key}`} />
            <span className={styles.title}><em>필수</em> {item.title}</span>
          </label>
          {item.detail && <small>{item.detail}</small>}
        </li>)}
      </ul>
      {failed && <small className={styles.failed} role="alert">{request.guest ? '카카오로 가지 못했어요. 다시 해 주세요.' : '동의를 저장하지 못했어요. 다시 해 주세요.'}</small>}
      <div className={styles.actions}>
        <Button type="button" size="sheet" variant="secondary" disabled={busy} onClick={() => request.resolve(false)}>취소</Button>
        <Button type="button" size="sheet" variant="default" className={request.guest ? styles.kakao : undefined} data-primary disabled={!ready || busy} onClick={() => void agree()} data-testid="consent-agree">
          {busy ? (request.guest ? '카카오로 가는 중…' : '저장 중…') : request.guest ? '동의하고 카카오로 계속' : '동의하고 받기'}
        </Button>
      </div>
    </div>
  </div>
}
