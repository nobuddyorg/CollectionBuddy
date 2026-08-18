-- Extends category sharing (0011) to photographs. Object paths are
-- `<owner_uid>/<itemId>/<file>` (0007) and a grantee's uid never appears
-- in one, so what authorizes their read is the itemId segment, joined
-- through item_categories to an active category_shares grant.
begin;

-- A raised error in an RLS USING clause aborts the whole statement, not
-- just the one row -- so a cast failure here (an object whose path isn't
-- `<uid>/<itemId>/<file>`) is caught and answered as NULL instead, letting
-- a stray object shape fail to match a grant rather than take the read
-- down with it.
create or replace function public.storage_item_id(path text)
returns uuid
language plpgsql
immutable
security invoker
set search_path = ''
as $$
begin
  return split_part(path, '/', 2)::uuid;
exception when invalid_text_representation then
  return null;
end
$$;

-- security invoker: `authenticated` needs its own execute grant for the
-- policy below to evaluate at all. Also reachable via RPC, same as
-- normalize_text/join_tags (0010) -- fine for the same reason: a pure
-- string function gives a caller nothing they couldn't compute themselves.
grant execute on function public.storage_item_id(text) to authenticated;

-- Additive: a fifth select policy alongside 0007's four owner-only ones,
-- not a rewrite. Postgres ORs every applicable policy, so a grantee gains
-- exactly this one path to a row and insert/update/delete stay untouched.
drop policy if exists "read shared objects" on storage.objects;
create policy "read shared objects"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'item-images'
  and exists (
    select 1
    from public.item_categories ic
    join public.category_shares s on s.category_id = ic.category_id
    where ic.item_id = public.storage_item_id(name)
      and s.invited_email = lower((select auth.jwt() ->> 'email'))
      and (s.expires_at is null or s.expires_at > now())
  )
);

commit;
