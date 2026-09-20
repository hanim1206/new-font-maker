---
project: 한글 폰트 메이커
area: 생성 엔진 ↔ 편집
status: 밑선·baseline 의미 계약 재수정 필요 · 구현 중지
version: 0.2.1-draft
created: 2026-08-28
supersedes:
  - 원도 5선 기반 레이아웃 엔진 P0 구현 명세 v0.1.0
  - 원도 5선 v0.2 수정 메모
related:
  - COMMON_GRID_HYBRID_IMPLEMENTATION_PLAN.md
  - docs/PRODUCT_PHILOSOPHY.md
---

# 원도 5선 기반 네모꼴 레이아웃 엔진 P0 통합 명세

> **2026-08-28 의미 계약 정정**
>
> 사용자가 확인한 원도의 `밑선`은 typography baseline이다. 현 문서의 `BODY_BOTTOM = Canonical Design Body 아래 경계(.925)`를 다섯 번째 밑선으로 두고 baseline `.880`을 별도로 분리한 계약은 사용자 의도와 충돌한다.
>
> 다섯 선은 `상단 기준선 + PLACEMENT_TOP + CENTER + PLACEMENT_BOTTOM + TYPOGRAPHIC_BASELINE`으로 재정의한다. 현 출력 메트릭에서 baseline은 `fontY=0`, glyph-normalized Y `.880`이다. Design Body 아래 경계 `.925`는 필요하면 5선에 포함하지 않는 보조 표시로만 다룬다.
>
> 이 정정은 아래의 role table, provisional 좌표, `guideRoleMinGap`, starter invariant, visual approval artifact에 전파된다. 해당 절을 통합 수정하기 전에는 이 문서로 구현을 시작하지 않는다.

## 0. 문서 성격과 현재 판정

이 문서는 원도 5선 기반 레이아웃 엔진의 단일 구현 기준이다. 이전 v0.1 명세와 별도 수정 메모는 이 문서로 대체한다. 개발자는 이전 문서의 숫자·타입·저장 위치를 함께 해석하지 않는다.

P0의 제품 가설은 다음과 같다.

> 고정된 네모꼴 경계 두 선과 가변 배치선 세 선을 서체 전체가 공유하고, 초성이 포함된 7개 조합 레이아웃은 같은 선을 서로 다르게 참조해 기본 Part 영역을 만든다.

현재 상태는 `구현 승인`이 아니다.

- 좌표·저장·계산·출력의 기술 계약은 이 문서로 승인받는다.
- 배치선 위치와 between 비율은 비교 보드에서 사용자 승인을 받는다.
- 면 두께 정책도 비교 보드에서 별도로 승인받는다.
- 승인 전 숫자는 제품 기본값이나 visual golden으로 등록하지 않는다.

P0는 **신규 5선 네모꼴 프로젝트만** 다룬다. 기존 프로젝트를 5선 시스템으로 연결하거나 850 advance에서 1000 advance로 변환하는 기능은 P0에서 구현하지 않는다.

---

## 1. 문제와 목표

### 1.1 문제

현재 공통 layout grid는 기존 7개 레이아웃의 여러 경계를 합집합으로 올린 기술 검증본이다. 원도의 소수 의미선이 서체 전체의 수직 리듬을 통제한다는 의도와 다르다.

자소 형태 시스템에는 중심선·점유 면·hole을 만들 수 있는 기반이 있지만, 의미 기반 레이아웃 선과 결합된 신규 프로젝트 흐름과 대표 SVG·OTF 출력 계약은 아직 없다.

### 1.2 P0 목표

1. 신규 프로젝트가 같은 Font Space, Design Body, base advance를 공유하는 네모꼴 모드로 시작한다.
2. 5개의 의미 role이 기존 layout yRail에 안정 ID로 결속된다.
3. 초성이 포함된 7개 레이아웃의 `GuideBaseFrame`이 기존 `partEdgeRailIds`에서 결정적으로 계산된다.
4. 기존 gap·preset·override·배치·형태론 보정은 `EffectivePartFrame` 단계에서 같은 순서로 적용된다.
5. Guide 편집은 한 transaction으로 저장되고 Undo/Redo·재접속 후 동일하게 복원된다.
6. 대표 자소의 중심선·면·hole이 하나의 `FinalGlyphInk`로 합쳐져 SVG와 prototype OTF에서 같은 결과를 낸다.
7. provisional 비교 보드에서 수직 비율과 면 두께 정책을 사용자와 확정한다.

### 1.3 P0 비범위

- 기존 프로젝트의 5선 연결·자동 변환·dry-run commit
- `layoutGridSystem` V1 좌표에서 5선 role을 추론하는 마이그레이션
- 단독 중성 3개 레이아웃의 5선 연결
- X축 공통 그리드 재설계
- 5선 프로젝트의 Design Body 크기 편집
- 레이아웃별 Design Body override
- production 사선·곡률 연결
- 공통 각도군·곡률군·면 두께 토큰·overshoot를 포함한 전체 기하학 조형 문법
- `OpticalOverride` 편집 UI와 자동 광학 보정
- 전체 67개 자모 Shape master 생성
- 완성형 11,172자 Shape 출력 전환
- 기존 전체 폰트 legacy 출력 경로의 일괄 제거

이 P0가 승인하는 범위는 네모꼴 배치와 기본 중심선·면·hole의 공통 출력 기반까지다. 사선·곡률과 글자 전체의 조형 토큰은 별도 후속 명세 없이는 production으로 확장하지 않는다.

기존 프로젝트는 P0 구현 전후로 기존 의미값·렌더·advance·origin이 바뀌지 않아야 한다. 저장 envelope와 버전은 구조 마이그레이션 때문에 달라질 수 있으며, 그때의 exact 보존 범위는 5.3절에서 정의한다. 5선 전용 명령을 기존 프로젝트에 호출하면 명시적으로 실패해야 한다.

---

## 2. 공간과 네모꼴 메트릭

### 2.1 공간 계층

```text
Font Space 0–1, Y-down
└─ Canonical Design Body
   └─ GuideBaseFrame
      └─ EffectivePartFrame
         └─ Local Shape Grid 0–1
            └─ Centerline / Area / Hole
```

각 단계의 0–1은 같은 의미가 아니다.

- `BoxConfig`와 layout Rail: Font Space 전체 기준 glyph-normalized 좌표
- Local Shape Grid: 현재 Part 내부 기준 local 좌표
- UI의 Guide 비율: Design Body 내부 body-local 표현
- OTF contour: 최종 출력 단계의 Font Unit Y-up 좌표

### 2.2 `BoxConfig`

`BoxConfig`는 모든 공개 레이아웃 계산에서 Font Space 전체 기준 0–1만 사용한다.

```ts
interface BoxConfig {
  x: number
  y: number
  width: number
  height: number
}
```

1000 UPM 진단값은 별도 테스트 타입으로만 사용한다.

```ts
interface FontUnitBox {
  x: number
  y: number
  width: number
  height: number
}
```

`FontUnitBox`는 저장 원본이나 `calculateBoxes()` 반환 타입이 아니다.

### 2.3 P0 Canonical Design Body

```ts
const CANONICAL_DESIGN_BODY: BoxConfig = {
  x: 0.075,
  y: 0.075,
  width: 0.85,
  height: 0.85,
}
```

신규 5선 프로젝트에서는 P0 동안 이 값을 고정한다.

- `BODY_TOP = 0.075`
- `BODY_BOTTOM = 0.925`
- Design Body 편집 UI는 비활성화하고 이유를 표시한다.
- `globalPadding`과 `paddingOverrides`의 현재 편집 의미는 legacy 프로젝트에서만 유지한다. 5선 프로젝트의 필수 `globalPadding` 필드는 호환 mirror로 canonical 0.075에 잠그고 override는 비운다.
- 5선 프로젝트는 레이아웃별 Design Body override를 만들지 않는다.
- 5선 P0의 Body는 project metric과 `BODY_TOP/BOTTOM` Rail로 표현하며, `LayoutSchema.designBodyPadding`에는 복제하지 않는다.
- Design Body와 PartFrame은 clipping 경계가 아니다.

후속 Design Body 편집은 BODY Rail과 프로젝트 메트릭을 하나의 transaction으로 바꾸는 별도 명세에서 다룬다.

이 850×850 Body는 2026-08-20에 검증된 현재 제품 좌표 경계를 P0의 통제 변수로 상속한 값이다. P0-A에서 자유롭게 조절하지는 않지만, 1000 advance 안의 네모꼴 점유율이 부적합하면 시각 승인을 실패 처리하고 이 계약을 다시 연다.

### 2.4 네모꼴 출력 메트릭

```ts
const UPM = 1000
const ASCENDER = 880
const DESCENDER = -120
```

신규 5선 프로젝트의 P0 메트릭은 다음과 같다.

| 항목 | 값 |
|---|---:|
| base advance | 1000 |
| originX | 0 |
| 좌측 side bearing 기준 | 75 unit |
| 우측 side bearing 기준 | 75 unit |
| fixture letterSpacing | 0 |

base advance와 letter spacing은 구분한다. 공통 resolver는 다음 계약을 사용한다.

```ts
type HangulAdvanceMode = 'layout-design-body' | 'square-upm'

interface FontMetricsPolicyV1 {
  schema: 'font-metrics-policy'
  version: 1
  hangulAdvanceMode: HangulAdvanceMode
}

function resolveHangulOutputMetrics(
  policy: FontMetricsPolicyV1,
  effectivePadding: Padding,
  letterSpacing: number,
) {
  const baseAdvance = policy.hangulAdvanceMode === 'square-upm'
    ? 1
    : 1 - effectivePadding.left - effectivePadding.right

  return {
    advanceWidth: Math.round(UPM * (baseAdvance + letterSpacing)),
    originX: policy.hangulAdvanceMode === 'square-upm'
      ? 0
      : effectivePadding.left,
  }
}
```

- 신규 5선 프로젝트는 `square-upm`이다.
- 기존 프로젝트는 `layout-design-body`로 유지한다.
- 화면 조판과 OTF는 이 resolver 결과를 함께 사용한다.
- P0 자동 fixture는 `letterSpacing=0`으로 고정한다.

---

## 3. 5선의 제품 의미

P0의 5선은 원도의 해부학적 명칭을 그대로 복제한 시스템이 아니다. **고정 네모꼴 경계 2선 + 가변 배치선 3선**으로 재해석한 제품 가설이다.

| Role | P0 UI 표시 | 의미 | 이동 |
|---|---|---|---|
| `BODY_TOP` | 윗선 · 네모꼴 경계 | Canonical Design Body 위 경계 | 고정 |
| `PLACEMENT_TOP` | 배치윗선 · 원도 첫닿윗선 | 대부분의 기본 잉크가 참조하는 상단 배치선 | 가변 |
| `CENTER` | 중심선 | 상·하 조합의 공통 분할 기준 | 가변 |
| `PLACEMENT_BOTTOM` | 배치밑선 · 원도 받침밑선 | 대부분의 기본 잉크가 참조하는 하단 배치선 | 가변 |
| `BODY_BOTTOM` | 밑선 · 네모꼴 경계 | Canonical Design Body 아래 경계 | 고정 |

`PLACEMENT_TOP/BOTTOM`은 각각 초성 전용선과 종성 전용선이 아니다. 원도 명칭은 래퍼런스 연결을 위한 보조 표기이고, 제품 조작명은 `배치윗선/배치밑선`을 우선한다.

`BODY_TOP/BOTTOM`은 P0의 Part 경계로 직접 사용하지 않는다.

- 네모꼴 외곽 표시
- Guide 순서 검증
- 후속 overshoot 기준
- 후속 광학 보정 허용 범위

다섯 선이 모두 Part 배치에 직접 참여하는 것처럼 설명하지 않는다.

용어가 겹치는 두 중심선은 UI와 코드 설명에서 반드시 구분한다.

- `CENTER` / `원도 중심선`: 서체 전체가 공유하는 수평 layout Guide
- `GridCenterlineElement` / `획 중심선`: 자소 잉크를 만드는 Shape primitive

시각 승인에는 숫자뿐 아니라 **이 2+3 재해석을 원도 5선의 네모꼴용 제품 번역으로 채택하는 결정**이 포함된다.

---

## 4. Provisional 시각 후보

### 4.1 후보 상태

다음 값은 `visual-candidate-v0` fixture다.

```text
PLACEMENT_TOP     body-local 0.10
CENTER            body-local 0.50
PLACEMENT_BOTTOM  body-local 0.90

UPPER_STACK_BOTTOM ratio 0.70
FINAL_TOP ratio           0.30
```

승인 전 규칙:

- 제품 `DEFAULT_*` 상수로 등록하지 않는다.
- 신규 프로젝트 starter에 저장하지 않는다.
- migration이나 복구 기본값으로 사용하지 않는다.
- 프로젝트 store·history·localStorage를 변경하지 않는 Lab fixture에서만 사용한다.
- 사용자 승인 후 versioned visual preset으로 승격한다.

### 4.2 Body-local과 저장 좌표

```ts
function bodyLocalYToGlyphY(localY: number, body: BoxConfig): number {
  return body.y + localY * body.height
}

function glyphYToBodyLocalY(glyphY: number, body: BoxConfig): number {
  return (glyphY - body.y) / body.height
}
```

| Role | body-local | 저장 glyph Y | 1000 UPM 진단값 |
|---|---:|---:|---:|
| `BODY_TOP` | 0.00 | 0.075 | 75 |
| `PLACEMENT_TOP` | 0.10 | 0.160 | 160 |
| `CENTER` | 0.50 | 0.500 | 500 |
| `PLACEMENT_BOTTOM` | 0.90 | 0.840 | 840 |
| `BODY_BOTTOM` | 1.00 | 0.925 | 925 |

후보 body-local `Guide role minGap=0.05`는 glyph 좌표에서 `0.0425`다. 이 값도 provisional 시각·편집 후보이며 배치선·between 비율과 함께 승인한다.

이 값은 `LayoutGridSourceV1.minGap`에 저장하지 않는다. 기존 grid의 `minGap`은 X/Y 전체 Rail에 공통 적용되어 baseline X Rail의 더 좁은 간격도 통과해야 하기 때문이다.

- `grid.minGap`: X/Y 전체 topology 검증값. baseline Rail 전체의 최소 양수 간격 절반으로 결정한다.
- `guideRoleMinGap`: 세 가변 Guide 이동 명령에만 적용하는 visual preset 규칙. 승인 뒤 Layout Grid V2 application constant로 고정하며 source에 복제하지 않는다. 값을 바꾸려면 schema version을 올린다.
- UI hit tolerance: 포인터 조작 범위. 두 minGap과 무관하다.

### 4.3 파생 Rail 후보

```text
UPPER_STACK_BOTTOM
= between(PLACEMENT_TOP, CENTER, 0.70)
= body-local 0.38
= glyph Y 0.398

FINAL_TOP
= between(CENTER, PLACEMENT_BOTTOM, 0.30)
= body-local 0.62
= glyph Y 0.602
```

두 값은 resolved 숫자로 저장하지 않는다. 기존 `between` Rail의 참조와 ratio만 저장한다.

---

## 5. 저장 버전과 원본

### 5.1 Layout Grid V2

```ts
type LayoutGuideRole =
  | 'BODY_TOP'
  | 'PLACEMENT_TOP'
  | 'CENTER'
  | 'PLACEMENT_BOTTOM'
  | 'BODY_BOTTOM'

type GuideRoleBindings = Record<LayoutGuideRole, LayoutRailId>

interface LayoutGridSystemSourceV2 {
  schema: 'layout-grid-system'
  version: 2
  grid: LayoutGridSourceV1
  bindings: Record<SharedLayoutType, LayoutGridBinding>
  guideRoleBindings: GuideRoleBindings | null
}
```

root의 exact key는 다음 다섯 개뿐이다.

```text
schema
version
grid
bindings
guideRoleBindings
```

`guideRoleBindings=null`은 유효한 legacy-unbound 상태다. 숫자 위치로 role을 추론하지 않는다.

### 5.2 Shape System V3와 FontData 1.5

```ts
interface ShapeSystemSourceV3 {
  schema: 'shape-system'
  version: 3
  roleSources: Record<JamoPartRole, RoleConstructionScope>
  layoutGridSystem: LayoutGridSystemSourceV2 | null
  contextPresetCatalog: ContextGridPresetCatalogV1 | null
}

interface FontDataV1_5 extends FontDataPayload {
  version: '1.5.0'
  metricsPolicy: FontMetricsPolicyV1
  shapeSystem?: DeepReadonly<ShapeSystemSourceV3>
}
```

Shape source version 상승과 함께 Zustand의 Shape local persist envelope도 `version: 3`으로 올린다. V3 envelope의 `state`에는 지금처럼 raw `source` 하나만 저장하고, 파생 Frame·윤곽·history는 저장하지 않는다.

런타임 원본 소유자는 다음으로 고정한다.

```ts
interface LayoutState {
  // 기존 layoutSchemas/globalPadding/paddingOverrides와 같은 프로젝트 메트릭 원본
  metricsPolicy: FontMetricsPolicyV1
}
```

- `layoutStore.metricsPolicy`는 layout store의 local persistence, hydration, `loadFontData`, rollback 대상에 포함한다.
- 기존 local state에 필드가 없으면 `layout-design-body`로만 채운다.
- FontData bridge는 이 필드를 수집하고 다른 store와 함께 원자적으로 적용한다.
- 화면 조판과 OTF는 각 작업 시작 시 같은 `layoutStore.metricsPolicy` snapshot을 공통 resolver에 전달한다.
- P0에는 metrics policy만 단독 변경하는 공개 action을 만들지 않는다.
- layout Guide 좌표와 Guide transaction은 계속 `shapeSystemStore`가 소유한다. `layoutStore`에 Guide 사본을 만들지 않는다.

### 5.3 기존 데이터의 구조 마이그레이션

```text
FontData ≤ 1.4
→ FontData 1.5

Shape System V2
→ Shape System V3

LayoutGridSystemSourceV1
→ grid와 bindings를 그대로 보존한 LayoutGridSystemSourceV2
→ guideRoleBindings = null

기존 프로젝트 metricsPolicy
→ hangulAdvanceMode = 'layout-design-body'
```

이 마이그레이션은 저장 포맷만 올린다.

- 5선 role을 만들지 않는다.
- layout Rail을 추가·삭제·이동하지 않는다.
- advance와 origin을 바꾸지 않는다.
- 5선 프로젝트로 연결하지 않는다.

기존/null/V1에서 승격된 프로젝트에 P0 Guide 명령을 호출하면 `not-five-guide-project`로 실패하고 모든 원본을 유지한다.

여기서 legacy의 `exact 보존`은 raw 1.2/1.3 입력 byte나 root key의 동일성이 아니다. FontData 1.2의 legacy stroke/condition 및 Grid 2 canonicalization과 FontData 1.3의 Shape V1 승격은 현재 parser가 이미 수행하는 의도된 변환이므로 그대로 유지한다.

비교 기준은 commit `52a5c3f4673009fd0ee6bd721801344bb46a9fb0`의 현 parser가 각 1.2/1.3 fixture를 읽어 만든 **canonical FontData 1.4 baseline**이다. 구현 첫 지원 commit에서 이를 `src/test/fixtures/five-guide-square-p0/legacy-canonical-1.4-baselines.json`으로 고정하고 hash를 기록한다. native 1.4 fixture는 입력 자체가 baseline이다.

- 바뀔 수 있음: FontData/Shape/Layout Grid의 version, `metricsPolicy`, `guideRoleBindings=null`
- canonical 1.4 baseline에서 exact 보존: `layoutSchemas`, `globalPadding`, `paddingOverrides`, `jamoData`, `globalStyle`, 역할 source, context catalog, 기존 Layout Grid의 `grid`와 `bindings`
- 출력 보존: 10개 layout의 `BoxConfig`, 대표 SVG path, 글리프별 advance/origin, 대표 OTF contour signature

FontData 1.4를 1.5로 올린 뒤 `collect → apply → collect`한 두 번째 1.5 canonical object는 첫 번째 1.5 canonical object와 exact 같아야 한다. 전체 OTF 파일 byte는 메타데이터 때문에 비교하지 않고 글리프별 canonical contour·metrics signature를 비교한다.

읽기 경로별 구조 승격은 다음을 모두 명시적으로 다룬다.

| 입력 경로 | 입력 Shape | 승격 결과 |
|---|---|---|
| FontData 1.2 | 필드 없음 | Shape 없음 유지, legacy metrics만 추가 |
| FontData 1.3 | `shapeSystem` 없음 | Shape 없음 유지, legacy metrics만 추가 |
| FontData 1.3 | Shape V1 | Shape V3로 승격, layout grid와 context catalog는 `null` |
| FontData 1.4 | `shapeSystem` 없음 | Shape 없음 유지, legacy metrics만 추가 |
| FontData 1.4 | Shape V2 | 역할 source/catalog 보존, Layout Grid V1이 있으면 V2와 `guideRoleBindings=null`로 승격 |
| Shape local envelope V1 | `source=null` | V3 envelope의 `source=null` |
| Shape local envelope V1 | Shape V1 | Shape V3로 승격, layout grid와 context catalog는 `null` |
| Shape local envelope V1 | Shape V2 | 역할 source/catalog 보존, Layout Grid V1을 역할 없는 V2로 승격 |
| Shape local envelope V2 | `source=null` | V3 envelope의 `source=null` |
| Shape local envelope V2 | Shape V2 | 역할 source/catalog 보존, Layout Grid V1을 역할 없는 V2로 승격 |
| 기존 layout local persistence | `metricsPolicy` 없음 | `metricsPolicy=layout-design-body` backfill |

여기서 `역할 없는 V2`는 기존 `grid`와 `bindings`를 exact 보존하고 `guideRoleBindings=null`만 추가한 상태다. 지원 표에 없는 envelope/source 조합은 추측해서 고치지 않고 atomic reject한다.

### 5.4 신규 5선 프로젝트 생성

신규 생성 명령은 다음을 한 번에 만든다.

- `LayoutGridSystemSourceV2`와 non-null 5개 role binding
- Y축 5개 absolute Guide Rail과 2개 between Rail
- 승인된 baseline fixture의 X Rail과 X binding
- 정확히 7개의 기존 layout binding
- `metricsPolicy.hangulAdvanceMode='square-upm'`
- Canonical Design Body를 사용하는 신규 layout schema 집합

프로젝트 생성은 FontData apply/rollback 조정자가 관리하는 하나의 논리적 원자 작업이다. Shape 원본과 metrics policy 중 하나라도 검증·저장에 실패하면 compensating rollback을 수행하고 사용 가능한 부분 프로젝트를 노출하지 않는다.

P0의 프로젝트 모드는 별도 저장 필드로 중복하지 않고 다음 조합으로 판정한다.

```text
hangulAdvanceMode === 'square-upm'
⇔ Shape V3 + Layout Grid V2 + non-null guideRoleBindings
```

| mode | `guideRoleBindings` | `hangulAdvanceMode` | Body 상태 |
|---|---|---|---|
| legacy-unbound | `null` 또는 layout grid 없음 | `layout-design-body` | 기존 값 유지 |
| five-guide-square | non-null 5 role | `square-upm` | global 0.075, body override 없음 |

그 밖의 조합은 FontData ingress와 신규 프로젝트 생성에서 `inconsistent-five-guide-project`로 원자 거부한다. `five-guide-square`에서는 `globalPadding`이 네 방향 모두 `0.075`, `paddingOverrides`가 빈 객체, 모든 layout schema의 `designBodyPadding`이 `undefined`여야 한다.

신규 생성 검증에는 다음 두 실패를 각각 주입한다.

- Shape 저장 성공 뒤 metrics 저장 실패
- metrics 저장 성공 뒤 Shape 저장 실패

정상적인 compensating rollback이 성공한 경우 메모리, 두 local persistence 원본, history가 생성 전 상태와 exact 같아야 한다. rollback write 자체가 실패하면 성공으로 가장하지 않고 프로젝트를 `blocked`로 전환하며, 생성 전 canonical recovery snapshot과 실패 store 목록을 보존한다. 복구가 끝날 때까지 저장·출력·추가 편집을 차단한다.

다중 local persistence의 crash recovery는 `fontDataBridge`가 소유하는 단일 staging key로 고정한다.

```ts
interface FontDataRecoveryRecordV1 {
  schema: 'font-data-recovery'
  version: 1
  phase: 'prepared' | 'committed' | 'recovery-required'
  before: FontDataV1_5
  afterSha256: string
  failedStores: string[]
}

const FONT_DATA_RECOVERY_STORAGE_KEY = 'font-maker-font-data-recovery-v1'
```

```text
recovery record prepared 저장
→ 각 store 메모리/apply와 persistence flush
→ 모두 성공하면 committed 기록
→ staging key 제거
```

- `prepared` 자체를 저장하지 못하면 어떤 store도 바꾸지 않는다.
- 시작 시 `prepared`가 남아 있으면 `before`를 모든 store에 복원한 뒤에만 연다.
- `committed`가 남아 있으면 after hash를 확인하고 marker만 정리한다.
- rollback write가 실패하면 `recovery-required`와 실패 store를 남기고 모든 저장·출력·편집 진입점이 이를 차단한다.
- 정상 rollback 또는 recovery가 끝난 뒤에만 staging key를 제거한다.

후보값의 시각 승인 전에는 production starter를 노출하지 않는다. P0-A Lab은 메모리 fixture만 사용한다.

### 5.5 저장 대상과 파생값

저장:

- absolute/between layout Rail 원본
- `guideRoleBindings`
- 기존 7개 `LayoutGridBinding`
- 기존 X Split + Padding 원본
- 역할·문맥 Shape 원본
- `FontMetricsPolicyV1`

저장하지 않음:

- resolved Rail 좌표
- `GuideBaseFrame`
- `EffectivePartFrame`
- transient `LayoutSchema`
- projected part grid
- `FinalGlyphInk`
- SVG path
- OTF contour/path
- session history

---

## 6. V2 strict validation

V2 parser는 일부를 고쳐서 승인하지 않는다. 입력 전체를 검증한 뒤 원자적으로 승인하거나 거부한다.

### 6.1 Guide role

- non-null이면 5개 role이 정확히 한 번씩 존재한다.
- 각 role은 서로 다른 Y축 absolute Rail을 참조한다.
- X Rail, between Rail, 누락 Rail을 role로 지정할 수 없다.
- 순서는 `BODY_TOP < PLACEMENT_TOP < CENTER < PLACEMENT_BOTTOM < BODY_BOTTOM`이다.
- `BODY_TOP/BOTTOM`은 각각 `0.075/0.925`다.
- BODY role은 이동·재결속·삭제할 수 없다.
- P0의 role binding은 starter 생성 뒤 immutable이다. placement role은 결속된 absolute Rail의 위치만 바꿀 수 있다.
- placement Rail 이동은 role 순서와 승인된 `guideRoleMinGap`을 만족해야 한다.

### 6.2 Rail과 binding

- Rail ID와 binding ID는 전체 Shape source에서 충돌하지 않는다.
- `between`은 같은 축의 서로 다른 Rail만 참조한다.
- ratio는 유한하고 `0 < ratio < 1`이다.
- self-reference와 cycle을 금지한다.
- resolved Rail은 축별 단조 순서와 `minGap`을 만족한다.
- 7개 `bindings`가 정확히 존재한다.
- 각 layout의 필수 Part와 four-edge binding이 완전하다.
- split Rail과 part edge가 같은 raw box를 만들어야 한다.
- derived Rail은 직접 drag할 수 없다.

### 6.3 오류 원자성

다음 입력은 source·history·durable storage를 전혀 바꾸지 않는다.

- unknown field 또는 future version
- 누락·중복 role
- duplicate ID
- wrong axis
- missing reference
- cyclic between
- 순서/minGap 위반
- 누락 Part binding
- BODY Rail 이동·재결속
- 모든 Guide role 재결속
- stale ID command
- no-op command

---

## 7. 7개 레이아웃의 Y edge binding

P0은 별도 `LayoutYBinding`, `PartYBinding`, `YBoundaryExpression`을 만들지 않는다. 기존 `LayoutGridBinding.partEdgeRailIds`를 사용한다.

표기:

```text
PT = PLACEMENT_TOP
C  = CENTER
PB = PLACEMENT_BOTTOM
US = UPPER_STACK_BOTTOM between Rail
FT = FINAL_TOP between Rail
```

| Layout | Part | top Rail | bottom Rail |
|---|---|---|---|
| `choseong-only` | `CH` | PT | PB |
| `choseong-jungseong-vertical` | `CH` | PT | PB |
| 〃 | `JU` | PT | PB |
| `choseong-jungseong-horizontal` | `CH` | PT | C |
| 〃 | `JU` | C | PB |
| `choseong-jungseong-mixed` | `CH` | PT | C |
| 〃 | `JU_H` | C | PB |
| 〃 | `JU_V` | PT | PB |
| `choseong-jungseong-vertical-jongseong` | `CH` | PT | FT |
| 〃 | `JU` | PT | FT |
| 〃 | `JO` | FT | PB |
| `choseong-jungseong-horizontal-jongseong` | `CH` | PT | US |
| 〃 | `JU` | US | FT |
| 〃 | `JO` | FT | PB |
| `choseong-jungseong-mixed-jongseong` | `CH` | PT | US |
| 〃 | `JU_H` | US | FT |
| 〃 | `JU_V` | PT | FT |
| 〃 | `JO` | FT | PB |

Y축 canonical split ID도 같은 Rail을 직접 참조한다.

| Layout | canonical Y split name | Rail |
|---|---|---|
| `choseong-jungseong-horizontal` | `ch-ju` | C |
| `choseong-jungseong-mixed` | `ch-ju-h` | C |
| `choseong-jungseong-vertical-jongseong` | `upper-jo` | FT |
| `choseong-jungseong-horizontal-jongseong` | `ch-ju` | US |
| 〃 | `ju-jo` | FT |
| `choseong-jungseong-mixed-jongseong` | `ch-ju-h` | US |
| 〃 | `upper-jo` | FT |

Y split이 없는 `choseong-only`, `choseong-jungseong-vertical`은 이 표에 행을 만들지 않는다. X split ID와 모든 left/right edge binding은 baseline fixture의 기존 값을 그대로 쓴다.

X edge와 X split은 이 문서에서 재설계하지 않는다. 다음 commit의 기본 10개 schema를 회귀 원본으로 고정한다.

```text
52a5c3f4673009fd0ee6bd721801344bb46a9fb0
```

구현 첫 지원 commit에서 baseline을 `src/test/fixtures/five-guide-square-p0/x-baseline-52a5c3f.json`으로 고정하고 SHA-256을 manifest에 기록한다. fixture에는 commit SHA, schema JSON hash, 계산 함수, global style, 음절 context, 모든 override 상태를 포함한다. 7개 연결 레이아웃의 X/width와 단독 중성 3개의 전체 `BoxConfig`가 기준 fixture와 일치해야 한다. 이 파일과 hash가 없으면 P0-S를 시작하지 않는다.

---

## 8. GuideBaseFrame과 EffectivePartFrame

### 8.1 공개 파생 결과

단순 타입 별칭으로 두 Frame을 섞지 않는다.

```ts
interface ResolvedLayoutFrames {
  /** Rail edge만 해석한 최종 glyph-normalized raw box */
  guideBaseFrames: Partial<Record<Part, BoxConfig>>
  /** 기존 보정까지 적용한 P0의 최종 glyph-normalized slot */
  effectivePartFrames: Partial<Record<Part, BoxConfig>>
}
```

`resolveGuideBaseFrames()` 또는 동등한 순수 함수가 base 값을 직접 관찰할 수 있게 반환한다.

### 8.2 계산 경로

```text
LayoutGridSystemSourceV2
→ absolute/between Rail 해석
→ 기존 partEdgeRailIds 해석
→ canonical GuideBaseFrame
→ Rail edge와 Split/Padding의 일치 검증
→ transient LayoutSchema
→ gap
→ base·중성별·조건부 preset/override
→ userPartOverrides
→ component placement
→ morphology constraint
→ EffectivePartFrame = P0 final BoxConfig
```

- 기존 저장 `LayoutSchema`를 mutate하지 않는다.
- 두 번째 독립 Box 계산기를 만들지 않는다.
- 현재 `resolveGridBoundSchema()`와 `calculateRawBoxes()/calculateBoxes()`의 경계를 재사용한다.
- `GuideBaseFrame`은 이미 Font Space 전체 기준 glyph-normalized Rail이 정한 raw box다.
- transient schema의 `designBodyPadding`은 반드시 `undefined`다.
- `EffectivePartFrame`은 기존 보정이 반영된 P0의 최종 slot이며 별도 `final BoxConfig` 사본을 만들지 않는다.
- P0에서는 Canonical Design Body로 다시 투영하지 않는다. 가변 Body에 대한 1회 투영은 후속 명세에서 별도 좌표 타입과 함께 정의한다.

### 8.3 Neutral fixture

다음이 모두 항등인 synthetic fixture에서만 두 Frame이 같다.

- gap 없음
- base·중성별·조건부 override 없음
- userPartOverride 없음
- component placement 없음
- morphology constraint 없음
- Canonical Design Body

```text
GuideBaseFrame === EffectivePartFrame
```

### 8.4 Ordering fixture

이 fixture는 `choseong-jungseong-horizontal-jongseong`, context `{cho:'ㄱ', jung:'ㅗ', jong:'ㄴ'}`을 사용한다. 숫자는 구현 출력에서 사후 복사하지 않고 이 문서에 선고정한다. 모든 값은 glyph-normalized이며 표는 소수점 6자리 canonical 표기다.

입력:

```text
GuideBaseFrame
CH  = {x:.075, y:.160, width:.850, height:.238}
JU  = {x:.075, y:.398, width:.850, height:.204}
JO  = {x:.075, y:.602, width:.850, height:.238}

gap = {axis:'y', before:['CH'], after:['JU'], size:.020, anchor:'center'}

partOverrides.CH
  = {top:.010, bottom:.020, left:.010, right:.020}
partOverridesByJungseong['ㅗ'].JU
  = {top:.005, bottom:.015, left:.020, right:.010}
matching conditional override for jongseong 'ㄴ' on JO
  = {top:.020, bottom:.010, left:.030, right:.040}
userPartOverrides.CH
  = {top:-.005, bottom:.005, left:-.010, right:0}
component placement 'ㅗ'
  = JU bottom inset 20%
```

예상 중간값:

| 단계 | CH `(x,y,w,h)` | JU `(x,y,w,h)` | JO `(x,y,w,h)` |
|---|---|---|---|
| Base | `.075,.160,.850,.238` | `.075,.398,.850,.204` | `.075,.602,.850,.238` |
| gap | `.075,.160,.850,.228` | `.075,.408,.850,.194` | `.075,.602,.850,.238` |
| merged preset | `.085,.170,.820,.198` | `.095,.413,.820,.174` | `.105,.622,.780,.208` |
| user override | `.075,.165,.830,.198` | `.095,.413,.820,.174` | `.105,.622,.780,.208` |
| placement | `.075,.165,.830,.198` | `.095,.413,.820,.1392` | `.105,.622,.780,.208` |
| morphology/final | `.075,.165,.830,.198` | `.095,.413,.820,.1392` | `.105,.622,.780,.208` |

이 context의 초성 `ㄱ`은 morphology 제한 대상이 아니므로 마지막 단계가 placement와 같아야 한다. 순서가 바뀌면 최종값이 우연히 비슷하더라도 중간 단계 비교가 실패해야 한다.

### 8.5 Morphology fixture

gap과 override가 없는 synthetic schema에서 component placement 이후 값을 입력으로 고정한다.

| 글자 | 단계 | CH `(y,h)` | JU `(y,h)` | JO `(y,h)` |
|---|---|---|---|---|
| `모` | placement 전 | `.160,.340` | `.500,.340` | — |
| `모` | placement 후 | `.160,.340` | `.500,.272` | — |
| `모` | morphology 후 | `.160,.340` | `.570,.202` | — |
| `몸` | placement 전 | `.160,.238` | `.398,.204` | `.602,.238` |
| `몸` | placement 후 | `.160,.238` | `.398,.1632` | `.602,.238` |
| `몸` | morphology 후 | `.160,.238` | `.468,.0932` | `.602,.238` |

모든 x/width는 `{x:.075,width:.850}`로 유지한다. fixture는 `DEFAULT_STROKE_THICKNESS=.070`과 2026-08-28 현재 morphology 규칙을 manifest에 기록한다.

---

## 9. 시각 후보 기반 GuideBaseFrame fixture

이 절의 숫자는 계산 fixture이며 제품 visual golden이 아니다.

| Layout | Part | y | height |
|---|---|---:|---:|
| `choseong-only` | CH | 0.160 | 0.680 |
| vertical | CH | 0.160 | 0.680 |
| vertical | JU | 0.160 | 0.680 |
| horizontal | CH | 0.160 | 0.340 |
| horizontal | JU | 0.500 | 0.340 |
| mixed | CH | 0.160 | 0.340 |
| mixed | JU_H | 0.500 | 0.340 |
| mixed | JU_V | 0.160 | 0.680 |
| vertical+jongseong | CH | 0.160 | 0.442 |
| vertical+jongseong | JU | 0.160 | 0.442 |
| vertical+jongseong | JO | 0.602 | 0.238 |
| horizontal+jongseong | CH | 0.160 | 0.238 |
| horizontal+jongseong | JU | 0.398 | 0.204 |
| horizontal+jongseong | JO | 0.602 | 0.238 |
| mixed+jongseong | CH | 0.160 | 0.238 |
| mixed+jongseong | JU_H | 0.398 | 0.204 |
| mixed+jongseong | JU_V | 0.160 | 0.442 |
| mixed+jongseong | JO | 0.602 | 0.238 |

### CENTER 이동 fixture

UI body-local `CENTER 0.50 → 0.54`는 저장 좌표에서 `0.500 → 0.534`다.

```text
UPPER_STACK_BOTTOM body-local 0.408 → glyph 0.4218
FINAL_TOP           body-local 0.648 → glyph 0.6258
middle band         body-local 0.240 → glyph height 0.2040
```

검증:

- `choseong-only`와 vertical no-final은 변하지 않는다.
- horizontal/mixed no-final의 CH bottom과 JU/JU_H top은 `0.534`다.
- vertical+jongseong의 CH/JU bottom과 JO top은 `0.6258`다.
- horizontal/mixed+jongseong의 upper boundary는 `0.4218`이다.
- 가운데 band의 glyph height는 계속 `0.204`다.
- 모든 X/width는 변하지 않는다.

---

## 10. P0-A 시각 기본값 Lab

P0-A는 production starter가 아니다. provisional 값과 binding을 비교하기 위한 비영속 실험실이다. 13장의 `P0-S`가 먼저 제공하는 in-memory resolver와 Lab 전용 Shape fixture만 사용하며, production 저장·편집·OTF 통합을 선행 조건으로 요구하지 않는다.

### 10.1 고정 조건

- Font Space 1000×1000
- Canonical Design Body
- base advance 1000, originX 0
- letterSpacing 0, slant 0, weight multiplier 1
- round cap/join
- 같은 Shape source
- 같은 화면 배율과 viewBox
- 글자별 ink autofit·개별 가운데 맞춤 금지
- candidate ID `visual-candidate-v0`

### 10.2 비교 화면

각 글자는 동기화된 두 상태를 제공한다.

- `Base`: Guide와 `partEdgeRailIds`만 해석한 `GuideBaseFrame`
- `Effective`: 실제 기존 보정을 적용한 `EffectivePartFrame`

토글:

- advance cell / Font Space 경계
- Canonical Design Body
- 5개 Guide와 좌표
- Part별 Base/Effective Frame
- 최종 잉크
- 면의 가로·세로 두께
- hole bbox

### 10.3 비교 글자

```text
Frame·중심선
ㄱ · 가 · 고 · 과 · 각 · 곡 · 곽

초성 ㅁ의 면·속공간
ㅁ · 마 · 모 · 뫄 · 막 · 목 · 몸 · 뫅

종성 ㅁ의 역할별 압축
감 · 곰 · 괌
```

같은 좌표 변환으로 고정 크기 글줄도 함께 표시한다.

```text
가고과각곡곽
ㅁ마모뫄막목몸뫅감곰괌
```

공백 글리프 advance가 네모꼴 리듬 판정에 섞이지 않도록 승인용 글줄에는 실제 공백을 넣지 않는다.

### 10.4 면 두께 정책 승인

현재 affine 투영은 topology를 보존하지만 PartFrame에 따라 `ㅁ`의 가로·세로 면 두께를 바꾼다. 비교 보드는 다음 세 방식을 숨김없이 보여준다.

| 정책 | 의미 |
|---|---|
| `FRAME_RELATIVE` | 면과 hole을 PartFrame에 그대로 affine 투영 |
| `STYLE_LOCKED` | 외곽 배치는 변하지만 면 두께는 Design Body 기준 스타일 토큰으로 재생성 |
| `CONTEXT_ADJUSTED` | affine 결과에 승인된 역할·문맥별 두께 보정만 적용 |

세 보드는 직사각형 `ㅁ` fixture에 한해 다음 방식으로 재현한다.

- 기준 `ㅁ`: STANDALONE master를 `choseong-only` Base Frame에 투영한 결과
- 측정값: outer bbox와 hole bbox 사이의 좌우 평균을 `verticalBand`, 상하 평균을 `horizontalBand`로 기록
- `FRAME_RELATIVE`: 원래 cell region을 slot에 affine 투영
- `STYLE_LOCKED`: 각 문맥의 outer bbox는 유지하고, hole을 가운데 둔 채 기준 `verticalBand/horizontalBand`로 다시 inset
- `CONTEXT_ADJUSTED`: affine 결과의 두 band에 role/context별 `xMultiplier/yMultiplier`를 곱하고 outer bbox 안에서 hole만 다시 구성
- context multiplier의 Lab 초기값은 모두 `1.0`이며 사용자가 바꾼 값은 candidate snapshot에 기록
- target hole의 width나 height가 0 이하이면 그 후보는 `invalid-thickness-policy`로 표시하고 승인할 수 없음

이 계산은 일반 다각형 offset 엔진의 계약이 아니라 정책 선택을 위한 `ㅁ` 전용 Lab adapter다. 선택 전에는 `FRAME_RELATIVE`도 topology용 기술 fixture일 뿐 제품 조형 기본값이 아니다.

- `FRAME_RELATIVE`가 승인되면 현재 P0-1~3을 계속 진행한다.
- `STYLE_LOCKED` 또는 `CONTEXT_ADJUSTED`가 선택되면 P0-1 진입 전에 일반 면 geometry·스타일 토큰·저장 위치를 정의한 v0.3 계약을 먼저 승인한다.

### 10.5 승인 artifact

승인 artifact의 고정 위치는 `docs/visual-approvals/five-guide-square-p0/approval.json`이다. SVG는 같은 폴더에 두고 JSON에는 상대 경로와 SHA-256을 기록한다.

```ts
interface FiveGuideVisualApprovalDraftV1 {
  schema: 'five-guide-square-visual-approval'
  version: 1
  status: 'draft'
  candidateId: string
}

interface FiveGuideVisualApprovalApprovedV1 {
  schema: 'five-guide-square-visual-approval'
  version: 1
  status: 'approved'
  approvedAt: string
  candidateId: string
  guideModel: 'two-body-three-placement'
  bodyVerdict: {
    canonicalBody: { x: 0.075; y: 0.075; width: 0.85; height: 0.85 }
    advance: 1000
    occupancyApproved: true
    outsideInkApproved: true
  }
  guides: {
    coordinateSpace: 'body-local'
    placementTop: number
    center: number
    placementBottom: number
    guideRoleMinGap: number
  }
  binding: {
    layoutBindingSchemaVersion: 1
    visualBindingPresetId: string
    upperStackBottomRatio: number
    finalTopRatio: number
  }
  xControl: {
    fixtureCommit: string
    fixtureSha256: string
    aestheticApproved: false
  }
  shapeInput: {
    fixtureVersion: 'shape-source-v0'
    fixtureSha256: string
    roleConstructionVersion: 1
    targetShapeSystemVersion: 3
  }
  effectiveInput: {
    layoutSchemaSha256: string
    contextPresetIds: string[]
    layoutOverrideIds: string[]
    userOverridesSha256: string
  }
  thickness: {
    policy: 'FRAME_RELATIVE' | 'STYLE_LOCKED' | 'CONTEXT_ADJUSTED'
    tolerance: { x: number; y: number }
    referenceBands: { verticalBand: number; horizontalBand: number }
    contextMultipliers: Record<string, { xMultiplier: number; yMultiplier: number }>
  }
  svgArtifacts: Array<{
    glyph: string
    context: JamoLayoutContext
    state: 'Base' | 'Effective'
    selectedContextPresetIds: string[]
    selectedLayoutOverrideIds: string[]
    effectiveInputSha256: string
    partFramesSha256: string
    path: string
    sha256: string
  }>
}

type FiveGuideVisualApprovalV1 =
  | FiveGuideVisualApprovalDraftV1
  | FiveGuideVisualApprovalApprovedV1
```

승인 snapshot에 다음을 기록한다.

- candidate ID와 승인 날짜
- 2+3 Guide 의미 재해석 채택 여부
- Canonical Body/advance 안의 네모꼴 점유율과 Body 밖 잉크 판정
- 세 배치선 값과 `guideRoleMinGap`
- between ratio
- 7개 layout binding version
- X fixture commit/hash
- `X는 고정 통제 변수이며 이번 승인이 X 배치의 미학적 승인은 아님` 표식
- Shape source version
- 적용 preset·override 상태
- Base/Effective PartFrame canonical JSON hash와 SVG
- 선택한 면 두께 정책과 허용 편차
- role/context multiplier 또는 기준 band 측정값

Lab 조작은 프로젝트 store·history·localStorage를 변경하지 않는다.

승인값의 production runtime 원본은 승인 JSON 자체가 아니라 P0-1에서 추가하는 immutable application preset이다.

```ts
interface FiveGuideSquareVisualPresetV1 {
  schema: 'five-guide-square-visual-preset'
  version: 1
  id: 'five-guide-square-v1'
  layoutGridSystemVersion: 2
  designBody: typeof CANONICAL_DESIGN_BODY
  bodyLocalGuides: {
    placementTop: number
    center: number
    placementBottom: number
  }
  guideRoleMinGap: number
  betweenRatios: {
    upperStackBottom: number
    finalTop: number
  }
  thicknessPolicy: 'FRAME_RELATIVE'
}
```

- 위치: `src/data/fiveGuideSquareVisualPresetV1.ts`
- owner: immutable application data; Zustand/localStorage에 사본을 만들지 않음
- 연결: `LayoutGridSystemSourceV2.version===2`가 이 preset version을 사용
- provenance: approval JSON SHA-256을 preset 파일 주석과 fixture manifest에 기록
- 생성 규칙: 신규 starter의 Canonical Body, 5개 Y absolute Rail, 두 between Rail, `guideRoleMinGap`, between ratio, thickness policy는 이 preset에서만 materialize하며 별도 기본값을 두지 않음
- 변경: 값을 바꾸려면 Layout Grid 또는 visual preset schema version을 올리고 명시적으로 migrate

`STYLE_LOCKED`나 `CONTEXT_ADJUSTED`가 승인되면 이 V1 타입을 억지로 확장하지 않고 v0.3에서 thickness policy 원본을 다시 정의한다.

---

## 11. 편집과 transaction

### 11.1 편집 가능 범위

- `PLACEMENT_TOP`, `CENTER`, `PLACEMENT_BOTTOM`: 결속된 absolute Rail의 위치 drag 허용
- `BODY_TOP`, `BODY_BOTTOM`: 이동·재결속·삭제 금지
- `UPPER_STACK_BOTTOM`, `FINAL_TOP`: 직접 이동 금지
- 모든 Guide role 재결속: P0 금지. 후속에는 role map, `partEdgeRailIds`, `splitRailIds`, between 참조를 한 transaction으로 함께 재배선해야 함
- role에 사용 중인 Rail: 삭제 금지
- 다른 binding 사용처가 있는 Rail: 사용처 표시 후 삭제 차단

### 11.2 제스처

- `pointermove`: draft source와 preview만 갱신
- `pointerup`: 원본을 한 번 커밋하고 history 한 건 생성
- `pointercancel`: draft 폐기, source/history/storage write 0건
- drag 중 순서 교환 금지, 유효 범위에서 clamp
- invalid/no-op/stale command는 history를 만들지 않음

### 11.3 Undo/Redo와 저장

- 한 Guide drag는 Undo/Redo 한 단계다.
- history에는 source before/after만 있고 파생 Frame 사본은 없다.
- Undo 후 새 편집은 future를 제거한다.
- 저장 완료 표시 전에 debounced Shape write를 flush한다.
- reload 후 source만 복원하고 session history는 비어 있다.
- desktop과 390px에서 같은 state transition을 사용한다.

---

## 12. Shape 선·면·hole 출력

### 12.1 P0 대표 master

P0-3 테스트와 비교 보드는 production 67개 master를 요구하지 않는다. 다음 역할 master를 Lab/test fixture로 명시적으로 seed한다.

- `ㄱ`: STANDALONE, CH, JO 중심선
- `ㅁ`: STANDALONE, CH, JO 면 + hole
- `ㅏ`: JU_VERTICAL 중심선
- `ㅗ`: JU_HORIZONTAL 중심선
- `ㅘ`: JU_H, JU_V 중심선

대표 글자에 한정된 명시적 selection map을 사용한다. 전체 자모 자동 선택은 후속 범위다.

구현 첫 지원 commit에서 결정적 builder `src/test/fixtures/five-guide-square-p0/shape-source-v0.ts`를 먼저 고정한다.

```text
모든 역할 Local Shape Grid
X/Y core = 0.00, 0.20, 0.50, 0.80, 1.00
snapStep = 0.005
minGap  = 0.05

ㄱ centerline
(inner-left,inner-top)
→ (inner-right,inner-top)
→ (inner-right,inner-bottom)
thickness = 0.12, open, round/round

ㅁ area
4×4 cell 중 col=0 또는 col=3 또는 row=0 또는 row=3인 12개 perimeter cell
boundaryTreatments = []
예상 local outer bbox = 0,0,1,1
예상 local hole bbox  = .2,.2,.6,.6

ㅏ centerlines
vertical: (center-x,inner-top) → (center-x,inner-bottom)
arm:      (center-x,center-y) → (inner-right,center-y)

ㅗ centerlines
horizontal: (inner-left,center-y) → (inner-right,center-y)
vertical:   (center-x,inner-top) → (center-x,center-y)

모든 centerline thickness = 0.12, open, round/round
```

grid/master/cell ID는 `createBasePartGrid()`, `createJamoRoleMasterId()`, `createGridCellId()`의 canonical 결과를 사용한다. production helper가 없는 fixture element/anchor/point ID는 builder 안의 다음 함수 하나로 만든다.

```ts
function createFiveGuideFixtureId(
  kind: 'element' | 'anchor' | 'point',
  ...parts: Array<string | number>
): string {
  return [
    'five-guide-square-p0',
    kind,
    ...parts.map((part) => encodeURIComponent(String(part))),
  ].join(':')
}
```

- element: `(kind, role, jamoId, channel, semanticName)`
- anchor: `(kind, role, jamoId, channel, semanticName, anchorIndex)`
- point: `(kind, role, jamoId, channel, semanticName, anchorIndex)`
- role 순서: `STANDALONE, CH, JU_VERTICAL, JU_HORIZONTAL, JU_H, JU_V, JO`
- master 순서: STANDALONE/CH/JO는 `ㄱ,ㅁ`; JU_VERTICAL은 `ㅏ`; JU_HORIZONTAL은 `ㅗ`; JU_H/JU_V는 `ㅘ`
- element 순서: `ㄱ=giyeok`, `ㅁ=mieum-area`, `ㅏ=vertical,arm`, `ㅗ=horizontal,vertical`; anchor는 경로 진행 순서

builder의 canonical JSON SHA-256과 아래 selection map을 manifest에 기록한다.

| glyph | `Part → jamoId/role` |
|---|---|
| `ㄱ` | `CH→ㄱ/STANDALONE` |
| `가` | `CH→ㄱ/CH`, `JU→ㅏ/JU_VERTICAL` |
| `고` | `CH→ㄱ/CH`, `JU→ㅗ/JU_HORIZONTAL` |
| `과` | `CH→ㄱ/CH`, `JU_H→ㅘ/JU_H`, `JU_V→ㅘ/JU_V` |
| `각` | `CH→ㄱ/CH`, `JU→ㅏ/JU_VERTICAL`, `JO→ㄱ/JO` |
| `곡` | `CH→ㄱ/CH`, `JU→ㅗ/JU_HORIZONTAL`, `JO→ㄱ/JO` |
| `곽` | `CH→ㄱ/CH`, `JU_H→ㅘ/JU_H`, `JU_V→ㅘ/JU_V`, `JO→ㄱ/JO` |
| `ㅁ` | `CH→ㅁ/STANDALONE` |
| `마·모·뫄` | 위 중성 규칙 + `CH→ㅁ/CH` |
| `막·목·뫅` | 위 규칙 + `CH→ㅁ/CH`, `JO→ㄱ/JO` |
| `몸` | `CH→ㅁ/CH`, `JU→ㅗ/JU_HORIZONTAL`, `JO→ㅁ/JO` |
| `감·곰·괌` | 위 중성 규칙 + `CH→ㄱ/CH`, `JO→ㅁ/JO` |

`ㅘ/JU_H`는 위 `ㅗ` geometry, `ㅘ/JU_V`는 위 `ㅏ` geometry를 각 역할 grid에서 사용한다. 이 manifest와 hash가 없으면 P0-S/P0-A/P0-3을 시작하지 않는다.

### 12.2 공통 해석 경로

음절 분해, selection map, Part별 primitive 수집은 새 orchestration service `resolvePrototypeSyllableFinalInk()`가 소유한다. `finalGlyphInk.ts`에는 글자 분해나 master 선택을 넣지 않고 materialize와 SVG/OTF consumer 변환만 둔다.

```text
음절 분해와 layout 선택
→ final BoxConfig 계산

각 Part:
  resolveContextualPartGrid
  → projectPartGridToSlot(final BoxConfig)
  → resolveProjectedShapeGlyphInkPrimitives

모든 Part primitive 수집
→ materializeFinalGlyphInk 1회
→ FinalGlyphInk
```

`materializeFinalGlyphInk()`는 glyph-normalized 선·면·hole을 Boolean union한 최종 잉크를 만든다. OTF 좌표 변환을 수행하지 않는다.

### 12.3 소비 경로

```text
화면
FinalGlyphInk
→ finalGlyphInkToSvgPath

OTF
FinalGlyphInk
→ projectFinalGlyphInkToFontContours
→ opentype contour/path
```

```ts
fontY = ASCENDER - normalizedY * UPM

fontX =
  (normalizedX - originX) * UPM
  + (fontY - (ASCENDER - UPM / 2)) * Math.tan(slant * Math.PI / 180)
```

SVG와 OTF는 `FinalGlyphInk` 이후에 PartFrame 계산, primitive 해석, 획 확장, Boolean union을 다시 수행하지 않는다.

### 12.4 대표 출력 범위

- line-only: `ㄱ`
- region + hole: `ㅁ`
- 조합 투영: `가·고·과·각·곡·곽`
- 면 문맥: `마·모·뫄·막·목·몸·뫅·감·곰·괌`
- synthetic mixed ink: 같은 glyph에서 centerline과 region/hole이 겹치는 fixture
- 실패: unsupported cap/join, empty primitive, 미소 ring, 잘못된 winding

P0는 이 대표 glyph들의 prototype OTF까지 완료한다. 전체 11,172자 Shape OTF 생성은 후속이다.

---

## 13. 구현 단계와 승인 게이트

### 13.1 사용자 확인 단위 실행 계약

`P0-S/P0-A/P0-1/P0-2/P0-3`은 아키텍처 단계 이름이지 한 번에 구현하는 작업 묶음이 아니다. 실제 개발은 13.2절의 작은 검수 조각을 **각각 별도의 작업**으로 수행한다. 한 turn에는 조각 하나만 활성화한다.

모든 작업은 다음 계약을 지킨다.

1. 시작할 때 이번 작업의 ID, 사용자가 판단할 질문 하나, 열어 볼 화면 또는 artifact, 이번에 하지 않을 범위를 먼저 밝힌다.
2. 기술 seam·타입·migration만 만든 상태로 작업을 끝내지 않는다. 같은 작업 안에서 사용자가 직접 확인할 수 있는 최소 화면이나 비교 artifact까지 연결한다.
3. 종료할 때 고정 URL 또는 파일 경로, 최대 3개의 확인 행동, 정상 결과, 알려진 비범위, 자동 검증 결과를 함께 제공한다.
4. 자동 테스트 통과는 사용자 확인을 대신하지 않는다. 반대로 시각 확인은 round-trip·원본 불변·실패 원자성 검증을 대신하지 않는다.
5. 사용자가 `통과`, `수정 필요`, 또는 같은 의미의 판정을 주기 전에는 다음 조각의 코드를 시작하지 않는다.
6. 현재 조각을 끝내기 위해 다음 조각의 저장 owner·출력 경로까지 필요해지면 범위를 몰래 넓히지 않는다. 충돌 근거와 더 작은 대안을 보고하고 현재 조각에서 멈춘다.
7. 승인 전 후보는 계속 비영속으로 유지한다. 승인된 단위만 manifest와 승인 artifact의 provenance 대상이 된다.
8. 한 작업의 변경이 다음 단위까지 섞였거나 사용자가 재현할 수 있는 결과가 없으면 그 작업은 `완료`가 아니다.
9. 같은 차단 원인에 대해 서로 다른 해결 시도 두 번이 연속 실패하면 추가 탐색을 중지한다. 그때까지의 증거, 실패 원인 후보, 선택지를 보고하고 사용자 방향을 기다린다.
10. 조각 시작 시 예상 변경 파일을 밝힌다. 작업 중 그 밖의 owner나 광범위한 리팩터링이 필요해지면 먼저 범위 변경으로 보고한다.
11. 사용자가 통과시킨 조각은 다음 조각을 시작하기 전에 독립 checkpoint commit과 fixture/화면 provenance로 고정한다.

작업 종료 보고 형식은 다음으로 고정한다.

```text
이번 확인 단위: ID — 이름
열어 볼 곳: 고정 URL 또는 artifact
직접 해볼 것: 최대 3개
정상 결과: 눈으로 확인할 변화
자동 검증: 실행한 계약/회귀 검사
변경 범위: 실제 변경 파일과 checkpoint 상태
이번에 하지 않은 것: 다음 단위 범위
판정 대기: 통과 / 수정 필요
```

### 13.2 사용자 확인 단위

P0 구현 순서는 다음 검수 조각으로 고정한다.

| ID | 이번 단위에서만 만드는 것 | 사용자가 직접 확인하는 것 | 자동 증거 | 다음 단계 게이트 |
|---|---|---|---|---|
| `S0a` | 레거시 기준 동결 contact sheet와 X/Shape fixture manifest | `ㄱ·가·고·과·각·곡·곽`의 Shape 조합에서 `기본 X ↔ 현재 X`가 기존 계산을 재현하는지만 확인한다. 이 화면은 시각 기본값 승인물이 아니다. | source commit/hash, 14개 실제 글자 specimen, 기존 출력 signature | 기술 provenance 동결 뒤 `S0b` |
| `S0b` | 세로모음 초성–중성 간격 근거 보드 | 무료폰트 6종의 `가·거·나·너·다·더·마·머·아·어` 실제 윤곽과 우리 Shape `가`의 Current/A/B/C를 보고, `ㄱ+ㅏ` prototype의 임시 X 간격 하나만 고른다. | 폰트 출처·라이선스·파일 hash, 60개 reference SVG, 4개 통제 후보, 결정적 HTML, write 0건 | `가` 임시 간격 판정 뒤 후속 보정 질문 또는 `S1` |
| `S1` | `/five-guide-lab`의 7개 Base Frame atlas | advance cell·Body·5선·Part 색상을 보고 CENTER `.50↔.54` 토글의 경계 전파 확인 | 7개 edge/split golden, X 불변, 결정성, write 0건 | Frame 동작 통과 |
| `S2` | ㄱ 중심선과 ㅁ 면/hole atlas | 선과 면이 각 Frame에 들어가는 방식과 속공간 확인 | selection·region/hole·bbox·SVG hash, write 0건 | P0-S 완료 |
| `A1` | 네모꼴 리듬 비교 보드 | advance cell, Canonical Body, 5선, 무공백 글줄로 2+3 의미·점유율·세 배치선·between 비율 검토 | minGap·binding·재현성, write 0건 | 레이아웃 시각 검토 통과 |
| `A2` | 대표 글자의 Base/Effective 나란히 보기 | 기존 보정 전후의 높이·간격·리듬 확인 | Ordering·Morphology golden과 PartFrame hash | 보정 결과 통과 |
| `A3` | `FRAME_RELATIVE/STYLE_LOCKED/CONTEXT_ADJUSTED` 3열 보드 | ㅁ의 가로·세로 면과 hole을 보고 두께 정책 선택 | band 측정·허용 편차·invalid hole 차단 | 다른 정책이면 v0.3으로 중단 |
| `A4` | 최종 contact sheet와 승인 후보 요약 | A1~A3 결과를 한 번 더 확인하고 명시적으로 승인 | approval schema·입력 provenance·Frame/SVG hash | 여기서만 `approval.json` 생성; 이후 P0-1 허용 |
| `1A` | legacy 버전별 변환 전/후 비교 보드 | 대표 글자 SVG와 advance/origin이 같은지 확인 | canonical 1.4 baseline·전체 migration matrix·round-trip·contour signature | legacy 회귀 0건 |
| `1B` | 승인 preset 기반 신규 5선 starter | 생성 후 새로고침해 5선·7개 Frame·1000 advance 복원 확인 | preset/approval hash·7 binding·strict round-trip·aggregate invariant | 신규 생성·재접속 통과 |
| `1C` | 저장 실패·crash recovery 검증 보드 | 실패 주입별로 부분 프로젝트가 보이지 않고 blocked/recovered 상태가 맞는지 확인 | 양방향 rollback과 `prepared/committed/recovery-required` suite | 복구 경로 전부 통과 |
| `2A` | Lab과 production의 Base/Effective replay 비교 | 승인한 Frame이 production에서도 달라지지 않았는지 확인 | approval `partFramesSha256` exact | production replay 차이 0건 |
| `2B` | CENTER 편집 수직 조각 | drag·cancel·pointerup·Undo·Redo·reload를 직접 실행 | cancel 0 write, pointerup 1 transaction, history/reload exact | CENTER 조작 통과 |
| `2C` | 세 배치선과 390px 편집 | 위·가운데·아래 선의 clamp와 고정/파생선 편집 차단 확인 | stale/no-op/invalid suite와 desktop/mobile E2E | P0-2 완료 |
| `3A` | production FinalGlyphInk SVG specimen | ㄱ·ㅁ·대표 조합의 선·면·hole·겹침 확인 | union 1회·topology·bbox·winding·approval SVG hash | SVG 결과 통과 |
| `3B` | prototype OTF와 SVG/OTF 전환 specimen | 브라우저에 다시 로드한 OTF 글줄과 SVG 글줄을 비교하고 파일 다운로드 | OTF reparse·contour·hole·advance·origin·slant | P0-3 완료 |

이 조각들은 한 번에 연속 실행하지 않는다. 각 조각의 사용자 판정과 필요한 수정이 끝난 뒤에만 다음 조각으로 간다. `S0a~A4`는 project store·history·localStorage를 쓰지 않는다. `S0b`에서 고르는 값은 `가` prototype의 임시 근거일 뿐이며, 다른 초성·중성·문맥 규칙이나 5선 기본값의 승인이 아니다. `A1~A3` 통과는 부분 검토일 뿐이며 공식 승인본은 `A4`에서만 만든다. production starter는 `A4` 전에는 노출하지 않고 prototype OTF는 `3B` 전에는 만들지 않는다.

P0-S의 내부 resolver처럼 화면에 직접 보이지 않는 기반 작업은 그것을 처음 보여 주는 조각 안에 포함한다. 기반 코드만 따로 끝내고 완료 성과로 보고하지 않는다.

### P0-S — 비영속 시각 Lab 지원 seam

P0-A가 production 단계의 결과를 역으로 요구하지 않도록 최소 순수 계산 기반을 먼저 만든다.

```text
in-memory provisional Layout Grid V2 fixture
→ 순수 Rail/GuideBaseFrame resolver
→ 현재 calculateBoxes()를 호출하는 Effective adapter
→ 12.1의 Lab Shape builder
→ 기존 materializeFinalGlyphInk + SVG consumer
```

제약:

- project store, localStorage, history, production starter를 읽거나 쓰지 않는다.
- OTF와 Guide 편집 명령은 구현하지 않는다.
- unknown JSON ingress를 받지 않는다. typed/frozen fixture builder만 사용하며 V2 strict persistence parser는 P0-1에 남긴다.
- 별도 Lab 계산 공식을 만들지 않고 P0-1/2가 그대로 재사용할 순수 resolver를 먼저 만든다.
- `Effective`는 현재 보정 pipeline을 in-memory transient schema로 호출한 결과다.
- Shape 보드는 12.1의 고정 selection map만 처리하는 Lab adapter다.

완료 조건:

- X/Shape fixture 파일과 SHA-256 manifest가 먼저 존재한다.
- Base/Effective 각 단계가 명시된 순수 함수에서 관찰된다.
- 동일 입력의 Frame JSON과 SVG가 반복 실행에서 exact 같다.
- 테스트 전후 모든 project store/localStorage/history snapshot이 exact 같다.

### P0-A — 비영속 시각 기본값 Lab

범위:

```text
provisional 5선·between fixture
→ 7개 GuideBaseFrame
→ ㄱ/ㅁ 비교 보드
→ 사용자 시각 승인
```

자동 완료 조건:

- 동일 입력의 Frame JSON과 SVG가 반복 실행에서 같다.
- 초기화하면 같은 후보 결과가 재현된다.
- 프로젝트 store·history·localStorage write가 0건이다.

수동 완료 조건:

- 2+3 Guide 의미 재해석 채택
- Canonical Body와 advance 안의 네모꼴 점유율·상하좌우 리듬·Body 밖 잉크 승인
- 세 배치선 위치 승인
- `guideRoleMinGap`, 7개 binding과 between ratio 승인
- Base→Effective 보정 결과 승인
- 면 두께 정책과 허용 편차 승인
- 승인 artifact 저장

두께 정책 분기:

- `FRAME_RELATIVE` 승인: 이 문서의 P0-1로 진행
- `STYLE_LOCKED` 또는 `CONTEXT_ADJUSTED` 승인: P0-1을 멈추고 일반 geometry와 저장 계약을 포함한 v0.3을 먼저 승인

### P0-1 — 저장 원본과 GuideBaseFrame

범위:

```text
LayoutGrid V2 + Shape V3 + FontData 1.5
→ 신규 5선 starter
→ Guide role/binding
→ 7개 GuideBaseFrame
→ 저장·재접속
```

완료 조건:

- V2 exact parser와 V1→V2 structural migration 통과
- FontData 1.2/1.3/1.4의 Shape 없음/있음 분기, Shape local envelope V1/V2의 `null`/V1/V2 지원 조합, layout local state의 명시적 구조 승격 통과
- 1.2/1.3은 HEAD canonical 1.4 baseline을 기준으로 하고 기존 canonicalization 결과를 보존
- `layoutGridSystem=null` legacy와 connected Grid V1 legacy의 canonical 1.5 round-trip exact
- 두 legacy fixture의 기존 의미 payload, 10개 BoxConfig, 대표 SVG path, advance/origin, contour signature 불변
- 신규 5선 source round-trip exact
- approved JSON hash와 immutable visual preset V1의 값/provenance 일치
- 신규 starter의 Canonical Body, 5개 Y Rail, 두 between Rail, `guideRoleMinGap`, between ratio, thickness policy가 immutable visual preset V1에서만 생성되고 승인값과 exact 일치
- FontData aggregate mode invariant와 metrics policy store/bridge/hydration/rollback 통과
- 7개 layout/모든 Part edge 표와 실제 binding 일치
- canonical Y split 표와 실제 `splitRailIds` 일치
- 기본 후보 fixture와 CENTER 이동 fixture 통과
- `JU_H/JU_V` 별도 Frame 유지
- X/width baseline 불변
- invalid suite 전체 atomic reject
- source 입력 불변
- 파생 Frame·history 비영속
- legacy source의 Guide 명령이 `not-five-guide-project`로 실패
- 신규 생성의 양방향 persistence failure rollback, rollback-write 실패 시 blocked recovery 통과
- staging marker의 `prepared` 재시작 복원, `committed` 정리, `recovery-required` 전역 차단 통과

### P0-2 — EffectivePartFrame과 편집 transaction

범위:

```text
GuideBaseFrame
→ 기존 보정 pipeline
→ EffectivePartFrame
→ Guide 위치 편집
→ Undo/Redo·reload
```

완료 조건:

- Neutral fixture에서 Base=Effective
- Ordering fixture의 단계별 예상값 통과
- morphology fixture 통과
- 승인 artifact의 각 Base/Effective 입력을 production resolver로 replay한 canonical PartFrame JSON이 해당 `partFramesSha256`과 exact 일치
- Guide 이동 시 영향받는 Frame만 변경
- X와 Shape master 원본 불변
- pointercancel write 0건
- pointerup transaction 1건
- Undo/Redo/future 제거/reload 통과
- BODY/derived Rail 편집과 모든 role 재결속 차단
- desktop·390px E2E 통과

Legacy 연결·변환은 이 단계에 포함하지 않는다.

### P0-3 — FinalGlyphInk와 대표 OTF

범위:

```text
대표 role/master selection
→ 중심선 + 면 + hole
→ FinalGlyphInk
→ SVG + prototype OTF
```

완료 조건:

- 대표 selection map의 role/master/Part가 정확함
- 중심선·면·hole이 한 번 union됨
- region 수·hole 수·bbox·winding 통과
- Guide 이동 전후 topology 보존
- SVG path가 canonical FinalGlyphInk 직렬화와 일치
- OTF contour가 ascender/origin/slant 공식을 사용
- 생성 OTF 재파싱 후 path command·winding·hole·advance 일치
- originX 0/slant 0과 nonzero slant fixture 통과
- unsupported geometry fail-loud
- FinalInk와 출력 path 비영속
- 설치 렌더 bbox는 자동 exact가 아니라 시각 보드로 확인
- P0-A가 `FRAME_RELATIVE`를 승인한 경우 production 결과가 같은 affine 정책을 사용
- 승인 artifact의 각 Base/Effective 입력·selection을 `resolvePrototypeSyllableFinalInk()`로 replay한 canonical SVG가 기록된 `sha256`과 exact 일치

### 단계 순서

```text
기술 계약 승인
→ P0-S 비영속 지원 seam
→ P0-A Lab
→ 시각 기본값 승인
→ FRAME_RELATIVE면 P0-1
→ 다른 두께 정책이면 v0.3 계약 승인 후 P0-1
→ P0-2
→ P0-3
```

P0-S의 순수 resolver는 기술 계약 승인 뒤 구현할 수 있다. provisional 숫자를 production starter에 넣는 것은 시각 승인 뒤에만 허용한다.

---

## 14. 테스트 fixture와 판정 방식

### 14.1 필수 fixture

- manifest: `src/test/fixtures/five-guide-square-p0/manifest.json`
- `visual-candidate-v0`
- X baseline: `x-baseline-52a5c3f.json`
- Shape builder: `shape-source-v0.ts`
- Ordering/Morphology expected: `frame-pipeline-v0.json` — 8.4/8.5 표와 수동 대조
- FontData 1.2, FontData 1.3의 Shape 없음/Shape V1, FontData 1.4의 Shape 없음/Shape V2 migration
- Shape local envelope V1의 `null`/Shape V1/Shape V2와 envelope V2의 `null`/Shape V2 migration
- layout local state의 metrics policy backfill
- `legacy-canonical-1.4-baselines.json`
- layout grid null legacy와 connected Grid V1 legacy
- V2 five-guide round-trip
- CENTER body-local `.50→.54`
- representative Shape master selection
- centerline + region + hole union
- OTF origin/slant/winding

manifest는 fixture별 schema version, source commit, canonical JSON SHA-256, 생성·검토 방식을 기록한다. expected 파일은 구현 결과를 그대로 snapshot해서 만들 수 없으며, 8.4/8.5의 선고정 표와 사람의 대조를 통과해야 한다.

### 14.2 수치 비교

- glyph-normalized layout 계산: `1e-9`
- Font Unit contour 계산: 반올림 전 `1e-6`, 저장 contour는 exact integer
- X baseline: deterministic raw 값 exact 또는 기존 fixture의 명시 epsilon
- topology: region/hole count와 winding exact

### 14.3 시각 비교

- 같은 Font Space, Body, advance, 확대율
- autofit 금지
- 고정 색상과 guide overlay
- 동일 source에서 Base/Effective 나란히 표시
- macOS/CoreText 설치 렌더는 수동 artifact

설치 렌더 pixel bbox는 CI exact 조건으로 사용하지 않는다.

---

## 15. 권장 코드 책임

정확한 파일명은 구현 시 현재 트리에 맞춰 조정할 수 있지만 소유권은 바꾸지 않는다.

```text
src/types/index.ts
  LayoutGridSystemSourceV2
  ShapeSystemSourceV3
  Guide role/validation/result types

src/types/database.ts
  FontData 1.5
  FontMetricsPolicyV1

src/services/layoutGridSystemSourceV2.ts
  strict parse/resolve/migrate

src/services/layoutGuideResolver.ts
  role → absolute Rail
  GuideBaseFrame

src/services/layoutGridProjection.ts
  기존 partEdgeRailIds와 transient schema

src/utils/layoutCalculator.ts
  기존 보정 순서; 5선 P0 transient schema는 designBodyPadding 없음

src/services/fontMetricsResolver.ts
  advance/origin 공통 해석

src/data/fiveGuideSquareVisualPresetV1.ts
  승인된 Guide/minGap/between/thickness immutable runtime preset

src/stores/layoutStore.ts
  FontMetricsPolicyV1 runtime 원본·persistence·hydration

src/stores/shapeSystemStore.ts
  Guide command와 history

src/services/finalGlyphInk.ts
  공통 FinalGlyphInk materialize와 SVG/OTF 소비 변환

src/services/prototypeSyllableFinalInk.ts
  대표 음절 분해·master 선택·Part primitive 수집

src/services/fontDataBridge.ts
  FontData 1.5 collect/apply/rollback

src/services/fontDataMigration.ts
  FontData/Shape/Layout Grid/local legacy 구조 승격과 aggregate invariant
```

별도 Guide 좌표 store나 중복 layout binding store를 추가하지 않는다.

---

## 16. 문서·제품 철학 갱신 조건

`docs/PRODUCT_PHILOSOPHY.md`에는 다음을 `구현 예정 계약 · 승인 대기`로 기록해 두었다.

- 신규 5선 프로젝트는 고정 Canonical Design Body와 `square-upm` 메트릭을 사용한다.
- 기존 프로젝트는 `layout-design-body` 메트릭을 유지한다.
- Layout Grid V1 role을 좌표로 추론하지 않는다.
- 신규 저장 버전은 Layout Grid V2, Shape V3, FontData 1.5다.
- P0는 legacy 연결·변환을 구현하지 않는다.

구현 완료 전에는 이를 검증된 사실로 옮기지 않는다. 기술 또는 시각 계약이 바뀌면 pending 절과 이 문서를 함께 수정하고, 각 P0 단계가 끝나면 사실·가설·미결정을 다시 구분해 갱신한다.

---

## 17. Definition of Done

### 기술 계약 승인

- [ ] 이 문서 하나만 읽어 좌표·저장·메트릭·계산·출력 경로를 결정할 수 있다.
- [ ] 이전 v0.1의 font-unit `BoxConfig`, layoutStore Guide 소유권, 중복 Y binding, `1000-y` 공식이 남아 있지 않다.
- [ ] 신규 5선과 legacy 프로젝트의 상태·메트릭이 명시적으로 구분된다.
- [ ] 기존 프로젝트 변환이 P0에서 제외되어 있다.
- [ ] 7개 layout edge 표와 provisional fixture가 body-local/glyph 좌표를 섞지 않는다.
- [ ] `GuideBaseFrame`을 Design Body로 두 번 투영하지 않는다.
- [ ] grid 공통 minGap과 Guide role minGap을 구분한다.
- [ ] P0-S/P0-A/P0-1/P0-2/P0-3이 순환 의존 없이 통과·실패 판정 가능하다.

### 시각 기본값 승인

- [ ] 2+3 Guide 의미 재해석을 승인했다.
- [ ] Canonical Body/advance 안의 네모꼴 점유율과 Body 밖 잉크를 승인했다.
- [ ] 세 배치선 위치와 Guide role minGap을 승인했다.
- [ ] 7개 binding과 between 비율을 승인했다. X는 통제 변수임을 기록했다.
- [ ] Base→Effective 결과를 승인했다.
- [ ] 면 두께 정책과 허용 편차를 승인했다.
- [ ] 승인 artifact에 입력 source와 버전을 기록했다.

### P0 구현 완료

- [ ] Layout Grid V2, Shape V3, FontData 1.5 strict round-trip이 통과한다.
- [ ] 신규 5선 starter만 `square-upm`과 non-null role binding을 가진다.
- [ ] 승인 JSON과 immutable visual preset의 값·hash provenance가 일치한다.
- [ ] 기존 프로젝트는 구조 envelope를 제외한 의미 payload·시각·메트릭이 불변이다.
- [ ] Guide 편집과 Undo/Redo/reload가 desktop·390px에서 통과한다.
- [ ] P0에서는 Guide 위치만 편집되고 role 재결속은 차단된다.
- [ ] 대표 중심선·면·hole이 공통 FinalGlyphInk를 사용한다.
- [ ] SVG와 prototype OTF가 같은 FinalGlyphInk를 소비한다.
- [ ] 사선·곡률·OpticalOverride·67개 자모·11,172자 확장이 섞이지 않는다.

---

## 18. 핵심 한 문장

> 신규 네모꼴 프로젝트는 고정 Body 경계 두 선과 가변 배치선 세 선을 glyph-normalized layout Rail로 저장하고, 7개 레이아웃은 기존 part edge binding으로 기본 Frame을 파생하며, 기존 보정과 Shape 선·면·hole은 하나의 결정적 경로를 거쳐 화면과 대표 OTF에 전달된다.
