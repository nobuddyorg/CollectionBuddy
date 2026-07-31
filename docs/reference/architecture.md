# Architecture reference

Technical description of how CollectionBuddy is put together. For *why* it's built this way, see [Design decisions](../explanation/design-decisions.md).

## Application

- **Next.js, static export** (`output: 'export'` in [`web/next.config.ts`](../../web/next.config.ts)) — there is no server runtime and no route handlers. Every page except `layout.tsx` is a client component; `layout.tsx` renders once at build time, before any user session exists.
- `basePath` is `/CollectionBuddy` in production builds (`NODE_ENV === 'production'`, i.e. CI) to match GitHub Pages serving the site from `https://<org>.github.io/CollectionBuddy/`, and empty in local dev. Exposed to client code as `NEXT_PUBLIC_BASE_PATH`.
- The Supabase client ([`web/src/app/supabase.ts`](../../web/src/app/supabase.ts)) is created once at import time, with `flowType: 'pkce'` (so auth tokens never land in the URL fragment), `persistSession`, `autoRefreshToken`, and `detectSessionInUrl` all on.
- All authorization is enforced by Postgres Row Level Security — there is no server-side authorization code to bypass, because there is no server.

## Database schema

Defined across [`supabase/migrations/`](../../supabase/migrations/), applied in filename order.

### Tables

| Table | Columns | Notes |
| --- | --- | --- |
| `categories` | `id`, `user_id`, `name`, `created_at`, `updated_at` | Name must be non-blank after normalization; unique per user, case-insensitively (`(user_id, lower(name))`). |
| `items` | `id`, `user_id`, `title`, `description`, `place`, `place_lat`, `place_lng`, `tags text[]`, `tags_text` (generated), `created_at`, `updated_at` | Title must be non-blank. `tags_text` is a space-joined copy of `tags`, generated purely so tag search can share the same `ILIKE` filter as the other text columns. `place_lat`/`place_lng` are captured when the user picks a place suggestion ([`0015_place_coordinates.sql`](../../supabase/migrations/0015_place_coordinates.sql)), so the map draws those pins without geocoding; they are null for hand-typed places and for rows predating that migration, which fall back to a lookup. |
| `item_categories` | `item_id`, `category_id`, `user_id`, `created_at` | Join table, composite primary key `(item_id, category_id)`. An item *can* belong to more than one category, though the UI only ever browses one at a time. |

`public.profiles` existed in early migrations but was dropped in `0014_schema_hygiene.sql` — it was never populated or queried. Don't recreate it without a reason; it was dead weight, not a placeholder for something planned.

### Row Level Security

Every table has symmetric `select`/`insert`/`update`/`delete` policies, all scoped to `user_id = auth.uid()` ([`0003_security_policies.sql`](../../supabase/migrations/0003_security_policies.sql)). This is the *only* authorization layer — see [Design decisions](../explanation/design-decisions.md#why-authorization-lives-entirely-in-postgres-rls).

### Triggers and functions

All in [`0004_functions_triggers.sql`](../../supabase/migrations/0004_functions_triggers.sql), refined in `0009`–`0014`:

- `normalize_text()` — trims and collapses whitespace, returns `NULL` for anything blank.
- `enforce_user_id()` — forces `user_id = auth.uid()` on insert; blocks changing it on update.
- `tg_categories_normalize()` / `tg_items_normalize()` — apply `normalize_text()` to name/title/description/place, and for items also dedupe + sort `tags`.
- `tg_item_categories_enforce()` — verifies the item and category exist, belong to the *same* user, and sets/rechecks `user_id` on the join row (a cross-tenant assignment guard).
- `delete_item_if_orphan()` — after an `item_categories` row is deleted, deletes the item if it now belongs to zero categories. Runs `FOR EACH STATEMENT` with a transition table (not `FOR EACH ROW`) — see [Design decisions](../explanation/design-decisions.md#why-the-orphan-cleanup-trigger-is-statement-level).
There is no image-cleanup trigger: `cleanup_item_images()` was dropped in `0016_drop_storage_cleanup_trigger.sql`, since Supabase now forbids deleting from `storage.objects` outside the Storage API and the trigger made every item delete fail — see [Design decisions](../explanation/design-decisions.md#why-images-are-deleted-client-side-before-the-database-row).
- `keepalive()` — no-op RPC, granted to `anon` and `authenticated`, called daily by [`keep-alive.yml`](../../.github/workflows/keep-alive.yml) to stop a free-tier Supabase project from auto-pausing.

### Indexes

- Unique `(user_id, lower(name))` on `categories`.
- `(user_id, created_at desc)` on `items`, for list ordering.
- Trigram GIN indexes (`pg_trgm`) on `items.title`, `items.description`, `items.place`, `items.tags_text` — see [Design decisions](../explanation/design-decisions.md#why-search-uses-trigram-ilike-instead-of-full-text-search) for why these exist instead of Postgres full-text search.
There is deliberately no index on `storage.objects` for the batched image-cleanup trigger's `LIKE ANY (...)`, which therefore scans that (cross-user, cross-bucket) table once per delete statement. `0012` originally created one and could never be applied: hosted Supabase owns `storage.objects` as `supabase_storage_admin` and doesn't make `postgres` a member, so `create index` on it raises `42501` for every role available to us.

### Storage

Single private bucket, `item-images`. Object-level policies restrict access by path prefix — a user can only touch objects whose path starts with their own UID (paths are `<uid>/<itemId>/<file>`). The bucket itself additionally restricts uploads to `image/webp`, `image/jpeg`, `image/png`, capped at 5 MiB ([`0009_storage_restrictions.sql`](../../supabase/migrations/0009_storage_restrictions.sql)) — defense in depth in case something calls the Storage API directly, bypassing the client's own compression and file-type filtering.

## Client data-access layer

[`web/src/app/data/`](../../web/src/app/data/) is the only code that talks to Supabase directly:

- `items.ts` — `listItems()` (paginated, category-scoped, optional search via `buildSearchFilter()`), `createItem()`, `updateItem()`, `deleteItem()`, `linkItemToCategory()`, `listItemPlaces()`.
- `categories.ts` — `listCategories()`, `createCategory()`, `deleteCategory()`, plus `listItemIdsForCategory()` / `listItemIdsLinkedElsewhere()` used to work out which items a category deletion would orphan.
- `images.ts` — `listImageObjects()` / `listAllImageObjects()`, `createSignedUrls()` (1 hour expiry), `uploadImageObject()`, `removeImageObjects()`, `removeItemImages()`.

## CI/CD

| Workflow | Trigger | Does |
| --- | --- | --- |
| [`ci.yml`](../../.github/workflows/ci.yml) | push/PR to `main` | Build, type-check, format check, lint, `vitest run --coverage` (gated by thresholds — see [Configuration](configuration.md#coverage-and-mutation-thresholds)), serves the static export and checks it boots. A separate `mutation_test` job (push-to-`main` only) runs Stryker against five pure/high-risk modules. |
| [`pages-deploy.yml`](../../.github/workflows/pages-deploy.yml) | push to `main`, manual | Builds the static export and deploys it to GitHub Pages. |
| [`keep-alive.yml`](../../.github/workflows/keep-alive.yml) | daily cron, manual | Calls the `keepalive()` RPC to stop a free-tier Supabase project auto-pausing. |
| [`auto-merge.yml`](../../.github/workflows/auto-merge.yml) | PR events | Auto-approves and merges Dependabot PRs that are patch-level semver bumps only. |
