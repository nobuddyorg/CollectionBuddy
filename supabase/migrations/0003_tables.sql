-- Tables and their constraints. No policies, triggers or indexes here.
--
-- Three tables, and the shape is deliberately not "items belong to a
-- category": an item can sit in several, so the mapping is its own table.
-- Both sides carry `user_id` -- denormalized on purpose, so every RLS
-- policy is a column comparison rather than a join (see 0006).
begin;

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Blank-after-normalization is rejected rather than stored: the
  -- normalize trigger turns a whitespace-only name into NULL, which the
  -- NOT NULL then catches. This covers the rest.
  constraint categories_name_not_blank check (btrim(name) <> '')
);

create table if not exists public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  description text,

  -- `place` is a display string. place_lat/place_lng are captured when the
  -- user picks a geocoder suggestion, so the map can draw the pin without
  -- geocoding it again; they stay null for hand-typed places, which fall
  -- back to a lookup.
  place text,
  place_lat double precision,
  place_lng double precision,

  tags text[] not null default '{}'::text[],

  -- A space-joined copy of `tags`, generated purely so tag search can use
  -- the same ILIKE filter (and the same kind of trigram index) as the
  -- other text columns instead of needing a separate array operator.
  tags_text text generated always as (public.join_tags(tags)) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint items_title_not_blank check (btrim(title) <> ''),
  constraint items_tags_1d check (array_ndims(tags) = 1)
);

create table if not exists public.item_categories (
  item_id uuid not null references public.items(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (item_id, category_id)
);

commit;
