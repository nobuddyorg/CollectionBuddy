-- Restrict the item-images bucket to images of a bounded size.
--
-- accept="image/*" in the file picker and the client-side WebP compression are
-- both bypassable by calling storage.upload() directly with the anon key, so
-- the bucket itself has to enforce this. Without it any authenticated user can
-- store arbitrary content -- including text/html served from the project
-- domain -- and consume the storage quota without limit.
begin;

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

commit;
