-- Before the tables, not after: `items.tags_text`'s generated-column
-- expression calls `join_tags`, which must already exist. The plpgsql
-- trigger functions below reference tables that don't exist until 0003 --
-- fine, since plpgsql defers name resolution to first call. Not every
-- function here gets that for free: has_category_write_access and
-- has_category_read_access are `language sql`, which Postgres resolves at
-- CREATE FUNCTION time, so those two live in 0006_policies.sql instead,
-- after the tables they query exist.
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
security invoker
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(coalesce($1, ''), '\s+', ' ', 'g')), '')
$$;

create or replace function public.join_tags(tags text[])
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(pg_catalog.array_to_string($1, ' '), '')
$$;

-- Postgres grants EXECUTE on a new function to PUBLIC by default; neither
-- is meant as more than an internal helper.
revoke execute on function public.normalize_text(text), public.join_tags(text[])
from public;
grant execute on function public.normalize_text(text), public.join_tags(text[])
to authenticated;

-- Pinged on a schedule (.github/workflows/keep-alive.yml) to stop the
-- free-tier project auto-pausing -- the one thing `anon` may do.
create or replace function public.keepalive()
returns void
language sql
security invoker
set search_path = ''
as $$
  select 1
$$;

grant execute on function public.keepalive() to anon, authenticated;

-- user_id is never trusted from the client: set from the JWT on insert, and
-- reverted (not rejected) on any update attempt to change it.
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

-- Cross-tenant assignment is rejected unless the caller has write access to
-- the target category (has_category_write_access, below) -- ownership of
-- *this* category alone isn't enough, since an editor may assign their own
-- item into someone else's shared category too.
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

-- Statement-level, not row-level, with a transition table: deleting a
-- category that cascades N item_categories mappings runs one set-based
-- delete instead of N.
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

create or replace function public.caller_email()
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select lower((select auth.jwt() ->> 'email'))
$$;

revoke execute on function public.caller_email() from public;
grant execute on function public.caller_email() to authenticated;

-- has_category_write_access and has_category_read_access live in
-- 0006_policies.sql, not here: both are `language sql`, resolved against
-- the catalog at CREATE FUNCTION time (unlike plpgsql), so they can't be
-- created before the tables they query (0003) exist.

create or replace function public.tg_category_shares_enforce()
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
    -- Only role may move -- re-sharing with a different email or category
    -- is a new invite, not a patch to this one.
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

-- A raised error in an RLS USING clause aborts the whole statement, not
-- just the one row -- so a path that doesn't parse as `<uid>/<itemId>/<file>`
-- is caught and answered as NULL, letting that one policy simply not match
-- instead of taking the read down with it.
create or replace function public.storage_item_id(path text)
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

-- new.user_id still follows the item's own owner; the write-access check
-- only widens who may *insert* the row.
create or replace function public.tg_images_enforce()
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

commit;
