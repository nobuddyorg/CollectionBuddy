-- Row Level Security, and the grants underneath it.
--
-- This is the *only* authorization layer in the application: the frontend
-- is a static export with no server runtime, so every request reaches
-- Postgres carrying the user's JWT and these policies are what stands
-- between it and someone else's rows.
--
-- Every policy is `user_id = auth.uid()`, wrapped in a scalar subquery so
-- the planner evaluates it once per query rather than once per row. No role
-- is named, so `anon` is denied too -- auth.uid() is null for it, and only
-- `authenticated` is granted anything below anyway.
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

-- Deliberately narrow: usage plus DML on the three tables, no `create` on
-- the schema -- which is also what keeps `search_path = ''` on 0002's
-- security-definer functions from being worth attacking.
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;

-- The one thing `anon` may do -- called with the anon key by the scheduled
-- keep-alive workflow.
grant execute on function public.keepalive() to anon, authenticated;

commit;
