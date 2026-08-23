# Step 3B-2 구현 인계

> 상태: 안정 참조·사용처 수집·재연결·안전 삭제의 순수 서비스 조각 완료
>
> 화면·Zustand·FontData 연결은 아직 시작하지 않았다.

## 이번 조각에서 완료한 것

- 중심선 anchor·handle, 면 boundary treatment, 셀 경계, 보조 Rail `between`에 안정 ID 주소를 적용했다.
- `collectRailUsages()`가 코어 role, `between` binding, 중심선·곡선·사선 point, 셀 경계를 owner 경로와 함께 결정적으로 수집한다.
- point와 `between` endpoint는 한 참조만 재연결하며, 결과가 cycle·역전·`minGap`을 위반하면 전체를 거부한다.
- 원자 셀의 edge 단독 재연결은 `requires-cell-retile`로 차단한다. 암묵적인 비원자 셀 생성은 허용하지 않는다.
- 코어 Rail은 항상 삭제를 차단한다.
- 보조 Rail은 point·treatment·dependent `between` 사용처가 남아 있으면 삭제를 차단한다.
- 양쪽 셀 점유가 같을 때만 모든 area master를 한 transaction에서 병합한다. 점유가 다르면 OR 병합하지 않고 전체를 원자적으로 중단한다.
- 곡선·사선은 실제 채움 윤곽의 꼭짓점과 인접한 두 변을 참조해야 하며, 한 꼭짓점에는 treatment 하나만 허용한다.
- 삭제 명령은 `usageCoverage: 'role-construction-v1'`을 요구한다. 현재 source universe 밖의 필드가 있으면 `incomplete-usage-coverage`로 차단한다.
- 손상된 source는 coverage 검사 전에 구조 검증을 거쳐 예외 없이 `invalid-scope`가 된다.

## 변경 파일

- `src/types/index.ts`
- `src/services/jamoConstruction.ts`
- `src/services/jamoConstruction.test.ts`
- `src/services/gridReferences.ts`
- `src/services/gridReferences.test.ts`
- `src/services/masterGridCommands.ts`
- `src/services/masterGridCommands.test.ts`

## 검증 결과

- 관련 Vitest: 3개 파일, 53개 통과
- 전체 Vitest: 47개 파일, 303개 통과
- 대상 ESLint: 통과
- TypeScript build 검사: 통과
- 프로덕션 build: 통과
- `git diff --check`: 통과
- 독립 구조·회귀·저장 안전성 감사: P0/P1 없음

## 다음 조각에서 지켜야 할 경계

1. 셀 경계 재연결의 성공 경로는 관련 셀을 함께 재타일링하는 별도 topology command로만 구현한다.
2. sparse variant·layout binding·provenance·orphan usage를 aggregate usage universe에 추가하기 전에는 삭제 명령을 store/UI에 노출하지 않는다.
3. 마스터 요소 삭제는 관련 variant를 재연결하거나 함께 제거하는 정책이 생기기 전까지 차단한다.
4. 저장 envelope version과 strict parser는 Step 3 저장 조각에서 추가한다.
5. transaction에는 원본만 저장하고 해석 Rail, InkRegion, Boolean 결과, SVG path를 넣지 않는다.
6. 기존 Grid v1 localStorage는 자동 변환하거나 삭제하지 않는다.
7. 이 단계는 화면 변경이 없으므로 새 기능은 아직 앱 UI에서 확인할 수 없다.

## 다음 중단 조건

- composite cell retile 전후 실루엣 또는 비대상 안정 ID가 달라짐
- variant/layout/provenance 사용처가 누락된 상태에서 삭제가 성공함
- 실패 명령이 부분 source나 transaction을 남김
- 배열 index 기반 주소가 저장 타입에 재등장함
- 기존 SVG·OTF 기준값이 변함
