-- An entry belongs to one collection, as the UI files it: a second link is refused like any quota (PT507); existing rows are left as they are.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- 0016's per-entry ceiling, lowered from 10 to 1; still statement-level, so a batch is checked once per entry.
create or replace function public.tg_item_categories_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from (select distinct n.item_id from new_rows n) linked
    where (
      select count(*)
      from public.item_categories ic
      where ic.item_id = linked.item_id
    ) > 1
  ) then
    raise exception 'an entry belongs to one collection'
      using errcode = 'PT507';
  end if;
  return null;
end
$$;

commit;
