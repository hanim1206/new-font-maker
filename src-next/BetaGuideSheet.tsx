import { SlideSheet } from './SlideSheet'

/** 화면 그림은 `public/beta-guide/`의 실제 앱 캡처(390×520, 2배). 화면이 바뀌면 다시 찍는다. */
const STEPS: { image: string; title: string; body: string; bottom?: true }[] = [
  { image: '1-dashboard', title: '대시보드', body: '내 폰트를 한눈에 보는 곳이에요. 위 카드에 지금 폰트로 쓴 문장이 보이고, 왼쪽 목차로 스타일 · 초성 · 중성 · 종성 · 레이아웃을 오가요.' },
  { image: '2-style', title: '스타일', body: '폰트 전체의 굵기 · 붓 · 둥글기 · 꺾임을 바꿔요. 위 문장이 바로 따라 바뀌어요.' },
  { image: '3-jamo', title: '초성 · 중성 · 종성', body: '고칠 자소를 골라 담고 ‘고치기’를 눌러요. 획을 끌어 모양을 바꾸면 그 자소가 들어간 글자가 다 같이 바뀌어요.' },
  { image: '4-layout', title: '레이아웃', body: '글자 안에서 초성 · 중성 · 종성이 앉는 자리예요. 여섯 틀마다 상자 선을 끌어 자리를 넓히거나 좁혀요.' },
  { image: '5-review', title: '검수', body: '만든 글자를 표로 모아 훑어봐요. 어색한 글자를 누르면 그 글자로 들어가 고쳐요.' },
  { image: '6-download', bottom: true, title: '다운로드 · 제보', body: '다 되면 폰트 카드의 ↓ 단추로 OTF 파일을 받아요. 이상한 곳이나 바라는 게 있으면 헤더의 피드백 버튼으로 알려 주세요.' },
]

const imageSrc = (name: string) => `/beta-guide/${name}.jpg`

const SLIDES = STEPS.map(({ image, title, body, bottom }) => ({ image: imageSrc(image), title, body, bottom, alt: `${title} 화면` }))

/**
 * 처음 들어온 베타 테스터 안내. 대시보드 위에 아래 판으로 뜨고, 섹션마다 실제 화면 한 장 + 설명 두 줄.
 * 넘김 · 닫기 규칙은 공지와 같은 판(`SlideSheet`) — 첫 장 `건너뛰기`, 마지막 장 `시작하기`, Esc로만 닫는다.
 */
export function BetaGuideSheet({ onClose }: { onClose: () => void }) {
  return <SlideSheet slides={SLIDES} label="한글칸글 둘러보기" testId="beta-guide" firstLabel="건너뛰기" lastLabel="시작하기" onClose={onClose} />
}
