-- 베타 로그인 전에 먼저 배포한다.
-- font_projects는 본인 행만 읽고 쓴다. 로그인 안 한 요청(anon)은 아무 행도 못 본다.
-- user_id가 빈 옛 행은 누구에게도 안 보인다(지우지는 않는다).

alter table public.font_projects enable row level security;

drop policy if exists font_projects_select_own on public.font_projects;
drop policy if exists font_projects_insert_own on public.font_projects;
drop policy if exists font_projects_update_own on public.font_projects;
drop policy if exists font_projects_delete_own on public.font_projects;

create policy font_projects_select_own on public.font_projects
  for select to authenticated
  using (user_id = auth.uid());

create policy font_projects_insert_own on public.font_projects
  for insert to authenticated
  with check (user_id = auth.uid());

create policy font_projects_update_own on public.font_projects
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy font_projects_delete_own on public.font_projects
  for delete to authenticated
  using (user_id = auth.uid());
