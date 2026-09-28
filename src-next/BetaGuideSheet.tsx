import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import styles from './BetaGuideSheet.module.css'

/** 화면 그림은 `public/beta-guide/`의 실제 앱 캡처(390×520, 2배). 화면이 바뀌면 다시 찍는다. */
const STEPS: { image: string; title: string; body: string; bottom?: true }[] = [
  { image: '1-dashboard', title: '대시보드', body: '내 폰트를 한눈에 보는 곳이에요. 위 카드에 지금 폰트로 쓴 문장이 보이고, 왼쪽 목차로 스타일 · 초성 · 중성 · 종성 · 레이아웃을 오가요.' },
  { image: '2-style', title: '스타일', body: '폰트 전체의 굵기 · 붓 · 둥글기 · 부리를 막대로 바꿔요. 위 문장이 바로 따라 바뀌어요.' },
  { image: '3-jamo', title: '초성 · 중성 · 종성', body: '고칠 자소를 골라 담고 ‘고치기’를 눌러요. 획을 끌어 모양을 바꾸면 그 자소가 들어간 글자가 다 같이 바뀌어요.' },
  { image: '4-layout', title: '레이아웃', body: '글자 안에서 초성 · 중성 · 종성이 앉는 자리예요. 여섯 틀마다 상자 선을 끌어 자리를 넓히거나 좁혀요.' },
  { image: '5-review', title: '검수', body: '만든 글자를 표로 모아 훑어봐요. 어색한 글자를 누르면 그 글자로 들어가 고쳐요.' },
  { image: '6-download', bottom: true, title: '다운로드 · 제보', body: '다 되면 폰트 카드의 ↓ 단추로 OTF 파일을 받아요. 이상한 곳이나 바라는 게 있으면 헤더의 피드백 버튼으로 한임에게 알려 주세요.' },
]

const imageSrc = (name: string) => `/beta-guide/${name}.jpg`

/** 옆으로 이만큼 넘게 밀면 다음 · 이전 장. */
const SWIPE_PX = 40

/**
 * 처음 들어온 베타 테스터 안내. 대시보드 위에 아래 판으로 뜨고, 섹션마다 실제 화면 한 장 + 설명 두 줄.
 * 판 밖을 눌러도 안 닫힌다(실수로 넘기지 않게) — 첫 장 `건너뛰기`, 마지막 장 `시작하기`, Esc로만 닫는다.
 * `×`는 두지 않는다 — 캡처 속 머리 단추와 겹쳐 앱 단추처럼 보였다.
 */
export function BetaGuideSheet({ onClose }: { onClose: () => void }) {
  const [index, setIndex] = useState(0)
  const [closing, setClosing] = useState(false)
  const swipeFrom = useRef<number | null>(null)
  const last = index === STEPS.length - 1
  const step = STEPS[index]

  const close = () => {
    if (closing) return
    setClosing(true)
    window.setTimeout(onClose, 240)
  }
  const move = (delta: number) => setIndex((value) => Math.min(STEPS.length - 1, Math.max(0, value + delta)))

  // 넘길 때 그림이 늦게 뜨지 않게 다 미리 받아 둔다.
  useEffect(() => { for (const { image } of STEPS) new Image().src = imageSrc(image) }, [])
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close()
      else if (event.key === 'ArrowRight') move(1)
      else if (event.key === 'ArrowLeft') move(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  return createPortal(<div className={styles.layer} data-closing={closing || undefined}>
    <div className={styles.sheet} role="dialog" aria-modal="true" aria-label="한글 폰트 메이커 둘러보기" data-testid="beta-guide">
      <div
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
        <img key={step.image} data-bottom={step.bottom} src={imageSrc(step.image)} alt={`${step.title} 화면`} draggable={false} />
      </div>
      <div className={styles.dots} aria-hidden="true">
        {STEPS.map(({ image }, order) => <span key={image} data-on={order === index || undefined} />)}
      </div>
      <div key={index} className={styles.text} aria-live="polite">
        <h3>{step.title}</h3>
        <p>{step.body}</p>
      </div>
      <div className={styles.actions}>
        {index === 0
          ? <button type="button" onClick={close} data-testid="beta-guide-skip">건너뛰기</button>
          : <button type="button" onClick={() => move(-1)} data-testid="beta-guide-prev">이전</button>}
        <button type="button" data-primary onClick={() => last ? close() : move(1)} data-testid="beta-guide-next">{last ? '시작하기' : '다음'}</button>
      </div>
    </div>
  </div>, document.body)
}
