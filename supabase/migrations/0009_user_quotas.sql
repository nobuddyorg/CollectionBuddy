-- Per-owner ceilings (#637): 1 GiB of full-size photographs, 50,000 entries.
begin;

-- The size Storage recorded, never the client's claim; the bucket's 5 MiB cap while nothing is stored there.
create function public.tg_images_size_from_storage()
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
  return new;
end
$$;

-- Statement-level, so a batch insert counts each owner once rather than once per row.
create function public.tg_images_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from (select distinct n.user_id from new_rows n) owners
    where (
      select coalesce(sum(im.size_bytes), 0)
      from public.images im
      where im.user_id = owners.user_id
    ) > 1073741824
  ) then
    raise exception 'photo storage quota of 1 GiB reached'
      using errcode = 'PT507';
  end if;
  return null;
end
$$;

create function public.tg_items_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1
    from (select distinct n.user_id from new_rows n) owners
    where (
      select count(*) from public.items i where i.user_id = owners.user_id
    ) > 50000
  ) then
    raise exception 'entry quota of 50000 reached'
      using errcode = 'PT507';
  end if;
  return null;
end
$$;

revoke execute on function public.tg_images_size_from_storage() from public;
revoke execute on function public.tg_images_quota() from public;
revoke execute on function public.tg_items_quota() from public;

create trigger trg_images_size_from_storage
before insert on public.images
for each row execute function public.tg_images_size_from_storage();

create trigger trg_images_quota
after insert on public.images
referencing new table as new_rows
for each statement execute function public.tg_images_quota();

create trigger trg_items_quota
after insert on public.items
referencing new table as new_rows
for each statement execute function public.tg_items_quota();

commit;
