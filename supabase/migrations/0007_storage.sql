-- One private bucket. Object paths are `<uid>/<itemId>/<file>`; every
-- owner-only policy below says you may touch an object only if the first
-- path segment is your own user id. A shared category's grantee reaches an
-- object under a *different* uid prefix instead, via storage_item_id (0002)
-- parsing the itemId back out and checking has_category_read/write_access,
-- the same predicates the mirrored tables use. Nothing is served publicly
-- -- the client reads through signed URLs.
begin;

-- Not a duplicate of the client-side checks: the file picker's `accept` and
-- the client's WebP compression are both bypassable by calling the Storage
-- API directly, which would otherwise let any signed-in user store
-- arbitrary content with no quota.
insert into storage.buckets (
  id,
  name,
  public,
  allowed_mime_types,
  file_size_limit
)
values (
  'item-images',
  'item-images',
  false,
  array['image/webp', 'image/jpeg', 'image/png'],
  5242880 -- 5 MiB
)
on conflict (id) do update
set allowed_mime_types = excluded.allowed_mime_types,
    file_size_limit    = excluded.file_size_limit,
    public             = excluded.public;

-- Storage needs its own grants: RLS on storage.objects is only reached if
-- the role may address the table at all.
grant usage on schema storage to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;

-- The four owner-only policies, keyed on the first path segment.
drop policy if exists "read own signed objects" on storage.objects;
create policy "read own signed objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'item-images'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "upload own objects" on storage.objects;
create policy "upload own objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'item-images'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "update own objects" on storage.objects;
create policy "update own objects"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'item-images'
  and split_part(name, '/', 1) = auth.uid()::text
)
with check (
  bucket_id = 'item-images'
  and split_part(name, '/', 1) = auth.uid()::text
);

drop policy if exists "delete own objects" on storage.objects;
create policy "delete own objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'item-images'
  and split_part(name, '/', 1) = auth.uid()::text
);

-- A second, older set of the same four policies, written by hand in the
-- Supabase dashboard. Verified redundant, not just similar, before dropping:
-- `left(name, 37)` matching `<uid>/` is the same test as `split_part(name,
-- '/', 1) = <uid>`, and these name no role where the four above name
-- `authenticated` -- a strict subset of what those already allow.
drop policy if exists "list own" on storage.objects;
drop policy if exists "upload own" on storage.objects;
drop policy if exists "update own" on storage.objects;
drop policy if exists "delete own" on storage.objects;

-- Additive: alongside the four owner-only policies above, not a rewrite --
-- Postgres ORs every applicable policy, so a grantee gains exactly the one
-- path granted here and the owner-only policies stay untouched.
drop policy if exists "read shared objects" on storage.objects;
create policy "read shared objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'item-images'
  and exists (
    select 1
    from public.item_categories ic
    where ic.item_id = public.storage_item_id(name)
      and public.has_category_read_access(ic.category_id)
  )
);

-- An object's path is prefixed with whoever is *uploading* it (imagePrefix,
-- data/images.ts), so an editor's own upload already satisfies the
-- owner-only policies above. This covers the owner (or a second editor)
-- reaching an object that landed under a different editor's uid prefix.
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
