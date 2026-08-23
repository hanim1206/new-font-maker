# Step 3B-1 구현 인계

> 기준 문서: `COMMON_GRID_HYBRID_IMPLEMENTATION_PLAN.md`, `KOREAN_FONT_MAKER_UX_SCREEN_SPEC.md`
> 완료 범위: 역할별 자소 마스터, 채널별 grid 소유권, 보조 Rail 추가와 채워진 원자 셀 분할
> 다음 작업: 모든 point·handle·cell edge·boundary treatment의 안정 참조를 추가한 뒤 usage 수집, 참조 재연결, 삭제 잠금을 한 수직 조각으로 구현한다.

## 1. 구현 결과

역할별 생산용 Part Grid에 자소 면 마스터를 연결하는 첫 command 조각을 추가했다.

- 자소 마스터의 canonical 키는 `jamoId + role`이며 ID도 이 두 값을 인코딩해 결정적으로 만든다.
- `JU_H`는 horizontal channel, `JU_V`는 vertical channel, 나머지 역할은 main channel 하나만 가진다.
- 혼합중성 channel 이름과 `channel.role`은 타입 수준과 hydration 런타임 검증에서 모두 제한한다.
- 각 channel은 자신이 사용하는 `gridId`를 명시한다.
- 채워진 면은 배열 index나 `boolean[][]`가 아니라 안정 Rail ID 네 개를 가진 원자 `GridCellRef` 목록으로 저장한다.
- 셀 ID는 master, channel, element, 네 Rail 경계에서 결정적으로 만든다.

## 2. 보조 Rail 추가 command

`addAuxiliaryRailAndSplitCells()`는 caller가 명시한 안정 ID와 인접한 두 Rail ID 사이에 `between` 보조 Rail을 추가한다.

- 명령 전 scope와 RailGrid를 먼저 검증한다.
- 새 Rail ID, axis, ratio, 같은 축 참조, 인접 관계, `minGap`을 검증한다.
- 기존 Rail ID와 새 Rail이 가르지 않는 master·element·cell ID는 바꾸지 않는다.
- 새 Rail이 통과하는 filled atomic cell만 두 child cell로 바꾸고 양쪽 모두 점유를 상속한다.
- 빈 영역은 저장 목록에 없으므로 새 filled cell을 만들지 않는다.
- 같은 role grid를 공유하는 scope의 모든 master를 한 번에 갱신한다.
- 두 child는 모두 새 경계 기반 ID를 얻고 parent→children 관계를 split audit에 남긴다.
- 결과 scope 전체를 다시 검증한 뒤에만 성공한다.
- 실패는 부분 결과나 transaction을 만들지 않고 입력도 변경하지 않는다.

## 3. 공통 transaction 경계

Step 3 이후 command가 같은 방식으로 확장될 수 있도록 before/after 원본을 가진 `SourceCommandTransaction`을 추가했다.

- 보조 Rail 추가와 여러 master의 셀 분할이 함께 일어나도 transaction은 한 개다.
- Undo 한 번은 command 전 scope를, Redo 한 번은 command 후 scope를 exact 복원한다.
- transaction에는 `resolvedPartGrid`, `InkRegion`, Boolean 결과, SVG path 같은 파생값을 저장하지 않는다.

## 4. 변경 파일

- `src/types/index.ts`
- `src/services/jamoConstruction.ts`
- `src/services/jamoConstruction.test.ts`
- `src/services/masterGridCommands.ts`
- `src/services/masterGridCommands.test.ts`

Store, FontData, 기존 Grid Lab, SVG·OTF 소비자, UI 파일은 수정하지 않았다.

## 5. 검증 결과

- Step 3B-1 전용: 2파일 27테스트 통과.
- `npm test`: 46파일 277테스트 통과.
- `npm run build`: 통과.
- 대상 파일 ESLint와 TypeScript 검사: 통과.
- `git diff --check`: 통과.
- 독립 재감사 2회 결과 P0/P1 없음.
- 기존 Browserslist 안내와 `fontExportUtils`의 static/dynamic import 경고만 남아 있다.
- 전체 lint의 기존 11 errors / 18 warnings와 `/editor-v2` Playwright 11개 실패는 선행 baseline이며 Step 3B-1 신규 오류는 없다.

## 6. 고정된 인수 계약

- 같은 `jamoId + role`의 이중 master와 non-canonical ID 거부.
- `ㅙ+JU_H`와 `ㅙ+JU_V`의 별도 master·channel·grid 소유권.
- unknown channel, null Rail·element·cell 등 손상 hydration 데이터 fail-closed.
- X/Y 보조 Rail 추가 뒤 기존 코어 Rail ID exact 유지.
- 실제 `ㅁ` ring의 filled cell 분할 전후 Boolean 실루엣, hole, 채움 표본 exact 유지.
- 중앙 empty 영역에 filled cell이 생기지 않음.
- 여러 master 각각의 실루엣과 unsplit ID 유지.
- frozen 입력 무변이와 같은 입력·ID의 결정적 결과.
- duplicate/missing/cross-axis/non-adjacent/invalid ratio/minGap/child ID collision의 원자적 실패.
- IEEE-754 경계 오차만 허용하는 exact `minGap` 통과와 즉시 미달 거부.
- 신규 production service에 `xIndex`, `yIndex`, `rowIndex`, `columnIndex`, `boolean[][]` 저장 표현이 없음.
- 손상된 filled cell은 geometry 변환에서 조용히 사라지지 않고 fail-loud.

## 7. 다음 조각의 주의점과 중단 조건

다음 조각에서 한 번에 참조 체계를 완성한 뒤 삭제 정책을 연결한다.

- `GridPointRef`, `BoundaryTreatment`, `GridCenterlineElement`, 통합 `GridReferenceAddress`의 모든 편집 지점에 안정 ID를 둔다.
- `collectRailUsages()`는 anchor, handle, cell edge, curve/diagonal point, dependent `between`을 소유 master/channel/element/reference까지 귀속한다.
- `rebindGridReference()`는 지정된 참조 한 곳만 바꾸고 다른 축·형제 참조·원본 코어 Rail은 유지한다.
- 코어 Rail은 항상 삭제를 거부한다.
- 사용 중인 auxiliary Rail은 usage를 모두 반환하고, 명시적 rebind 뒤 usage가 0일 때만 삭제한다.
- 셀 양쪽의 점유나 treatment 의미가 다르면 자동 OR 병합하지 않고 삭제를 차단한다.
- parent cell을 외부 variant/treatment가 참조하는 경우 usage 계층이 준비되기 전에는 분할 command를 store에 연결하지 않는다.
- store, FontData, Grid v1 import, sparse context variant, UI는 참조·삭제 조각이 검증된 뒤 별도로 진행한다.

사용처를 일부만 수집해야 하거나, 참조 주소에 배열 index가 필요하거나, 삭제 과정에서 점유를 OR 병합해야만 진행할 수 있다면 즉시 중단한다.
