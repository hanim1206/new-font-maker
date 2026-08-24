# 구현 상태

기준 커밋: `3169a71`

## Step 4E-1 · 자소 원형 Rail 편집 경계

- 목표: J-02 `초성 ㄱ 원형`의 한 동작으로 독립 소유자인 STANDALONE·CH base core Rail을 한 transaction에서 갱신하고 `ㄱ·가·고·과·각·곡·곽`에 live 상속한다.
- 변경 파일: `src/services/baseMasterRailCommandsV2.ts`, `src/services/baseMasterRailCommandsV2.test.ts`, `src/stores/shapeSystemStore.ts`, `src/stores/shapeSystemStore.test.ts`, `src/types/index.ts`.
- 검증: 새 command/service, shapeSystemStore, contextPartGridResolver 표적 Vitest 60개 통과. `npx tsc -b --pretty false`, 변경 파일 ESLint, `git diff --check` 통과.
- 남은 P1·다음 UI 주의점: J-02는 두 역할의 stable master/Rail ID와 coreRole을 함께 넘기고 로컬 draft 뒤 pointerup 한 번만 새 store action을 호출한다. J-03의 sparse override command는 재사용하거나 바꾸지 않는다. 같은 역할 grid에 다른 자소 master가 생긴 상태는 해당 자소 결과까지 바뀌므로 현재 command가 fail-closed한다.
- 커밋: 이 항목을 포함한 `feat(shape-system): 자소 원형 Rail 편집 경계 추가`

## Step 4E-2 · J-02 자소 원형 Rail 직접 편집

- 변경 파일: `src-next/ShapeWorkspacePage.tsx`, `src-next/ShapeWorkspacePage.module.css`, `tests/e2e/shape-workspace-shell.spec.ts`, `IMPLEMENTATION_STATUS.md`.
- 검증: `npx tsc -b --pretty false`, 대상 ESLint, `npx playwright test tests/e2e/shape-workspace-shell.spec.ts --workers=1`(8개 통과), `git diff --check` 통과.
- 남은 P1·다음 단계 주의점: J-02는 STANDALONE·CH의 stable master/Rail 주소와 두 역할 안전 범위의 교집합이 모두 확인될 때만 편집한다. J-03 sparse override의 transaction·cancel 경계는 그대로 유지하며, 이후 Rail 추가·삭제나 전체 Shape 출력 연결은 이 원형 편집 경로에 섞지 않는다.

## Step 4F-1 · 공통 layout grid 명시적 연결

- 변경 파일: `src/services/layoutGridConnectionV1.ts`, `src/services/layoutGridConnectionV1.test.ts`, `src/services/layoutGridProjection.ts`, `src/stores/shapeSystemStore.ts`, `src/stores/shapeSystemStore.test.ts`, `src/types/index.ts`, `IMPLEMENTATION_STATUS.md`.
- 검증: 공통 grid 연결·projection·store 표적 Vitest 47개, `npx tsc -b --pretty false`, 대상 ESLint, `git diff --check` 통과.
- 남은 P1·다음 단계 주의점: 이 조각은 현재 7개 legacy schema를 사용자가 명시적으로 연결할 수 있는 strict 원본과 Undo transaction만 제공한다. 실제 layout Rail 선택·드래그 UI와 파생 schema를 화면 소비 경로에 연결하는 작업은 다음 세션에서 별도 조각으로 진행하며, grid가 없는 기존 프로젝트는 계속 legacy 결과를 사용해야 한다.

## Step 4F-2 · 공통 layout Rail 직접 편집

- 변경 파일: `src/services/layoutGridRailCommandsV1.ts`, `src/services/layoutGridRailCommandsV1.test.ts`, `src/stores/shapeSystemStore.ts`, `src/stores/shapeSystemStore.test.ts`, `src/types/index.ts`, `src-next/ShapeWorkspacePage.tsx`, `src-next/ShapeWorkspacePage.module.css`, `src-next/workspace/WorkspaceChrome.tsx`, `tests/e2e/shape-workspace-shell.spec.ts`, `IMPLEMENTATION_STATUS.md`.
- 검증: 공통 Rail command·store 표적 Vitest 26개, `npx tsc -b --pretty false`, 대상 ESLint, `npx playwright test tests/e2e/shape-workspace-shell.spec.ts --workers=1`(9개 통과) 실행. draft 중 raw 저장 불변, pointerup 한 번 저장, Undo exact 복원과 390px overflow를 브라우저에서 확인했다.
- 남은 P1·다음 단계 주의점: 공통 grid는 직접 이동 가능한 absolute Rail만 stable ID로 갱신한다. 이후 자소 캔버스의 선·면·보조 Rail 편집은 이 layout grid transaction과 섞지 말고, 자소 역할 grid의 소유권·topology 검증 경계를 유지해야 한다. Shape 최종 출력과 OTF는 아직 이 화면의 legacy 글자 배치 결과와 별도 검증 단계다.

## Step 4F-3 · 공통 layout 동시 노출

- 변경 파일: `src-next/ShapeWorkspacePage.tsx`, `src-next/ShapeWorkspacePage.module.css`, `tests/e2e/shape-workspace-shell.spec.ts`, `IMPLEMENTATION_STATUS.md`.
- 검증: `npx tsc -b --pretty false`, 대상 ESLint, `npx playwright test tests/e2e/shape-workspace-shell.spec.ts --workers=1`(9개 통과), `git diff --check` 통과.
- 남은 P1·다음 단계 주의점: L-01 캔버스는 7개 binding의 슬롯 경계를 같은 좌표에서 항상 함께 보이며 Rail만 선택 상태로 강조한다. layout별 개별 편집 모드나 binding 재연결 UI는 아직 추가하지 않는다.

## Step 4F-4 · 공통 layout Rail 직접 조작

- 변경 파일: `src-next/ShapeWorkspacePage.tsx`, `src-next/ShapeWorkspacePage.module.css`, `tests/e2e/shape-workspace-shell.spec.ts`, `IMPLEMENTATION_STATUS.md`.
- 검증: `npx tsc -b --pretty false`, 대상 ESLint, `npx playwright test tests/e2e/shape-workspace-shell.spec.ts --workers=1`(9개 통과), `git diff --check` 통과.
- 남은 P1·다음 단계 주의점: L-01에서는 캔버스의 Rail 근처를 hover하면 해당 선만 강조되고, 탭한 Rail은 파란 drag handle을 표시한다. 조작은 캔버스에서 끝나며 정밀 조절 drawer나 layout별 선택 모드를 다시 도입하지 않는다.

## Step 4F-5 · 연결 결과 읽기 전용 표시

- 변경 파일: `src-next/workspace/WorkspaceChrome.tsx`, `src-next/ShapeWorkspacePage.tsx`, `tests/e2e/shape-workspace-shell.spec.ts`, `IMPLEMENTATION_STATUS.md`.
- 검증: `npx tsc -b --pretty false`, 대상 ESLint, `npx playwright test tests/e2e/shape-workspace-shell.spec.ts --workers=1`(9개 통과), `git diff --check` 통과.
- 남은 P1·다음 단계 주의점: L-01의 7개 연결 결과 카드는 클릭해도 바뀌는 가짜 선택 도구가 아니라 읽기 전용 결과다. J-02/J-03의 관찰 카드만 여전히 선택 가능한 상호작용을 유지한다.
