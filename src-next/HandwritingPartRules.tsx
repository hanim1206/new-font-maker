import { memo, useMemo } from 'react'
import { CHOSEONG_LIST, JONGSEONG_LIST, JUNGSEONG_LIST } from '../src/data/Hangul'
import { SvgRenderer } from '../src/renderers/SvgRenderer'
import { DEFAULT_STEM_BEAK, STEM_BEAK_SHAPES } from '../src/services/stemBeak'
import type { StemBeakShape, StemBeakStyle } from '../src/services/stemBeak'
import type { GlobalStyle } from '../src/stores/globalStyleStore'
import type { GroupBeakResolver } from '../src/stores/jamoGroupStore'
import { useJamoStore } from '../src/stores/jamoStore'
import { mergePadding, useLayoutStore } from '../src/stores/layoutStore'
import type { JamoData, Part, ResolvedStrokeInkSource } from '../src/types'
import { decomposeSyllable } from '../src/utils/hangulUtils'
import { Button } from './components/ui/button'
import { ChoiceGroup, ChoiceItem } from './components/ui/choice-group'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from './components/ui/dialog'
import { Pressable } from './components/ui/pressable'
import { Field, RangeBar } from './components/ui/range'
import { EDIT_COLOR } from './editColors'
import { beakHeadsOf, sampleChar, SLOT_COLOR, SLOT_NAME, SLOT_OF } from './HandwritingAnatomy'
import type { Slot } from './HandwritingAnatomy'
import { useContextPlacement } from './notoModel'
import styles from './HandwritingPartRules.module.css'

/**
 * 부위 스타일 규칙(손글씨 실험실). 규칙 하나 = 무엇에(부위 묶음) · 어디까지(속성 거름 + 뺀 자모) · 무엇을(스타일).
 * 지금은 "세로줄기의 머리에 부리" 하나만 있다 — 제품의 세로줄기 부리(`stemBeak`)를 획별로 거는 길(`groupBeakOf`)을 쓴다.
 * 규칙은 그릴 때만 입힌다. 프리셋 획은 안 고치고 규칙 목록만 저장한다(localStorage).
 */
export interface PartRule {
  id: string
  /** 부리 모양. `none`이면 넓은 규칙이 얹은 부리를 이 범위에서 뺀다. */
  shape: StemBeakShape | 'none'
  size: number
  /** 범위: 머리가 달린 줄기 이름(기둥 · 짧은기둥 · 닿자 세로줄기 …). */
  stems: string[]
  /** 범위: 자리. */
  slots: Slot[]
  /** 뺀 자모 — `CH:ㄱ` 꼴. */
  excluded: string[]
}

const STORAGE_KEY = 'handwriting-lab-part-rules-v1'
export function loadPartRules(): PartRule[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(raw) ? raw.filter((r) => r && typeof r.id === 'string' && Array.isArray(r.stems) && Array.isArray(r.slots) && Array.isArray(r.excluded)) : []
  } catch { return [] }
}
export function savePartRules(rules: PartRule[]) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(rules)) } catch { /* 저장 못 해도 화면은 그대로 */ }
}

const SLOTS: Slot[] = ['CH', 'JU', 'JO']
const JAMO_LIST: Record<Slot, readonly string[]> = { CH: CHOSEONG_LIST, JU: JUNGSEONG_LIST, JO: (JONGSEONG_LIST as readonly string[]).filter(Boolean) }
type JamoMaps = Record<Slot, Record<string, JamoData>>

/** 자모마다 부리가 얹힐 획 → 줄기 이름. 키는 `CH:ㄱ`. */
export type BeakIndex = Map<string, Map<string, string>>
export function buildBeakIndex(maps: JamoMaps): BeakIndex {
  const index: BeakIndex = new Map()
  for (const slot of SLOTS) for (const ch of JAMO_LIST[slot]) {
    const jamo = maps[slot][ch]
    if (!jamo) continue
    const heads = beakHeadsOf(jamo, slot)
    if (heads.size) index.set(`${slot}:${ch}`, heads)
  }
  return index
}
/** 폰트에 있는 줄기 이름들(범위 칩). 많이 나오는 순. */
export function stemsOf(index: BeakIndex): string[] {
  const count = new Map<string, number>()
  index.forEach((heads) => new Set(heads.values()).forEach((stem) => count.set(stem, (count.get(stem) ?? 0) + 1)))
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([stem]) => stem)
}

const inScope = (rule: PartRule, slot: Slot, stem: string) => rule.slots.includes(slot) && rule.stems.includes(stem)
const reaches = (rule: PartRule, slot: Slot, ch: string, stem: string) => inScope(rule, slot, stem) && !rule.excluded.includes(`${slot}:${ch}`)
/** 규칙이 먹는 자모 수(자리별). */
export function ruleReach(rule: PartRule, index: BeakIndex): Record<Slot, string[]> {
  const out: Record<Slot, string[]> = { CH: [], JU: [], JO: [] }
  index.forEach((heads, key) => {
    const [slot, ch] = key.split(':') as [Slot, string]
    if ([...heads.values()].some((stem) => reaches(rule, slot, ch, stem))) out[slot].push(ch)
  })
  return out
}
/** 넓은 규칙이 먼저, 좁은 규칙이 나중 — 겹치면 좁은 쪽이 이긴다. */
export function sortRules(rules: PartRule[], index: BeakIndex): PartRule[] {
  const size = (rule: PartRule) => { const r = ruleReach(rule, index); return r.CH.length + r.JU.length + r.JO.length }
  return [...rules].sort((a, b) => size(b) - size(a))
}
const beakOf = (rule: PartRule): StemBeakStyle => ({ ...DEFAULT_STEM_BEAK, enabled: rule.shape !== 'none', shape: rule.shape === 'none' ? DEFAULT_STEM_BEAK.shape : rule.shape, size: rule.size })

/** 획마다 어느 부리를 얹을지. `rules`는 넓은 순으로 줘야 한다(`sortRules`). */
export function beakResolverOf(rules: readonly PartRule[], index: BeakIndex): GroupBeakResolver {
  if (!rules.length) return () => undefined
  return (source) => {
    if (source.kind !== 'stroke') return undefined
    const slot = SLOT_OF[source.part]
    const stem = index.get(`${slot}:${source.jamoId}`)?.get(source.strokeId)
    if (!stem) return undefined
    let out: StemBeakStyle | undefined
    for (const rule of rules) if (reaches(rule, slot, source.jamoId, stem)) out = beakOf(rule)
    return out
  }
}

const SHAPE_LABEL: Record<PartRule['shape'], string> = { ...Object.fromEntries(STEM_BEAK_SHAPES.map(({ id, label }) => [id, label])) as Record<StemBeakShape, string>, none: '부리 없음' }
export const ruleSentence = (rule: PartRule, allStems: readonly string[]) => {
  const stems = rule.stems.length >= allStems.length ? '' : ` · ${rule.stems.join(' · ')}만`
  const slots = rule.slots.length >= SLOTS.length ? '' : ` · ${rule.slots.map((s) => SLOT_NAME[s]).join(' · ')}만`
  return `${SHAPE_LABEL[rule.shape]}${stems}${slots}`
}
export const newRule = (stems: string[]): PartRule => ({ id: `r${Date.now().toString(36)}`, shape: 'angled', size: 1, stems, slots: [...SLOTS], excluded: [] })

const HIDE: Record<Slot, Partial<Record<Part, { hidden: true }>>> = {
  CH: { JU: { hidden: true }, JU_H: { hidden: true }, JU_V: { hidden: true }, JO: { hidden: true } },
  JU: { CH: { hidden: true }, JO: { hidden: true } },
  JO: { CH: { hidden: true }, JU: { hidden: true }, JU_H: { hidden: true }, JU_V: { hidden: true } },
}

/** 범위 카드: 본보기 글자에서 그 자모만, 규칙이 입혀진 꼴로. 부리가 얹힌 획은 자리 색. */
const RuleCard = memo(function RuleCard({ slot, ch, style, groupBeakOf, off, onToggle }: { slot: Slot; ch: string; style: GlobalStyle; groupBeakOf: GroupBeakResolver; off: boolean; onToggle: () => void }) {
  const choseong = useJamoStore((state) => state.choseong)
  const jungseong = useJamoStore((state) => state.jungseong)
  const jongseong = useJamoStore((state) => state.jongseong)
  const schemas = useLayoutStore((state) => state.layoutSchemas)
  const globalPadding = useLayoutStore((state) => state.globalPadding)
  const paddingOverrides = useLayoutStore((state) => state.paddingOverrides)
  const syllable = useMemo(() => decomposeSyllable(sampleChar(slot, ch) ?? '가', choseong, jungseong, jongseong), [slot, ch, choseong, jungseong, jongseong])
  const schema = useMemo(() => {
    const padding = mergePadding(globalPadding, paddingOverrides[syllable.layoutType])
    return { ...schemas[syllable.layoutType], padding, designBodyPadding: padding }
  }, [schemas, globalPadding, paddingOverrides, syllable.layoutType])
  const { placement } = useContextPlacement(syllable, schema, style)
  const colorOf = (source: ResolvedStrokeInkSource) => (groupBeakOf(source)?.enabled ? SLOT_COLOR[slot] : EDIT_COLOR.editSlotOff)
  return <Pressable type="button" className={styles.card} data-off={off || undefined} aria-pressed={!off} aria-label={`${ch} ${off ? '넣기' : '빼기'}`} onClick={onToggle} data-testid={`part-rule-card-${slot}-${ch}`}>
    <SvgRenderer syllable={syllable} schema={placement.kind === 'schema' ? placement.schema : undefined} boxes={placement.kind === 'boxes' ? placement.boxes : undefined}
      size={64} globalStyle={style} overflow="visible" clipGlyphs={false} partStyles={HIDE[slot]} strokeColorOf={colorOf} groupBeakOf={groupBeakOf} />
    {off && <em>뺌</em>}
  </Pressable>
})

/** 규칙 팝업: 규칙 한 줄 · 스타일 · 범위 칩 · 범위 카드. `others`는 이 규칙 말고 걸려 있는 규칙(넓은 순). */
export function PartRuleDialog({ draft, isNew, index, others, style, onChange, onSave, onDelete, onClose }: {
  draft: PartRule | null; isNew: boolean; index: BeakIndex; others: PartRule[]; style: GlobalStyle
  onChange: (rule: PartRule) => void; onSave: () => void; onDelete: () => void; onClose: () => void
}) {
  const allStems = useMemo(() => stemsOf(index), [index])
  // 미리보기: 걸려 있는 다른 규칙 위에 지금 고치는 규칙을 얹어 본다.
  const resolver = useMemo(() => beakResolverOf(draft ? sortRules([...others, draft], index) : others, index), [others, draft, index])
  if (!draft) return null
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className={styles.dialog}>
      <DialogHeader>
        <DialogTitle>부위에 스타일 걸기</DialogTitle>
        <p className={styles.sentence}><b>세로줄기의 머리</b>에 <b>{SHAPE_LABEL[draft.shape]}</b>{draft.shape === 'none' ? '으로 두기' : ' 얹기'}<span>{ruleSentence(draft, allStems).replace(SHAPE_LABEL[draft.shape], '') || ' · 전체'}</span></p>
      </DialogHeader>
      <div className={styles.body}>
        <section>
          <h4>스타일</h4>
          <ChoiceGroup variant="segment" aria-label="부리 모양">
            {([...STEM_BEAK_SHAPES.map(({ id }) => id), 'none'] as PartRule['shape'][]).map((id) => <ChoiceItem key={id} checked={draft.shape === id} onClick={() => onChange({ ...draft, shape: id })} data-testid={`part-rule-shape-${id}`}>{SHAPE_LABEL[id]}</ChoiceItem>)}
          </ChoiceGroup>
          {draft.shape !== 'none' && <Field label="크기" value={`${draft.size.toFixed(1)}배`}><RangeBar min={50} max={200} step={10} value={Math.round(draft.size * 100)} onChange={(e) => onChange({ ...draft, size: Number(e.target.value) / 100 })} /></Field>}
        </section>
        <section>
          <h4>범위 좁히기</h4>
          <div className={styles.chips}>
            {allStems.map((stem) => <Pressable key={stem} type="button" className={styles.chip} aria-pressed={draft.stems.includes(stem)} onClick={() => onChange({ ...draft, stems: toggle(draft.stems, stem) })} data-testid={`part-rule-stem-${stem}`}>{stem}</Pressable>)}
            <i aria-hidden="true" />
            {SLOTS.map((slot) => <Pressable key={slot} type="button" className={styles.chip} aria-pressed={draft.slots.includes(slot)} onClick={() => onChange({ ...draft, slots: toggle(draft.slots, slot) })}>{SLOT_NAME[slot]}</Pressable>)}
          </div>
        </section>
        <section>
          <h4>적용 범위 <small>카드를 누르면 그 자모만 빼요</small></h4>
          {SLOTS.map((slot) => {
            // 칩으로 고른 범위 안의 자모(뺀 것 포함)를 보인다.
            const chars = JAMO_LIST[slot].filter((ch) => [...(index.get(`${slot}:${ch}`)?.values() ?? [])].some((stem) => inScope(draft, slot, stem)))
            if (!chars.length) return null
            const on = chars.filter((ch) => !draft.excluded.includes(`${slot}:${ch}`)).length
            return <div key={slot} className={styles.group} style={{ ['--slot' as string]: SLOT_COLOR[slot] }}>
              <p><i aria-hidden="true" />{SLOT_NAME[slot]}<em>{on}/{JAMO_LIST[slot].length}</em></p>
              <div className={styles.cards}>
                {chars.map((ch) => <RuleCard key={ch} slot={slot} ch={ch} style={style} groupBeakOf={resolver} off={draft.excluded.includes(`${slot}:${ch}`)} onToggle={() => onChange({ ...draft, excluded: toggle(draft.excluded, `${slot}:${ch}`) })} />)}
              </div>
            </div>
          })}
        </section>
      </div>
      <DialogFooter>
        {!isNew && <Button variant="faint" onClick={onDelete} data-testid="part-rule-delete">규칙 지우기</Button>}
        <Button onClick={onClose}>닫기</Button>
        <Button variant="primary" onClick={onSave} data-testid="part-rule-save">{isNew ? '규칙 걸기' : '고친 대로 두기'}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
}
