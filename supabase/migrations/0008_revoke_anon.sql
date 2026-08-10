-- Asserts, rather than assumes, that `anon` holds no privileges on the
-- three application tables.
--
-- 0006's own comment claims "only `authenticated` is granted anything
-- below" -- true of what that migration grants, but Supabase's project
-- bootstrap normally also runs
-- `alter default privileges in schema public grant all on tables to
-- postgres, anon, authenticated, service_role`. If that default is in
-- place, `anon` already holds SELECT (and more) on `items`, `categories`
-- and `item_categories`, independent of anything a migration here does --
-- the comment's claim about the mechanism would be wrong even though every
-- policy in 0006 is `user_id = (select auth.uid())`, which is null for
-- `anon` and therefore still denies every row.
--
-- So this changes no security outcome -- RLS already blocks `anon` either
-- way -- it only removes the possibility of the grant existing at all,
-- turning an assumption about the bootstrap's default privileges into an
-- explicit, re-assertable fact.
begin;

revoke all on public.items, public.categories, public.item_categories
from anon;

commit;
