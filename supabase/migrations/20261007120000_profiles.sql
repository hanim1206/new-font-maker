-- 카카오 로그인 + 다운로드 게이트(docs/plans/2026-10-06_카카오-로그인-다운로드-게이트.md): 프로필 · 한도 · 동의 · 탈퇴.
-- 운영 DB에는 사용자 확인 뒤 적용한다.

-- 계정마다 한 줄. auth.users가 지워지면 같이 지워진다.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- 지우지 않은 폰트 한도. 새 계정 1, 기존 베타 계정 3(아래 채워 넣기).
  font_limit integer not null default 1 check (font_limit >= 0),
  -- 동의한 약관 버전(시행일, `legalInfo.ts`)과 시각. 비어 있으면 아직 동의 전.
  terms_version text,
  agreed_at timestamptz,
  -- 동의한 결과물 라이선스 id(예 ofl-1.1).
  license_id text,
  -- 탈퇴 시각. 비어 있으면 정상. 30일 지난 계정은 운영자가 대시보드에서 지운다.
  withdrawn_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- 본인 줄 읽기만. 쓰기 정책은 없다 — 아래 함수 둘(agree_terms · withdraw)로만 쓴다.
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own on public.profiles
  for select to authenticated
  using (id = auth.uid());

-- 가입하면 프로필 한 줄. 베타 발급 계정(user_metadata.beta)은 3, 나머지 1.
-- 여기서 던지면 가입 자체가 막히므로 삼킨다. 빠진 줄은 앱이 ensure_profile()로 만든다.
create or replace function public.handle_new_user_profile()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, font_limit)
    values (new.id, case when (new.raw_user_meta_data->>'beta') = 'true' then 3 else 1 end)
    on conflict (id) do nothing;
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists on_auth_user_created_profile on auth.users;
create trigger on_auth_user_created_profile
  after insert on auth.users
  for each row execute function public.handle_new_user_profile();

-- 기존 베타 계정(이메일 로그인)은 3으로 채워 넣는다. 그 밖(카카오)은 1. 이미 있는 줄은 건드리지 않는다.
-- (10-07 운영 적용 땐 전부 3으로 들어가서 카카오 줄만 1로 따로 고쳤다.)
insert into public.profiles (id, font_limit)
  select id, case when raw_app_meta_data->>'provider' = 'email' then 3 else 1 end from auth.users
  on conflict (id) do nothing;

-- 프로필이 없을 때 앱이 한 번 부른다(트리거가 실패했거나 트리거 전 계정). 있으면 그대로 돌려준다.
create or replace function public.ensure_profile()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.profiles;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'not-signed-in';
  end if;
  insert into public.profiles (id) values (auth.uid())
    on conflict (id) do nothing;
  select * into row from public.profiles where id = auth.uid();
  return row;
end;
$$;

-- 다운로드 직전 동의 시트. 약관 버전 · 라이선스를 적는다. 다시 동의하면 덮는다.
create or replace function public.agree_terms(version text, license text)
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.profiles;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'not-signed-in';
  end if;
  if version is null or version = '' or license is null or license = '' then
    raise exception using errcode = '22023', message = 'agree-terms-empty';
  end if;
  insert into public.profiles (id) values (auth.uid())
    on conflict (id) do nothing;
  update public.profiles
    set terms_version = version, license_id = license, agreed_at = now()
    where id = auth.uid()
    returning * into row;
  return row;
end;
$$;

-- 탈퇴. 날짜만 적는다. 이 뒤로 font_projects가 안 보이고(아래 정책), 앱은 로그인 직후 보고 로그아웃시킨다.
create or replace function public.withdraw()
returns public.profiles
language plpgsql
security definer
set search_path = public
as $$
declare
  row public.profiles;
begin
  if auth.uid() is null then
    raise exception using errcode = '42501', message = 'not-signed-in';
  end if;
  insert into public.profiles (id) values (auth.uid())
    on conflict (id) do nothing;
  update public.profiles
    set withdrawn_at = coalesce(withdrawn_at, now())
    where id = auth.uid()
    returning * into row;
  return row;
end;
$$;

revoke all on function public.ensure_profile() from public, anon;
revoke all on function public.agree_terms(text, text) from public, anon;
revoke all on function public.withdraw() from public, anon;
grant execute on function public.ensure_profile() to authenticated;
grant execute on function public.agree_terms(text, text) to authenticated;
grant execute on function public.withdraw() to authenticated;

-- 탈퇴 안 한 사람인지. 프로필이 없으면(트리거 전 계정) 정상으로 본다. RLS 정책에서 쓴다.
create or replace function public.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select withdrawn_at is null from public.profiles where id = auth.uid()), true);
$$;

-- font_projects는 탈퇴 안 한 본인만.
drop policy if exists font_projects_select_own on public.font_projects;
drop policy if exists font_projects_insert_own on public.font_projects;
drop policy if exists font_projects_update_own on public.font_projects;
drop policy if exists font_projects_delete_own on public.font_projects;

create policy font_projects_select_own on public.font_projects
  for select to authenticated
  using (user_id = auth.uid() and public.is_active_user());

create policy font_projects_insert_own on public.font_projects
  for insert to authenticated
  with check (user_id = auth.uid() and public.is_active_user());

create policy font_projects_update_own on public.font_projects
  for update to authenticated
  using (user_id = auth.uid() and public.is_active_user())
  with check (user_id = auth.uid() and public.is_active_user());

create policy font_projects_delete_own on public.font_projects
  for delete to authenticated
  using (user_id = auth.uid() and public.is_active_user());

-- 한도 트리거는 숫자 3 대신 profiles.font_limit을 읽는다. 프로필이 없으면 1.
create or replace function public.limit_font_projects_per_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  live_count int;
  limit_count int;
begin
  if new.user_id is null or new.deleted_at is not null then
    return new;
  end if;
  -- 이미 살아 있던 행의 일반 수정(저장 · 이름 바꾸기)은 세지 않는다. 새로 만들기 · 되살리기 · 주인 바꾸기만 센다.
  if tg_op = 'UPDATE' and old.deleted_at is null and old.user_id is not distinct from new.user_id then
    return new;
  end if;
  -- 같은 계정이 동시에 만들어도 한도를 넘지 않게 계정 단위로 줄 세운다.
  perform pg_advisory_xact_lock(hashtext(new.user_id::text));
  select coalesce((select p.font_limit from public.profiles p where p.id = new.user_id), 1) into limit_count;
  select count(*) into live_count
    from public.font_projects
    where user_id = new.user_id and deleted_at is null and id <> new.id;
  if live_count >= limit_count then
    raise exception using
      errcode = 'P0001',
      message = 'font-limit',
      hint = format('폰트는 계정당 %s개까지 만들 수 있습니다.', limit_count);
  end if;
  return new;
end;
$$;
