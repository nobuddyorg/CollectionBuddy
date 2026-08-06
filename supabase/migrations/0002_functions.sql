-- Every function in `public`. Before the tables, not after, because
-- `items.tags_text` is a generated column whose expression calls
-- `join_tags` -- a generated column cannot reference a function that does
-- not exist yet.
--
-- All of them pin `search_path = ''`, so every reference inside a body has
-- to be schema-qualified. Without it a `security definer` function resolves
-- names through the *caller's* search_path, which is how a user who can
-- create objects gets one of these to run their code as the owner.
begin;

-- Trim, collapse internal whitespace runs, and return NULL rather than an
-- empty string. The btrim matters: without it a whitespace-only value
-- normalizes to ' ' instead of NULL, survives `is not null` filters, and
-- gets geocoded as a blank query.
create or replace function public.normalize_text(txt text)
returns text
language sql
immutable
security definer
set search_path = ''
as $$
  select nullif(btrim(regexp_replace(coalesce($1, ''), '\s+', ' ', 'g')), '')
$$;

-- Backing expression for items.tags_text. Immutable and qualified down to
-- pg_catalog because a generated column's expression must be, and because
-- with `search_path = ''` nothing else would resolve.
create or replace function public.join_tags(tags text[])
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(pg_catalog.array_to_string($1, ' '), '')
$$;

-- Pinged on a schedule by .github/workflows/keep-alive.yml with the anon
-- key, to stop the free-tier project auto-pausing. Does nothing else.
create or replace function public.keepalive()
returns void
language sql
security invoker
set search_path = ''
as $$
  select 1
$$;

-- user_id is set by the server, never by the client: on insert it is taken
-- from the JWT, and on update any attempt to change it is reverted rather
-- than rejected. RLS already blocks writing a row you don't own; this is
-- what makes it impossible to hand a row *away* to someone else.
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

-- The database is the normalization authority -- the client sends raw
-- values and merges back whatever the row turns out to be, rather than
-- keeping its own copy of these rules.
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

-- item_categories carries its own user_id so its RLS policies don't have to
-- join. That copy is derived here rather than trusted from the client, and
-- the same pass rejects assigning one user's item to another user's
-- category -- the one place where a row references two owned rows at once.
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
-- last mapping deletes it. Statement-level with a transition table, not row
-- level: deleting a category cascades N mappings, and a row trigger would
-- run N EXISTS probes and N single-row deletes for what is one set-based
-- statement.
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
