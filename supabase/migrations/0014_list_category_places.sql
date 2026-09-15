-- The map used to page through an entire category one item at a time
-- (ITEM_PLACE_PAGE_SIZE = 1000, web/src/app/data/items.ts) just to fold the
-- rows down to distinct places on the client -- O(items in category)
-- requests and bytes for what the map actually draws, one pin per place:
-- measured at 100 sequential requests, 21.8 MB and ~22.9 s of DB time for a
-- 100,000-item category. See #622 (PERF-H5) for the full measurement.
--
-- This does the fold in Postgres instead, so the wire carries one row per
-- distinct place rather than one row per item.
--
-- `security invoker`, not definer: this runs with the caller's own RLS in
-- effect, exactly as if items/item_categories were queried directly -- it
-- changes nothing about who may see what, only how the already-visible
-- rows are shaped once they get here. No rls.spec.ts case is added on that
-- basis: the function grants no access the underlying table policies
-- didn't already allow, the same reasoning idx_item_categories_cat_created's
-- migration comment (0013) gives for an index needing none either. Contrast
-- `search_category_items` (#621), which *is* security definer and does
-- need one.
--
-- Bounded the same way every other unranged read in this app already is:
-- PostgREST's own max_rows (supabase/config.toml) truncates a result past
-- 1,000 rows. A category with over 1,000 *distinct* places is not a shape
-- this fix needs to handle -- the audit's own marker-rendering measurements
-- put Leaflet itself past its comfortable range well before then.
begin;

create or replace function public.list_category_places(
  cat_id uuid,
  like_pattern text default null
)
returns table (
  place text,
  place_lat double precision,
  place_lng double precision,
  titles text[],
  ids uuid[]
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    i.place,
    -- The first non-null coordinate pair, newest item first -- the same
    -- "any row can locate the place, ties go to the newest one" rule
    -- partitionByStoredCoords (Map/usePlaces.tsx) applied on the client
    -- before this moved server-side.
    (array_agg(i.place_lat order by i.created_at desc)
      filter (where i.place_lat is not null and i.place_lng is not null))[1],
    (array_agg(i.place_lng order by i.created_at desc)
      filter (where i.place_lat is not null and i.place_lng is not null))[1],
    array_agg(i.title order by i.created_at desc),
    array_agg(i.id order by i.created_at desc)
  from public.items i
  join public.item_categories ic on ic.item_id = i.id
  where ic.category_id = cat_id
    and i.place is not null
    and i.place <> ''
    and (
      like_pattern is null
      or i.title ilike like_pattern
      or i.description ilike like_pattern
      or i.place ilike like_pattern
      or i.tags_text ilike like_pattern
    )
  group by i.place
$$;

revoke execute on function public.list_category_places(uuid, text) from public;
grant execute on function public.list_category_places(uuid, text) to authenticated;

commit;
