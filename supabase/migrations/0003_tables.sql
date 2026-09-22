-- Every owned row carries its own user_id, so every RLS policy is a column comparison rather than a join.
begin;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint categories_name_not_blank check (btrim(name) <> '')
);

create table public.items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  title text not null,
  description text,
  place text,
  place_lat double precision,
  place_lng double precision,
  tags text[] not null default '{}'::text[],

  -- Space-joined copy of tags, so tag search shares the ILIKE filter and trigram index of the other text columns.
  tags_text text generated always as (public.join_tags(tags)) stored,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint items_title_not_blank check (btrim(title) <> ''),
  constraint items_tags_1d check (array_ndims(tags) = 1)
);

-- An item may sit in several categories; rows are added and removed, never edited.
create table public.item_categories (
  item_id uuid not null references public.items(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  user_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (item_id, category_id)
);

-- No pending/accepted state: a grant works the moment invited_email matches the caller's JWT email.
create table public.category_shares (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,
  owner_user_id uuid not null,
  invited_email text not null,
  role text not null default 'viewer',
  expires_at timestamptz,
  created_at timestamptz not null default now(),

  constraint category_shares_invited_email_looks_like_email
    check (invited_email like '%@%'),
  constraint category_shares_expiry_in_future
    check (expires_at is null or expires_at > created_at),
  constraint category_shares_role_valid check (role in ('viewer', 'editor')),
  constraint category_shares_category_email_unique unique (category_id, invited_email)
);

-- Queryable index of Storage, written at upload and cleared at delete; Storage stays the authority on what exists.
create table public.images (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid not null,

  -- Full storage paths (`<uid>/<itemId>/<file>`), handed straight to the Storage API.
  path_full text not null,
  path_thumb text,
  size_bytes bigint,
  created_at timestamptz not null default now(),

  constraint images_path_full_key unique (path_full),

  -- `is not distinct from`, not `=`: storage_item_id() yields NULL for an unparsable path, and `=` would pass it.
  constraint images_path_full_matches_item
    check (public.storage_item_id(path_full) is not distinct from item_id)
);

commit;
