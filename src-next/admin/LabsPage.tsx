import { ExternalLink } from 'lucide-react'
import type { MouseEvent } from 'react'
import { LABS } from '../labCatalog'
import type { LabEntry } from '../labCatalog'
import { labPathOf } from './adminSections'

/** 실험실 목록. 고르면 관리자 틀 안 iframe으로 연다. */
export function LabsList({ onOpen }: { onOpen: (event: MouseEvent, lab: LabEntry) => void }) {
  return <ul className="grid max-w-3xl gap-1.5 sm:grid-cols-2" aria-label="실험실 목록" data-testid="admin-labs-list">
    {LABS.map((lab) => <li key={lab.route}>
      <a
        href={labPathOf(lab)}
        onClick={(event) => onOpen(event, lab)}
        className="flex min-h-12 items-center justify-between gap-3 rounded-md bg-surface-2 px-3.5 py-2.5 text-sm transition-colors hover:bg-surface-3"
      >
        <span className="truncate font-semibold">{lab.name}</span>
        <code className="shrink-0 text-xs text-text-dim-5">{lab.route}</code>
      </a>
    </li>)}
  </ul>
}

/**
 * 랩 하나. 랩들은 주소창 · 화면 높이를 직접 읽어서 원래 주소 그대로 iframe에 띄운다.
 * 같은 출처라 로컬 저장소도 같다. 게이트가 켜진 서버면 로그인한 브라우저에서만 열린다.
 */
export function LabFrame({ lab }: { lab: LabEntry }) {
  return <iframe
    key={lab.route}
    src={lab.route}
    title={`실험실 · ${lab.name}`}
    className="block h-[calc(100dvh-3.5rem)] w-full border-0 bg-background"
    data-testid="admin-lab-frame"
  />
}

export function LabNewTabLink({ lab }: { lab: LabEntry }) {
  return <a
    href={lab.route}
    target="_blank"
    rel="noreferrer"
    className="ml-auto flex shrink-0 items-center gap-1.5 rounded-md px-2.5 py-1.5 text-sm text-text-dim-3 hover:bg-surface-3 hover:text-foreground"
  >
    <ExternalLink className="size-4" />
    <span className="hidden sm:inline">새 탭</span>
  </a>
}
