-- The catalogue's searched page, now also narrowed to one place, the map's "Show in list" (#898); 0037's search_category_items stays for the previous bundle and goes once it is retired.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- search_category_items' check, rows and order under a new name, since an added argument is a new signature; a like_pattern or at_place left out filters nothing.
-- at_place is the exact text the map groups pins by (list_category_places), a filter on the rows idx_item_categories_cat_created and items_pkey reach.
create function public.search_category_entries(
  cat_id uuid,
  page_from int,
  page_to int,
  like_pattern text default null,
  at_place text default null
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
    coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', im.id,
            'item_id', im.item_id,
            'path_full', im.path_full,
            'path_thumb', im.path_thumb
          )
          order by im.id is not distinct from page.cover_image_id desc, im.created_at, im.id
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
      i.cover_image_id,
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
        like_pattern is null
        or i.title ilike like_pattern
        or i.description ilike like_pattern
        or i.place ilike like_pattern
        or i.tags_text ilike like_pattern
      )
      and (at_place is null or i.place = at_place)
    order by i.created_at desc, i.id desc
    offset page_from
    limit (page_to - page_from + 1)
  ) page
  order by page.created_at desc, page.id desc;
end
$$;

revoke execute on function public.search_category_entries(uuid, int, int, text, text) from public, anon;
grant execute on function public.search_category_entries(uuid, int, int, text, text) to authenticated;

commit;
