import { useMemo, useState } from 'react'
import { Check, ChevronRight, Copy, RotateCcw } from 'lucide-react'
import { useJamoStore } from '../src/stores/jamoStore'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { AppGlyph, type PartShift } from './AppGlyph'
import { Button } from './components/ui/button'
import { ChoiceGroup, ChoiceItem } from './components/ui/choice-group'
import { answersText, expectedAnswer, FENCE_ITEMS, fenceInfo, fenceShift, levelName, limitOf, LIMIT_ITEMS, type Answer, type FenceItem, type FenceSide, type FenceValue } from './fenceLab'
import styles from './FenceLabPage.module.css'

type SheetSet = 'check' | 'limit'
const SETS: Record<SheetSet, { items: readonly FenceItem[]; storageKey: string; label: string }> = {
  check: { items: FENCE_ITEMS, storageKey: 'fence-lab-answers', label: '확인 12문항' },
  limit: { items: LIMIT_ITEMS, storageKey: 'fence-lab-limit-answers', label: `한계선 ${LIMIT_ITEMS.length}문항` },
}

function loadAnswers(set: SheetSet): (Answer | undefined)[] {
  try {
    const saved = JSON.parse(localStorage.getItem(SETS[set].storageKey) ?? '[]')
    return Array.isArray(saved) ? saved.slice(0, SETS[set].items.length) : []
  } catch {
    return []
  }
}

/** 한계선 문항에서 값 · 쪽마다 따로 본다. 윗선 차이만 넓은 쪽이 따로 있다. */
const LIMIT_ROWS: readonly { value: FenceValue; side: FenceSide }[] = [
  { value: 'topLine', side: 'default' }, { value: 'topLine', side: 'wide' }, { value: 'gap', side: 'default' }, { value: 'centroid', side: 'default' },
]

/** 실험지 둘을 고르는 겉. 기본은 한계선 문항, `?set=check`면 확인 12문항. */
export function FenceLabPage() {
  const [set, setSet] = useState<SheetSet>(() => (new URLSearchParams(window.location.search).get('set') === 'check' ? 'check' : 'limit'))
  return <main className={styles.page}>
    <ChoiceGroup variant="segment" aria-label="실험지" className={styles.setSwitch}>
      {(Object.keys(SETS) as SheetSet[]).map((key) => <ChoiceItem key={key} checked={set === key} onClick={() => setSet(key)} data-testid={`fence-set-${key}`}>{SETS[key].label}</ChoiceItem>)}
    </ChoiceGroup>
    <FenceSheet key={set} set={set} />
  </main>
}

/**
 * 울타리 실험지(12문항). 배치 값 넷(받침 밑선 흔들림 · 받침 유무 윗선 차이 · 획 사이 틈 · 무게중심)을 가운데 · 울타리 끝 · 두 배 밖에 두고
 * 한 글줄씩 보여 준다. 답은 괜찮다 / 어색하다 둘뿐이고, 답한 뒤에 무엇을 흔들었는지 알려 준다. 답은 이 기기에만 둔다.
 * 한계선 문항은 같은 틀로 세 · 네 · 여섯 배 밖을 보이고, 끝에 값마다 처음 어색했던 단계(한계선)를 보인다.
 */
function FenceSheet({ set }: { set: SheetSet }) {
  const ITEMS = SETS[set].items
  const [answers, setAnswers] = useState<(Answer | undefined)[]>(() => loadAnswers(set))
  // 이어 하기: 처음으로 답이 빈 문항부터. 다 답했으면 결과.
  const [index, setIndex] = useState(() => {
    const firstOpen = ITEMS.findIndex((_, at) => !answers[at])
    return firstOpen === -1 ? ITEMS.length : firstOpen
  })
  const [copied, setCopied] = useState(false)

  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)

  const done = index >= ITEMS.length
  const item = ITEMS[Math.min(index, ITEMS.length - 1)]
  const info = fenceInfo(item.value)
  const answer = done ? undefined : answers[index]

  // 글자마다 옮길 양. 같은 객체를 넘겨야 다시 그릴 때 상자 계산이 안 돈다.
  const shifts = useMemo(() => {
    let finalIndex = 0
    return [...info.sentence].map((char): PartShift | undefined => {
      if (char === ' ') return undefined
      const { layoutType } = decomposeSyllable(char, choseong, jungseong, jongseong)
      const shift = fenceShift(item.value, item.level, layoutType, finalIndex, item.side)
      if (layoutType.endsWith('-jongseong')) finalIndex++
      return shift
    })
  }, [info.sentence, item.value, item.level, item.side, choseong, jungseong, jongseong])

  const save = (next: (Answer | undefined)[]) => {
    setAnswers(next)
    try { localStorage.setItem(SETS[set].storageKey, JSON.stringify(next)) } catch { /* 저장 못 해도 화면은 간다 */ }
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
    void navigator.clipboard?.writeText(answersText(answers, ITEMS)).then(() => setCopied(true), () => setCopied(true))
  }

  const answeredCount = answers.filter(Boolean).length
  const matchCount = ITEMS.filter((entry, at) => answers[at] && answers[at] === expectedAnswer(entry.level)).length

  return <>
    <header className={styles.header}>
      <span className={styles.eyebrow}>실험지 · {done ? `${ITEMS.length}/${ITEMS.length}` : `${index + 1}/${ITEMS.length}`}</span>
      <h1>이 글줄, 괜찮아 보이나요?</h1>
      <p>보이는 대로 바로 고르세요. 한 문항에 10초면 돼요.</p>
    </header>

    <div className={styles.progress} aria-hidden="true">
      {ITEMS.map((_, at) => <span key={at} data-state={answers[at] ? 'done' : at === index ? 'now' : undefined} />)}
    </div>

    {done ? <section className={styles.card} aria-label="결과" data-testid="fence-result">
      {set === 'check'
        ? <h2 className={styles.resultTitle}>끝났어요 · 기대와 같은 답 {matchCount}/{answeredCount}</h2>
        : <>
          <h2 className={styles.resultTitle}>끝났어요 · 값마다 한계선</h2>
          <ul className={styles.limits} data-testid="fence-limits">
            {LIMIT_ROWS.map(({ value, side }) => {
              const limit = limitOf(ITEMS, answers, value, side)
              return <li key={`${value}-${side}`}>
                <span className={styles.resultName}>{fenceInfo(value).name}{side === 'wide' ? '(넓은 쪽)' : ''}</span>
                <strong>{limit === undefined ? '—' : limit === null ? '여섯 배 밖도 괜찮다' : `${levelName(limit)}부터 어색`}</strong>
              </li>
            })}
          </ul>
        </>}
      <ol className={styles.results}>
        {ITEMS.map((entry, at) => {
          const said = answers[at]
          const match = set === 'check' ? said === expectedAnswer(entry.level) : undefined
          return <li key={at} data-match={said && match !== undefined ? match : undefined}>
            <span className={styles.resultName}>{fenceInfo(entry.value).name}</span>
            <span className={styles.resultLevel}>{levelName(entry.level, entry.side)}</span>
            <span className={styles.resultAnswer}>{said === 'ok' ? '괜찮다' : said === 'awkward' ? '어색하다' : '—'}</span>
          </li>
        })}
      </ol>
      <p className={styles.resultNote}>{set === 'check' ? '기대: 가운데 · 울타리 끝은 괜찮다, 두 배 밖은 어색하다.' : '처음 어색하다고 답한 단계가 그 값의 한계선이에요. 무게중심은 울타리 가운데에서 흔들었어요.'}</p>
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
        <strong>{info.name} · {levelName(item.level, item.side)}</strong>
        <span className={styles.revealDetail}>{info.detail}. 내 답: {answer === 'ok' ? '괜찮다' : '어색하다'}</span>
      </section> : <p className={styles.ask}>무엇을 바꿨는지는 답한 뒤에 알려 드려요.</p>}

      <div className={styles.actions}>
        {answer
          ? <Button size="block" className={styles.wide} onClick={() => setIndex((now) => now + 1)} data-testid="fence-next">
            {index + 1 < ITEMS.length ? '다음 문항' : '결과 보기'}<ChevronRight aria-hidden="true" />
          </Button>
          : <>
            <Button variant="outline" size="block" onClick={() => respond('awkward')} data-testid="fence-awkward">어색하다</Button>
            <Button size="block" onClick={() => respond('ok')} data-testid="fence-ok">괜찮다</Button>
          </>}
      </div>
    </>}
  </>
}
