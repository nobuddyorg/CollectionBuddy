-- Row Level Security, and the grants underneath it.
--
-- This is the *only* authorization layer in the application. The frontend
-- is a static export with no server runtime and no route handlers, so there
-- is nowhere else a check could live: every request reaches Postgres
-- carrying the user's JWT, and these policies are what stands between it
-- and someone else's rows.
--
-- Every policy is `user_id = auth.uid()` and nothing else. auth.uid() is
-- wrapped in a scalar subquery -- `(select auth.uid())` -- so the planner
-- evaluates it once per query instead of once per row.
--
-- No role is named on these, so they apply to every role that can reach the
-- table. Only `authenticated` is granted anything below, and auth.uid() is
-- null for `anon`, so the predicate is null and denies.
begin;

alter table public.categories enable row level security;
alter table public.items enable row level security;
alter table public.item_categories enable row level security;

-- categories
drop policy if exists "select own categories" on public.categories;
create policy "select own categories"
on public.categories
for select
using (user_id = (select auth.uid()));

drop policy if exists "insert own categories" on public.categories;
create policy "insert own categories"
on public.categories
for insert
with check (user_id = (select auth.uid()));

drop policy if exists "update own categories" on public.categories;
create policy "update own categories"
on public.categories
for update
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "delete own categories" on public.categories;
create policy "delete own categories"
on public.categories
for delete
using (user_id = (select auth.uid()));

-- items
drop policy if exists "select own items" on public.items;
create policy "select own items"
on public.items
for select
using (user_id = (select auth.uid()));

drop policy if exists "insert own items" on public.items;
create policy "insert own items"
on public.items
for insert
with check (user_id = (select auth.uid()));

drop policy if exists "update own items" on public.items;
create policy "update own items"
on public.items
for update
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

drop policy if exists "delete own items" on public.items;
create policy "delete own items"
on public.items
for delete
using (user_id = (select auth.uid()));

-- item_categories. No update policy: a mapping has nothing to change --
-- rows are added and removed, never edited.
drop policy if exists "select own item_categories" on public.item_categories;
create policy "select own item_categories"
on public.item_categories
for select
using (user_id = (select auth.uid()));

drop policy if exists "insert own item_categories" on public.item_categories;
create policy "insert own item_categories"
on public.item_categories
for insert
with check (user_id = (select auth.uid()));

drop policy if exists "delete own item_categories" on public.item_categories;
create policy "delete own item_categories"
on public.item_categories
for delete
using (user_id = (select auth.uid()));

-- Grants. Deliberately narrow: usage, and DML on the three tables. No
-- `create` on the schema, which is also what keeps `search_path = ''` on
-- the security-definer functions in 0002 from being worth attacking.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- keepalive() is called with the anon key by the scheduled workflow, so it
-- is the one thing `anon` may do.
grant execute on function public.keepalive() to anon, authenticated;

commit;
