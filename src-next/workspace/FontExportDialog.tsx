import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { DEFAULT_FONT_NAME, useFontExportStore } from '../fontExportStore'
import styles from './FontExportDialog.module.css'

/** 추출 전에 폰트 이름을 한 번 묻는 창. 앱에 하나만 둔다(`App`). */
export function FontExportDialog() {
  const dialogOpen = useFontExportStore((state) => state.dialogOpen)
  return dialogOpen ? <FontExportForm /> : null
}

function FontExportForm() {
  const savedName = useFontExportStore((state) => state.familyName)
  const lastError = useFontExportStore((state) => state.error)
  const cancel = useFontExportStore((state) => state.cancel)
  const confirm = useFontExportStore((state) => state.confirm)
  const [name, setName] = useState(savedName)

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') cancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [cancel])

  const submit = (event: FormEvent) => { event.preventDefault(); void confirm(name) }

  return <div className={styles.backdrop} onClick={cancel}>
    <form className={styles.sheet} role="dialog" aria-modal="true" aria-label="폰트 이름 정하기" onClick={(event) => event.stopPropagation()} onSubmit={submit} data-testid="font-export-dialog">
      <header>
        <b>폰트 이름</b>
        <small>설치했을 때 글꼴 목록에 보이는 이름이에요. 파일도 이 이름으로 저장됩니다.</small>
      </header>
      {lastError ? <small role="alert" data-testid="font-export-error">지난 추출 실패: {lastError}</small> : null}
      <input type="text" value={name} onChange={(event) => setName(event.target.value)} placeholder={DEFAULT_FONT_NAME} maxLength={40} autoFocus onFocus={(event) => event.target.select()} aria-label="폰트 이름" data-testid="font-export-name" />
      <div className={styles.actions}>
        <button type="button" onClick={cancel}>취소</button>
        <button type="submit" data-testid="font-export-confirm">OTF 추출</button>
      </div>
    </form>
  </div>
}
