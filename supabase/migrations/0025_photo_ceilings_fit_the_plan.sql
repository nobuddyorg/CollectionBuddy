-- Photograph ceilings sized to the Free plan's 1 GB of Storage, thumbnails counted, and no bytes stored at a recorded path (#753).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- A thumbnail's bytes, sampled beside size_bytes, which the export's estimate keeps reading as the full size alone.
alter table public.images
add column thumb_size_bytes bigint not null default 0;

-- A thumbnail already gone stays at 0: nothing may be stored at its path from here on.
update public.images im
set thumb_size_bytes = (o.metadata ->> 'size')::bigint
from storage.objects o
where o.bucket_id = 'item-images' and o.name = im.path_thumb;

-- tg_images_quota() sums both sizes per owner; carrying both keeps that sum index-only (#718).
create index idx_images_user_sizes
on public.images (user_id) include (size_bytes, thumb_size_bytes);

drop index public.idx_images_user_size;

-- Each size as Storage recorded it, or the bucket's 5 MiB cap while nothing is stored there.
create or replace function public.tg_images_size_from_storage()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.size_bytes := coalesce(
    (
      select (o.metadata ->> 'size')::bigint
      from storage.objects o
      where o.bucket_id = 'item-images' and o.name = new.path_full
    ),
    5242880
  );
  new.thumb_size_bytes := case
    when new.path_thumb is null then 0
    else coalesce(
      (
        select (o.metadata ->> 'size')::bigint
        from storage.objects o
        where o.bucket_id = 'item-images' and o.name = new.path_thumb
      ),
      5242880
    )
  end;
  return new;
end
$$;

-- The bucket as Storage bills it, orphans included, then the owner's photographs; `detail` tells the client which.
create or replace function public.tg_images_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if (
    select coalesce(sum((o.metadata ->> 'size')::bigint), 0)
    from storage.objects o
    where o.bucket_id = 'item-images'
  ) > 805306368 then
    raise exception 'the photo storage of this app is full'
      using errcode = 'PT507', detail = 'project';
  end if;

  if exists (
    select 1
    from (select distinct n.user_id from new_rows n) owners
    where (
      select coalesce(sum(im.size_bytes + im.thumb_size_bytes), 0)
      from public.images im
      where im.user_id = owners.user_id
    ) > 268435456
  ) then
    raise exception 'photo storage quota of 256 MiB reached'
      using errcode = 'PT507';
  end if;
  return null;
end
$$;

-- Bytes stored with or without a record, below each ceiling above by 64 MiB, so a collector meets the row's message first.
create function public.photo_upload_has_room()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    coalesce(sum(stored.size_bytes), 0) < 872415232
    and coalesce(sum(stored.size_bytes) filter (where stored.own), 0) < 335544320
  from (
    select
      (o.metadata ->> 'size')::bigint as size_bytes,
      pg_catalog.split_part(o.name, '/', 1) = (select auth.uid())::text as own
    from storage.objects o
    where o.bucket_id = 'item-images'
  ) stored
$$;

revoke execute on function public.photo_upload_has_room() from public, anon;
grant execute on function public.photo_upload_has_room() to authenticated;

-- Sizes are sampled when the record is written, so a path a record names takes no bytes after that, not even once emptied.
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
  and not exists (
    select 1 from public.images im where im.path_full = objects.name
  )
  and not exists (
    select 1 from public.images im where im.path_thumb = objects.name
  )
  and (select public.photo_upload_has_room())
);

commit;
