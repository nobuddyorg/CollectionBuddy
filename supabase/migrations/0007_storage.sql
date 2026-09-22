-- One private bucket, paths `<uid>/<itemId>/<file>` with the uploader's uid first; the client reads through signed URLs.
begin;

-- Bucket-level limits: the picker's `accept` and the client's WebP compression are bypassable via the Storage API.
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
  5242880
);

-- The grants below assume RLS on storage.objects; `postgres` cannot enable it there on hosted Supabase, so verify instead.
do $$
begin
  if not (
    select relrowsecurity
    from pg_catalog.pg_class
    where oid = 'storage.objects'::regclass
  ) then
    raise exception 'storage.objects must have row level security enabled';
  end if;
end $$;

-- No UPDATE: an object's path never changes. The bootstrap grant by supabase_storage_admin still carries it, so the missing policy is the control.
grant usage on schema storage to authenticated;
grant select, insert, delete on storage.objects to authenticated;

-- Owner-only, keyed on the first path segment.
create policy "read own signed objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'item-images'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "upload own objects"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'item-images'
  and split_part(name, '/', 1) = auth.uid()::text
);

create policy "delete own objects"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'item-images'
  and split_part(name, '/', 1) = auth.uid()::text
);

-- Shared, keyed on the item id in the second segment, through the same predicates the tables use.
-- No shared insert: an upload lands under the uploader's own prefix, which the owner-only policy already allows.
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
