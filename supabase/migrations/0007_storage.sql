-- One private bucket. Object paths are `<uid>/<itemId>/<file>`; every
-- policy below says you may touch an object only if the first path segment
-- is your own user id. Nothing is served publicly -- the client reads
-- through signed URLs.
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

-- The four policies this project defines, keyed on the first path segment.
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
-- Supabase dashboard and found still live in production -- kept here so the
-- repo matches reality and a local stack reproduces it, not dropped as
-- apparent duplicates. Redundant, not permissive: they only ever match a
-- subset of what the four above already allow (auth.uid() is null for
-- `anon`, so the `left(name, 37)` check on those still denies).
drop policy if exists "list own" on storage.objects;
create policy "list own"
on storage.objects
for select
using (
  bucket_id = 'item-images'
  and auth.uid()::text || '/' = left(name, 37)
);

drop policy if exists "upload own" on storage.objects;
create policy "upload own"
on storage.objects
for insert
with check (
  bucket_id = 'item-images'
  and auth.uid()::text || '/' = left(name, 37)
);

-- No WITH CHECK on this one, as found: an UPDATE policy without one reuses
-- USING for the check, so the effect is the same as spelling it twice.
drop policy if exists "update own" on storage.objects;
create policy "update own"
on storage.objects
for update
using (
  bucket_id = 'item-images'
  and auth.uid()::text || '/' = left(name, 37)
);

drop policy if exists "delete own" on storage.objects;
create policy "delete own"
on storage.objects
for delete
using (
  bucket_id = 'item-images'
  and auth.uid()::text || '/' = left(name, 37)
);

commit;
