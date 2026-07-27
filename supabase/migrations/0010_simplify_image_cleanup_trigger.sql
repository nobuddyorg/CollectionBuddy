-- cleanup_item_images previously probed for storage.delete_object with 3
-- and then 2 arguments before falling back to a plain delete. Neither
-- overload exists in this schema, so the probes always resolved to false
-- and the fallback -- a raw delete from storage.objects -- was the only
-- path ever taken. That removes the metadata row but never the underlying
-- object bytes in the storage backend, which only the Storage API
-- (supabase.storage.remove()) can reach from SQL.
--
-- Actual cleanup now happens client-side, before the item row is deleted
-- (see removeItemImages() in useItemImages.ts, called on item delete and
-- on category delete for any items it would orphan). This trigger is kept
-- only as a metadata backstop for rows that slip through -- e.g. an app
-- crash between the storage call and the row delete -- so it no longer
-- pretends to reclaim storage space it cannot reach.
begin;

create or replace function public.cleanup_item_images()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from storage.objects so
  where so.bucket_id = 'item-images'
    and so.name like (old.user_id::text || '/' || old.id::text || '/%');
  return old;
end
$$;

commit;
