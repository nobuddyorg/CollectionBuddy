-- Extends account-based category sharing (0011_category_shares.sql, #483)
-- to photographs.
--
-- Object paths are `<owner_uid>/<itemId>/<file>` (0007_storage.sql). A
-- grantee's own uid never appears in that path -- what has to authorize
-- their read is the itemId segment, joined through item_categories to an
-- active category_shares grant, the same predicate the select policies on
-- categories/items/item_categories already use.
begin;

-- split_part(name, '/', 2)::uuid raised outright on any object whose second
-- path segment isn't a UUID -- and a raised error in an RLS USING clause
-- doesn't just exclude that one row, it aborts the whole statement for
-- every row the query would otherwise have returned. Nothing in this
-- bucket is expected to violate the `<uid>/<itemId>/<file>` shape, but
-- "expected to" is not "enforced to": this catches the cast failure and
-- answers NULL instead, so a stray or future object shape can only ever
-- fail to match a grant, never take the read down with it.
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

-- security invoker means the policy below runs this as the querying role,
-- not as whoever owns the function -- so `authenticated` needs its own
-- execute grant for the policy to evaluate at all, not just as a courtesy.
-- That also leaves it reachable at POST /rest/v1/rpc/storage_item_id, same
-- as normalize_text/join_tags (0010_function_grants.sql) -- accepted there
-- for the same reason it's fine here: a pure string function that touches
-- no table gives a caller nothing beyond what they could compute themselves.
grant execute on function public.storage_item_id(text) to authenticated;

-- Additive: storage.objects already carries four owner-only policies from
-- 0007_storage.sql (an object's own uid-prefixed path, checked directly).
-- This is a fifth, permissive select policy rather than a rewrite of any of
-- those -- Postgres OR's every applicable policy together, so a grantee
-- gains exactly this one path to a row and every owner-only guarantee on
-- insert/update/delete is untouched.
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
