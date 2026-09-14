-- The catalogue page and its RLS-widened grantee path both scan every item
-- in a category before sorting -- see #618 and #619 for the measured plans.
--
-- `listItems` (web/src/app/data/items.ts) put the restriction on
-- item_categories but the ordering on items, so the only usable index
-- (idx_items_user_created_at, 0005_indexes.sql) couldn't serve it: the
-- planner drove from item_categories, probed items_pkey once per mapping
-- row, and top-N sorted the whole result -- 100,000 probes to return 9 rows
-- at category size 100k, and for a grantee (whose row visibility check is
-- not a plain equality the planner can short-circuit) the read-access
-- predicate paid that cost per row too: 16 s for page 1 of a 100k shared
-- category.
--
-- This index lets item_categories itself be the driving, ordered table
-- (`listItems` now selects from item_categories and embeds items, rather
-- than the reverse) -- category_id narrows the scan and created_at desc
-- means it's already in the order the page wants, so the planner can walk
-- it and stop after the page size instead of sorting everything first.
-- `item_id` is a covering third column so the following items_pkey probe
-- doesn't need a second index lookup.
--
-- This grants and denies nothing -- it's an index, not a policy -- but per
-- CLAUDE.md guardrail #3 it's still called out here because it's a
-- migration: no RLS/grant/trigger change accompanies it, so it needs no
-- matching rls.spec.ts case.
--
-- Semantic note (accepted, not closed): the page now sorts by the mapping
-- row's created_at rather than the item's. The two coincide today because
-- item_categories rows are only ever written once, immediately after their
-- item (useCreateItem -> createItem -> linkItemToCategory; importCategory
-- does the same for an import). There is no "link an existing item into a
-- second category later" feature that could make them diverge.
begin;

create index if not exists idx_item_categories_cat_created
on public.item_categories (category_id, created_at desc, item_id);

commit;
