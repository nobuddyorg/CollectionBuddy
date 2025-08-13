-- supabase/migrations/0002_storage.sql

-- Bucket
insert into storage.buckets (id, name, public)
values ('item-images', 'item-images', false)
on conflict (id) do nothing;

-- Policies: allow only paths starting with "<uid>/..."
-- Avoid ALTER TABLE here; you’re not the table owner.

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
