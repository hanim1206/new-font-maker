import { useEffect, useMemo, useState } from 'react'
import { ChevronRight, RotateCcw } from 'lucide-react'
import type { PenPoint } from '../src/services/penStrokeFit'
import { baseJamoMaps } from '../src/stores/jamoStore'
import { AppGlyph } from './AppGlyph'
import { listFonts } from './accountFontApi'
import { accountFontSession } from './accountFontSync'
import { Button } from './components/ui/button'
import { navigate } from './router'
import { StemPad } from './stemPad'
import { reasonText, useDrawnStems, useStemMarker, useStemOverrides, withCopula, type StemRaws } from './stemPreview'
import { STEMS, type StemKind } from './strokeLab'
import { fontLimitOf, useProfile } from './useProfile'
import styles from './StartPage.module.css'

/**
 * 첫 화면 = 학습 입구(B안, 하니무스 2026-11-21). 들어오자마자 세로선부터 긋는다. 제작 입구(보선 잡고 바로 만들기)는 머리 오른쪽 단추 → 대시보드.
 * 줄기 여섯을 한 번씩 그으면 예시 글줄이 단계마다 내 선으로 바뀐다. 방금 그은 줄기가 쓰인 획만 주색으로 보인다. 기본 프리셋 위에 그린다(지금 연 폰트와 상관없이).
 * 저장하지 않는다 — 빚기 · 저장은 다음 단계에서 붙는다. 학습으로 만든 폰트도 폰트 한도에 세므로 남은 수를 보인다.
 * 긋는 판 · 퍼뜨리기는 `stemPad.tsx` · `strokeLab.ts`(획 긋기 시험판과 같다). 목업: 입구 두 화면 B안.
 */

const SENTENCE = '숲속 옹달샘에 토끼가 물을 마신다'

/** 단계마다 한 줄 부탁. 무엇을 긋는지만, 이름(기둥 · 보)은 긋고 나서 알려 준다. */
const ASK: Record<StemKind, string> = {
  vertical: '세로로 길게 그어 보세요',
  shortVertical: '세로로 짧게 그어 보세요',
  horizontal: '가로로 짧게 그어 보세요',
  longHorizontal: '가로로 길게 그어 보세요',
  diagonal: '비스듬히 그어 보세요',
  circle: '동그라미를 그려 보세요',
}

/** 받침 있는 말 뒤엔 `이`, 없으면 `가`. */
function withSubject(word: string): string {
  const code = word.charCodeAt(word.length - 1) - 0xac00
  return code >= 0 && code < 11172 && code % 28 !== 0 ? `${word}이` : `${word}가`
}

/** 남은 폰트 수. 학습으로 만든 폰트도 한도에 센다. 목록을 못 읽으면 null(줄에서 수를 뺀다). */
function useFontsLeft(): number | null {
  const [session] = useState(accountFontSession)
  const limit = fontLimitOf(useProfile(session?.me ?? null))
  const [count, setCount] = useState<number | null>(null)
  useEffect(() => {
    if (!session) return
    let alive = true
    void listFonts(session.me).then((listed) => { if (alive && listed.ok) setCount(listed.value.length) })
    return () => { alive = false }
  }, [session])
  return count === null ? null : Math.max(0, limit - count)
}

export function StartPage() {
  const [base] = useState(baseJamoMaps)
  const [raws, setRaws] = useState<StemRaws>({})
  const [step, setStep] = useState(0)
  const left = useFontsLeft()

  const stems = useDrawnStems(raws)
  const { overrides, layoutOf } = useStemOverrides(stems, base.choseong, base.jungseong, base.jongseong)
  // 기본 프리셋 위에 내 줄기를 얹은 자모. 닿자는 짜임마다 칸 비율이 달라 짜임별로.
  const jungseong = useMemo(() => ({ ...base.jungseong, ...overrides.jungseong }), [base, overrides])
  const consonants = useMemo(() => Object.fromEntries(Object.entries(overrides.consonants).map(([layout, maps]) => [layout, {
    choseong: { ...base.choseong, ...maps.choseong },
    jongseong: { ...base.jongseong, ...maps.jongseong },
  }])), [base, overrides])
  const drawnCount = STEMS.filter((item) => stems[item.kind]?.ok).length

  const finished = step >= STEMS.length
  const info = STEMS[Math.min(step, STEMS.length - 1)]
  const kind = info.kind
  const stem = stems[kind]
  const accepted = !!stem?.ok
  // 방금 그은 줄기가 쓰인 획만 주색으로. 다 그은 뒤엔 칠하지 않는다.
  const marked = useMemo(() => !finished && accepted ? [kind] : [], [finished, accepted, kind])
  const markColor = useStemMarker(marked, base.choseong, base.jungseong, base.jongseong)
  const next = STEMS[step + 1]

  const onDrawn = (points: PenPoint[]) => setRaws((all) => ({ ...all, [kind]: points }))
  const restart = () => { setRaws({}); setStep(0) }

  const quota = left === null ? '다 만들면 폰트 1개로 세요'
    : left === 0 ? '폰트가 다 찼어요 · 하나를 지워야 새로 만들어요'
    : `다 만들면 폰트 1개로 세요 · ${left}개 남음`

  return <main className={styles.page} data-testid="start-page">
    <header className={styles.header}>
      <span className={styles.brand}>한글칸글</span>
      <Button variant="outline" size="sm" className={styles.makeLink} onClick={() => navigate('/dashboard')} data-testid="start-make">
        보선 잡고 바로 만들기<ChevronRight aria-hidden="true" />
      </Button>
    </header>

    <div className={styles.progress}>
      <div className={styles.dots} aria-label={`줄기 ${drawnCount}/${STEMS.length}`}>
        {STEMS.map((item, index) => <span key={item.kind} data-state={index < step ? 'done' : index === step ? 'now' : undefined} />)}
      </div>
      <p className={styles.quota} data-testid="start-quota">{quota}</p>
    </div>

    <section className={styles.lineCard} aria-label="예시 글줄">
      <div className={styles.line} data-testid="start-line">
        {[...SENTENCE].map((char, index) => char === ' '
          ? <span key={index} className={styles.space} />
          : <AppGlyph key={index} char={char} size={36}
            jungseongOverride={jungseong}
            choseongOverride={consonants[layoutOf(char)]?.choseong ?? base.choseong}
            jongseongOverride={consonants[layoutOf(char)]?.jongseong ?? base.jongseong}
            strokeColorOf={markColor} />)}
      </div>
    </section>

    {finished ? <section className={styles.done} data-testid="start-done">
      <h1 className={styles.ask}>여섯 줄기를 다 그었어요</h1>
      <p className={styles.sub}>위 글줄이 전부 내 선이에요. 빚기는 곧 이어져요.</p>
      <div className={styles.grow} />
      <Button variant="outline" size="sheet" className={styles.cta} onClick={restart} data-testid="start-restart"><RotateCcw aria-hidden="true" />처음부터 다시 긋기</Button>
    </section> : <>
      <div className={styles.askBox}>
        <h1 className={styles.ask} data-testid="start-ask">{ASK[kind]}</h1>
        <p className={styles.sub}>그은 모양이 위 글줄에 바로 들어가요</p>
      </div>

      <StemPad kind={kind} raw={raws[kind]} stem={stem} onDrawn={onDrawn} className={styles.pad} testId="start-pad" />

      <div className={styles.feedback} aria-live="polite">
        {stem && !stem.ok && <p className={styles.warn} data-testid="start-warn">{reasonText(stem)}</p>}
        {accepted && <div className={styles.toast} data-testid="start-toast">
          <p>방금 그은 게 <strong>{withCopula(info.term)}</strong>. 글줄의 {withSubject(info.term)} 전부 내 선이 됐어요.</p>
          <small>길이와 자리는 우리가 맞췄어요 · 떨림은 지웠어요</small>
        </div>}
      </div>

      <Button size="sheet" className={styles.cta} disabled={!accepted} onClick={() => setStep((now) => now + 1)} data-testid="start-next">
        {!accepted ? '먼저 그어 보세요' : next ? `다음 · ${next.label}` : '다 그었어요'}
      </Button>
    </>}
  </main>
}
