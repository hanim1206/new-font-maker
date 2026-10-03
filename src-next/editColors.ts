/**
 * 캔버스(SVG) 색. SVG 속성(`fill=…`)에 넣는 값이라 CSS 변수 대신 값을 여기 둔다.
 * `src/index.css`의 토큰과 같은 값이어야 한다 — `edit-colors.test.ts`가 맞춘다. 색을 바꿀 땐 두 곳을 같이 고친다.
 * 키 → 토큰: 이름 그대로 `--color-<토큰>`(예: `editSelect` → `--color-edit-select`).
 */
export const EDIT_COLOR = {
  editSelect: '#f0561e',
  editHandle: '#0d99ff',
  editGhost: '#3a3a36',
  editGuide: '#c4cbd4',
  editBaseline: '#a6a297',
  editSlotCh: '#2f9a6a',
  editSlotJu: '#3b6fd6',
  editSlotJo: '#8b5cf6',
  editSlotOff: '#c9c5bb',
  /** 캔버스 글자 잉크 · 손잡이 테두리. */
  foreground: '#181b1f',
  surface: '#ffffff',
  /** 바꾸기 전 획(옅은 회색). */
  text5: '#8b939d',
  destructive: '#d64541',
} as const
