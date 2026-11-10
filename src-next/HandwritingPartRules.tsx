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
import { beakHeadsOf, sampleChar, SLOT_COLOR, SLOT_NAME, SLOT_OF, tailEndsOf } from './HandwritingAnatomy'
import type { Slot } from './HandwritingAnatomy'
import { TailCutInk, useTailCuts } from './HandwritingTailCut'
import type { CutAngleResolver } from './HandwritingTailCut'
import { useContextPlacement } from './notoModel'
import styles from './HandwritingPartRules.module.css'

/**
 * 부위 스타일 규칙(손글씨 실험실). 규칙 하나 = 무엇에(부위 묶음) · 어디까지(속성 거름 + 뺀 자모) · 무엇을(스타일).
 * 스타일은 둘이다. "세로줄기의 머리에 부리"는 제품의 세로줄기 부리(`stemBeak`)를 획별로 거는 길(`groupBeakOf`)을 쓰고,
 * "맺음 비스듬히 자르기"는 획 끝에 쐐기를 덧그린다(`HandwritingTailCut`).
 * 규칙은 그릴 때만 입힌다. 프리셋 획은 안 고치고 규칙 목록만 저장한다(localStorage).
 */
export type RuleKind = 'beak' | 'cut'
export interface PartRule {
  id: string
  /** 무엇에 무엇을: 세로줄기 머리의 부리(`beak`, 옛 저장분은 비어 있다) · 맺음 비스듬히 자르기(`cut`). */
  kind?: RuleKind
  /** 맺음을 자르는 각(도). 0이면 넓은 규칙이 자른 것을 이 범위에서 되돌린다. */
  angle?: number
  /** 부리 모양. `none`이면 넓은 규칙이 얹은 부리를 이 범위에서 뺀다. */
  shape: StemBeakShape | 'none'
  size: number
  /** 범위: 머리 · 맺음이 달린 줄기 이름(기둥 · 짧은기둥 · 닿자 세로줄기 …). */
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

export const kindOf = (rule: PartRule): RuleKind => rule.kind ?? 'beak'
/** 자모마다 스타일이 걸릴 자리 → 줄기 이름. 바깥 키는 `CH:ㄱ`, 안쪽 키는 부리면 획 id, 맺음이면 `획 id:마디 모양`. */
export type BeakIndex = Map<string, Map<string, string>>
export type PartIndexes = Record<RuleKind, BeakIndex>
export function buildPartIndexes(maps: JamoMaps): PartIndexes {
  const out: PartIndexes = { beak: new Map(), cut: new Map() }
  for (const slot of SLOTS) for (const ch of JAMO_LIST[slot]) {
    const jamo = maps[slot][ch]
    if (!jamo) continue
    const heads = beakHeadsOf(jamo, slot)
    if (heads.size) out.beak.set(`${slot}:${ch}`, heads)
    const tails = tailEndsOf(jamo, slot)
    if (tails.size) out.cut.set(`${slot}:${ch}`, tails)
  }
  return out
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
export function sortRules(rules: PartRule[], indexes: PartIndexes): PartRule[] {
  const size = (rule: PartRule) => { const r = ruleReach(rule, indexes[kindOf(rule)]); return r.CH.length + r.JU.length + r.JO.length }
  return [...rules].sort((a, b) => size(b) - size(a))
}
const beakOf = (rule: PartRule): StemBeakStyle => ({ ...DEFAULT_STEM_BEAK, enabled: rule.shape !== 'none', shape: rule.shape === 'none' ? DEFAULT_STEM_BEAK.shape : rule.shape, size: rule.size })

/** 획마다 어느 부리를 얹을지. `rules`는 넓은 순으로 줘야 한다(`sortRules`). */
export function beakResolverOf(all: readonly PartRule[], index: BeakIndex): GroupBeakResolver {
  const rules = all.filter((rule) => kindOf(rule) === 'beak')
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

/** 맺음마다 몇 도로 자를지. 자르는 규칙이 없으면 `null` — 글자마다 획을 푸는 일을 건너뛴다. */
export function cutResolverOf(all: readonly PartRule[], index: BeakIndex): CutAngleResolver | null {
  const rules = all.filter((rule) => kindOf(rule) === 'cut')
  if (!rules.length) return null
  return (source, shapeLabel) => {
    const slot = SLOT_OF[source.part]
    const stem = index.get(`${slot}:${source.jamoId}`)?.get(`${source.strokeId}:${shapeLabel}`)
    if (!stem) return undefined
    let out: number | undefined
    for (const rule of rules) if (reaches(rule, slot, source.jamoId, stem)) out = rule.angle ?? 0
    return out
  }
}

export const RULE_TARGET: Record<RuleKind, string> = { beak: '세로줄기의 머리', cut: '맺음' }
const cutLabel = (rule: PartRule) => (rule.angle ? `비스듬히 자르기 ${rule.angle}°` : '자르지 않기')
const styleLabel = (rule: PartRule) => (kindOf(rule) === 'cut' ? cutLabel(rule) : SHAPE_LABEL[rule.shape])
const SHAPE_LABEL: Record<PartRule['shape'], string> = { ...Object.fromEntries(STEM_BEAK_SHAPES.map(({ id, label }) => [id, label])) as Record<StemBeakShape, string>, none: '부리 없음' }
export const ruleSentence = (rule: PartRule, allStems: readonly string[]) => {
  const stems = rule.stems.length >= allStems.length ? '' : ` · ${rule.stems.join(' · ')}만`
  const slots = rule.slots.length >= SLOTS.length ? '' : ` · ${rule.slots.map((s) => SLOT_NAME[s]).join(' · ')}만`
  return `${styleLabel(rule)}${stems}${slots}`
}
export const newRule = (kind: RuleKind, stems: string[]): PartRule => ({ id: `r${Date.now().toString(36)}`, kind, angle: kind === 'cut' ? 20 : undefined, shape: 'angled', size: 1, stems, slots: [...SLOTS], excluded: [] })

const HIDE: Record<Slot, Partial<Record<Part, { hidden: true }>>> = {
  CH: { JU: { hidden: true }, JU_H: { hidden: true }, JU_V: { hidden: true }, JO: { hidden: true } },
  JU: { CH: { hidden: true }, JO: { hidden: true } },
  JO: { CH: { hidden: true }, JU: { hidden: true }, JU_H: { hidden: true }, JU_V: { hidden: true } },
}

/** 범위 카드: 본보기 글자에서 그 자모만, 규칙이 입혀진 꼴로. 스타일이 걸린 획은 자리 색. */
const RuleCard = memo(function RuleCard({ slot, ch, kind, style, groupBeakOf, cutAngleOf, off, onToggle }: { slot: Slot; ch: string; kind: RuleKind; style: GlobalStyle; groupBeakOf: GroupBeakResolver; cutAngleOf: CutAngleResolver | null; off: boolean; onToggle: () => void }) {
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
  const cuts = useTailCuts(syllable, placement, style, cutAngleOf)
  const cutIds = useMemo(() => new Set(cuts.filter((c) => SLOT_OF[c.source.part] === slot).map((c) => c.source.strokeId)), [cuts, slot])
  const colorOf = (source: ResolvedStrokeInkSource) => ((kind === 'cut' ? cutIds.has(source.strokeId) : groupBeakOf(source)?.enabled) ? SLOT_COLOR[slot] : EDIT_COLOR.editSlotOff)
  return <Pressable type="button" className={styles.card} data-off={off || undefined} aria-pressed={!off} aria-label={`${ch} ${off ? '넣기' : '빼기'}`} onClick={onToggle} data-testid={`part-rule-card-${slot}-${ch}`}>
    <SvgRenderer syllable={syllable} schema={placement.kind === 'schema' ? placement.schema : undefined} boxes={placement.kind === 'boxes' ? placement.boxes : undefined}
      size={64} globalStyle={style} overflow="visible" clipGlyphs={false} partStyles={HIDE[slot]} strokeColorOf={colorOf} groupBeakOf={groupBeakOf}>
      <TailCutInk cuts={cuts} colorOf={colorOf} hidden={(source) => SLOT_OF[source.part] !== slot} />
    </SvgRenderer>
    {off && <em>뺌</em>}
  </Pressable>
})

/** 규칙 팝업: 규칙 한 줄 · 스타일 · 범위 칩 · 범위 카드. `others`는 이 규칙 말고 걸려 있는 규칙(넓은 순). */
export function PartRuleDialog({ draft, isNew, indexes, others, style, onChange, onSave, onDelete, onClose }: {
  draft: PartRule | null; isNew: boolean; indexes: PartIndexes; others: PartRule[]; style: GlobalStyle
  onChange: (rule: PartRule) => void; onSave: () => void; onDelete: () => void; onClose: () => void
}) {
  const kind = draft ? kindOf(draft) : 'beak'
  const index = indexes[kind]
  const allStems = useMemo(() => stemsOf(index), [index])
  // 미리보기: 걸려 있는 다른 규칙 위에 지금 고치는 규칙을 얹어 본다.
  const preview = useMemo(() => (draft ? sortRules([...others, draft], indexes) : others), [others, draft, indexes])
  const resolver = useMemo(() => beakResolverOf(preview, indexes.beak), [preview, indexes])
  const cutResolver = useMemo(() => cutResolverOf(preview, indexes.cut), [preview, indexes])
  if (!draft) return null
  const toggle = <T,>(list: T[], item: T) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item])
  return <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
    <DialogContent className={styles.dialog}>
      <DialogHeader>
        <DialogTitle>부위에 스타일 걸기</DialogTitle>
        <p className={styles.sentence}>{kind === 'cut'
          ? <><b>맺음</b>을 <b>{cutLabel(draft)}</b></>
          : <><b>세로줄기의 머리</b>에 <b>{SHAPE_LABEL[draft.shape]}</b>{draft.shape === 'none' ? '으로 두기' : ' 얹기'}</>}<span>{ruleSentence(draft, allStems).replace(styleLabel(draft), '') || ' · 전체'}</span></p>
      </DialogHeader>
      <div className={styles.body}>
        <section>
          <h4>스타일</h4>
          {kind === 'cut' && <Field label="각도" value={`${draft.angle ?? 0}°`}><RangeBar min={-45} max={45} step={5} value={draft.angle ?? 0} onChange={(e) => onChange({ ...draft, angle: Number(e.target.value) })} data-testid="part-rule-angle" /></Field>}
          {kind === 'cut' && <p className={styles.note}>끝 면을 기울이려고 한쪽을 조금 늘여요. 0°로 두면 넓은 규칙이 자른 것을 이 범위에서만 되돌려요.</p>}
          {kind === 'beak' && <ChoiceGroup variant="segment" aria-label="부리 모양">
            {([...STEM_BEAK_SHAPES.map(({ id }) => id), 'none'] as PartRule['shape'][]).map((id) => <ChoiceItem key={id} checked={draft.shape === id} onClick={() => onChange({ ...draft, shape: id })} data-testid={`part-rule-shape-${id}`}>{SHAPE_LABEL[id]}</ChoiceItem>)}
          </ChoiceGroup>}
          {kind === 'beak' && draft.shape !== 'none' && <Field label="크기" value={`${draft.size.toFixed(1)}배`}><RangeBar min={50} max={200} step={10} value={Math.round(draft.size * 100)} onChange={(e) => onChange({ ...draft, size: Number(e.target.value) / 100 })} /></Field>}
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
                {chars.map((ch) => <RuleCard key={ch} slot={slot} ch={ch} kind={kind} style={style} groupBeakOf={resolver} cutAngleOf={cutResolver} off={draft.excluded.includes(`${slot}:${ch}`)} onToggle={() => onChange({ ...draft, excluded: toggle(draft.excluded, `${slot}:${ch}`) })} />)}
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
