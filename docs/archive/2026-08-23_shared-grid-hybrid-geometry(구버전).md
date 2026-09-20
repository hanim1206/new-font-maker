---
status: pending approval
created: 2026-08-23
project: 한글 폰트 메이커
scope: 공통 그리드 기반 레이아웃 및 선·면 하이브리드 자모 시스템
---

# 공통 그리드 기반 선·면 하이브리드 구현 플랜

## 1. 요구사항 요약

- 자음 단독과 초성이 포함된 6개 조합, 총 7개 레이아웃이 하나의 공통 레이아웃 그리드를 공유한다.
- 사용자가 공통 레일을 움직이면 연결된 7개 레이아웃의 초성·중성·종성 영역이 즉시 다시 계산된다.
- 초성·세로중성·가로중성·혼합중성 가로부·혼합중성 세로부·종성은 역할별 형태 그리드를 공유하고, 모든 레이아웃에서 같은 자모 마스터를 사용한다.
- 기존 중심선·베지어 획과 Grid 2의 점유 면을 한 자모, 한 캔버스, 한 최종 윤곽 안에서 함께 사용할 수 있다.
- 곡률과 사선은 자유 좌표가 아니라 안정적인 레일 교점 참조로 저장하고, 레일 이동 때 다시 계산한다.
- 사용 중인 레일은 삭제를 막고 사용처를 표시한다. 이동은 허용한다.
- 선 전용에서는 전체 획 굵기를 유지하고, 혼합형에서는 선에만 적용하며, 면 전용에서는 숨긴다.
- 화면 SVG와 OTF가 같은 배치·윤곽·구멍·교차 결과를 사용한다.
- 한 제스처는 Undo/Redo 한 단계이며 재접속과 프로젝트 저장 후에도 같은 상태를 복원한다.

## 2. 확정한 설계 결정

### 2.1 하나의 시스템, 두 단계 그리드

- `layoutGrid`: Font Space 안에서 7개 레이아웃이 공유하는 절대 레일이다.
- `partGrids`: 자모 로컬 공간에서 역할별로 공유하는 형태 레일이다.
- 레이아웃과 자모 형태를 하나의 절대 레일 배열에 묶지 않는다. 그렇게 하면 슬롯 비율 변경과 자모 원형 변경이 과도하게 결합된다.
- 영속 좌표는 기존 원칙대로 0–1 정규화 값으로 저장하고, UI에서만 1000 UPM 단위로 표시한다 (`src/types/index.ts:16-22`, `src-next/calibrationProjectStore.ts:61-63,106-112`).

### 2.2 기존 Split + Padding 유지

- 공통 그리드는 `LayoutSchema`를 대체하지 않고 저작·제약 레이어로 추가한다.
- 레일 바인딩을 비영속 파생 `resolvedLayoutSchemas`로 컴파일하고 기존 `calculateBoxes()`에 전달한다.
- 기존 계산 순서인 gap → 프리셋/문맥 오버라이드 → 사용자 보정 → 배치/형태 규칙 → Design Body 변환을 보존한다 (`src/utils/layoutCalculator.ts:103-160`).
- 레일 해석 결과를 원본 `layoutSchemas`에 반복 덮어쓰지 않는다. 원본과 파생 스키마를 분리해 누적 드리프트를 막는다.

### 2.3 편집 원본과 최종 윤곽 분리

- 중심선과 점유 면을 독립 원본으로 저장한다.
- Boolean 결과나 최종 SVG path는 저장하지 않고 매번 파생한다.
- 모든 양의 원본은 잉크를 더한다. 면의 내부 공간은 해당 면의 `holes`에 속하며 전역 음각 마스크로 취급하지 않는다.
- 기존 `StrokeDataV2`는 자동 스냅하지 않는다. 사용자가 `그리드에 연결`을 선택할 때 전후 비교 후 변환한다 (`src/types/index.ts:256-272,288-307`).

### 2.4 Grid 2 두 구현 분리

- 현재 `StrokeRenderStyle.mode='grid-system-2'`는 중심선을 25-unit에 스냅하고 75-unit 폭·35° 절단을 적용하는 옛 렌더 실험이다 (`src/types/index.ts:245-254`, `src/services/gridSystem2Geometry.ts:5-62`, `src/services/strokeRenderGeometry.ts:85-103`).
- 현재 `/grid-lab`은 점유 칸·곡률·사선 편집 데이터를 별도 localStorage에 저장하는 UI 실험이다 (`src-next/App.tsx:1-8`, `src-next/GridSystem2LabPage.tsx:342-387`).
- 옛 렌더 모드는 `legacy-snapped-centerline` 호환 의미로 격리하고, 신규 점유 면은 글로벌 획 스타일이 아니라 자모 구성 데이터로 승격한다.

## 3. 범위

### 포함

- 7개 공통 레이아웃: `choseong-only`와 초성 포함 조합 6개.
- 역할별 형태 그리드: CH, 세로 JU, 가로 JU, JU_H, JU_V, JO.
- 안정 Rail ID, 교점/셀/곡률/사선 참조, 사용처 검사, 삭제 잠금.
- 선·면 공통 잉크 자료형과 화면·OTF 공통 해석 경로.
- 데스크톱 전체 화면 공통 그리드 편집기와 모바일 7개 미리보기 스트립.
- 프로젝트 저장, 마이그레이션, 공유 Undo/Redo 트랜잭션.
- 대표 수직 검증 후 67개 자모와 전체 한글 출력 확장.

### 제외

- 원형·방사형 등 비직교 그리드.
- 선과 면을 동시에 변화시키는 공통 Weight 축.
- 전역 음각/빼기 면 원본.
- 부리 자동 적용과 형태 예절 규칙 자동 추론.
- 기존 67개 자모의 무조건 자동 변환.
- 단독 모음 3종을 7개 비교 보드에 추가하는 작업. 기존 `LayoutType` 10종과 출력은 유지한다 (`src/types/index.ts:1-14`).

## 4. 목표 아키텍처

```text
ShapeSystemStore
├─ layoutGrid
├─ partGrids
└─ layoutBindings[7]
          │
          └─ resolveGridBoundSchemas()
                    │
              LayoutSchema
                    │
              calculateBoxes()

JamoData
├─ 기존 StrokeDataV2
└─ construction.channels
   ├─ GridCenterlineElement[]
   └─ GridAreaElement[]
                    │
           resolveGlyphInkPrimitives()
                    │
              InkRegion[]
              ├─ SVG
              └─ Boolean union → OTF/CFF
```

### 4.1 핵심 타입 초안

모든 핵심 타입은 프로젝트 규칙에 따라 `src/types/index.ts`에 정의한다.

```ts
type RailId = string

interface ShapeRail {
  id: RailId
  value: number
}

interface RailGrid {
  id: string
  xRails: ShapeRail[]
  yRails: ShapeRail[]
  snapStep: number
  minGap: number
}

interface GridPointRef {
  xRailId: RailId
  yRailId: RailId
}

interface GridCellRef {
  leftRailId: RailId
  rightRailId: RailId
  topRailId: RailId
  bottomRailId: RailId
}

type BoundaryTreatment =
  | { kind: 'curve'; vertex: GridPointRef; from: GridPointRef; to: GridPointRef }
  | { kind: 'diagonal'; vertex: GridPointRef; from: GridPointRef; to: GridPointRef }

interface GridAreaElement {
  id: string
  kind: 'area'
  filledCells: GridCellRef[]
  boundaryTreatments: BoundaryTreatment[]
}

interface GridCenterlineElement {
  id: string
  kind: 'centerline'
  anchors: Array<{
    id: string
    point: GridPointRef
    handleIn?: GridPointRef
    handleOut?: GridPointRef
  }>
  closed: boolean
  thickness: number
  linecap?: StrokeLinecap
  linejoin?: StrokeLinejoin
}

interface JamoConstruction {
  gridId: string
  channels: {
    main?: Array<GridCenterlineElement | GridAreaElement>
    horizontal?: Array<GridCenterlineElement | GridAreaElement>
    vertical?: Array<GridCenterlineElement | GridAreaElement>
  }
}

interface InkRegion {
  outer: InkRing
  holes: InkRing[]
}
```

## 5. 구현 단계

### Step 1. 레이아웃 단일 원본과 용어 정리

#### 목표

공통 그리드를 올리기 전에 데스크톱·모바일·저장·OTF가 같은 레이아웃 원본과 같은 Grid 2 의미를 사용하게 만든다.

#### 변경

1. `calibrationProjectStore.layoutProfile`의 사용자 보정값을 `layoutStore.layoutSchemas[*].userPartOverrides`로 이관한다.
   - 현재 보정 화면은 별도 `layoutProfile`을 읽고 (`src-next/CalibrationSentenceEditor.tsx:895-940`), 편집 커밋과 Undo/Redo도 별도 저장소를 갱신한다 (`src-next/CalibrationSentenceEditor.tsx:1072-1117`).
   - 현재 OTF 추출은 해당 프로필을 별도 인자로만 전달한다 (`src-next/CalibrationSentenceEditor.tsx:1152-1160`).
2. 기존 로컬 보정 프로필을 한 번만 `LayoutSchema.userPartOverrides`로 합치는 마이그레이션을 작성한다.
3. `calibrationProjectStore`에서는 `layoutProfile`과 `setLayoutProfile`을 제거하고 분석 기록만 유지한다 (`src-next/calibrationProjectStore.ts:71-103`).
4. `fontExportUtils.FontExportOverrides.layoutProfile`과 별도 OTF 전달 경로를 제거한다 (`src/services/fontExportUtils.ts:50-67`).
5. 기존 `grid-system-2` 렌더 모드를 레거시 이름으로 변경하고 구형 저장값 파서를 둔다.
6. Step 1 시작 전에 기존 SVG 좌표·OTF 대표 글리프·저장 round-trip 기준값을 고정한다.

#### 주요 파일

- `src-next/calibrationProjectStore.ts`
- `src-next/CalibrationSentenceEditor.tsx`
- `src/stores/layoutStore.ts`
- `src/services/fontExportUtils.ts`
- `src/services/fontGenerator.ts`
- `src/services/fontDataBridge.ts`
- `src/types/index.ts`
- `src/types/database.ts`

#### 완료 기준

- 보정 화면에서 레이아웃을 편집한 뒤 재접속·프로젝트 저장·모바일·OTF가 같은 `userPartOverrides`를 읽는다.
- 기존 10개 레이아웃의 `calculateBoxes()` 좌표가 기준값과 정확히 동일하다.
- 기존 선 전용 대표 글자 SVG path/box와 생성 OTF가 변경 전과 동일하다.
- 구형 `strokeStyle.mode='grid-system-2'` 저장본이 시각 변화 없이 로드된다.
- `npm run build`, `npm run lint`, 기존 Vitest 및 Playwright 회귀 테스트가 통과한다.

#### 다음 단계 진입 조건

레이아웃 프로필의 쓰기 경로와 OTF 읽기 경로가 모두 `layoutStore` 하나로 수렴해야 한다.

---

### Step 2. 공통 잉크 해석 계층 추출

#### 목표

새 면 분기를 UI와 OTF에 각각 복제하지 않도록 기존 중심선만으로 공통 잉크 계약을 먼저 세운다.

#### 변경

1. `InkRegion`, `ResolvedInkPrimitive`, `ResolvedCenterlinePrimitive` 타입을 추가한다.
2. `resolveGlyphInkPrimitives()`를 새 순수 서비스로 추출한다.
   - 현재 `SvgRenderer`는 파트별 획과 혼합중성 채널을 직접 해석한다 (`src/renderers/SvgRenderer.tsx:125-235`).
   - `fontExportUtils`에도 렌더 순서와 파트 획 수집 로직이 복제되어 있다 (`src/services/fontExportUtils.ts:78-115`).
3. 화면과 OTF가 같은 자모 채널·박스·문맥 안전 보정·linecap/linejoin 해석 결과를 사용하게 한다.
4. 기존 `BrushInkGroup`을 `InkRegion`으로 어댑트한다. 이 단계에서는 기존 화면 렌더 방식을 유지해 시각 회귀를 막는다.
5. 기존 CFF union을 좌표계 독립적인 `inkBoolean` 계층으로 감싸되 현재 OTF 결과를 유지한다 (`src/services/contourBoolean.ts:98-110`, `src/services/fontGenerator.ts:170-214`).

#### 신규 파일

- `src/services/glyphInkResolver.ts`
- `src/services/inkGeometry.ts`
- `src/services/inkBoolean.ts`

#### 수정 파일

- `src/types/index.ts`
- `src/renderers/SvgRenderer.tsx`
- `src/services/fontExportUtils.ts`
- `src/services/fontGenerator.ts`
- `src/services/contourBoolean.ts`

#### 완료 기준

- 화면과 OTF가 동일한 `ResolvedInkPrimitive[]`를 받는다.
- 선 전용 원형·납작형·네모형·절단형의 대표 SVG/OTF 결과가 기준값과 동일하다.
- `ㅁ·ㅂ·ㅙ` 교차부와 `ㅇ·ㅁ·ㅎ` 내부 공간 회귀 테스트가 통과한다.
- 공통 resolver를 우회해 자모 파트를 직접 수집하는 새 코드가 없다.

#### 다음 단계 진입 조건

면 원본을 하나 추가할 때 화면과 OTF 중 한쪽에만 별도 배치 로직을 작성할 필요가 없어야 한다.

---

### Step 3. 안정 ID 기반 생산용 그리드 모델

#### 목표

현재 Grid 2 상호작용 알고리즘을 재사용하되 배열 인덱스·5개 자모 하드코딩·손실적 삭제를 제거한다.

#### 변경

1. `RailGrid`, `ShapeRail`, `GridPointRef`, `GridCellRef`, `BoundaryTreatment` 타입을 추가한다.
2. 현재 `{xIndex,yIndex}`와 `boolean[][]` 기반 모델을 ID 기반 참조로 전환한다 (`src-next/gridSystem2EditorModel.ts:1-45`).
3. 스냅·최소 간격·레일 추가·곡률/사선 후보 계산을 순수 서비스로 옮긴다.
   - 현재 레일 추가는 모든 인덱스와 셀 배열을 직접 이동한다 (`src-next/gridSystem2EditorModel.ts:320-356`).
   - 현재 삭제는 참조를 이전 레일로 옮기고 서로 다른 점유 셀도 OR 병합한다 (`src-next/gridSystem2EditorModel.ts:359-390`).
4. `collectRailUsages()`를 구현한다.
   - 하드 참조: 레이아웃 split/part edge, 중심선 앵커/핸들, 곡률/사선 교점.
   - 면 참조: 삭제 시 양쪽 점유 상태나 윤곽이 달라지는 셀 경계.
5. 삭제 정책을 `사용 중 차단 → 참조 이전 → 삭제`로 구현한다. 이동은 허용한다.
6. Grid v1 실험 데이터를 v2 타입으로 변환하는 명시적 import 함수를 작성한다. 자동 적용하거나 구형 localStorage를 삭제하지 않는다.
7. `shapeSystemStore`를 Zustand + Immer + persist 패턴으로 추가한다. 파생 윤곽은 저장하지 않는다.

#### 신규 파일

- `src/stores/shapeSystemStore.ts`
- `src/services/masterGridCommands.ts`
- `src/services/gridReferences.ts`
- `src/services/gridV1Import.ts`

#### 수정/이관 파일

- `src/types/index.ts`
- `src-next/gridSystem2EditorModel.ts`
- `src-next/grid-system-2-editor.test.ts`

#### 완료 기준

- 레일 추가 후 기존 레일 ID와 교점 참조가 변하지 않는다.
- 하드 참조가 있는 레일 삭제가 거부되고 모든 사용처가 반환된다.
- 면 형태가 바뀌는 삭제가 명시적 승인 없이 수행되지 않는다.
- 레일 이동 후 연결된 곡률·사선·앵커 좌표가 같은 ID로 다시 계산된다.
- 기존 Grid 2의 채우기 드래그, 국소 복원, 곡률, 사선, 키보드, 모바일 계약 테스트가 v2 모델에서도 통과한다 (`tests/e2e/grid-system-2-lab.spec.ts:28-90`).

#### 다음 단계 진입 조건

레이아웃과 자모가 배열 순서를 저장하지 않고 Rail ID만 참조해야 한다.

---

### Step 4. 7개 레이아웃 바인딩과 동시 미리보기

#### 목표

공통 레이아웃 레일 하나를 움직였을 때 연결된 7개 패턴이 같은 화면에서 즉시 다시 계산되게 한다.

#### 변경

1. `SharedLayoutType`을 아래 7종으로 정의한다.
   - `choseong-only`
   - `choseong-jungseong-vertical`
   - `choseong-jungseong-horizontal`
   - `choseong-jungseong-mixed`
   - `choseong-jungseong-vertical-jongseong`
   - `choseong-jungseong-horizontal-jongseong`
   - `choseong-jungseong-mixed-jongseong`
2. `LayoutGridBinding`에 안정 split ID와 파트별 edge Rail ID를 저장한다. 현재 `Split`은 배열 순서만 있으므로 결정적 ID를 추가한다 (`src/types/index.ts:24-31,62-84`).
3. `resolveGridBoundSchema()`와 `resolveAllGridBoundSchemas()`를 작성한다.
4. `calculateBoxes()`에 스토어 의존성을 넣지 않고 해석된 스키마만 전달한다.
5. 보정 화면, 충돌 검사, 모바일, SVG, OTF가 동일한 해석 서비스를 통과하게 한다.
6. `ㄱ·가·고·과·각·곡·곽` 비교 보드를 구현한다.
7. 레일 드래그 중에는 로컬 `draftGrid`와 `PreviewLayouts`만 갱신하고 pointerup/pointercancel에 한 번 커밋한다.
8. Design Body는 기존 850×850 기준에서 해석한 뒤 현재 padding으로 비례 변환한다 (`src/utils/layoutCalculator.ts:107-160`).

#### 신규 파일

- `src/services/layoutGridProjection.ts`
- `src/services/layoutGridCommands.ts`
- `src-next/SharedLayoutGridBoard.tsx`
- `src-next/SharedLayoutGridBoard.module.css`

#### 수정 파일

- `src/types/index.ts`
- `src/stores/layoutStore.ts`
- `src-next/CalibrationSentenceEditor.tsx`
- `src/features/mobile-editor/MobileEditorV2Page.tsx`
- `src/renderers/SvgRenderer.tsx`
- `src/services/fontExportUtils.ts`

#### 완료 기준

- 바인딩이 없는 기존 10개 레이아웃 좌표는 Step 1 기준값과 동일하다.
- 레일 하나를 움직이면 연결된 7개 카드와 보정 문장이 같은 프레임 흐름에서 갱신된다.
- 연결되지 않은 레이아웃은 변하지 않는다.
- `ㄱ·가·고·과·각·곡·곽`의 CH/JU/JU_H/JU_V/JO 영역이 예상 Rail ID에 연결된다.
- Design Body 가로·세로 변경 시 레일과 슬롯이 동일한 비율로 변환된다.
- 문맥별 중성 배치와 닫힌 초성 충돌 제한이 유지된다.

#### 다음 단계 진입 조건

면 데이터가 없어도 7개 레이아웃 공통 그리드의 전파·저장·Undo가 독립적으로 완성되어야 한다.

---

### Step 5. 자모 구성 데이터와 한 캔버스 선·면 편집

#### 목표

기존 중심선과 그리드 중심선·점유 면을 같은 자모와 같은 캔버스에서 독립 편집하고 하나의 실루엣으로 본다.

#### 변경

1. `JamoData`에 선택적 `construction?: JamoConstruction`을 추가한다. 기존 `strokes/horizontalStrokes/verticalStrokes`는 그대로 지원한다 (`src/types/index.ts:288-307`).
2. `GridCenterlineElement`와 `GridAreaElement`를 구현한다.
3. 혼합중성은 `main/horizontal/vertical` 채널로 기존 렌더 의미를 보존한다.
4. 현재 Grid 2의 셀 외곽·곡률·사선 로직을 UI 모델에서 분리해 `InkRegion[]`을 반환하게 한다.
   - 현재 실험 모델은 SVG `Q`/`L` 문자열을 직접 만든다 (`src-next/gridSystem2EditorModel.ts:596-660`).
5. 점유 셀 사각형을 먼저 Boolean union해 outer/hole 토폴로지를 명시한다. 꼭짓점만 맞닿은 셀도 결정적으로 처리한다.
6. 기존 선을 자동 변환하지 않고 `그리드에 연결` 명령으로 앵커·핸들을 가장 가까운 교점에 투영한다. 전후 미리보기와 Undo를 제공한다.
7. 큰 캔버스에 `레이아웃·레일·선·면·곡률·사선` 도구와 `결과 윤곽·원본 선·점유 면·레이아웃 영역` 레이어를 제공한다.
8. 첫 수직 검증은 `ㄱ` 선+면 혼합, `ㅇ` 면+내부 공간, `ㅏ` 기존 중심선으로 제한한다.
9. 굵기 UI를 조건부로 변경한다.
   - 선 전용: `전체 획 굵기`
   - 혼합: `선 획 굵기`
   - 면 전용: 숨김

#### 신규 파일

- `src/services/gridAreaGeometry.ts`
- `src/services/gridCenterlineGeometry.ts`
- `src/services/jamoConstructionCommands.ts`
- `src-next/ConstructionGridEditor.tsx`
- `src-next/ConstructionGridEditor.module.css`

#### 수정 파일

- `src/types/index.ts`
- `src/stores/jamoStore.ts`
- `src/renderers/SvgRenderer.tsx`
- `src-next/CalibrationSentenceEditor.tsx`
- `src-next/GridSystem2LabPage.tsx`
- `src-next/GlobalStyleTrackpad.tsx`

#### 완료 기준

- `ㄱ` 한 자모 안에 중심선과 점유 면이 동시에 존재하고 각각 선택·편집된다.
- `ㅇ`의 outer와 hole이 명시적으로 분리되어 표시된다.
- 곡률과 사선은 같은 모서리에 동시에 저장되지 않는다.
- 레일 이동으로 Grid ID에 연결된 선과 면이 함께 변하고, 연결하지 않은 기존 선은 변하지 않는다.
- 채우기 드래그와 레일 드래그 한 번이 각각 Undo 한 단계다.
- 전역 weight 변경이 면 좌표나 점유 상태를 바꾸지 않는다.

#### 다음 단계 진입 조건

화면 편집 단계에서 선·면 원본을 보존하면서 하나의 최종 실루엣으로 확인할 수 있어야 한다.

---

### Step 6. 화면·OTF 공통 합성과 실제 폰트 검증

#### 목표

선·면 혼합 결과가 화면과 설치 가능한 OTF에서 같은 윤곽·구멍·교차 결과를 갖게 한다.

#### 변경

1. `GlyphData.strokes`를 `ResolvedInkPrimitive[]` 기반으로 확장한다 (`src/services/fontExportUtils.ts:42-60`).
2. 중심선과 면을 각각 `InkRegion[]`으로 변환한 뒤 글리프 단위로 union한다.
3. Grid 곡률은 Boolean 전에 적응형 polyline으로 평탄화한다.
   - 화면과 OTF에 같은 결과를 사용한다.
   - 초기 허용 오차는 0.5 font unit으로 두고 시각·점 수 테스트로 조정한다.
4. Boolean 전 중복점·공선점·극소 링을 제거하고 고정 정밀도로 양자화한다.
5. union 후 outer는 CW, hole은 CCW로 정규화한다. 현재 CFF union의 방향 정규화와 극소 링 제거를 일반화한다 (`src/services/contourBoolean.ts:9-67`).
6. Design Body 왼쪽 원점 이동, slant, Y축 반전, UPM 투영을 모든 원본에 같은 순서로 적용한다.
7. 편집 중에는 원본 레이어 합성으로 응답성을 유지하고, 확정 실루엣·비교 카드·OTF에는 공통 union 결과를 사용한다.

#### 수정 파일

- `src/services/glyphInkResolver.ts`
- `src/services/inkGeometry.ts`
- `src/services/inkBoolean.ts`
- `src/renderers/SvgRenderer.tsx`
- `src/services/fontExportUtils.ts`
- `src/services/fontGenerator.ts`

#### 완료 기준

- 선과 면이 교차하는 `ㄱ`에서 흰 틈이나 이중 상쇄가 없다.
- `ㅇ` 내부 공간이 화면과 OTF에서 유지된다.
- 중심선이 면의 hole을 지나가면 중심선 잉크만 해당 구간을 채운다.
- 곡률·사선·slant·Design Body 원점 이동이 화면과 OTF에서 동일하다.
- `ㄱ·가·고·과·각·곡·곽`과 `ㅇ`을 브라우저 캡처 및 실제 OTF 렌더 이미지로 비교한다.
- 선 전용 글리프는 기존 기준 이미지와 동일하다.

#### 다음 단계 진입 조건

대표 수직 검증 글자의 SVG와 실제 설치 OTF 비교가 승인되어야 한다.

---

### Step 7. 공유 히스토리·저장·모바일 통합

#### 목표

공통 레일처럼 여러 레이아웃과 자모에 영향을 주는 편집을 하나의 트랜잭션으로 저장하고 모든 진입점에서 복원한다.

#### 변경

1. 보정 화면 로컬 history, Grid Lab 로컬 history, 기존 스토어 history에 공통 명령 트랜잭션을 도입한다.
   - 현재 Grid Lab은 컴포넌트 로컬 `past/future`를 사용한다 (`src-next/GridSystem2LabPage.tsx:342-387`).
   - 현재 보정 화면도 컴포넌트 로컬 `history/future`를 사용한다 (`src-next/CalibrationSentenceEditor.tsx:907-915,1095-1121`).
2. `master-grid`, `layout-binding`, `jamo-construction` 히스토리 항목을 before/after 원본만으로 저장한다. 파생 윤곽·resolved schema는 저장하지 않는다.
3. pointercancel은 마지막 draft를 한 번 커밋하고, 명시적 취소만 롤백한다.
4. `FontData`를 1.3.0으로 올리고 선택적 `shapeSystem`과 `construction`을 저장한다 (`src/types/database.ts:20-43`).
5. `collectFontData()`와 `applyFontData()`에 Shape System을 포함한다 (`src/services/fontDataBridge.ts:17-62`).
6. 현재 필드 존재 여부만 보는 `validateFontData()`를 버전별 parse/migrate 함수로 교체한다 (`src/services/fontDataBridge.ts:65-91`).
7. 구형 프로젝트는 기존 시각 결과를 유지하며 공통 그리드 연결이 해제된 상태로 로드한다.
8. Grid Lab v1 데이터는 `실험 데이터 가져오기`로만 가져오고 성공 후에도 원본 localStorage는 자동 삭제하지 않는다.
9. 모바일에서는 현재 레이아웃 큰 캔버스 + 가로 스크롤 7개 미리보기 + 하단 레일 사용처 시트를 제공한다.

#### 신규 파일

- `src/stores/projectHistoryStore.ts`
- `src/services/fontDataMigration.ts`
- `src-next/MobileSharedGridSheet.tsx`

#### 수정 파일

- `src/types/database.ts`
- `src/services/fontDataBridge.ts`
- `src/stores/layoutStore.ts`
- `src/stores/jamoStore.ts`
- `src/stores/shapeSystemStore.ts`
- `src-next/CalibrationSentenceEditor.tsx`
- `src/features/mobile-editor/MobileEditorV2Page.tsx`

#### 완료 기준

- 레일 드래그 한 번이 Undo/Redo 한 단계이고 7개 레이아웃이 함께 복원된다.
- 면 칠하기 드래그 한 번이 Undo/Redo 한 단계다.
- 새 프로젝트, 기존 프로젝트, Grid Lab import 프로젝트가 각각 손실 없이 저장·재로드된다.
- 프로젝트 JSON 저장/불러오기와 OTF 추출이 동일한 Shape System을 사용한다.
- 390px 화면에서 가로 overflow가 없고 레일 이동·면 채우기·곡률·사선이 동작한다.
- 모바일 pointercancel 후 마지막 미리보기 값이 한 번만 저장된다.

#### 다음 단계 진입 조건

데스크톱과 모바일에서 생성한 프로젝트를 서로 열었을 때 좌표·점유·곡률·사선·레이아웃이 동일해야 한다.

---

### Step 8. 전체 자모 확장·성능·제품 문서 갱신

#### 목표

대표 검증을 통과한 구조를 67개 자모와 전체 한글 출력에 확장하고 제품의 기본 기능으로 승격할지 판단한다.

#### 변경

1. 초성·중성·종성 자모별로 기존 중심선 유지, 그리드 연결, 면 추가 여부를 명시적으로 선택한다.
2. 혼합중성의 horizontal/vertical 채널과 겹받침을 포함한 전체 조합을 검증한다.
3. `jamoId + partGridRevision + style + box` 기준으로 기본 윤곽을 캐시한다.
4. 화면은 보이는 문장과 7개 비교 카드만 계산한다.
5. OTF 한 번의 생성 동안 동일 자모 원본 윤곽을 재사용하고 bbox가 연결된 그룹만 union한다.
6. 필요할 때만 전체 OTF 생성을 Web Worker로 옮긴다.
7. 제품 철학 문서에서 가설·사실·미결정을 구현 및 실제 렌더 검증 결과에 맞춰 갱신한다.

#### 수정 파일

- `src/data/baseJamos.json`
- `src/services/glyphInkResolver.ts`
- `src/services/fontGenerator.ts`
- `src-next/CalibrationSentenceEditor.tsx`
- `docs/PRODUCT_PHILOSOPHY.md`

#### 완료 기준

- 초성·중성·종성 67개 자모가 선 전용·면 전용·혼합 중 하나로 손실 없이 렌더된다.
- 완성형 11,172자와 호환 자모 51자를 포함한 OTF가 오류 없이 생성된다.
- 대표 글자 `ㅁ·ㅂ·ㅇ·ㅎ·ㅙ` 및 7개 레이아웃 글자의 실제 설치 렌더가 승인된다.
- 데스크톱 Chromium에서 7개 비교 카드가 보이는 레일 드래그의 commit-to-paint p95가 50ms 이하이다.
- 전체 생성 중 동일 자모·동일 그리드 revision의 기본 면 윤곽은 한 번만 계산된다.
- `npm run build`, `npm run lint`, `npm test`, 핵심 Playwright 전체가 통과한다.

## 6. 단계 전체 수용 기준

1. 기존 프로젝트를 열었을 때 사용자가 그리드 연결을 선택하기 전까지 시각 결과가 달라지지 않는다.
2. 7개 공통 레이아웃이 하나의 레일 객체를 참조하며 복사된 숫자값을 독립 원본으로 저장하지 않는다.
3. 초성 형태 레일 변경이 초성을 쓰는 모든 레이아웃의 보이는 글자에 반영된다.
4. 한 자모에서 중심선과 점유 면을 함께 저장·편집·Undo/Redo할 수 있다.
5. 레일 삭제는 의존성이 있거나 형태가 바뀌면 차단되고 정확한 사용처를 보여준다.
6. 화면과 OTF가 같은 `ResolvedInkPrimitive[]`와 같은 union 규칙을 사용한다.
7. 선 전용 전체 굵기, 혼합형 선 굵기, 면 전용 굵기 숨김이 정확히 적용된다.
8. 프로젝트 저장·불러오기·재접속·모바일·OTF가 같은 원본 데이터를 사용한다.
9. 대표 수직 검증을 통과하기 전에는 67개 자모 자동 변환을 시작하지 않는다.

## 7. 위험과 완화

| 위험 | 영향 | 완화 |
|---|---|---|
| 레이아웃 이중 원본이 남음 | 화면·저장·OTF 불일치 | Step 1을 독립 게이트로 두고 layoutProfile 별도 전달 경로를 제거한다 |
| 인덱스 레일 삭제로 의미가 이동 | 곡률·사선·셀 손실 | 안정 ID, 사용처 검사, 참조 이전 후 삭제만 허용한다 |
| 곡선 Boolean이 점을 과도하게 생성 | 화면 지연·OTF 용량 증가 | 0.5 unit 적응형 평탄화, 공선점 제거, 캐시, 대표 글자 점 수 측정 |
| `ㅇ` hole과 다른 선의 교차 의미가 모호함 | 흰 구멍 또는 원치 않는 삭제 | hole은 면 원본의 로컬 counter로 정의하고 전역 negative 면은 제외한다 |
| 레일 이동 때 모든 글자를 재계산 | 드래그 버벅임 | 보이는 글자만 계산하고 자모 기본 윤곽을 grid revision으로 캐시한다 |
| 히스토리가 네 번째로 분리됨 | Undo 범위 불일치 | 공통 트랜잭션 store를 도입하고 파생값은 히스토리에 저장하지 않는다 |
| 기존 선 자동 스냅으로 디자인 손실 | 기존 프로젝트 회귀 | 자동 변환 금지, 전후 비교가 있는 명시적 그리드 연결만 제공한다 |
| 형태 그리드와 레이아웃 그리드 과결합 | 슬롯 수정이 자모 원형까지 왜곡 | layoutGrid와 역할별 partGrids를 분리하고 동일 시스템 안에서 투영한다 |

## 8. 검증 명령과 증거

각 Step 완료 시 다음을 기본 실행한다.

```bash
npm run build
npm run lint
npm test
npm run test:e2e
```

추가 증거:

- `ㄱ·가·고·과·각·곡·곽·ㅇ`의 변경 전/후 브라우저 캡처.
- 동일 상태에서 생성한 OTF의 macOS CoreText 실제 렌더 캡처.
- 구형 FontData → v1.3.0 → 저장 → 재로드 round-trip JSON 비교.
- 사용 중 레일 삭제 차단 시 반환된 레이아웃·자모 사용처 목록.
- 390px 모바일 Playwright 캡처와 pointercancel 히스토리 수 확인.
- 전체 OTF 글리프 수, 생성 성공 여부, 캐시 호출 횟수, 대표 드래그 p95 기록.

## 9. 구현 중단 조건

- Step 1에서 기존 10개 레이아웃 또는 선 전용 OTF 결과를 무손실로 유지하지 못하면 공통 그리드 구현을 시작하지 않는다.
- Step 3에서 안정 ID 마이그레이션 후 곡률·사선 의미를 보존하지 못하면 v1 데이터를 자동 import하지 않는다.
- Step 6에서 `ㅇ` 내부 공간과 선·면 교차를 화면·OTF 양쪽에서 동일하게 만들지 못하면 전체 자모 확장을 시작하지 않는다.
- Step 8 성능 기준을 넘으면 Web Worker 또는 윤곽 캐시를 먼저 적용하고 기본 기능 승격을 보류한다.

## 10. 승인 상태

이 문서는 구현 전 계획이며 상태는 `pending approval`이다. 명시적 실행 승인 전에는 소스 구현, 커밋, PR 작업을 시작하지 않는다.
