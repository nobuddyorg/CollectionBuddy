-- Before the tables, not after: `items.tags_text` is a generated column
-- whose expression calls `join_tags`, which must already exist.
--
-- All of them pin `search_path = ''` so every reference is schema-qualified
-- -- without it, a `security definer` function resolves names through the
-- *caller's* search_path, letting anyone who can create objects run code as
-- the owner.
begin;

-- Returns NULL, not '', for a whitespace-only input -- otherwise it would
-- survive `is not null` filters and get geocoded as a blank query.
create or replace function public.normalize_text(txt text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(coalesce($1, ''), '\s+', ' ', 'g')), '')
$$;

-- Backing expression for items.tags_text; qualified down to pg_catalog
-- because `search_path = ''` leaves nothing else resolvable.
create or replace function public.join_tags(tags text[])
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(pg_catalog.array_to_string($1, ' '), '')
$$;

-- Pinged on a schedule (.github/workflows/keep-alive.yml) to stop the
-- free-tier project auto-pausing.
create or replace function public.keepalive()
returns void
language sql
security invoker
set search_path = ''
as $$
  select 1
$$;

-- user_id is never trusted from the client: set from the JWT on insert, and
-- reverted (not rejected) on any update attempt to change it -- what stops
-- a row from being handed *away* to someone else.
create or replace function public.enforce_user_id()
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

create or replace function public.tg_set_updated_at()
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

create or replace function public.tg_categories_normalize()
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

-- The database is the normalization authority -- callers merge back
-- whatever this returns rather than keeping their own copy of the rules.
create or replace function public.tg_items_normalize()
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

-- item_categories carries its own user_id so its RLS policies don't need a
-- join; derived here, not trusted from the client. Also rejects assigning
-- one user's item to another user's category.
create or replace function public.tg_item_categories_enforce()
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

  if itm_user <> cat_user then
    raise exception 'cross-tenant assignment is not allowed';
  end if;

  new.user_id := itm_user;

  if itm_user <> auth.uid() then
    raise exception 'ownership mismatch';
  end if;

  return new;
end
$$;

-- An item with no categories left is unreachable in the UI, so removing its
-- last mapping deletes it. Statement-level, not row-level, so deleting a
-- category that cascades N mappings runs one set-based delete instead of N.
create or replace function public.delete_item_if_orphan()
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

commit;
