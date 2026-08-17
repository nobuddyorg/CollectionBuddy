-- Editor role for category_shares (#554).
--
-- 0011_category_shares.sql was deliberately view-only. This migration adds a
-- second role, 'editor', that gets an invited grantee full parity with the
-- owner on item content within the shared category: add, edit, delete
-- items, and manage their photos. Category-level actions (rename, delete
-- the category, manage who it's shared with, export) stay owner-only --
-- out of scope here, unchanged from 0011.
--
-- Ownership stays denormalized and per-row, same as everywhere else in this
-- schema -- an item an editor creates is still owned by that editor
-- (enforce_user_id, 0002_functions.sql, untouched), because an item can
-- belong to several categories (item_categories is many-to-many,
-- 0003_tables.sql) and so has no single "owning category" a trigger could
-- stamp it with. That makes this a *symmetric* access problem, not the
-- one-directional "grantee reads owner's rows" shape 0011/0012/0013 used:
-- the owner needs write access to items an editor created, and an editor
-- needs write access to items the owner (or another editor) created.
-- has_category_write_access(), below, is the one predicate every policy in
-- this file is built from, so that symmetry is expressed once.
begin;

-- A grant is now two-valued: 'viewer' (0011's original, and the default, so
-- every existing row keeps behaving exactly as it does today) or 'editor'.
alter table public.category_shares
  add column if not exists role text not null default 'viewer';

alter table public.category_shares
  drop constraint if exists category_shares_role_valid;
alter table public.category_shares
  add constraint category_shares_role_valid check (role in ('viewer', 'editor'));

-- 0011 shipped with no update policy on purpose ("a grant is created and
-- removed, never edited"). The issue this migration closes explicitly asks
-- for toggling an existing share between viewer and editor, so this is now
-- the one field that may change after creation. tg_category_shares_enforce
-- is extended, not replaced, so the insert branch below is unchanged from
-- 0011 -- only an update branch is new.
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
    -- Only role may move. Every other column is re-derived or re-validated
    -- at insert time and has no business changing afterward -- re-sharing
    -- with a different email or category is a new invite, not a patch to
    -- this one, the same reasoning 0011 gave for having no update policy at
    -- all until now.
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

-- Owner only, and only for changing role -- tg_category_shares_enforce
-- above is the actual enforcement of "only role"; this policy is just the
-- gate on who may attempt an update at all.
drop policy if exists "update own category_shares role" on public.category_shares;
create policy "update own category_shares role"
on public.category_shares
for update
using (owner_user_id = (select auth.uid()))
with check (owner_user_id = (select auth.uid()));

grant update on public.category_shares to authenticated;

-- The one predicate every write policy below is built from: does auth.uid()
-- have write standing on category cat_id, either as its owner or as an
-- active editor grantee. security invoker (the default, stated explicitly)
-- rather than definer -- unlike tg_category_shares_enforce/tg_images_enforce,
-- which have to see rows the caller couldn't otherwise select (an invite's
-- target category before they have any grant on it), this only ever asks
-- "can *you* see yourself as owner or editor here", which is exactly what
-- the existing select policies on categories/category_shares already let
-- the caller see. Running as invoker means a non-owner, non-editor caller's
-- internal subqueries see no rows and this simply returns false, with no
-- need to bypass RLS to get there.
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

-- Postgres grants EXECUTE on a new function to PUBLIC by default
-- (0010_function_grants.sql's note on normalize_text/join_tags) -- revoked
-- immediately here rather than fixed up in a later migration.
revoke execute on function public.has_category_write_access(uuid) from public;
grant execute on function public.has_category_write_access(uuid) to authenticated;

-- items: redefines update/delete in full (0006_policies.sql's originals no
-- longer apply once these run, same convention 0011 used for select).
-- insert is untouched -- creating an item you own is already unrestricted;
-- the gate that matters is linking it into someone else's category, below.
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

-- item_categories: tg_item_categories_enforce's cross-tenant guard
-- ("itm_user <> cat_user") is replaced by has_category_write_access -- still
-- requires the caller to own the item they're linking (itm_user = auth.uid(),
-- unchanged below), just no longer requires the category to be theirs too,
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

-- delete: redefined in full. Previously only whoever created a given
-- item_categories row could remove it; now the category's owner or any
-- active editor can unlink any item, not just ones they personally added.
drop policy if exists "delete own item_categories" on public.item_categories;
create policy "delete own item_categories"
on public.item_categories
for delete
using (
  user_id = (select auth.uid())
  or public.has_category_write_access(category_id)
);

-- images: tg_images_enforce's ownership guard relaxed the same way as
-- item_categories' above -- new.user_id still follows the item's own owner
-- (itm_user), unchanged, since an image's parent is one unambiguous item,
-- not several categories the way an item's parent categories can differ.
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

-- storage.objects: 0012_shared_photos.sql extended select the same way for
-- read-only sharing. These three do the same for write, additive to
-- 0007_storage.sql's owner-only policies (Postgres ORs every applicable
-- policy together), using the same storage_item_id() path parser 0012
-- defined.
--
-- has_category_write_access(), not a bare editor-grant check: an object's
-- path is `<uploader's own uid>/<itemId>/<file>` (imagePrefix,
-- data/images.ts, uid from verifiedUserId() -- whoever is uploading right
-- now, not the item's owner), so an editor's upload already satisfies
-- 0007's plain "upload own objects" policy on its own. What 0007 cannot
-- cover is the *other* direction: the owner (or a second editor) reaching
-- an object that landed under a first editor's uid prefix, which is
-- exactly the symmetric problem has_category_write_access exists to solve
-- for items/item_categories/images above -- reused here rather than
-- writing a third, editor-only version of the same predicate.
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
