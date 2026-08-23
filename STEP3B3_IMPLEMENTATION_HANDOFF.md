# Step 3B-3 구현 인계

> 상태: 문맥별 sparse 원본, strict source v1, 복합 셀 재타일링, 전체 사용처 수집과 안전 명령 완료
>
> Zustand·FontData·기존 Grid v1 가져오기·화면 연결은 아직 시작하지 않았다.

## 이번 조각에서 완료한 것

- `role-construction` version 1 source를 재귀적으로 검사하는 strict parser를 추가했다.
- parser는 알 수 없는 필드, 손상된 배열·discriminant, 지원하지 않는 schema/version을 제거하거나 추측하지 않고 차단한다.
- 검증된 source는 읽기 전용 branded 타입으로 반환하며, 명령은 복제한 원본만 수정한 뒤 전체를 다시 검증한다.
- 자소 문맥 variant에는 core Rail 위치, variant 전용 보조 Rail, 안정 참조 재연결만 sparse 값으로 저장한다.
- 파생 grid·셀·InkRegion·Boolean 결과와 provenance는 source에 저장하지 않는다.
- 정확한 context variant resolver가 master 원본을 실시간 상속하고, 실제로 달라진 Rail·참조 leaf의 provenance만 파생한다.
- 실제 preset patch resolver가 없는 상태에서 `presetId`를 적용된 것으로 추측하지 않는다. catalog coverage가 없으면 명시적으로 중단한다.
- 셀 edge 변경은 단독 참조 수정이 아니라 관련 atomic cell을 함께 바꾸는 `retileGridCellEdge()` 한 transaction으로 처리한다.
- 재타일링은 canonical cell ID, 기존 hole·실루엣, 비대상 안정 ID를 보존하고 손상·충돌·variant 사용처가 있으면 전체를 중단한다.
- base Rail 사용처에 문맥 variant의 core override, variant 보조 Rail `between`, reference destination과 target을 합산한다.
- variant 전용 보조 Rail 삭제도 dependent `between`, reference destination, 분할된 cell target을 모두 안정 owner 경로로 반환한 뒤 차단한다.
- core·reference·auxiliary sparse patch의 set/remove 명령은 각각 한 before/after transaction을 만들며, 마지막 patch 제거 시 빈 variant도 제거한다.
- base core 위치와 같은 값은 override로 저장하지 않고, 기존 override를 상속값으로 되돌리면 sparse 항목을 제거한다.
- 의미가 같은 patch는 객체 key 순서와 무관하게 no-op으로 처리한다.

## 변경 파일

- `src/types/index.ts`
- `src/services/jamoConstruction.ts`
- `src/services/jamoConstruction.test.ts`
- `src/services/gridCellRetileCommands.ts`
- `src/services/gridCellRetileCommands.test.ts`
- `src/services/jamoContextVariants.ts`
- `src/services/jamoContextVariants.test.ts`
- `src/services/roleConstructionSourceV1.ts`
- `src/services/roleConstructionSourceV1.test.ts`
- `src/services/roleConstructionUsagesV1.ts`
- `src/services/roleConstructionUsagesV1.test.ts`
- `src/services/roleConstructionSourceCommandsV1.ts`
- `src/services/jamoContextVariantCommandsV1.ts`
- `src/services/jamoContextVariantCommandsV1.test.ts`
- 기존 reference·grid command 파일의 source v1 경계 보강

## 검증 결과

- 전체 Vitest: 52개 파일, 365개 통과
- 프로덕션 build와 TypeScript 검사: 통과
- 신규·수정 대상 ESLint: 통과
- `git diff --check`: 통과
- 독립 회귀·저장 안전성 감사: P0/P1 없음
- 전체 lint는 기존 baseline과 같은 11 errors / 18 warnings가 남아 있다.
- 빌드에는 기존 Browserslist 갱신 안내와 `fontExportUtils`의 static/dynamic import 안내만 남아 있다.

## 다음 조각 범위

Step 3C에서는 검증된 source v1을 저장소에 연결한다.

1. `shapeSystemStore`의 canonical 원본과 hydration 경계를 만든다.
2. FontData 1.3 골격과 저장·불러오기 round-trip을 추가한다.
3. 기존 Grid v1은 자동 변환하지 않고 명시적 import 결과와 원본 보존을 검증한다.
4. 모든 store mutation은 이번 조각의 parse → command → final parse → transaction 경계를 사용한다.
   raw `resolveExactJamoContextVariant()`와 `retileGridCellEdge()`는 내부 순수 primitive로만 두고, 저장소 ingress에서는 strict parser를 거친 wrapper만 노출한다.
5. layoutGrid projection, 7개 문맥 fallback/preset 실제 적용, 전체 자모 확장, UI는 지정된 후속 조각 전까지 시작하지 않는다.

## 다음 단계에서 주의할 문제

- 현재 variant resolver는 exact context만 다룬다. 7개 문맥 fallback 동률 우선순위는 Step 4 계약 전 별도로 고정해야 한다.
- `presetId`는 ID 존재만으로 적용된 것으로 간주하면 안 된다. 실제 preset patch universe가 연결될 때만 resolution 권한을 준다.
- 향후 layout binding이 별도 저장소에서 Rail을 참조하면 aggregate usage universe에 포함하기 전 삭제 UI를 노출하지 않는다.
- 저장 envelope에는 파생 좌표, InkRegion, Boolean 결과, SVG path, provenance를 넣지 않는다.
- 기존 `font-maker-grid-system-2-lab-v1` 데이터는 새 source로 자동 변환하거나 삭제하지 않는다.
- pointercancel rollback과 기존 제품 철학의 commit 의미 충돌은 UI 단계 전 결정이 필요하다.
- 이 단계는 화면 변경이 없으므로 새 그리드 편집 기능은 아직 앱 UI에서 확인할 수 없다.

## 중단 조건

- 저장 round-trip 뒤 source JSON이나 안정 ID가 달라짐
- hydration이 parser를 우회하거나 미래 필드를 조용히 제거함
- preset coverage 없이 결과를 성공으로 해석함
- store action 하나가 transaction을 두 개 이상 만들거나 부분 source를 남김
- variant·layout 사용처를 누락한 상태에서 Rail·참조·요소 삭제가 성공함
- 기존 SVG·OTF 기준값이 변함
