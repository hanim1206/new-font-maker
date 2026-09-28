import { Filter } from 'lucide-react'

/** 선별: 친구 의견을 묶음 · 라벨 · 판단으로 거르는 곳(피드백 42). 지금은 빈 자리. */
export function TriagePage() {
  return <div className="flex max-w-lg flex-col items-start gap-3 rounded-lg bg-surface-2 p-6" data-testid="admin-triage">
    <Filter className="h-5 w-5 text-text-dim-4" />
    <strong className="text-base font-bold">아직 비어 있어요</strong>
    <p className="text-sm leading-relaxed text-text-dim-4">
      친구 의견을 같은 문제끼리 묶고 라벨 · 판단(보드로 · 답장만 · 지켜봄 · 버림)을 붙이는 곳이에요. 보드로 간 것만 옵시디언 피드백 보드에 들어가요.
    </p>
  </div>
}
