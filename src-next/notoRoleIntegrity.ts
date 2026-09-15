import { PART_STAGES } from './notoCorpus'
import type { CorpusDetail, PartStage } from './notoCorpus'

function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function addIds(target: Set<number>, values: unknown): void {
  if (!Array.isArray(values)) return
  for (const value of values) {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0) target.add(value)
  }
}

/** 같은 윤곽을 서로 다른 자모가 소유하면 해당 역할의 긍정 검수를 차단한다. */
export function notoConflictingParts(detail: CorpusDetail): ReadonlySet<PartStage> {
  const owned = new Map<PartStage, Set<number>>()
  for (const stage of PART_STAGES) {
    const ids = new Set<number>()
    const observation = record(detail.stages[stage]?.observation)
    if (stage === 'medial') {
      const elements = observation.elements
      for (const element of Array.isArray(elements) ? elements : []) {
        const face = record(record(element).face)
        if (face.status !== 'candidate') continue
        const evidence = record(face.evidence)
        addIds(ids, evidence.contourIds)
        addIds(ids, [evidence.contourId])
      }
    } else {
      const group = record(observation.componentGroup)
      if (group.status === 'candidate') addIds(ids, record(group.value).contourIds)
    }
    owned.set(stage, ids)
  }
  const conflicts = new Set<PartStage>()
  for (let index = 0; index < PART_STAGES.length; index += 1) {
    const stage = PART_STAGES[index]
    for (const other of PART_STAGES.slice(index + 1)) {
      if ([...owned.get(stage)!].some((id) => owned.get(other)!.has(id))) {
        conflicts.add(stage)
        conflicts.add(other)
      }
    }
  }
  return conflicts
}
