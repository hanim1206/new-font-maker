import { withUniqueIds } from './strokeEditUtils'

/**
 * 한 자모 안에서 겹친 획 id를 고친다. 옛 `끊기`가 같은 획을 두 번 끊으면 `-b`가 둘 생겼다(10-08 ㅁ 버그).
 * 겹친 id는 한 획을 끌면 다른 획도 같이 움직이고, 화면에 획이 겹쳐 늘어나며, 저장 계약(획 id 중복 금지)에 걸려 저장이 막힌다.
 * 저장 계약은 그대로 막고, 자모를 불러들이는 입구(브라우저 사본 복원 · 폰트 적용 · 미리보기)에서 고친다.
 * 기본 획 세 채널은 함께, 계열 변형은 계열마다, 틀은 같은 규칙으로 따로 센다 — 같은 순서로 같은 새 id가 나와 틀과 획이 다시 짝을 맞춘다.
 * 형식을 모르는 값은 건드리지 않는다(검증이 따로 잡는다). 고칠 것이 없으면 같은 객체를 돌려준다.
 */

type Item = { id: string }
type Loose = Record<string, unknown>

const isRecord = (value: unknown): value is Loose => typeof value === 'object' && value !== null && !Array.isArray(value)
const isItemArray = (value: unknown): value is Item[] => Array.isArray(value) && value.every((item) => isRecord(item) && typeof item.id === 'string')

const CHANNELS = ['strokes', 'horizontalStrokes', 'verticalStrokes'] as const

function repairStrokeSet<T extends Loose>(holder: T): T {
  let next: Loose = holder
  const groups = CHANNELS.map((key) => isItemArray(holder[key]) ? holder[key] as Item[] : undefined)
  const fixed = withUniqueIds(groups)
  CHANNELS.forEach((key, index) => {
    if (fixed[index] !== groups[index]) next = { ...next, [key]: fixed[index] }
  })
  const variants = holder.contextStrokes
  if (isRecord(variants)) {
    let nextVariants: Loose = variants
    for (const [family, strokes] of Object.entries(variants)) {
      if (!isItemArray(strokes)) continue
      const [repaired] = withUniqueIds([strokes])
      if (repaired !== strokes) nextVariants = { ...nextVariants, [family]: repaired }
    }
    if (nextVariants !== variants) next = { ...next, contextStrokes: nextVariants }
  }
  return next as T
}

export function withUniqueJamoStrokeIds<T extends object>(jamo: T): T {
  if (!isRecord(jamo)) return jamo
  let next = repairStrokeSet(jamo)
  if (isRecord(jamo.frame)) {
    const frame = repairStrokeSet(jamo.frame)
    if (frame !== jamo.frame) next = { ...next, frame }
  }
  return next as T
}

/** 자모 지도(`{ ㄱ: 자모, … }`) 전부. 고칠 것이 없으면 같은 지도를 돌려준다. */
export function withUniqueStrokeIdsInMap<T extends object>(map: T): T {
  if (!isRecord(map)) return map
  let next: Loose = map
  for (const [char, jamo] of Object.entries(map)) {
    const repaired = withUniqueJamoStrokeIds(jamo as object)
    if (repaired !== jamo) next = { ...next, [char]: repaired }
  }
  return next as T
}

/**
 * 저장 꼴 FontData(`{ jamoData: { choseong, jungseong, jongseong } }`)의 겹친 획 id를 고친다. 저장 계약(`parseAndMigrateFontData`)은 그대로 막으므로
 * 그 앞에서 부른다 — 옛 `끊기`로 겹친 채 서버에 올라간 폰트도 열기 · 미리보기 · 추출이 된다. 고칠 것이 없으면 같은 값을 돌려준다.
 */
export function withUniqueStrokeIdsInFontData(value: unknown): unknown {
  if (!isRecord(value) || !isRecord(value.jamoData)) return value
  const source = value.jamoData
  let jamoData: Loose = source
  for (const key of ['choseong', 'jungseong', 'jongseong'] as const) {
    const map = source[key]
    if (!isRecord(map)) continue
    const repaired = withUniqueStrokeIdsInMap(map)
    if (repaired !== map) jamoData = { ...jamoData, [key]: repaired }
  }
  return jamoData === source ? value : { ...value, jamoData }
}
