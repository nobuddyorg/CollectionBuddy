-- A collector deletes their own account: its rows, the grants made to its email, and the Auth user itself.
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- The function deletes from auth.users as its owner; fail the deploy here rather than on a collector's first call.
do $$
begin
  if not pg_catalog.has_table_privilege('postgres', 'auth.users', 'DELETE') then
    raise exception 'postgres must be able to delete from auth.users';
  end if;
end $$;

-- As its owner: auth.users is out of every API role's reach, and the caller cannot see the editor-filed entries in its own collections.
create function public.delete_own_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := auth.uid();
begin
  if caller is null then
    raise exception 'not signed in' using errcode = '42501';
  end if;

  -- Only Storage deletes bytes, so the client removes them first; refuse while any it could have removed are still stored.
  if exists (
    select 1
    from public.images as im
    inner join storage.objects as o
      on o.bucket_id = 'item-images' and o.name in (im.path_full, im.path_thumb)
    where im.user_id = caller
      and public.has_item_write_access(im.item_id, caller)
  ) then
    raise exception 'photographs are still stored'
      using errcode = 'PT409';
  end if;

  delete from public.category_shares where invited_email = public.caller_email();
  delete from public.categories where user_id = caller;
  delete from public.items where user_id = caller;
  delete from auth.users where id = caller;
end
$$;

revoke execute on function public.delete_own_account() from public, anon;
grant execute on function public.delete_own_account() to authenticated;

commit;
