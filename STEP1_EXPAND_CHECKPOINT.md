# Step 1 expand 체크포인트

> 상태: expand·회귀 기준 검증 완료 · 단일 원본 contraction 보류
> 작성일: 2026-08-23
> 다음 모델: GPT-5.6 Sol · high

## 이번 체크포인트의 범위

Implementation Plan Step 1 가운데 기준값 고정과 비파괴 expand 작업만 완료했다.

- 기존 `layoutStore`와 Calibration `USER_PRESET_01`의 서로 다른 fresh-state 결과를 모두 fixture로 고정했다.
- 실제 UI에서 다운로드한 OTF를 다시 parse해 대표 글리프 geometry와 metrics를 고정했다.
- legacy `layoutProfile`과 canonical `layoutSchemas[*].userPartOverrides`를 검사하는 pure migration 분석기를 추가했다.
- canonical 사용자 보정을 원자적으로 교체하는 `layoutStore.setUserPartOverrides()`를 추가했다.
- 기존 중심선 렌더 mode의 canonical 이름을 `legacy-snapped-centerline`으로 바꾸고 구형 `grid-system-2` 입력 호환을 유지했다.
- FontData `1.2.0`에서 `userPartOverrides` round-trip과 프로젝트 간 잔류 방지를 고정했다.

아직 하지 않은 작업:

- localStorage backup·marker와 startup migration write 연결.
- `calibrationProjectStore.layoutProfile` 제거.
- Calibration commit·Undo·Redo를 `layoutStore`로 전환.
- OTF의 별도 `layoutProfile` 인자 제거.
- Implementation Plan Step 2 이후 resolver·Rail·Ink·Boolean·UI 작업.

## 변경된 파일

### 저장소 루트 문서

- `COMMON_GRID_HYBRID_IMPLEMENTATION_PLAN.md`
- `KOREAN_FONT_MAKER_UX_SCREEN_SPEC.md`
- `STEP1_EXECUTION_BRIEF.md`
- `STEP1_EXPAND_CHECKPOINT.md`

### production expand·호환 변경

- `package.json`
  - `npm test` 범위를 `src`와 `src-next` 전체로 확장.
- `src/services/legacyLayoutProfileMigration.ts`
  - raw Zustand payload 검증, per-layout 판정, canonical serialization과 fingerprint.
- `src/stores/layoutStore.ts`
  - `setUserPartOverrides()` 원자 action 추가.
- `src/types/index.ts`
  - canonical legacy mode 타입을 `legacy-snapped-centerline`으로 명명.
- `src/stores/globalStyleStore.ts`
  - old/new mode를 같은 canonical 값으로 normalize.
- `src/services/strokeRenderGeometry.ts`
  - canonical mode가 기존 Grid 2 geometry를 그대로 사용.
- `src-next/BrushStyleTrackpad.tsx`
  - legacy 중심선 렌더와 형태 그리드 Grid Lab의 UI 용어 분리.
- `src-next/CalibrationSentenceEditor.tsx`
  - construction grid DOM marker를 canonical mode 이름으로 변경.

### 신규·수정 테스트와 fixture

- `src-next/layout-coordinate-baseline.test.ts`
- `src-next/fixtures/legacy-layout-boxes-v1.json`
- `src-next/svg-legacy-baseline.test.ts`
- `src-next/fixtures/legacy-svg-centerlines-v1.json`
- `tests/e2e/otf-legacy-baseline.spec.ts`
- `tests/fixtures/legacy-otf-glyphs-v1.json`
- `src-next/layout-profile-migration.test.ts`
- `src-next/layout-user-overrides-store.test.ts`
- `src-next/font-data-roundtrip.test.ts`
- `src-next/legacy-snapped-centerline-compat.test.ts`
- `src-next/font-export-contract.test.ts`
- `tests/e2e/area-stroke-style.spec.ts`

## 실행한 검증

| 검증 | 결과 |
|---|---|
| `npm test` | 통과 · 37 files / 171 tests |
| `npm run build` | 통과 · 기존 Browserslist, import, chunk 경고만 유지 |
| 신규·변경 파일 targeted ESLint | 통과 |
| 관련 Playwright: OTF baseline + legacy mode + Grid Lab | 통과 · 10/10 |
| 전체 `npm run test:e2e -- --workers=1` | 23 통과 / 기존 11 실패 |
| `npm run lint` | 기존과 동일한 11 errors / 18 warnings |

전체 Playwright 실패 11개는 모두 기존 `mobile-editor-v2.spec.ts`와 `mobile-editor-v2-contexts.spec.ts`다. 현재 `src-next/App.tsx`가 `/editor-v2`를 Calibration 화면으로 보내는 기존 라우팅 때문에 locator가 존재하지 않는다. 이번 변경으로 새 실패는 생기지 않았다.

## 다음 단계에서 주의할 문제

### 1. canonical 시각 기준 선택

현재 두 fresh-state 결과는 동시에 보존할 수 없다.

- `layoutStore` 기준을 유지하면 기존 10개 base layout 좌표와 프로젝트·모바일·Supabase 계약은 유지되지만 fresh Calibration과 현재 UI OTF가 바뀐다.
- Calibration `USER_PRESET_01` 기준을 canonical seed로 삼으면 현재 기본 진입 화면과 UI OTF는 유지되지만 일반·모바일·기본 OTF의 base layout 좌표가 바뀐다.

선택 전에는 fixture를 갱신하거나 `layoutProfile`을 제거하지 않는다.

### 2. migration write 안전 조건

- `plan.canApply === false`이면 후보가 있어도 어떤 canonical write도 하지 않는다.
- divergent 값은 field merge하거나 임의 precedence를 적용하지 않는다.
- 두 raw payload backup이 성공한 뒤에만 canonical write를 시도한다.
- canonical write와 legacy profile 제거가 모두 검증된 뒤 마지막으로 marker를 기록한다.
- marker 전 실패는 다음 실행에서 동일 결과로 재시도 가능해야 한다.
- legacy key와 backup은 Step 1에서 삭제하지 않는다.

### 3. 다음 진입 조건

다음 Sol 모델은 먼저 canonical 시각 기준 승인을 확인한다. 승인 뒤에도 다음 순서를 지킨다.

1. startup 전 backup·migration write와 crash retry 테스트.
2. targeted test와 저장 round-trip 검증.
3. Calibration read/write/Undo/Redo를 canonical action으로 전환.
4. targeted test와 실제 OTF baseline 검증.
5. 별도 OTF `layoutProfile` 전달 경로 제거.
6. 전체 build, lint, Vitest, 관련 Playwright, 전체 Playwright 실행.

기존 lint와 `/editor-v2` 실패를 별도 범위에서 해결하거나 완료 기준 변경이 승인되기 전에는 Step 1 최종 완료와 Implementation Plan Step 2 진입을 선언하지 않는다.
