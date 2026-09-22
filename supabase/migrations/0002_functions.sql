-- Every function pins `search_path = ''`: a security-definer body must never resolve names through the caller.
-- Postgres grants EXECUTE to PUBLIC by default, so each callable helper revokes it and grants `authenticated` only.
begin;

-- NULL, not '', for whitespace-only input, so it fails `is not null` filters instead of being stored blank.
create function public.normalize_text(txt text)
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(coalesce($1, ''), '\s+', ' ', 'g')), '')
$$;

-- Backs items.tags_text, the generated column that gives tag search an ILIKE branch.
create function public.join_tags(tags text[])
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(pg_catalog.array_to_string($1, ' '), '')
$$;

revoke execute on function public.normalize_text(text), public.join_tags(text[])
from public;
grant execute on function public.normalize_text(text), public.join_tags(text[])
to authenticated;

-- Pinged by keep-alive.yml to stop the free-tier project auto-pausing; the one thing `anon` may call.
create function public.keepalive()
returns void
language sql
security invoker
set search_path = ''
as $$
  select 1
$$;

grant execute on function public.keepalive() to anon, authenticated;

-- lower(btrim()) on both sides of every sharing comparison; tg_category_shares_enforce stores the same shape.
create function public.caller_email()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select lower(btrim((select auth.jwt() ->> 'email')))
$$;

revoke execute on function public.caller_email() from public;
grant execute on function public.caller_email() to authenticated;

-- user_id is never trusted from the client: set from the JWT on insert, reverted (not rejected) on update.
create function public.enforce_user_id()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.user_id := auth.uid();
    return new;
  elsif tg_op = 'UPDATE' then
    if new.user_id <> old.user_id then
      new.user_id := old.user_id;
    end if;
    return new;
  end if;
  return new;
end
$$;

create function public.tg_set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create function public.tg_categories_normalize()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.name := public.normalize_text(new.name);
  return new;
end
$$;

create function public.tg_items_normalize()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  tmp text[];
begin
  new.title := public.normalize_text(new.title);
  new.description := public.normalize_text(new.description);
  new.place := public.normalize_text(new.place);

  if new.tags is not null then
    tmp := (
      select array_agg(distinct public.normalize_text(x) order by public.normalize_text(x))
      from unnest(new.tags) as u(x)
      where public.normalize_text(x) is not null
    );
    new.tags := coalesce(tmp, '{}'::text[]);
  end if;

  return new;
end
$$;

-- Write access to the target category, not ownership: an editor may file their own item into a shared category.
create function public.tg_item_categories_enforce()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  itm_user uuid;
  cat_user uuid;
begin
  select i.user_id into itm_user from public.items i where i.id = new.item_id;
  select c.user_id into cat_user from public.categories c where c.id = new.category_id;

  if itm_user is null or cat_user is null then
    raise exception 'item or category not found';
  end if;

  if not public.has_category_write_access(new.category_id) then
    raise exception 'cross-tenant assignment is not allowed';
  end if;

  new.user_id := itm_user;

  if itm_user <> auth.uid() then
    raise exception 'ownership mismatch';
  end if;

  return new;
end
$$;

-- Statement-level with a transition table: one set-based delete, never one probe per unlinked item.
create function public.delete_item_if_orphan()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.items i
  where i.id in (select item_id from old_rows)
    and not exists (
      select 1 from public.item_categories ic where ic.item_id = i.id
    );
  return null;
end
$$;

create function public.tg_category_shares_enforce()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  cat_owner uuid;
  caller_email text;
begin
  if tg_op = 'UPDATE' then
    -- Only role may change; a different email or category is a new invite.
    if new.category_id <> old.category_id
      or new.invited_email <> old.invited_email
      or new.owner_user_id <> old.owner_user_id
      or new.expires_at is distinct from old.expires_at
      or new.created_at <> old.created_at
    then
      raise exception 'only role may be changed on an existing share';
    end if;
    return new;
  end if;

  select c.user_id into cat_owner
  from public.categories c
  where c.id = new.category_id;

  if cat_owner is null then
    raise exception 'category not found';
  end if;

  if cat_owner <> auth.uid() then
    raise exception 'ownership mismatch';
  end if;

  new.owner_user_id := cat_owner;
  new.invited_email := lower(btrim(new.invited_email));

  if new.invited_email is null or new.invited_email = '' then
    raise exception 'invited_email required';
  end if;

  caller_email := public.caller_email();
  if caller_email is not null and new.invited_email = caller_email then
    raise exception 'cannot share a category with yourself';
  end if;

  return new;
end
$$;

-- NULL, never an error: a raise inside an RLS USING clause aborts the whole statement, not just that row.
create function public.storage_item_id(path text)
returns uuid
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  return split_part(path, '/', 2)::uuid;
exception when invalid_text_representation then
  return null;
end
$$;

grant execute on function public.storage_item_id(text) to authenticated;

-- user_id follows the item's owner; write access only widens who may insert the row.
create function public.tg_images_enforce()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  itm_user uuid;
begin
  select i.user_id into itm_user from public.items i where i.id = new.item_id;

  if itm_user is null then
    raise exception 'item not found';
  end if;

  new.user_id := itm_user;

  if itm_user <> auth.uid() and not exists (
    select 1
    from public.item_categories ic
    where ic.item_id = new.item_id
      and public.has_category_write_access(ic.category_id)
  ) then
    raise exception 'ownership mismatch';
  end if;

  return new;
end
$$;

-- The rest are `language sql` over tables 0003 creates; unlike plpgsql, Postgres parses those bodies at CREATE.
set local check_function_bodies = off;

-- Bundles category ownership in, so every write policy calling this can drop its own ownership check.
create function public.has_category_write_access(cat_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.categories c
    where c.id = cat_id
      and c.user_id = auth.uid()
  )
  or exists (
    select 1
    from public.category_shares s
    where s.category_id = cat_id
      and s.invited_email = public.caller_email()
      and s.role = 'editor'
      and (s.expires_at is null or s.expires_at > now())
  )
$$;

revoke execute on function public.has_category_write_access(uuid) from public;
grant execute on function public.has_category_write_access(uuid) to authenticated;

-- Deliberately excludes ownership: an owner must not see an item an editor merely filed into their category.
create function public.has_category_read_access(cat_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.category_shares s
    where s.category_id = cat_id
      and s.invited_email = public.caller_email()
      and (s.expires_at is null or s.expires_at > now())
  )
$$;

revoke execute on function public.has_category_read_access(uuid) from public;
grant execute on function public.has_category_read_access(uuid) to authenticated;

-- The map's distinct places for one category; `security invoker`, so the caller's own RLS shapes the rows.
create function public.list_category_places(
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
    -- The newest item's coordinates, if any row has them.
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

-- SECURITY DEFINER so the trigram indexes are reachable; its WHERE must equal what an RLS-scoped read allows.
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
      i.user_id = auth.uid()
      or public.has_category_read_access(cat_id)
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

revoke execute on function public.search_category_items(uuid, text, int, int)
from public;
grant execute on function public.search_category_items(uuid, text, int, int)
to authenticated;

commit;
