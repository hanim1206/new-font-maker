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

## Step 5A-1 · J-02 단일 원자 셀 면 생성·이동

- 변경 파일: `src/types/index.ts`, `src/services/baseMasterAreaCommandsV1.ts`, `src/services/baseMasterAreaCommandsV1.test.ts`, `src/stores/shapeSystemStore.ts`, `src/stores/shapeSystemStore.test.ts`, `src-next/ShapeWorkspacePage.tsx`, `src-next/ShapeWorkspacePage.module.css`, `tests/e2e/shape-workspace-shell.spec.ts`, `IMPLEMENTATION_STATUS.md`.
- 검증: `npx tsc -b --pretty false`, 대상 ESLint, 관련 Vitest 49개, `tests/e2e/shape-workspace-shell.spec.ts` 10개, `git diff --check` 통과. 생성·이동 draft 중 raw 저장 불변, pointerup 저장 1회, pointercancel·lostpointercapture 무변, 이동 Undo 1회 exact 복원을 확인했다.
- 남은 P1·다음 단계 주의점: 이번 Step 5 첫 조각은 ㄱ 가로획과 겹치는 상단 중앙 core 원자 셀 두 곳에서 stable element ID를 가진 면 하나만 생성·선택·이동한다. 다중 셀 채우기, 면 삭제, 곡률·사선, 보조 Rail·참조 재연결, 중심선 생성은 아직 추가하지 않는다. 기존 J-02 네 core Rail, J-03 sparse override, L-01 layout grid의 transaction·cancel 경계는 계속 분리한다.

## Step 5A-1 보정 · 면 도구 패널 전환

- 변경 파일: `src-next/ShapeWorkspacePage.tsx`, `tests/e2e/shape-workspace-shell.spec.ts`, `IMPLEMENTATION_STATUS.md`.
- 검증: `npx tsc -b --pretty false`, 대상 ESLint, 관련 Vitest 6개, `tests/e2e/shape-workspace-shell.spec.ts` 10개, `git diff --check` 통과. `면 채우기` 선택 즉시 기준선 조절 대신 `점유 면 만들기` 안내가 열리고, 생성 뒤 기존 면 이동 패널로 전환되는 것을 확인했다.
- 남은 P1·다음 단계 주의점: 지원 범위는 상단 중앙 두 원자 셀 중 하나에 면 하나를 생성·이동하는 흐름 그대로다. 다중 셀 채우기, 면 삭제, 중심선·보조 Rail 편집은 후속 조각이며 기존 Rail·문맥 override·공통 layout grid의 transaction 경계는 바꾸지 않는다.

## Step 5A-1 사용자 검토 · 전체 그리드 점유 편집으로 교체

- 판정: `상단 두 셀 중 면 하나 생성·이동`은 stable ID와 transaction 안전성을 확인한 기술 조각이지만 제품의 면 채우기 UX로는 부적합하다. 완성 기능이나 확장 기반으로 취급하지 않는다.
- 다음 구현: 현재 역할 part grid의 모든 원자 셀을 노출하고, 하나의 `GridAreaElement`가 여러 `filledCells`를 소유하도록 연속 채우기·비우기를 구현한다. 첫 셀에서 제스처 방향을 고정하고 draft 중 저장 무변, pointerup 한 transaction, cancel 무변, Undo 한 단계 계약을 기존 Grid 2와 동일하게 유지한다.
- 선 원칙: 신규 중심선 앵커·꺾임은 Rail 교점에 고정하고 Rail 이동 때 같은 ID 참조로 다시 계산한다. legacy 선은 사용자가 `그리드에 연결`을 명시적으로 실행하기 전까지 바꾸지 않는다.
- 역할 소유권: 초성 화면은 CH, 단독 화면은 STANDALONE 원형을 독립 편집한다. 현재 두 역할을 함께 바꾸는 임시 bridge는 새 면 명령에 재사용하지 않으며 역할 간 복사·연결은 별도 명시적 액션으로 둔다.
- 변경 문서: `docs/PRODUCT_PHILOSOPHY.md`, `COMMON_GRID_HYBRID_IMPLEMENTATION_PLAN.md`, `KOREAN_FONT_MAKER_UX_SCREEN_SPEC.md`, `IMPLEMENTATION_STATUS.md`와 Obsidian 대응 플랜·UX 명세.
- 검증: 핵심 용어·Step 5·J-02·수용 기준의 상호 참조와 저장소/Obsidian 문서 동기화, `git diff --check`를 확인한다.
