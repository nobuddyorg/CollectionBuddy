-- Own schema, never public: every function pins `search_path = ''`, so nothing in public can shadow these.
begin;

create schema if not exists extensions;

-- gen_random_uuid() for primary keys.
create extension if not exists pgcrypto with schema extensions;

-- Trigram indexes behind the ILIKE search.
create extension if not exists pg_trgm with schema extensions;

-- Without it, Supabase's query-performance dashboard fails every poll with 42P01.
create extension if not exists pg_stat_statements with schema extensions;

commit;
