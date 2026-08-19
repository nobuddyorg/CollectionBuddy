-- Five tables. Deliberately not "items belong to a category": an item can
-- sit in several, so the mapping is its own table. Every owned row carries
-- its own `user_id`, denormalized so every RLS policy (0006) is a column
-- comparison rather than a join.
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

-- One row per owner's grant of access to one category, to one invited
-- email. No separate "pending"/"accepted" state -- the grant works the
-- moment `invited_email` matches the caller's own JWT email, evaluated
-- fresh on every request, so an invite sent before signup starts working
-- the instant the invitee signs up.
create table if not exists public.category_shares (
  id uuid primary key default gen_random_uuid(),
  category_id uuid not null references public.categories(id) on delete cascade,

  -- Denormalized, same reasoning as item_categories.user_id above: every
  -- policy in 0006 is a column comparison, never a join back to categories
  -- to find out who owns it.
  owner_user_id uuid not null,

  invited_email text not null,

  -- 'viewer' is the default and the original, only role; 'editor' gives an
  -- invited grantee parity with the owner on item content (add/edit/delete
  -- items, manage photos) within the shared category. Category-level
  -- actions (rename, delete the category itself, manage other shares) stay
  -- owner-only regardless of role.
  role text not null default 'viewer',

  expires_at timestamptz,
  created_at timestamptz not null default now(),

  constraint category_shares_invited_email_looks_like_email
    check (invited_email like '%@%'),
  constraint category_shares_expiry_in_future
    check (expires_at is null or expires_at > created_at),
  constraint category_shares_role_valid check (role in ('viewer', 'editor')),

  -- One grant per (category, email) -- re-sharing with someone already
  -- invited is a no-op, not a second row with its own, different expiry.
  constraint category_shares_category_email_unique unique (category_id, invited_email)
);

-- One row per photograph (full + optional thumbnail). Storage holds the
-- bytes and is the authority on what exists; this table is a queryable
-- index of it, written at upload time and cleared at delete.
--
-- No position column: there's no reorder feature, and created_at ascending
-- already keeps a freshly uploaded photograph from displacing the hero
-- slot (IMAGE_LIST_SORT, images.ts).
create table if not exists public.images (
  id uuid primary key default gen_random_uuid(),
  item_id uuid not null references public.items(id) on delete cascade,
  user_id uuid not null,

  -- Full storage paths (`<uid>/<itemId>/<file>`), not bare object names --
  -- every reader (signing, Storage remove(), export) wants something it
  -- can hand straight to the Storage API rather than rebuild with
  -- imagePrefix() first. It is also what lets a grantee's read (see the
  -- shared select policy in 0006) resolve straight to the owner's bytes
  -- without knowing the owner's uid at all.
  path_full text not null,
  path_thumb text,

  -- The full photograph's byte size only -- thumbnails were never counted,
  -- so there is no thumb_size_bytes to keep in step with anything.
  size_bytes bigint,

  created_at timestamptz not null default now(),

  constraint images_path_full_key unique (path_full)
);

commit;
