import { memo, useEffect, useMemo, useRef, useState } from 'react'
import type { Part } from '../src/types'
import type { CorpusIdentity } from './notoCorpus'
import type { NotoPresetModelBundle } from './notoPresetGlyphs'
import { useNotoGlyph } from './useNotoGlyph'
import { useFitInkStyle } from './useFitInkStyle'
import { layoutTypeOfSyllable } from '../src/utils/hangulUtils'
import { useLayoutDelta } from './layoutDeltaStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { propagationCardBaseOf, propagationCardViewOf } from './propagationCardView'
import type { PropagationCardBox } from './propagationCardView'
import { hasLayoutEdit, propagationCandidates } from './reviewPropagation'
import { ruleSamples } from './scopePicker'
import { ruleKey } from './scopeRule'
import type { ScopeRule } from './scopeRule'
import type { PropagationEdit, PropagationScope } from './reviewPropagation'
import type { OverrideGroup } from './layoutOverrides'
import styles from './TouchedGlyphRow.module.css'

/**
 * `닿는 글자` 줄. `내 문장` 바로 아래에 서는 상단 두 줄의 아랫줄이다. 계약은 `docs/specs/적용범위-규칙식.md` §5.
 *
 * 지금 켠 범위에 드는 글자를 문장 줄과 **같은 글자 크기·같은 칸 높이**로 보인다.
 * 줄 높이는 고정이라 범위가 바뀌어도 아래 캔버스가 안 밀린다.
 * 글자를 누르면 그 글자를 연다(문장 줄과 같은 동작). 안 끝난 Δ가 있으면 잠근다 — 글자를 바꾸면 편집이 날아가서다.
 * 한 묶음(8장)으로 시작하고 줄이 안 차면 다음 묶음을 붙인다. 찬 뒤에는 옆으로 밀어 더 본다.
 */

const VIEW_BOX = '-0.08 -0.08 1.16 1.16'
const CARD_COUNT = 8
/** 폭을 채우려고 자동으로 붙이는 묶음 수 한도. 넓은 화면에서 끝없이 붙지 않게. */
const FILL_LIMIT = 8

const BOX_COLOR: Record<PropagationCardBox['kind'], string> = { medial: '#3b6fd6', component: '#2f9a6a' }

// 카드마다 props가 그대로면 다시 그리지 않는다. 획을 끄는 동안 부모가 매 움직임 다시 그려도 카드는 쉰다.
const TouchedGlyph = memo(function TouchedGlyph({ identity, bundle, edit, ghostVisible, active = false, onPick }: { identity: CorpusIdentity; bundle: NotoPresetModelBundle; edit: PropagationEdit; ghostVisible: boolean; active?: boolean; onPick?: (character: string) => void }) {
  const { glyph, error } = useNotoGlyph(identity.codepoint)
  const inkStyle = useFitInkStyle(layoutTypeOfSyllable(identity.medialJamo, identity.finalJamo !== null))
  // 이 글자에 이미 저장된 Δ 위에 지금 편집 Δ를 얹는다. 렌더러가 보는 상자와 같은 출발점.
  const savedDelta = useLayoutDelta(identity)
  // 보선을 끄는 동안 움직임마다 칸 수만큼 도는 길이라 둘로 나눈다(`propagationCardView.ts`).
  // 글자당 한 번: 고스트 · 칸 해석 · fit · Δ 없는 내 획. 끄는 동안에는 Δ 얹기만 돈다.
  // 카드는 앱 획을 스토어에서 읽어 그린다. 이 글자의 자모 획이 저장으로 바뀔 때만 다시 그리게 셋을 따로 구독한다.
  const initialStrokes = useJamoStore((state) => state.choseong[identity.initialJamo])
  const medialStrokes = useJamoStore((state) => state.jungseong[identity.medialJamo])
  const finalStrokes = useJamoStore((state) => identity.finalJamo ? state.jongseong[identity.finalJamo] : undefined)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 획 셋은 계산 안에서 스토어로 읽힌다. 바뀌면 다시 그리라는 신호로만 둔다.
  const base = useMemo(() => glyph ? propagationCardBaseOf({ glyph, identity, bundle, savedDelta, inkStyle }) : null, [glyph, identity, bundle, savedDelta, inkStyle, initialStrokes, medialStrokes, finalStrokes])
  const view = useMemo(() => base ? propagationCardViewOf(base, edit, inkStyle) : null, [base, edit, inkStyle])
  // Δ가 아직 없으면 그냥 내 획. '안 닿음' 표시도, 흐리게도 안 한다.
  const live = hasLayoutEdit(edit)
  const note = !view ? (error || '읽는 중') : !live ? '' : view.touched === 0 ? 'Δ 안 닿음' : view.skipped > 0 ? '일부 Δ 미적용' : ''
  return <figure className={styles.card} data-testid="review-propagation-card" data-char={identity.character} data-touched={view && live ? view.touched > 0 : undefined} data-active={active || undefined}>
    {/* 칸 그림이 곧 버튼이다. 문장 줄의 글자를 누르는 것과 같은 동작. */}
    <button type="button" disabled={!onPick || live} aria-current={active || undefined} onClick={() => onPick?.(identity.character)} aria-label={`${identity.character} 열기${note ? `, ${note}` : ''}`} title={note || undefined} data-testid="review-propagation-open">
    <svg viewBox={VIEW_BOX} role="img" aria-label={`${identity.character} 미리보기`}>
      {view?.boxes.map((item, index) => <rect key={index} x={item.box.x} y={item.box.y} width={item.box.width} height={item.box.height} fill={BOX_COLOR[item.kind]} fillOpacity=".12" stroke={BOX_COLOR[item.kind]} strokeOpacity=".5" strokeWidth=".004" />)}
      {ghostVisible && view?.ghost && <path d={view.ghost} fill="#3a3a36" fillOpacity=".35" fillRule="evenodd" data-testid="review-propagation-ghost" />}
      {view?.after.map((path, index) => <path key={index} d={path} fill="#111" fillRule="evenodd" />)}
      {view?.before.map((path, index) => <path key={`b${index}`} d={path} fill="none" stroke="#f0561e" strokeWidth=".006" strokeDasharray=".012 .008" />)}
    </svg>
    </button>
    {/* 글자 이름은 그림이 이미 말한다. 칸 높이를 문장 줄과 맞추려고 글씨는 화면에서 숨기고 읽기 도구에만 남긴다. */}
    <figcaption className={styles.caption}>
      <b>{identity.character}</b>
      {note && <small>{note}</small>}
    </figcaption>
  </figure>
})

export const TouchedGlyphRow = memo(function TouchedGlyphRow({ source, bundle, edit, ghostVisible = true, focus, scope, group, jamos, anyContext, rule, activeChar, onPick }: {
  source: CorpusIdentity
  bundle: NotoPresetModelBundle | null
  edit: PropagationEdit
  /** 편집 캔버스의 `Noto 고스트` 토글을 따른다. */
  ghostVisible?: boolean
  /** 지금 잡은 rail의 부품. 이게 있어야 표본이 뜬다. */
  focus?: Part
  /** 지금 범위. 옵션 스택이 정한다. */
  scope: PropagationScope
  /** `jamo` 범위에서 어느 부품 자모를 맞출지. */
  group: OverrideGroup
  /** `jamo` 범위에서 고른 자모. */
  jamos: readonly string[]
  /** `jamo` 범위를 레이아웃 너머로 넓힌다. 획 편집의 범위(`모든 ㅁ 글자`)가 이것이다. */
  anyContext?: boolean
  /** 범위 고르기 화면에서 확정한 규칙. 있으면 표본을 이 규칙에서 뽑는다(칩·자모 시트보다 넓거나 좁을 수 있다). */
  rule?: ScopeRule
  /** 지금 열린 글자. 줄에 있으면 그 칸을 켠다(획 편집에서 줄을 그대로 두고 누른 칸만 바꿀 때). */
  activeChar?: string
  /** 글자를 누르면 그 글자를 연다. 없으면 보기만 한다. */
  onPick?: (character: string) => void
}) {
  // 글자·범위·고른 자모가 바뀌면 줄을 새로 만들고 한 묶음으로 돌아간다.
  const rowKey = rule ? `${source.codepoint}:rule:${ruleKey(rule)}` : `${source.codepoint}:${scope}:${group}:${jamos.join('')}:${anyContext ? 'any' : 'one'}`
  const [loaded, setLoaded] = useState({ rowKey, batches: 1 })
  const batches = loaded.rowKey === rowKey ? loaded.batches : 1
  const { candidates, exhausted } = useMemo(() => {
    const list: CorpusIdentity[] = []
    if (!focus) return { candidates: list, exhausted: true }
    if (rule) {
      // 규칙식 범위는 표본 묶음이 아니라 규칙에 닿는 글자를 앞에서부터 가져온다.
      const want = CARD_COUNT * batches
      const picked = ruleSamples(rule, want + 1, source.codepoint)
      return { candidates: picked.slice(0, want), exhausted: picked.length <= want }
    }
    const seen = new Set<number>()
    for (let page = 0; page < batches; page += 1) {
      const fresh = propagationCandidates({ source, scope, count: CARD_COUNT, page, focus, jamos, anyContext }).filter((item) => !seen.has(item.codepoint))
      if (fresh.length === 0) return { candidates: list, exhausted: true }
      for (const item of fresh) { seen.add(item.codepoint); list.push(item) }
    }
    return { candidates: list, exhausted: false }
  }, [focus, source, scope, batches, jamos, anyContext, rule])
  const loadNextBatch = () => { if (!exhausted) setLoaded((current) => (current.rowKey === rowKey ? current.batches : 1) === batches ? { rowKey, batches: batches + 1 } : current) }
  // 줄이 아직 안 찼으면 다음 묶음을 붙인다. 한 번 차면 멈추고 그때부터는 밀어서 더 본다.
  const scroller = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const el = scroller.current
    // 모델이 아직 안 와 줄이 비었을 때는 세지 않는다 — 빈 줄은 늘 안 차 보여 묶음만 쌓인다.
    if (!el || el.childElementCount === 0 || exhausted || batches >= FILL_LIMIT) return
    if (el.scrollWidth <= el.clientWidth + 1) loadNextBatch()
  })
  return <section className={styles.row} aria-label="닿는 글자" data-testid="touched-glyph-row">
    {/* 범위가 바뀌면 줄을 새로 만들어 맨 앞에서 시작한다. */}
    <div key={rowKey} ref={scroller} className={styles.cards} data-testid="review-propagation-cards" onScroll={(event) => { const el = event.currentTarget; if (el.scrollLeft + el.clientWidth * 2 >= el.scrollWidth) loadNextBatch() }}>
      {bundle && focus && candidates.map((identity) => <TouchedGlyph key={identity.codepoint} identity={identity} bundle={bundle} edit={edit} ghostVisible={ghostVisible} active={identity.character === activeChar} onPick={onPick} />)}
    </div>
  </section>
})
