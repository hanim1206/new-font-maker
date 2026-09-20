# Step 2 구현 인계

> 기준 문서: `COMMON_GRID_HYBRID_IMPLEMENTATION_PLAN.md`, `docs/PRODUCT_PHILOSOPHY.md`
> 완료 범위: Implementation Plan Step 2 — 공통 잉크 해석 계층
> 다음 작업: Step 3 안정 ID 기반 생산용 그리드와 코어 레일 계약만 진행한다. Step 4 이후 UI는 시작하지 않는다.

## 1. 구현 결과

화면 SVG와 OTF 수집기가 같은 `resolveGlyphInkPrimitives()`를 사용한다. 파트 순서, 혼합중성 채널, 문맥 안전 보정, 실효 박스, 굵기, linecap/linejoin은 한 순수 resolver에서 결정하며 소비자가 다시 해석하지 않는다.

- 10개 레이아웃의 기존 렌더 순서를 그대로 유지했다.
- `JU_H`, `JU_V`의 채널 선택과 명시적 빈 배열 의미를 유지했다.
- `schema`, 직접 `boxes`, 미래 `resolvedPartGrid` 입력 자리를 분리했다.
- 중심선 source ID는 글리프·파트·채널·자소·안정 stroke ID로 만들며 배열 인덱스를 쓰지 않는다.
- OTF의 Design Body 왼쪽 원점 이동은 공통 primitive를 바꾸지 않고 복사한 출력 박스에만 적용한다.
- SVG 디버그 슬롯은 잉크 존재 여부가 아니라 기존처럼 자소와 슬롯 존재 여부로 표시한다.

현재 resolver는 기존 중심선만 생성한다. 생산용 면 원본과 실제 `resolvedPartGrid`는 Step 3 이후에 연결한다.

## 2. 공통 면·Boolean 경계

유효한 `BrushInkGroup`과 `InkRegion` 사이의 무손실 어댑터를 추가했다. outer, hole, 점 순서, winding, 시작점, 그룹 순서를 바꾸거나 union하지 않는다. 일반 면에서는 퇴화한 outer 뒤의 hole을 새 outer로 승격하지 않으며, 구 CFF 입력의 first-valid-ring 호환 의미는 별도 facade에만 격리했다.

기존 CFF Boolean 구현은 `unionInkRegions()` 공통 core로 옮겼다.

- core는 UPM, ascender, SVG viewBox, slant를 알지 않는다.
- 위치 epsilon과 최소 링 면적은 호출 좌표계의 단위로 반드시 주입한다.
- CFF facade는 기존 `1e-6`, `0.5` 값을 그대로 사용한다.
- 겹치지 않는 면은 기존 fast path를 유지한다.
- outer는 CW, hole은 CCW로 정규화한다.
- `fontGenerator`의 투영·정수 반올림·union 순서는 바꾸지 않았다.

원형 획은 기존 SVG native stroke와 정밀 OTF outline을 그대로 유지한다. 비원형 획도 이번 단계에서는 기존 화면 렌더 방식을 유지하며, 공통 `InkRegion` 어댑터는 이후 실제 면 원본을 연결할 경계로만 추가했다. 전체 11,223자 수집 때 파생 region을 미리 물질화하지 않아 메모리 구조도 바뀌지 않았다.

## 3. 변경 파일

공통 계약과 resolver:

- `src/types/index.ts`
- `src/services/glyphInkResolver.ts`
- `src/services/glyphInkResolver.test.ts`

SVG·OTF 소비자와 회귀 계약:

- `src/renderers/SvgRenderer.tsx`
- `src/services/fontExportUtils.ts`
- `src-next/font-export-contract.test.ts`
- `src-next/glyph-ink-consumers-contract.test.tsx`
- `src-next/svg-legacy-baseline.test.ts`
- `tests/e2e/nonround-otf-baseline.spec.ts`
- `tests/fixtures/nonround-otf-glyphs-v1.json`

면·Boolean 경계:

- `src/services/inkGeometry.ts`
- `src/services/inkGeometry.test.ts`
- `src/services/inkBoolean.ts`
- `src/services/inkBoolean.test.ts`
- `src/services/contourBoolean.ts`

기존 SVG·OTF fixture JSON은 수정하지 않았다.

## 4. 검증 결과

- Step 2A 핵심: 공통 resolver·SVG·OTF 소비자 계약 통과.
- 공통 면·Boolean 및 인접 회귀: 전용 adapter·topology·CFF compatibility 계약 통과.
- `npm test`: 43파일 231테스트 통과.
- `npm run build`: 통과.
- 대상 파일 ESLint와 TypeScript 검사: 통과.
- 실제 다운로드 OTF 기준: 통과. 원형 대표 12자의 metrics, bbox, path commands fixture 변화 없음.
- 비원형 실제 OTF 기준: 통과. 납작형·네모형·절단형 `곽`의 metrics, bbox, command count, parsed command SHA-256 fixture가 재실행에서 exact 일치.
- 관련 브라우저 테스트: 기존 화면, 레이아웃 전파, 면 획, 원형·비원형 OTF 다운로드 통과.
- `npm run lint`: 기존 기준과 같은 11 errors / 18 warnings. Step 2 신규 오류는 없다.
- 전체 Playwright delta gate: 알려진 `mobile-editor-v2*.spec.ts` 두 파일을 제외한 기존 24/24와 신규 비원형 OTF 기준 1/1 통과. 기존 라우팅 실패도 동일하게 재현되었고 새 실패는 없다.

## 5. 고정된 회귀 계약

- 10개 레이아웃과 실제 `곽`의 primitive 순서.
- `CH → JU_H → JO → JU_V`와 각 채널의 stroke ID 순서.
- 문맥 안전 보정 뒤 화면·OTF의 동일 박스.
- schema 우선순위, part 색·투명도·숨김, clip, slant, children, transition, debug 슬롯 의미.
- 기존 12자 SVG semantic fixture 무변경.
- 기존 12자 실제 OTF geometry·metrics fixture 무변경.
- 실제 `ㅇ·ㅁ·ㅎ` 내부 hole, 실제 `ㅂ·ㅙ` 교차부 유지.
- ellipse, rectangle, angled-area, dot-pattern, legacy snapped centerline의 유효 BrushInkGroup ↔ InkRegion exact 왕복.
- 실제 `곽`의 ellipse·rectangle·angled-area SVG path attributes exact hash.
- 실제 다운로드 OTF의 ellipse·rectangle·angled-area `곽` parsed geometry exact hash.
- normalized 좌표와 font 좌표에서 동일한 Boolean topology.

## 6. Step 3 주의점과 중단 조건

Step 3에서는 Rail/Grid 데이터 계약만 구현한다.

- `layoutGrid`와 `basePartGrid/contextPartGrid/resolvedPartGrid`를 결합하지 않는다.
- 모든 Rail, point, cell, construction source는 안정 ID를 사용한다. 파생 배열 인덱스를 provenance로 저장하지 않는다.
- `RailPosition`은 `absolute` 또는 `between` 원본 하나만 저장하고 해석 좌표는 저장하지 않는다.
- `resolvedPartGrid`, `InkRegion`, Boolean 결과, SVG path는 파생값으로 유지한다.
- 기존 중심선 입력은 `resolvedPartGrid` seam을 통해서만 확장하고 SVG·OTF 소비자에 새 파트 해석 분기를 만들지 않는다.
- Rail 편집 UI, 모바일 셸, drawer, 7개 비교 strip은 Step 4 이후이므로 시작하지 않는다.
- 기존 SVG 또는 실제 OTF fixture에 delta가 생기면 fixture를 갱신하지 않고 중단한다.
- `ㅇ·ㅁ·ㅎ` hole, `ㅂ·ㅙ` 교차, CFF winding이 달라지면 다음 단계로 넘기지 않는다.
- 전체 11,223자에 파생 region/Boolean 결과를 저장해 메모리를 확대하지 않는다.

`pointercancel`의 승인 목표는 rollback이다. Step 3 command는 한 제스처를 한 transaction으로 설계하고, UI 단계에서 `pointerup` 1회 commit과 `pointercancel` rollback을 테스트한다.

## 7. 최종 상태

Step 2 구현과 인수 기준 검증은 완료되었다. 전체 Playwright 실행은 기존 `/editor-v2` 실패에 도달한 뒤 반복되는 30초 타임아웃을 중단하고, 해당 두 파일을 제외한 기존 24개와 신규 비원형 OTF 기준을 모두 통과했다. 전체 lint의 기존 오류와 `/editor-v2` 11개 실패는 Step 2 회귀와 분리된 선행 baseline 문제이며, Step 3에서도 새 실패를 추가하지 않는 delta gate를 유지한다.
