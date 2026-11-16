-- An entry's cover is the photo it names in cover_image_id, else its oldest, also once that photo is gone (#894).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- Nullable, no default: every existing entry keeps its oldest photo as its cover, with nothing to backfill.
alter table public.items add column cover_image_id uuid;

-- A checked reference, not a foreign key: a key from items to images makes the running bundle's `images(...)` embeds ambiguous (PGRST201).
-- Invoker: whoever may update an entry already reads its photos, so RLS hides none the check needs.
create function public.tg_items_cover_is_own_photo()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.cover_image_id is not null and not exists (
    select 1
    from public.images im
    where im.id = new.cover_image_id
      and im.item_id = new.id
  ) then
    raise exception 'a cover must be a photo of its own entry'
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end
$$;

-- A trigger fires without the caller holding EXECUTE, so no API role needs it (0015).
revoke execute on function public.tg_items_cover_is_own_photo() from public, anon, authenticated;

-- Only when the cover is set: an edit of the other fields keeps a cover whose photo has since gone.
create trigger items_cover_is_own_photo
before insert or update of cover_image_id on public.items
for each row
execute function public.tg_items_cover_is_own_photo();

-- Same signature and access check as 0030; only the photographs' order changes: the cover first, then oldest first.
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
