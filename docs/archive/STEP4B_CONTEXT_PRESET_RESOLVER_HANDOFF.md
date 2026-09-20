# Step 4B — 문맥 프리셋·자소 보정 해석 인계

## 이번 조각에서 완료한 범위

- 자소 형태 규칙의 상속 순서를 `마스터 → 역할 기본값 → 문맥 프리셋 → 자소별 보정`으로 고정했다.
- 역할 기본값과 문맥 프리셋은 코어 Rail 위치만 sparse patch로 소유하고, 자소별 보정만 기존 auxiliary Rail·reference override·cell retile을 유지한다.
- 같은 문맥 후보는 특징 태그 수를 먼저 비교하고, 동률이면 `medialClass → finalWidthClass → initialClass` 순서로 결정한다.
- 배열 순서나 ID 문자열을 선택 의미로 사용하지 않는다.
- 자소 variant의 명시 `presetId`는 catalog에 실제 patch가 있고 role·문맥이 맞을 때만 자동 선택을 대신한다.
- 값이 상위 계층과 같아도 명시된 sparse patch가 live ownership과 provenance를 가진다.
- 최종 Rail과 reference마다 `master | role-default | context-preset | jamo-override` 출처를 파생해 반환한다.
- STANDALONE/CH/JU_VERTICAL/JU_HORIZONTAL/JU_H/JU_V/JO의 역할·문맥 허용 행렬을 한 공용 모듈로 고정했다.
- catalog뿐 아니라 저장된 모든 master의 선택되지 않은 variant와 preset link도 같은 역할·문맥 계약으로 검증한다.
- inherited property를 이용한 variant, auxiliary Rail, reference override/address 입력을 파생 처리 전에 fail-closed한다.
- 기존 `resolveExactJamoContextVariant()`를 재사용해 auxiliary split, point rebind, cell retile 의미를 복제하지 않았다.

## 의도적으로 하지 않은 것

- catalog를 Shape store, FontData, UI에 저장하거나 연결하지 않는다.
- layout grid, slot projection, 최종 글자 조합 선택을 이 resolver에서 수행하지 않는다.
- role/context preset에 master별 reference 주소나 auxiliary Rail을 허용하지 않는다.
- provenance나 resolved grid/master를 원본 source에 저장하지 않는다.
- 기존 no-catalog exact resolver의 preset fail-closed 계약을 완화하지 않는다.

## 핵심 파일

- `src/types/index.ts`
- `src/services/jamoContextRoles.ts`
- `src/services/contextGridPresetCatalogV1.ts`
- `src/services/contextGridPresetCatalogV1.test.ts`
- `src/services/contextPartGridResolver.ts`
- `src/services/contextPartGridResolver.test.ts`
- `src/services/jamoContextVariants.ts`
- `src/services/shapeSystemSourceV1.ts`
- `docs/PRODUCT_PHILOSOPHY.md`

## 검증

- Step 4B 관련 targeted: 5 files / 106 tests pass
- 전체 unit: 60 files / 545 tests pass
- TypeScript, 대상 ESLint, production build, diff check pass
- 실행 의미·저장 경계·회귀 강도 독립 감사에서 P0/P1 없음
- 기존 build 안내만 유지: Browserslist 데이터와 `fontExportUtils` chunk 안내

## 다음 저장·연결 조각의 필수 게이트

- catalog는 기존 Shape V1/FontData 1.3에 추가하지 않고 ShapeSystem V2 + FontData 1.4에서만 저장한다.
- Shape V2 parser가 roleSources와 catalog를 함께 교차검증하고, layout/role grid·Rail·master·preset ID 전체 universe 충돌을 막아야 한다.
- V1 → V2 migration은 catalog와 layoutSystem을 자동 추측·seed하지 않고 명시적 unbound 상태로 둔다.
- context resolver 결과와 provenance는 비영속 파생값으로 유지한다.
- UI에서 `기본값`, `문맥 프리셋`, `이 자소 보정`을 표시할 때 이 resolver가 반환한 provenance만 사용한다.
- 전체 글자·OTF 연결 전에는 role/master/context/slot 선택을 호출자가 명시하고, 선택 실패 시 legacy 결과로 조용히 대체하지 않는다.
