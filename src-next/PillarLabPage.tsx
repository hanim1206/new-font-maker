import { useMemo, useState } from 'react'
import { Check, ChevronRight, Dices, RotateCcw } from 'lucide-react'
import type { PenPoint } from '../src/services/penStrokeFit'
import { useJamoStore } from '../src/stores/jamoStore'
import { AppGlyph } from './AppGlyph'
import { Button } from './components/ui/button'
import { ChoiceGroup, ChoiceItem } from './components/ui/choice-group'
import { randomSampleSentence } from './sampleSentences'
import { StemPad } from './stemPad'
import { reasonText, useDrawnStems, useStemMarker, useStemOverrides, withCopula } from './stemPreview'
import { STEMS, stemInfo, type StemKind } from './strokeLab'
import styles from './PillarLabPage.module.css'

/**
 * 획 긋기 시험판(학습 단계 프로토타입). 줄기 여섯(세로선 · 세로 짧은 선 · 가로선 · 가로 긴 선 · 대각선 · 동그라미)을 한 번씩 그으면
 * 예시 글줄의 그 줄기가 전부 내 선으로 바뀐다. 언제든 다시 긋는다. 주사위는 문장을 바꾸고, `자리 보기`는 지금 줄기가 쓰인 획을 색으로 보인다.
 * 폰에서 손가락 · 펜슬로 긋는 화면이 먼저다. 저장하지 않고 제품 값(자모 스토어 · 마스터)도 바꾸지 않는다 — 미리보기는 자모 덮어쓰기(override)로만.
 * 계산은 `strokeLab.ts`. 기획: 고양이 `학습-단계-뼈대-2026-11-20.md`.
 */

const FIRST_SENTENCE = '숲속 옹달샘에 토끼가 물을 마신다'

type View = 'mine' | 'base'

export function PillarLabPage() {
  const [sentence, setSentence] = useState(FIRST_SENTENCE)
  const [raws, setRaws] = useState<Partial<Record<StemKind, PenPoint[]>>>({})
  const [kind, setKind] = useState<StemKind>('vertical')
  const [view, setView] = useState<View>('mine')
  const [marked, setMarked] = useState(true)
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)

  const stems = useDrawnStems(raws)
  const { overrides, layoutOf } = useStemOverrides(stems, choseong, jungseong, jongseong)
  const markColor = useStemMarker(useMemo(() => [kind], [kind]), choseong, jungseong, jongseong)
  const strokeColorOf = marked ? markColor : undefined

  const stem = stems[kind]
  const raw = raws[kind]
  const info = stemInfo(kind)
  const accepted = !!stem?.ok
  const doneCount = STEMS.filter((item) => stems[item.kind]?.ok).length
  const kindIndex = STEMS.findIndex((item) => item.kind === kind)
  const next = STEMS[kindIndex + 1]
  const mine = view === 'mine'

  const chars = [...sentence]
  const note = stem && !stem.ok ? reasonText(stem) : accepted ? `방금 그은 게 ${withCopula(info.term)}. 길이와 자리, 굵기는 우리가 맞췄어요.` : info.hint

  return <main className={styles.page}>
    <header className={styles.header}>
      <span className={styles.eyebrow}>시험판 · 줄기 {doneCount}/{STEMS.length}</span>
      <h1>획 긋기</h1>
    </header>

    <section className={styles.lineCard} aria-label="예시 글줄">
      <div className={styles.line} data-testid="pillar-line">
        {chars.map((char, index) => char === ' '
          ? <span key={index} className={styles.space} />
          : <AppGlyph key={index} char={char} size={40}
            jungseongOverride={mine ? overrides.jungseong : undefined}
            choseongOverride={mine ? overrides.consonants[layoutOf(char)]?.choseong : undefined}
            jongseongOverride={mine ? overrides.consonants[layoutOf(char)]?.jongseong : undefined}
            strokeColorOf={strokeColorOf} />)}
      </div>
      <div className={styles.lineTools}>
        <Button variant="soft" size="chip" onClick={() => setSentence((now) => randomSampleSentence(now))} data-testid="pillar-roll"><Dices aria-hidden="true" />다른 문장</Button>
        <Button variant="chip" size="chip" aria-pressed={marked} onClick={() => setMarked((on) => !on)} data-testid="pillar-mark">자리 보기</Button>
        <ChoiceGroup variant="segment" aria-label="보기" className={styles.viewSwitch}>
          <ChoiceItem checked={mine} disabled={doneCount === 0} onClick={() => setView('mine')}>내 줄기</ChoiceItem>
          <ChoiceItem checked={!mine} onClick={() => setView('base')}>기본</ChoiceItem>
        </ChoiceGroup>
      </div>
    </section>

    <nav className={styles.stems} aria-label="줄기">
      {STEMS.map((item, index) => {
        const done = !!stems[item.kind]?.ok
        return <Button key={item.kind} variant="chip" size="chip" aria-selected={item.kind === kind} data-done={done || undefined} onClick={() => setKind(item.kind)} data-testid={`pillar-stem-${item.kind}`}>
          {done ? <Check aria-hidden="true" /> : <span className={styles.stemNo}>{index + 1}</span>}{item.label}
        </Button>
      })}
    </nav>

    <section className={styles.padWrap} aria-label="긋는 판">
      <StemPad kind={kind} raw={raw} stem={stem} className={styles.pad} testId="pillar-pad" fittedTestId="pillar-fitted"
        onDrawn={(points) => {
          // 줄기 하나에 한 번 긋기. 새로 그으면 앞의 것을 바꾼다(다시 긋기).
          setRaws((all) => ({ ...all, [kind]: points }))
          setView('mine')
        }} />
      <p className={styles.padNote} data-testid="pillar-note" data-state={stem && !stem.ok ? 'warn' : accepted ? 'done' : 'idle'}>{note}</p>
      <div className={styles.padActions}>
        <Button variant="outline" size="block" onClick={() => setRaws((all) => ({ ...all, [kind]: undefined }))} disabled={!raw} data-testid="pillar-reset"><RotateCcw aria-hidden="true" />다시 긋기</Button>
        {next && <Button variant={accepted ? 'default' : 'outline'} size="block" onClick={() => setKind(next.kind)} data-testid="pillar-next">{next.label}<ChevronRight aria-hidden="true" /></Button>}
      </div>
    </section>
  </main>
}
