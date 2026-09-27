-- delete_item_if_orphan() plans its delete per call: a session's cached plan kept the row estimates of its first call, so a large category delete could run quadratic.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Same rule as 0002: an entry goes exactly when its last link does. The ids are a parameter, so force_custom_plan applies and the planner sees how many there are.
create or replace function public.delete_item_if_orphan()
returns trigger
language plpgsql
security definer
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
declare
  unlinked uuid[];
begin
  select array_agg(distinct o.item_id) into unlinked from old_rows o;
  if unlinked is null then
    return null;
  end if;

  delete from public.items i
  where i.id = any(unlinked)
    and not exists (
      select 1 from public.item_categories ic where ic.item_id = i.id
    );
  return null;
end
$$;

commit;
