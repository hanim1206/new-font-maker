# Step 3C-1 구현 인계

> 상태: Shape System v1 canonical 저장 경계와 세션 Undo/Redo 완료
>
> FontData 1.3, Grid Lab v1 명시적 가져오기, UI는 아직 연결하지 않았다.

## 이번 조각에서 완료한 것

- 7개 자소 역할 source를 정확히 한 번씩 소유하는 `shape-system` version 1 envelope를 정의했다.
- 각 역할 source는 기존 `role-construction` strict parser를 통과해야 하며 key·grid role·master role이 일치해야 한다.
- 전체 grid·Rail·master ID 중복을 차단하고 `roleSources`를 고정 역할 순서로 canonicalize한다.
- root와 역할 source는 own property만 인정한다. prototype에서 상속된 입력은 예외 없이 차단한다.
- 초기 저장 key 부재는 정상적인 `source: null` 미연결 상태다. 임의 코어 위치를 seed하지 않는다.
- persist envelope의 root/state/source 구조와 store version을 exact 검사한다.
- 손상 JSON·미래 version·future field·손상 source는 blocked 상태가 되며 원본 localStorage byte를 덮어쓰지 않는다.
- blocked 상태에서는 일반 FontData ingress도 거부한다. 복구는 향후 원본 백업과 명시 승인 경로로 분리한다.
- Zustand store는 canonical source만 persist하고 history·hydration 상태·파생값은 저장하지 않는다.
- 공개 store action은 문맥 core override set/remove와 Undo/Redo만 제공한다. raw resolver·retile·generic transaction 적용은 노출하지 않는다.
- core override 명령 하나가 history 한 건이며 Undo/Redo는 transaction before/after가 현재 source와 exact 일치할 때만 수행한다.
- stale Undo/Redo, semantic no-op, 잘못된 runtime role은 source/history/storage 무변경으로 실패한다.
- session history는 50건으로 제한하고 reload 시 비운다.

## 변경 파일

- `src/types/index.ts`
- `src/services/shapeSystemSourceV1.ts`
- `src/services/shapeSystemSourceV1.test.ts`
- `src/stores/shapeSystemStore.ts`
- `src/stores/shapeSystemStore.test.ts`

## 검증 결과

- Shape System 대상 Vitest: 2개 파일, 24개 통과
- 전체 Vitest: 54개 파일, 389개 통과
- TypeScript 검사: 통과
- 대상 ESLint: 통과
- 프로덕션 build: 통과
- `git diff --check`: 통과
- 독립 구조·회귀·저장 안전성 감사: P0/P1 없음
- 빌드에는 기존 Browserslist와 `fontExportUtils` import 안내만 남아 있다.
- 전체 lint의 기존 11 errors / 18 warnings는 선행 baseline으로 유지한다.

## 다음 조각 범위

Step 3C-2에서는 FontData 1.3 최소 골격과 원자적 project ingress를 구현한다.

1. FontData 1.2와 1.3을 version literal로 구분한다.
2. 1.2 → 1.3 migration은 기존 필드를 보존하고 `shapeSystem`을 추가하지 않은 미연결 상태로 만든다.
3. 1.3의 선택적 `shapeSystem`은 이번 strict parser를 통과해야 한다.
4. 모든 FontData store 적용은 전체 parse/migration 성공 뒤에만 시작한다.
5. shapeSystem이 없는 프로젝트를 불러오면 이전 프로젝트의 Shape System state를 명시적으로 clear한다.
6. JamoData에 `roleMasters`를 복제 저장하지 않는다. 이번 envelope가 유일한 canonical 원본이다.

## 주의할 문제

- 실제 preset patch universe가 없으므로 `presetId` source는 계속 fail-closed한다.
- 새 프로젝트의 7역할 코어 초기 좌표는 명세가 확정하지 않았다. 테스트 수치를 제품 기본값으로 승격하지 않는다.
- 기존 `createDebouncedStorage`는 quota/write 실패를 조용히 무시한다. Step 7 저장 상태·재시도 UI 전에 observable storage로 바꿔야 한다.
- 구형 탭이 FontData 1.3 프로젝트를 1.2로 덮어쓰지 않도록 write rollout/version guard가 필요하다.
- low-level raw resolver·retile은 production ingress에서 직접 호출하지 않는다.
- Grid Lab v1 key는 아직 읽거나 수정하지 않았다.

## 중단 조건

- FontData migration이 기존 SVG·OTF 결과를 바꿈
- 1.2 load가 임의 Shape System을 seed함
- parse 실패 뒤 일부 store만 변경됨
- project A의 Shape System이 shape 없는 project B에 잔류함
- shapeSystem과 JamoData 양쪽에 role master가 복제됨
- future version을 현재 형식으로 추측하거나 저장함
