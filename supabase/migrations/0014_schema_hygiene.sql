-- Schema hygiene: version the keepalive RPC that was only ever created by
-- hand, drop the dead `profiles` table (no app code references it, and its
-- standing INSERT/UPDATE/DELETE grant from 0007 is a footgun for whoever
-- adds a policy to it later), and pin join_tags' search_path like every
-- other function in this schema.
begin;

-- The keep-alive workflow (.github/workflows/keep-alive.yml) pings this RPC
-- on a schedule to stop the Supabase free-tier project from auto-pausing.
-- It previously existed only as an unversioned object created by hand in
-- the dashboard, so `supabase db reset` did not reproduce production.
drop function if exists public.keepalive();
create function public.keepalive()
returns void
language sql
security invoker
set search_path = ''
as $$
  select 1
$$;

-- Called with the anon key by the scheduled workflow.
grant execute on function public.keepalive() to anon, authenticated;

-- `profiles` was never populated (no auth.users trigger) and nothing in
-- the app queries it. It only has a SELECT policy, so its 0007 write
-- grants are dead today -- but that's exactly the trap: someone could add
-- a permissive policy later without noticing the standing grant.
drop policy if exists "own profile" on public.profiles;
drop table if exists public.profiles;

-- join_tags was the one function without a pinned search_path. Not
-- currently exploitable (array_to_string resolves via pg_catalog first,
-- and 0007 grants only `usage`, not `create`, on public), but it's the
-- lone inconsistency and Supabase's linter flags it. `tags_text` (0008)
-- is the one remaining generated column that calls it -- `search_de`
-- (also added in 0008) was already dropped in 0011 along with its index.
drop index if exists public.idx_items_tags_text_trgm;
alter table public.items drop column if exists tags_text;

drop function if exists public.join_tags(text[]);
create function public.join_tags(tags text[])
returns text
language sql
immutable
security invoker
set search_path = ''
as $$
  select coalesce(pg_catalog.array_to_string($1, ' '), '')
$$;

alter table public.items
add column tags_text text
generated always as ( public.join_tags(tags) ) stored;

create index if not exists idx_items_tags_text_trgm
on public.items using gin (tags_text extensions.gin_trgm_ops);

commit;
