-- 계정당 폰트 1개(베타). 한도는 규칙이라 유료 때 이 인덱스를 바꾼다.
-- 폐기·보관함을 붙이면 `where user_id is not null and archived_at is null`처럼 좁힌다.
-- 주인 없는 옛 행(user_id null)은 걸리지 않는다.
create unique index if not exists font_projects_one_per_user
  on public.font_projects (user_id)
  where user_id is not null;
