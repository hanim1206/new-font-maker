# Step 4 UI-1 Implementation Handoff

## 결과

- 실제 앱 진입점에 `J-02 · 초성 ㄱ 원형` 모바일 검토 화면을 추가했다.
- 접근 경로는 `/workspace/jamo`다.
- 기존 Calibration 헤더의 `자소 원형 새 화면 검토` 버튼으로도 진입할 수 있다.
- 현재 형태 시스템이 미설정·차단·연결됨인 상태를 구분해 표시한다.
- `ㄱ·가·고·과·각·곡·곽` 비교 카드는 기존 렌더링 결과를 사용하며, 카드 탭은 관찰 문맥만 바꾼다.
- 형태 시스템 초기값과 variant를 임의 생성하지 않으며, 편집 도구와 정밀 조절은 데이터 연결 전까지 잠겨 있다.

## 변경된 파일

- `src-next/ShapeWorkspacePage.tsx`
- `src-next/ShapeWorkspacePage.module.css`
- `src-next/App.tsx`
- `src-next/CalibrationSentenceEditor.tsx`
- `src-next/CalibrationSentenceEditor.module.css`
- `tests/e2e/shape-workspace-shell.spec.ts`

## 검증 결과

- 대상 ESLint 통과.
- TypeScript project build 통과.
- `npm run build` 통과. 기존 Browserslist 안내와 fontExportUtils 중복 import 경고만 남아 있다.
- 전체 unit: 55 files / 444 tests 통과.
- 신규 Playwright: 2/2 통과.
  - 390×844에서 문서 가로 overflow 0.
  - 비교 스트립만 가로 스크롤.
  - 표시된 버튼과 링크의 터치 영역 44×44 이상.
  - 비교 카드·캔버스 선택·드로어 열기 전후 layout/jamo/shape localStorage byte-exact 불변.
- 실제 Chrome 모바일 렌더를 캡처해 육안 확인했다.

## 다음 단계에서 주의할 문제

- 공통 레이아웃 F-02는 Step 4의 layout binding 계약 전에는 편집 화면으로 연결하지 않는다.
- source가 null이거나 hydration blocked인 상태에서 initializer나 복구 write를 만들지 않는다.
- 실제 Shape 편집을 연결할 때 pointerup은 transaction 1회, pointercancel·lost capture는 exact rollback으로 새로 검증한다.
- PRODUCT_PHILOSOPHY의 기존 Calibration pointercancel commit 기록과 신규 UX rollback 계약이 충돌한다. 기존 Calibration 변경과 신규 Shape 제스처 정책을 분리해 결정해야 한다.
- Shape 전용 Undo/Redo를 프로젝트 전체 Undo/Redo로 표시하지 않는다.
- 저장 계층에 write acknowledgement가 없으므로 아직 `저장됨` 상태를 표시하지 않는다.
- `/editor-v2`의 기존 11개 실패는 실제 entry 불일치 baseline이며 새 UI 회귀와 분리한다.
