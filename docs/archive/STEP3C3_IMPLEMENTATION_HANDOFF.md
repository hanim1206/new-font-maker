# Step 3C-3 구현 인계

> 상태: Grid Lab v1 strict 후보·무손실 셀 변환·순수 import transaction 완료
>
> Shape System store 적용과 가져오기 UI는 아직 연결하지 않았다.

## 이번 조각에서 완료한 것

- 기존 Grid Lab v1용 tolerant UI parser와 분리된 strict import parser를 추가했다.
- 저장 key는 기존 `font-maker-grid-system-2-lab-v1`을 식별만 하며 importer는 Web Storage를 직접 읽거나 쓰거나 삭제하지 않는다.
- parser는 원본 raw 문자열을 byte-exact로 보존하고 root·5개 자모·Rail·cell·참조 필드를 정확히 검사한다.
- 문서화된 legacy 생략 필드만 명시적으로 복원한다.
  - `snapUnit` → 25
  - `cutGuide` → 기존 기본 guide
  - `cut` → null
  - `localCuts`·`curves`·`diagonalEdges` → 빈 배열
- 필드가 존재하지만 손상됐거나 알 수 없는 필드·미래 version인 경우에는 보정하거나 버리지 않고 차단한다.
- source Rail은 5–12개, 0–1000 범위, 엄격한 오름차순, 50 unit 이상 간격을 요구한다.
- 좌표와 snap은 정확히 1000으로 나누고 production `minGap`은 0.05로 고정한다.
- X/Y의 5개 core Rail 대응은 caller가 의미 순서대로 명시한다. 첫·마지막 Rail은 outer core여야 하며 자동 추측하지 않는다.
- import 대상 역할은 Grid Lab의 자음 의미에 맞게 `STANDALONE`·`CH`·`JO`로 제한한다.
- 선택 자소 순서는 입력 순서와 무관하게 ㄱ·ㄴ·ㄷ·ㅁ·ㅇ canonical 순서로 고정한다.
- true cell만 안정 Rail ID와 canonical `GridCellRef` ID를 가진 area source로 변환하고 row/column index를 결과에 남기지 않는다.
- 실제 Grid Lab 기본 ㄱ·ㅁ·ㅇ을 변환해 기존 contour와 production InkRegion의 canonical ring·bbox·점유·hole 의미가 exact 동일함을 검증했다.
- 선택 자소에 곡률·사선·전역/국소 절단 의미가 있으면 조용히 버리지 않고 자소·필드별 blocker를 반환한다. 선택하지 않은 자소의 원본은 raw 후보에 그대로 남는다.
- proposal은 raw·candidate·fingerprint·core map을 함께 보존하고, 적용 전에 raw에서 다시 proposal을 생성해 위조·drift를 차단한다.
- `applyGridV1ImportProposal()`은 proposal과 같은 grid의 canonical empty role source에만 적용한다.
- 성공은 `command: 'import-grid-v1'` before/after transaction 한 건이며 기존 Undo/Redo helper로 exact 왕복한다.
- transaction 생성까지 store·FontData·localStorage에 접근하지 않는다.

## 변경 파일

- `src/types/index.ts`
- `src/services/gridV1Import.ts`
- `src/services/gridV1Import.test.ts`

## 검증 결과

- Grid v1 importer 단위 테스트: 40개 통과
- 전체 Vitest: 55개 파일, 444개 통과
- TypeScript 검사와 프로덕션 build: 통과
- 대상 ESLint: 통과
- 기존 Grid Lab Playwright: 5개 통과
- `git diff --check`: 통과
- 독립 저장·회귀 감사: P0/P1 없음
- 전체 lint는 Step 3C-2에서 확인한 기존 baseline 11 errors / 18 warnings가 남아 있다.
- 빌드에는 기존 Browserslist 갱신 안내와 `fontExportUtils` static/dynamic import 안내만 남아 있다.

## 의도적으로 유보한 것

- `shapeSystemStore.source === null` 상태에서 누락된 6개 역할을 임의 기본값으로 만들지 않는다.
- 7-role initializer와 fresh Undo의 `null` 복원 의미가 확정되기 전에는 import transaction을 store에 적용하지 않는다.
- 곡률·사선·cut 의미는 현재 source 타입에 억지로 근사하지 않는다. 공통 contour materialization과 parity가 증명된 뒤 별도 확장한다.
- 기존 Grid Lab 화면은 아직 import UI가 아니며, 손상된 raw를 default로 덮어쓸 수 있는 기존 loader 동작도 이번 pure slice에서는 수정하지 않았다.

## 다음 단계 범위

데이터 모델 Step 1–3의 핵심 순수 계약은 여기까지 완료했다. 다음은 UX 명세의 화면 연결 단계다.

1. 7-role 초기화·fresh import 승인 의미를 먼저 화면 흐름으로 확정한다.
2. 기존 raw를 보호하는 읽기 전용 격리·백업 경계를 만든 뒤 `실험 데이터 가져오기` 화면을 연결한다.
3. 공통 모바일 셸, 수정 범위 바, 정밀 조절 드로어, 7개 문맥 비교 스트립을 반복 컴포넌트로 구현한다.
4. 데이터 서비스 계약과 저장 포맷은 화면 단계에서 변경하지 않는다.
5. pointerup 한 번 commit, pointercancel rollback을 Playwright로 고정한다.

## 다음 단계에서 주의할 문제

- 새 UI가 pure importer를 우회해 기존 `parseGrid2Project()` 결과를 바로 저장하면 안 된다.
- Grid Lab 원본 key는 성공·실패·Undo·Redo 뒤에도 byte-exact 보존해야 한다.
- fresh null을 임의 7-role 기본값으로 승격하지 않는다.
- 실제 곡률·사선·cut이 있는 데이터는 blocker를 사용자에게 보여 주고 부분 성공으로 숨기지 않는다.
- Shape System transaction을 연결할 때 전체 7-role parser와 cross-role ID 검사를 다시 통과해야 한다.
- SQL downgrade migration은 여전히 실제 Supabase 배포 전 release gate다.

## 중단 조건

- core Rail 의미를 UI가 자동 추측함
- 원본 raw를 읽는 것만으로 수정·삭제함
- true/false cell·ㄱ·ㅁ·ㅇ contour·hole 의미가 달라짐
- unsupported 곡률·사선·cut을 삭제하고 성공 처리함
- proposal과 target grid가 다른데 empty-only import가 성공함
- 한 번의 import가 여러 history entry 또는 부분 source를 남김
