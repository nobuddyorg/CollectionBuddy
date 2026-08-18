-- One row per photograph (full + optional thumbnail), replacing per-item
-- storage.list() as how the app discovers an item's photographs. Storage
-- still holds the bytes and is the authority on what exists; this table is
-- a queryable index of it, written at upload time and cleared at delete.
--
-- No position column: there's no reorder feature, and created_at ascending
-- already keeps a freshly uploaded photograph from displacing the hero
-- slot (IMAGE_LIST_SORT, images.ts).
begin;

create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid not null,

  -- Full storage paths (`<uid>/<itemId>/<file>`), not bare object names --
  -- every reader (signing, Storage remove(), export) wants something it
  -- can hand straight to the Storage API rather than rebuild with
  -- imagePrefix() first. It is also what lets a grantee's read (see the
  -- shared select policy below) resolve straight to the owner's bytes
  -- without knowing the owner's uid at all.
  path_full text not null,
  path_thumb text,

  -- The full photograph's byte size only, mirroring what storage.list()'s
  -- metadata.size gave exportCategory.ts before -- thumbnails were never
  -- counted, so there is no thumb_size_bytes to keep in step with anything.
  size_bytes bigint,

  created_at timestamptz not null default now(),

  constraint images_path_full_key unique (path_full)
);

-- A thumbnail path is exactly as unique as a full one -- partial, since
-- path_thumb is nullable and a photograph whose thumbnail upload failed
-- (an existing, accepted failure mode -- see uploadImage in
-- useItemImages.tsx) has none.
create unique index if not exists images_path_thumb_key
on public.images (path_thumb)
where path_thumb is not null;

-- The read path: an item's photographs oldest-first, and what capturing
-- paths ahead of an item/category delete filters by. `id` breaks a tie
-- between two photographs uploaded in the same instant, the same reason
-- listItemsForExport orders by (created_at, id) rather than created_at
-- alone.
create index if not exists idx_images_item_created_at
on public.images (item_id, created_at asc, id);

-- Same precedent as item_categories (0005): index user_id even though
-- item_id already narrows most queries, since RLS is a user_id check and a
-- verification/backfill query wants "every image row this user has"
-- without joining through items.
create index if not exists idx_images_user
on public.images (user_id);

-- Ownership, the same shape as tg_item_categories_enforce (0002), but with
-- only one owned entity to check: images only ever references an item, not
-- a second owned row, so there is no cross-tenant-assignment branch to
-- write.
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

  if itm_user <> auth.uid() then
    raise exception 'ownership mismatch';
  end if;

  return new;
end
$$;

-- Insert only: a photograph row has nothing to change once written --
-- path_full, path_thumb and size_bytes are all fixed at upload time, same
-- "a mapping has nothing to change" reasoning as item_categories having no
-- update policy.
drop trigger if exists trg_images_enforce on public.images;
create trigger trg_images_enforce
before insert on public.images
for each row execute function public.tg_images_enforce();

alter table public.images enable row level security;

-- select: the owner, or a grantee whose category_shares grant covers this
-- photograph's item -- the same predicate 0011_category_shares.sql already
-- uses for categories/items/item_categories, and the same access
-- 0012_shared_photos.sql already grants on storage.objects for the actual
-- bytes. Unlike that storage policy, item_id is a native column here, not
-- something to parse back out of a path string, so this is a plain join.
drop policy if exists "select own images" on public.images;
create policy "select own images"
on public.images
for select
using (
  user_id = (select auth.uid())
  or exists (
    select 1
    from public.item_categories ic
    join public.category_shares s on s.category_id = ic.category_id
    where ic.item_id = images.item_id
      and s.invited_email = lower((select auth.jwt() ->> 'email'))
      and (s.expires_at is null or s.expires_at > now())
  )
);

-- insert/delete: owner only. Sharing (0011/0012) never grants anything but
-- select anywhere else in the schema, and this table is not the place to
-- start -- a grantee's view stays read-only the same way it is everywhere
-- else.
drop policy if exists "insert own images" on public.images;
create policy "insert own images"
on public.images
for insert
with check (user_id = (select auth.uid()));

drop policy if exists "delete own images" on public.images;
create policy "delete own images"
on public.images
for delete
using (user_id = (select auth.uid()));

grant select, insert, delete on public.images to authenticated;

-- Supabase's project bootstrap runs `alter default privileges in schema
-- public grant all on tables to postgres, anon, authenticated,
-- service_role` -- a default that applies to tables created after the
-- bootstrap too, including this one. 0008_revoke_anon.sql only revoked it
-- by name for the three tables that existed when it ran; asserted here for
-- images on the same "assert rather than assume" reasoning, not because
-- RLS would let anon through otherwise (auth.uid() is null for anon, and
-- auth.jwt() ->> 'email' is null too, so every policy predicate above
-- already denies).
revoke all on public.images from anon;

commit;
