-- Supabase's project bootstrap normally runs `alter default privileges in
-- schema public grant all on tables to ... anon ...`, so `anon` may already
-- hold a grant on these three tables independent of what 0006 grants.
-- Changes no security outcome -- RLS's `user_id = auth.uid()` already
-- denies `anon` either way -- this just removes the grant so that holds
-- explicitly rather than by assumption.
begin;

revoke all on public.items, public.categories, public.item_categories
from anon;

commit;
