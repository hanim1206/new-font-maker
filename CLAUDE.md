# CLAUDE.md

이 문서는 AI 어시스턴트가 한글 폰트 메이커 코드베이스에서 작업할 때 참고하는 가이드입니다.

## 프로젝트 개요

React + TypeScript 기반의 웹 한글 폰트 디자인 도구입니다. 사용자가 한글 자모(초성, 중성, 종성)의 획을 개별적으로 편집하고, 10가지 한글 음절 조합 패턴에 대한 레이아웃 프리셋을 조정하여 커스텀 폰트를 제작할 수 있습니다. 모든 좌표는 해상도 독립적인 0–1 정규화 좌표계를 사용합니다.

## 기술 스택

- **프레임워크:** React 19.1 (함수형 컴포넌트, 훅만 사용)
- **언어:** TypeScript 5.8 (strict 모드)
- **빌드:** Vite 5.0 (번들링 전 `tsc -b`로 타입 검사)
- **상태 관리:** Zustand 5.0 + Immer 11.1 (`set(state => { state.x = y })` 패턴으로 불변 업데이트)
- **폼:** React Hook Form 7.61
- **스타일링:** CSS Modules (`.module.css`) + 전역 CSS
- **PWA:** vite-plugin-pwa + Workbox 7.4 (오프라인 우선, 설치 가능)
- **린팅:** ESLint 9 (flat config) + typescript-eslint, react-hooks, react-refresh 플러그인
- **테스트 프레임워크:** 현재 미설정

## 개발 명령어

```bash
npm run dev       # Vite 개발 서버 실행 (HMR)
npm run build     # TypeScript 타입 검사 + Vite 프로덕션 빌드
npm run lint      # ESLint 검사
npm run preview   # 프로덕션 빌드 로컬 미리보기
```

## 프로젝트 구조

```
src/
├── components/               # React UI 컴포넌트
│   ├── ControlPanel/         # 좌측 사이드바 – 레이아웃 타입/자모 선택
│   ├── PreviewPanel/         # 우측 상단 – 텍스트 입력 및 실시간 미리보기
│   ├── EditorPanel/          # 우측 하단 – 편집기 디스패처
│   │   ├── EditorPanel.tsx   # 레이아웃/자모 에디터 전환 라우팅
│   │   ├── LayoutEditor.tsx  # Split/Padding 슬라이더 편집
│   │   ├── JamoEditor.tsx    # 획 단위 자모 편집
│   │   └── SplitEditor.tsx   # 재사용 가능한 Split/Padding 슬라이더
│   ├── CharacterEditor/      # 획 편집 세부 컴포넌트
│   │   ├── CharacterPreview.tsx  # 자모 대형 SVG 미리보기
│   │   ├── StrokeList.tsx        # 획 목록 및 선택
│   │   ├── StrokeEditor.tsx      # 키보드 기반 획 조절
│   │   └── StrokeInspector.tsx   # 숫자 입력 필드 (정밀 편집)
│   └── BoxEditor/            # [레거시] SplitEditor로 대체됨, 확장하지 말 것
├── stores/                   # Zustand 상태 저장소
│   ├── uiStore.ts            # UI 상태: 뷰 모드, 선택 상태 (비영속)
│   ├── layoutStore.ts        # 레이아웃 스키마 (localStorage 영속)
│   └── jamoStore.ts          # 자모 획 데이터 (localStorage 영속)
├── data/                     # 정적 데이터
│   ├── Hangul.ts             # 자모별 획 맵: CHOSEONG_MAP, JUNGSEONG_MAP, JONGSEONG_MAP
│   ├── baseJamos.json        # 67개 자모 기본 획 데이터
│   ├── basePresets.json      # 10개 기본 레이아웃 스키마 정의
│   └── layoutConfigs.ts      # 레이아웃 설정 헬퍼 + DEFAULT_LAYOUT_CONFIGS
├── renderers/
│   └── SvgRenderer.tsx       # 핵심 SVG 렌더링 엔진
├── utils/
│   ├── hangulUtils.ts        # decomposeSyllable(), classifyLayout(), classifyJungseong()
│   ├── layoutCalculator.ts   # calculateBoxes() – Split/Padding → BoxConfig 변환
│   ├── pathUtils.ts          # 베지어 곡선 유틸리티
│   └── storage.ts            # LocalStorage 헬퍼
├── types/
│   └── index.ts              # 모든 핵심 TypeScript 인터페이스 및 타입
├── App.tsx                   # 루트 컴포넌트 (반응형 레이아웃)
├── App.css                   # 메인 앱 스타일
├── main.tsx                  # 엔트리 포인트
└── index.css                 # 전역 스타일
```

## 아키텍처 및 데이터 흐름

한글 음절의 렌더링 파이프라인:

1. **분해** – `decomposeSyllable("한")` → `{ choseong: 'ㅎ', jungseong: 'ㅏ', jongseong: 'ㄴ' }`
2. **분류** – `classifyLayout(분해결과)` → `LayoutType` (10가지 중 하나)
3. **스키마 조회** – `layoutStore.getLayoutSchema(type)` → `LayoutSchema` (splits + padding)
4. **박스 계산** – `calculateBoxes(schema)` → `Partial<Record<Part, BoxConfig>>` (0–1 좌표)
5. **획 데이터 조회** – `CHOSEONG_MAP['ㅎ'].strokes` → 획 배열
6. **렌더링** – `SvgRenderer`가 획을 계산된 박스에 스케일링 → SVG 출력

### 상태 관리

Zustand 스토어 3개, 공통 패턴:

```typescript
export const useStore = create<State & Actions>()(
  persist(           // 선택사항 – layoutStore, jamoStore에서 사용
    immer((set, get) => ({
      // 상태 필드
      key: value,
      // 액션: Immer 드래프트를 직접 변형
      setKey: (val) => set((state) => { state.key = val }),
    })),
    { name: '저장소-키', partialize: (state) => ({ /* 영속화할 부분 */ }) }
  )
)
```

| 스토어 | 영속화 | 용도 |
|--------|--------|------|
| `uiStore` | 안 함 | 뷰 모드, 선택 상태, 편집 컨텍스트 |
| `layoutStore` | `font-maker-layout-schemas` | 10가지 레이아웃 타입별 스키마 |
| `jamoStore` | `font-maker-jamo-data` | 67개 자모의 획 데이터 |

### 레이아웃 타입 (10종)

| 타입 | 구성 파트 | 예시 |
|------|-----------|------|
| `choseong-only` | CH | ㄱ, ㄴ |
| `jungseong-vertical-only` | JU | ㅏ, ㅓ |
| `jungseong-horizontal-only` | JU | ㅗ, ㅜ |
| `jungseong-mixed-only` | JU_H + JU_V | ㅘ, ㅢ |
| `choseong-jungseong-vertical` | CH + JU | 가, 너 |
| `choseong-jungseong-horizontal` | CH + JU | 고, 누 |
| `choseong-jungseong-mixed` | CH + JU_H + JU_V | 과, 의 |
| `choseong-jungseong-vertical-jongseong` | CH + JU + JO | 강, 넌 |
| `choseong-jungseong-horizontal-jongseong` | CH + JU + JO | 공, 눈 |
| `choseong-jungseong-mixed-jongseong` | CH + JU_H + JU_V + JO | 광, 권 |

파트 약어: `CH` = 초성, `JU` = 중성, `JU_H` = 혼합중성 가로부, `JU_V` = 혼합중성 세로부, `JO` = 종성

## 주요 컨벤션

### TypeScript

- **strict 모드** 활성화: `noUnusedLocals`, `noUnusedParameters`, `noFallthroughCasesInSwitch`
- Target: ES2022, Module: ESNext (bundler resolution)
- 모든 타입은 `src/types/index.ts`에 정의
- 획 타입은 구별된 유니온 사용: `RectStrokeData` (`direction: 'horizontal' | 'vertical'`) vs `PathStrokeData` (`direction: 'path'`)
- `StrokeData` 타입 좁히기 시 `isPathStroke(stroke)` 타입 가드 사용

### 컴포넌트

- 함수형 컴포넌트만 사용 (클래스 컴포넌트 금지)
- CSS Modules로 컴포넌트 스코프 스타일링
- 반응형: 데스크톱 (>768px) vs 모바일 (<=768px), 조건부 렌더링
- 이벤트 핸들러 접두사: `handle*`
- 상태 setter 접두사: `set*`

### 네이밍

- **코드 식별자**는 영문으로 작성
- **UI 레이블, 주석, 문서**는 한글로 작성
- 스토어 파일: `*Store.ts` → `use*Store` 내보내기
- 유틸리티 파일: `*Utils.ts`
- 참조 객체: `*_MAP` (예: `CHOSEONG_MAP`)

### 좌표계

- 모든 위치와 크기는 **0–1 정규화 좌표** 사용
- `BoxConfig`: `{ x, y, width, height }` 각각 0–1 범위
- `StrokeData`: `{ x, y, width, height }` 부모 박스 내 0–1 상대 좌표
- 해상도 독립적이며 어떤 크기로든 스케일링 가능

### 커밋 메시지

`COMMIT_CONVENTION.md`에 정의된 **Conventional Commits** 규칙 준수:

```
<type>(<scope>): <한글 제목>
```

- type과 scope는 영문, subject와 body는 한글
- Types: `feat`, `fix`, `docs`, `style`, `refactor`, `test`, `chore`, `perf`, `ci`, `build`
- 제목은 명령형 (~추가, ~수정, ~삭제)
- 제목 끝에 마침표 사용하지 않음
- AI 워터마크나 Co-Author 어트리뷰션 포함 금지

### 유지해야 할 설계 결정

다음 아키텍처 결정은 의도된 것이며 반드시 유지해야 함:

- **Split + Padding 레이아웃 시스템** (raw x/y/width/height가 아닌 분할선 + 여백 방식)
- **0–1 정규화 좌표계** 전체 적용
- **Zustand + Immer 패턴** (`set()` 내에서 드래프트 직접 변형)
- **스키마와 계산된 박스의 분리** (`layoutSchemas`는 영속화, `layoutConfigs`는 파생값)
- **키보드 우선 획 편집** (화살표 키 + Shift 수정자)
- **타입 안전한 스토어 패턴** (State와 Actions 인터페이스 분리)

## 관련 문서

- `PROJECT_OVERVIEW.md` – 상세 프로젝트 분석 (아키텍처, 데이터 흐름, 구현 상태, 로드맵)
- `COMMIT_CONVENTION.md` – 커밋 메시지 가이드라인

## 주요 작업 가이드

### 새로운 획 타입 추가
1. `src/types/index.ts`의 `StrokeData` 구별된 유니온에 새 타입 추가
2. 타입 가드 함수 추가
3. `SvgRenderer.tsx`에서 새 획 렌더링 처리
4. `CharacterEditor/` 컴포넌트에 편집 지원 추가

### 레이아웃 계산 수정
1. `src/utils/layoutCalculator.ts`의 `calculateBoxes()` 수정
2. 레이아웃 스토어가 `syncConfigFromSchema()`를 통해 `layoutConfigs`를 자동 동기화함

### 새로운 레이아웃 타입 추가
1. `src/types/index.ts`의 `LayoutType` 유니온에 리터럴 추가
2. `src/utils/hangulUtils.ts`에 분류 로직 추가
3. `src/data/basePresets.json`에 기본 스키마 추가
4. `src/utils/layoutCalculator.ts`에 계산 로직 추가

### 스토어 사용법
- 상태 읽기: `const value = useStore((s) => s.field)`
- 상태 변경: 액션에서 Immer 드래프트를 직접 변형 (새 객체를 반환하지 않음)
- 레이아웃 스토어는 `layoutSchemas`만 영속화하고, `layoutConfigs`는 hydration 시 재계산됨

## 주의사항

- `BoxEditor/`는 레거시 코드 (`SplitEditor`로 대체됨). 확장하지 말 것
- 규칙 시스템 (`Rule`, `Condition`, `Action` 타입)은 타입만 정의되어 있고 UI가 없음 — 향후 구현 예정
- 테스트 프레임워크 미설치. 테스트 추가 시 Vitest 권장 (Vite와 호환)
- `.gitignore`가 최소한(`node_modules`만 포함)이므로 `dist/`, `.env`, IDE 설정 파일을 커밋하지 않도록 주의
- 혼합중성(ㅘ, ㅢ 등)은 일반 `strokes` 배열 대신 `horizontalStrokes`와 `verticalStrokes`를 분리하여 사용
