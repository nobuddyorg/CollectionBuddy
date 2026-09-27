-- A searched page carries its entries' photograph rows, as the unsearched page's embed does, so its photos are one round trip nearer (#780).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- `create or replace` cannot add an output column; the arguments are unchanged, so the previous bundle's calls still answer.
drop function public.search_category_items(uuid, text, int, int);

-- Same rows and access check as 0018. The photographs are only the returned entries' own, which the images policy already lets the caller read.
create function public.search_category_items(
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
  total_count bigint,
  images jsonb
)
language plpgsql
stable
security definer
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
begin
  return query
  select
    page.id,
    page.title,
    page.description,
    page.place,
    page.place_lat,
    page.place_lng,
    page.tags,
    page.total_count,
    -- Oldest first, `id` breaking a tie, as idx_images_item_created_at and the unsearched embed order them.
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', im.id,
            'item_id', im.item_id,
            'path_full', im.path_full,
            'path_thumb', im.path_thumb
          )
          order by im.created_at, im.id
        )
        from public.images im
        where im.item_id = page.id
      ),
      '[]'::jsonb
    )
  from (
    select
      i.id,
      i.title,
      i.description,
      i.place,
      i.place_lat,
      i.place_lng,
      i.tags,
      i.created_at,
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
    order by i.created_at desc, i.id desc
    offset page_from
    limit (page_to - page_from + 1)
  ) page
  order by page.created_at desc, page.id desc;
end
$$;

revoke execute on function public.search_category_items(uuid, text, int, int) from public, anon;
grant execute on function public.search_category_items(uuid, text, int, int) to authenticated;

commit;
