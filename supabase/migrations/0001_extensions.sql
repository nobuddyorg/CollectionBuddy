-- Extensions live in their own schema, not `public`, so `search_path = ''`
-- (set on every function in 0002) can't be tricked into resolving an
-- extension function through a shadowing object in public.
--
-- pgcrypto: gen_random_uuid() for primary keys.
-- pg_trgm: trigram indexes behind the ILIKE search (items.ts).
-- pg_stat_statements: without it, Supabase's dashboard query-performance
-- view fails every poll with 42P01.
begin;

create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists pg_stat_statements with schema extensions;

commit;
