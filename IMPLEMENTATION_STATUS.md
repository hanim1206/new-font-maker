# 구현 상태

기준 커밋: `3169a71`

## Step 4E-1 · 자소 원형 Rail 편집 경계

- 목표: J-02 `초성 ㄱ 원형`의 한 동작으로 독립 소유자인 STANDALONE·CH base core Rail을 한 transaction에서 갱신하고 `ㄱ·가·고·과·각·곡·곽`에 live 상속한다.
- 변경 파일: `src/services/baseMasterRailCommandsV2.ts`, `src/services/baseMasterRailCommandsV2.test.ts`, `src/stores/shapeSystemStore.ts`, `src/stores/shapeSystemStore.test.ts`, `src/types/index.ts`.
- 검증: 새 command/service, shapeSystemStore, contextPartGridResolver 표적 Vitest 60개 통과. `npx tsc -b --pretty false`, 변경 파일 ESLint, `git diff --check` 통과.
- 남은 P1·다음 UI 주의점: J-02는 두 역할의 stable master/Rail ID와 coreRole을 함께 넘기고 로컬 draft 뒤 pointerup 한 번만 새 store action을 호출한다. J-03의 sparse override command는 재사용하거나 바꾸지 않는다. 같은 역할 grid에 다른 자소 master가 생긴 상태는 해당 자소 결과까지 바뀌므로 현재 command가 fail-closed한다.
- 커밋: 이 항목을 포함한 `feat(shape-system): 자소 원형 Rail 편집 경계 추가`
