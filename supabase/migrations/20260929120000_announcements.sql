-- 공지 팝업(docs/plans/2026-09-29_공지-팝업.md). 공지 하나 = 장 카드 여러 장 + 뜨는 자리 하나.
-- 로그인한 사람은 게시된 공지만 읽는다. 만들기 · 고치기 · 게시 · 내리기는 로컬 관리자 API가 service_role로 한다(RLS를 거치지 않는다).
-- 읽음은 서버에 적지 않는다 — 브라우저 localStorage(`announcement-read:<id>`).

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 1 and 80),
  -- 뜨는 자리 키(`src-next/announcements.ts`의 ANNOUNCEMENT_PLACES).
  place text not null,
  -- [{ image, title, body }]. 이미지는 아래 버킷의 공개 주소.
  slides jsonb not null default '[]'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  -- 처음 게시한 때. 가입일보다 앞선 공지는 새 사람에게 안 띄운다.
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists announcements_status_idx on public.announcements (status, published_at);

alter table public.announcements enable row level security;

drop policy if exists announcements_select_published on public.announcements;

create policy announcements_select_published on public.announcements
  for select to authenticated
  using (status = 'published');

-- 공지 이미지. 공개 읽기(주소만 알면 열린다), 올리기는 관리자 API(service_role)만.
insert into storage.buckets (id, name, public)
values ('announcements', 'announcements', true)
on conflict (id) do nothing;
