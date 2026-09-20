# Step 4 Shape final ink 프로토타입 인계

## 완료 범위

- 검증된 역할 마스터의 Rail 기반 중심선·점유 셀을 같은 `ResolvedInkPrimitive[]`로 해석한다.
- 곡률·사선 boundary treatment와 non-round cap/join은 조용히 무시하지 않고 차단한다.
- 중심선과 면을 한 번만 Boolean union하여 canonical `FinalGlyphInk`를 만든다.
- `ㄱ` 선·면 교차, `ㅇ` hole, hole을 지나는 중심선의 채움 의미를 실제 Shape source로 검증했다.
- `FinalInkRenderer`는 같은 final regions를 단일 even-odd SVG path로 직렬화한다.
- 명시적 한 글자 OTF prototype은 같은 final regions에 origin, Y flip, slant, UPM 투영만 적용한다.
- J-02는 strict source의 canonical `CH + ㄱ` 마스터가 있을 때만 Shape 최종 윤곽을 보여준다. 누락·오류 상태는 선택 불가능한 경고로 표시한다.
- 원형 tip 분할은 1000 UPM, 최대 0.5 font-unit 오차에 맞춰 적응형으로 계산한다.

## 보존한 경계

- 기존 `SvgRenderer`, `collectGlyphDataForChar`, `collectAllGlyphData`, 기본 전체 OTF 생성 경로는 바꾸지 않았다.
- 기존 round/non-round SVG·실제 다운로드 OTF fixture를 갱신하지 않았다.
- 전체 11,223자 Shape 면을 미리 만들거나 FontData·history에 파생 윤곽을 저장하지 않는다.
- J-03의 7개 카드는 문맥 selector가 생길 때까지 기존 렌더링 관찰 전용이다.

## 검증

- 전체 unit: 57 files, 458 tests 통과 후 추가 Shape 계약 15 tests 통과.
- 타입 검사, 대상 ESLint, production build 통과.
- Shape 모바일 actual-entry E2E 5/5 통과.
- pointercancel/Grid Lab 회귀 E2E 12/12 통과.
- legacy round OTF, non-round OTF actual-download 2/2 통과.

## 아직 완료가 아닌 것

- 일반 사용자 OTF 다운로드가 Shape source의 같은 revision을 자동 선택하는 경로.
- 7개 레이아웃 바인딩, context preset catalog, deterministic fallback, full provenance.
- boundary curve/diagonal materialization과 STANDALONE placement.
- Shape 마스터 편집 UI와 variants를 보존하는 aggregate add/rebind/retile command.
- 전체 자모·전체 글꼴 성능 검증.

## 다음 안전 순서

1. 별도 `LayoutGrid`와 7개 `LayoutGridBinding`을 순수 resolver로 추가한다.
2. role/context preset catalog와 deterministic fallback을 추가한다.
3. `projectPartGridToSlot()`에서 layout grid와 part grid를 처음 연결한다.
4. 같은 resolved request를 J-02/J-03와 명시적 OTF prototype에 전달한다.
5. 문맥 선택과 성능 gate가 끝난 뒤에만 기본 전체 OTF 경로를 전환한다.
