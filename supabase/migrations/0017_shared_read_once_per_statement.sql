-- Shared reads check the caller's grants once per statement, not once per row: a SET clause keeps has_category_read_access() from being inlined.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The categories an active grant opens to the caller, at either role; ownership excluded, as in has_category_read_access().
create function public.granted_category_ids()
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select s.category_id
  from public.category_shares s
  where s.invited_email = public.caller_email()
    and (s.expires_at is null or s.expires_at > now())
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
  select cat_id in (select public.granted_category_ids())
$$;

alter policy "select categories with read access"
on public.categories
using (
  user_id = (select auth.uid())
  or id in (select public.granted_category_ids())
);

alter policy "select items with read access"
on public.items
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.item_categories ic
    where ic.item_id = items.id
      and ic.category_id in (select public.granted_category_ids())
  )
);

alter policy "select item_categories with read access"
on public.item_categories
using (
  user_id = (select auth.uid())
  or category_id in (select public.granted_category_ids())
);

alter policy "select images with read access"
on public.images
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.item_categories ic
    where ic.item_id = images.item_id
      and ic.category_id in (select public.granted_category_ids())
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
      and ic.category_id in (select public.granted_category_ids())
  )
);

-- Same rows as 0002; both access checks are scalar subqueries, so each runs once per call instead of once per row.
create or replace function public.search_category_items(
  cat_id uuid,
  like_pattern text,
  page_from int,
  page_to int
)
returns table (
  id uuid,
  title text,
  description text,
  place text,
  place_lat double precision,
  place_lng double precision,
  tags text[],
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id,
    i.title,
    i.description,
    i.place,
    i.place_lat,
    i.place_lng,
    i.tags,
    count(*) over () as total_count
  from public.items i
  join public.item_categories ic on ic.item_id = i.id
  where ic.category_id = cat_id
    and (
      i.user_id = (select auth.uid())
      or (select public.has_category_read_access(cat_id))
    )
    and (
      i.title ilike like_pattern
      or i.description ilike like_pattern
      or i.place ilike like_pattern
      or i.tags_text ilike like_pattern
    )
  order by i.created_at desc
  offset page_from
  limit (page_to - page_from + 1)
$$;

commit;
