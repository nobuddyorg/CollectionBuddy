-- `texticlike` (the function behind ILIKE) is not leakproof, and Postgres
-- will not evaluate a non-leakproof qual before a relation's RLS security
-- qual -- so under RLS, an ILIKE search can never become an index condition
-- for `authenticated`, which has no BYPASSRLS. The four trigram GIN indexes
-- in 0005_indexes.sql are consequently never chosen for an ordinary,
-- RLS-scoped query: a rare-term search over a 100,000-item category measured
-- 415.8 ms as a sequential-scan-shaped `Filter:`, and `enable_seqscan = off`
-- did not change the plan -- the index is not *considered*, not merely not
-- *preferred*. See #621 (PERF-H4) for the full measurement and the isolated
-- repro proving this is a property of PostgreSQL + RLS, not of the local
-- stack.
--
-- This moves search behind a `SECURITY DEFINER` function that applies the
-- read-access check itself and then queries with RLS bypassed, so the
-- planner can reach the indexes: 415.8 ms -> 24.3 ms measured on the same
-- category and term.
--
-- ================================================================
-- THIS IS SECURITY-CRITICAL: this function becomes an authorization
-- boundary in its own right, not RLS re-expressed for convenience.
-- ================================================================
--
-- It must reproduce -- not widen -- exactly what an ordinary, RLS-scoped
-- read of `items` scoped to one category already allows. For a *fixed*
-- category, that reduces to one predicate: the caller owns the item, or the
-- caller holds an active read grant on the category (has_category_read_
-- access). It is deliberately NOT "the caller owns or holds any grant on
-- the category" -- category ownership is not bundled into read access
-- (0006_policies.sql's has_category_read_access comment, and
-- e2e/signed-in/rls.spec.ts's "owning the collection does not reveal an
-- entry the editor filed into it"): an owner does not automatically see an
-- entry an editor merely filed into their own shared category. Bundling
-- ownership in here, as a shortcut, would silently widen that boundary
-- past what a live SELECT would ever return. `search_category_items`'s own
-- matching case lives in e2e/signed-in/rls.spec.ts, asserting the search
-- path is bound by the exact same rule.
--
-- like_pattern is a bound parameter to the ILIKE operator, never
-- interpolated into SQL text, so it carries no injection risk regardless of
-- content.
begin;

create or replace function public.search_category_items(
  cat_id uuid,
  like_pattern text,
  page_from int,
  page_to int
)
returns table (
  id uuid,
  title text,
  description text,
  place text,
  place_lat double precision,
  place_lng double precision,
  tags text[],
  total_count bigint
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    i.id,
    i.title,
    i.description,
    i.place,
    i.place_lat,
    i.place_lng,
    i.tags,
    count(*) over () as total_count
  from public.items i
  join public.item_categories ic on ic.item_id = i.id
  where ic.category_id = cat_id
    and (
      i.user_id = auth.uid()
      or public.has_category_read_access(cat_id)
    )
    and (
      i.title ilike like_pattern
      or i.description ilike like_pattern
      or i.place ilike like_pattern
      or i.tags_text ilike like_pattern
    )
  order by i.created_at desc
  offset page_from
  limit (page_to - page_from + 1)
$$;

revoke execute on function public.search_category_items(uuid, text, int, int)
from public;
grant execute on function public.search_category_items(uuid, text, int, int)
to authenticated;

commit;
