-- Extensions, in their own schema.
--
-- `extensions` rather than `public` so nothing the app owns shares a
-- namespace with them, and so `search_path = ''` (which every function here
-- sets) can't be tricked into resolving an extension function through a
-- shadowing object. Index operator classes reference them by qualified name
-- (`extensions.gin_trgm_ops`) -- see 0005.
--
-- pgcrypto: gen_random_uuid() for primary keys.
-- pg_trgm:  trigram indexes behind the ILIKE search in items.ts.
begin;

create schema if not exists extensions;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists pg_trgm with schema extensions;

commit;
