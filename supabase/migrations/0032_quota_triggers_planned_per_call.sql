-- Entry creation plans per call: a session's cached plans kept its first calls' row counts, so an import into a new project ran quadratic.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Same ceiling as 0009; the owners are a parameter, so force_custom_plan applies and each count reads the owner's index.
create or replace function public.tg_items_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
declare
  owners uuid[];
begin
  select array_agg(distinct n.user_id) into owners from new_rows n;

  if exists (
    select 1
    from public.items i
    where i.user_id = any(owners)
    group by i.user_id
    having count(*) > 50000
  ) then
    raise exception 'entry quota of 50000 reached'
      using errcode = 'PT507';
  end if;
  return null;
end
$$;

-- Same rule as 0020, one collection per entry, checked with one index probe per linked entry.
create or replace function public.tg_item_categories_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
declare
  linked uuid[];
begin
  select array_agg(distinct n.item_id) into linked from new_rows n;

  if exists (
    select 1
    from public.item_categories ic
    where ic.item_id = any(linked)
    group by ic.item_id
    having count(*) > 1
  ) then
    raise exception 'an entry belongs to one collection'
      using errcode = 'PT507';
  end if;
  return null;
end
$$;

-- The row triggers' lookups and the foreign key checks beneath it keep a sequential scan planned on small tables otherwise; only a caller's setting reaches the latter.
alter function public.create_items_in_category(uuid, jsonb)
set plan_cache_mode = force_custom_plan;

commit;
