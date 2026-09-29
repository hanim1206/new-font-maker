/**
 * 관리자 `프리셋` 메뉴의 규칙 부분. 화면(`PresetPage.tsx`)과 테스트가 같이 쓴다.
 * 끌 수 있는 것은 레이아웃 대푯값 중 **자리**를 정하는 값(닿자 상자 네 변, 홀자 줄기의 자리)뿐이다. 길이 값(`spanFrom` · `spanTo` · `visibleLength`)은 표로만 본다.
 */
import { resolveContextBoxes } from '../../src/services/contextBoxResolver'
import type { ContextModel } from '../../src/services/contextBoxResolver'
import { MEDIAL_ROLE_SETS, modelIdentityOf, predictNotoTarget } from '../../src/services/notoVariationModel'
import type { ModelIdentity, VariationModel } from '../../src/services/notoVariationModel'

export interface PresetLayout {
  /** 모델 문맥 칸 id. */
  id: string
  label: string
  /** 대표 글자 8자. 모두 이 문맥 칸에 든다(테스트가 본다). */
  samples: string
}

export const PRESET_LAYOUTS: readonly PresetLayout[] = [
  { id: 'right', label: '오른쪽 홀자', samples: '가너더리머서지해' },
  { id: 'right-final', label: '오른쪽 홀자 · 받침', samples: '각넌덜림법설짐햇' },
  { id: 'bottom', label: '아래 홀자', samples: '고누도루모수조흐' },
  { id: 'bottom-final', label: '아래 홀자 · 받침', samples: '곡눈돌룸몹숭존흙' },
  { id: 'mixed', label: '섞임홀자', samples: '과뉘돼뤄뫼쉬좌희' },
  { id: 'mixed-final', label: '섞임홀자 · 받침', samples: '곽뉜됐뤘뫽쉰좍흰' },
]

const INITIALS = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ'
const MEDIALS = 'ㅏㅐㅑㅒㅓㅔㅕㅖㅗㅘㅙㅚㅛㅜㅝㅞㅟㅠㅡㅢㅣ'
const FINALS = ['', ...'ㄱㄲㄳㄴㄵㄶㄷㄹㄺㄻㄼㄽㄾㄿㅀㅁㅂㅄㅅㅆㅇㅈㅊㅋㅌㅍㅎ']

/** 완성 글자 → 모델 identity. 한글 완성형이 아니면 null. */
export function identityOfChar(char: string): ModelIdentity | null {
  const code = (char.codePointAt(0) ?? 0) - 0xac00
  if (code < 0 || code >= 11172) return null
  const final = FINALS[code % 28]
  return modelIdentityOf(INITIALS[Math.floor(code / 588)], MEDIALS[Math.floor((code % 588) / 28)], final || null)
}

const PART_LABEL: Record<string, string> = { initial: '첫닿자', final: '받침' }
const SIDE_LABEL: Record<string, string> = { left: '왼변', right: '오른변', top: '윗변', bottom: '아랫변' }
const ROLE_LABEL: Record<string, string> = {
  primaryBeam: '주 가로줄기', upperBeam: '위 가로줄기', lowerBeam: '아래 가로줄기',
  baseStem: '짧은기둥', leftStem: '왼 세로줄기', rightStem: '오른 세로줄기',
  innerPillar: '안쪽 기둥', outerPillar: '바깥 기둥',
}
const LENGTH_LABEL: Record<string, string> = { face: '자리', spanFrom: '시작', spanTo: '끝', visibleLength: '보이는 길이' }

/** 타깃 id → 사람이 읽는 이름. 모르는 id는 그대로. */
export function targetLabel(target: string): string {
  const face = /^(initial|final)\.roleFaces\.(left|right|top|bottom)$/.exec(target)
  if (face) return `${PART_LABEL[face[1]]} ${SIDE_LABEL[face[2]]}`
  const medial = /^medial\.(\w+)\.(face|spanFrom|spanTo|visibleLength)$/.exec(target)
  if (medial) return `${ROLE_LABEL[medial[1]] ?? medial[1]} ${LENGTH_LABEL[medial[2]]}`
  return target
}

/** 캔버스에서 끌 수 있는 선 하나. `axis`는 선이 움직이는 축(x = 세로선). 뻗는 범위는 다른 타깃의 예측값에서 온다. */
export interface PresetHandle {
  target: string
  axis: 'x' | 'y'
  /** 선이 뻗는 범위를 주는 타깃 둘. 없으면 글자 전체. */
  span: [string, string] | null
  part: 'initial' | 'final' | 'medial'
}

/**
 * 이 레이아웃에서 끌 수 있는 선. 모델에 층이 있는 타깃만. 순서: 첫닿자 · 홀자 · 받침.
 * `medialJamo`를 주면 그 홀자에 있는 줄기만 남긴다(가에는 ㅑ의 위 · 아래 가로줄기가 없다). 선은 줄기의 오른면 · 윗면이다.
 */
export function handlesOf(model: VariationModel, layer: string, medialJamo?: string): PresetHandle[] {
  const roles = medialJamo ? MEDIAL_ROLE_SETS[medialJamo] : undefined
  const handles: PresetHandle[] = []
  for (const target of Object.keys(model.targets)) {
    if (!model.targets[target].layers[layer]) continue
    const face = /^(initial|final)\.roleFaces\.(left|right|top|bottom)$/.exec(target)
    if (face) {
      const [, stage, side] = face
      const vertical = side === 'left' || side === 'right'
      const cross = vertical ? ['top', 'bottom'] : ['left', 'right']
      handles.push({ target, axis: vertical ? 'x' : 'y', span: [`${stage}.roleFaces.${cross[0]}`, `${stage}.roleFaces.${cross[1]}`], part: stage as 'initial' | 'final' })
      continue
    }
    const medial = /^medial\.(\w+)\.face$/.exec(target)
    if (medial) {
      const role = medial[1]
      if (roles && !roles.includes(role)) continue
      handles.push({ target, axis: role.endsWith('Beam') ? 'y' : 'x', span: [`medial.${role}.spanFrom`, `medial.${role}.spanTo`], part: 'medial' })
    }
  }
  const order = { initial: 0, medial: 1, final: 2 }
  return handles.sort((a, b) => order[a.part] - order[b.part])
}

/** 한 글자에서 타깃의 예측값(1000u). 이 문맥에 없으면 null. */
export function predictionOf(model: VariationModel, target: string, identity: ModelIdentity): number | null {
  return predictNotoTarget(model, target, identity)?.predicted ?? null
}

/** 캔버스 viewBox(100) 좌표 ↔ 모델 1000u. */
export const toView = (value: number) => value / 10
export const fromView = (value: number) => value * 10

/**
 * 한 글자의 선을 `nextPredicted`로 옮기려면 대푯값을 얼마로 할지. 효과 · 짝 칸은 그대로라 차이만큼 대푯값이 움직인다.
 * 그래서 같은 레이아웃의 다른 글자도 같은 만큼 움직인다.
 */
export function representativeFor(currentRepresentative: number, currentPredicted: number, nextPredicted: number): number {
  return currentRepresentative + (nextPredicted - currentPredicted)
}

/** 흔들어 볼 크기(1000u). */
const PROBE_UNITS = 12

function boxesOf(model: ContextModel, identity: ModelIdentity): number[] {
  const { boxes } = resolveContextBoxes({ identity, model })
  return Object.keys(boxes).sort().flatMap((part) => {
    const box = boxes[part as keyof typeof boxes]!
    return [box.x, box.y, box.width, box.height]
  })
}

/**
 * 끌면 이 글자의 상자가 실제로 바뀌는 선만. 대푯값을 조금 흔들어 상자를 다시 풀어 본다.
 * 홀자 잉크는 앱 획을 홀자 칸 하나에 맞춰 그려서, 칸 안쪽 줄기 자리(ㅏ 곁줄기 높이 · ㅗ 짧은기둥 가로 자리 등)는 지금 잉크에 닿지 않는다.
 * 그런 선을 띄우면 끌어도 획이 그대로라 캔버스에서 뺀다(표에는 남는다).
 */
export function liveHandles(model: ContextModel, identity: ModelIdentity, handles: readonly PresetHandle[]): PresetHandle[] {
  const base = boxesOf(model, identity)
  return handles.filter((handle) => {
    const layer = model.model.targets[handle.target]?.layers[identity.contextId]
    if (!layer) return false
    const probe: ContextModel = {
      ...model,
      model: {
        ...model.model,
        targets: {
          ...model.model.targets,
          [handle.target]: { layers: { ...model.model.targets[handle.target].layers, [identity.contextId]: { ...layer, representative: layer.representative + PROBE_UNITS } } },
        },
      },
    }
    const moved = boxesOf(probe, identity)
    return moved.length !== base.length || moved.some((value, index) => Math.abs(value - base[index]) > 1e-6)
  })
}
