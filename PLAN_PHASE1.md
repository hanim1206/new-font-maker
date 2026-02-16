# Phase 1 구현 계획

## 개요

편집 범위를 "글로벌 → 레이아웃 → 자모 → 획" 계층으로 구조화하고,
편집 중인 대상의 연관 샘플을 실시간으로 보여주는 것이 목표.

---

## 1. 글로벌 속성 시스템

### 1-1. globalStyleStore 신규 생성

```ts
// src/stores/globalStyleStore.ts
interface GlobalStyle {
  slant: number          // 기울기 (도, -30~30)
  weight: number         // 두께 배율 (0.5~2.0, 기본 1.0)
  letterSpacing: number  // 자간 (0~0.3)
}

interface GlobalStyleExclusion {
  id: string
  property: keyof GlobalStyle
  layoutType: LayoutType  // 이 레이아웃에서 해당 속성 제외
}

interface GlobalStyleState {
  style: GlobalStyle
  exclusions: GlobalStyleExclusion[]
  // actions
  updateStyle: (prop, value) => void
  addExclusion: (property, layoutType) => void
  removeExclusion: (id) => void
}
```

### 1-2. SvgRenderer에 글로벌 속성 반영

- `slant` → SVG `transform="skewX(angle)"` 적용
- `weight` → 각 획의 width/height에 배율 적용 (방향에 따라 가로획은 height, 세로획은 width)
- 렌더링 시 exclusion 목록 체크하여 해당 레이아웃이면 속성 스킵

### 1-3. GlobalStyleEditor 컴포넌트

- EditorPanel에 controlMode: 'global' 추가
- 슬라이더로 slant, weight 조절
- 제외 레이아웃 체크박스 목록

---

## 2. 패딩 글로벌 + 오버라이드

### 2-1. layoutStore 수정

```ts
// 추가할 상태
interface LayoutState {
  // 기존
  layoutSchemas: Record<LayoutType, LayoutSchema>
  layoutConfigs: Record<LayoutType, LayoutConfig>

  // 신규
  globalPadding: Padding           // 글로벌 기본 패딩
  paddingOverrides: Record<LayoutType, Partial<Padding>>  // 레이아웃별 오버라이드

  // 신규 actions
  updateGlobalPadding: (side, value) => void
  setPaddingOverride: (layoutType, side, value) => void
  removePaddingOverride: (layoutType) => void
}
```

### 2-2. 패딩 적용 로직

```ts
// 실제 패딩 = 글로벌 + 오버라이드 머지
function getEffectivePadding(layoutType: LayoutType): Padding {
  const global = globalPadding
  const override = paddingOverrides[layoutType]
  return { ...global, ...override }
}
```

### 2-3. SplitEditor 수정

- 기존 패딩 슬라이더 → "글로벌 패딩" 표시 + "이 레이아웃만 다르게" 토글
- 오버라이드 활성화 시 해당 레이아웃용 슬라이더 표시
- 글로벌 값과 다른 경우 시각적으로 표시 (색상 구분)

---

## 3. 획 편집 - 연관 슬롯 링크

### 3-1. 연관 자모 탐지 유틸

```ts
// src/utils/jamoLinkUtils.ts

// 초성↔종성 동일 글자 매핑
const CHOSEONG_JONGSEONG_SHARED = {
  'ㄱ': 'ㄱ', 'ㄲ': 'ㄲ', 'ㄴ': 'ㄴ', 'ㄷ': 'ㄷ',
  'ㄹ': 'ㄹ', 'ㅁ': 'ㅁ', 'ㅂ': 'ㅂ', 'ㅅ': 'ㅅ',
  'ㅆ': 'ㅆ', 'ㅇ': 'ㅇ', 'ㅈ': 'ㅈ', 'ㅊ': 'ㅊ',
  'ㅋ': 'ㅋ', 'ㅌ': 'ㅌ', 'ㅍ': 'ㅍ', 'ㅎ': 'ㅎ',
}

// 쌍자음/이중받침 내 구성 자모 매핑
const COMPOUND_JAMO_MAP = {
  'ㄲ': ['ㄱ'], 'ㄸ': ['ㄷ'], 'ㅃ': ['ㅂ'], 'ㅆ': ['ㅅ'], 'ㅉ': ['ㅈ'],
  'ㄳ': ['ㄱ','ㅅ'], 'ㄵ': ['ㄴ','ㅈ'], 'ㄶ': ['ㄴ','ㅎ'],
  'ㄺ': ['ㄹ','ㄱ'], 'ㄻ': ['ㄹ','ㅁ'], 'ㄼ': ['ㄹ','ㅂ'],
  'ㄽ': ['ㄹ','ㅅ'], 'ㄾ': ['ㄹ','ㅌ'], 'ㄿ': ['ㄹ','ㅍ'],
  'ㅀ': ['ㄹ','ㅎ'], 'ㅄ': ['ㅂ','ㅅ'],
}

function getLinkedSlots(type, char): LinkedSlot[] {
  // 초성 ㄱ 편집 중 → 종성 ㄱ, 쌍자음 ㄲ(초성), 이중받침 ㄳ·ㄺ(종성) 등 반환
}
```

### 3-2. JamoEditor에 링크 패널 추가

- 편집 중인 자모의 연관 슬롯 목록 표시
- 각 연관 슬롯마다 체크박스: "이 변경 함께 적용"
- 기본값: 체크 해제 (추천만 하고 유저가 선택)
- 저장 시 체크된 연관 슬롯에도 동일 변경 적용

---

## 4. 연관 샘플 미리보기

### 4-1. 샘플 생성 유틸

```ts
// src/utils/sampleGenerator.ts

interface SampleGroup {
  layoutType: LayoutType
  label: string        // "초+세로중", "초+가로중+종" 등
  samples: string[]    // ["가","거","기","그",...]
}

// 초성 편집 시: 해당 초성이 포함된 글자를 레이아웃별로 그룹핑
function generateChoseongSamples(char: string): SampleGroup[]

// 중성 편집 시: 해당 중성이 포함된 글자를 그룹핑
function generateJungseongSamples(char: string): SampleGroup[]

// 종성 편집 시: 해당 종성이 포함된 글자를 그룹핑
function generateJongseongSamples(char: string): SampleGroup[]

// 레이아웃 편집 시: 해당 레이아웃 타입의 대표 글자들
function generateLayoutSamples(layoutType: LayoutType): SampleGroup[]
```

샘플 생성 로직:
- 유니코드 조합 공식으로 글자 생성 (실제 유니코드 계산)
- 레이아웃별 대표 중성 선택: 세로=ㅏ, 가로=ㅗ, 혼합=ㅘ
- 받침 있는 경우: 대표 종성 ㄱ,ㄴ,ㅁ 정도
- 그룹당 최대 6~8글자로 제한 (UI 과밀 방지)

### 4-2. RelatedSamplesPanel 컴포넌트

```
┌──────────────────────────────────┐
│ 연관 샘플                         │
│                                  │
│ ── 초+세로중 ──                   │
│ [가] [거] [기] [겨] [게]          │
│                                  │
│ ── 초+가로중 ──                   │
│ [고] [구] [그] [교] [규]          │
│                                  │
│ ── 초+세로중+종 ──                │
│ [각] [건] [길] [겸] [겹]          │
│                                  │
│ ── 초+가로중+종 ──                │
│ [곡] [군] [글] [굼] [굽]          │
└──────────────────────────────────┘
```

- EditorPanel 하단 또는 우측에 배치
- 각 샘플은 SvgRenderer로 렌더링
- 편집 내용이 실시간으로 반영됨
- 샘플 클릭 시 해당 글자 상세 보기 가능

---

## 5. UI/UX 변경

### 5-1. ControlPanel 업데이트

controlMode에 'global' 추가:

```
편집 메뉴
├─ [글로벌 스타일]  ← 신규
├─ 선택된 글자: 한
│  ├─ 레이아웃: 초+세로중+종
│  ├─ 초성: ㅎ
│  ├─ 중성: ㅏ
│  └─ 종성: ㄴ
└─ [전체 목록 보기]
```

### 5-2. EditorPanel 라우팅

```
controlMode
├─ null     → 빈 상태
├─ 'global' → GlobalStyleEditor (신규)
├─ 'layout' → LayoutEditor (패딩 UI 수정)
└─ 'jamo'   → JamoEditor (링크 패널 + 샘플 추가)
```

### 5-3. uiStore 수정

```ts
// controlMode 타입 확장
controlMode: 'global' | 'layout' | 'jamo' | null
```

---

## 6. 구현 순서

### Step 1: 기반 작업
- [ ] globalStyleStore 생성
- [ ] layoutStore에 globalPadding + paddingOverrides 추가
- [ ] jamoLinkUtils 생성
- [ ] sampleGenerator 생성

### Step 2: 렌더링 파이프라인
- [ ] SvgRenderer에 글로벌 속성 (slant, weight) 적용
- [ ] SvgRenderer에 effective padding 적용
- [ ] 기존 LayoutSchema.padding → globalPadding 마이그레이션

### Step 3: UI 컴포넌트
- [ ] GlobalStyleEditor 컴포넌트 생성
- [ ] SplitEditor 패딩 UI 수정 (글로벌/오버라이드 토글)
- [ ] JamoEditor에 연관 슬롯 링크 패널 추가
- [ ] RelatedSamplesPanel 컴포넌트 생성

### Step 4: 통합
- [ ] ControlPanel에 글로벌 스타일 버튼 추가
- [ ] EditorPanel에 GlobalStyleEditor 라우팅 추가
- [ ] uiStore controlMode 타입 확장
- [ ] 전체 동작 검증

---

## Phase 2 (이후 - 잊지 말 것)
- 패턴/그룹 필터 시스템 (노션 필터식 조건 조합)
- 그룹별 예외 관리 (그룹 ID + 예외 그룹 목록)
- 전체 유니코드 프리뷰
- 개별 글자 예외처리
