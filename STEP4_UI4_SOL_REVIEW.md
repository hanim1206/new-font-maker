# Step 4 UI-4 종료 검토

## 요약

**판정: P0 없음, UI4 수직 조각 종료 가능.**

`/workspace/jamo/result?char=ㄱ`의 편집 모드에서 네 안쪽 코어 Rail은 현재 문맥 resolver가 해석한 좌표로 동시에 표시된다. 선택되지 않은 Rail을 누르면 그 Rail의 `coreRole`과 하단 선택·슬라이더가 같은 제스처 안에서 전환되고, draft는 React 로컬 상태와 파생 최종 잉크에만 적용된다. `pointerup`은 눌린 Rail 모델을 기존 `setContextCoreRailOverride` command에 한 번 전달하며, `pointercancel`과 pointer capture 손실은 gesture ref를 비워 후속 `pointerup`을 무시한다.

현재 UI4 구현은 기존 Shape command/store/resolver를 호출하는 UI 조각이다. ShapeSystemSourceV2, FontData, store, service, SVG/OTF 출력 경계에 UI4 전용 데이터 모델 변경은 없다. 다만 전체 작업 트리에는 이전 Step들의 변경이 함께 있으므로, 이번 판정은 handoff가 지정한 `ShapeWorkspacePage.tsx`, CSS, Shape workspace E2E와 현재 호출 경로를 authoritative 범위로 삼았다.

## P0

없음.

다음 차단 조건은 발견되지 않았다.

- 다른 `coreRole` commit
- 드래그 중 Shape source/history/localStorage mutation
- 한 `pointerup`의 중복 history
- `pointercancel` 뒤 commit
- 관찰 모드 mutation
- 기존 SVG·OTF·저장 회귀

## P1 · 후속 backlog

### [P1] 44px hit area의 눌린 위치가 Rail 값을 즉시 이동시킬 수 있음

- 위치: `src-next/ShapeWorkspacePage.tsx:700`, `src-next/ShapeWorkspacePage.tsx:715`, `src-next/ShapeWorkspacePage.tsx:724`
- `startCanvasGesture()`가 시작 Rail 값은 저장하지만 시작 pointer 좌표를 저장하지 않고 곧바로 절대 캔버스 좌표로 draft를 계산한다. 44px hit band의 중심이 아닌 가장자리를 탭하면 pointer가 실제 Rail 위에 있지 않아도 draft가 최대 약 22px 튈 수 있고, 그대로 손을 떼면 선택만 하려던 탭이 값 변경 transaction이 된다.
- UX 명세의 `탭: 선택`, `직접 드래그: 이동`, `처음 닿은 위치를 상대 이동 원점으로 사용`과 다르다. UI4 데이터 경계를 깨지는 않지만 모바일 직접 조작 품질 문제이므로 다음 입력 보강 조각에서 상대 delta 또는 drag threshold로 분리한다.

### [P1] 캔버스 Rail 키보드 이동량이 접근성 계약과 다름

- 위치: `src-next/ShapeWorkspacePage.tsx:876`, `src-next/ShapeWorkspacePage.tsx:887`
- 방향키와 `Shift + 방향키`가 모두 고정 `RAIL_EDIT_STEP=0.005`, 즉 5 UPM만 이동한다. UX 명세는 방향키 1 UPM, Shift는 프로젝트 snap step 또는 10 UPM의 큰 이동을 요구한다.
- pointer capture/commit 경계는 안전하지만 입력 방식 간 정밀도 계약은 다음 키보드 보강 조각으로 분리한다.

### [P1] lost capture와 정확한 history/source 무변을 직접 계측하는 E2E가 없음

- 위치: `tests/e2e/shape-workspace-shell.spec.ts:268`, `tests/e2e/shape-workspace-shell.spec.ts:305`
- 현재 E2E는 비선택 X/Y Rail, pre-up localStorage 무변, `pointercancel` rollback, Undo 한 번으로 원복을 확인한다. 그러나 `lostpointercapture` 자체, 드래그 중 store `source`·`past` 길이, 네 overlay 개수·각 resolved 좌표를 직접 계측하지는 않는다.
- 구현 정적 추적과 store 단위 테스트상 경계는 맞고 현 slice를 막지 않는다. 다음 입력 상태 확장 전에 이 세 관찰점을 회귀 테스트로 고정하는 편이 안전하다.

## 핵심 계약 검토

| 항목 | 결과 | 근거 |
|---|---|---|
| 네 Rail과 실제 resolved Rail 일치 | 통과 | `railModels`가 네 `coreRole` 각각에 대해 `resolveContextualPartGrid → projectPartGridToSlot`을 실행하고, overlay 위치는 각 결과의 `model.value`를 사용한다 (`ShapeWorkspacePage.tsx:551-574`, `848-868`). |
| 비선택 Rail의 올바른 target commit | 통과 | pointer handler가 해당 map 항목의 `model`을 캡처하고 gesture에 같은 `coreRole`을 기록한다. 종료 시 role 일치 검사를 거친 뒤 그 모델만 commit한다 (`715-731`, `869-875`). |
| pointer move 중 source/history/storage 0 변경 | 통과 | draft preview는 strict parse clone과 순수 command 결과를 로컬에서 해석하고 store action을 호출하지 않는다 (`270-367`, `700-713`). E2E에서 pre-up raw가 exact 동일하다. |
| pointerup 정확히 1 command/history | 통과 | 종료 경로 한 곳에서 `commitValue()`를 한 번 호출하고 store command가 history 한 건을 만든다. E2E Undo 한 번으로 starter raw가 exact 복원된다. |
| cancel/lost capture 후 pointerup 무시 | 통과 | 둘 다 `handlePointerCancel`로 gesture ref를 비우고, 후속 `finishCanvasGesture`는 즉시 return한다 (`693-698`, `724-731`, `874-875`). lost capture 직접 E2E는 P1 테스트 backlog다. |
| keyboard path와 pointer capture | 조건부 통과 | pointer handle과 range 모두 capture·cancel 경계를 가진다. custom Rail 방향키도 keyup 한 번에 commit한다. 이동량 계약은 P1이다. |
| overlay가 윤곽·다른 hit target을 가리지 않음 | 통과 | final path는 pointer event를 받지 않고, Rail은 2px 선·축별 44px hit band만 사용한다. 선택 Rail만 z-index가 높다 (`ShapeWorkspacePage.module.css:69-83`). 현재 결과 캔버스 안에 경쟁하는 다른 편집 target은 없다. |
| 관찰 모드 mutation 0 | 통과 | `isEditing`일 때만 overlay와 활성 drawer를 렌더링한다 (`ShapeWorkspacePage.tsx:848`, `751`). 관찰 E2E는 저장 raw와 write count 0을 확인한다. |
| 데이터 모델/store/service/FontData 변경 0 | 통과 | UI4는 기존 resolver와 `setContextCoreRailOverride` action을 호출한다. UI4 handoff 대상 외 새 원본 계약은 없다. |
| 기존 SVG/OTF/저장 회귀 | 통과 | 전체 unit 647개, build, 실제 legacy/non-round OTF 2개, reload 저장 복원이 통과했다. |

## 평점

| 영역 | 평점 | 판단 |
|---|---:|---|
| Security | 5/5 | 외부 입력 실행, 비밀값, 권한 경계, HTML 삽입 변경이 없다. |
| Performance | 4/5 | 확정 Rail 네 모델은 source/context 변경 때 memoize되고, pointer move에는 선택 Rail preview만 다시 해석한다. 현재 4+1 resolver 규모는 제한적이다. |
| Correctness | 4/5 | target·transaction·cancel·provenance 경계는 맞다. 탭 시 절대 좌표 점프와 키보드 step 불일치가 P1로 남는다. |
| Maintainability | 4/5 | 네 Rail 정의와 resolver 경로가 단일 배열로 모여 있고 기존 command를 재사용한다. lost capture/source/history 직접 계측이 부족하다. |

## 실행한 검증

- `npx playwright test tests/e2e/shape-workspace-shell.spec.ts --workers=1` — **8/8 통과**
- `npm test -- --run` — **64 files, 647 tests 통과**
- `npm run build` — **TypeScript + Vite production build 통과**
- `npx eslint src-next/ShapeWorkspacePage.tsx tests/e2e/shape-workspace-shell.spec.ts` — **통과**
- `npm run lint` — UI4 대상 신규 오류 없음. 전체 lint는 현재 레포와 `.claude/worktrees/suspicious-khorana`의 기존 baseline **11 errors / 18 warnings**로 실패한다.
- `npx playwright test tests/e2e/otf-legacy-baseline.spec.ts tests/e2e/nonround-otf-baseline.spec.ts --workers=1` — **실제 OTF 2/2 통과**

Build 경고는 기존 bundle 크기와 `fontExportUtils`의 static/dynamic import 중복뿐이며 UI4 오류가 아니다.

## 사용자 링크에서 확인할 정확한 동작

1. `/workspace/jamo/result?char=ㄱ`을 연다.
2. Shape 원본이 없으면 `추천 기본 구조로 시작`을 누른다.
3. `이 조합만 보정`을 누르면 안쪽 왼쪽·오른쪽·위·아래 네 Rail이 동시에 보여야 한다.
4. 하단에서 선택되지 않은 Rail을 캔버스에서 직접 끌면 그 Rail 버튼, Rail 이름, UPM 값, 슬라이더, 출처가 즉시 같은 대상으로 바뀌어야 한다.
5. 손을 움직이는 동안 최종 `ㄱ` 윤곽은 변하지만 저장 완료 문구와 Undo history는 생기지 않아야 한다.
6. 손을 떼면 한 번만 저장되고 Undo 한 번으로 제스처 전 상태가 exact 복원되어야 한다.
7. drag 중 취소 또는 capture 손실이 발생하면 윤곽·슬라이더·출처가 시작 상태로 돌아오고 이후 pointerup은 저장하지 않아야 한다.
8. 비교 모드로 돌아가거나 다른 조합 카드를 관찰할 때 Rail overlay가 없어야 하며 저장 데이터도 변하지 않아야 한다.
9. 390px 폭에서 페이지 가로 overflow가 없어야 하고, 네 Rail hit area와 하단 선택 버튼은 44px 이상이어야 한다.

## 다음 수직 조각 주의점

- 현재 `coreRole + local draft + pointerup 한 command` 경계를 그대로 유지한다. slider와 캔버스가 중복 transaction을 만들지 않게 한다.
- 캔버스 tap 선택과 drag 이동을 분리하고, 시작 pointer 대비 상대 delta를 사용해 44px hit area의 가장자리 탭이 값을 바꾸지 않게 한다.
- 키보드 1 UPM·Shift 큰 이동을 입력 계약과 맞추고, blur/visibility change 중 draft 처리도 명시한다.
- `lostpointercapture`, store source/past 무변, 네 resolved overlay 위치를 브라우저 테스트에서 직접 계측한다.
- 보조 Rail·추가/삭제·참조 재연결·셀·곡률·사선은 현재 네 코어 Rail command에 섞지 않는다.
- J-03 현재 문맥 override와 J-02 마스터 편집 범위를 계속 분리한다.
- UI-only 조각에서 ShapeSystemSourceV2, FontData 1.4, store/service, SVG/OTF 계약을 확장하지 않는다.
