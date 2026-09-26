-- 한임에게 의견(docs/plans/2026-09-27_계정-페이지와-의견.md). 친구 ↔ 한임 대화 한 줄 = 메시지 하나.
-- 첫 메시지의 id가 곧 대화 id(thread_id). 친구는 자기 줄만 읽고, 자기 이름(friend)으로만 쓴다.
-- 한임 답장 · 읽음 표시는 로컬 관리자 API가 service_role로 쓴다(RLS를 거치지 않는다).

create table if not exists public.feedback_messages (
  id uuid primary key default gen_random_uuid(),
  thread_id uuid not null,
  user_id uuid not null references auth.users (id) on delete cascade,
  author text not null check (author in ('friend', 'hanim')),
  body text not null check (char_length(body) between 1 and 2000),
  -- 보낸 화면 경로 · 폰트 이름 · 기기 · 빌드. 친구 메시지에만.
  context jsonb,
  created_at timestamptz not null default now(),
  -- 한임이 읽은 때. 친구 메시지에만 관리자가 적는다.
  read_at timestamptz
);

create index if not exists feedback_messages_user_idx on public.feedback_messages (user_id, created_at);
create index if not exists feedback_messages_thread_idx on public.feedback_messages (thread_id, created_at);

alter table public.feedback_messages enable row level security;

drop policy if exists feedback_messages_select_own on public.feedback_messages;
drop policy if exists feedback_messages_insert_own on public.feedback_messages;

create policy feedback_messages_select_own on public.feedback_messages
  for select to authenticated
  using (user_id = auth.uid());

-- 새 대화(thread_id = id)이거나 내 대화에 잇는 것만. 한임 이름 · 읽음 표시는 못 쓴다. 고치기 · 지우기는 없다.
create policy feedback_messages_insert_own on public.feedback_messages
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and author = 'friend'
    and read_at is null
    and (
      thread_id = id
      or exists (
        select 1 from public.feedback_messages thread
        where thread.id = feedback_messages.thread_id and thread.user_id = auth.uid()
      )
    )
  );
