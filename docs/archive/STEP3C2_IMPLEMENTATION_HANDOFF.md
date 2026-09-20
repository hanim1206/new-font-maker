# Step 3C-2 구현 인계

> 상태: FontData 1.3 저장 골격, 1.2 마이그레이션, 프로젝트 원자 불러오기 완료
>
> Grid Lab v1 명시적 가져오기와 화면 연결은 아직 시작하지 않았다.

## 이번 조각에서 완료한 것

- `FontData` 1.2와 canonical 1.3을 version literal로 분리했다.
- DB·프로젝트 ingress는 `unknown`으로 받고 `parseAndMigrateFontData()` 하나에서만 검사·마이그레이션한다.
- 1.2 데이터는 기존 레이아웃·자모·스타일을 보존한 채 1.3으로 올리고, 연결 근거가 없는 Shape System은 만들지 않는다.
- 1.3의 선택적 `shapeSystem`은 Step 3C-1 strict parser를 통과한 source만 허용한다.
- 10개 레이아웃, 67개 자모, 획·override·padding·global style을 재귀 검증하고 알 수 없는 필드와 손상된 숫자·구조를 차단한다.
- 구형 rect/path 획과 `conditions`, `grid-system-2` 명칭은 검증 뒤 명시적으로 canonicalize하고 결과를 다시 1.3 계약으로 검사한다.
- 같은 owner 안의 stroke·layout override·gap·jamo override·global exclusion 중복 ID를 차단한다. 서로 다른 채널·자모·스키마 owner의 동일 ID는 허용한다.
- `collectFontData()`는 네 store의 원본만 수집하고 history·provenance·resolved grid·InkRegion 같은 파생값은 저장하지 않는다.
- `applyFontData()`는 전체 parse와 Shape System preflight가 끝난 뒤에만 네 store를 적용한다.
- Shape System이 없는 프로젝트를 불러오면 이전 프로젝트 source와 Shape history를 명시적으로 비운다.
- 프로젝트 전환 성공 시 기존 편집 history 두 종류를 모두 비운다. 실패 시 레이아웃·자모·스타일·Shape System·두 history를 각각 독립 복원한다.
- 한 persist 복원이 실패해도 나머지 복원을 계속하고, 성공으로 오인하거나 예외를 밖으로 던지지 않는다.
- 프로젝트 load·duplicate·create/update도 같은 parse/migration 경계를 사용한다.
- 구형 클라이언트가 1.3 JSONB를 1.2로 덮어쓰거나 기존 `shapeSystem`을 제거하지 못하게 하는 PostgreSQL trigger migration을 추가했다.

## 변경 파일

- `src/types/database.ts`
- `src/services/fontDataMigration.ts`
- `src/services/fontDataPayloadValidation.ts`
- `src/services/fontDataBridge.ts`
- `src/services/fontProjectService.ts`
- `src/hooks/useFontProject.ts`
- `src-next/font-data-roundtrip.test.ts`
- `supabase/migrations/20260824043000_protect_font_data_version.sql`

## 검증 결과

- 전체 Vitest: 54개 파일, 404개 통과
- TypeScript 검사와 프로덕션 build: 통과
- Step 3C-2 대상 ESLint: 통과
- 실제 OTF 다운로드 Playwright: 선 전용·비원형 2개 통과, 기존 fixture 변화 없음
- `git diff --check`: 통과
- 독립 저장·회귀 감사: P0/P1 없음
- 전체 lint: 기존 baseline과 같은 11 errors / 18 warnings
- 빌드에는 기존 Browserslist 갱신 안내와 `fontExportUtils` static/dynamic import 안내만 남아 있다.

## 아직 배포하지 않은 것

- `20260824043000_protect_font_data_version.sql`은 저장소에만 추가했으며 실제 Supabase에는 적용하지 않았다.
- 1.3 writer를 배포하기 전에 DB migration을 먼저 적용하고, 실제 row에서 다음을 검증해야 한다.
  - 1.3 → 1.2 downgrade 거부
  - 기존 object `shapeSystem` 누락·null 변경 거부
  - 1.2 → 1.3 정상 허용
  - 이름만 변경할 때 `font_data` exact 보존
  - 거부된 update 뒤 JSONB exact 불변
- 같은 1.3 writer끼리의 동시 저장 충돌을 막는 revision CAS는 아직 없다.

## 다음 조각 범위

Step 3C-3에서는 기존 Grid Lab v1을 새 source로 가져오는 **명시적 import**만 구현한다.

1. 기존 `font-maker-grid-system-2-lab-v1` 원본을 읽기 전용으로 검사한다.
2. 역할과 5개 core Rail 대응은 사용자 또는 caller가 명시하며 추측하지 않는다.
3. boolean cell과 stable reference를 index 없는 Rail ID·cell ID로 변환한다.
4. 지원하지 않는 curve·diagonal·cut 의미는 버리지 않고 import를 차단한다.
5. 성공은 source transaction 한 건이며 Undo/Redo가 exact해야 한다.
6. 성공·실패 어느 경우에도 기존 Grid Lab key를 수정하거나 삭제하지 않는다.

## 다음 단계에서 주의할 문제

- 실제 역사 프로젝트의 FontData 1.0·1.1은 아직 지원하지 않는다. 필요하면 1.2 validator를 느슨하게 만들지 말고 버전별 명시적 migration을 추가한다.
- `createDebouncedStorage`의 비동기 quota/write 실패는 여전히 조용히 무시된다. 저장 상태·재시도 UI를 만들기 전에 observable storage 계약이 필요하다.
- SQL 배포 전에는 1.3 frontend writer를 배포하지 않는다.
- Grid Lab v1은 자동 import·자동 삭제하지 않는다.
- 이번 조각은 저장 기반 작업이므로 새 Shape System 기능은 아직 앱 화면에서 확인할 수 없다.

## 중단 조건

- 1.2 migration 뒤 기존 SVG·OTF 결과가 바뀜
- parse 실패나 store write 실패 뒤 일부 프로젝트 상태만 남음
- project A의 Shape System 또는 편집 history가 project B에 잔류함
- 손상된 nested payload가 1.3으로 승격되어 저장됨
- history·provenance·resolved grid·InkRegion이 FontData에 들어감
- DB downgrade trigger 적용 전 1.3 writer를 배포함
