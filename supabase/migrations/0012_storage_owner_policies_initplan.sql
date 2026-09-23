-- The owner-only storage.objects policies take auth.uid() once per statement, as 0006 does; Splinter skips the storage schema (#719).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

alter policy "read own signed objects"
on storage.objects
using (
  bucket_id = 'item-images'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

alter policy "upload own objects"
on storage.objects
with check (
  bucket_id = 'item-images'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

alter policy "delete own objects"
on storage.objects
using (
  bucket_id = 'item-images'
  and split_part(name, '/', 1) = (select auth.uid())::text
);

commit;
