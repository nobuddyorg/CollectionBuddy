-- The map and search RPCs plan each call for the category it names: Postgres 17 gives a SQL function's body a generic plan, costed on an average category.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Same places as 0002; plpgsql so plan_cache_mode applies, `security invoker` so the caller's RLS still shapes them. The id tiebreak keeps titles, ids and coordinates from one entry.
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
language plpgsql
stable
security invoker
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
begin
  return query
  select
    g.place,
    g.place_lat,
    g.place_lng,
    g.titles,
    -- ids only feed the geocode write-back, so a place with finite coordinates sends none; NaN and infinity are unlocated to the client too.
    case
      when g.place_lat not in ('NaN', 'Infinity', '-Infinity')
        and g.place_lng not in ('NaN', 'Infinity', '-Infinity')
        then '{}'::uuid[]
      else g.ids
    end
  from (
    select
      i.place,
      -- The newest item's coordinates, if any row has them.
      (array_agg(i.place_lat order by i.created_at desc, i.id desc)
        filter (where i.place_lat is not null and i.place_lng is not null))[1] as place_lat,
      (array_agg(i.place_lng order by i.created_at desc, i.id desc)
        filter (where i.place_lat is not null and i.place_lng is not null))[1] as place_lng,
      array_agg(i.title order by i.created_at desc, i.id desc) as titles,
      array_agg(i.id order by i.created_at desc, i.id desc) as ids
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
  ) g;
end
$$;

-- Same rows as 0002; both access checks run once per call, and the id tiebreak keeps pages stable when a plan changes between them.
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
language plpgsql
stable
security definer
set search_path = ''
set plan_cache_mode = force_custom_plan
as $$
begin
  return query
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
  order by i.created_at desc, i.id desc
  offset page_from
  limit (page_to - page_from + 1);
end
$$;

commit;
