/**
 * 화면 주소 목록. 라우팅은 `main.tsx` · `App.tsx` · `ShapeWorkspacePage.tsx`의 pathname 분기가 하고,
 * 이 목록은 화면 명세(`docs/specs/화면/`)와 주소가 1:1인지 검사하는 데만 쓴다(`screen-spec.test.ts`).
 * 분기를 더하거나 빼면 여기도 같이 고친다. 테스트가 빠진 주소를 잡는다.
 */

/** 제품 화면. 주소마다 명세 파일이 하나씩 있어야 한다. */
export const PRODUCT_SCREEN_ROUTES = [
  '/',
  '/workspace/jamos',
  '/workspace/jamo',
  '/workspace/jamo/master',
  '/workspace/jamo/result',
  '/workspace/review',
] as const

/** 랩. 명세는 있어도 되고 없어도 된다. */
export const LAB_SCREEN_ROUTES = [
  '/grid-lab',
  '/rule-lab',
  '/noto-corpus-lab',
  '/reference-lab',
  '/reference-group-lab',
  '/preset-candidate-lab',
  '/font-guide-lab',
  '/five-guide-lab',
] as const

/** 화면이 아닌 주소: 다른 화면으로 넘기기만 하거나, 셸 분기용 접두어. */
export const NON_SCREEN_ROUTES = [
  '/workspace',
  '/workspace/review/glyph',
  '/workspace/skeleton',
  '/medial-guide-lab',
] as const
