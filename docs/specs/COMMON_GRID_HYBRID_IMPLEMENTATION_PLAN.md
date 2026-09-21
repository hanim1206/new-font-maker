# 공통 그리드 기반 선·면 하이브리드 구현 플랜

> 상태: `레이아웃 P0 대체됨 · Shape construction 구현 기록`
> 개정일: 2026-08-28
> 이번 개정의 핵심: 전체 자소 그리드의 점유 면과 Rail 교점에 고정된 선을 하나의 생성 문법으로 편집

> **2026-08-28 전환 안내:** 이 문서의 공통 layout grid, `L-01`, `legacy-connected-v1`, X/Y 대칭 5 Rail 및 이를 전제로 한 단계 계획은 더 이상 구현 기준이 아니다. 신규 네모꼴 프로젝트의 레이아웃 P0는 [`FIVE_GUIDE_SQUARE_LAYOUT_P0_SPEC.md`](FIVE_GUIDE_SQUARE_LAYOUT_P0_SPEC.md)만 따른다. 이 문서의 Shape construction·선/면 합성 관련 구현 기록은 배경 자료로 유지하되, 새 명세와 충돌하면 새 명세를 우선한다.

> 참조 우선순위: Obsidian `이미지 래퍼런스 캔버스.canvas`의 연결된 이미지와 `docs/PRODUCT_PHILOSOPHY.md`, 사용자와 합의한 의미 계약을 우선한다. `KOREAN_FONT_MAKER_UX_SCREEN_SPEC.md`는 과거 UX 검토 초안이며 구현 기준으로 사용하지 않는다.

## 현재 인계 기준

- 시각적 의도는 Obsidian `이미지 래퍼런스 캔버스.canvas`의 `그리드`와 `그리드 시스템` 그룹을 기준으로 한다. 그리드는 결과 위에 겹치는 안내선이 아니라 글자의 선·면·간격·공통 각도를 결정하는 생성 문법이다.
- `Step 1~4`의 strict Shape source, 역할·문맥 상속, 공통 layout grid, source transaction은 구현되어 있다. `Step 5`는 J-02의 첫 상호작용 조각을 제품 의도에 맞게 교체하는 중이다.
- 2026-08-24에 구현한 `상단 두 셀 중 면 하나 생성·이동`은 transaction 안전성만 확인한 기술 조각이다. 사용자 검토에서 면 채우기 UX로 부적합하다고 판정했으므로 후속 구현의 기반으로 확장하지 않는다.
- 다음 구현은 현재 역할 part grid의 모든 원자 셀을 직접 채우고 비우는 점유 편집, Rail 교점에 고정된 중심선, 선·면 공통 최종 윤곽을 한 수직 흐름으로 완성한다.
- 역할 마스터는 `jamoId + role` 단위로 독립한다. 초성 ㄱ 화면은 CH, 단독 ㄱ 화면은 STANDALONE만 기본 편집하며 역할 간 복사·연결은 사용자가 명시적으로 실행한다. 현재 STANDALONE·CH를 함께 바꾸는 임시 bridge는 새 면 편집 명령의 소유권 기준으로 재사용하지 않는다.

## 사용자 검토 보정 — 공통 레이아웃 그리드의 의미

2026-08-24 사용자 검토에서 현재 L-01은 처음 의도와 다르다고 판정했다. 지금 구현은 기존 7개 레이아웃의 모든 슬롯 경계와 분할 좌표를 하나의 Rail 집합으로 합치고, 화면에도 7개 윤곽을 모두 겹쳐 보여준다. 이는 `7개 레이아웃 경계 합집합 편집기`에 가깝다.

처음 의도한 공통 레이아웃 그리드는 각 레이아웃 전용 경계를 한곳에 모으는 화면이 아니다. 여러 레이아웃이 함께 참조하는 소수의 의미 기반 핵심 선을 공통 배치 마스터로 두고, 각 레이아웃은 필요한 핵심 선만 binding해 슬롯을 파생하는 구조다. 레이아웃 전용 경계와 예외 보정은 공통 Rail로 승격하지 않는다.

따라서 다음 구현 전에 Obsidian `이미지 래퍼런스 캔버스.canvas`의 `한글 원도` 그룹을 기준으로 공통 핵심 선의 정확한 목록과 레이아웃별 binding 의미를 사용자와 다시 정한다. 화면만 단순화해서 현재 합집합 원본을 유지하는 안은 해결책으로 취급하지 않는다. 현재 L-01과 `legacy-connected-v1` 원본은 기술 검증 결과로 남기되 완성된 공통 배치 편집기로 확장하지 않는다.

## 시각적 생성 원칙

```text
자소 part grid
├─ Rail과 교점: 선의 시작·끝·꺾임
├─ 원자 셀 점유 집합: 글자의 양의 면
├─ 교점 간 참조: 사선·곡률 범위
└─ 파생 결과: 선과 면을 합친 닫힌 벡터 윤곽
```

- 하나의 `GridAreaElement`가 여러 `filledCells`를 소유한다. 셀은 독립적으로 이동하는 면 도형이 아니며, 면 채우기는 이 점유 집합을 추가하거나 제거하는 도구다.
- 신규 `GridCenterlineElement`의 앵커와 꺾임은 X/Y Rail ID가 만나는 교점으로 저장한다. Rail이 움직이면 선도 같은 참조를 유지한 채 다시 계산한다.
- 기존 legacy 중심선은 자동으로 바꾸지 않는다. 사용자가 `그리드에 연결`을 실행한 경우에만 후보 교점 투영을 비교한 뒤 변환한다.
- 현재 범위는 직교형 X/Y Rail grid다. 원형·방사형 등 비직교 grid는 후속 범위지만, UI 제스처와 source command를 분리해 이후 grid topology 확장을 막지 않는다.

## 핵심 용어 빠른 이해

이 문서의 전체 구조는 아래 한 줄로 요약된다.

```text
자소 기본 마스터
→ 역할·문맥 프리셋
→ 자소별 문맥 베리에이션
→ 레이아웃 슬롯 투영
→ 화면·OTF 공통 최종 윤곽
```

레이아웃과 자소 형태는 원본 데이터로서는 분리되어 있지만 최종 출력에서는 연결된다. 즉, 레이아웃을 수정해도 자소 기본 마스터를 덮어쓰지 않으며, 바뀐 슬롯에 맞춰 파생 좌표만 다시 계산한다.

| 용어 | 의미 |
|---|---|
| **자소 기본 마스터** (`jamo role master`) | `ㄱ`, `ㅇ`, `ㅏ`의 기본 뼈대·면·곡률·레일 관계를 역할별로 정의하는 원본이다. 저장 단위는 `jamoId + role`이므로 같은 `ㄱ`의 CH와 JO 마스터는 기본적으로 분리된다. |
| **자소 역할** (`part role`) | 한글 조합 안에서 자소가 담당하는 자리다. STANDALONE, CH, 세로 JU, 가로 JU, JU_H, JU_V, JO로 구분하며 각 역할은 서로 다른 기본 형태 그리드와 프리셋을 가질 수 있다. |
| **레이아웃 문맥** (`layout context`) | 자소가 어떤 조합 안에 놓였는지를 나타낸다. 초성 단독, 세로홀자, 가로홀자, 섞임홀자 및 각 유형의 종성 포함형 등 7개 기본 문맥에 선택적 특징 태그를 붙이고 기본 문맥까지 fallback한다. |
| **레이아웃 그리드** (`layoutGrid`) | Font Space에서 CH·JU·JO가 차지할 영역을 정하는 공통 절대 레일이다. 자소의 내부 형태가 아니라 자소를 담는 슬롯의 위치와 크기를 결정한다. |
| **파트 슬롯** (`part slot`) | `layoutGrid`와 `calculateBoxes()`가 계산한 초성·중성·종성의 실제 배치 영역이다. 문맥별 자소 형태가 마지막에 투영되는 컨테이너다. |
| **기본 파트 그리드** (`basePartGrid`) | 자소 기본 마스터가 사용하는 0–1 로컬 형태 그리드다. 역할별로 공유하며, 아직 특정 레이아웃 슬롯의 실제 크기는 반영하지 않은 원본이다. |
| **문맥 프리셋** (`context preset`) | 같은 역할의 자소들이 특정 레이아웃 문맥에서 어떻게 기본 변형될지를 정하는 공통 규칙이다. 예를 들어 `가로중성+종성` 문맥에서 모든 초성의 기본 높이·중심·속공간 비율을 조정한다. 완성 윤곽이 아니라 코어 레일 위치 규칙을 저장한다. |
| **자소 문맥 베리에이션** (`jamo context variant`) | 문맥 프리셋만으로 부족할 때 특정 자소·특정 문맥에 추가하는 예외 보정이다. 코어 레일 override, 보조 레일, 참조 재연결만 저장하며 레이아웃별 완성 윤곽을 복제하지 않는다. |
| **문맥 파트 그리드** (`contextPartGrid`) | `basePartGrid`에 역할·문맥 프리셋과 자소별 베리에이션을 적용한 비영속 로컬 그리드다. 아직 실제 파트 슬롯으로 투영되기 전 상태다. |
| **해석된 파트 그리드** (`resolvedPartGrid`) | `contextPartGrid`를 현재 레이아웃의 실제 파트 슬롯에 투영한 최종 좌표 그리드다. 화면과 OTF가 함께 사용하며 프로젝트에는 저장하지 않는다. |
| **코어 레일** (`core rail`) | 모든 자소 형태 그리드가 공통으로 보장하는 의미 기반 최소 레일이다. X/Y축에 각각 5개가 있고 프리셋·초기화·자동 파생의 공통 계약이므로 삭제하거나 ID를 교체할 수 없다. |
| **보조 레일** (`auxiliary rail`) | 특정 자소나 일부 획에 추가 기준이 필요할 때 코어 레일 사이에 만드는 선택적 레일이다. 복잡한 형태를 표현하지만 코어 레일의 역할을 제거하지 않는다. |
| **레일 override** | 코어 Rail ID는 유지하면서 특정 역할·문맥 또는 특정 자소에서 위치값만 다르게 적용하는 보정이다. 같은 문맥의 전체 자소 기준을 바꿀 때는 보조 레일보다 문맥 프리셋의 코어 override를 우선한다. |
| **참조 재연결** (`reference rebinding`) | 특정 앵커·핸들·셀 경계·곡률·사선이 바라보는 레일을 코어 레일에서 보조 레일 등으로 바꾸는 작업이다. 사용자에게는 레일을 대체한 것처럼 보이지만 원본 코어 레일은 남아 있다. |
| **투영** (`projection`) | 0–1 로컬 자소 그리드를 레이아웃이 계산한 실제 파트 슬롯 좌표로 변환하는 과정이다. 슬롯이 달라지면 최종 자소의 크기와 비례도 다시 계산되지만 자소 기본 마스터는 변하지 않는다. |
| **기본 마스터 편집** | 자소 원형을 수정하는 편집이다. 해당 부분이 별도 override되지 않은 모든 문맥에 전파된다. |
| **현재 문맥 편집** | 현재 자소·현재 레이아웃 문맥에만 차이값을 저장하는 편집이다. 필요할 때 같은 역할 전체, 같은 자소의 여러 문맥, 기본 마스터로 적용 범위를 승격할 수 있다. |
| **원본과 파생값** | 저장 대상은 레이아웃 레일, 자소 기본 마스터, 프리셋, override, 보조 레일, 참조 재연결이다. `contextPartGrid`, `resolvedPartGrid`, Boolean 결과, SVG path는 매번 계산하는 파생값이다. |

### 적용 범위와 상속 순서

```text
폰트 공통 기본값
→ 역할별 기본값
→ 역할·레이아웃 문맥 프리셋
→ 특정 자소의 문맥 베리에이션
```

- 여러 자소의 공통 비례를 바꿀 때는 상위의 역할·문맥 프리셋을 수정한다.
- 특정 자소 전체의 원형을 바꿀 때는 자소 기본 마스터를 수정한다.
- 특정 자소의 특정 문맥만 다르게 만들 때는 자소 문맥 베리에이션을 수정한다.
- 특정 획이나 셀 경계만 다른 위치를 사용해야 할 때는 보조 레일을 추가하고 그 참조만 재연결한다.
- 문맥 베리에이션을 제거하면 언제든 프리셋 기반 자동 파생 상태로 돌아간다.

## 구현 전 결정·검증 게이트

아래 항목은 구현 중 재설계를 막기 위해 Step 3 진입 전에 계약을 고정하거나 대표 수직 검증으로 판정한다.

### 구현 전 기본안으로 채택

1. **마스터 저장 단위는 `jamoId + role`로 한다.** 같은 `ㄱ`이라도 CH, JO, 단독 자음은 서로 다른 역할 마스터를 기본으로 가지며, 필요할 때만 사용자가 복사하거나 연결한다.
2. **7개 문맥은 기본 대분류로 유지하고 선택적 특징 태그를 허용한다.** 실제 베리에이션 선택은 기본 문맥에 `medialClass`, `finalWidthClass`, `initialClass` 같은 태그를 더한 fallback 규칙으로 해결하며 모든 조합을 enum으로 늘리지 않는다.
3. **섞임홀자는 채널별로 역할과 `gridId`를 가진다.** 하나의 `JamoConstruction.gridId`를 horizontal/vertical 채널이 공유하지 않는다.
4. **베리에이션은 sparse patch와 live inheritance로 저장한다.** 값이 없으면 상위를 상속하고, override를 제거하면 프리셋 기반 상태로 돌아간다. 프리셋 적용 결과를 숫자로 복제하지 않는다.
5. **모든 편집 가능 참조 위치에 안정 ID를 부여한다.** 배열 인덱스나 객체 경로를 참조 재연결 주소로 사용하지 않는다.
6. **채워진 셀 내부에 레일을 추가하면 원자 셀을 분할해 보이는 실루엣을 보존한다.** 삭제 시 이웃 셀의 점유·곡률·사선 상태가 다르면 자동 병합하지 않고 차단한다.
7. **레일 위치 원본은 하나만 저장한다.** `absolute`와 `between`을 구분한 union 타입을 사용하고 해석된 좌표는 파생값으로 둔다.
8. **공통 transaction 계약을 Step 3부터 사용한다.** 기존 화면 history의 최종 통합은 Step 7에서 하되 Step 3~6의 모든 변경 명령은 처음부터 같은 transaction 인터페이스를 거친다.
9. **문맥 프리셋은 계속 연결되는 상속 원본이다.** 변경 시 override되지 않은 관련 자소에 전파되고 UI에서 각 값의 출처를 표시한다.
10. **모바일 편집은 pointerup에서만 커밋하고 pointercancel은 롤백한다.** 편집 핸들에 `touch-action: none`과 pointer capture를 적용해 스크롤과 편집의 충돌을 줄인다.
11. **레일 의존성과 순서는 항상 유효해야 한다.** `between`은 같은 축 레일만 참조하고 순환을 금지하며 ratio는 0–1로 제한한다. 해석된 레일은 축별 단조 순서와 `minGap`을 유지하고 drag 중 교차하지 않는다.

### 대표 수직 검증 후 잠금

1. **축별 코어 Rail 5개 충분성:** 기본 원자 셀은 4×4다. `ㄱ·ㅇ·ㅏ·ㅂ·ㅎ·ㅙ`에서 보조 레일 수와 편집성을 측정하고, 대부분의 자소가 처음부터 다수의 보조 레일을 요구하면 코어 의미를 재검토한다.
2. **면 투영과 굵기:** 중심선 굵기는 Font Space에서 유지하고 면은 그리드를 그대로 투영하는 정책으로 시작한다. `가·고·각·곡`의 실제 stem 폭이 과도하게 달라지면 면 전용 inset constraint를 추가한다.
3. **곡률 표현:** 레일 교점 참조와 0–1 `tension` 값으로 충분한지 `ㅇ·ㅅ·ㅊ`에서 검증한다.
4. **Boolean 경계 계약:** 꼭짓점 접촉, 겹치는 경계, hole 접촉, 극소 링, self-intersection, positive island의 예상 결과를 geometry spike와 테스트로 고정한다.
5. **캐시와 회귀 기준:** legacy 선 전용은 정확 좌표/path 비교를 유지하고 신규 Boolean 윤곽은 topology·bbox·면적·픽셀 diff로 검증한다.

### Step 3 진입 전 설계 스파이크 산출물

- `jamoId + role` 마스터와 섞임홀자 channel별 grid를 포함한 타입 컴파일 테스트.
- 7개 기본 문맥과 특징 태그의 deterministic fallback 테스트.
- sparse override 적용·제거·상위 마스터 변경·고아 참조 검출 테스트.
- 채워진 셀에 X/Y 레일을 삽입하고 실루엣을 보존하는 분할 테스트.
- `ㄱ·ㅇ·ㅏ·ㅙ`를 대상으로 한 UI 없는 `resolveContextualPartGrid()` 수직 테스트.
- 하나의 command가 여러 store 원본을 수정해도 Undo/Redo 한 단계로 복원되는 transaction 테스트.

## 0. 이번 개정에서 바로잡은 핵심

- `layoutGrid`와 `partGrids`의 독립성은 서로 영향을 받지 않는다는 의미가 아니다. 두 시스템은 원본을 서로 덮어쓰지 않지만, 최종 자소 그리드는 레이아웃 슬롯의 영향을 받아 파생된다.
- 하나의 역할별 자소 기본 마스터를 모든 레이아웃에 동일한 절대 형태로 배치하지 않는다. 네모틀 조합 문맥에 따라 자동 파생된 자소 베리에이션을 사용한다.
- 기본 파생 순서는 `자소 기본 마스터 → 역할·문맥 프리셋 → 자소별 문맥 보정 → 레이아웃 슬롯 투영`이다.
- 프리셋은 모든 자소에 하나의 숫자 배열을 무차별 적용하지 않는다. STANDALONE, CH, 세로 JU, 가로 JU, JU_H, JU_V, JO 역할별로 나누고, 각 역할 안에서 레이아웃 문맥별 기본값을 공유한다.
- 자동 베리에이션의 공통 계약으로 자소 형태 그리드에 가로·세로 각각 5개의 의미 기반 코어 레일을 둔다.
- 코어 레일은 삭제하거나 ID를 바꿀 수 없고 이동과 문맥별 위치 override만 허용한다.
- 특정 자소나 일부 획에 별도 기준이 필요하면 보조 레일을 추가하고 선택한 참조만 새 레일에 재연결한다. 코어 레일 자체를 물리적으로 대체하거나 삭제하지 않는다.
- 완성된 레이아웃별 윤곽을 복제 저장하지 않는다. 기본 마스터, 프리셋 ID, 레일 override, 보조 레일, 참조 재연결만 저장하고 최종 형태는 파생한다.

## 1. 요구사항 요약

- 자음 단독과 초성이 포함된 6개 조합, 총 7개 레이아웃이 하나의 공통 레이아웃 그리드를 공유한다.
- 사용자가 공통 레일을 움직이면 연결된 7개 레이아웃의 초성·중성·종성 영역이 즉시 다시 계산된다.
- 초성·세로홀자·가로홀자·섞임홀자 가로부·섞임홀자 세로부·종성은 역할별 자소 기본 마스터와 형태 그리드를 공유한다.
- 하나의 `jamoId + role` 기본 마스터는 그 역할이 쓰이는 레이아웃 문맥에 맞춰 자동 파생된다. 비교 보드는 최대 7개 레이아웃을 함께 보여줄 수 있지만 각 카드는 자기 역할 마스터를 해석하며, 현재 역할 편집은 그 역할을 사용하는 카드에만 반영된다.
- 문맥별 기본 파생은 역할·문맥 프리셋으로 모든 관련 자소에 일괄 적용되며, 특정 자소의 보정은 그 위에 override로 저장한다.
- 자소 형태 그리드는 X/Y축마다 5개의 의미 기반 코어 레일을 공통 계약으로 가진다. 두 축 모두 코어 레일만 있을 때 기본 원자 셀은 4×4이며, 복잡한 자소에는 코어 레일 사이에 보조 레일을 추가할 수 있다.
- 기존 중심선·베지어 획과 Grid 2의 점유 면을 한 자모, 한 캔버스, 한 최종 윤곽 안에서 함께 사용할 수 있다.
- 곡률과 사선은 자유 좌표가 아니라 안정적인 레일 교점 참조로 저장하고, 레일 이동 때 다시 계산한다.
- 사용 중인 레일은 삭제를 막고 사용처를 표시한다. 이동은 허용한다.
- 코어 레일은 사용 여부와 무관하게 삭제를 막는다. 보조 레일은 사용 중이면 삭제를 막고 참조 이전 후에만 삭제한다.
- 선 전용에서는 전체 획 굵기를 유지하고, 혼합형에서는 선에만 적용하며, 면 전용에서는 숨긴다.
- 화면 SVG와 OTF가 같은 배치·문맥 베리에이션·윤곽·구멍·교차 결과를 사용한다.
- 한 제스처는 Undo/Redo 한 단계이며 재접속과 프로젝트 저장 후에도 같은 상태를 복원한다.

## 2. 확정한 설계 결정

### 2.1 하나의 시스템, 연결된 세 단계 그리드

- `layoutGrid`: Font Space 안에서 7개 레이아웃이 공유하는 절대 레일이다. STANDALONE/CH/JU/JO 슬롯의 위치와 크기를 결정한다.
- `partGrids`: 자모 로컬 공간에서 역할별로 공유하는 기본 형태 레일이다. 자소 기본 마스터의 조형 구조를 정의한다.
- `contextPartGrids`: 역할·레이아웃 문맥 프리셋과 자소별 override를 적용해 파생되는 문맥별 형태 레일이다.
- `resolvedPartGrids`: 문맥별 형태 레일을 실제 레이아웃 슬롯에 투영한 비영속 최종 레일이다.
- 레이아웃과 자모 형태를 하나의 절대 레일 배열에 묶지 않는다. 그렇게 하면 슬롯 비율 변경과 자모 원형 변경이 과도하게 결합된다.
- 반대로 두 그리드를 최종 결과에서도 완전히 독립시키지 않는다. 네모틀 글꼴에서는 같은 자소도 중성 유형과 종성 유무에 따라 사용할 수 있는 공간과 비례가 달라져야 한다.
- 독립성은 원본 소유권의 분리를 의미한다. 레이아웃 이동은 자소 기본 마스터를 덮어쓰지 않고 `resolvedPartGrids`만 다시 계산한다.
- 영속 좌표는 기존 원칙대로 0–1 정규화 값으로 저장하고, UI에서만 1000 UPM 단위로 표시한다 (`src/types/index.ts:16-22`, `src-next/calibrationProjectStore.ts:61-63,106-112`).

문맥별 자소 해석 순서는 다음으로 고정한다.

```text
base partGrid + jamo master
        ↓
role/context preset
        ↓
per-jamo context overrides
        ↓
contextPartGrid
        ↓
projection into resolved layout slot
        ↓
resolvedPartGrid + resolved jamo construction
```

### 2.2 기존 Split + Padding 유지

- 공통 그리드는 `LayoutSchema`를 대체하지 않고 저작·제약 레이어로 추가한다.
- 레일 바인딩을 비영속 파생 `resolvedLayoutSchemas`로 컴파일하고 기존 `calculateBoxes()`에 전달한다.
- 기존 계산 순서인 gap → 프리셋/문맥 오버라이드 → 사용자 보정 → 배치/형태 규칙 → Design Body 변환을 보존한다 (`src/utils/layoutCalculator.ts:103-160`).
- 레일 해석 결과를 원본 `layoutSchemas`에 반복 덮어쓰지 않는다. 원본과 파생 스키마를 분리해 누적 드리프트를 막는다.
- `calculateBoxes()`가 반환한 파트 슬롯은 자소 베리에이션의 최종 투영 대상이다. 레이아웃 슬롯 이동은 `partGrid` 원본이 아니라 `resolvedPartGrid`에 반영한다.

### 2.3 편집 원본과 최종 윤곽 분리

- 중심선과 점유 면을 독립 원본으로 저장한다.
- Boolean 결과나 최종 SVG path는 저장하지 않고 매번 파생한다.
- 모든 양의 원본은 잉크를 더한다. 면의 내부 공간은 해당 면의 `holes`에 속하며 전역 음각 마스크로 취급하지 않는다.
- 최종 잉크는 모든 양의 잉크 영역을 union한 결과다. 한 면의 hole을 다른 중심선이나 면이 지나가면 해당 양의 잉크만 그 구간을 다시 채운다.
- 기존 `StrokeDataV2`는 자동 스냅하지 않는다. 사용자가 `그리드에 연결`을 선택할 때 전후 비교 후 변환한다 (`src/types/index.ts:256-272,288-307`).
- 레이아웃별 베리에이션도 최종 윤곽을 복제 저장하지 않는다. 기본 마스터와 차이값만 저장한다.

### 2.4 Grid 2 두 구현 분리

- 현재 `StrokeRenderStyle.mode='grid-system-2'`는 중심선을 25-unit에 스냅하고 75-unit 폭·35° 절단을 적용하는 옛 렌더 실험이다 (`src/types/index.ts:245-254`, `src/services/gridSystem2Geometry.ts:5-62`, `src/services/strokeRenderGeometry.ts:85-103`).
- 현재 `/grid-lab`은 점유 칸·곡률·사선 편집 데이터를 별도 localStorage에 저장하는 UI 실험이다 (`src-next/App.tsx:1-8`, `src-next/GridSystem2LabPage.tsx:342-387`).
- 옛 렌더 모드는 `legacy-snapped-centerline` 호환 의미로 격리하고, 신규 점유 면은 글로벌 획 스타일이 아니라 자모 구성 데이터로 승격한다.

### 2.5 하나의 자소 마스터와 문맥별 베리에이션

- 마스터의 영속 단위는 `jamoId + role`이다. 예를 들어 초성 `ㄱ`의 CH 마스터와 종성 `ㄱ`의 JO 마스터는 기본적으로 분리하며, 필요할 때만 사용자 명령으로 복사하거나 연결한다.
- 역할 마스터는 해당 역할에서 `ㄱ`다운 뼈대와 내부 레일 관계를 정의한다. 하나의 추상적 자소 개념이 여러 역할 마스터를 가질 수 있다.
- 기본 마스터를 모든 레이아웃에 동일한 절대 윤곽으로 넣지 않는다. 세로홀자·가로홀자·섞임홀자 및 종성 유무에 따른 문맥 프리셋으로 자동 파생한다.
- 기본 문맥 집합은 7개 공통 레이아웃과 대응하지만, 실제 선택 키는 선택적 특징 태그를 포함할 수 있다. 결과 규칙이 같은 문맥은 같은 프리셋 또는 베리에이션을 공유한다.
- 문맥 해석은 가장 구체적인 `baseContext + feature tags`에서 시작해 태그가 적은 기본 문맥 순으로 deterministic fallback한다.
- 자소별로 더 세밀한 보정이 필요한 경우에만 해당 자소·해당 문맥의 레일 override와 참조 재연결을 저장한다.
- 상속 순서는 `폰트 기본값 → 역할별 기본값 → 레이아웃 문맥 프리셋 → 특정 자소 보정`으로 고정한다.
- 프리셋과 기본 마스터 연결은 live inheritance다. 적용 결과 숫자를 자소별 원본으로 복제하지 않는다.
- 기본 마스터 편집은 override되지 않은 모든 문맥에 전파한다.
- 문맥 편집은 기본적으로 현재 자소·현재 문맥에만 적용한다. 사용자가 명시적으로 선택할 때 현재 역할의 모든 자소, 같은 자소의 여러 문맥, 또는 기본 마스터로 승격할 수 있다.
- 문맥 override를 삭제하면 언제든 프리셋 기반 자동 파생 상태로 되돌아간다.
- 기본 마스터의 요소·참조·레일을 삭제할 때 연결된 베리에이션을 먼저 수집한다. 고아 참조가 생기는 삭제는 `재연결`, `관련 override 함께 삭제`, `취소` 중 하나를 선택하기 전까지 차단한다.

### 2.6 축별 코어 레일 5개와 보조 레일

- 자동 프리셋과 베리에이션이 공통으로 참조할 최소 형태 그리드는 X축 5개, Y축 5개의 의미 기반 코어 레일로 시작한다.
- X축 코어 의미는 `outer-left`, `inner-left`, `center-x`, `inner-right`, `outer-right`다.
- Y축 코어 의미는 `outer-top`, `inner-top`, `center-y`, `inner-bottom`, `outer-bottom`이다.
- 두 축에 코어 레일만 있으면 4×4 원자 셀이 생긴다. 이 기본 셀 수는 글자를 4×4 칸에 강제로 가두는 규격이 아니라 프리셋·베리에이션·초기화가 공유하는 최소 좌표 문법이다.
- 코어 레일은 삭제와 ID 변경을 금지한다. 기본 위치 이동, 역할·문맥별 위치 override, 표시 숨김은 허용한다.
- 복잡한 자소는 코어 레일 사이에 임의 개수의 보조 레일을 추가할 수 있다.
- 레일 위치는 `absolute` 또는 두 기준 레일 사이의 `between` 중 하나로만 저장한다. 보조 레일은 가능한 경우 `between`을 사용하여 상위 레일 이동에도 안정적으로 파생되게 한다.
- 특정 자소나 획이 다른 기준을 필요로 하면 보조 레일을 추가한 뒤 해당 앵커·핸들·셀 경계·곡률·사선 참조만 새 레일에 재연결한다.
- 사용자에게는 기존 레일을 대체한 것처럼 보일 수 있지만, 데이터상 코어 레일을 제거하지 않고 참조만 재연결한다.
- 현재 역할·문맥의 모든 자소 기준을 바꾸려는 경우에는 보조 레일을 만들지 않고 해당 코어 레일의 문맥 프리셋 값을 override한다.
- 셀은 항상 인접한 두 X레일과 두 Y레일 사이의 원자 영역으로 취급한다. 채워진 셀 내부에 레일을 추가하면 셀을 분할하고 새 원자 셀의 점유를 상속해 실루엣을 보존한다.
- 각 `GridAreaElement`는 여러 원자 셀의 점유 집합을 소유한다. 첫 J-02 수직 흐름은 stable ID를 가진 `primary area` 하나를 편집하고, 마지막 셀을 비워도 요소 삭제와 혼동하지 않도록 빈 점유 집합을 유지한다. 별도 면 요소 추가·삭제는 후속 구조 명령으로 분리한다.
- 각 셀 ID는 master·channel·element와 네 경계 Rail ID에서 결정적으로 만들며 배열 인덱스나 좌표값으로 편집 대상을 식별하지 않는다.
- 면 채우기는 `filledCells` 집합을 추가·제거하는 도구다. 개별 셀을 선택한 뒤 다른 셀로 이동시키는 동작은 면 채우기 의미에 포함하지 않는다.
- 이웃 셀의 점유·곡률·사선 상태가 다른 레일은 명시적 병합 규칙 없이 삭제하지 않는다.

## 3. 범위

### 포함

- 7개 공통 레이아웃: `choseong-only`와 초성 포함 조합 6개.
- 역할별 기본 형태 그리드: STANDALONE, CH, 세로 JU, 가로 JU, JU_H, JU_V, JO.
- `jamoId + role` 역할 마스터와 channel별 role·grid 소유권.
- 7개 기본 문맥, 선택적 특징 태그, deterministic fallback.
- 역할·레이아웃 문맥 live 프리셋과 자소별 sparse 베리에이션.
- X/Y 각 5개 의미 기반 코어 레일, 문맥 override, 보조 레일, 참조 재연결.
- 안정 Rail·참조 ID, 원자 셀 분할, 교점/곡률/사선 참조, 사용처 검사, 삭제 잠금.
- 선·면 공통 잉크 자료형과 화면·OTF 공통 해석 경로.
- 데스크톱 전체 화면 공통 그리드 편집기와 모바일 7개 미리보기 스트립.
- 기본 마스터 편집, 현재 문맥 편집, 적용 범위 승격, 기본값 복원 UI.
- Step 3부터 사용하는 공통 transaction과 프로젝트 저장·마이그레이션·공유 Undo/Redo.
- 대표 수직 검증 후 67개 자모와 전체 한글 출력 확장.

### 제외

- 원형·방사형 등 비직교 그리드.
- 선과 면을 동시에 변화시키는 공통 Weight 축.
- 전역 음각/빼기 면 원본.
- 부리 자동 적용과 형태 예절 규칙 자동 추론.
- 기존 67개 자모의 무조건 자동 변환.
- 모든 자소에 반드시 7개의 독립 윤곽을 생성하거나 복제 저장하는 방식.
- 코어 레일의 삭제·ID 교체·배열 인덱스 기반 대체.
- 단독 모음 3종을 7개 비교 보드에 추가하는 작업. 기존 `LayoutType` 10종과 출력은 유지한다 (`src/types/index.ts:1-14`).

## 4. 목표 아키텍처

```text
ShapeSystemStore
├─ layoutGrid
├─ basePartGrids[role]
├─ contextGridPresets[role][context]
└─ layoutBindings[7]
          │
          └─ resolveGridBoundSchemas()
                    │
              LayoutSchema
                    │
              calculateBoxes()
                    │
                PartSlot

JamoData
├─ 기존 StrokeDataV2
└─ roleMasters[jamoId + role]
   ├─ construction.channels[channel]
   │  ├─ role + gridId
   │  ├─ GridCenterlineElement[]
   │  └─ GridAreaElement[]
   └─ contextVariants[baseContext + feature tags]
      ├─ coreRailOverrides
      ├─ auxiliaryRails
      └─ referenceOverrides
                    │
       resolveContextualPartGrid()
                    │
       projectPartGridToSlot()
                    │
           resolvedPartGrid
                    │
       resolveGlyphInkPrimitives()
                    │
              InkRegion[]
              ├─ SVG
              └─ Boolean union → OTF/CFF
```

### 4.1 핵심 타입 초안

모든 핵심 타입은 프로젝트 규칙에 따라 `src/types/index.ts`에 정의한다.

```ts
type RailId = string

type CoreXRailRole =
  | 'outer-left'
  | 'inner-left'
  | 'center-x'
  | 'inner-right'
  | 'outer-right'

type CoreYRailRole =
  | 'outer-top'
  | 'inner-top'
  | 'center-y'
  | 'inner-bottom'
  | 'outer-bottom'

type RailPosition =
  | { kind: 'absolute'; value: number }
  | {
      kind: 'between'
      fromRailId: RailId
      toRailId: RailId
      ratio: number
    }

interface ShapeRail {
  id: RailId
  position: RailPosition
  kind: 'core' | 'auxiliary'
  coreRole?: CoreXRailRole | CoreYRailRole
}

interface RailGrid {
  id: string
  xRails: ShapeRail[]
  yRails: ShapeRail[]
  snapStep: number
  minGap: number
}

interface GridPointRef {
  id: string
  xRailId: RailId
  yRailId: RailId
}

interface GridCellRef {
  id: string
  leftRailId: RailId
  rightRailId: RailId
  topRailId: RailId
  bottomRailId: RailId
}

type BoundaryTreatment =
  | {
      id: string
      kind: 'curve'
      vertex: GridPointRef
      from: GridPointRef
      to: GridPointRef
      tension: number
    }
  | { id: string; kind: 'diagonal'; vertex: GridPointRef; from: GridPointRef; to: GridPointRef }

interface GridAreaElement {
  id: string
  kind: 'area'
  filledCells: GridCellRef[]
  boundaryTreatments: BoundaryTreatment[]
}

interface GridCenterlineElement {
  id: string
  kind: 'centerline'
  anchors: Array<{
    id: string
    point: GridPointRef
    handleIn?: GridPointRef
    handleOut?: GridPointRef
  }>
  closed: boolean
  thickness: number
  linecap?: StrokeLinecap
  linejoin?: StrokeLinejoin
}

type JamoPartRole = 'STANDALONE' | 'CH' | 'JU_VERTICAL' | 'JU_HORIZONTAL' | 'JU_H' | 'JU_V' | 'JO'

interface JamoConstructionChannel {
  role: JamoPartRole
  gridId: string
  elements: Array<GridCenterlineElement | GridAreaElement>
}

interface JamoConstruction {
  channels: {
    main?: JamoConstructionChannel
    horizontal?: JamoConstructionChannel
    vertical?: JamoConstructionChannel
  }
}

type JamoLayoutContext =
  | 'choseong-only'
  | 'vertical'
  | 'horizontal'
  | 'mixed'
  | 'vertical-with-jongseong'
  | 'horizontal-with-jongseong'
  | 'mixed-with-jongseong'

interface JamoVariantContext {
  baseContext: JamoLayoutContext
  medialClass?: string
  finalWidthClass?: 'narrow' | 'normal' | 'wide'
  initialClass?: 'open' | 'closed' | 'double'
}

interface JamoRoleMaster {
  id: string
  jamoId: string
  role: JamoPartRole
  construction: JamoConstruction
  contextVariants?: JamoContextVariant[]
}

interface ContextGridPreset {
  id: string
  role: JamoPartRole
  context: JamoVariantContext
  coreRailPositions: Partial<Record<CoreXRailRole | CoreYRailRole, RailPosition>>
}

interface GridReferenceAddress {
  elementId: string
  referenceId: string
  axis: 'x' | 'y'
  edge?: 'left' | 'right' | 'top' | 'bottom'
}

interface GridReferenceOverride {
  target: GridReferenceAddress
  railId: RailId
}

interface JamoContextVariant {
  context: JamoVariantContext
  presetId?: string
  coreRailOverrides?: Partial<Record<CoreXRailRole | CoreYRailRole, RailPosition>>
  auxiliaryRails?: {
    xRails: ShapeRail[]
    yRails: ShapeRail[]
  }
  referenceOverrides?: GridReferenceOverride[]
}

type GridValueSource = 'master' | 'role-default' | 'context-preset' | 'jamo-override'

interface GridProvenance {
  railSources: Record<RailId, GridValueSource>
  selectedPresetIds: string[]
  selectedVariantContext?: JamoVariantContext
}

interface InkRegion {
  outer: InkRing
  holes: InkRing[]
}
```

### 4.2 베리에이션 해석 계약

```ts
resolveContextualPartGrid({
  baseGrid,
  variantContext,
  rolePresets,
  contextPresets,
  jamoVariants,
}): {
  grid: RailGrid
  provenance: GridProvenance
}

projectPartGridToSlot({
  contextualGrid,
  slot,
}): ResolvedRailGrid
```

- `resolveContextualPartGrid()`는 기본 자소 마스터를 변경하지 않는 순수 함수다.
- 문맥 선택은 가장 구체적인 특징 태그 조합부터 7개 기본 문맥까지 결정적인 fallback 순서를 사용한다.
- 프리셋과 override는 코어 Rail ID를 기준으로 적용하며 배열 순서에 의존하지 않는다.
- `RailPosition`은 `absolute` 또는 `between` 하나만 원본으로 가지며 해석된 숫자 좌표를 다시 저장하지 않는다.
- 참조 재연결은 현재 자소·현재 문맥에만 적용하며 원본 construction의 참조를 덮어쓰지 않는다.
- resolver는 각 결과값이 마스터·역할 기본값·문맥 프리셋·자소 override 중 어디에서 왔는지 provenance를 함께 반환한다.
- 삭제된 요소나 참조를 가리키는 고아 override는 조용히 무시하지 않고 검증 오류와 사용처로 반환한다.
- `projectPartGridToSlot()`은 문맥별 로컬 그리드를 `calculateBoxes()`가 반환한 실제 파트 슬롯으로 투영한다.
- `resolvedPartGrid`, 실제 교점 좌표, 파생 윤곽은 저장하지 않는다.

## 5. 구현 단계

### Step 1. 레이아웃 단일 원본과 용어 정리

#### 목표

공통 그리드를 올리기 전에 데스크톱·모바일·저장·OTF가 같은 레이아웃 원본과 같은 Grid 2 의미를 사용하게 만든다.

#### 변경

1. `calibrationProjectStore.layoutProfile`의 사용자 보정값을 `layoutStore.layoutSchemas[*].userPartOverrides`로 이관한다.
   - 현재 보정 화면은 별도 `layoutProfile`을 읽고 (`src-next/CalibrationSentenceEditor.tsx:895-940`), 편집 커밋과 Undo/Redo도 별도 저장소를 갱신한다 (`src-next/CalibrationSentenceEditor.tsx:1072-1117`).
   - 현재 OTF 추출은 해당 프로필을 별도 인자로만 전달한다 (`src-next/CalibrationSentenceEditor.tsx:1152-1160`).
2. 기존 로컬 보정 프로필을 한 번만 `LayoutSchema.userPartOverrides`로 합치는 마이그레이션을 작성한다.
3. `calibrationProjectStore`에서는 `layoutProfile`과 `setLayoutProfile`을 제거하고 분석 기록만 유지한다 (`src-next/calibrationProjectStore.ts:71-103`).
4. `fontExportUtils.FontExportOverrides.layoutProfile`과 별도 OTF 전달 경로를 제거한다 (`src/services/fontExportUtils.ts:50-67`).
5. 기존 `grid-system-2` 렌더 모드를 레거시 이름으로 변경하고 구형 저장값 파서를 둔다.
6. 용어를 `layoutGrid`, `basePartGrid`, `contextPartGrid`, `resolvedPartGrid`로 확정하고 코드·문서에서 혼용하지 않는다.
7. Step 1 시작 전에 기존 SVG 좌표·OTF 대표 글리프·저장 round-trip 기준값을 고정한다.

#### 주요 파일

- `src-next/calibrationProjectStore.ts`
- `src-next/CalibrationSentenceEditor.tsx`
- `src/stores/layoutStore.ts`
- `src/services/fontExportUtils.ts`
- `src/services/fontGenerator.ts`
- `src/services/fontDataBridge.ts`
- `src/types/index.ts`
- `src/types/database.ts`

#### 완료 기준

- 보정 화면에서 레이아웃을 편집한 뒤 재접속·프로젝트 저장·모바일·OTF가 같은 `userPartOverrides`를 읽는다.
- 기존 10개 레이아웃의 `calculateBoxes()` 좌표가 기준값과 정확히 동일하다.
- 기존 선 전용 대표 글자 SVG path/box와 생성 OTF가 변경 전과 동일하다.
- 구형 `strokeStyle.mode='grid-system-2'` 저장본이 시각 변화 없이 로드된다.
- 레이아웃 슬롯과 자소 내부 형태 그리드가 코드와 UI에서 명확히 구분된다.
- `npm run build`, `npm run lint`, 기존 Vitest 및 Playwright 회귀 테스트가 통과한다.

#### 다음 단계 진입 조건

레이아웃 프로필의 쓰기 경로와 OTF 읽기 경로가 모두 `layoutStore` 하나로 수렴해야 한다.

---

### Step 2. 공통 잉크 해석 계층 추출

#### 목표

새 면 분기와 문맥별 자소 변형을 UI와 OTF에 각각 복제하지 않도록 기존 중심선만으로 공통 잉크 계약을 먼저 세운다.

#### 변경

1. `InkRegion`, `ResolvedInkPrimitive`, `ResolvedCenterlinePrimitive` 타입을 추가한다.
2. `resolveGlyphInkPrimitives()`를 새 순수 서비스로 추출한다.
   - 현재 `SvgRenderer`는 파트별 획과 섞임홀자 채널을 직접 해석한다 (`src/renderers/SvgRenderer.tsx:125-235`).
   - `fontExportUtils`에도 렌더 순서와 파트 획 수집 로직이 복제되어 있다 (`src/services/fontExportUtils.ts:78-115`).
3. 화면과 OTF가 같은 자모 채널·박스·문맥 안전 보정·linecap/linejoin 해석 결과를 사용하게 한다.
4. resolver 입력에 향후 `resolvedPartGrid`를 받을 자리를 만들되 이 단계에서는 기존 중심선 좌표만 어댑트한다.
5. 기존 `BrushInkGroup`을 `InkRegion`으로 어댑트한다. 이 단계에서는 기존 화면 렌더 방식을 유지해 시각 회귀를 막는다.
6. 기존 CFF union을 좌표계 독립적인 `inkBoolean` 계층으로 감싸되 현재 OTF 결과를 유지한다 (`src/services/contourBoolean.ts:98-110`, `src/services/fontGenerator.ts:170-214`).

#### 신규 파일

- `src/services/glyphInkResolver.ts`
- `src/services/inkGeometry.ts`
- `src/services/inkBoolean.ts`

#### 수정 파일

- `src/types/index.ts`
- `src/renderers/SvgRenderer.tsx`
- `src/services/fontExportUtils.ts`
- `src/services/fontGenerator.ts`
- `src/services/contourBoolean.ts`

#### 완료 기준

- 화면과 OTF가 동일한 `ResolvedInkPrimitive[]`를 받는다.
- 선 전용 원형·납작형·네모형·절단형의 대표 SVG/OTF 결과가 기준값과 동일하다.
- `ㅁ·ㅂ·ㅙ` 교차부와 `ㅇ·ㅁ·ㅎ` 내부 공간 회귀 테스트가 통과한다.
- 공통 resolver를 우회해 자모 파트를 직접 수집하는 새 코드가 없다.

#### 다음 단계 진입 조건

면 원본 또는 문맥별 자소 좌표를 추가할 때 화면과 OTF 중 한쪽에만 별도 배치 로직을 작성할 필요가 없어야 한다.

---

### Step 3. 안정 ID 기반 생산용 그리드와 코어 레일 계약

#### 목표

현재 Grid 2 상호작용 알고리즘을 재사용하되 배열 인덱스·5개 자모 하드코딩·손실적 삭제를 제거하고, 프리셋이 의존할 공통 코어 레일 계약을 세운다.

#### 변경

1. `RailGrid`, `ShapeRail`, 코어 레일 role, `GridPointRef`, `GridCellRef`, `BoundaryTreatment` 타입을 추가한다.
2. 역할별 `basePartGrid`를 X/Y 각 5개 코어 레일로 초기화한다.
3. 마스터 저장 키를 `jamoId + role`로 고정하고 CH·JO·단독 역할 마스터를 분리한다.
4. 앵커·핸들·셀 경계·boundary treatment의 모든 편집 가능 참조 위치에 안정 ID를 부여한다.
5. 현재 `{xIndex,yIndex}`와 `boolean[][]` 기반 모델을 ID 기반 참조로 전환한다 (`src-next/gridSystem2EditorModel.ts:1-45`).
6. `ShapeRail` 위치를 `absolute | between` union으로 저장하고 해석된 숫자 좌표는 파생한다.
7. `between` 참조의 동일 축·비순환·ratio 범위와 해석 레일의 단조 순서·`minGap`을 검증한다. drag 중 레일 교차는 clamp하고 암묵적 순서 교체를 허용하지 않는다.
8. 셀을 인접 레일 사이의 원자 영역으로 정의하고, 채워진 셀 내부에 레일을 추가하면 점유를 상속한 원자 셀로 분할한다.
9. 스냅·최소 간격·레일 추가·셀 분할·곡률/사선 후보 계산을 순수 서비스로 옮긴다.
   - 현재 레일 추가는 모든 인덱스와 셀 배열을 직접 이동한다 (`src-next/gridSystem2EditorModel.ts:320-356`).
   - 현재 삭제는 참조를 이전 레일로 옮기고 서로 다른 점유 셀도 OR 병합한다 (`src-next/gridSystem2EditorModel.ts:359-390`).
10. 보조 레일을 두 기준 레일 사이의 `between` 위치로 생성하는 명령을 구현한다.
11. `collectRailUsages()`를 구현한다.
   - 하드 참조: 레이아웃 split/part edge, 중심선 앵커/핸들, 곡률/사선 교점.
   - 면 참조: 삭제 시 양쪽 점유 상태나 윤곽이 달라지는 셀 경계.
   - 베리에이션 참조: 코어 override, 보조 레일 `between` binding, 참조 재연결.
   - 마스터 참조: 요소·레일 삭제 시 고아가 되는 문맥별 sparse override.
12. 삭제 정책을 나눈다.
   - 코어 레일: 항상 삭제 차단, 이동과 문맥 override만 허용.
   - 보조 레일: 사용 중 차단 → 참조 이전 → 삭제.
   - 셀 경계 레일: 양쪽의 점유·곡률·사선 상태가 다르면 자동 OR 병합하지 않고 차단.
   - 마스터 요소: 관련 variant를 재연결하거나 함께 제거하기 전까지 삭제 차단.
13. `rebindGridReference()`를 구현해 특정 앵커·핸들·셀 경계·boundary treatment만 새 레일로 재연결할 수 있게 한다.
14. sparse override의 적용·제거·provenance·고아 참조 검출을 구현한다.
15. 공통 command transaction 인터페이스를 만들고 Step 3 이후 모든 원본 변경 명령이 이를 거치게 한다. 한 command가 여러 store를 수정해도 Undo/Redo 한 단계가 된다.
16. Grid v1 실험 데이터를 v2 타입으로 변환하는 명시적 import 함수를 작성한다. 자동 적용하거나 구형 localStorage를 삭제하지 않는다.
17. `shapeSystemStore`를 Zustand + Immer + persist 패턴으로 추가한다. 파생 윤곽과 `resolvedPartGrid`는 저장하지 않는다.
18. FontData 1.3.0의 최소 마이그레이션 골격과 선택적 `shapeSystem` 필드를 이 단계에서 정의하되 전체 저장 통합은 Step 7에서 완료한다.

#### 신규 파일

- `src/stores/shapeSystemStore.ts`
- `src/services/masterGridCommands.ts`
- `src/services/gridReferences.ts`
- `src/services/gridV1Import.ts`

#### 수정/이관 파일

- `src/types/index.ts`
- `src-next/gridSystem2EditorModel.ts`
- `src-next/grid-system-2-editor.test.ts`

#### 완료 기준

- 레일 추가 후 기존 레일 ID와 교점 참조가 변하지 않는다.
- 마스터가 `jamoId + role`로 분리되고 섞임홀자의 각 채널이 자기 역할과 grid ID를 가진다.
- 모든 역할별 기본 형태 그리드가 X/Y축마다 같은 의미의 코어 레일 5개를 가지며 코어-only 기본 셀은 4×4다.
- 채워진 셀에 레일을 추가해도 전후 `InkRegion` 실루엣이 동일하고 새 셀은 원자 인접 셀 조건을 만족한다.
- 코어 레일 삭제가 항상 거부되고 코어 role과 사용처가 반환된다.
- 하드 참조가 있는 보조 레일 삭제가 거부되고 모든 사용처가 반환된다.
- 면 형태가 바뀌는 삭제가 명시적 승인 없이 수행되지 않는다.
- 마스터 요소 삭제로 고아 override가 생기면 삭제가 차단되고 관련 문맥 사용처가 반환된다.
- 레일 이동 후 연결된 곡률·사선·앵커 좌표가 같은 ID로 다시 계산된다.
- 순환 `between`, 다른 축 참조, 범위 밖 ratio, 레일 교차, `minGap` 위반이 저장 전에 거부된다.
- 보조 레일을 추가하고 특정 참조만 재연결해도 원본 코어 레일과 다른 참조는 변하지 않는다.
- 여러 store를 바꾸는 command가 하나의 transaction으로 Undo/Redo된다.
- 기존 Grid 2의 채우기 드래그, 국소 복원, 곡률, 사선, 키보드, 모바일 계약 테스트가 v2 모델에서도 통과한다 (`tests/e2e/grid-system-2-lab.spec.ts:28-90`).

#### 다음 단계 진입 조건

레이아웃과 자모가 배열 순서를 저장하지 않고 Rail ID와 의미 role만 참조해야 한다.

---

### Step 4. 7개 레이아웃 바인딩과 문맥 프리셋

#### 목표

공통 레이아웃 레일 하나를 움직였을 때 연결된 7개 패턴과 그 안의 문맥별 자소 베리에이션이 같은 화면에서 즉시 다시 계산되게 한다.

#### 변경

1. `SharedLayoutType`을 아래 7종으로 정의한다.
   - `choseong-only`
   - `choseong-jungseong-vertical`
   - `choseong-jungseong-horizontal`
   - `choseong-jungseong-mixed`
   - `choseong-jungseong-vertical-jongseong`
   - `choseong-jungseong-horizontal-jongseong`
   - `choseong-jungseong-mixed-jongseong`
2. `LayoutGridBinding`에 안정 split ID와 파트별 edge Rail ID를 저장한다. 현재 `Split`은 배열 순서만 있으므로 결정적 ID를 추가한다 (`src/types/index.ts:24-31,62-84`).
3. `resolveGridBoundSchema()`와 `resolveAllGridBoundSchemas()`를 작성한다.
4. `calculateBoxes()`에 스토어 의존성을 넣지 않고 해석된 스키마만 전달한다.
5. 역할별 `ContextGridPreset`을 정의하고 상속 순서를 구현한다.
   - 폰트 기본값.
   - 역할별 기본값.
   - 레이아웃 문맥 프리셋.
   - 자소별 문맥 override.
6. 7개 기본 문맥에 선택적 `medialClass`, `finalWidthClass`, `initialClass`를 조합하는 variant selector와 deterministic fallback 순서를 구현한다.
7. `resolveContextualPartGrid()`와 `projectPartGridToSlot()`을 순수 서비스로 작성하고 각 결과값의 provenance를 함께 반환한다.
8. 모든 자소에 같은 raw 레일 배열을 적용하지 않고 STANDALONE/CH/JU/JU_H/JU_V/JO 역할별 live 프리셋을 적용한다.
9. 섞임홀자 horizontal/vertical 채널은 각각 JU_H/JU_V 역할 grid와 슬롯을 해석한다.
10. 보정 화면, 충돌 검사, 모바일, SVG, OTF가 동일한 레이아웃 및 문맥 그리드 해석 서비스를 통과하게 한다.
11. `ㄱ·가·고·과·각·곡·곽` 비교 보드를 구현한다. 각 카드에서 슬롯, 코어 레일, 자동 파생 상태, 값의 상속 출처를 구분해 표시한다.
12. 레일 드래그 중에는 로컬 `draftGrid`와 `PreviewLayouts`만 갱신하고 pointerup에 한 번 커밋한다. pointercancel은 draft를 롤백한다.
13. Design Body는 기존 850×850 기준에서 해석한 뒤 현재 padding으로 비례 변환한다 (`src/utils/layoutCalculator.ts:107-160`).

#### 신규 파일

- `src/services/layoutGridProjection.ts`
- `src/services/layoutGridCommands.ts`
- `src/services/contextPartGridResolver.ts`
- `src-next/SharedLayoutGridBoard.tsx`
- `src-next/SharedLayoutGridBoard.module.css`

#### 수정 파일

- `src/types/index.ts`
- `src/stores/layoutStore.ts`
- `src/stores/shapeSystemStore.ts`
- `src-next/CalibrationSentenceEditor.tsx`
- `src/features/mobile-editor/MobileEditorV2Page.tsx`
- `src/renderers/SvgRenderer.tsx`
- `src/services/fontExportUtils.ts`

#### 완료 기준

- 바인딩이 없는 기존 10개 레이아웃 좌표는 Step 1 기준값과 동일하다.
- 레일 하나를 움직이면 연결된 7개 카드와 보정 문장이 같은 프레임 흐름에서 갱신된다.
- 연결되지 않은 레이아웃은 변하지 않는다.
- `ㄱ·가·고·과·각·곡·곽`의 STANDALONE/CH/JU/JU_H/JU_V/JO 영역이 예상 Rail ID에 연결된다.
- 같은 `ㄱ`의 역할별 기본 마스터가 각자 사용되는 문맥 프리셋을 통해 서로 다른 슬롯 비례로 자동 파생되며 한 역할 편집이 다른 역할 원본을 바꾸지 않는다.
- 동일한 기본 문맥에서 특징 태그가 있는 세부 variant와 기본 preset fallback이 결정적으로 선택된다.
- 레이아웃 슬롯을 움직여도 `ㄱ` 기본 마스터와 문맥 override 원본 값은 변하지 않고 `resolvedPartGrid`만 바뀐다.
- 역할·문맥 프리셋을 바꾸면 해당 역할의 관련 자소에 일괄 반영되고 다른 역할은 변하지 않는다.
- 섞임홀자의 horizontal/vertical 채널이 서로 다른 grid와 slot을 사용해도 화면과 OTF에서 같은 결과를 낸다.
- Design Body 가로·세로 변경 시 레일과 슬롯이 동일한 비율로 변환된다.
- 문맥별 중성 배치와 닫힌 초성 충돌 제한이 유지된다.

#### 다음 단계 진입 조건

면 데이터가 없어도 7개 레이아웃 공통 그리드의 전파와 자소 문맥 프리셋의 자동 파생·저장·Undo가 독립적으로 완성되어야 한다.

---

### Step 5. 자모 구성 데이터와 한 캔버스 선·면·베리에이션 편집

#### 목표

기존 중심선과 그리드 중심선·점유 면을 같은 자모와 같은 캔버스에서 독립 편집하고, 기본 자소 마스터와 문맥별 파생·보정을 하나의 최종 실루엣으로 확인한다.

#### 변경

1. `JamoData`에 선택적 `roleMasters?: JamoRoleMaster[]`를 추가하고 각 역할 마스터에 `construction`과 `contextVariants`를 둔다. 기존 `strokes/horizontalStrokes/verticalStrokes`는 그대로 지원한다 (`src/types/index.ts:288-307`).
2. `GridCenterlineElement`와 `GridAreaElement`를 구현한다.
   - 한 `GridAreaElement`가 여러 `filledCells`를 소유하며 셀 하나를 독립 면처럼 이동하지 않는다.
   - 신규 중심선의 앵커·꺾임은 X/Y Rail ID의 교점으로만 저장하고 자유 좌표를 별도 원본으로 두지 않는다.
3. 섞임홀자는 `main/horizontal/vertical` 채널로 기존 렌더 의미를 보존하되 각 채널이 자기 역할과 `gridId`를 가진다.
4. 현재 Grid 2의 셀 외곽·곡률·사선 로직을 UI 모델에서 분리해 `InkRegion[]`을 반환하게 한다.
   - 현재 실험 모델은 SVG `Q`/`L` 문자열을 직접 만든다 (`src-next/gridSystem2EditorModel.ts:596-660`).
   - 면 도구를 켜면 현재 역할 part grid의 모든 원자 셀을 직접 조작 대상으로 노출한다. 중심선과 겹치거나 안전하다고 추측한 일부 셀만 골라 노출하지 않는다.
   - 첫 칸이 비어 있으면 제스처 전체를 `채우기`, 차 있으면 전체를 `비우기`로 고정한다. 같은 칸을 왕복해도 한 번만 처리한다.
   - 드래그 중에는 Shape draft source와 파생 윤곽만 바꾸고 store·history·localStorage는 바꾸지 않는다. `pointerup`에서 전체 점유 변화를 한 transaction으로 저장하며 `pointercancel`·`lostpointercapture`는 시작 원본으로 돌아간다.
5. UI 구현 전에 geometry spike로 꼭짓점 접촉, 완전 중첩 경계, hole 접촉, 극소 링, self-intersection, positive island의 Boolean 예상 결과를 테스트로 고정한다.
6. 점유 셀 사각형을 먼저 Boolean union해 outer/hole 토폴로지를 명시한다. 꼭짓점만 맞닿은 셀도 고정한 계약대로 결정적으로 처리한다.
7. 곡률은 레일 교점 `from/vertex/to`와 0–1 `tension`을 원본으로 저장하고 SVG·OTF가 같은 곡선 생성 함수를 사용한다.
8. 기존 선을 자동 변환하지 않고 `그리드에 연결` 명령으로 앵커·핸들을 가장 가까운 교점에 투영한다. 전후 미리보기와 Undo를 제공한다.
9. 큰 캔버스에 `레이아웃·코어 레일·보조 레일·선·면·곡률·사선` 도구와 `결과 윤곽·원본 선·점유 면·레이아웃 영역` 레이어를 제공한다. 면 도구에서는 전체 원자 셀 경계를, 중심선 도구에서는 선택 가능한 Rail 교점과 연결 경로를 표시한다.
10. 편집 모드를 명확히 분리한다.
   - `기본 마스터 편집`: override되지 않은 모든 문맥에 전파.
   - `현재 문맥 편집`: 현재 자소·현재 문맥에만 override 저장.
   - `적용 범위 승격`: 현재 역할 전체, 같은 자소의 선택 문맥들, 기본 마스터 중 하나로 명시적 반영.
   - `기본값 복원`: 선택한 문맥 override와 보조 참조를 제거.
11. 현재 문맥의 모든 같은 역할 자소 기준을 바꿀 때는 코어 레일의 문맥 프리셋을 수정한다.
12. 특정 자소나 일부 획만 다르게 둘 때는 보조 레일을 추가하고 선택한 참조만 재연결한다.
13. 보조 레일 추가·참조 재연결 전후를 7개 비교 보드에서 즉시 확인한다.
14. 중심선 굵기는 Font Space에서 유지하고 면은 그리드와 함께 투영한다. `가·고·각·곡` stem 폭 측정이 허용 범위를 벗어날 때만 면 전용 inset constraint를 추가한다.
15. 첫 수직 검증은 `ㄱ` 기본 마스터와 가로홀자 문맥 보정, `ㅇ` 면+내부 공간과 납작형 문맥 보정, `ㅏ` 기존 중심선, `ㅂ·ㅎ·ㅙ`의 축별 코어 Rail 5개 충분성 검증으로 제한한다.
16. 굵기 UI를 조건부로 변경한다.
   - 선 전용: `전체 획 굵기`.
   - 혼합: `선 획 굵기`.
   - 면 전용: 숨김.

#### 현재 구현에서 확인할 소유 파일

- strict construction·면 geometry: `src/services/jamoConstruction.ts`
- 선·면 Shape primitive 해석: `src/services/shapeGlyphInkResolver.ts`
- 단일 셀 기술 조각 교체 대상: `src/services/baseMasterAreaCommandsV1.ts`
- source transaction·history: `src/stores/shapeSystemStore.ts`
- J-02 직접 조작 캔버스: `src-next/ShapeWorkspacePage.tsx`
- 기존 채우기 제스처 참고: `src-next/GridSystem2LabPage.tsx`, `src-next/gridSystem2EditorModel.ts`

`ConstructionGridEditor` 분리는 전체 그리드 점유 수직 흐름이 현재 J-02에서 검증된 뒤 진행한다. 이번 교체 조각에서 geometry·store·화면을 동시에 새 추상화로 옮기지 않는다.

#### 완료 기준

- `ㄱ` 한 자모 안에 중심선과 점유 면이 동시에 존재하고 각각 선택·편집된다.
- 면 도구에서 현재 part grid의 모든 원자 셀이 보이며 한 `GridAreaElement`의 점유 집합으로 연속 채우기·비우기 된다.
- 신규 중심선의 앵커·꺾임이 Rail 교점에 고정되고 Rail 이동 뒤에도 같은 ID 참조를 유지한다.
- 하나의 `ㄱ` 기본 마스터에서 `가·고·과·각·곡·곽`용 자동 파생 결과를 함께 확인한다.
- `고` 문맥의 `ㄱ`에 보조 레일을 추가하고 가로줄기만 재연결해도 기본 마스터와 다른 문맥은 변하지 않는다.
- 역할·문맥 코어 프리셋을 수정하면 해당 문맥의 모든 관련 자소가 갱신된다.
- 현재 자소 문맥 override를 삭제하면 자동 파생 기본값으로 정확히 복원된다.
- `ㅇ`의 outer와 hole이 명시적으로 분리되어 표시된다.
- `ㅇ·ㅅ·ㅊ`의 곡률이 동일한 rail refs와 tension으로 화면·OTF에서 재현된다.
- 곡률과 사선은 같은 모서리에 동시에 저장되지 않는다.
- 레이아웃 레일 이동으로 슬롯과 연결된 선·면의 최종 좌표가 함께 변하지만 기본 construction과 문맥 override 원본은 변하지 않는다.
- 연결하지 않은 기존 선은 변하지 않는다.
- 채우기 드래그는 첫 칸에서 결정한 채우기·비우기를 방문한 모든 셀에 한 번씩 적용하며 pointerup 한 transaction, cancel 무변, Undo 한 단계다. 레일 드래그와 참조 재연결도 각각 Undo 한 단계다.
- 전역 weight 변경이 면 좌표나 점유 상태를 바꾸지 않는다.
- `ㄱ·ㅇ·ㅏ·ㅂ·ㅎ·ㅙ` 검증 결과로 축별 코어 Rail 5개 계약의 유지 또는 재검토가 기록된다.

#### 다음 단계 진입 조건

화면 편집 단계에서 기본 마스터와 문맥별 차이값을 보존하면서 선·면 원본을 하나의 최종 실루엣으로 확인할 수 있어야 한다.

---

### Step 6. 화면·OTF 공통 합성과 실제 폰트 검증

#### 목표

문맥별 자소 베리에이션과 선·면 혼합 결과가 화면과 설치 가능한 OTF에서 같은 배치·윤곽·구멍·교차 결과를 갖게 한다.

#### 변경

1. `GlyphData.strokes`를 `ResolvedInkPrimitive[]` 기반으로 확장한다 (`src/services/fontExportUtils.ts:42-60`).
2. 화면과 OTF 모두 `resolveContextualPartGrid() → projectPartGridToSlot() → resolveGlyphInkPrimitives()` 순서를 사용한다.
3. 중심선과 면을 각각 `InkRegion[]`으로 변환한 뒤 글리프 단위로 union한다.
4. Grid 곡률은 Boolean 전에 적응형 polyline으로 평탄화한다.
   - 화면과 OTF에 같은 결과를 사용한다.
   - 초기 허용 오차는 0.5 font unit으로 두고 시각·점 수 테스트로 조정한다.
5. Boolean 전 중복점·공선점·극소 링을 제거하고 고정 정밀도로 양자화한다.
6. union 후 outer는 CW, hole은 CCW로 정규화한다. 현재 CFF union의 방향 정규화와 극소 링 제거를 일반화한다 (`src/services/contourBoolean.ts:9-67`).
7. Design Body 왼쪽 원점 이동, slant, Y축 반전, UPM 투영을 모든 원본에 같은 순서로 적용한다.
8. 편집 중에는 원본 레이어 합성으로 응답성을 유지하고, 확정 실루엣·비교 카드·OTF에는 공통 union 결과를 사용한다.
9. geometry spike에서 고정한 꼭짓점 접촉·겹치는 경계·hole 접촉·극소 링·self-intersection·positive island 계약을 공통 `inkBoolean`에 적용한다.

#### 수정 파일

- `src/services/contextPartGridResolver.ts`
- `src/services/glyphInkResolver.ts`
- `src/services/inkGeometry.ts`
- `src/services/inkBoolean.ts`
- `src/renderers/SvgRenderer.tsx`
- `src/services/fontExportUtils.ts`
- `src/services/fontGenerator.ts`

#### 완료 기준

- 선과 면이 교차하는 `ㄱ`에서 흰 틈이나 이중 상쇄가 없다.
- `ㅇ` 내부 공간이 화면과 OTF에서 유지된다.
- 중심선이 면의 hole을 지나가면 중심선 잉크만 해당 구간을 채운다.
- 꼭짓점 접촉·겹치는 경계·hole 접촉·극소 링·positive island 결과가 고정한 topology 계약과 일치한다.
- 같은 문맥 프리셋과 자소 override가 화면과 OTF에서 동일한 최종 자소 좌표를 만든다.
- 곡률·사선·slant·Design Body 원점 이동이 화면과 OTF에서 동일하다.
- `ㄱ·가·고·과·각·곡·곽`과 `ㅇ`을 브라우저 캡처 및 실제 OTF 렌더 이미지로 비교한다.
- 선 전용 글리프는 기존 기준 이미지와 동일하다.

#### 다음 단계 진입 조건

대표 수직 검증 글자의 자동 파생·사용자 보정 결과가 SVG와 실제 설치 OTF에서 동일하다고 승인되어야 한다.

---

### Step 7. 공유 히스토리·저장·모바일 통합

#### 목표

공통 레일과 문맥 프리셋처럼 여러 레이아웃과 자모에 영향을 주는 편집을 하나의 트랜잭션으로 저장하고 모든 진입점에서 복원한다.

#### 변경

1. Step 3부터 사용한 공통 command transaction에 보정 화면 로컬 history, Grid Lab 로컬 history, 기존 스토어 history를 수렴시킨다.
   - 현재 Grid Lab은 컴포넌트 로컬 `past/future`를 사용한다 (`src-next/GridSystem2LabPage.tsx:342-387`).
   - 현재 보정 화면도 컴포넌트 로컬 `history/future`를 사용한다 (`src-next/CalibrationSentenceEditor.tsx:907-915,1095-1121`).
2. `master-grid`, `context-grid-preset`, `layout-binding`, `jamo-construction`, `jamo-context-variant`, `reference-rebinding` 히스토리 항목을 before/after 원본만으로 저장한다.
3. 파생 윤곽·resolved schema·`contextPartGrid`·`resolvedPartGrid`는 히스토리에 저장하지 않는다.
4. 편집 핸들에 `touch-action: none`과 pointer capture를 적용한다.
   - pointerup만 마지막 draft를 한 번 커밋한다.
   - pointercancel과 명시적 취소는 draft를 롤백한다.
   - 동일 제스처가 중복 커밋되지 않게 한다.
5. Step 3 설계 스파이크가 통과한 뒤 필드 계약을 동결하고 `FontData`를 1.3.0으로 올린다. 선택적 `shapeSystem`, `roleMasters`와 그 내부 `construction/contextVariants`를 저장한다 (`src/types/database.ts:20-43`).
6. `collectFontData()`와 `applyFontData()`에 Shape System과 자소 문맥 베리에이션을 포함한다 (`src/services/fontDataBridge.ts:17-62`).
7. 현재 필드 존재 여부만 보는 `validateFontData()`를 버전별 parse/migrate 함수로 교체한다 (`src/services/fontDataBridge.ts:65-91`). legacy 데이터에 새 ID가 필요하면 namespace와 legacy 경로를 사용해 반복 실행해도 같은 ID가 생성되게 한다.
8. 구형 프로젝트는 기존 시각 결과를 유지하며 공통 그리드 및 문맥 베리에이션 연결이 해제된 상태로 로드한다.
9. Grid Lab v1 데이터는 `실험 데이터 가져오기`로만 가져오고 성공 후에도 원본 localStorage는 자동 삭제하지 않는다.
10. 모바일에서는 현재 레이아웃 큰 캔버스 + 가로 스크롤 7개 미리보기 + 하단 레일 사용처 및 적용 범위 시트를 제공한다.
11. 모바일에서도 기본 마스터 편집과 현재 문맥 편집 상태를 명확히 표시하고, 범위 승격 전 확인을 받는다.

#### 신규 파일

- `src/stores/projectHistoryStore.ts`
- `src/services/fontDataMigration.ts`
- `src-next/MobileSharedGridSheet.tsx`

#### 수정 파일

- `src/types/database.ts`
- `src/services/fontDataBridge.ts`
- `src/stores/layoutStore.ts`
- `src/stores/jamoStore.ts`
- `src/stores/shapeSystemStore.ts`
- `src-next/CalibrationSentenceEditor.tsx`
- `src/features/mobile-editor/MobileEditorV2Page.tsx`

#### 완료 기준

- 레일 드래그 한 번이 Undo/Redo 한 단계이고 7개 레이아웃이 함께 복원된다.
- 역할·문맥 프리셋 변경 한 번이 Undo/Redo 한 단계이고 영향받은 자소가 함께 복원된다.
- 자소별 보조 레일 추가와 참조 재연결이 각각 예측 가능한 한 단계로 복원된다.
- 면 칠하기 드래그 한 번이 Undo/Redo 한 단계다.
- 새 프로젝트, 기존 프로젝트, Grid Lab import 프로젝트가 각각 손실 없이 저장·재로드된다.
- 프로젝트 JSON 저장/불러오기와 OTF 추출이 동일한 Shape System과 문맥 베리에이션을 사용한다.
- 390px 화면에서 가로 overflow가 없고 레일 이동·면 채우기·곡률·사선·문맥 전환이 동작한다.
- 모바일 pointerup은 마지막 값만 한 번 저장하고 pointercancel은 원본 상태로 정확히 롤백된다.

#### 다음 단계 진입 조건

데스크톱과 모바일에서 생성한 프로젝트를 서로 열었을 때 기본 마스터·프리셋·override·보조 레일·참조 재연결·최종 좌표가 동일해야 한다.

---

### Step 8. 전체 자모 확장·성능·제품 문서 갱신

#### 목표

대표 검증을 통과한 구조를 67개 자모와 전체 한글 출력에 확장하고 제품의 기본 기능으로 승격할지 판단한다.

#### 변경

1. 초성·중성·종성 자모별로 기존 중심선 유지, 그리드 연결, 면 추가 여부를 명시적으로 선택한다.
2. 각 자소별로 역할·문맥 프리셋만으로 충분한지, 자소별 override가 필요한지 명시적으로 검토한다.
3. 동일한 결과를 갖는 문맥 베리에이션은 공유하고 불필요한 7벌 복제를 만들지 않는다.
4. 섞임홀자의 horizontal/vertical 채널과 겹받침을 포함한 전체 조합을 검증한다.
5. 캐시를 `base construction → contextual local geometry → quantized slot projection → final union`의 단계로 나눈다.
6. 키는 `jamoId + role + variant selector + revision IDs + style`을 기본으로 하고 slot 값이 필요하면 고정 정밀도로 양자화한다. 드래그 중 raw float box를 그대로 키로 사용하지 않는다.
7. 화면은 보이는 문장과 7개 비교 카드만 계산한다.
8. OTF 한 번의 생성 동안 동일 자모 원본과 동일 문맥의 기본 면 윤곽을 재사용하고 bbox가 연결된 그룹만 union한다.
9. 필요할 때만 전체 OTF 생성을 Web Worker로 옮긴다.
10. 제품 철학 문서에서 가설·사실·미결정을 구현 및 실제 렌더 검증 결과에 맞춰 갱신한다.

#### 수정 파일

- `src/data/baseJamos.json`
- `src/services/contextPartGridResolver.ts`
- `src/services/glyphInkResolver.ts`
- `src/services/fontGenerator.ts`
- `src-next/CalibrationSentenceEditor.tsx`
- `docs/PRODUCT_PHILOSOPHY.md`

#### 완료 기준

- 초성·중성·종성 67개 자모가 선 전용·면 전용·혼합 중 하나로 손실 없이 렌더된다.
- 67개 자모가 공통 역할·문맥 프리셋을 기본값으로 사용하고 필요한 자소만 명시적 override를 가진다.
- 완성형 11,172자와 호환 자모 51자를 포함한 OTF가 오류 없이 생성된다.
- 대표 글자 `ㅁ·ㅂ·ㅇ·ㅎ·ㅙ` 및 7개 레이아웃 글자의 실제 설치 렌더가 승인된다.
- 데스크톱 Chromium에서 7개 비교 카드가 보이는 레일 드래그의 commit-to-paint p95가 50ms 이하이다.
- 전체 생성 중 동일 자모·동일 문맥·동일 grid revision의 기본 면 윤곽은 한 번만 계산된다.
- 신규 Boolean 윤곽 회귀는 path 문자열 순서가 아니라 topology·hole 수·bbox·면적·픽셀 diff 기준을 통과한다.
- `npm run build`, `npm run lint`, `npm test`, 핵심 Playwright 전체가 통과한다.

## 6. 단계 전체 수용 기준

1. 기존 프로젝트를 열었을 때 사용자가 그리드 연결을 선택하기 전까지 시각 결과가 달라지지 않는다.
2. 7개 공통 레이아웃이 하나의 레이아웃 레일 객체를 참조하며 복사된 숫자값을 독립 원본으로 저장하지 않는다.
3. 레이아웃 슬롯 변경은 자소 기본 마스터를 덮어쓰지 않고 `resolvedPartGrid`만 다시 계산한다.
4. `jamoId + role` 기본 마스터가 역할·문맥 프리셋에 따라 7개 레이아웃에서 자동 파생된다.
5. 프리셋은 STANDALONE/CH/JU/JU_H/JU_V/JO 역할별로 적용되며 관련 없는 역할을 바꾸지 않는다.
6. 7개 기본 문맥과 특징 태그의 fallback 결과가 입력 순서와 무관하게 결정적이다.
7. 섞임홀자 horizontal/vertical 채널은 각각 자기 역할·grid·slot을 가진다.
8. 모든 역할별 기본 형태 그리드는 같은 의미의 X/Y 5개 코어 레일을 가지며 대표 검증 결과가 잠금되기 전에는 확장 가능성을 닫지 않는다.
9. 코어 레일은 삭제하거나 ID를 교체할 수 없고 위치 이동과 문맥 override만 가능하다.
10. 특정 자소의 특정 형태는 보조 레일과 참조 재연결로 수정할 수 있으며 기본 마스터와 다른 문맥은 변하지 않는다.
11. 현재 자소 문맥 override를 제거하면 프리셋 기반 파생 결과로 정확히 복원되고 값의 provenance가 표시된다.
12. 채워진 셀에 레일을 추가하면 원자 셀로 분할되며 보이는 잉크는 변하지 않는다.
13. 마스터 요소 삭제로 고아 override가 생기면 삭제가 차단되고 정확한 사용처를 보여준다.
14. 한 자모에서 중심선과 점유 면을 함께 저장·편집·Undo/Redo할 수 있다.
15. 면 도구는 전체 원자 셀을 직접 조작하고 하나의 면 요소에 다중 점유를 저장하며, 개별 셀 이동을 면 채우기로 노출하지 않는다.
16. Step 3 이후 여러 store를 바꾸는 command도 하나의 transaction으로 Undo/Redo된다.
17. 화면과 OTF가 같은 `resolvedPartGrid`, `ResolvedInkPrimitive[]`, union 규칙을 사용한다.
18. 선 전용 전체 굵기, 혼합형 선 굵기, 면 전용 굵기 숨김이 정확히 적용된다.
19. pointerup만 편집을 커밋하고 pointercancel은 원본으로 롤백한다.
20. 프로젝트 저장·불러오기·재접속·모바일·OTF가 같은 원본 데이터를 사용한다.
21. 대표 수직 검증을 통과하기 전에는 67개 자모 자동 변환을 시작하지 않는다.

## 7. 위험과 완화

| 위험 | 영향 | 완화 |
|---|---|---|
| 레이아웃 이중 원본이 남음 | 화면·저장·OTF 불일치 | Step 1을 독립 게이트로 두고 layoutProfile 별도 전달 경로를 제거한다 |
| layoutGrid와 partGrid를 완전히 독립 렌더함 | 네모틀 조합에서 같은 자소가 공간 변화에 대응하지 못함 | 원본은 분리하되 `contextPartGrid → slot projection`으로 최종 좌표를 파생한다 |
| 하나의 자소 윤곽을 단순 비균등 확대·축소함 | 획 굵기·속공간·자소 인상이 문맥마다 무너짐 | 역할·문맥 프리셋과 자소별 optical override를 두고 중심선 굵기는 별도 유지한다 |
| 레이아웃별 완성 윤곽을 7벌 복제함 | 마스터 수정 전파 실패·저장량 증가·불일치 | 프리셋 ID, rail override, 보조 레일, 참조 재연결만 저장한다 |
| 모든 역할에 같은 프리셋을 적용함 | 단독 자음·초성·중성·종성의 조형 규칙이 섞임 | STANDALONE/CH/JU/JU_H/JU_V/JO 역할별 프리셋으로 분리한다 |
| CH와 JO가 하나의 construction을 공유함 | 역할별 기본 비례 차이가 예외 override로 누적됨 | 영속 마스터를 `jamoId + role`로 분리하고 필요할 때만 연결한다 |
| 7개 문맥 enum이 실제 조합 차이를 모두 떠안음 | 문맥 폭발 또는 부정확한 자동 파생 | 7개 기본 문맥에 선택적 특징 태그와 deterministic fallback을 둔다 |
| 섞임홀자 채널이 하나의 gridId를 공유함 | JU_H/JU_V 슬롯과 형태 좌표가 뒤섞임 | channel별 role·gridId·elements 구조를 사용한다 |
| 코어 레일을 실제 레일로 교체·삭제함 | 프리셋·초기화·구형 데이터 의미 손실 | 코어 ID를 영구 유지하고 문맥 위치 override 또는 보조 레일 재연결만 허용한다 |
| 보조 레일에 absolute 값과 relative 값이 동시에 남음 | 좌표 원본과 Undo 결과가 모호해짐 | `absolute | between` union 중 하나만 저장한다 |
| between 레일이 순환하거나 레일 순서가 교차함 | 좌표 해석 실패·음수 셀·Boolean 오류 | 동일 축 비순환 그래프, ratio 범위, 단조 순서와 minGap을 저장 전에 검증한다 |
| 채워진 셀에 레일을 삽입함 | 점유 면이 갑자기 갈라지거나 큰 셀 의미가 모호해짐 | 인접 원자 셀로 분할하고 점유를 상속해 실루엣을 보존한다 |
| 인덱스 레일 삭제로 의미가 이동 | 곡률·사선·셀 손실 | 안정 ID, 사용처 검사, 참조 이전 후 삭제만 허용한다 |
| 마스터 요소 삭제 후 variant 참조가 남음 | 저장 후 재접속에서 조용한 형태 손실 | 고아 참조를 오류로 반환하고 재연결·관련 override 제거 전 삭제를 차단한다 |
| legacy 마이그레이션 때 매번 새 ID를 생성함 | 같은 프로젝트의 round-trip 비교와 참조 복원이 불안정함 | namespace + legacy 경로로 결정적 ID를 생성하고 마이그레이션 반복 동일성을 테스트한다 |
| 곡선 Boolean이 점을 과도하게 생성 | 화면 지연·OTF 용량 증가 | 0.5 unit 적응형 평탄화, 공선점 제거, 캐시, 대표 글자 점 수 측정 |
| `ㅇ` hole과 다른 선의 교차 의미가 모호함 | 흰 구멍 또는 원치 않는 삭제 | hole은 면 원본의 로컬 counter로 정의하고 전역 negative 면은 제외한다 |
| 레일 이동 때 모든 글자를 재계산 | 드래그 버벅임 | 보이는 글자만 계산하고 자모 기본 윤곽을 grid/preset/variant revision으로 캐시한다 |
| 히스토리 통합을 Step 7까지 미룸 | Step 3~6 command를 다시 작성하고 Undo 범위가 불일치함 | Step 3에서 transaction 계약을 도입하고 Step 7에서는 기존 UI history만 수렴시킨다 |
| 기존 선 자동 스냅으로 디자인 손실 | 기존 프로젝트 회귀 | 자동 변환 금지, 전후 비교가 있는 명시적 그리드 연결만 제공한다 |
| 형태 그리드와 레이아웃 그리드 과결합 | 슬롯 수정이 자모 원형까지 왜곡 | 원본 store를 분리하고 동일 시스템 안에서 비영속 투영한다 |
| pointercancel 원인을 신뢰해 선택적으로 커밋함 | 브라우저별로 의도치 않은 편집이 저장됨 | 편집 핸들에 touch-action과 pointer capture를 적용하고 pointerup만 커밋, cancel은 롤백한다 |

## 8. 검증 명령과 증거

각 Step 완료 시 다음을 기본 실행한다.

```bash
npm run build
npm run lint
npm test
npm run test:e2e
```

구현 중에는 영향 범위 단위 테스트와 관련 Playwright를 우선 실행하고, 각 Step 완료 게이트에서 전체 회귀를 실행한다.

추가 증거:

- `ㄱ·가·고·과·각·곡·곽·ㅇ`의 변경 전/자동 파생/문맥 보정 후 브라우저 캡처.
- 기본 자소 마스터 변경 전후 7개 문맥 전파 결과.
- 역할·문맥 프리셋 변경 시 영향받은 자소와 영향받지 않은 역할 비교.
- 특정 자소에 보조 레일을 추가하고 일부 참조만 재연결한 전후 비교.
- 문맥 override 제거 후 프리셋 기본값으로 돌아가는 round-trip 비교.
- 동일 상태에서 생성한 OTF의 macOS CoreText 실제 렌더 캡처.
- 구형 FontData → v1.3.0 → 저장 → 재로드 round-trip JSON 비교.
- 코어 레일 삭제 차단과 사용 중 보조 레일 삭제 차단 시 반환된 레이아웃·자모·베리에이션 사용처 목록.
- 390px 모바일 Playwright 캡처, pointerup 단일 커밋, pointercancel 롤백 확인.
- 채워진 셀 레일 삽입 전후 InkRegion topology·면적 비교.
- 7개 기본 문맥과 특징 태그 fallback 선택 결과 및 provenance 목록.
- master 요소 삭제 차단 시 반환된 고아 variant 사용처 목록.
- Boolean 경계 계약별 topology·hole 수·bbox·면적·픽셀 diff.
- 전체 OTF 글리프 수, 생성 성공 여부, 캐시 호출 횟수, 대표 드래그 p95 기록.

## 9. 구현 중단 조건

- Step 1에서 기존 10개 레이아웃 또는 선 전용 OTF 결과를 무손실로 유지하지 못하면 공통 그리드 구현을 시작하지 않는다.
- Step 3 진입 전 설계 스파이크에서 `jamoId + role`, channel별 grid, variant fallback, sparse override, 셀 분할, transaction 중 하나라도 결정적으로 재현되지 않으면 생산용 그리드 모델 구현을 시작하지 않는다.
- Step 3에서 안정 ID 마이그레이션 후 곡률·사선 의미를 보존하지 못하면 v1 데이터를 자동 import하지 않는다.
- Step 4에서 하나의 기본 자소 마스터가 문맥 프리셋을 통해 파생되면서도 원본이 변하지 않는 것을 보장하지 못하면 자소별 베리에이션 편집을 시작하지 않는다.
- Step 5에서 코어 레일을 보존한 채 보조 레일과 참조 재연결만으로 국소 변형을 저장·복원하지 못하면 전체 자소 확장을 시작하지 않는다.
- Step 6에서 `ㅇ` 내부 공간과 선·면 교차를 화면·OTF 양쪽에서 동일하게 만들지 못하면 전체 자모 확장을 시작하지 않는다.
- Step 8 성능 기준을 넘으면 Web Worker 또는 윤곽 캐시를 먼저 적용하고 기본 기능 승격을 보류한다.

## 10. 승인 상태

이 문서는 구현 전 계획이며 상태는 `pending approval`이다. 명시적 실행 승인 전에는 소스 구현, 커밋, PR 작업을 시작하지 않는다.

이번 개정으로 다음 설계 논의가 반영되었다.

- `jamoId + role` 기본 마스터에서 네모틀 레이아웃 문맥별 베리에이션을 자동 파생한다.
- 사용자는 최대 7개 레이아웃 결과를 함께 확인하되 현재 역할이 실제로 쓰이는 결과만 수정하고 필요한 문맥만 보정할 수 있다.
- 역할·문맥 프리셋을 관련 자소의 기본값으로 일괄 적용한다.
- X/Y 각 5개의 의미 기반 코어 레일을 최소 계약으로 둔다.
- 코어 레일은 보존하고, 추가 형태는 보조 레일과 참조 재연결로 표현한다.
- 레이아웃 슬롯과 자소 형태 원본은 분리하되 최종 `resolvedPartGrid`에서 연결한다.
- 역할 마스터는 `jamoId + role`로 분리하고 섞임홀자 채널은 각자의 role·grid를 가진다.
- 7개 기본 문맥 위에 선택적 특징 태그와 deterministic fallback을 둔다.
- sparse override·live inheritance·provenance·고아 참조 차단을 데이터 계약으로 둔다.
- 셀 분할은 실루엣을 보존하고 pointercancel은 롤백한다.
