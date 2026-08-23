-- FontData 1.4 writer를 활성화하기 전에 먼저 배포한다.
-- 구형 클라이언트가 JSONB 전체를 낮은 version payload로 덮어써 shapeSystem을 잃는 것을 막는다.

create or replace function public.guard_font_projects_font_data_version()
returns trigger
language plpgsql
as $$
declare
  old_version text;
  new_version text;
  old_parts int[];
  new_parts int[];
begin
  if old.font_data is not distinct from new.font_data then
    return new;
  end if;

  old_version := old.font_data ->> 'version';
  new_version := new.font_data ->> 'version';

  if old_version is null or old_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' then
    raise exception using
      errcode = '22023',
      message = '기존 FontData version이 없거나 유효하지 않습니다.';
  end if;
  if new_version is null or new_version !~ '^[0-9]+\.[0-9]+\.[0-9]+$' then
    raise exception using
      errcode = '22023',
      message = '새 FontData version이 없거나 유효하지 않습니다.';
  end if;

  old_parts := string_to_array(old_version, '.')::int[];
  new_parts := string_to_array(new_version, '.')::int[];
  if (new_parts[1], new_parts[2], new_parts[3])
      < (old_parts[1], old_parts[2], old_parts[3]) then
    raise exception using
      errcode = '22023',
      message = format('FontData downgrade는 허용되지 않습니다: %s -> %s', old_version, new_version);
  end if;

  if old.font_data ? 'shapeSystem'
      and jsonb_typeof(old.font_data -> 'shapeSystem') = 'object'
      and (
        not (new.font_data ? 'shapeSystem')
        or jsonb_typeof(new.font_data -> 'shapeSystem') <> 'object'
      ) then
    raise exception using
      errcode = '22023',
      message = '기존 shapeSystem은 일반 FontData update로 제거할 수 없습니다.';
  end if;

  return new;
end;
$$;

drop trigger if exists guard_font_projects_font_data_version on public.font_projects;

create trigger guard_font_projects_font_data_version
before update of font_data on public.font_projects
for each row
execute function public.guard_font_projects_font_data_version();
