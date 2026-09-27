/**
 * 스타일 그림. 값에 따라 변하지 않는 공통 예시 아이콘 — 줄기 하나로 굵기 · 기울기 · 끝 굴림 · 부리 · 네모꼴이 무엇인지 보인다.
 * 실제 값은 옆의 숫자로만 읽는다. 흐린 선은 기준(가는 · 직립 · 각진 끝)이라 무엇이 변하는 항목인지 읽힌다.
 * 대시보드 스타일 타일과 글로벌 스타일 화면의 아래 탭이 같이 쓴다.
 */
const PICTO = 52
const PICTO_STEM = 14
const PICTO_SLANT = 14
const PICTO_ROUNDNESS = 0.7

export type StylePictoKind = 'body' | 'weight' | 'slant' | 'roundness' | 'beak'

export function StylePicto({ kind }: { kind: StylePictoKind }) {
  const ink = 'rgb(var(--color-foreground))'
  const ghost = 'rgb(var(--color-text-6))'
  const stem = PICTO_STEM
  const cx = PICTO / 2
  const top = 8
  const bottom = PICTO - 8
  if (kind === 'body') {
    // 글자 틀. 노토 몸통처럼 세로가 조금 긴 네모.
    const width = 28
    const line = 5
    return <svg viewBox={`0 0 ${PICTO} ${PICTO}`} aria-hidden="true">
      <rect x={cx - width / 2 + line / 2} y={top + line / 2} width={width - line} height={bottom - top - line} rx={1} fill="none" stroke={ink} strokeWidth={line} />
    </svg>
  }
  if (kind === 'weight') {
    // 세로줄기 셋 — 왼쪽부터 점점 두꺼워진다. 간격은 같게.
    const widths = [3, 8, 14]
    const gap = 7
    const total = widths.reduce((sum, w) => sum + w, 0) + gap * (widths.length - 1)
    let x = cx - total / 2
    return <svg viewBox={`0 0 ${PICTO} ${PICTO}`} aria-hidden="true">
      {widths.map((w, i) => {
        const rect = <rect key={i} x={x} y={top} width={w} height={bottom - top} fill={ink} />
        x += w + gap
        return rect
      })}
    </svg>
  }
  if (kind === 'slant') {
    return <svg viewBox={`0 0 ${PICTO} ${PICTO}`} aria-hidden="true">
      <rect x={cx - stem / 2} y={top} width={stem} height={bottom - top} fill={ghost} />
      <rect x={cx - stem / 2} y={top} width={stem} height={bottom - top} fill={ink} transform={`skewX(${-PICTO_SLANT})`} transform-origin={`${cx} ${bottom}`} />
    </svg>
  }
  if (kind === 'roundness') {
    const length = 34
    return <svg viewBox={`0 0 ${PICTO} ${PICTO}`} aria-hidden="true">
      <rect x={cx - length / 2} y={cx - stem / 2} width={length} height={stem} rx={PICTO_ROUNDNESS * stem / 2} fill={ink} />
    </svg>
  }
  // 부리는 줄기 머리의 작은 돌기. 기둥 왼쪽 위에 얹는다.
  const size = stem * 0.65
  const rise = Math.tan((25 * Math.PI) / 180) * size
  const path = `M ${cx - stem / 2 - size} ${top + rise} L ${cx - stem / 2} ${top} L ${cx - stem / 2} ${top + size} Z`
  return <svg viewBox={`0 0 ${PICTO} ${PICTO}`} aria-hidden="true">
    <rect x={cx - stem / 2} y={top} width={stem} height={bottom - top} fill={ink} />
    <path d={path} fill={ink} />
  </svg>
}

/** 붓 그림의 물결 — 같은 S자 획 하나를 두 붓으로 긋는다. */
const WAVE = Array.from({ length: 81 }, (_, i) => {
  const t = i / 80
  return { x: 8 + 48 * t, y: 26 - 12 * Math.sin(t * 2 * Math.PI) }
})
const WAVE_PATH = `M ${WAVE.map((p) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(' L ')}`
/** 납작 붓 촉. 반폭 6, −45°로 눕혀 긋는다 — 올라가는 곳은 굵고 내려가는 곳은 가늘다. */
const NIB = { x: Math.cos(-Math.PI / 4) * 6, y: Math.sin(-Math.PI / 4) * 6 }
const FLAT_POLYGONS = WAVE.slice(1).map((b, i) => {
  const a = WAVE[i]
  return [[a.x + NIB.x, a.y + NIB.y], [b.x + NIB.x, b.y + NIB.y], [b.x - NIB.x, b.y - NIB.y], [a.x - NIB.x, a.y - NIB.y]]
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ')
})

/** 붓 고르기 그림. 일반 붓은 고른 굵기, 납작 붓은 방향 따라 굵고 가늘다. 색은 버튼의 글자색(`currentColor`)을 따른다. */
export function BrushPicto({ flat }: { flat: boolean }) {
  return <svg viewBox="0 0 64 52" aria-hidden="true">
    {flat
      ? FLAT_POLYGONS.map((points, i) => <polygon key={i} points={points} fill="currentColor" stroke="currentColor" strokeWidth={0.4} />)
      : <path d={WAVE_PATH} fill="none" stroke="currentColor" strokeWidth={6} strokeLinejoin="round" />}
  </svg>
}
