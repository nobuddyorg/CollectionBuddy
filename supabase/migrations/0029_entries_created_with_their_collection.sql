-- An entry and its collection link are written in one request, so a failed save leaves no entry behind in no collection (#775).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- As the caller: the items policies and tg_item_categories_enforce() decide exactly as for the two inserts it replaces; one call is one transaction.
create function public.create_items_in_category(target_category_id uuid, entries jsonb)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  created_ids uuid[];
  created_ats timestamptz[];
begin
  -- An import names each id and timestamp; the entry form leaves both to the column defaults.
  with created as (
    insert into public.items (id, created_at, title, description, place, place_lat, place_lng, tags)
    select
      coalesce(e.id, gen_random_uuid()),
      coalesce(e.created_at, now()),
      e.title,
      e.description,
      e.place,
      e.place_lat,
      e.place_lng,
      coalesce(e.tags, '{}')
    from jsonb_to_recordset(entries) as e (
      id uuid,
      created_at timestamptz,
      title text,
      description text,
      place text,
      place_lat double precision,
      place_lng double precision,
      tags text []
    )
    returning id, created_at
  )
  select array_agg(c.id), array_agg(c.created_at)
  into created_ids, created_ats
  from created as c;

  -- A second statement, so the link trigger sees the entries the first one wrote.
  insert into public.item_categories (item_id, category_id, created_at)
  select l.item_id, target_category_id, l.created_at
  from unnest(created_ids, created_ats) as l (item_id, created_at);
end
$$;

revoke execute on function public.create_items_in_category(uuid, jsonb) from public, anon;
grant execute on function public.create_items_in_category(uuid, jsonb) to authenticated;

-- Entries a failed two-request save left in no collection: invisible, yet on the owner's entry quota. A day's grace spares a save still in flight; one with photographs is left, as only the client may remove its objects first.
delete from public.items as i
where i.created_at < now() - interval '1 day'
  and not exists (
    select 1 from public.item_categories as ic where ic.item_id = i.id
  )
  and not exists (
    select 1 from public.images as im where im.item_id = i.id
  );

commit;
