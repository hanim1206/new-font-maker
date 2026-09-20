# Step 4 UI-2 Implementation Handoff

## 결과

- 실제 앱에서 다음 세 화면을 연결했다.
  - `/workspace/jamos`: J-01 자소 현황.
  - `/workspace/jamo`: J-02 초성 ㄱ 원형.
  - `/workspace/jamo/result?char=고`: J-03 조합별 결과.
- Calibration 헤더의 `자소 원형 새 화면 검토` 링크와 하단 자소 탭으로 진입할 수 있다.
- 잘못된 `/workspace/*` 주소는 Calibration으로 위장하지 않고 명시적인 찾을 수 없음 화면을 표시한다.
- 공통 모바일 셸, 수정 범위 바, 7개 비교 스트립, 정밀 조절 드로어를 반복 컴포넌트로 분리했다.
- J-01은 blocked/null/connected 상태를 구분한다.
  - blocked는 저장 데이터 확인만 표시한다.
  - null은 기존 글자 미리보기임을 명시하며 미작업으로 추측하지 않는다.
  - connected는 실제 저장된 역할별 master·요소·직접 보정 수만 표시한다.
- J-03 카드 선택은 관찰 결과만 바꾸며 Shape source, variant, history, localStorage를 변경하지 않는다.
- 실제 context resolver와 편집 command 연결 전까지 `이 조합만 보정`과 정밀 편집 도구는 이유와 함께 잠겨 있다.

## 변경된 파일

- 신규 `src-next/workspace/WorkspaceChrome.tsx`
- 신규 `src-next/workspace/WorkspaceChrome.module.css`
- `src-next/ShapeWorkspacePage.tsx`
- `src-next/ShapeWorkspacePage.module.css`
- `src-next/App.tsx`
- `src-next/CalibrationSentenceEditor.tsx`
- `src-next/CalibrationSentenceEditor.module.css`
- `tests/e2e/shape-workspace-shell.spec.ts`

## 검증 결과

- 대상 ESLint 통과.
- `npx tsc -b --pretty false` 통과.
- 전체 unit: 55 files / 444 tests 통과.
- `npm run build` 통과.
- 신규 핵심 Playwright: 5/5 통과.
  - 실제 Calibration 링크 → J-02 → J-01 → J-02 → J-03 이동.
  - 직접 URL, reload, Back/Forward, invalid workspace fallback.
  - J-01/J-02/J-03 390×844 문서 가로·세로 overflow 0.
  - visible 터치 대상 44×44 이상.
  - 비교 스트립만 가로 스크롤.
  - 드로어와 하단 내비게이션 비중첩.
  - null 및 strict connected 7-role source에서 관찰 동작 후 Shape 저장 byte-exact 불변·write count 0.
- 빌드에는 기존 Browserslist 안내와 fontExportUtils static/dynamic 중복 import 경고만 남아 있다.

## 다음 단계에서 주의할 문제

- 현재 SVG는 legacy layout/jamo 결과다. Shape System 자동 파생 결과나 최종 윤곽으로 표시하지 않는다.
- expected jamo×role universe, 완료·확인·검사 상태가 없으므로 `미작업`, `완료`, `경고 0`, `7개 생성됨`을 추측하지 않는다.
- J-03 편집 연결은 exact context selection, resolver, provenance, command transaction이 모두 준비된 뒤 활성화한다.
- pointerup 1 transaction, pointercancel·lost capture exact rollback을 실제 Shape 편집 gesture에서 새로 검증한다.
- Shape history를 프로젝트 전체 Undo/Redo로 오표기하지 않는다.
- 저장 acknowledgement가 없으므로 `저장됨` 상태를 표시하지 않는다.
- F-02 공통 레이아웃은 layout binding 계약 전에는 편집 화면으로 구현하지 않는다.
