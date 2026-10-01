/**
 * 성격 스펙트럼 실험실(`/spectrum-lab`)이 보는 폰트 목록. 플랜 `첫 생성 패드`의 축 끝점을 고를 재료다.
 * 파일은 git에 없는 `.reference-fonts/` 아래에 있고, 개발 서버의 `/api/spectrum-fonts/<id>`가 이 목록에 있는 것만 내준다.
 * 새 폰트는 파일을 `.reference-fonts/spectrum/`에 넣고 여기 한 줄을 더한다.
 */

export type SpectrumFontUse = '본문' | '제목'

export interface SpectrumFont {
  id: string
  name: string
  /** `.reference-fonts/` 기준 경로. */
  file: string
  use: SpectrumFontUse
}

export const SPECTRUM_FONTS: SpectrumFont[] = [
  { id: 'noto-sans-kr', name: '노토 산스', file: 'spectrum/NotoSansKR-Regular.ttf', use: '본문' },
  { id: 'apple-sd-gothic-neo', name: 'Apple SD 산돌고딕 Neo', file: 'spectrum/AppleSDGothicNeo-Regular.ttf', use: '본문' },
  { id: 'pretendard', name: '프리텐다드', file: 'spectrum/Pretendard-Regular.otf', use: '본문' },
  { id: 'suit', name: 'SUIT', file: 'spectrum/SUIT-Regular.otf', use: '본문' },
  { id: 'wanted-sans', name: '원티드 산스', file: 'spectrum/WantedSans-Regular.otf', use: '본문' },
  { id: 'spoqa-han-sans-neo', name: '스포카 한 산스 Neo', file: 'spectrum/SpoqaHanSansNeo-Regular.otf', use: '본문' },
  { id: 'gothic-a1', name: '고딕 A1', file: 'spectrum/GothicA1-Regular.ttf', use: '본문' },
  { id: 'ibm-plex-sans-kr', name: 'IBM Plex Sans KR', file: 'IBMPlexSansKR-Regular.ttf', use: '본문' },
  { id: 'nanum-gothic', name: '나눔고딕', file: 'NanumGothic-Regular.ttf', use: '본문' },
  { id: 'nanum-gothic-coding', name: '나눔고딕코딩', file: 'spectrum/NanumGothicCoding-Regular.ttf', use: '본문' },
  { id: 'gowun-dodum', name: '고운돋움', file: 'GowunDodum-Regular.ttf', use: '본문' },
  { id: 'dotum', name: '돋움', file: 'Dotum-Regular.ttf', use: '본문' },
  { id: 'orbit', name: '오르빗', file: 'spectrum/Orbit-Regular.ttf', use: '제목' },
  { id: 'do-hyeon', name: '도현', file: 'spectrum/DoHyeon-Regular.ttf', use: '제목' },
  { id: 'jua', name: '주아', file: 'spectrum/Jua-Regular.ttf', use: '제목' },
  { id: 'sunflower', name: '해바라기', file: 'spectrum/Sunflower-Medium.ttf', use: '제목' },
  { id: 'gugi', name: '구기', file: 'spectrum/Gugi-Regular.ttf', use: '제목' },
  { id: 'black-han-sans', name: '검은고딕', file: 'BlackHanSans-Regular.ttf', use: '제목' },
]

export const SPECTRUM_FONT_API = '/api/spectrum-fonts'

export const spectrumFontById = (id: string): SpectrumFont | null => SPECTRUM_FONTS.find((font) => font.id === id) ?? null
