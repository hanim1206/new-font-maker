import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { MoreHorizontal, Plus } from 'lucide-react'
import {
  clearLocalFont,
  editedDayText,
  FONT_LIMIT,
  hasLocalFont,
  keepsLocalForNewFont,
  nextFontName,
  readStamp,
  writeStamp,
} from './accountFont'
import { deleteFont, listFonts, renameFont } from './accountFontApi'
import type { FontSummary } from './accountFontApi'
import { authGateMode, signOutAndReload } from './betaAuth'
import styles from './FontHomePage.module.css'

const EDITOR_PATH = '/workspace/jamo'

/**
 * 메인 화면 `내 폰트`(`/fonts`). 로그인하면 여기부터. 목록과 `새 폰트 만들기`가 한 화면에 있다. 게이트가 꺼진 개발 서버는 이 기기 목록(`localFontApi`)으로 같은 화면.
 * 폰트를 고르면 지금 사본의 못 올린 변경을 먼저 올리고, 사본을 그 폰트로 바꿔 편집 화면을 연다.
 */
export function FontHomePage({ me, nickname }: { me: string; nickname: string | null }) {
  const [fonts, setFonts] = useState<FontSummary[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState('')
  const [menuFor, setMenuFor] = useState<string | null>(null)
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null)
  const currentId = readStamp(localStorage).fontId

  const load = useCallback(async () => {
    const listed = await listFonts(me)
    if (listed.ok) { setFonts(listed.value); setFailure('') } else setFailure('목록을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.')
  }, [me])
  useEffect(() => { void load() }, [load])

  /** 다른 폰트로 가기 전에 지금 사본의 못 올린 변경을 올린다. 못 올리면 가지 않는다. */
  const settled = async (): Promise<boolean> => {
    const stamp = readStamp(localStorage)
    if (stamp.owner !== me || !stamp.pending) return true
    const { uploadPendingCopy } = await import('./accountFontSync')
    if (await uploadPendingCopy(me)) return true
    setFailure('지금 폰트에 저장하지 못한 변경이 있어요. 인터넷 연결을 확인하고 다시 눌러 주세요.')
    return false
  }

  const open = async (fontId: string) => {
    if (busy) return
    setBusy(true)
    // 다른 폰트로 가면 사본을 비우고 `fresh`를 남긴다 — 게이트가 꺼진 dev는 평소 사본이 이기므로 이때만 기록에서 읽게.
    const switching = readStamp(localStorage).fontId !== fontId
    if (switching) {
      if (!(await settled())) { setBusy(false); return }
      clearLocalFont(localStorage)
    }
    writeStamp(localStorage, switching ? { owner: me, fontId, pending: false, fresh: true } : { owner: me, fontId, pending: false })
    window.location.assign(EDITOR_PATH)
  }

  const createNew = async () => {
    if (busy || !fonts || fonts.length >= FONT_LIMIT) return
    setBusy(true)
    if (!(await settled())) { setBusy(false); return }
    // 로그인 전에 이 기기에서 만든 작업이 있고 계정이 비었으면 그 작업이 첫 폰트가 된다. 아니면 새로 시작.
    const stamp = readStamp(localStorage)
    if (!keepsLocalForNewFont(stamp, fonts.length, hasLocalFont(localStorage))) clearLocalFont(localStorage)
    writeStamp(localStorage, { owner: me, fontId: null, pending: false, create: nextFontName(nickname, fonts.map((font) => font.name)) })
    window.location.assign(EDITOR_PATH)
  }

  const saveName = async (event: FormEvent) => {
    event.preventDefault()
    if (!renaming || busy) return
    const name = renaming.name.trim()
    if (!name) return
    setBusy(true)
    const renamed = await renameFont(renaming.id, name)
    if (renamed.ok) { setRenaming(null); await load() } else setFailure('이름을 바꾸지 못했어요. 다시 해 주세요.')
    setBusy(false)
  }

  const remove = async (font: FontSummary) => {
    setMenuFor(null)
    if (busy || !window.confirm(`‘${font.name}’을(를) 지울까요?`)) return
    setBusy(true)
    const deleted = await deleteFont(font.id)
    if (deleted.ok) {
      // 지금 연 폰트를 지웠으면 사본도 버린다. 서버에 올릴 필요도 없다.
      if (readStamp(localStorage).fontId === font.id) {
        clearLocalFont(localStorage)
        writeStamp(localStorage, { owner: me, fontId: null, pending: false })
      }
      await load()
    } else setFailure('지우지 못했어요. 다시 해 주세요.')
    setBusy(false)
  }

  const full = (fonts?.length ?? 0) >= FONT_LIMIT
  return <main className={styles.page}>
    <section className={styles.card} data-testid="font-home" aria-busy={busy || undefined}>
      <header>
        <h1>내 폰트</h1>
        {fonts && <span data-testid="font-home-count">{fonts.length} / {FONT_LIMIT}</span>}
      </header>

      {fonts === null && !failure && <p className={styles.note}>불러오는 중…</p>}
      {fonts && fonts.length > 0 && <ul className={styles.list}>
        {fonts.map((font) => <li key={font.id} data-testid="font-home-item">
          {renaming?.id === font.id
            ? <form className={styles.rename} onSubmit={saveName}>
              <input
                value={renaming.name}
                onChange={(event) => setRenaming({ id: font.id, name: event.target.value })}
                maxLength={40}
                autoFocus
                aria-label="폰트 이름"
                data-testid="font-home-rename-input"
              />
              <button type="submit" disabled={busy || !renaming.name.trim()}>저장</button>
              <button type="button" onClick={() => setRenaming(null)}>취소</button>
            </form>
            : <>
              <button type="button" className={styles.open} onClick={() => void open(font.id)} disabled={busy}>
                <strong>{font.name}</strong>
                <span>{font.id === currentId ? '지금 연 폰트 · ' : ''}{editedDayText(font.updatedAt)}</span>
              </button>
              <button type="button" className={styles.more} aria-label={`${font.name} 더 보기`} aria-expanded={menuFor === font.id} onClick={() => setMenuFor(menuFor === font.id ? null : font.id)}>
                <MoreHorizontal size={18} />
              </button>
              {menuFor === font.id && <div className={styles.menu} role="menu">
                <button type="button" role="menuitem" onClick={() => { setMenuFor(null); setRenaming({ id: font.id, name: font.name }) }}>이름 바꾸기</button>
                <button type="button" role="menuitem" data-tone="danger" onClick={() => void remove(font)}>삭제</button>
              </div>}
            </>}
        </li>)}
      </ul>}

      {fonts && <button type="button" className={styles.create} onClick={() => void createNew()} disabled={busy || full} data-testid="font-home-create">
        <Plus size={18} />새 폰트 만들기
      </button>}
      {full && <p className={styles.note}>폰트는 {FONT_LIMIT}개까지 만들 수 있어요. 하나를 지우면 새로 만들 수 있어요.</p>}
      {failure && <p className={styles.failure} role="alert">{failure}</p>}

      {/* 게이트가 꺼진 개발 서버는 계정이 없다 — 목록은 이 기기(localStorage)에 있다. */}
      <footer>{authGateMode() === 'on'
        ? <button type="button" onClick={() => void signOutAndReload()}>로그아웃</button>
        : <span className={styles.note} data-testid="font-home-local">이 기기에만 저장되는 개발용 목록</span>}</footer>
    </section>
  </main>
}
