-- The OR-based ILIKE search (useItems.ts) needs every branch of the
-- disjunction to be indexable for Postgres to combine them via BitmapOr --
-- one unindexed branch collapses the whole query onto a sequential scan.
-- tags_text (added in 0008) was never indexed, so none of the three
-- existing trigram indexes (title, description, place) were being used
-- either, despite the write cost of maintaining them.
begin;

create index if not exists idx_items_tags_text_trgm
on public.items using gin (tags_text extensions.gin_trgm_ops);

-- `search` (simple) and `search_de` (german) are full-text tsvector
-- columns with GIN indexes that nothing in the client queries -- the app
-- only ever does ILIKE substring search via the trigram indexes above.
-- Maintaining them doubles the to_tsvector work on every insert/update
-- and adds two more GIN pending-list flushes for a feature that isn't
-- used. Drop the indexes, then the generated columns they were on.
drop index if exists idx_items_search_gin;
drop index if exists idx_items_search_de_gin;
alter table public.items drop column if exists search;
alter table public.items drop column if exists search_de;

commit;
