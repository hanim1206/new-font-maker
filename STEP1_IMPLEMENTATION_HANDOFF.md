# Step 1 구현 최종 인계

> 기준일: 2026-08-24
> 상태: Step 1의 기준값 고정, 비파괴 migration, 단일 원본 contraction, 출력 계약까지 구현 완료
> 다음 작업: Implementation Plan Step 2만 진행. Step 4 이후 UI는 시작하지 않는다.

## 먼저 알아야 할 결론

레이아웃 사용자 보정의 canonical 원본은 이제 `layoutStore.layoutSchemas[*].userPartOverrides` 하나다. Calibration, 분석 snapshot, FontData, SVG와 OTF는 이 값을 읽는다. 과거 Calibration의 `layoutProfile`은 startup migration의 legacy 입력으로만 취급하고 새 상태에는 저장하지 않는다.

fresh state에는 승인된 hybrid 정책을 적용한다.

1. canonical layout 저장소가 없고 legacy Calibration profile이 있으면 legacy profile 전체를 기본 schema에 적용한다.
2. 두 저장소가 모두 없으면 `LEGACY_CALIBRATION_LAYOUT_PROFILE_V1`을 canonical 기본 schema에 seed한다.
3. canonical 저장소가 이미 있으면 legacy 중 preset과 다른 사용자 후보만, 해당 canonical `userPartOverrides`가 비어 있을 때 이관한다.
4. canonical 저장소가 있고 legacy가 exact preset seed이면 canonical raw를 byte 단위로 바꾸지 않고 legacy `layoutProfile`만 제거한다.
5. 양쪽 값이 다르거나 입력이 손상되면 어느 쪽도 자동 선택하지 않는다. 원본 backup만 남기고 앱 진입을 차단한다.

이 문서가 현재 최종 상태다. [`STEP1_EXPAND_CHECKPOINT.md`](STEP1_EXPAND_CHECKPOINT.md)는 startup write와 contraction 전의 역사적 체크포인트이므로 수정하지 않았으며, 현재 구현 상태 판단에는 이 문서를 우선한다.

## 1. 구현된 계약

### 1.1 Startup backup, journal, blocked 경로

앱 시작 순서는 `bootstrap migration → 성공 확인 → dynamic App import → Zustand store hydration`이다. `src-next/main.tsx`는 `App`을 정적으로 import하지 않는다.

사용 키는 다음과 같다.

| 역할 | localStorage key |
|---|---|
| canonical layout | `font-maker-layout-schemas` |
| legacy Calibration | `font-maker-calibration-project` |
| 원본 backup | `font-maker-layout-profile-migration-v1-backup` |
| prepared/complete journal | `font-maker-layout-profile-migration-v1-journal` |

쓰기 순서는 고정되어 있다.

```text
두 raw 문자열을 exact backup
→ prepared journal
→ canonical write 및 read-back 검증
→ Calibration envelope에서 layoutProfile만 제거
→ complete marker
```

- 기존 backup은 덮어쓰지 않는다.
- canonical envelope의 `version`, 알 수 없는 필드와 각 schema의 `slots`, `splits`, `partOverrides`는 보존한다.
- Calibration에서는 `layoutProfile`만 제거하고 font space, grid, design body, metrics, sample edit와 알 수 없는 보존 대상 필드는 유지한다.
- 각 write 단계에서 실패해도 prepared 상태와 backup raw로 재시작하여 이미 끝난 write를 검증하고 이어서 완료한다.
- backup 자체가 실패하거나 quota write가 검증되지 않으면 canonical write를 시작하지 않는다.
- `conflict`, `invalid`, `backup-stale`은 원본을 자동 수정하지 않고 `blocked`를 반환한다.
- blocked이면 `App`과 store를 import하지 않고 `role="alert"` 진단 화면을 표시한다. 복구 원본 key도 화면에 안내한다.
- complete marker 뒤에는 project/FontData가 다른 canonical 값을 load해도 migration을 다시 적용하지 않는다.

순수 판정기는 10개 `LayoutType`을 `preset-seed`, `user-candidate`, `canonical-only`, `equal`, `conflict`, `invalid`로 분류한다. 알려진 `Part`와 `top/bottom/left/right` 유한수만 허용하며, raw payload를 변경하지 않고 canonical serialization 기반 fingerprint를 만든다.

### 1.2 Canonical single source contraction

- `calibrationProjectStore`에서 `layoutProfile`과 `setLayoutProfile`을 제거했다.
- Calibration persistence는 허용 필드만 hydrate·persist하는 whitelist merge를 사용한다. legacy `layoutProfile`이나 알 수 없는 필드는 store 상태로 되살아나지 않는다.
- Calibration 레이아웃 commit, Undo, Redo는 `layoutStore.setUserPartOverrides()`를 사용한다.
- `setUserPartOverrides()`는 입력을 deep clone하고, 빈 값은 필드 삭제로 정규화하며, 대상 파생 config를 즉시 다시 계산한다.
- 한 레이아웃 제스처는 canonical 저장 한 번으로 기록되고 Undo/Redo/reload 뒤 같은 값을 복원한다.
- 분석 snapshot은 canonical schemas의 `userPartOverrides`를 복제해 사용한다.
- `LEGACY_CALIBRATION_LAYOUT_PROFILE_V1`은 `src/data/legacyCalibrationLayoutProfileV1.ts`에 격리했다. 이는 migration 및 기준 fixture용 호환 데이터이지 두 번째 live store가 아니다.
- `src-next/userPreset01.ts`는 자모 preset 역할만 남긴다.

### 1.3 FontData와 프로젝트 round-trip

- FontData version은 `1.2.0`이다.
- `collectFontData()`와 `applyFontData()`는 `layoutSchemas[*].userPartOverrides`를 포함해 exact round-trip한다.
- 프로젝트 A 다음 B를 load할 때 A의 sparse override가 B에 잔류하지 않는다.
- 파생값인 `layoutConfigs`는 FontData와 직렬화 JSON에 포함하지 않는다.
- startup migration complete 이후 project load 값을 legacy seed가 다시 덮지 않는다.

### 1.4 SVG·OTF 출력 계약

- OTF public API의 별도 `layoutProfile` option/argument를 제거했다.
- `collectGlyphDataForChar(char)`와 전체 폰트 생성은 최신 canonical `layoutStore` revision만 읽는다.
- 화면과 OTF는 같은 canonical `LayoutSchema` revision을 읽고, `calculateBoxes()`와 문맥 안전 보정의 동일 계약을 따른다. 다만 화면·OTF resolver 구현의 물리적 중복은 남아 있으므로 Step 2에서 단일 resolver로 수렴해야 한다.
- public override 제거 뒤 실제 UI 다운로드 OTF를 parse한 fixture는 변경되지 않았다.
- fresh OTF E2E는 첫 navigation 전에 `page.addInitScript(() => localStorage.clear())`를 설치한다. 과거 `goto → clear → reload`는 첫 문서의 debounced persist/beforeunload flush와 새 bootstrap seed가 경합할 수 있어 제거했다.
- 다운로드 전에 canonical localStorage의 6개 대표 조합 `userPartOverrides`가 `LEGACY_CALIBRATION_LAYOUT_PROFILE_V1`과 exact 일치하는지 확인한다.

### 1.5 Legacy mode rename

- 과거 중심선 렌더 mode의 canonical 이름은 `legacy-snapped-centerline`이다.
- 구형 입력 `grid-system-2`는 localStorage hydration, FontData load와 unknown style 입력에서 읽기 전용 alias로 허용한다.
- 새 저장과 FontData 출력에는 canonical 이름만 쓴다.
- 25-unit snap, 75-unit stroke, 35° cut geometry는 바꾸지 않았다.
- `/grid-lab`의 `font-maker-grid-system-2-lab-v1` 프로젝트와 점유 면 데이터는 별도 실험이며 이 rename 대상이 아니다.

## 2. 고정한 회귀 기준

| 기준 | 파일 | 범위 |
|---|---|---|
| 레이아웃 좌표 | `src-next/fixtures/legacy-layout-boxes-v1.json` | `ㄱ, ㅏ, ㅗ, ㅘ, 가, 고, 과, 각, 곡, 곽`의 base/canonical 및 legacy Calibration 결과 |
| SVG 중심선 | `src-next/fixtures/legacy-svg-centerlines-v1.json` | 대표 글리프의 semantic 중심선 좌표 |
| 실제 OTF | `tests/fixtures/legacy-otf-glyphs-v1.json` | 실제 다운로드한 OTF의 메트릭, bbox와 path command |

OTF 대표 집합은 `ㄱ, 가, 고, 과, 각, 곡, 곽, ㅇ, ㅁ, ㅂ, ㅎ, ㅙ`이다. `ㅇ`의 hole, 닫힌 글자와 교차부의 Boolean 결과도 기존 contour 회귀 테스트가 계속 보호한다.

fixture는 승인된 시각 기준이다. Step 2 구현 편의를 위해 재생성하지 않는다. 차이가 생기면 원인을 먼저 보고하고 시각 기준 변경 승인을 받는다.

## 3. 변경된 파일

### 루트 문서와 명령

- `COMMON_GRID_HYBRID_IMPLEMENTATION_PLAN.md`
- `KOREAN_FONT_MAKER_UX_SCREEN_SPEC.md`
- `STEP1_EXECUTION_BRIEF.md`
- `STEP1_EXPAND_CHECKPOINT.md` — 역사적 체크포인트, 이번 최종 인계에서 수정하지 않음
- `STEP1_IMPLEMENTATION_HANDOFF.md`
- `package.json` — `npm test`가 `src`와 `src-next`를 모두 실행

### Production 및 상태 계약

- `src/data/legacyCalibrationLayoutProfileV1.ts`
- `src/services/legacyLayoutProfileMigration.ts`
- `src/services/layoutProfileMigrationBootstrap.ts`
- `src/stores/layoutStore.ts`
- `src/stores/globalStyleStore.ts`
- `src/services/strokeRenderGeometry.ts`
- `src/services/fontExportUtils.ts`
- `src/services/fontGenerator.ts`
- `src/types/index.ts`
- `src-next/main.tsx`
- `src-next/calibrationProjectStore.ts`
- `src-next/calibrationAnalysisSnapshot.ts`
- `src-next/CalibrationSentenceEditor.tsx`
- `src-next/BrushStyleTrackpad.tsx`
- `src-next/userPreset01.ts`

### Unit·contract 테스트와 fixture

- `src-next/layout-coordinate-baseline.test.ts`
- `src-next/fixtures/legacy-layout-boxes-v1.json`
- `src-next/svg-legacy-baseline.test.ts`
- `src-next/fixtures/legacy-svg-centerlines-v1.json`
- `src-next/layout-profile-migration.test.ts`
- `src-next/layout-profile-migration-bootstrap.test.ts`
- `src-next/layout-user-overrides-store.test.ts`
- `src-next/calibration-project-persistence.test.ts`
- `src-next/calibration-analysis-snapshot.test.ts`
- `src-next/font-data-roundtrip.test.ts`
- `src-next/font-export-contract.test.ts`
- `src-next/legacy-snapped-centerline-compat.test.ts`
- `src-next/closed-bottom-medial.test.ts`
- `src-next/otf-contour-union.test.ts`
- `src-next/user-preset-01.test.ts`

### Playwright와 actual-download fixture

- `tests/e2e/otf-legacy-baseline.spec.ts`
- `tests/fixtures/legacy-otf-glyphs-v1.json`
- `tests/e2e/calibration-layout-persistence.spec.ts`
- `tests/e2e/area-stroke-style.spec.ts`

관련 없는 기존 변경은 건드리지 않는 원칙을 유지했다.

## 4. 최종 검증 상태

| 명령·검증 | 결과 |
|---|---|
| `npm run build` | **PASS** |
| `npm test` | **PASS · 39 files / 187 tests** |
| 관련 targeted Playwright | **PASS · 12/12** |
| 전체 Playwright | **24 PASS / 기존 11 FAIL** |
| `npm run lint` | 기존 **11 errors / 18 warnings** |

빌드는 기존 Browserslist 갱신 안내와 `fontExportUtils` static/dynamic 중복 import 경고를 남기지만 완료된다.

전체 Playwright의 11개 실패는 기존 `mobile-editor-v2.spec.ts`, `mobile-editor-v2-contexts.spec.ts`에 모여 있다. 현재 `/editor-v2`가 Calibration 화면으로 연결되어 locator가 존재하지 않는 기존 라우팅 문제다. Step 1 변경으로 추가된 회귀 실패로 판정하지 않았지만, 전체 gate를 green으로 부를 수는 없다.

lint의 11 errors / 18 warnings도 이번 범위 밖의 기존 부채다. 다음 단계는 이 숫자를 baseline으로 비교하고 새 오류를 추가하지 않아야 한다.

## 5. Step 2 시작 전 주의점과 중단 조건

### 5.1 `pointercancel` 계약 충돌

Implementation Plan과 UX 명세는 `pointerup`만 commit하고 `pointercancel`은 draft를 롤백한다고 명시한다. 그러나 현재 `CalibrationSentenceEditor.tsx`의 unified trackpad 연결은 `commitOnCancel: true`다.

사용자가 승인한 목표 동작은 rollback이다. Step 2에서는 새 Rail/셀/참조 편집 gesture에 `commitOnCancel: true`를 복제하지 않는다. 실제 Calibration 변경은 해당 UI 단계에서 테스트와 함께 적용하고, 반대 내용을 담은 `docs/PRODUCT_PHILOSOPHY.md`도 같은 변경에서 갱신한다.

### 5.2 Conflict와 `backup-stale` 복구 경로 부재

migration은 안전하게 차단하고 backup key를 안내하지만, 사용자가 conflict를 비교하거나 `backup-stale`을 해소하는 명시적 복구 command/UI는 아직 없다.

- backup과 journal을 자동 삭제하지 않는다.
- stale backup을 새 raw로 덮어쓰지 않는다.
- canonical/legacy 중 하나를 임의 승자로 선택하지 않는다.
- 복구 절차가 승인되기 전에는 blocked 상태를 우회하지 않는다.

### 5.3 Full gate의 known failures

- 전체 E2E 11개와 lint 11 errors / 18 warnings는 알려진 baseline이다.
- Step 2 변경 뒤 targeted gate가 통과해도 전체 결과가 `24 PASS / 11 FAIL`보다 악화되면 중단한다.
- 기존 실패 파일을 Step 2 기능 구현과 섞어 고치지 않는다. 별도 승인 범위로 분리한다.

### 5.4 Step 4 이후 UI 금지

Step 2에서는 승인된 데이터 계약과 resolver 기반만 구현한다. 공통 모바일 셸, 7개 비교 strip, drawer, Rail 직접 조작, 자소 목록과 상태 표시 등 Step 4 이후 UI를 미리 추가하지 않는다.

또한 다음을 유지한다.

- `layoutGrid`와 `partGrids`를 같은 원본 배열로 합치지 않는다.
- 원본과 파생값을 분리한다.
- 안정 Rail ID와 provenance를 배열 인덱스로 대체하지 않는다.
- legacy 선 전용 SVG/OTF fixture와 old/new mode alias를 유지한다.
- 한 단계가 끝날 때마다 변경 파일, 실행한 테스트, 다음 주의점을 남긴다.

## 6. 다음 모델의 시작 순서

1. 이 문서, `COMMON_GRID_HYBRID_IMPLEMENTATION_PLAN.md`, `docs/PRODUCT_PHILOSOPHY.md`를 다시 읽는다. 공통 그리드의 시각적 의미는 Obsidian `이미지 래퍼런스 캔버스.canvas`의 연결된 이미지를 함께 확인한다.
2. `git status --short`로 위 변경과 다른 사용자 변경을 구분한다.
3. `pointercancel`의 승인 목표가 rollback임을 유지하고 Step 2의 정확한 하위 범위를 확인한다.
4. Step 2 타입·resolver의 첫 수직 조각만 구현한다.
5. 해당 unit/contract 테스트를 먼저 통과시킨다.
6. `npm run build`, `npm test`, targeted Playwright를 실행한다.
7. 전체 Playwright와 lint는 위 baseline보다 악화되지 않았는지 비교한다.

Step 2 완료 인계에도 반드시 아래 세 항목을 남긴다.

- 변경된 파일 목록
- 실행한 테스트와 정확한 결과
- 다음 단계에서 주의할 문제와 중단 조건
