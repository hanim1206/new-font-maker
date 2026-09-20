# Step 3A 구현 인계

> 기준 문서: `COMMON_GRID_HYBRID_IMPLEMENTATION_PLAN.md`, `docs/PRODUCT_PHILOSOPHY.md`
> 완료 범위: 생산용 Part Grid의 코어 Rail 타입과 순수 검증·해석 계약
> 다음 작업: 안정 참조·자소 construction·순수 편집 command를 구현한다. Store, FontData, Grid v1 이관, UI는 아직 시작하지 않는다.

## 1. 구현 결과

생산용 `RailGrid`의 첫 기반을 추가했다.

- 자소 역할은 `STANDALONE`, `CH`, `JU_VERTICAL`, `JU_HORIZONTAL`, `JU_H`, `JU_V`, `JO` 7개로 구분한다.
- X/Y축은 각각 역할이 고정된 코어 Rail 5개를 가진다.
- Rail 원본 위치는 `absolute` 또는 같은 축의 안정 Rail ID 두 개를 참조하는 `between`만 저장한다.
- 해석된 수치는 `ResolvedRailGrid`에만 존재하며 원본에 기록하지 않는다.
- 같은 역할과 입력은 같은 grid/rail ID를 만든다. 위치가 바뀌어도 역할 기반 ID는 유지된다.
- 제품 명세가 코어의 초기 수치를 정하지 않았으므로 factory는 모든 위치를 호출자가 명시하게 한다. 임의 기본값은 추가하지 않았다.

## 2. 검증·해석 계약

`validateRailGrid()`와 `resolveRailGrid()`는 React, Zustand, 브라우저 저장소에 의존하지 않는 순수 함수다.

- grid/rail ID는 비어 있지 않아야 하고 전체 grid에서 유일해야 한다.
- 런타임 JSON의 role, rail kind, position kind와 최소 객체 구조를 명시적으로 검증한다.
- 각 축의 코어 role은 정확히 한 번 존재하고 의미 순서도 고정한다.
- 보조 Rail은 코어 role을 가질 수 없다.
- 모든 수치는 유한해야 하며 정규화 위치는 0–1 범위다.
- `between`은 같은 축의 서로 다른 기존 Rail을 참조하고 ratio는 0과 1 사이여야 한다.
- missing, self, cross-axis, reversed span, 2·3-node cycle을 결정적으로 거부한다.
- 원본 배열을 자동 정렬하거나 위치를 clamp하지 않는다.
- 해석 뒤 원본 배열의 엄격한 단조 증가와 `minGap`을 검사한다.
- 부동소수 경계에는 `Number.EPSILON * 16`만 허용하고 실질적인 `minGap` 미달은 거부한다.
- 실패 시 부분 해석값이나 수정된 grid를 반환하지 않는다.

## 3. 변경 파일

- `src/types/index.ts`
- `src/services/railGridResolver.ts`
- `src/services/railGridResolver.test.ts`

Store, FontData, 기존 Grid Lab, SVG·OTF 소비자, UI 파일은 수정하지 않았다.

## 4. 검증 결과

- RailGrid 전용 계약: 19/19 통과.
- `npm test`: 44파일 250테스트 통과.
- `npm run build`: 통과.
- 대상 파일 ESLint와 TypeScript 검사: 통과.
- `git diff --check`: 통과.
- 기존 Browserslist 안내와 `fontExportUtils`의 static/dynamic import 경고만 남아 있다.
- 전체 lint의 기존 11 errors / 18 warnings와 `/editor-v2` Playwright 11개 실패는 선행 baseline으로 유지한다. Step 3A 신규 오류는 없다.

## 5. 고정된 회귀 계약

- 7개 자소 역할별 X/Y 코어 5개와 결정적 안정 ID.
- 위치 변경 뒤에도 동일한 역할 기반 ID.
- 중첩 `between`의 정확한 좌표와 원본 배열 순서 보존.
- frozen 입력 불변과 파생 수치 비영속.
- 잘못된 hydration 구조와 discriminant의 fail-closed 처리.
- 코어 role 의미 순서, same/cross-axis 중복 ID 귀속, 3-node cycle 구성원 판정.
- X/Y축의 정확한 `minGap` 경계와 즉시 미달 거부.
- 같은 잘못된 입력에 대한 issue 순서의 결정성.

## 6. Step 3B 범위와 중단 조건

다음 조각은 순수 데이터·command 계층으로 제한한다.

- `GridPointRef`, `GridCellRef`, `BoundaryTreatment`, construction element의 모든 주소는 안정 ID만 사용한다. 배열 index 필드를 만들지 않는다.
- 자소 master 소유권은 `jamoId + role`, 혼합중성 channel은 각 `role + gridId`로 명시한다.
- Rail 추가 시 기존 Rail ID를 바꾸지 않고, 채워진 atomic cell을 분할해 기존 실루엣을 보존한다.
- 삭제 전 usage를 수집해 core Rail, 참조 중인 auxiliary Rail, 채워진 cell, master를 잠근다.
- 참조 재연결은 명시적인 command로만 수행하고 사라진 대상을 자동으로 가까운 Rail에 붙이지 않는다.
- mutation은 새 grid 검증이 성공한 경우에만 반환한다. drag preview clamp와 저장 resolver의 fail-closed 의미를 섞지 않는다.
- 한 command는 한 Undo/Redo transaction이 될 수 있는 before/after 경계를 제공한다.
- Store, 저장 포맷, Grid v1 import, sparse override/provenance, UI는 이 조각에서 시작하지 않는다.

안정 ID 없이 index 참조가 필요해지거나, Rail 추가가 기존 실루엣을 바꾸거나, invalid 결과를 부분 저장해야만 진행할 수 있다면 즉시 중단한다.
