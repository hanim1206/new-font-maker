-- 계정 저장(docs/plans/2026-09-25_계정-저장.md): 소프트 삭제, 계정당 폰트 3개, 추출 버전.

-- 지운 폰트는 줄을 남기고 시각만 적는다. 앱은 deleted_at is null만 읽는다. 되살리기는 관리자가 이 칸을 비운다.
alter table public.font_projects add column if not exists deleted_at timestamptz;

-- OTF를 받을 때마다 +1. 파일 버전 Version 1.00N이 된다(같은 이름 재설치 때 옛 모양 캐시를 줄인다).
alter table public.font_projects add column if not exists export_revision integer not null default 0;

-- 계정당 지우지 않은 폰트 3개. 한도는 숫자 하나라 유료 때 바꾼다. 주인 없는 옛 행은 세지 않는다.
create or replace function public.limit_font_projects_per_user()
returns trigger
language plpgsql
as $$
declare
  live_count int;
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
  select count(*) into live_count
    from public.font_projects
    where user_id = new.user_id and deleted_at is null and id <> new.id;
  if live_count >= 3 then
    raise exception using
      errcode = 'P0001',
      message = 'font-limit',
      hint = '폰트는 계정당 3개까지 만들 수 있습니다.';
  end if;
  return new;
end;
$$;

drop trigger if exists font_projects_limit_per_user on public.font_projects;
create trigger font_projects_limit_per_user
  before insert or update of deleted_at, user_id on public.font_projects
  for each row execute function public.limit_font_projects_per_user();

-- 추출 버전 올리기. RLS를 그대로 타도록 invoker 권한. 남의 폰트면 null.
create or replace function public.bump_font_export_revision(font_id uuid)
returns integer
language sql
security invoker
as $$
  update public.font_projects
    set export_revision = export_revision + 1
    where id = font_id and deleted_at is null
    returning export_revision;
$$;
