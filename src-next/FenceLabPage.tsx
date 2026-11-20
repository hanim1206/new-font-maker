import { useMemo, useState } from 'react'
import { Check, ChevronRight, Copy, RotateCcw } from 'lucide-react'
import { useJamoStore } from '../src/stores/jamoStore'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { AppGlyph, type PartShift } from './AppGlyph'
import { Button } from './components/ui/button'
import { answersText, expectedAnswer, FENCE_ITEMS, fenceInfo, fenceShift, LEVEL_NAMES, type Answer } from './fenceLab'
import styles from './FenceLabPage.module.css'

const STORAGE_KEY = 'fence-lab-answers'

function loadAnswers(): (Answer | undefined)[] {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(saved) ? saved.slice(0, FENCE_ITEMS.length) : []
  } catch {
    return []
  }
}

/**
 * 울타리 실험지(12문항). 배치 값 넷(받침 밑선 흔들림 · 받침 유무 윗선 차이 · 획 사이 틈 · 무게중심)을 가운데 · 울타리 끝 · 두 배 밖에 두고
 * 한 글줄씩 보여 준다. 답은 괜찮다 / 어색하다 둘뿐이고, 답한 뒤에 무엇을 흔들었는지 알려 준다. 답은 이 기기에만 둔다.
 */
export function FenceLabPage() {
  const [answers, setAnswers] = useState<(Answer | undefined)[]>(loadAnswers)
  // 이어 하기: 처음으로 답이 빈 문항부터. 다 답했으면 결과.
  const [index, setIndex] = useState(() => {
    const firstOpen = FENCE_ITEMS.findIndex((_, at) => !answers[at])
    return firstOpen === -1 ? FENCE_ITEMS.length : firstOpen
  })
  const [copied, setCopied] = useState(false)

  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)

  const done = index >= FENCE_ITEMS.length
  const item = FENCE_ITEMS[Math.min(index, FENCE_ITEMS.length - 1)]
  const info = fenceInfo(item.value)
  const answer = done ? undefined : answers[index]

  // 글자마다 옮길 양. 같은 객체를 넘겨야 다시 그릴 때 상자 계산이 안 돈다.
  const shifts = useMemo(() => {
    let finalIndex = 0
    return [...info.sentence].map((char): PartShift | undefined => {
      if (char === ' ') return undefined
      const { layoutType } = decomposeSyllable(char, choseong, jungseong, jongseong)
      const shift = fenceShift(item.value, item.level, layoutType, finalIndex)
      if (layoutType.endsWith('-jongseong')) finalIndex++
      return shift
    })
  }, [info.sentence, item.value, item.level, choseong, jungseong, jongseong])

  const save = (next: (Answer | undefined)[]) => {
    setAnswers(next)
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)) } catch { /* 저장 못 해도 화면은 간다 */ }
  }
  const respond = (value: Answer) => {
    const next = [...answers]
    next[index] = value
    save(next)
  }
  const restart = () => {
    save([])
    setIndex(0)
    setCopied(false)
  }
  const copy = () => {
    void navigator.clipboard?.writeText(answersText(answers)).then(() => setCopied(true), () => setCopied(true))
  }

  const answeredCount = answers.filter(Boolean).length
  const matchCount = FENCE_ITEMS.filter((entry, at) => answers[at] && answers[at] === expectedAnswer(entry.level)).length

  return <main className={styles.page}>
    <header className={styles.header}>
      <span className={styles.eyebrow}>실험지 · {done ? `${FENCE_ITEMS.length}/${FENCE_ITEMS.length}` : `${index + 1}/${FENCE_ITEMS.length}`}</span>
      <h1>이 글줄, 괜찮아 보이나요?</h1>
      <p>보이는 대로 바로 고르세요. 한 문항에 10초면 돼요.</p>
    </header>

    <div className={styles.progress} aria-hidden="true">
      {FENCE_ITEMS.map((_, at) => <span key={at} data-state={answers[at] ? 'done' : at === index ? 'now' : undefined} />)}
    </div>

    {done ? <section className={styles.card} aria-label="결과" data-testid="fence-result">
      <h2 className={styles.resultTitle}>끝났어요 · 기대와 같은 답 {matchCount}/{answeredCount}</h2>
      <ol className={styles.results}>
        {FENCE_ITEMS.map((entry, at) => {
          const said = answers[at]
          const match = said === expectedAnswer(entry.level)
          return <li key={at} data-match={said ? match : undefined}>
            <span className={styles.resultName}>{fenceInfo(entry.value).name}</span>
            <span className={styles.resultLevel}>{LEVEL_NAMES[entry.level]}</span>
            <span className={styles.resultAnswer}>{said === 'ok' ? '괜찮다' : said === 'awkward' ? '어색하다' : '—'}</span>
          </li>
        })}
      </ol>
      <p className={styles.resultNote}>기대: 가운데 · 울타리 끝은 괜찮다, 두 배 밖은 어색하다.</p>
      <div className={styles.actions}>
        <Button variant="outline" size="block" onClick={restart} data-testid="fence-restart"><RotateCcw aria-hidden="true" />다시 하기</Button>
        <Button size="block" onClick={copy} data-testid="fence-copy">{copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}{copied ? '복사했어요' : '결과 복사'}</Button>
      </div>
    </section> : <>
      <section className={styles.card} aria-label="글줄">
        <div className={styles.line} data-testid="fence-line">
          {[...info.sentence].map((char, at) => char === ' '
            ? <span key={at} className={styles.space} />
            : <AppGlyph key={`${index}-${at}`} char={char} size={44} placementShift={() => shifts[at]} />)}
        </div>
      </section>

      {answer ? <section className={styles.reveal} data-testid="fence-reveal" aria-live="polite">
        <span className={styles.revealLabel}>흔든 것</span>
        <strong>{info.name} · {LEVEL_NAMES[item.level]}</strong>
        <span className={styles.revealDetail}>{info.detail}. 내 답: {answer === 'ok' ? '괜찮다' : '어색하다'}</span>
      </section> : <p className={styles.ask}>무엇을 바꿨는지는 답한 뒤에 알려 드려요.</p>}

      <div className={styles.actions}>
        {answer
          ? <Button size="block" className={styles.wide} onClick={() => setIndex((now) => now + 1)} data-testid="fence-next">
            {index + 1 < FENCE_ITEMS.length ? '다음 문항' : '결과 보기'}<ChevronRight aria-hidden="true" />
          </Button>
          : <>
            <Button variant="outline" size="block" onClick={() => respond('awkward')} data-testid="fence-awkward">어색하다</Button>
            <Button size="block" onClick={() => respond('ok')} data-testid="fence-ok">괜찮다</Button>
          </>}
      </div>
    </>}
  </main>
}
