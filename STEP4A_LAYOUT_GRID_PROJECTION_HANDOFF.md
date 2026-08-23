# Step 4A — 공통 레이아웃 그리드 투영 인계

## 이번 조각에서 완료한 범위

- 기존 10종 레이아웃 중 공통 그리드 대상 7종을 `SharedLayoutType`으로 분리했다.
- partGrid와 섞이지 않는 별도 `ResolvedLayoutGrid`와 `LayoutGridBinding` 계약을 추가했다.
- 기존 `{ axis, value }` split을 의미 기반 stable ID로 식별하되, stable ID는 저장 `LayoutSchema` 밖의 파생 결과에만 둔다.
- 바인딩의 split Rail과 파트별 네 경계 Rail이 같은 슬롯을 만드는지 fail-closed 검증한다.
- `resolveGridBoundSchema()`와 7종 원자 일괄 해석 `resolveAllGridBoundSchemas()`를 추가했다.
- 기존 10종 `calculateBoxes()` 결과와 독립 모음 3종을 exact 유지한다.
- Design Body가 있으면 기존과 같은 canonical 0.075 body에서 검증하고, 최종 변환은 `calculateBoxes()`에서 한 번만 수행한다.

## 의도적으로 하지 않은 것

- 같은 숫자 위치라는 이유로 여러 레이아웃 Rail을 자동 공유하지 않는다.
- 기본 공통 그리드나 7종 binding catalog를 생성하지 않는다.
- layoutStore, Shape store, FontData, UI에 연결하지 않는다.
- 기존 persisted `Split`에 `id`를 추가하지 않는다.
- partGrid의 `RailGrid`나 resolver를 재사용하지 않는다.

## 핵심 파일

- `src/types/index.ts`
- `src/services/layoutGridProjection.ts`
- `src/services/layoutGridProjection.test.ts`

## 검증

- projection + legacy 좌표 + Design Body: 24 tests pass
- 전체 unit: 58 files / 482 tests pass
- TypeScript, 대상 ESLint, production build, diff check pass
- 기존 build 안내만 유지: Browserslist 데이터와 fontExportUtils chunk 안내

## 다음 저장 조각의 필수 게이트

- `LayoutGridSystemSourceV1` strict parser에서 7개 binding ID를 canonical/unique로 검증한다.
- Shape role grid/Rail/master와 layout grid/Rail/binding 전체 ID universe 충돌을 차단한다.
- Shape V1은 `layoutSystem: null`인 V2로만 무손실 이관하며 자동 seed하지 않는다.
- writer 연결은 ShapeSystem V2 + FontData 1.4에서만 한다. FontData 1.3/Shape V1에 필드를 추가하지 않는다.
- 저장 연결 전까지 이 resolver의 결과는 비영속 파생값이며 layoutSchemas에 write-back하지 않는다.
