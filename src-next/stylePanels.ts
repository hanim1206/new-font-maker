import { DEV_TOOLS_ENABLED } from './devTools'

export type GlobalStylePanel = 'body' | 'brush' | 'beak'

/**
 * 스타일 화면에서 잠근 탭(`개발 중이에요` 표시 · 누를 수 없음). 네모꼴은 편집 화면이 네모꼴을 따르게 된 뒤(`2026-10-01_네모꼴-열기`) 풀었지만,
 * 속공간 지키기까지 끝나기 전에는 배포 빌드에서 사용자에게 열지 않는다(10-01 다시 잠금). 개발 서버 · e2e는 열려 있다.
 * 부리는 세로줄기 머리에만 붙고 맺음이 없어 한글날 오픈에서 잠갔다(10-07 사용자). 이미 켠 폰트의 부리는 그대로 그린다.
 * 풀 때는 이 줄에서 빼면 대시보드 부리 타일 · 폰트 탭 요약 칩도 같이 돌아온다.
 */
export const LOCKED_STYLE_PANELS: readonly GlobalStylePanel[] = DEV_TOOLS_ENABLED ? [] : ['body', 'beak']
