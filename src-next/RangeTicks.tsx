import styles from './RangeTicks.module.css'

export type RangeTick = { at: number; text?: string }

/**
 * 막대(`<input type="range">`) 아래 눈금. 값 자리를 막대 길이의 비율로 놓는다.
 * 글씨가 있는 눈금은 굵게, 양 끝 글씨는 막대 안쪽으로 붙여 잘리지 않게 한다. 막대 바로 아래에, 막대와 같은 너비로 둔다.
 */
export function RangeTicks({ min, max, ticks }: { min: number; max: number; ticks: readonly RangeTick[] }) {
  const span = max - min || 1
  return <span className={styles.ticks} aria-hidden="true">
    {ticks.map((tick) => <i key={tick.at} style={{ left: `${(tick.at - min) / span * 100}%` }} data-major={tick.text !== undefined || undefined} data-edge={tick.at === min ? 'start' : tick.at === max ? 'end' : undefined}>
      {tick.text && <b>{tick.text}</b>}
    </i>)}
  </span>
}
