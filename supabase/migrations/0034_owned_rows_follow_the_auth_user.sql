-- Deleting an Auth user, from the dashboard too, deletes every row it owns; its Storage objects go first by hand, or to the daily sweep (#792).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- `not valid`, so the rows of users deleted before this can go below, and 0035 validates without blocking writes; each owner column's index serves the cascade.
alter table public.categories
add constraint categories_user_id_fkey
foreign key (user_id) references auth.users (id) on delete cascade not valid;

alter table public.items
add constraint items_user_id_fkey
foreign key (user_id) references auth.users (id) on delete cascade not valid;

alter table public.item_categories
add constraint item_categories_user_id_fkey
foreign key (user_id) references auth.users (id) on delete cascade not valid;

alter table public.category_shares
add constraint category_shares_owner_user_id_fkey
foreign key (owner_user_id) references auth.users (id) on delete cascade not valid;

alter table public.images
add constraint images_user_id_fkey
foreign key (user_id) references auth.users (id) on delete cascade not valid;

-- Rows whose owner no longer exists all go below; if no owner of any row exists, auth.users was lost, not its users deleted.
do $$
declare
  vanished bigint;
  present bigint;
begin
  select
    count(*) filter (where u.id is null),
    count(*) filter (where u.id is not null)
  into vanished, present
  from (
    select user_id from public.categories
    union select user_id from public.items
    union select user_id from public.item_categories
    union select owner_user_id from public.category_shares
    union select user_id from public.images
  ) as owner
  left join auth.users as u on u.id = owner.user_id;

  if vanished > 0 and present = 0 then
    raise exception 'no owner of any row is in auth.users; refusing to delete them all';
  end if;
  raise notice 'deleting the rows of % owner(s) no longer in auth.users', vanished;
end $$;

-- What the cascade would have deleted; the images rows' objects are then unnamed, so the sweep reclaims them after 48 h.
delete from public.categories as c
where not exists (select 1 from auth.users as u where u.id = c.user_id);

delete from public.items as i
where not exists (select 1 from auth.users as u where u.id = i.user_id);

delete from public.item_categories as ic
where not exists (select 1 from auth.users as u where u.id = ic.user_id);

delete from public.category_shares as cs
where not exists (select 1 from auth.users as u where u.id = cs.owner_user_id);

delete from public.images as im
where not exists (select 1 from auth.users as u where u.id = im.user_id);

commit;
