# Step 4C — 문맥 part grid의 slot 투영과 Shape 소비자 연결

## 완료 범위

- `resolveContextualPartGrid()`의 성공 결과를 최종 `BoxConfig`에 한 번 투영하는 `projectPartGridToSlot()`을 추가했다.
- 투영 결과는 편집용 `ResolvedRailGrid`와 분리된 `SlotProjectedPartGrid`다.
- `STANDALONE→CH`, `CH→CH`, `JU_VERTICAL/JU_HORIZONTAL→JU`, `JU_H→JU_H`, `JU_V→JU_V`, `JO→JO` 역할 결속을 공용 규칙으로 검증한다.
- Rail ID·축·종류·코어 역할·순서와 전체 provenance를 보존한다.
- 비정방·돌출 slot은 허용하되, 비유한 값·0 크기·부동소수점 정밀도 붕괴로 Rail 간격이 사라지는 투영은 원자적으로 차단한다.
- Shape 선·면 소비자는 투영된 glyph 좌표 Rail을 그대로 사용한다.
  - 중심선: glyph 좌표 point + identity box
  - 점유 면: 투영된 Rail 경계를 바로 `InkRegion`으로 변환
  - slot 좌표 재계산 없음
- 기존 J-02 Shape 원형 경로도 `문맥 해석 → slot 투영 → Shape primitive` 순서를 사용한다.
- boundary treatment와 지원하지 않는 cap/join은 기존처럼 fail-loud를 유지한다.

## 변경 파일

- `src/types/index.ts`
- `src/services/jamoContextRoles.ts`
- `src/services/partGridSlotProjection.ts`
- `src/services/partGridSlotProjection.test.ts`
- `src/services/shapeGlyphInkResolver.ts`
- `src/services/shapeGlyphInkResolver.test.ts`
- `src/services/jamoConstruction.ts`
- `src/services/contextGridPresetCatalogV1.ts`
- `src/services/contextPartGridResolver.ts`
- `docs/PRODUCT_PHILOSOPHY.md`

## 검증 결과

- 관련 consumer·projection 테스트: 4 files / 62 tests 통과
- 전체 단위 테스트: 61 files / 586 tests 통과
- `npm run build`: 통과
- 대상 ESLint: 통과
- TypeScript build: 통과
- Shape 모바일 Playwright: 5/5 통과
- `git diff --check`: 통과

기존 안내만 남아 있다.

- Browserslist 데이터 갱신 안내
- `fontExportUtils` 정적·동적 import 혼용 안내
- 500 kB 초과 chunk 안내

## 고정된 계약

1. Design Body는 `calculateBoxes()`가 만든 최종 slot에 이미 반영되어 있다. projector에서 다시 적용하지 않는다.
2. `snapStep/minGap`은 로컬 편집 grid의 값이다. 축별 비율이 다른 glyph 좌표 결과에 단일 scalar로 복사하지 않는다.
3. 투영은 Rail ID를 새로 만들거나 정렬하지 않는다.
4. provenance의 Rail coverage와 선택 문맥은 role·요청 fallback 범위까지 검증한다.
5. 투영 결과·master·provenance는 비영속 파생값이며 Shape source와 FontData에 저장하지 않는다.
6. Shape 소비자는 `resolveRailGrid()`나 `slot.x + local * width`를 재구현하지 않는다.

## 다음 단계 주의사항

- Step 4의 저장 연결은 아직 완료되지 않았다. `layoutGrid + 7 binding + context preset catalog`를 기존 Shape V1/FontData 1.3에 끼워 넣지 않는다.
- 저장 진입은 Shape System V2 + FontData 1.4의 명시 migration과 DB downgrade guard 검증이 필요하다.
- 7개 비교 보드는 실제 `resolveGridBoundSchema → calculateBoxes → resolveContextualPartGrid → projectPartGridToSlot` 결과만 표시해야 한다.
- rail drag는 local draft만 갱신하고 pointerup 한 번에 transaction을 저장하며 pointercancel은 exact rollback해야 한다.
- JU_H/JU_V는 서로 다른 grid·channel·비정방 slot을 계속 독립적으로 유지한다.
- 일반 OTF 전체 생성은 아직 legacy 경로다. Shape 전체 문자 자동 선택과 실제 사용자 다운로드 연결은 Step 6에서 별도 검증한다.
