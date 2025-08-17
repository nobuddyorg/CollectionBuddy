-- Enable RLS + define symmetric policies (USING + WITH CHECK where relevant).
begin;

alter table public.profiles enable row level security;
drop policy if exists "own profile" on public.profiles;
create policy "own profile"
on public.profiles
for select
using (id = (select auth.uid()));

alter table public.categories enable row level security;
drop policy if exists "select own categories" on public.categories;
drop policy if exists "insert own categories" on public.categories;
drop policy if exists "update own categories" on public.categories;
drop policy if exists "delete own categories" on public.categories;

create policy "select own categories"
on public.categories
for select
using (user_id = (select auth.uid()));

create policy "insert own categories"
on public.categories
for insert
with check (user_id = (select auth.uid()));

create policy "update own categories"
on public.categories
for update
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "delete own categories"
on public.categories
for delete
using (user_id = (select auth.uid()));

alter table public.items enable row level security;
drop policy if exists "select own items" on public.items;
drop policy if exists "insert own items" on public.items;
drop policy if exists "update own items" on public.items;
drop policy if exists "delete own items" on public.items;

create policy "select own items"
on public.items
for select
using (user_id = (select auth.uid()));

create policy "insert own items"
on public.items
for insert
with check (user_id = (select auth.uid()));

create policy "update own items"
on public.items
for update
using (user_id = (select auth.uid()))
with check (user_id = (select auth.uid()));

create policy "delete own items"
on public.items
for delete
using (user_id = (select auth.uid()));

alter table public.item_categories enable row level security;
drop policy if exists "select own item_categories" on public.item_categories;
drop policy if exists "insert own item_categories" on public.item_categories;
drop policy if exists "delete own item_categories" on public.item_categories;

create policy "select own item_categories"
on public.item_categories
for select
using (user_id = (select auth.uid()));

create policy "insert own item_categories"
on public.item_categories
for insert
with check (user_id = (select auth.uid()));

create policy "delete own item_categories"
on public.item_categories
for delete
using (user_id = (select auth.uid()));

commit;
