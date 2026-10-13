---
name: style-change
description: >
  스타일가이드(`/style-guide` 실험실) 항목 번호로 들어오는 디자인 · UX 수정 요청을 가장 적은 파일만 읽고 처리한다.
  사용자가 첫 줄에 `스타일:`로 시작하거나 `button.size.sheet` · `color.semantic` 같은 항목 번호를 말하면 발동한다.
  토큰과 공용 부품만 고치고 화면 CSS 모듈은 열지 않는다.
---

# 스타일 수정 스킬

목표: 요청 한 번에 파일 하나(많아야 둘)를 열고, 바뀐 화면은 라이브러리의 `쓰는 화면`에서 찍어 보여 준다. 구조를 다시 찾느라 코드를 훑지 않는다.

## 요청 형식

`스타일: <항목 번호> <바꿀 것>` — 예 `스타일: button.size.sheet 모서리 14`, `스타일: color.semantic primary 초록 #1f9d55`, `스타일: tabs.dock 글자 13`.
항목 번호는 스타일가이드 왼쪽 목록에서 복사한 것(`src-next/styleLibrary.tsx`의 `id`). 번호 없이 말하면 아래 표에서 가장 가까운 항목을 골라 한 줄로 되묻는다.

## 항목 → 고치는 곳

| 항목 | 파일 | 어디 |
|---|---|---|
| `color.semantic` | `src/index.css` | `--color-*` 2층(의미 색). 1층 팔레트 `--palette-*`를 새로 더해 가리킨다. 값은 `R G B` 세 숫자 |
| `color.edit` | `src/index.css` + `src-next/editColors.ts` | `--color-edit-*` · `--color-editor-*`. 둘을 같이 고친다(`edit-colors.test.ts`가 맞춤) |
| `type.size` | `src/index.css` | `--font-10` ~ `--font-36`. 단계를 더하면 `tailwind.config.js` `fontSize`와 `src-next/styleGuard.ts` `FONT_STEPS`에도 더한다 |
| `type.weight` | `src/index.css` | `--weight-*`. 더하면 `WEIGHT_STEPS`도 |
| `shape.radius` | `src/index.css` | `--radius-*`. 더하면 `RADIUS_STEPS`도 |
| `shape.shadow` | `src/index.css` | `--shadow-*` |
| `button.variant.<이름>` | `src-next/components/ui/button.tsx` | `BUTTON_VARIANTS` 한 줄 |
| `button.size.<이름>` | `src-next/components/ui/button.tsx` | `BUTTON_SIZES` 한 줄 |
| `tabs.<변형>` | `src-next/components/ui/tabs.tsx` | `listVariants` · `triggerVariants` |
| `choice.<변형>` | `src-next/components/ui/choice-group.tsx` | `groupVariants` · `itemVariants` |
| `range.field` | `src-next/components/ui/range.tsx` | `Field` · `RangeBar` · `RangeTicks` |
| `checkbox.<tone>` | `src-next/components/ui/checkbox.tsx` | `checkboxVariants` |
| `switch.primary` | `src-next/components/ui/switch.tsx` | 한 부품 |
| `notice.bar` · `notice.card` | `src-next/AppNoticeBar.tsx` · `src-next/components/ui/notice-icon.tsx` | 막대 / 카드 분기 |
| `pressable.*` | 통일 전. 화면 CSS가 그린다 | 요청을 받으면 **어느 화면 몇 곳**인지 먼저 세어 보고 묻는다. 화면마다 손대는 일이라 한 묶음으로 |

변형 · 크기를 **새로** 만들 때는 같은 파일의 표에 한 줄 더하고, `src-next/styleLibrary.tsx`의 `*_INFO`에 이름 · 쓰는 곳 한 줄을 적는다. 부품마다 새 변형은 셋 이하(스타일 공통화 플랜 기준).

## 하지 않는 것

- 화면 CSS 모듈(`src-next/*.module.css`) · 화면 tsx를 열지 않는다. 여백 · 배치 요청이 와서 토큰으로 안 되면 "이건 화면별 값이라 N파일을 고쳐야 한다"고 먼저 말한다.
- Tailwind 임의 값(`text-[13px]` · `bg-[rgb(…)]`) · 날 색 · 단계 밖 숫자를 쓰지 않는다. 가드가 막는다.
- 토큰 값 자체를 바꾸는 요청과 새 변형을 만드는 요청을 한 번에 섞지 않는다.

## 바꾼 뒤

1. `npx vitest run src-next/style-guard.test.ts src-next/edit-colors.test.ts` — 통과 · 실패 수를 적는다.
2. 스타일가이드에서 그 항목의 `쓰는 화면`(단추는 코드에서 센 것, 나머지는 `styleLibrary.tsx` `screens`)을 읽고, 그 화면만 전후 스크린샷을 찍는다. 전역 값(색 · 글자 · 모서리)을 바꿨으면 대시보드 · 자소 · 검수 · 폰트 · 계정 다섯 화면.
3. 답은 세 줄: 고친 파일:줄 / 검사 결과 / 스크린샷. 다른 설명은 붙이지 않는다.
