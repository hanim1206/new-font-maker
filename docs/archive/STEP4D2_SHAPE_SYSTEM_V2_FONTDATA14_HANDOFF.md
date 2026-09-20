# Step 4D-2 Shape System V2 · FontData 1.4 handoff

## 완료 범위

- `ShapeSystemSourceV2`가 정확히 7개 역할 construction과 선택적 `layoutGridSystem`, 선택적 `contextPresetCatalog`를 함께 소유한다.
- V2 parser가 역할·layout·catalog 전체 ID universe, preset role/context link, preset을 적용한 파생 grid의 순환·축·간격을 strict하게 교차검증한다.
- V1→V2 migration은 layout과 catalog를 `null`로 둔다. legacy 숫자나 Grid Lab source에서 자동 seed하지 않는다.
- `FontData` writer를 1.4로 올리고 1.2/1.3을 strict parse 후 1.4로 migration한다.
- collect/apply가 full V2 source를 JSON round-trip하며 history와 파생 결과는 저장하지 않는다.
- layout·jamo·Shape의 debounced storage에 명시적 flush를 추가했다. FontData apply는 flush 실패를 성공으로 보고하지 않고 모든 store와 history를 복원한다.
- Shape store의 version 1 손상 원본은 hydration 과정에서 canonical null로 덮어쓰지 않는다.
- catalog-linked variant가 있는 V2에서도 set/remove command가 catalog coverage를 유지하며 Undo/Redo·persist/reload된다.
- 사용자 명시 동작으로만 실행되는 최소 starter factory를 추가했다. 7개 역할 grid와 STANDALONE·CH `ㄱ` 마스터만 만들며 layout grid는 만들지 않는다.

## 주요 변경 파일

- `src/types/database.ts`
- `src/types/index.ts`
- `src/services/shapeSystemSourceV2.ts`
- `src/services/shapeSystemSourceV2.test.ts`
- `src/services/fontDataMigration.ts`
- `src/services/fontDataPayloadValidation.ts`
- `src/services/fontDataBridge.ts`
- `src/services/defaultShapeSystemV2.ts`
- `src/services/defaultShapeSystemV2.test.ts`
- `src/stores/shapeSystemStore.ts`
- `src/stores/shapeSystemStore.test.ts`
- `src/stores/layoutStore.ts`
- `src/stores/jamoStore.ts`
- `src/utils/debouncedStorage.ts`
- `src-next/font-data-roundtrip.test.ts`
- `tests/fixtures/shapeSystemV2.ts`
- `supabase/migrations/20260824043000_protect_font_data_version.sql`

## 검증 결과

- 전체 Vitest: 64 files / 647 tests 통과.
- `npx tsc -b --pretty false` 통과.
- 관련 파일 ESLint 통과.
- `npm run build` 통과.
- 실제 기존 OTF 다운로드 baseline 2/2 통과.
- 전체 `npm run lint`는 이번 변경과 무관한 기존 root 및 `.claude/worktrees` 오류를 합쳐 11 errors / 18 warnings 상태다.

## 다음 단계 주의점

- Supabase downgrade trigger SQL은 저장소에만 있다. FontData 1.4 writer를 배포하기 전에 실제 대상 DB에 선배포하고 1.4→1.3 거부, Shape 제거 거부, name-only update 허용을 실제 row로 확인해야 한다.
- 같은 1.4 writer끼리의 lost update를 막는 revision CAS는 아직 없다.
- starter는 전체 새 프로젝트 initializer가 아니다. 공통 layout grid와 67개 자소를 임의 생성하는 데 재사용하지 않는다.
- 일반 OTF 다운로드는 아직 Shape source를 자동 선택하지 않는다. explicit final-region prototype과 기존 legacy OTF 경로를 섞지 않는다.
- Shape history와 기존 layout/jamo/editor history의 전역 시간순 coordinator는 아직 없다.
