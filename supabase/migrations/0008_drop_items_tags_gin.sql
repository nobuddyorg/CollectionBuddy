-- No query reads items.tags by containment; tag search is ILIKE on tags_text (#629).
begin;

drop index if exists public.idx_items_tags_gin;

commit;
