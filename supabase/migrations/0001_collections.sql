
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;


create table public.profiles (
  id uuid primary key default auth.uid(),
  created_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "own profile"
on public.profiles
for select
using (id = auth.uid());


create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  name text not null,
  created_at timestamptz not null default now(),
  unique(user_id, name)
);

alter table public.categories enable row level security;

create policy "select own categories"
on public.categories
for select
using (user_id = auth.uid());

create policy "insert own categories"
on public.categories
for insert
with check (user_id = auth.uid());

create policy "update own categories"
on public.categories
for update
using (user_id = auth.uid());

create policy "delete own categories"
on public.categories
for delete
using (user_id = auth.uid());


create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid(),
  title text not null,
  description text,
  place text,
  tags text[] not null default '{}'::text[],
  created_at timestamptz not null default now()
);

alter table public.items enable row level security;

create policy "select own items"
on public.items
for select
using (user_id = auth.uid());

create policy "insert own items"
on public.items
for insert
with check (user_id = auth.uid());

create policy "update own items"
on public.items
for update
using (user_id = auth.uid());

create policy "delete own items"
on public.items
for delete
using (user_id = auth.uid());


create index if not exists idx_items_place_trgm on public.items using gin (place gin_trgm_ops);
create index if not exists idx_items_tags_gin  on public.items using gin (tags);


create table public.item_categories (
  item_id uuid references public.items(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  user_id uuid not null default auth.uid(),
  primary key (item_id, category_id)
);

alter table public.item_categories enable row level security;

create policy "select own item_categories"
on public.item_categories
for select
using (user_id = auth.uid());

create policy "insert own item_categories"
on public.item_categories
for insert
with check (
  user_id = auth.uid()
  and exists (select 1 from public.items i where i.id = item_id and i.user_id = auth.uid())
  and exists (select 1 from public.categories c where c.id = category_id and c.user_id = auth.uid())
);

create policy "delete own item_categories"
on public.item_categories
for delete
using (user_id = auth.uid());
