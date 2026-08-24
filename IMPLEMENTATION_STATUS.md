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
