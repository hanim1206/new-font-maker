import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './SlideSheet.module.css'

/** 한 장 = 그림 한 장 + 제목 + 짧은 본문. 그림이 없으면 글만. */
export interface SlideSheetSlide { image: string; title: string; body: string; alt?: string; bottom?: true }

/** 옆으로 이만큼 넘게 밀면 다음 · 이전 장. */
const SWIPE_PX = 40

/**
 * 장을 좌우로 넘기는 둥근 판. 둘러보기(`BetaGuideSheet`)와 공지(`AnnouncementSpot`)가 같이 쓴다.
 * 판 밖을 눌러도 안 닫힌다(실수로 넘기지 않게) — 첫 장 왼쪽 단추, 마지막 장 오른쪽 단추, Esc로만 닫는다.
 * `×`는 두지 않는다 — 캡처 속 머리 단추와 겹쳐 앱 단추처럼 보였다.
 * `inline`이면 깔개 없이 그 자리에 판만 그린다(관리자 미리보기). 닫으면 첫 장으로 돌아간다.
 * `eyebrow`는 장 제목 위의 작은 머리말 — 장을 넘겨도 그대로 있다(공지 이름).
 * `centered`면 그림이 틀보다 길 때 위가 아니라 가운데를 맞춘다(공지 — 위아래를 같이 덜어 낸다).
 */
export function SlideSheet({ slides, label, eyebrow, centered, testId, firstLabel, lastLabel, onClose, inline }: {
  slides: SlideSheetSlide[]
  label: string
  eyebrow?: string
  centered?: boolean
  testId: string
  /** 첫 장 왼쪽 단추(닫기). 둘째 장부터는 `이전`. */
  firstLabel: string
  /** 마지막 장 오른쪽 단추(닫기). 그 전에는 `다음`. */
  lastLabel: string
  onClose: () => void
  inline?: boolean
}) {
  const [index, setIndex] = useState(0)
  const [closing, setClosing] = useState(false)
  const swipeFrom = useRef<number | null>(null)
  const at = Math.min(index, Math.max(0, slides.length - 1))
  const last = at === slides.length - 1
  const slide = slides[at]

  const close = () => {
    if (inline) {
      setIndex(0)
      onClose()
      return
    }
    if (closing) return
    setClosing(true)
    window.setTimeout(onClose, 240)
  }
  const move = (delta: number) => setIndex((value) => Math.min(slides.length - 1, Math.max(0, value + delta)))

  // 넘길 때 그림이 늦게 뜨지 않게 다 미리 받아 둔다.
  const images = slides.map(({ image }) => image).join('\n')
  useEffect(() => { for (const image of images.split('\n')) if (image) new Image().src = image }, [images])
  useEffect(() => {
    if (inline) return
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
      else if (event.key === 'ArrowRight') move(1)
      else if (event.key === 'ArrowLeft') move(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  if (!slide) return null

  const sheet = <div className={styles.sheet} data-inline={inline || undefined} role="dialog" aria-modal={!inline} aria-label={label} data-testid={testId}>
    {slide.image && <div
      className={styles.frame}
      onPointerDown={(event) => { swipeFrom.current = event.clientX }}
      onPointerUp={(event) => {
        const from = swipeFrom.current
        swipeFrom.current = null
        if (from === null) return
        const dx = event.clientX - from
        if (Math.abs(dx) >= SWIPE_PX) move(dx < 0 ? 1 : -1)
      }}
      onPointerCancel={() => { swipeFrom.current = null }}
    >
      <img key={slide.image} data-bottom={slide.bottom} data-center={centered || undefined} src={slide.image} alt={slide.alt ?? slide.title} draggable={false} />
    </div>}
    {slides.length > 1 && <div className={styles.dots} aria-hidden="true">
      {slides.map((_, order) => <span key={order} data-on={order === at || undefined} />)}
    </div>}
    <div className={styles.copy}>
      {eyebrow && <span className={styles.eyebrow} data-testid={`${testId}-eyebrow`}>{eyebrow}</span>}
      <div key={at} className={styles.text} aria-live="polite">
        <h3>{slide.title}</h3>
        {slide.body && <p>{slide.body}</p>}
      </div>
    </div>
    <div className={styles.actions}>
      {at === 0
        ? <button type="button" onClick={close} data-testid={`${testId}-skip`}>{firstLabel}</button>
        : <button type="button" onClick={() => move(-1)} data-testid={`${testId}-prev`}>이전</button>}
      <button type="button" data-primary onClick={() => last ? close() : move(1)} data-testid={`${testId}-next`}>{last ? lastLabel : '다음'}</button>
    </div>
  </div>

  if (inline) return sheet
  return createPortal(<div className={styles.layer} data-closing={closing || undefined}>{sheet}</div>, document.body)
}
