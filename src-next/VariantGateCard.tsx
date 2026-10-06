import type { MedialFamily } from '../src/types'
import { Button } from './components/ui/button'
import styles from './VariantGateCard.module.css'

/** 홀자 계열 이름. 어휘사전의 세로홀자 · 가로홀자 · 섞임홀자. */
export const MEDIAL_FAMILY_LABEL: Readonly<Record<MedialFamily, string>> = { right: '세로홀자', bottom: '가로홀자', mixed: '섞임홀자' }

/**
 * 안 가른 계열의 글자를 열었을 때 조절판 자리에 서는 카드. 캔버스는 보기만이고, 단추는 `따로 그리기` 하나다.
 * 기본으로 가는 길은 줄 맨 앞 단독 칸이라 여기 두지 않는다(10-06 사용자).
 */
export function VariantGateCard({ jamo, family, examples, onSplit }: { jamo: string; family: MedialFamily; examples: string; onSplit: () => void }) {
  return <section className={styles.card} aria-label={`${MEDIAL_FAMILY_LABEL[family]} ${jamo} 따로 그리기`} data-testid="variant-gate" data-family={family}>
    <h3 className={styles.title}><b>{MEDIAL_FAMILY_LABEL[family]} {jamo}</b>은 아직 기본 {jamo}과 같아요</h3>
    <p className={styles.sub}>{examples} … 에만 따로 모양을 줄 수 있어요. 지금은 기본 {jamo}을 따라가요.</p>
    <div className={styles.actions}>
      <Button type="button" size="sm" onClick={onSplit} data-testid="variant-gate-split">따로 그리기</Button>
    </div>
  </section>
}
