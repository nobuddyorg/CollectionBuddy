-- A photograph an editor adds to someone else's entry is that entry's owner's to read, and the editor's own-prefix writes to it end with the grant (#741).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The owner already reads the record (images.user_id is the entry's owner), so reading the bytes it names reveals nothing new.
create policy "read objects own photograph records name"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'item-images'
  and exists (
    select 1
    from public.images im
    where im.item_id = public.storage_item_id(name)
      and im.user_id = (select auth.uid())
      and name in (im.path_full, im.path_thumb)
  )
);

-- Only under an entry the caller sees and may write: an entry hidden from the caller, as after a revocation, is not one.
alter policy "upload own objects"
on storage.objects
with check (
  bucket_id = 'item-images'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and exists (
    select 1
    from public.items i
    where i.id = public.storage_item_id(name)
      and public.has_item_write_access(i.id, i.user_id)
  )
);

alter policy "delete own objects"
on storage.objects
using (
  bucket_id = 'item-images'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and exists (
    select 1
    from public.items i
    where i.id = public.storage_item_id(name)
      and public.has_item_write_access(i.id, i.user_id)
  )
);

commit;
