-- Adds a second category_shares role, 'editor', giving an invited grantee
-- parity with the owner on item content (add/edit/delete items, manage
-- photos) within the shared category. Category-level actions stay
-- owner-only.
--
-- Ownership stays per-row: an item an editor creates is still owned by
-- that editor (enforce_user_id, unchanged), since an item can belong to
-- several categories and so has no single "owning category" a trigger
-- could stamp it with. That makes this a *symmetric* access problem, not
-- the one-directional "grantee reads owner's rows" shape 0011/0012/0013
-- used -- the owner needs write access to items an editor created, and
-- vice versa. has_category_write_access(), below, is the one predicate
-- every policy here is built from.
begin;

-- A grant is now two-valued: 'viewer' (0011's original, and the default, so
-- every existing row keeps behaving exactly as it does today) or 'editor'.
alter table public.category_shares
  add column if not exists role text not null default 'viewer';

alter table public.category_shares
  drop constraint if exists category_shares_role_valid;
alter table public.category_shares
  add constraint category_shares_role_valid check (role in ('viewer', 'editor'));

-- 0011 shipped with no update policy; role is now the one field that may
-- change after creation. Extended, not replaced -- the insert branch below
-- is unchanged from 0011, only the update branch is new.
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

  caller_email := lower((select auth.jwt() ->> 'email'));
  if caller_email is not null and new.invited_email = caller_email then
    raise exception 'cannot share a category with yourself';
  end if;

  return new;
end
$$;

drop trigger if exists trg_category_shares_enforce on public.category_shares;
create trigger trg_category_shares_enforce
before insert or update on public.category_shares
for each row execute function public.tg_category_shares_enforce();

-- Owner only -- tg_category_shares_enforce above is what actually enforces
-- "only role"; this is just the gate on who may attempt an update.
drop policy if exists "update own category_shares role" on public.category_shares;
create policy "update own category_shares role"
on public.category_shares
for update
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

grant update on public.category_shares to authenticated;

-- The one predicate every write policy below is built from: does auth.uid()
-- have write standing on cat_id, as owner or active editor grantee.
-- security invoker, unlike the enforce triggers -- this only ever asks
-- "can *you* see yourself as owner or editor here", which the existing
-- select policies already let the caller see, so a non-owner/non-editor's
-- subqueries just see no rows and this returns false without needing to
-- bypass RLS.
create or replace function public.has_category_write_access(cat_id uuid)
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
      and s.invited_email = lower((select auth.jwt() ->> 'email'))
      and s.role = 'editor'
      and (s.expires_at is null or s.expires_at > now())
  )
$$;

-- Postgres grants EXECUTE to PUBLIC by default (0010) -- revoked
-- immediately rather than fixed up in a later migration.
revoke execute on function public.has_category_write_access(uuid) from public;
grant execute on function public.has_category_write_access(uuid) to authenticated;

-- Redefines update/delete in full (0006's originals no longer apply once
-- these run). insert is untouched -- the gate that matters is linking an
-- item into someone else's category, below.
drop policy if exists "update own items" on public.items;
create policy "update own items"
on public.items
for update
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.item_categories ic
    where ic.item_id = items.id
      and public.has_category_write_access(ic.category_id)
  )
)
with check (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.item_categories ic
    where ic.item_id = items.id
      and public.has_category_write_access(ic.category_id)
  )
);

drop policy if exists "delete own items" on public.items;
create policy "delete own items"
on public.items
for delete
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.item_categories ic
    where ic.item_id = items.id
      and public.has_category_write_access(ic.category_id)
  )
);

-- tg_item_categories_enforce's cross-tenant guard is replaced by
-- has_category_write_access: still requires the caller to own the item
-- they're linking, just no longer requires the category to be theirs too,
-- only writable by them.
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

-- Redefined in full: previously only whoever created a given
-- item_categories row could remove it; now the owner or any active editor
-- can unlink any item, not just ones they personally added.
drop policy if exists "delete own item_categories" on public.item_categories;
create policy "delete own item_categories"
on public.item_categories
for delete
using (
  user_id = (select auth.uid())
  or public.has_category_write_access(category_id)
);

-- Ownership guard relaxed the same way as item_categories' above.
-- new.user_id still follows the item's own owner, unchanged, since an
-- image's parent is one unambiguous item, not several categories the way
-- an item's parent categories can differ.
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

drop policy if exists "insert own images" on public.images;
create policy "insert own images"
on public.images
for insert
with check (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.item_categories ic
    where ic.item_id = images.item_id
      and public.has_category_write_access(ic.category_id)
  )
);

drop policy if exists "delete own images" on public.images;
create policy "delete own images"
on public.images
for delete
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.item_categories ic
    where ic.item_id = images.item_id
      and public.has_category_write_access(ic.category_id)
  )
);

-- Additive to 0007's owner-only policies, same storage_item_id() parser
-- 0012 used for read.
--
-- has_category_write_access(), not a bare editor-grant check: an object's
-- path is prefixed with whoever is *uploading* it, not the item's owner
-- (imagePrefix, data/images.ts), so an editor's own upload already
-- satisfies 0007's owner-only policy. What that can't cover is the owner
-- (or a second editor) reaching an object that landed under a different
-- editor's uid prefix -- the same symmetric problem has_category_write_access
-- solves above, reused rather than duplicated.
drop policy if exists "write shared objects" on storage.objects;
create policy "write shared objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'item-images'
  and exists (
    select 1
    from public.item_categories ic
    where ic.item_id = public.storage_item_id(name)
      and public.has_category_write_access(ic.category_id)
  )
);

drop policy if exists "update shared objects" on storage.objects;
create policy "update shared objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'item-images'
  and exists (
    select 1
    from public.item_categories ic
    where ic.item_id = public.storage_item_id(name)
      and public.has_category_write_access(ic.category_id)
  )
)
with check (
  bucket_id = 'item-images'
  and exists (
    select 1
    from public.item_categories ic
    where ic.item_id = public.storage_item_id(name)
      and public.has_category_write_access(ic.category_id)
  )
);

drop policy if exists "delete shared objects" on storage.objects;
create policy "delete shared objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'item-images'
  and exists (
    select 1
    from public.item_categories ic
    where ic.item_id = public.storage_item_id(name)
      and public.has_category_write_access(ic.category_id)
  )
);

commit;
