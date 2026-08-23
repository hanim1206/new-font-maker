# Step 4 UI-3 문맥 Rail 편집 handoff

## 사용자에게 보이는 결과

- `/workspace/jamo/result?char=ㄱ`에서 `추천 기본 구조로 시작`을 눌러 최소 Shape starter를 명시적으로 만든다.
- `ㄱ·가·고·과·각·곡·곽` 카드가 정확한 STANDALONE/CH 문맥을 선택한다.
- `이 조합만 보정`을 눌러 현재 자소·현재 문맥에만 안쪽 왼쪽·오른쪽·위·아래 코어 Rail override를 편집한다.
- 네 방향 기준선을 하단에서 선택하고, 결과 캔버스의 파란 Rail을 직접 끌거나 정밀 슬라이더로 같은 값을 조절한다. 두 조작은 같은 draft와 command 경계를 공유한다.
- 조절 중에는 store를 바꾸지 않고 실제 context resolver → part projection → Shape primitive → final ink 결과를 즉시 미리 본다.
- pointerup은 command transaction 한 건만 커밋한다. pointercancel은 draft를 버리고 source·history·storage를 변경하지 않는다.
- `기본값으로`는 sparse override를 제거해 preset/master 상속값과 provenance로 돌아간다.
- 상단 Shape 범위 Undo/Redo와 로컬 저장 완료 상태를 연결했다. 새로고침 뒤 확정 Rail 위치가 복원된다.

## 주요 변경 파일

- `src-next/ShapeWorkspacePage.tsx`
- `src-next/ShapeWorkspacePage.module.css`
- `src/services/defaultShapeSystemV2.ts`
- `src/services/defaultShapeSystemV2.test.ts`
- `src/stores/shapeSystemStore.ts`
- `src/stores/shapeSystemStore.test.ts`
- `tests/e2e/shape-workspace-shell.spec.ts`
- `docs/PRODUCT_PHILOSOPHY.md`

## 검증 결과

- Shape workspace Playwright 6/6 통과.
  - 390×844 문서 overflow 없음, 터치 대상 44×44 이상.
  - 관찰 카드·드로어는 저장과 variant를 만들지 않음.
  - pointercancel 뒤 source raw·history·slider 값 exact 복원.
  - 캔버스 Rail drag 중 final path는 변하지만 storage raw는 불변이며, 직접 pointercancel 뒤 path와 값이 exact 복원.
  - pointerup 뒤 variant override와 history 한 건 생성.
  - Undo raw가 starter 상태와 exact 일치, Redo raw가 commit 상태와 exact 일치.
  - reload 뒤 확정값 복원.
- 전체 Vitest 64 files / 647 tests 통과.
- `npx tsc -b --pretty false`, 대상 ESLint, `npm run build` 통과.
- 실제 legacy/non-round OTF 다운로드 baseline 2/2 통과.

## 다음 단계 주의점

- 현재 직접 조작은 네 안쪽 코어 Rail만 다룬다. 다음 slice에서는 J-02 기본 마스터 편집 또는 보조 Rail 추가를 연결하되 적용 범위를 혼동하지 않는다.
- 캔버스 drag와 정밀 slider가 같은 pointerup을 중복 transaction으로 만들지 않는 현재 경계를 유지한다.
- J-02 기본 마스터 편집과 J-03 현재 문맥 편집의 범위를 섞지 않는다.
- Rail 추가·삭제, 셀 채우기, reference rebind, curve/diagonal은 각각 별도 command/UI slice로 진행한다.
- `저장됨`은 Shape localStorage flush 성공까지만 뜻한다. 원격 프로젝트가 없으면 서버 저장으로 오표기하지 않는다.
- 일반 전체 OTF 다운로드에 Shape를 자동 연결했다고 표시하지 않는다.
