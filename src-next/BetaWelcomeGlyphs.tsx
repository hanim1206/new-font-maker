import { useLayoutEffect, useRef } from 'react'
import type { CSSProperties } from 'react'
import { AppGlyph } from './AppGlyph'
import styles from './BetaLoginPage.module.css'

const GLYPH_SIZE = 64
/** 글자 사이를 좁힌다(px, 음수). 프리셋 글자는 제 몸통 여백이 있어 그대로 두면 성기다. */
const TRACKING = -7
/** 획 하나 긋는 시간과 다음 획이 시작하는 간격(ms). 획이 조금씩 겹쳐 흐르듯 써진다. */
const STROKE_MS = 220
const STROKE_STEP_MS = 45
const UNDERLINE_MS = 440
/** 이름 밑 물결. 한 물결 폭 · 높이 · 굵기(px). */
const WAVE_LENGTH = 56
const WAVE_HEIGHT = 2.5
const WAVE_WIDTH = 4.5

/** 폭 `width`를 채우는 물결 경로. 반 물결마다 위 · 아래로 번갈아 휜다. 반 물결 수를 정수로 맞춰 끝이 잘리지 않는다. */
function wavePath(width: number): string {
  const span = width - WAVE_WIDTH
  const count = Math.max(1, Math.round(span / (WAVE_LENGTH / 2)))
  const half = span / count
  const mid = WAVE_HEIGHT + WAVE_WIDTH / 2
  let d = `M${WAVE_WIDTH / 2} ${mid}`
  for (let index = 0; index < count; index += 1) {
    const x = WAVE_WIDTH / 2 + index * half
    d += ` Q${x + half / 2} ${index % 2 === 0 ? mid - WAVE_HEIGHT * 2 : mid + WAVE_HEIGHT * 2} ${x + half} ${mid}`
  }
  return d
}

function Wave({ width }: { width: number }) {
  const height = WAVE_HEIGHT * 2 + WAVE_WIDTH
  return <svg className={styles.wave} width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
    <path d={wavePath(width)} fill="none" stroke="currentColor" strokeWidth={WAVE_WIDTH} strokeLinecap="round" strokeLinejoin="round" data-wave="" />
  </svg>
}
/** 노토 모델이 늦게 와 글자가 다시 그려질 수 있다. 이만큼 조용해지면 긋기 시작, 너무 오래면 그냥 시작. */
const SETTLE_MS = 180
const SETTLE_LIMIT_MS = 2500

function Word({ text, className }: { text: string; className?: string }) {
  return <span className={[styles.word, className].filter(Boolean).join(' ')}>{[...text].map((char, at) => <AppGlyph key={at} char={char} size={GLYPH_SIZE} />)}</span>
}

/**
 * 획을 앞에서부터 하나씩 긋는다. 선으로 그린 획(중심선)은 대시로 그리고, 면으로 채운 조각은 제 차례에 나타난다.
 * 이름 밑 물결은 DOM 맨 끝이라 마지막에 조금 느리게 그어진다.
 * 끝나면 인라인 상태가 남지 않는다(`fill: backwards`) — 나중에 다시 그려져도 온전한 글자다.
 */
function drawStrokes(root: HTMLElement): Animation[] {
  const animations: Animation[] = []
  const paths = [...root.querySelectorAll<SVGGeometryElement>('path')]
  paths.forEach((path, index) => {
    const delay = index * STROKE_STEP_MS
    const duration = path.hasAttribute('data-wave') ? UNDERLINE_MS : STROKE_MS
    const stroked = getComputedStyle(path).fill === 'none'
    if (stroked) {
      const length = path.getTotalLength()
      // 대시 길이 0이어도 둥근 끝은 점으로 보이므로, 시작 전에는 투명하게 둔다.
      animations.push(path.animate([
        { strokeDasharray: `${length} ${length}`, strokeDashoffset: length, opacity: 0 },
        { strokeDasharray: `${length} ${length}`, strokeDashoffset: length * 0.98, opacity: 1, offset: 0.02 },
        { strokeDasharray: `${length} ${length}`, strokeDashoffset: 0, opacity: 1 },
      ], { duration, delay, easing: 'ease-in-out', fill: 'backwards' }))
    } else {
      animations.push(path.animate([{ opacity: 0 }, { opacity: 1 }], { duration: STROKE_MS, delay, fill: 'backwards' }))
    }
  })
  return animations
}

/**
 * 로그인 화면의 인사. 대시보드 문장처럼 앱 획으로 그린다 — 로그아웃하면 사본을 지우므로 보통은 기본 프리셋 글자다.
 * 처음 한 번 획을 긋는 애니메이션. 움직임 줄이기를 켰으면 멈춘 글자로 바로 보인다.
 * 스토어 · 렌더러가 무거워 로그인 화면이 먼저 뜨도록 따로 불러온다.
 */
export default function BetaWelcomeGlyphs({ name, onDrawn }: { name: string | null; onDrawn: () => void }) {
  const root = useRef<HTMLDivElement>(null)
  const drawn = useRef(onDrawn)
  useLayoutEffect(() => { drawn.current = onDrawn })

  useLayoutEffect(() => {
    const element = root.current
    if (!element) return
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || typeof element.animate !== 'function') { drawn.current(); return }
    element.style.visibility = 'hidden'
    let animations: Animation[] = []
    let quiet = 0
    const start = () => {
      observer.disconnect()
      window.clearTimeout(quiet)
      window.clearTimeout(limit)
      animations = drawStrokes(element)
      element.style.visibility = ''
      // 다 그어지면 아래 문구 차례. 중간에 치우면(cancel) finished가 거절되니 조용히 넘긴다.
      Promise.all(animations.map((animation) => animation.finished)).then(() => drawn.current(), () => {})
    }
    const observer = new MutationObserver(() => {
      window.clearTimeout(quiet)
      quiet = window.setTimeout(start, SETTLE_MS)
    })
    observer.observe(element, { subtree: true, childList: true, attributes: true })
    quiet = window.setTimeout(start, SETTLE_MS)
    const limit = window.setTimeout(start, SETTLE_LIMIT_MS)
    return () => {
      observer.disconnect()
      window.clearTimeout(quiet)
      window.clearTimeout(limit)
      for (const animation of animations) animation.cancel()
      element.style.visibility = ''
    }
  }, [name])

  return <div ref={root} className={styles.glyphs} style={{ '--tracking': `${TRACKING}px` } as CSSProperties}>
    <Word text="환영합니다" className={styles.line} />
    {name ? <span className={styles.line}><Word text={name} className={styles.name} /><Wave width={[...name].length * (GLYPH_SIZE + TRACKING) - TRACKING} /></span> : null}
  </div>
}
