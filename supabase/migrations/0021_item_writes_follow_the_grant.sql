-- An entry's own owner writes it only while every collection it is in is writable to them: revoking or demoting an editor ends their writes to the entries they filed (#739).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The owner of an entry in no collection, or whoever may write every collection it is in; links the caller cannot see do not count.
create function public.has_item_write_access(target_item_id uuid, item_owner_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select
    (
      item_owner_id = (select auth.uid())
      or exists (
        select 1
        from public.item_categories ic
        where ic.item_id = target_item_id
      )
    )
    and not exists (
      select 1
      from public.item_categories ic
      where ic.item_id = target_item_id
        and not public.has_category_write_access(ic.category_id)
    )
$$;

revoke execute on function public.has_item_write_access(uuid, uuid) from public, anon;
grant execute on function public.has_item_write_access(uuid, uuid) to authenticated;

alter policy "update items with write access"
on public.items
using (public.has_item_write_access(items.id, items.user_id))
with check (public.has_item_write_access(items.id, items.user_id));

alter policy "delete items with write access"
on public.items
using (public.has_item_write_access(items.id, items.user_id));

-- No item-owner branch: unlinking deletes the orphaned entry, so it needs the same write access as deleting it.
alter policy "delete item_categories with write access"
on public.item_categories
using (public.has_category_write_access(item_categories.category_id));

-- images.user_id is the entry's owner (tg_images_enforce).
alter policy "insert images with write access"
on public.images
with check (public.has_item_write_access(images.item_id, images.user_id));

alter policy "delete images with write access"
on public.images
using (public.has_item_write_access(images.item_id, images.user_id));

-- Own prefix, but not under an entry the caller can see yet not write: no replacing an entry's bytes at a path its images row names.
alter policy "upload own objects"
on storage.objects
with check (
  bucket_id = 'item-images'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and not exists (
    select 1
    from public.items i
    where i.id = public.storage_item_id(name)
      and not public.has_item_write_access(i.id, i.user_id)
  )
);

alter policy "delete own objects"
on storage.objects
using (
  bucket_id = 'item-images'
  and split_part(name, '/', 1) = (select auth.uid())::text
  and not exists (
    select 1
    from public.items i
    where i.id = public.storage_item_id(name)
      and not public.has_item_write_access(i.id, i.user_id)
  )
);

-- user_id follows the item's owner; the insert needs write access to the entry, as the images policy does.
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

  if not public.has_item_write_access(new.item_id, itm_user) then
    raise exception 'ownership mismatch';
  end if;

  return new;
end
$$;

commit;
