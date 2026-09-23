-- Shared reads take the caller's grants once per statement, as an initPlan, not per row: a SET clause keeps has_category_read_access() from being inlined.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The categories an active grant to the caller's email opens, at either role; ownership excluded. The where clause is the guard: search runs it as its owner, past RLS.
-- plpgsql, not sql: its query is planned once per connection, not on every call.
create function public.granted_category_ids()
returns setof uuid
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  return query
  select s.category_id
  from public.category_shares s
  where s.invited_email = public.caller_email()
    and (s.expires_at is null or s.expires_at > now());
end
$$;
revoke execute on function public.granted_category_ids() from public, anon;
grant execute on function public.granted_category_ids() to authenticated;

-- One definition of a grant: the scalar check now asks the set.
create or replace function public.has_category_read_access(cat_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(cat_id = any(array(select public.granted_category_ids())), false)
$$;

alter policy "select categories with read access"
on public.categories
using (
  user_id = (select auth.uid())
  or id = any(array(select public.granted_category_ids()))
);

alter policy "select items with read access"
on public.items
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.item_categories ic
    where ic.item_id = items.id
      and ic.category_id = any(array(select public.granted_category_ids()))
  )
);

alter policy "select item_categories with read access"
on public.item_categories
using (
  user_id = (select auth.uid())
  or category_id = any(array(select public.granted_category_ids()))
);

alter policy "select images with read access"
on public.images
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.item_categories ic
    where ic.item_id = images.item_id
      and ic.category_id = any(array(select public.granted_category_ids()))
  )
);

alter policy "read shared objects"
on storage.objects
using (
  bucket_id = 'item-images'
  and exists (
    select 1
    from public.item_categories ic
    where ic.item_id = public.storage_item_id(name)
      and ic.category_id = any(array(select public.granted_category_ids()))
  )
);

commit;
