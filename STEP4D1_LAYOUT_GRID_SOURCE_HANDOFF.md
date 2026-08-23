# Step 4D-1 공통 레이아웃 그리드 저장 원본 handoff

## 완료 범위

- `layoutGrid` 저장 원본을 `absolute | between` Rail 위치식과 정확히 7개인 binding으로 정의했다.
- 해석 좌표, 안정 split, 계산된 schema와 box는 저장 원본에 넣지 않고 parse/projection 결과로만 반환한다.
- 공통 7종 topology의 split·외곽·행·열 경계를 한 의미 계약으로 분리했다.
- strict parser가 own/exact 필드, Rail 축·순서·간격·참조·순환, binding coverage·소유권·edge 동치, 전체 layout ID 충돌을 fail-closed한다.
- `between` 의존성은 재귀가 아닌 선형 queue로 해석한다. 1,000단계 forward chain에서도 stack overflow가 없다.
- 기존 `BASE_PRESETS_SCHEMAS` 10종을 test-only 명시 연결본으로 parse→projection했을 때 schema와 좌표가 exact 유지된다. 이 fixture는 production initializer가 아니다.

## 변경 파일

- `src/types/index.ts`
- `src/services/layoutGridTopology.ts`
- `src/services/layoutGridProjection.ts`
- `src/services/layoutGridProjection.test.ts`
- `src/services/layoutGridSystemSourceV1.ts`
- `src/services/layoutGridSystemSourceV1.test.ts`
- `docs/PRODUCT_PHILOSOPHY.md`

## 검증 결과

- targeted Vitest: 2 files / 57 tests 통과
- 전체 Vitest: 62 files / 621 tests 통과
- `npx tsc -b --pretty false` 통과
- 대상 ESLint 통과
- `git diff --check` 통과
- `npm run build` 통과
- 전체 `npm run lint`는 이번 변경과 무관한 기존 root 4건과 `.claude/worktrees` 복제본 오류를 포함해 11 errors / 18 warnings 상태다.

## 독립 검토

- 구조 검토: P0/P1 없음
- 저장·migration 검토: P0/P1 없음
- 회귀 검토에서 요청한 equality manifest와 minGap epsilon 정책값 고정까지 보강했다.

## 다음 단계 주의점

- 다음 저장 경계는 `ShapeSystemSourceV2`와 `FontData 1.4`를 함께 올린다. V1/1.3 envelope에 필드를 끼워 넣지 않는다.
- V1→V2 migration은 `layoutGridSystem: null`, `contextPresetCatalog: null`로만 올리고 legacy 숫자에서 자동 seed하지 않는다.
- V2 parser는 layout grid/grid Rail/binding/split ID와 7 role grid/Rail/master/element/reference/variant/preset catalog ID를 하나의 전역 universe에서 교차검증한다.
- 저장에는 raw source만 포함하고 `resolvedGrid`, `stableSplits`, resolved schema/box, provenance, history는 제외한다.
- FontData 1.4 writer보다 Supabase semver downgrade guard를 먼저 실제 DB에 배포·검증해야 한다.
- test-only `legacyBaselineSource()`를 fresh project initializer나 migration으로 재사용하면 안 된다.
