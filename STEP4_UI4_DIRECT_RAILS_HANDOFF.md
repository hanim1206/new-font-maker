# Step 4 UI-4 캔버스 직접 Rail 선택 handoff

## 사용자에게 보이는 결과

- `/workspace/jamo/result?char=ㄱ`의 `이 조합만 보정` 상태에서는 안쪽 왼쪽·오른쪽·위·아래 네 코어 Rail이 캔버스에 동시에 보인다.
- 선택되지 않은 Rail을 바로 끌면 그 Rail이 하단 선택 상태와 정밀 슬라이더 대상으로 즉시 바뀌고, 같은 제스처 안에서 최종 윤곽 draft를 미리 본다.
- 드래그 중에는 React 로컬 draft와 최종 잉크만 갱신하며 Shape source·history·localStorage는 바꾸지 않는다. `pointerup`에서만 기존 `setContextCoreRailOverride` command가 한 번 실행된다.
- `pointercancel` 또는 capture 손실은 draft를 버리고 후속 `pointerup`을 무시한다. 하단 네 선택 버튼과 슬라이더는 캔버스 선택 Rail의 값·출처와 계속 동기화된다.
- 관찰 모드에는 Rail overlay를 렌더링하지 않는다. 비선택 Rail은 덜 강조된 선과 작은 손잡이로 보여 최종 윤곽을 가리는 면적을 줄였고, 각 Rail의 44px hit area만 입력을 받는다.

## 변경 파일

- `src-next/ShapeWorkspacePage.tsx`
  - 네 Rail의 해석 모델을 병렬로 만들고, 선택 Rail의 draft만 최종 잉크에 반영하도록 분리했다.
  - Rail별 제스처 시작값을 저장해 비선택 Rail의 한 번 드래그, 정확한 취소, 단일 commit을 처리한다.
- `src-next/ShapeWorkspacePage.module.css`
  - 선택/비선택 Rail의 시각적 위계를 추가했다.
- `tests/e2e/shape-workspace-shell.spec.ts`
  - 선택되지 않은 가로·세로 Rail의 직접 선택·draft·pre-up 무저장·단일 Undo 경계를 확인하고, 비선택 Rail cancel 뒤 rollback 및 pointerup 무시를 보강했다.

## 검증 결과

- `npx tsc -b --pretty false` 통과.
- `npx eslint src-next/ShapeWorkspacePage.tsx tests/e2e/shape-workspace-shell.spec.ts` 통과.
- `npx playwright test tests/e2e/shape-workspace-shell.spec.ts --workers=1` 통과: 8/8.
- `npm test -- --run` 통과: 64 files / 647 tests.
- `npm run build` 통과.

## 다음 단계 주의점

- 이 slice는 현재 문맥의 네 코어 Rail override만 다룬다. 보조 Rail 추가·삭제, 참조 재연결, 셀/곡률/사선은 새 command와 별도 UI slice로 추가한다.
- 캔버스의 직접 드래그와 하단 slider는 모두 local draft 후 한 번의 command commit 경계를 유지해야 한다.
- ShapeSystemSourceV2, FontData 1.4, resolver/service 계약은 이 작업에서 변경하지 않았다.
