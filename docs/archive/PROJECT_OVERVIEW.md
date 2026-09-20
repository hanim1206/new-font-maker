# 한글 폰트 메이커 (Font Maker) - 프로젝트 분석 문서

> 최종 업데이트: 2026-01-18
> 버전: 0.0.0 (Active Development)

---

## 목차

1. [프로젝트 개요](#1-프로젝트-개요)
2. [기술 스택](#2-기술-스택)
3. [시스템 아키텍처](#3-시스템-아키텍처)
4. [핵심 개념](#4-핵심-개념)
5. [주요 기능](#5-주요-기능)
6. [UI/UX 구조](#6-uiux-구조)
7. [현재 구현 상태](#7-현재-구현-상태)
8. [향후 방향성 고려사항](#8-향후-방향성-고려사항)
9. [핵심 파일 가이드](#9-핵심-파일-가이드)
10. [개발 명령어](#10-개발-명령어)

---

## 1. 프로젝트 개요

### 1.1 프로젝트 정의

**한글 폰트 메이커**는 웹 기반 한글 폰트 디자인 도구입니다.

사용자가 한글 자모(초성, 중성, 종성)의 획을 개별적으로 편집하고, 레이아웃 프리셋을 디자인하여 커스텀 폰트를 제작할 수 있습니다.

### 1.2 핵심 가치

| 가치 | 설명 |
|------|------|
| **시각적 폰트 디자인** | 코드 없이 시각적 인터페이스로 폰트 디자인 |
| **한글 특화** | 한글 음절 조합 규칙을 반영한 10가지 레이아웃 시스템 |
| **실시간 미리보기** | 변경 사항을 즉시 확인 가능 |
| **정밀 편집** | 0.01 단위의 정밀한 획 위치/크기 조절 |
| **오프라인 지원** | PWA로 오프라인에서도 사용 가능 |

### 1.3 타겟 사용자

- 한글 폰트 디자이너
- 그래픽 디자이너
- 타이포그래피에 관심 있는 개발자
- 교육 목적 (한글 구조 학습)

---

## 2. 기술 스택

### 2.1 핵심 기술

| 분류 | 기술 | 버전 | 역할 |
|------|------|------|------|
| 프레임워크 | React | 19.1.0 | UI 컴포넌트 |
| 언어 | TypeScript | 5.8.3 | 타입 안정성 |
| 빌드 도구 | Vite | 5.0 | 개발/빌드 |
| 상태 관리 | Zustand + Immer | 5.0.9 | 전역 상태 |
| 폼 핸들링 | React Hook Form | 7.61.1 | 폼 입력 관리 |
| 스타일링 | CSS Modules | - | 스코프된 스타일 |
| PWA | Vite PWA + Workbox | 1.2.0 / 7.4.0 | 오프라인 지원 |

### 2.2 의존성 구조

```
dependencies (6개)
├── react, react-dom    # UI 프레임워크
├── zustand + immer     # 상태 관리
├── react-hook-form     # 폼 핸들링
└── vite-plugin-pwa + workbox  # PWA

devDependencies (8개)
├── typescript + @types/*  # 타입 시스템
├── vite + @vitejs/*       # 빌드 도구
└── eslint + plugins       # 코드 품질
```

---

## 3. 시스템 아키텍처

### 3.1 프로젝트 구조

```
src/
├── components/                 # React 컴포넌트 (15개, 5개 영역)
│   ├── ControlPanel/          # 좌측 사이드바 - 레이아웃/자모 선택
│   │   └── ControlPanel.tsx
│   │
│   ├── PreviewPanel/          # 우측 상단 - 텍스트 입력 및 미리보기
│   │   └── PreviewPanel.tsx
│   │
│   ├── EditorPanel/           # 우측 하단 - 편집기 디스패치
│   │   ├── EditorPanel.tsx    # 레이아웃/자모 에디터 라우팅
│   │   ├── LayoutEditor.tsx   # 레이아웃 편집 (Split/Padding)
│   │   ├── JamoEditor.tsx     # 자모 획 편집
│   │   └── SplitEditor.tsx    # Split/Padding 슬라이더
│   │
│   ├── CharacterEditor/       # 획 편집 세부 UI
│   │   ├── CharacterPreview.tsx   # 자모 SVG 렌더링
│   │   ├── StrokeList.tsx         # 획 목록
│   │   ├── StrokeEditor.tsx       # 키보드 컨트롤
│   │   └── StrokeInspector.tsx    # 숫자 입력 필드
│   │
│   └── BoxEditor/             # [Legacy - SplitEditor로 대체됨]
│
├── stores/                     # Zustand 상태 관리
│   ├── uiStore.ts             # UI 상태 (viewMode, 선택 상태 등)
│   └── layoutStore.ts         # 레이아웃 스키마 및 설정
│
├── data/                       # 정적 데이터
│   ├── Hangul.ts              # 자모별 획 데이터 (790줄)
│   │                          # CHOSEONG_MAP(19), JUNGSEONG_MAP(21), JONGSEONG_MAP(27)
│   └── layoutConfigs.ts       # 기본 레이아웃 스키마
│
├── renderers/                  # 렌더링 엔진
│   └── SvgRenderer.tsx        # SVG 기반 폰트 렌더링
│
├── utils/                      # 유틸리티 함수
│   ├── hangulUtils.ts         # 음절 분해, 레이아웃 분류
│   ├── layoutCalculator.ts    # 박스 위치 계산
│   └── storage.ts             # LocalStorage 저장
│
├── types/                      # 타입 정의
│   └── index.ts               # 핵심 인터페이스 (133줄)
│
├── App.tsx                     # 메인 앱 (반응형 레이아웃)
├── App.css                     # 메인 스타일
├── main.tsx                    # 엔트리 포인트
└── index.css                   # 글로벌 스타일
```

### 3.2 데이터 흐름 파이프라인

```
┌─────────────────────────────────────────────────────────────────┐
│                      사용자 입력 (한글 텍스트)                    │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  decomposeSyllable()  [hangulUtils.ts]                          │
│  음절 → 초성/중성/종성 분해                                       │
│  예: "한" → { choseong: 'ㅎ', jungseong: 'ㅏ', jongseong: 'ㄴ' } │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  classifyLayout()  [hangulUtils.ts]                             │
│  자모 조합에 따른 레이아웃 타입 결정 (10종)                        │
│  예: 초성 + 세로중성 + 종성 → 'choseong-jungseong-vertical-jongseong' │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  getLayoutSchema()  [layoutStore.ts]                            │
│  레이아웃 스키마 조회 (Split + Padding 정보)                      │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  calculateBoxes()  [layoutCalculator.ts]                        │
│  Split/Padding → BoxConfig 계산                                  │
│  예: { x: 0.05, y: 0.05, width: 0.45, height: 0.5 }            │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  Hangul.ts에서 획 데이터 조회                                    │
│  CHOSEONG_MAP['ㅎ'].strokes → 획 배열                           │
└───────────────────────────┬─────────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│  SvgRenderer.tsx                                                 │
│  SVG 렌더링 (박스 경계 + 획 위치 스케일링)                        │
└─────────────────────────────────────────────────────────────────┘
```

### 3.3 상태 관리 구조

#### UIStore (uiStore.ts)
```typescript
interface UIState {
  // 뷰 모드
  viewMode: 'preview' | 'presets' | 'editor'
  isMobile: boolean

  // 텍스트 입력
  inputText: string
  selectedCharIndex: number

  // 편집 모드
  controlMode: 'layout' | 'jamo' | null
  selectedLayoutType: LayoutType | null

  // 자모 편집
  editingJamoType: 'choseong' | 'jungseong' | 'jongseong' | null
  editingJamoChar: string | null
  selectedStrokeId: string | null
}
```

#### LayoutStore (layoutStore.ts)
```typescript
interface LayoutState {
  layoutSchemas: Record<LayoutType, LayoutSchema>
  layoutConfigs: Record<LayoutType, LayoutConfig>

  // 액션
  getLayoutSchema: (layoutType: LayoutType) => LayoutSchema
  updateSplit: (layoutType: LayoutType, splitIndex: number, value: number) => void
  updatePadding: (layoutType: LayoutType, side: string, value: number) => void
  getCalculatedBoxes: (layoutType: LayoutType) => BoxConfig[]
  resetLayoutSchema: (layoutType: LayoutType) => void
}
```

---

## 4. 핵심 개념

### 4.1 레이아웃 타입 (10종)

한글 음절의 자모 조합에 따라 10가지 레이아웃 타입을 지원합니다.

| 타입 ID | 설명 | 구성 | 예시 |
|---------|------|------|------|
| `choseong-only` | 초성만 | CH | ㄱ, ㄴ, ㅁ |
| `jungseong-vertical-only` | 세로 중성만 | JU | ㅏ, ㅓ, ㅣ |
| `jungseong-horizontal-only` | 가로 중성만 | JU | ㅗ, ㅜ, ㅡ |
| `jungseong-mixed-only` | 혼합 중성만 | JU_H + JU_V | ㅘ, ㅙ, ㅢ |
| `choseong-jungseong-vertical` | 초성 + 세로 중성 | CH + JU | 가, 너, 미 |
| `choseong-jungseong-horizontal` | 초성 + 가로 중성 | CH + JU | 고, 누, 므 |
| `choseong-jungseong-mixed` | 초성 + 혼합 중성 | CH + JU_H + JU_V | 과, 궈, 의 |
| `choseong-jungseong-vertical-jongseong` | 초성 + 세로 중성 + 종성 | CH + JU + JO | 강, 넌, 밈 |
| `choseong-jungseong-horizontal-jongseong` | 초성 + 가로 중성 + 종성 | CH + JU + JO | 공, 눈, 믐 |
| `choseong-jungseong-mixed-jongseong` | 초성 + 혼합 중성 + 종성 | CH + JU_H + JU_V + JO | 광, 권, 읜 |

### 4.2 중성 분류

| 분류 | 자모 | 배치 위치 |
|------|------|-----------|
| **세로 중성** | ㅏ, ㅐ, ㅑ, ㅒ, ㅓ, ㅔ, ㅕ, ㅖ, ㅣ | 초성의 **오른쪽** |
| **가로 중성** | ㅗ, ㅛ, ㅜ, ㅠ, ㅡ | 초성의 **아래쪽** |
| **혼합 중성** | ㅘ, ㅙ, ㅚ, ㅝ, ㅞ, ㅟ, ㅢ | 초성의 **오른쪽 + 아래쪽** |

### 4.3 Split + Padding 레이아웃 시스템

레이아웃은 **Split(분할선) + Padding(여백)** 시스템으로 정의됩니다.

```typescript
interface LayoutSchema {
  id: LayoutType
  slots: Part[]           // 렌더링할 파트 ['CH', 'JU', 'JO'] 등
  splits?: Split[]        // 공간 분할선 (0~1 비율)
  padding?: Padding       // 내부 여백 (top, bottom, left, right)
  mixedJungseong?: {      // 혼합 중성용 추가 설정
    horizontalBox?: { splitY?: number; padding?: Padding }
    verticalBox?: { splitX?: number; padding?: Padding }
  }
}

interface Split {
  axis: 'x' | 'y'         // 분할 축
  value: number           // 0~1 비율
}
```

**Split 시스템의 장점:**
- Raw 좌표(x, y, width, height)보다 직관적
- 분할 비율만 조절하면 박스 크기가 자동 계산
- 일관된 디자인 유지 용이

### 4.4 획(Stroke) 시스템

각 자모는 여러 개의 획으로 구성됩니다.

```typescript
interface StrokeData {
  id: string                           // 예: 'ㄱ-1'
  x: number                            // 0~1 정규화 좌표
  y: number
  width: number                        // 0~1 정규화 크기
  height: number
  direction: 'horizontal' | 'vertical' // 획 방향
}
```

**정규화 좌표계 (0~1)의 장점:**
- 해상도 독립적 디자인
- 어떤 크기의 박스에도 스케일링 가능
- 일관된 비율 유지

### 4.5 혼합 중성 처리

혼합 중성(ㅘ, ㅙ 등)은 가로획과 세로획을 분리하여 저장합니다.

```typescript
interface JamoData {
  char: string
  type: 'choseong' | 'jungseong' | 'jongseong'

  // 일반 자모
  strokes?: StrokeData[]

  // 혼합 중성 전용
  horizontalStrokes?: StrokeData[]  // 가로 획 (JU_H 박스에 렌더링)
  verticalStrokes?: StrokeData[]    // 세로 획 (JU_V 박스에 렌더링)
}
```

---

## 5. 주요 기능

### 5.1 레이아웃 편집 모드

**목적**: 레이아웃 타입별 박스 배치 조절

| 기능 | 설명 |
|------|------|
| Split 조절 | 슬라이더로 분할선 위치 조절 |
| Padding 조절 | 상/하/좌/우 여백 조절 |
| 실시간 미리보기 | 변경 사항 즉시 반영 |
| 테스트 문자 선택 | 각 레이아웃에 적합한 테스트 문자 자동 선택 |
| 저장/초기화 | 변경 저장 및 기본값 복원 |
| 코드 내보내기 | 콘솔에 스키마/박스 좌표 출력 |

### 5.2 자모 편집 모드

**목적**: 개별 자모의 획 위치/크기 조절

**편집 방법:**

| 조작 | 기능 |
|------|------|
| 클릭 | 획 선택 |
| 화살표 키 | 획 이동 (±0.01) |
| Shift + 화살표 | 획 크기 조절 (±0.01) |
| 숫자 입력 | StrokeInspector에서 정밀값 직접 입력 |

**지원 자모:**
- **초성 (19자)**: ㄱ, ㄲ, ㄴ, ㄷ, ㄸ, ㄹ, ㅁ, ㅂ, ㅃ, ㅅ, ㅆ, ㅇ, ㅈ, ㅉ, ㅊ, ㅋ, ㅌ, ㅍ, ㅎ
- **중성 (21자)**: ㅏ, ㅐ, ㅑ, ㅒ, ㅓ, ㅔ, ㅕ, ㅖ, ㅗ, ㅘ, ㅙ, ㅚ, ㅛ, ㅜ, ㅝ, ㅞ, ㅟ, ㅠ, ㅡ, ㅢ, ㅣ
- **종성 (27자)**: 빈 종성 포함

### 5.3 미리보기 패널

| 기능 | 설명 |
|------|------|
| 텍스트 입력 | 미리볼 한글 텍스트 입력 |
| 문자별 그리드 | 각 글자를 SVG로 렌더링 |
| 자모 정보 표시 | 선택된 문자의 초성/중성/종성 분해 정보 |
| 디버그 모드 | 박스 경계선 시각화 토글 |

---

## 6. UI/UX 구조

### 6.1 데스크톱 레이아웃 (>768px)

```
┌─────────────────────────────────────────────────────────┐
│                      Font Maker                          │
├────────────────┬────────────────────────────────────────┤
│                │            Preview Panel               │
│    Control     │  ┌──────────────────────────────────┐  │
│    Panel       │  │  [텍스트 입력 영역]               │  │
│                │  │  [미리보기 그리드]                │  │
│  ┌──────────┐  │  └──────────────────────────────────┘  │
│  │ 레이아웃  │  ├────────────────────────────────────────┤
│  │  선택    │  │            Editor Panel               │
│  └──────────┘  │  ┌──────────────────────────────────┐  │
│  ┌──────────┐  │  │  [레이아웃 에디터]                │  │
│  │ 자모     │  │  │     또는                         │  │
│  │ 버튼들   │  │  │  [자모 에디터]                   │  │
│  └──────────┘  │  └──────────────────────────────────┘  │
└────────────────┴────────────────────────────────────────┘
```

### 6.2 모바일 레이아웃 (≤768px)

```
┌─────────────────────────┐
│       Font Maker        │
├─────────────────────────┤
│ [리모콘▼][미리보기▼][편집▼] │  ← 3개 탭 네비게이션
├─────────────────────────┤
│                         │
│    (선택된 탭 내용)      │
│                         │
└─────────────────────────┘
```

### 6.3 컴포넌트 관계도

```
App.tsx
├── ControlPanel
│   └── 레이아웃 타입/자모 선택 → uiStore 업데이트
│
├── PreviewPanel
│   ├── 텍스트 입력 → inputText 업데이트
│   ├── 문자 선택 → selectedCharIndex 업데이트
│   └── SvgRenderer로 각 문자 렌더링
│
└── EditorPanel (controlMode에 따라 조건부 렌더링)
    │
    ├── [controlMode === 'layout']
    │   └── LayoutEditor
    │       ├── SplitEditor (슬라이더)
    │       ├── 실시간 미리보기
    │       └── 저장/초기화 버튼
    │
    └── [controlMode === 'jamo']
        └── JamoEditor
            ├── StrokeList (획 목록)
            ├── CharacterPreview (대형 SVG)
            ├── StrokeInspector (수치 입력)
            ├── StrokeEditor (키보드 핸들러)
            └── 저장/초기화 버튼
```

---

## 7. 현재 구현 상태

### 7.1 완료된 기능

| 기능 | 상태 | 세부 사항 |
|------|:----:|----------|
| 한글 음절 분해 | ✅ | Unicode 기반 초성/중성/종성 분리 |
| 레이아웃 스키마 시스템 | ✅ | Split + Padding 기반 10가지 레이아웃 |
| SVG 렌더링 엔진 | ✅ | 정규화 좌표, 박스별 스케일링 |
| 자모 획 편집 | ✅ | 키보드 + 마우스 + 숫자 입력 |
| 레이아웃 편집 | ✅ | 슬라이더 기반 Split/Padding 조절 |
| 실시간 미리보기 | ✅ | 디버그 박스 오버레이 포함 |
| 반응형 UI | ✅ | 데스크톱/모바일 레이아웃 |
| 상태 관리 | ✅ | Zustand + Immer |
| PWA 지원 | ✅ | 오프라인 사용 가능, 설치 가능 |
| LocalStorage 저장 | ✅ | 프리셋/규칙/UI 상태 저장 |
| 코드 내보내기 | ✅ | 콘솔에 TypeScript 코드 출력 |

### 7.2 미구현/부분 구현

| 기능 | 상태 | 비고 |
|------|:----:|------|
| 규칙 시스템 UI | ⏳ | 타입 정의됨, UI 미구현 |
| Undo/Redo | ⏳ | 인프라 존재, 활성화 필요 |
| 폰트 파일 내보내기 | ⏳ | OTF/TTF/WOFF 미지원 |
| 프리셋 관리 UI | ⏳ | 저장/불러오기 부분 구현 |
| 다중 프리셋 지원 | ⏳ | 미구현 |
| 획 추가/삭제 | ⏳ | 기존 획 수정만 가능 |

### 7.3 레거시 코드

| 위치 | 설명 |
|------|------|
| `src/components/BoxEditor/` | SplitEditor로 대체됨, 제거 가능 |

---

## 8. 향후 방향성 고려사항

### 8.1 기능 로드맵

#### Phase 1: 기본 기능 완성

| 기능 | 우선순위 | 복잡도 | 설명 |
|------|:--------:|:------:|------|
| 규칙 시스템 UI | 높음 | 중간 | 조건부 레이아웃 조정 기능 |
| Undo/Redo | 높음 | 낮음 | 편집 히스토리 관리 |
| 획 추가/삭제 | 높음 | 중간 | 새로운 획 생성 및 삭제 |
| 프리셋 관리 UI | 중간 | 낮음 | 프리셋 저장/불러오기/삭제 |

#### Phase 2: 사용성 개선

| 기능 | 우선순위 | 복잡도 | 설명 |
|------|:--------:|:------:|------|
| 폰트 파일 내보내기 | 높음 | 높음 | OTF/TTF/WOFF 생성 |
| 작업 저장/불러오기 | 중간 | 낮음 | JSON 형태 전체 저장 |
| 튜토리얼/가이드 | 중간 | 낮음 | 신규 사용자 온보딩 |
| 드래그 앤 드롭 편집 | 중간 | 중간 | 마우스로 획 직접 이동 |

#### Phase 3: 확장성

| 기능 | 우선순위 | 복잡도 | 설명 |
|------|:--------:|:------:|------|
| 클라우드 저장 | 낮음 | 높음 | 계정 기반 저장 |
| 폰트 공유/마켓플레이스 | 낮음 | 높음 | 커뮤니티 기능 |
| 베지어 곡선 지원 | 낮음 | 높음 | 곡선 획 편집 |
| 다국어 지원 | 낮음 | 낮음 | i18n |

### 8.2 아키텍처 강점 (유지해야 할 설계)

| 설계 결정 | 장점 |
|----------|------|
| Split + Padding 시스템 | 직관적인 레이아웃 조절, 일관성 유지 |
| 정규화 좌표 (0~1) | 해상도 독립적, 확장성 높음 |
| 획 방향 인식 | 가로/세로 두께 독립 처리 가능 |
| 혼합 중성 분리 | horizontalStrokes/verticalStrokes로 정확한 배치 |
| 키보드 우선 편집 | 정밀한 조작, 빠른 워크플로우 |
| 타입 안정성 | TypeScript로 버그 예방 |

### 8.3 기술적 고려사항

#### 폰트 파일 생성
- **후보 라이브러리**: opentype.js, fontkit, Fontello
- **도전 과제**: 직선 획 → 벡터 경로 변환
- **권장**: opentype.js로 시작, 점진적 확장

#### 곡선 지원
- **현재**: 직선 획만 지원
- **확장 방향**: 베지어 곡선 편집 도구
- **복잡도**: UI/UX 및 데이터 구조 변경 필요

#### 성능 최적화
- **대상**: 복잡한 폰트 미리보기
- **방법**: React.memo, useMemo, 가상화
- **우선순위**: 기능 완성 후 고려

---

## 9. 핵심 파일 가이드

### 9.1 로직별 파일

| 목적 | 파일 | 주요 함수/컴포넌트 |
|------|------|-------------------|
| 한글 분해 로직 | `src/utils/hangulUtils.ts` | `decomposeSyllable()`, `classifyJungseong()` |
| 박스 계산 로직 | `src/utils/layoutCalculator.ts` | `calculateBoxes()` |
| SVG 렌더링 | `src/renderers/SvgRenderer.tsx` | `SvgRenderer` 컴포넌트 |
| UI 상태 관리 | `src/stores/uiStore.ts` | `useUIStore` |
| 레이아웃 스키마 | `src/stores/layoutStore.ts` | `useLayoutStore` |
| 자모 획 데이터 | `src/data/Hangul.ts` | `CHOSEONG_MAP`, `JUNGSEONG_MAP`, `JONGSEONG_MAP` |
| 타입 정의 | `src/types/index.ts` | `LayoutType`, `BoxConfig`, `StrokeData` 등 |

### 9.2 컴포넌트별 파일

| 영역 | 파일 | 역할 |
|------|------|------|
| 메인 앱 | `src/App.tsx` | 레이아웃, 반응형 감지 |
| 컨트롤 패널 | `src/components/ControlPanel/ControlPanel.tsx` | 레이아웃/자모 선택 |
| 미리보기 | `src/components/PreviewPanel/PreviewPanel.tsx` | 텍스트 입력, 문자 그리드 |
| 에디터 라우터 | `src/components/EditorPanel/EditorPanel.tsx` | 레이아웃/자모 에디터 전환 |
| 레이아웃 에디터 | `src/components/EditorPanel/LayoutEditor.tsx` | Split/Padding 편집 |
| 자모 에디터 | `src/components/EditorPanel/JamoEditor.tsx` | 획 편집 |

---

## 10. 개발 명령어

```bash
# 개발 서버 실행 (Hot Reload)
npm run dev

# 프로덕션 빌드
npm run build

# 린트 검사
npm run lint

# 프로덕션 미리보기
npm run preview
```

---

## 부록: 용어 정리

| 용어 | 영문 | 설명 |
|------|------|------|
| 초성 | Choseong | 한글 음절의 첫소리 (ㄱ, ㄴ, ㄷ 등) |
| 중성 | Jungseong | 한글 음절의 중간소리 - 모음 (ㅏ, ㅓ, ㅗ 등) |
| 종성 | Jongseong | 한글 음절의 끝소리 - 받침 (ㄱ, ㄴ, ㅁ 등) |
| 자모 | Jamo | 한글 낱글자 (초성, 중성, 종성의 총칭) |
| 획 | Stroke | 자모를 구성하는 개별 선 |
| Split | - | 공간을 분할하는 기준선 (0~1 비율) |
| Padding | - | 박스 내부 여백 |
| BoxConfig | - | 박스의 위치와 크기 (x, y, width, height) |
| 정규화 좌표 | Normalized Coordinates | 0~1 범위의 상대적 좌표계 |
| Part | - | 렌더링 단위 (CH, JU, JU_H, JU_V, JO) |

---

## 부록: 데이터 저장 구조

### LocalStorage 키

| 키 | 내용 |
|-----|------|
| `font-maker-presets` | 레이아웃 프리셋 데이터 |
| `font-maker-rules` | 규칙 정의 (미사용) |
| `font-maker-ui-state` | UI 상태 (입력 텍스트 등) |

### 내보내기 형식

현재는 **콘솔에 TypeScript 코드**로 출력됩니다:

```typescript
// 획 데이터 내보내기 예시
'ㄱ': {
  char: 'ㄱ',
  type: 'choseong',
  strokes: [
    h('ㄱ-1', 0.1, 0.15, 0.7, 0.15),
    v('ㄱ-2', 0.7, 0.15, 0.15, 0.7),
  ],
},

// 레이아웃 스키마 내보내기 예시
'choseong-jungseong-vertical': {
  id: 'choseong-jungseong-vertical',
  slots: ['CH', 'JU'],
  splits: [{ axis: 'x', value: 0.5 }],
  padding: { top: 0.05, bottom: 0.05, left: 0.05, right: 0.05 },
}
```
