import { useEffect, useState } from 'react'
import { ArrowRight } from 'lucide-react'
import type { MedialFamily } from '../src/types'
import { AppGlyph } from './AppGlyph'
import { Pressable } from './components/ui/pressable'
import styles from './VariantGateCard.module.css'

/** 홀자 계열 이름. 어휘사전의 세로홀자 · 가로홀자 · 섞임홀자. */
export const MEDIAL_FAMILY_LABEL: Readonly<Record<MedialFamily, string>> = { right: '세로홀자', bottom: '가로홀자', mixed: '섞임홀자' }
const FAMILIES: readonly MedialFamily[] = ['right', 'bottom', 'mixed']
const BRANCH_Y = [24, 74, 124] as const
const ROOT_RIGHT = 110
const BRANCH_LEFT = 186
/** 화살표를 누른 뒤 선이 끊기는 동안. CSS `snapLine` · `snapBranch`와 같은 길이. */
const SNAP_MS = 520

/**
 * 안 가른 계열의 글자를 열었을 때 조절판 자리에 서는 트리. 왼쪽 큰 칸이 기본 ㅈ, 오른쪽 세 가지가 홀자 계열.
 * 기본에 선이 이어진 가지는 기본을 따라오고, 따로 그린 가지는 선이 끊겨 혼자 선다. 지금 보는 가지는 옅은 바탕에 화살표 하나(= 따로 그리기).
 * 말로 된 설명과 큰 단추는 두지 않는다(10-06 사용자).
 */
export function VariantGateCard({ jamo, family, splitFamilies, examples, onSplit }: {
  jamo: string
  /** 지금 보는 계열. */
  family: MedialFamily
  /** 따로 그려 둔 계열. 선이 끊긴다. */
  splitFamilies: readonly string[]
  /** 계열마다 가지에 그릴 대표 글자(자 · 조 · 좌). */
  examples: Readonly<Partial<Record<MedialFamily, string>>>
  onSplit: () => void
}) {
  // 화살표를 누르면 바로 가르지 않고, 그 가지의 선이 튕기며 끊기는 걸 보여 준 뒤 가른다. 움직임 줄이기 설정이면 바로.
  const [snapping, setSnapping] = useState<MedialFamily | null>(null)
  useEffect(() => {
    if (!snapping) return
    const reduce = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    const timer = window.setTimeout(onSplit, reduce ? 0 : SNAP_MS)
    return () => window.clearTimeout(timer)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 누른 순간의 onSplit로 한 번만 간다.
  }, [snapping])
  return <section className={styles.card} aria-label={`${MEDIAL_FAMILY_LABEL[family]} ${jamo} 따로 그리기`} data-testid="variant-gate" data-family={family}>
    <svg className={styles.lines} viewBox="0 0 330 148" aria-hidden="true">
      {FAMILIES.map((item, index) => splitFamilies.includes(item) ? null : <path key={item} pathLength={1} d={`M ${ROOT_RIGHT} 74 C ${ROOT_RIGHT + 40} 74 ${BRANCH_LEFT - 40} ${BRANCH_Y[index]} ${BRANCH_LEFT} ${BRANCH_Y[index]}`} data-snapping={snapping === item || undefined} />)}
    </svg>
    <div className={styles.root} data-snapping={snapping ? true : undefined} data-testid="variant-gate-root"><AppGlyph char={jamo} size={52} upright />기본</div>
    {FAMILIES.map((item, index) => {
      const viewing = item === family
      return <div key={item} className={styles.branch} style={{ top: BRANCH_Y[index] + 14 - 22 }} data-family={item} data-viewing={viewing || undefined} data-split={splitFamilies.includes(item) || undefined} data-snapping={snapping === item || undefined} data-testid="variant-gate-branch">
        <span className={styles.glyph}>{examples[item] ? <AppGlyph char={examples[item]!} size={28} upright /> : <AppGlyph char={jamo} size={28} upright />}</span>
        <span className={styles.label}>{MEDIAL_FAMILY_LABEL[item]}</span>
        {viewing && <Pressable type="button" className={styles.split} onClick={() => setSnapping((current) => current ?? item)} disabled={snapping !== null} aria-label={`${MEDIAL_FAMILY_LABEL[item]} ${jamo} 따로 그리기`} data-testid="variant-gate-split"><ArrowRight size={16} aria-hidden="true" /></Pressable>}
      </div>
    })}
  </section>
}
