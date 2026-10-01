import { LAB_SCREEN_ROUTES } from './screenRoutes'

/** `/calibration`은 랩 목록에 있지만(명세 · e2e용 셸 없는 편집기) 실험실 메뉴에는 안 띄운다. */
const HIDDEN_LAB_ROUTES = ['/calibration'] as const

export type LabRoute = Exclude<typeof LAB_SCREEN_ROUTES[number], typeof HIDDEN_LAB_ROUTES[number]>

/** 랩 주소의 이름. 목록은 `screenRoutes.ts`가 정하고 여기선 이름만 붙인다. 주소를 더하면 여기도 채워야 타입이 통과한다. */
const LAB_NAMES: Record<LabRoute, string> = {
  '/weight-lab': '굵기 보정',
  '/noto-corpus-lab': '노토 코퍼스',
  '/reference-lab': '레퍼런스',
  '/reference-group-lab': '레퍼런스 묶음',
  '/stroke-grammar-lab': '획 문법',
  '/stem-master-lab': '줄기 마스터',
  '/font-guide-lab': '기준선(Font Guide)',
  '/spectrum-lab': '성격 스펙트럼',
  '/design-body-lab': '네모꼴',
}

export interface LabEntry {
  route: LabRoute
  /** 관리자 주소 끝(`/admin/labs/<slug>`). 랩 주소에서 앞 `/`를 뗀 것. */
  slug: string
  name: string
}

const isShown = (route: typeof LAB_SCREEN_ROUTES[number]): route is LabRoute => !(HIDDEN_LAB_ROUTES as readonly string[]).includes(route)

/** 개발 서버 전용 실험실. 관리자 `실험실` 메뉴가 쓴다. */
export const LABS: LabEntry[] = LAB_SCREEN_ROUTES.filter(isShown).map((route) => ({ route, slug: route.slice(1), name: LAB_NAMES[route] }))

export const labBySlug = (slug: string): LabEntry | null => LABS.find((lab) => lab.slug === slug) ?? null
