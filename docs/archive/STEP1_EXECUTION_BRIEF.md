# Step 1 실행 브리프 — 레이아웃 단일 원본과 Grid 2 용어 정리

> 상태: 구현 전 검토 완료 · 기준값 선택 승인 필요
> 범위: `COMMON_GRID_HYBRID_IMPLEMENTATION_PLAN.md`의 Step 1만 대상
> 작성일: 2026-08-23
> 구현 상태: 소스 코드 미수정

## 결론과 선행 결정

Step 1의 방향은 저장소 구조와 맞다. 현재 레이아웃에는 실제로 두 원본이 있다.

- 일반·모바일 화면, 프로젝트 저장, Supabase, 기본 OTF는 `layoutStore.layoutSchemas[*].userPartOverrides`를 원본으로 사용한다.
- 현재 기본 진입 화면인 `CalibrationSentenceEditor`는 별도 localStorage의 `calibrationProjectStore.layoutProfile`을 우선 사용하고, 이 값을 별도 인자로 넘긴 OTF만 같은 결과를 낸다.

다만 구현 전에 반드시 하나를 승인해야 한다. fresh state의 `calibrationProjectStore.layoutProfile`에는 `USER_PRESET_01_LAYOUT_PROFILE`이 자동 주입되지만 `layoutStore`의 `basePresets`에는 같은 `userPartOverrides`가 없다. 따라서 다음 두 결과를 동시에 완전 보존할 수 없다.

1. `USER_PRESET_01_LAYOUT_PROFILE`을 `layoutStore`에 seed하면 기존 일반·모바일 화면과 기본 OTF 좌표가 바뀐다.
2. seed하지 않으면 기존 Calibration 화면과 Calibration 화면에서 추출한 OTF의 fresh-state 결과가 바뀐다.

권장안은 **프로젝트 단위로 저장되고 모바일·FontData·Supabase가 이미 사용하는 `layoutStore`를 기준으로 보존하는 것**이다.

- `USER_PRESET_01_LAYOUT_PROFILE`의 자동 초기값은 사용자 편집으로 보지 않으며 canonical `layoutStore`에 seed하지 않는다.
- legacy Calibration 프로필 중 preset과 다른 레이아웃만 사용자 편집 후보로 본다. `sampleGlyphEdits`의 `layout-profile` 기록은 보조 증거로 사용하되, 100개 제한·Undo 삭제 때문에 단독 판정 근거로 쓰지 않는다.
- canonical `layoutStore`에 해당 레이아웃의 `userPartOverrides`가 없을 때만 검증된 사용자 편집 후보를 이관한다.
- 양쪽에 서로 다른 값이 있으면 자동 병합하거나 임의의 승자를 고르지 않는다. 두 raw payload를 백업하고 해당 migration을 `conflict`로 중단한 뒤, 어느 결과를 보존할지 명시적으로 선택한다.
- 사용자가 명시적으로 불러온 FontData/Supabase 프로젝트는 브라우저의 legacy Calibration 값보다 항상 우선한다.

Calibration fresh-state 외형을 제품 기준으로 삼으려면 반대 결정을 명시적으로 승인해야 한다. 그 경우 `USER_PRESET_01_LAYOUT_PROFILE`을 canonical 초기 스키마에 넣고 일반·모바일·기본 OTF의 새 기준값을 승인해야 한다. **이 선택이 확정되기 전에는 소스 구현 및 Step 2 진입을 중단한다.**

## 1. 현재 저장소 구조와 관련 파일

### 실행 진입점

- 현재 `index.html`은 `src-next/main.tsx`를 로드한다.
- `src-next/App.tsx`는 `/grid-lab`, `/rule-lab`만 별도 분기하고 나머지 경로를 모두 `CalibrationSentenceEditor`로 보낸다.
- `src/App.tsx`의 기존 데스크톱·모바일 앱과 `/editor-v2` 흐름은 현재 HTML 진입점에서 렌더되지 않는다. 현재 Playwright의 mobile-editor-v2 실패를 Step 1 회귀와 구분해야 한다.

### 레이아웃 원본·계산

- `src/types/index.ts`
  - `LayoutSchema.userPartOverrides` 정의.
  - 현재 `StrokeRenderStyle`의 `mode: 'grid-system-2'` 정의.
- `src/stores/layoutStore.ts`
  - canonical 후보인 `layoutSchemas`, 파생 `layoutConfigs`, `globalPadding`, `paddingOverrides` 소유.
  - `font-maker-layout-schemas` localStorage에 `layoutSchemas/globalPadding/paddingOverrides`만 영속화.
  - `replaceLayoutSchema()` 및 `loadFontData()` 뒤 `calculateBoxes()`로 파생 config 재계산.
- `src/utils/layoutCalculator.ts`
  - 적용 순서: raw box와 gap → preset/context `partOverrides` → `userPartOverrides` → 배치 프로필·형태 제한 → Design Body 투영.
  - `userPartOverrides`가 최종 사용자 레이아웃 보정 원본으로 이미 자리 잡고 있다.
- `src/services/layoutProfileCommands.ts`
  - Calibration의 컴포넌트 이동·크기 조절을 `userPartOverrides`가 들어 있는 임시 `LayoutSchema`로 계산.
- `src/services/layoutPartEdgeCommands.ts`
  - 모바일 레이아웃 박스 경계 편집을 `userPartOverrides`로 기록.

### Calibration 별도 원본

- `src-next/calibrationProjectStore.ts`
  - `font-maker-calibration-project` localStorage에 `fontSpace`, `grid`, `designBody`, `metrics`, `layoutProfile`, `sampleGlyphEdits`를 별도 영속화.
  - fresh state에서도 `USER_PRESET_01_LAYOUT_PROFILE`을 복제해 `layoutProfile`에 넣는다.
  - `setLayoutProfile()`은 `layoutStore`를 갱신하지 않는다.
- `src-next/userPreset01.ts`
  - 6개 조합 레이아웃의 Calibration 전용 `USER_PRESET_01_LAYOUT_PROFILE`과 자모 preset을 함께 보유.
- `src-next/CalibrationSentenceEditor.tsx`
  - `withLayoutProfile()`로 `layoutStore` 스키마 위에 Calibration 프로필을 우선 합성.
  - 편집 commit·Undo·Redo는 `calibrationProjectStore.setLayoutProfile()`만 갱신.
  - 문장, 포커스 캔버스, 충돌 검사, 미리보기, 분석 snapshot, OTF 추출이 모두 이 별도 프로필에 의존.
- `src-next/calibrationAnalysisSnapshot.ts`
  - snapshot에 별도 `layoutProfile`을 기록하고 `effectiveLayouts`를 만들 때도 Calibration 값을 우선.

### SVG·OTF와 저장

- `src/renderers/SvgRenderer.tsx`
  - 호출자가 넘긴 `LayoutSchema`를 사용한다. 따라서 일반 화면은 `layoutStore`, Calibration은 별도 프로필을 덧씌운 스키마를 렌더한다.
- `src/services/fontExportUtils.ts`
  - 기본값은 `layoutStore.layoutSchemas`를 읽지만 `FontExportOverrides.layoutProfile`이 있으면 이를 우선한다.
  - `calculateBoxes()` 이후 자모 획·박스·문맥 안전 보정·linecap/linejoin을 OTF용 `GlyphData`로 만든다.
- `src/services/fontGenerator.ts`
  - Calibration에서 받은 `layoutProfile`을 전체 11,172자 수집 경로에 전달한다.
- `src/types/database.ts`
  - 현재 FontData 버전은 `1.2.0`이며 `layoutSchemas` 안의 `userPartOverrides`는 저장하지만 Calibration 프로필은 저장하지 않는다.
- `src/services/fontDataBridge.ts`
  - `collectFontData()`와 `applyFontData()`는 `layoutStore`, `jamoStore`, `globalStyleStore`만 수집·적용한다.
- `src/hooks/useFontProject.ts`, `src/services/fontProjectService.ts`
  - Supabase `font_projects.font_data`에는 FontData만 저장한다. Calibration localStorage는 프로젝트 생성·저장·불러오기에 참여하지 않는다.

### Grid 2의 서로 다른 두 의미

- `src/services/gridSystem2Geometry.ts`와 `src/services/strokeRenderGeometry.ts`의 `grid-system-2`는 중심선을 25 unit에 snap하고 75 unit 폭·35° 절단을 적용하는 **레거시 중심선 렌더 스타일**이다.
- `src-next/GridSystem2LabPage.tsx`와 `src-next/gridSystem2EditorModel.ts`의 `/grid-lab`은 점유 셀·곡률·사선을 `font-maker-grid-system-2-lab-v1`에 저장하는 **별도 UI 실험**이다.
- Step 1에서는 전자의 런타임 이름만 `legacy-snapped-centerline`로 정리한다. `/grid-lab`의 저장 키·v1 모델·곡률·사선 데이터는 수정하거나 자동 import하지 않는다.

## 2. Step 1에서 실제로 수정할 파일

승인된 기준값에 따라 세부 구현은 달라질 수 있지만, 아래가 실제 영향 범위다.

### 반드시 수정

| 파일 | 변경 목적 |
|---|---|
| `src-next/main.tsx` | 두 persist store 모듈이 평가·hydrate되기 전에 동기식 migration을 실행하도록 bootstrap 순서 보장. 필요하면 migration 뒤 `App`을 dynamic import |
| `src-next/calibrationProjectStore.ts` | `layoutProfile`, `setLayoutProfile`, fresh preset 주입 제거. 분석용 font/grid/metrics와 `sampleGlyphEdits`만 유지 |
| `src-next/CalibrationSentenceEditor.tsx` | 모든 확정 레이아웃 읽기·쓰기·Undo/Redo를 `layoutStore.layoutSchemas[*].userPartOverrides`로 수렴. 별도 OTF 인자 제거 |
| `src-next/calibrationAnalysisSnapshot.ts` | 별도 `layoutProfile` 입력·출력을 제거하고 canonical `LayoutSchema`만 기록 |
| `src-next/userPreset01.ts` | 레이아웃 preset을 fresh state 주입에서 분리. 이관 판별용 legacy 상수로 남길지 canonical seed로 옮길지는 선행 승인에 따름 |
| `src/stores/layoutStore.ts` | 사용자 보정 교체 액션, 명시적 migration 적용, 파생 config 동기화와 persist 경계 확정 |
| `src/services/fontExportUtils.ts` | `FontLayoutProfile`, `FontExportOverrides.layoutProfile`, 별도 우선 경로 제거 |
| `src/services/fontGenerator.ts` | `FontGeneratorOptions.layoutProfile`과 전달 경로 제거 |
| `src/services/fontDataBridge.ts` | FontData load/save round-trip에서 canonical schema 및 구형 stroke style parser 적용 확인 |
| `src/types/index.ts` | 레거시 렌더 타입을 `legacy-snapped-centerline` 의미로 변경. Step 2 이상의 Rail/Ink 타입은 추가하지 않음 |
| `src/types/database.ts` | FontData `1.2.0` 구형 입력 호환과 legacy mode 정규화 계약 기록. 구현 플랜이 Step 7에 예약한 `1.3.0`은 Step 1에서 선점하지 않음 |
| `src/stores/globalStyleStore.ts` | 구형 `'grid-system-2'`를 새 `'legacy-snapped-centerline'`로 정규화하는 단일 parser 제공. localStorage hydration과 FontData load가 같은 parser 사용 |
| `src/services/strokeRenderGeometry.ts` | 새 canonical legacy mode 이름으로 기존 geometry 분기 유지 |
| `src-next/BrushStyleTrackpad.tsx` | 기존 렌더 실험을 신규 Grid 2 점유 면과 혼동하지 않는 사용자 레이블·값 사용 |
| `package.json` | `npm test`가 `src-next`뿐 아니라 `src`의 단위 테스트도 포함하도록 범위 수정 |

### 신규 권장

| 파일 | 목적 |
|---|---|
| `src/services/legacyLayoutProfileMigration.ts` | 두 Zustand payload를 안전하게 parse하고, pure merge·충돌 판정·fingerprint를 수행 |
| `src-next/layout-profile-migration.test.ts` | fresh/default, legacy 편집, 충돌, 반복 실행, 손상 payload 테스트 |
| `src-next/layout-coordinate-baseline.test.ts` | 10개 레이아웃 box의 exact 기준 고정 |
| `src-next/svg-legacy-baseline.test.ts` | 기존 선 전용 SVG path·box·attribute의 exact 기준 고정 |
| `src-next/legacy-snapped-centerline.test.ts` | old/new mode의 25/75/35 geometry 동일성 및 저장 round-trip 검증 |
| `tests/e2e/otf-legacy-baseline.spec.ts` | UI에서 실제 다운로드한 OTF를 parse해 glyph geometry·metrics 검증 |
| `src-next/fixtures/legacy-layout-boxes-v1.json` | 10개 layout box와 두 fresh-state 결과를 분리 보존 |
| `src-next/fixtures/legacy-svg-centerlines-v1.json` | 대표 글자의 SVG centerline·attribute 기준 보존 |
| `tests/fixtures/legacy-otf-glyphs-v1.json` | 실제 OTF의 대표 glyph command·bbox·advance 기준 보존 |

Calibration fresh 결과를 canonical로 승인할 때만 `src/data/basePresets.json` 또는 canonical default 조립 파일도 수정한다. 반대로 `layoutStore` 결과를 canonical로 승인하면 이 파일은 바꾸지 않는다. `src/services/gridSystem2Geometry.ts`의 물리적 파일 rename은 의미 수렴에 필수는 아니므로 import churn을 피하고 마지막 mechanical 단계에서 필요할 때만 수행한다.

### 기존 테스트 수정

- `src-next/font-export-contract.test.ts`: 별도 profile override 테스트를 canonical `layoutStore` round-trip과 legacy mode parser 테스트로 교체.
- `src-next/calibration-analysis-snapshot.test.ts`: 별도 `layoutProfile` 제거 반영.
- `src-next/user-preset-01.test.ts`: 레이아웃 preset을 legacy migration fixture로 볼지 canonical 초기값으로 볼지 승인안 반영.
- `src-next/closed-bottom-medial.test.ts`: Calibration 전용 상수 대신 승인된 canonical schema 사용.
- `tests/e2e/layout-preview-propagation.spec.ts`: Calibration 편집 뒤 `font-maker-layout-schemas` 및 재접속 결과 확인 추가.
- `tests/e2e/area-stroke-style.spec.ts`: 구형 저장값은 읽되 새 저장값·DOM 명칭은 `legacy-snapped-centerline`인지 확인.

### Step 1에서 수정하지 않을 파일·범위

- `src-next/GridSystem2LabPage.tsx`, `src-next/gridSystem2EditorModel.ts`, `tests/e2e/grid-system-2-lab.spec.ts`의 점유 면 v1 구조.
- `RailId`, `RailGrid`, `InkRegion`, `ResolvedInkPrimitive`, shapeSystemStore 등 Step 2~3 타입과 서비스.
- 7개 공통 레이아웃 바인딩, 전체 자모 변환, 새 화면 셸.
- 현재 baseline lint와 mobile-editor-v2 라우팅 문제. 별도 승인 없이 Step 1 변경에 섞지 않는다.

## 3. `layoutProfile`과 `userPartOverrides`의 전체 경로

### 현재 읽기·쓰기 흐름

| 경로 | 읽기 | 쓰기·영속화 | 현재 문제 |
|---|---|---|---|
| Calibration fresh state | `USER_PRESET_01_LAYOUT_PROFILE` | 초기 상태에 자동 적용되고 다른 Calibration 상태 변경 시 `font-maker-calibration-project`에 함께 persist | 사용자 편집과 preset seed를 구분할 메타데이터 없음 |
| Calibration SVG | `layoutStore.layoutSchemas` 위에 `layoutProfile[layoutType]` 우선 적용 | commit/Undo/Redo는 `setLayoutProfile()` | layoutStore와 다른 결과 가능 |
| Calibration 충돌·안전 보정 | 같은 합성 스키마로 `calculateBoxes()` 호출 | 없음 | Calibration 내부만 일관됨 |
| Calibration 분석 snapshot | `layoutProfile`, `layoutSchemas` 모두 읽음 | 복사 JSON에 두 값과 합성값 기록 | 분석 데이터에도 이중 원본 노출 |
| Calibration OTF | `generateAndDownloadFont({ layoutProfile })` | 다운로드만 수행 | 기본 OTF 경로와 다른 인자 계약 |
| 모바일 layout 편집 | `layoutStore.layoutSchemas` | `resizeLayoutPartEdge()`/`replaceLayoutSchema()`가 `userPartOverrides` 저장 | Calibration에 반영되지 않음 |
| 기존 데스크톱·미리보기 | `getLayoutSchema()` 또는 `layoutSchemas` | split/padding/part override 액션 및 schema 교체 | canonical store를 사용하지만 현재 HTML 진입점에서는 비활성 |
| layout localStorage | `font-maker-layout-schemas` hydration | 300ms debounced persist, unload flush | Calibration key와 독립 |
| 기존 history | `historyStore`가 전체 `layoutSchemas` snapshot | `loadFontData()`로 복원 | `userPartOverrides`를 포함하나 Calibration local history와 분리 |
| 모바일 history | `EditorHistoryEntry.layoutBefore/layoutAfter` | `font-maker-editor-v2-history`; 복원 시 `replaceLayoutSchema()` | canonical store 기준 |
| FontData | `applyFontData()` → layoutStore | `collectFontData()`가 전체 `layoutSchemas` 저장 | Calibration profile은 누락 |
| Supabase | `font_projects.font_data` → `applyFontData()` | `collectFontData()` payload 저장 | 다른 브라우저·프로젝트에서 Calibration 편집 복원 불가 |
| 기본 OTF | `collectGlyphDataForChar()`가 layoutStore 직접 읽음 | 없음 | 일반·모바일 기준 |

### Step 1 이후 목표 흐름

```text
모든 편집 commit/Undo/Redo
          ↓
layoutStore.layoutSchemas[*].userPartOverrides
          ├─ localStorage: font-maker-layout-schemas
          ├─ FontData collect/apply ↔ Supabase
          ├─ SVG/충돌 검사/분석 snapshot
          ├─ 모바일·기존 화면
          └─ fontExportUtils → fontGenerator → OTF
```

- `layoutConfigs`는 계속 파생값이며 원본으로 승격하지 않는다.
- `calibrationProjectStore`는 프로젝트 레이아웃을 소유하지 않는다.
- Supabase 프로젝트를 불러온 뒤 브라우저의 legacy profile이 다시 덮어쓰는 경로가 없어야 한다.
- 분석 snapshot에는 canonical effective schema와 편집 기록만 남기고 별도 layout 원본을 복제하지 않는다.

## 4. 현재 SVG·OTF 결과 기준값 고정 방법

코드 변경 전에 **서로 다른 두 현행 결과를 별도 fixture로 모두 채집**한다. 승인 후 하나를 canonical으로 선택하되 다른 하나도 migration 비교 증거로 남긴다.

### 레이아웃 좌표

1. localStorage를 비운 상태에서 `basePresets.schemas` 10종의 `calculateBoxes()` 결과를 정렬된 JSON으로 저장한다.
2. 런타임과 같은 `globalPadding/paddingOverrides/designBodyPadding`을 적용한 10종 결과도 따로 저장한다.
3. `USER_PRESET_01_LAYOUT_PROFILE`을 덧씌운 Calibration 결과를 별도 namespace로 저장한다.
4. 문맥 분기가 있는 레이아웃은 고정 입력을 함께 기록한다.
   - 10종 기본 mapping: `ㄱ·ㅏ·ㅗ·ㅘ·가·고·과·각·곡·곽`
   - 닫힌 초성 + `ㅗ/ㅛ`, 열린 초성 + `ㅗ/ㅛ`
   - 혼합중성 `JU_H/JU_V`
5. 기존 선 전용 layout box는 키 순서를 고정한 canonical JSON과 exact `toEqual`로 비교한다. tolerance·topology·bbox·area 비교는 Step 2 이후 신규 Boolean 윤곽에 사용하며 이 legacy 좌표 gate와 섞지 않는다. fixture 갱신은 별도 승인 없이는 하지 않는다.

### SVG

- 대표 문자: `ㄱ·가·고·과·각·곡·곽·ㅇ·ㅁ·ㅂ·ㅎ·ㅙ`.
- 고정 항목: 파트별 box, render order, 획별 `pointsToSvgD()` path, thickness, linecap, linejoin, Design Body 원점, advance.
- 브라우저 증거가 필요하면 Chromium, viewport/DPR, localStorage seed를 고정한 대표 캡처만 수동 보조 증거로 남긴다. Step 1의 필수 gate는 기존 선 전용의 exact path/box/attribute 비교다.

### OTF

- 같은 대표 문자와 전체 글리프 생성에 대해 `GlyphData`의 box·stroke·advance를 먼저 exact fixture로 고정한다.
- `tests/e2e/otf-legacy-baseline.spec.ts`에서 실제 UI 다운로드를 Playwright `download` 이벤트로 받고, 생성된 OTF를 `opentype.js`로 다시 읽어 대표 glyph의 command 좌표, bbox, advance, contour 수, hole/교차 샘플 점의 채움 여부를 비교한다.
- 전체 파일 SHA-256은 name table·copyright year·테이블 직렬화 잡음 때문에 수용 기준으로 사용하지 않는다. full-font smoke는 parse 성공, 실제 fixture로 고정한 glyph 수, UPM/ascender/descender를 검사한다.
- `ㅂ·ㅙ` 교차부, `ㅇ·ㅁ·ㅎ` 내부 공간, ascender 880/descender -120, Design Body 왼쪽 원점 이동을 별도 assertion으로 유지한다.
- 구형 `grid-system-2` 입력과 새 `legacy-snapped-centerline` 입력이 같은 snapped stroke·25 unit grid·75 unit 폭·35° 절단 contour를 만드는지 exact 비교한다.

### 저장 round-trip

- `layoutStore → localStorage → rehydrate`.
- `layoutStore → collectFontData() → validate/applyFontData() → layoutStore`.
- Supabase 네트워크 호출 자체가 아니라 `font_data` JSON payload의 serialize/parse 결과.
- legacy Calibration payload → migration → canonical layoutStore → 두 번째 migration 결과 동일.
- 구형 `strokeStyle.mode='grid-system-2'` → load → 새 이름 저장 → 재로드 결과 동일.

## 5. 명시적·멱등 마이그레이션 전략

### 입력 형식

- Zustand payload의 `{ state, version }` wrapper 유무를 모두 허용한다.
- legacy key는 `font-maker-calibration-project`, canonical key는 `font-maker-layout-schemas`다.
- 알려진 10개 `LayoutType`, `Part`, finite number만 허용한다. 손상 값, 알 수 없는 part, `NaN/Infinity`, 비객체는 쓰지 않고 오류로 반환한다.
- migration은 `layoutProfile`만 다루며 font metrics, 자모, history, Grid Lab 데이터에는 손대지 않는다.

### 판별과 충돌 우선순위 — 권장안

1. 사용자가 명시적으로 불러온 FontData/Supabase 프로젝트.
2. canonical `layoutStore.layoutSchemas[*].userPartOverrides`.
3. legacy Calibration의 **사용자 편집으로 판정된** per-layout profile.
4. `basePresets` 및 기타 코드 기본값.

per-layout 판정은 다음과 같다.

- legacy 값이 해당 `USER_PRESET_01_LAYOUT_PROFILE` 값과 정확히 같으면 seed로 분류하고 이관하지 않는다.
- legacy 값이 preset과 다르거나, 해당 레이아웃의 살아 있는 `sampleGlyphEdits`에 `layout-profile` 기록이 있으면 사용자 편집 후보로 분류한다.
- canonical 값이 비어 있으면 후보를 이관한다.
- canonical 값과 후보가 같으면 no-op으로 성공 처리한다.
- canonical 값과 후보가 다르면 field 단위 혼합을 하지 않는다. canonical 값을 유지하고 legacy 전체 값을 백업하며 `conflict`로 기록한다.
- `sampleGlyphEdits`는 보조 신호일 뿐이다. 기록이 없다는 이유만으로 preset과 다른 값을 버리지 않는다.

### 실행 절차

1. 두 raw payload와 fingerprint를 먼저 읽고, 쓰기 전에 legacy payload를 별도 backup key에 그대로 보존한다.
2. pure migration 함수가 `imported/noop/conflict/invalid` 결과와 layout별 diff를 반환한다.
3. `src-next/main.tsx` bootstrap에서 store를 import하는 `App`보다 migration을 먼저 실행한다. 현재 static `App` import는 store 모듈 평가와 hydration을 앞당기므로 migration 완료 뒤 dynamic import하거나 동등한 pre-hydration 순서를 보장한다.
4. 적용 뒤 `calculateBoxes()`를 재동기화하고 fixture 및 round-trip 검증을 통과한 경우에만 migration marker와 source fingerprint를 기록한다.
5. 같은 fingerprint로 다시 실행하면 저장 호출 없이 no-op이어야 한다.
6. 첫 배포에서는 legacy 원본과 backup을 자동 삭제하지 않는다. 삭제는 후속 명시적 정리 단계에서만 한다.
7. migration 실패·손상·충돌 시 원본을 변경하지 않고 진단 정보를 남긴다. Supabase 저장이나 OTF 생성 전에 사용자에게 상태를 보여줄 UI가 없다면 최소한 해당 레이아웃의 자동 이관을 건너뛴다.
8. FontData가 명시적으로 load된 뒤에는 legacy migration을 다시 적용하지 않는다.

### `grid-system-2` 구형 parser 범위

- canonical 저장 값: `mode: 'legacy-snapped-centerline'`.
- 읽기 전용 alias: `mode: 'grid-system-2'`.
- parser 적용 지점:
  - `font-maker-global-style` localStorage hydration.
  - FontData/Supabase `globalStyle.style.strokeStyle` load.
  - 프로젝트 JSON 또는 테스트에서 들어오는 unknown/legacy style 입력.
- 새로 저장하거나 `collectFontData()`로 내보낼 때는 canonical 이름만 쓴다.
- `/grid-lab`의 `font-maker-grid-system-2-lab-v1` 키와 점유 면 데이터는 이 parser의 대상이 아니다.
- 구형 alias 지원 제거 시점은 별도 데이터 버전과 사용 현황을 확인한 뒤 결정한다. Step 1에서는 제거하지 않는다.

## 6. 회귀 위험과 중단 조건

| 위험 | 검출 | 중단 조건 |
|---|---|---|
| USER preset 기준 충돌 | 두 fresh-state fixture 비교 | canonical baseline 승인 전 구현 중단 |
| Calibration 편집 유실 | legacy payload migration round-trip | 사용자 편집 후보 하나라도 누락되면 제거 작업 중단 |
| 모바일/프로젝트 값 덮어쓰기 | 양쪽 값이 다른 conflict fixture | 무근거 자동 precedence·field merge 또는 conflict 상태에서 부분 write가 발생하면 중단 |
| 프로젝트 간 오염 | 프로젝트 A/B FontData 순차 load | legacy 브라우저 값이 load된 프로젝트를 다시 덮으면 중단 |
| 10개 레이아웃 좌표 변화 | exact box fixture | 승인되지 않은 좌표 하나라도 달라지면 중단 |
| SVG/OTF 불일치 | 동일 schema로 SVG semantic/OTF contour 비교 | 같은 글자의 box·advance·contour가 다르면 중단 |
| 선 전용 OTF 회귀 | 대표 glyph bbox/path/hole/교차 검사 | `ㅂ·ㅙ` 교차 또는 `ㅇ·ㅁ·ㅎ` 내부 공간이 바뀌면 중단 |
| legacy mode 시각 변화 | old/new mode exact geometry 비교 | 25/75/35 결과가 달라지면 중단 |
| 구형 저장본 불가 | localStorage/FontData legacy fixture | 구형 alias가 brush fallback으로 조용히 바뀌면 중단 |
| Undo/Redo 원본 불일치 | Calibration commit→undo→redo→reload | canonical store와 화면/OTF 중 하나가 어긋나면 중단 |
| 파생값 영속화 | 저장 JSON 검사 | `layoutConfigs`, 계산 box, SVG path가 원본으로 저장되면 중단 |
| 범위 초과 | 변경 파일 및 타입 diff | Rail/Ink/shape system, 7개 binding, 새 UI가 추가되면 중단 |

현재 전체 lint와 mobile-editor-v2 Playwright는 시작 전부터 실패한다. Step 1 완료 판단은 우선 **기존 실패 목록이 늘지 않고 관련 테스트가 모두 통과하는 delta gate**로 해야 한다. 전체 green을 완료 조건으로 강제하려면 baseline 오류와 현재 라우팅을 별도 범위로 먼저 고쳐야 하며, 관련 없는 파일을 함께 수정해서는 안 된다.

## 7. 실행할 테스트 명령과 현재 baseline

### 시작 시 상태

- `git status --short`: 소스 기준 기존 변경 없음. 검토 시작 시 루트의 두 명세 문서만 untracked 상태였다.
  - `COMMON_GRID_HYBRID_IMPLEMENTATION_PLAN.md`
  - `KOREAN_FONT_MAKER_UX_SCREEN_SPEC.md`
- 이번 검토는 이 브리프 외 소스 파일을 수정하지 않았다.

### 현재 baseline

| 명령 | 결과 | 비고 |
|---|---|---|
| `npm run build` | 통과 | chunk 및 동적 import 관련 경고가 있으나 빌드 성공 |
| `npm test` | 통과 | 20 files, 98 tests |
| `npx vitest run src src-next` | 통과 | 31 files, 148 tests. 현재 `npm test`가 누락하는 `src/**/*.test.ts` 11개 포함 |
| `npm run lint` | 실패 | 전체 11 errors, 18 warnings. 루트 소스 4 errors, `.claude/worktrees/suspicious-khorana` 7 errors와 중복·추가 warnings 포함 |
| `npm run test:e2e` | 실패 | 33개 중 22개 통과, 11개 실패 |

Playwright 실패 11개는 `mobile-editor-v2.spec.ts` 9개와 `mobile-editor-v2-contexts.spec.ts` 2개다. 현재 `src-next/App.tsx`가 `/editor-v2`를 라우팅하지 않고 Calibration 화면으로 fallback하는 구조와 일치하는 locator timeout/count 실패다. Step 1에서 라우팅을 임의 수정하지 않는다.

### Step 1 내부 반복 검증

각 소단계가 끝날 때 아래 순서로 실행하고 다음 소단계로 넘긴다.

구현 중에는 변경 범위의 targeted Vitest와 관련 Playwright 1~2개만 먼저 실행한다. 각 소단계마다 전체 OTF·전체 E2E를 반복하지 않는다.

```bash
npx vitest run src-next/layout-profile-migration.test.ts src-next/layout-coordinate-baseline.test.ts src-next/svg-legacy-baseline.test.ts src-next/font-export-contract.test.ts
npx playwright test tests/e2e/calibration-layout-persistence.spec.ts tests/e2e/layout-preview-propagation.spec.ts
```

최종 게이트에서는 추가로 실행한다.

```bash
npx vitest run src src-next
npx playwright test tests/e2e/otf-legacy-baseline.spec.ts tests/e2e/layout-preview-propagation.spec.ts tests/e2e/design-body.spec.ts tests/e2e/design-body-internal-spacing.spec.ts tests/e2e/closed-bottom-medial-rendering.spec.ts tests/e2e/horizontal-vowel-rendering.spec.ts tests/e2e/area-stroke-style.spec.ts tests/e2e/brush-style.spec.ts
npm test
npm run build
npm run lint
npm run test:e2e
```

판정 규칙:

- 신규·수정 파일의 lint error는 0이어야 한다.
- 현재 전체 단위 테스트 148개와 Step 1 신규 테스트가 모두 통과해야 한다. Step 1에서 `npm test`도 이 범위를 실행하도록 고친다. 인자 없는 `npx vitest run`은 `tests/e2e`를 잘못 수집하므로 사용하지 않는다.
- 관련 Playwright는 모두 통과해야 한다.
- 전체 Playwright는 baseline 11개 이외의 새 실패가 없어야 한다.
- delta gate에서는 전체 lint가 baseline 11 errors/18 warnings보다 악화되지 않아야 한다. 다만 구현 플랜 원문의 최종 완료 기준은 전체 lint·Playwright 통과이므로, baseline 오류가 남아 있으면 `조건부 구현 완료 · Step 2 진입 보류`로만 판정한다.

## 8. 구현 순서와 단계별 완료 조건

### 0. 기준값·우선순위 승인

- 위 권장안인 `layoutStore` 보존 / USER preset seed 미이관을 승인하거나 Calibration fresh-state를 canonical로 선택한다.
- 완료 조건: 어떤 화면과 OTF를 canonical baseline으로 삼는지 한 문장으로 기록되고 충돌 precedence가 확정됨.
- 실패 시: 구현 시작 금지.

### 1. 변경 전 fixture 고정

- 두 fresh-state 결과, 10개 layout box, 대표 SVG semantic, 실제 다운로드 OTF semantic, old Grid 2 geometry를 서로 분리된 fixture로 채집한다.
- 테스트만 추가하고 production 코드는 아직 바꾸지 않는다.
- 완료 조건: fixture가 현행 코드에서 통과하고 두 레이아웃 원본의 차이를 명시적으로 보여줌.

### 2. pure migration과 legacy parser

- raw payload parse, per-layout 분류, 충돌 결과, fingerprint, 반복 no-op을 순수 함수로 구현한다.
- `'grid-system-2'` → `'legacy-snapped-centerline'` parser를 추가하되 geometry는 바꾸지 않는다.
- 완료 조건: fresh/default, 실제 편집, 양쪽 충돌, invalid, 두 번 실행, localStorage/FontData alias 테스트 통과.

### 3. canonical layoutStore 이관

- 승인 정책으로 legacy 값을 `layoutSchemas[*].userPartOverrides`에 한 transaction으로 이관한다. divergent conflict가 있으면 write하지 않고 중단한다.
- `layoutConfigs`는 재계산하고 저장하지 않는다.
- 완료 조건: 재접속, localStorage, FontData round-trip에서 같은 값이며 원본 backup이 남음.

### 4. Calibration 읽기·쓰기·히스토리 수렴

- `withLayoutProfile`, store selector, `setLayoutProfile` commit/Undo/Redo를 제거한다.
- Calibration은 `layoutStore.replaceLayoutSchema()` 또는 전용 canonical action만 사용한다.
- 분석 snapshot도 canonical schema 하나만 읽는다.
- 완료 조건: 한 제스처 commit→Undo→Redo→reload 후 Calibration·모바일·분석 snapshot이 같은 `userPartOverrides`를 봄.

### 5. OTF 별도 전달 경로 제거

- `FontExportOverrides.layoutProfile`, `FontGeneratorOptions.layoutProfile`을 제거한다.
- 화면과 OTF가 같은 현재 `layoutStore` revision을 읽게 한다.
- 완료 조건: Calibration 추출과 기본 추출의 대표 `GlyphData`·advance·contour가 동일하고 저장 스키마를 우회하는 호출이 없음.

### 6. 레거시 중심선 명칭 수렴

- 타입·geometry service·UI 레이블·DOM/test 이름을 `legacy-snapped-centerline`로 바꾼다.
- 구형 저장 입력만 parser에서 `'grid-system-2'`로 받는다.
- 완료 조건: 새 저장 JSON에는 옛 mode가 없고, 구형 입력의 렌더·OTF는 변경 전 fixture와 동일하며 `/grid-lab` v1 테스트는 그대로 통과.

### 7. 전체 회귀와 Step 1 종료

- build, Vitest, 관련 Playwright, 전체 Playwright, lint를 실행한다.
- 완료 조건:
  - 모든 레이아웃 쓰기와 OTF 읽기가 `layoutStore` 하나로 수렴.
  - 승인된 10개 레이아웃·SVG·OTF 기준값 유지.
  - 구형 저장값과 Supabase FontData round-trip 유지.
  - baseline 이외 새 lint/E2E 실패 없음.
  - Step 2 이상의 타입·UI·전체 자모 작업이 없음.
- 하나라도 충족하지 않으면 Step 2로 넘기지 않는다.
- 기존 lint 및 `/editor-v2` baseline 실패가 남아 있으면 위 기능 조건을 만족해도 최종 상태는 `조건부 구현 완료 · Step 2 진입 보류`다. 해당 baseline을 별도 범위에서 해결하거나 명시적으로 완료 기준을 변경하기 전에는 Step 1 완료를 선언하지 않는다.

## 단계 인계 규칙

각 소단계와 Step 1 최종 종료 시 다음 세 항목을 반드시 남긴다.

1. **변경된 파일 목록**
   - 신규·수정·이름 변경을 구분한다.
   - 관련 없는 기존 변경은 별도 항목으로 표시하고 손대지 않는다.
2. **실행한 테스트 결과**
   - 정확한 명령, 통과/실패 수, 기존 baseline 실패와 새 실패의 차이를 기록한다.
   - fixture를 갱신했다면 이유와 승인자를 기록한다.
3. **다음 단계에서 주의할 문제**
   - 미해결 충돌, migration backup 위치, parser alias 범위, 성능·타입 부채를 적는다.
   - 중단 조건이 남아 있으면 다음 모델은 구현하지 않고 검토만 계속한다.

Step 1 최종 인계에는 위 세 항목과 함께 `canonical baseline`, `migration policy`, `legacy alias 제거 금지`를 한 번 더 명시한다.
