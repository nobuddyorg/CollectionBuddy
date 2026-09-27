-- The map's places come back in a stable order, so the client can page them past PostgREST's max_rows (#756).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Same places as 0018, ordered by place; plpgsql is never inlined, so PostgREST's offset and limit page this order.
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
  ) g
  -- Places are distinct after the group by, so this order has no ties to break.
  order by g.place;
end
$$;

commit;
