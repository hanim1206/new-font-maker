import type { StrokeDataV2, SymbolGlyph } from '../types'

/**
 * 숫자 · 기호 씨앗 획. 편집기가 기호를 처음 열 때 채워 준다(저장은 고친 뒤에만).
 * 노토 산스 KR 400의 윤곽에서 중심선을 손으로 따서 칸 좌표(x = 노토 400 폭, y = EM 높이 · 밑선 0.88)로 옮겼다.
 * 두께는 노토 400 줄기(약 85 단위)에 맞춘다. 플랜: docs/plans/2026-10-08_숫자-기호-획-편집.md
 */

const T = 0.085

function line(id: string, ...points: Array<[number, number]>): StrokeDataV2 {
  return { id, points: points.map(([x, y]) => ({ x, y })), closed: false, thickness: T }
}

/** 칸 좌표의 타원(위 → 오른 → 아래 → 왼, `ㅇ`과 같은 순서). `k`는 핸들 길이 비율(0.552 = 원). */
function ring(id: string, cx: number, cy: number, rx: number, ry: number, k = 0.552, thickness = T): StrokeDataV2 {
  const hx = rx * k
  const hy = ry * k
  return {
    id,
    closed: true,
    thickness,
    points: [
      { x: cx, y: cy - ry, handleIn: { x: cx - hx, y: cy - ry }, handleOut: { x: cx + hx, y: cy - ry } },
      { x: cx + rx, y: cy, handleIn: { x: cx + rx, y: cy - hy }, handleOut: { x: cx + rx, y: cy + hy } },
      { x: cx, y: cy + ry, handleIn: { x: cx + hx, y: cy + ry }, handleOut: { x: cx - hx, y: cy + ry } },
      { x: cx - rx, y: cy, handleIn: { x: cx - rx, y: cy + hy }, handleOut: { x: cx - rx, y: cy - hy } },
    ],
  }
}

/**
 * 점(`?`의 아래 점, `,`의 머리): 아주 짧은 세로 획을 둥근 끝으로 굵게 — 어느 굵기에서도 안이 꽉 찬 원이다. 400에서 반지름 `r`(EM 비율), 굵기 따라 함께 커진다.
 * 끝 모양은 전역 설정과 상관없이 둥글게 고정한다(노토의 점도 둥글다). 작은 고리로 그리면 화면 렌더러에서 가운데가 뚫린다.
 */
function dot(id: string, cx: number, cy: number, r: number): StrokeDataV2 {
  const half = r * 0.05
  return { id, points: [{ x: cx, y: cy - half }, { x: cx, y: cy + half }], closed: false, thickness: r * 2, linecap: 'round' }
}

const SEEDS: Record<string, StrokeDataV2[]> = {
  // 노토 0: 바깥 50–506 × −13–746, 안 138–418 × 61–674(폭 555).
  '0': [ring('0-ring', 0.5, 0.513, 0.332, 0.343, 0.6)],
  // 노토 1: 줄기 252–343, 깃 121→273(위 733), 발 88–490(아래 0–76).
  '1': [
    line('1-stem', [0.536, 0.147], [0.536, 0.842]),
    line('1-flag', [0.218, 0.228], [0.52, 0.17]),
    line('1-foot', [0.159, 0.842], [0.883, 0.842]),
  ],
  // 노토 ?: 고리 43–421 × 221–762, 점 156–288 × −13–126(폭 474).
  '?': [
    {
      id: '?-hook',
      closed: false,
      thickness: T,
      points: [
        { x: 0.146, y: 0.234, handleOut: { x: 0.25, y: 0.17 } },
        { x: 0.489, y: 0.156, handleIn: { x: 0.33, y: 0.156 }, handleOut: { x: 0.66, y: 0.156 } },
        { x: 0.793, y: 0.3, handleIn: { x: 0.793, y: 0.22 }, handleOut: { x: 0.793, y: 0.4 } },
        { x: 0.461, y: 0.54, handleIn: { x: 0.461, y: 0.44 } },
        { x: 0.461, y: 0.659 },
      ],
    },
    dot('?-dot', 0.468, 0.824, 0.066),
  ],
  // 노토 ,: 53–221 × −190–126(폭 278). 둥근 머리에서 왼아래로 휘는 꼬리.
  ',': [
    dot(',-head', 0.52, 0.815, 0.068),
    {
      id: ',-tail',
      closed: false,
      thickness: T,
      points: [
        { x: 0.62, y: 0.82, handleOut: { x: 0.62, y: 0.97 } },
        { x: 0.26, y: 1.055, handleIn: { x: 0.5, y: 1.03 } },
      ],
    },
  ],
}

/** 씨앗이 있으면 그 사본, 없으면 빈 획. */
export function symbolSeedOf(char: string): SymbolGlyph {
  return { char, strokes: structuredClone(SEEDS[char] ?? []) }
}

export const SEEDED_SYMBOLS: readonly string[] = Object.keys(SEEDS)
