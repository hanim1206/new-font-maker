# TTF 폰트 내보내기 파이프라인 기술 문서

## 개요

이 앱의 획(Stroke)은 **중심선 + 두께(thickness)** 로 정의되어 있다. SVG에서는 `stroke-width`로 자동 렌더링되지만, TTF 폰트는 **채워진 윤곽선(filled outline)** 만 지원한다. 따라서 중심선을 두께만큼 양쪽으로 확장해서 닫힌 윤곽 다각형으로 바꿔야 한다.

## 파이프라인 전체 흐름

```
[Zustand 스토어] → [GlyphData 수집] → [윤곽선 변환] → [opentype.js Path] → [TTF 다운로드]
     ①                   ②                  ③                 ④                ⑤
```

| 단계 | 파일 | 핵심 함수 | 하는 일 |
|------|------|-----------|---------|
| ① | 3개 스토어 | `getState()` | jamo, layout, globalStyle 데이터 읽기 |
| ② | `fontExportUtils.ts` | `collectAllGlyphData()` | SvgRenderer 로직 복제하여 11,223개 글리프 데이터 조립 |
| ③ | `strokeToOutline.ts` | `strokeToContours()` | 획 중심선 → 채워진 윤곽 컨투어 변환 |
| ④ | `fontGenerator.ts` | `contoursToPath()` | Contour[] → opentype.js Path 명령어 |
| ⑤ | `fontGenerator.ts` | `generateAndDownloadFont()` | 폰트 조립 + Blob 다운로드 |

---

## ① 스토어 데이터 접근

```typescript
// React 외부에서 스토어 직접 접근 (fontDataBridge.ts 패턴)
const jamoState = useJamoStore.getState()
const layoutState = useLayoutStore.getState()
const globalStyleState = useGlobalStyleStore.getState()
```

- `getState()` 패턴: React hook이 아니라 비동기/유틸 함수에서 스토어를 읽는 방법
- 반응형이 아닌 **스냅샷** — 호출 시점의 값만 읽음

---

## ② GlyphData 수집 (`fontExportUtils.ts`)

**가장 중요한 파일.** SvgRenderer.tsx의 렌더링 결정을 **정확히 복제**해야 한다. SVG 미리보기와 TTF 출력이 달라지면 여기가 원인.

### 복제해야 하는 SvgRenderer 로직

```
1. 실효 패딩 계산: globalPadding + layoutType별 override 머지
2. calculateBoxes(): LayoutSchema → 각 파트(CH, JU, JO 등)의 BoxConfig 계산
3. 자모 패딩 적용: 각 파트 박스에 자모별 패딩 적용
4. 혼합중성 처리: horizontalStrokes / verticalStrokes 분리 → JU_H, JU_V 박스에 각각 매핑
5. 오버라이드: 조건부 스트로크 오버라이드 적용
6. linecap 해석: 획별 linecap ?? 전역 linecap ?? 'round'
```

### 주요 상수

```typescript
export const UPM = 1000        // Units Per Em (폰트 좌표계 크기)
export const ASCENDER = 880    // 기준선 위 높이
export const DESCENDER = -120  // 기준선 아래 깊이
export const DEFAULT_ADVANCE_WIDTH = 1000  // 글리프 폭 (정사각)
```

### 글리프 범위

| 범위 | 유니코드 | 수량 | 설명 |
|------|----------|------|------|
| 완성형 | 0xAC00~0xD7A3 | 11,172개 | 가~힣 |
| 호환 자모 | 0x3131~0x3163 | 51개 | ㄱ~ㅣ |
| **합계** | | **11,223개** | |

### GlyphData 구조

```typescript
interface GlyphData {
  unicode: number
  char: string
  advanceWidth: number        // 보통 1000 (UPM)
  strokes: ResolvedStroke[]   // 획 + 박스 + linecap 정보
  weightMultiplier: number    // globalStyle에서 가져옴
  slant: number               // 기울기 (도)
}

interface ResolvedStroke {
  stroke: StrokeDataV2        // 원본 획 데이터
  box: BoxConfig              // 이 획이 렌더될 박스 (0-1)
  effectiveLinecap: StrokeLinecap  // 최종 결정된 linecap
}
```

---

## ③ 획 → 윤곽선 변환 (`strokeToOutline.ts`)

**이전에 오류가 많이 나던 핵심 부분.** 성공 포인트를 정리한다.

### 알고리즘: Subdivision + Perpendicular Offset

```
[중심선 베지어 곡선]
        │
        ▼
[N개 미세 직선으로 세분화] ← 적응적: arcLength / (halfWidth * 0.5)
        │
        ▼
[각 점에서 수직 방향으로 ±halfWidth 오프셋]
        │
        ├── left points (왼쪽 윤곽)
        └── right points (오른쪽 윤곽)
        │
        ▼
[Douglas-Peucker 단순화] ← tolerance = 0.5 UPM
        │
        ▼
[linecap 추가 (시작/끝)]
        │
        ▼
[닫힌 컨투어 완성]
```

### 좌표 변환 (가장 실수하기 쉬운 부분)

```
SVG 좌표계:  0-1 정규화, Y축 아래 방향 (↓)
폰트 좌표계: 0-1000 UPM, Y축 위 방향 (↑)
```

변환 공식:
```typescript
// 1. 박스 내 정규화 좌표 → SVG 절대 좌표
const svgX = (box.x + px * box.width) * upm   // 0-1 → 0-1000
const svgY = (box.y + py * box.height) * upm

// 2. Y축 뒤집기
const fontY = upm - svgY

// 3. 슬랜트 (기울기) 적용 — 중심 기준
const fontX = svgX + (fontY - upm / 2) * Math.tan(slant * Math.PI / 180)
```

**주의:** SvgRenderer에서 `skewX(-slant)`를 뷰박스 중심(50,50) 기준으로 적용하므로, 폰트에서도 `upm/2` 기준으로 슬랜트해야 한다.

### 세그먼트 타입 판별

pathUtils.ts의 `appendAnchorSegment()` 로직과 동일하게 구현해야 한다:

```
fromAnchor.handleOut 있음 + toAnchor.handleIn 있음  → Cubic Bezier
fromAnchor.handleOut만 있음                          → Quadratic → Cubic 승격
toAnchor.handleIn만 있음                             → Quadratic → Cubic 승격
둘 다 없음                                           → 직선 (Line)
```

### 비정방 비율 보정 (aspect ratio correction)

pathUtils.ts의 `adjustAnchorHandlesForAspectRatio()`를 복제한다. 닫힌 패스(예: ㅇ)에서 박스가 정사각이 아닐 때 베지어 핸들을 보정하여 럭비공 왜곡을 방지.

```typescript
const ratio = absWidth / absHeight
if (Math.abs(ratio - 1) > 0.05) {
  renderPoints = adjustAnchorHandlesForAspectRatio(points, ratio)
}
```

### Linecap (획 끝 모양)

| 타입 | 처리 |
|------|------|
| `butt` | 추가 점 없음 (직선으로 잘림) |
| `square` | halfWidth만큼 바깥으로 연장된 사각형 (2점 추가) |
| `round` | 반원 — kappa(0.5523) 기반 2개 Quarter Arc 베지어 (5점 추가) |

### 닫힌 획 (Closed Stroke) 처리

ㅇ 같은 닫힌 획은 **도넛형** 컨투어를 생성한다:
- 외곽(outer): **CW(시계방향)** = 채움
- 내곽(inner): **CCW(반시계방향)** = 구멍

도넛 판별 조건: `최소치수 > halfWidth * 2.5`

와인딩 방향 보장: **Shoelace Formula**로 부호 있는 면적 계산 → 방향이 틀리면 점 배열 reverse.

---

## ④ Contour → opentype.js Path (`fontGenerator.ts`)

```typescript
function contoursToPath(contours: Contour[]): opentype.Path {
  // ContourPoint.onCurve에 따라:
  // - true  → moveTo / lineTo
  // - false → off-curve 제어점 축적 후 curveTo (cubic) 또는 quadraticCurveTo
  // 각 컨투어 끝에 closePath()
}
```

### opentype.js Path 명령어

```
moveTo(x, y)              — 시작점
lineTo(x, y)              — 직선
curveTo(cp1x, cp1y, cp2x, cp2y, x, y)  — 3차 베지어
quadraticCurveTo(cpx, cpy, x, y)        — 2차 베지어
closePath()               — 닫기
```

---

## ⑤ 폰트 조립 + 다운로드 (`fontGenerator.ts`)

```typescript
const font = new opentype.Font({
  familyName,
  styleName: 'Regular',
  unitsPerEm: UPM,        // 1000
  ascender: ASCENDER,      // 880
  descender: DESCENDER,    // -120
  glyphs: [notdefGlyph, spaceGlyph, ...hangulGlyphs]
})

const buffer = font.toArrayBuffer()
// → Blob → ObjectURL → <a download>.click()
```

### 필수 글리프

| 글리프 | 유니코드 | 설명 |
|--------|----------|------|
| `.notdef` | - | 누락 글리프 표시용 (빈 사각형) |
| `space` | 0x0020 | 공백 문자 |

### 청크 처리

11,223개 글리프를 한번에 처리하면 UI가 멈추므로 100개씩 청크로 나눠 비동기 처리:

```typescript
async function processInChunks<T>(
  items: T[],
  chunkSize: number,     // 100
  processor: (item: T) => R,
  onProgress?: (completed: number, total: number) => void
): Promise<R[]>
```

각 청크 사이에 `await new Promise(resolve => setTimeout(resolve, 0))`로 이벤트 루프에 제어권을 넘긴다.

---

## 이전에 오류가 발생했던 주요 원인과 해결

### 1. 좌표 변환 불일치
**문제:** SVG와 폰트의 Y축 방향이 반대라서 글리프가 뒤집혀 나옴
**해결:** `fontY = upm - svgY` 적용, 슬랜트도 뒤집힌 Y 기준으로 계산

### 2. SvgRenderer 로직 불완전 복제
**문제:** 패딩, 혼합중성, 오버라이드 누락 시 글리프 위치/크기가 미리보기와 다름
**해결:** SvgRenderer.tsx의 모든 분기를 하나씩 읽고 정확히 복제. 특히:
- `computeEffectivePadding()`: globalPadding + override 머지
- 혼합중성의 `horizontalStrokes`/`verticalStrokes` 분리
- 자모별 패딩(`jamoPadding`) 박스 축소 적용

### 3. 베지어 곡선 오프셋 오류
**문제:** 복잡한 offset curve 알고리즘(Tiller-Hanson 등) 구현 시 자기교차 발생
**해결:** 단순한 Subdivision + Perpendicular Offset 사용. 수학적 정확도보다 안정성 우선. Douglas-Peucker로 결과 단순화.

### 4. 와인딩 방향 오류
**문제:** 글리프가 검은색이어야 할 부분이 비어있거나, 구멍이 채워짐
**해결:** Shoelace Formula로 면적의 부호를 계산하여 CW/CCW 강제 적용

### 5. 세그먼트 타입 미스매치
**문제:** pathUtils.ts에서 `handleOut`만 있는 경우를 Quadratic으로 처리하는데, 이를 누락하면 곡선이 직선으로 변환됨
**해결:** `handleOut + handleIn → Cubic`, `한쪽만 → Quadratic→Cubic 승격`, `없음 → Line` 3분기 정확히 구현

### 6. TypeScript strict 모드 빌드 오류
**문제:** `noUnusedLocals: true`에서 `_` 접두사 변수도 에러 처리됨
**해결:** 미사용 함수/변수는 `_` 접두사가 아니라 완전 삭제. `@ts-expect-error`는 opentype.js import에만 사용.

---

## 파일 의존성 맵

```
fontGenerator.ts
  ├── opentype.js (외부 라이브러리)
  ├── strokeToOutline.ts
  │     └── types/index.ts (StrokeDataV2, AnchorPoint, BoxConfig, StrokeLinecap)
  └── fontExportUtils.ts
        ├── stores/jamoStore.ts      (자모 획 데이터)
        ├── stores/layoutStore.ts    (레이아웃 스키마)
        ├── stores/globalStyleStore.ts (weight, slant, linecap)
        ├── utils/layoutCalculator.ts (calculateBoxes)
        └── utils/hangulUtils.ts     (decomposeSyllableWithOverrides)
```

---

## 수정 시 체크리스트

- [ ] SvgRenderer.tsx를 수정했다면 → fontExportUtils.ts도 동일하게 수정
- [ ] 새 획 타입 추가 시 → strokeToOutline.ts에 처리 분기 추가
- [ ] 좌표 변환 수정 시 → `toFontCoord()`의 Y-flip + slant 공식 확인
- [ ] globalStyle 변경 시 → fontExportUtils의 weightMultiplier/slant/linecap 해석 확인
- [ ] 빌드 전 `npm run build`로 unused 변수 체크 (strict 모드)
