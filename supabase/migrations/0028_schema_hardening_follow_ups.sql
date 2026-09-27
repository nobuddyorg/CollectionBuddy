-- New tables start ungranted, 0019's thumbnail check covers old rows too, one tag is at most 100 characters, and an editor grant is a read grant (#768).
begin;

set local lock_timeout = '5s';
set local statement_timeout = '60s';

-- As 0015 for functions: the next table or sequence grants neither API role anything, TRUNCATE included, until its migration says so.
alter default privileges for role postgres in schema public
revoke all on tables from anon, authenticated;

alter default privileges for role postgres in schema public
revoke all on sequences from anon, authenticated;

-- The client only writes a thumbnail under its own entry, so one naming another was planted before 0019; dropping it keeps that photograph out of the owner's delete.
update public.images
set path_thumb = null, thumb_size_bytes = 0
where path_thumb is not null
  and public.storage_item_id(path_thumb) is distinct from item_id;

alter table public.images validate constraint images_path_thumb_matches_item;

-- A check cannot hold a subquery. Constraint expressions need EXECUTE, so authenticated keeps it.
create function public.longest_tag_length(tags text[])
returns integer
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(max(char_length(tag)), 0) from unnest(tags) as tag
$$;

revoke execute on function public.longest_tag_length(text[]) from public, anon;
grant execute on function public.longest_tag_length(text[]) to authenticated;

-- `not valid`, as 0016's text checks; tags are normalized before it runs.
alter table public.items
add constraint items_tag_length
check (public.longest_tag_length(tags) <= 100) not valid;

-- What makes a grant active lives in granted_category_ids() alone; the caller's row there only has to say editor, so write never outlasts read.
create or replace function public.has_category_write_access(cat_id uuid)
returns boolean
language sql
stable
security invoker
set search_path = ''
as $$
  select exists (
    select 1
    from public.categories c
    where c.id = cat_id
      and c.user_id = auth.uid()
  )
  or (
    exists (
      select 1
      from public.category_shares s
      where s.category_id = cat_id
        and s.invited_email = public.caller_email()
        and s.role = 'editor'
    )
    and cat_id = any(array(select public.granted_category_ids()))
  )
$$;

commit;
