# Architecture reference

Technical description of how CollectionBuddy is put together. For *why* it's built this way, see [Design decisions](../explanation/design-decisions.md).

## Application

- **Next.js, static export** (`output: 'export'` in [`web/next.config.ts`](../../web/next.config.ts)) — there is no server runtime and no route handlers. Every page except `layout.tsx` is a client component; `layout.tsx` renders once at build time, before any user session exists.
- `basePath` is `/CollectionBuddy` in production builds (`NODE_ENV === 'production'`, i.e. CI) to match GitHub Pages serving the site from `https://<org>.github.io/CollectionBuddy/`, and empty in local dev. Exposed to client code as `NEXT_PUBLIC_BASE_PATH`.
- The Supabase client ([`web/src/app/supabase.ts`](../../web/src/app/supabase.ts)) is created once at import time, with `flowType: 'pkce'` (so auth tokens never land in the URL fragment), `persistSession`, `autoRefreshToken`, and `detectSessionInUrl` all on.
- All authorization is enforced by Postgres Row Level Security — there is no server-side authorization code to bypass, because there is no server.

## Database schema

Defined across [`supabase/migrations/`](../../supabase/migrations/), applied in filename order. Seven files, ordered by dependency rather than by history: extensions, functions, tables, triggers, indexes, policies, storage. Together they *are* the schema — none of them patches an earlier one, so what a file says is what the database has.

Keeping that true is a maintenance job, not a property. The first sixteen migrations grew the other way — a third of their statements existed only to undo an earlier file — and were squashed into this set (see [Developer guide](../how-to/developer-guide.md#migrations)).

### Tables

| Table | Columns | Notes |
| --- | --- | --- |
| `categories` | `id`, `user_id`, `name`, `created_at`, `updated_at` | Name must be non-blank after normalization; unique per user, case-insensitively (`(user_id, lower(name))`). |
| `items` | `id`, `user_id`, `title`, `description`, `place`, `place_lat`, `place_lng`, `tags text[]`, `tags_text` (generated), `created_at`, `updated_at` | Title must be non-blank. `tags_text` is a space-joined copy of `tags`, generated purely so tag search can share the same `ILIKE` filter as the other text columns. `place_lat`/`place_lng` are captured when the user picks a place suggestion, so the map draws those pins without geocoding; they are null for hand-typed places and for rows written before the columns existed, which fall back to a lookup. |
| `item_categories` | `item_id`, `category_id`, `user_id`, `created_at` | Join table, composite primary key `(item_id, category_id)`. An item *can* belong to more than one category, though the UI only ever browses one at a time. |
| `category_shares` | `id`, `category_id`, `owner_user_id`, `invited_email`, `expires_at`, `created_at` | Account-based, read-only category sharing (#483), added in [`0011_category_shares.sql`](../../supabase/migrations/0011_category_shares.sql). One row per (category, invited email); see "Sharing" below. |
| `images` | `id`, `item_id`, `user_id`, `path_full`, `path_thumb`, `size_bytes`, `created_at` | One row per photograph, added in [`0013_images.sql`](../../supabase/migrations/0013_images.sql). Replaces per-item `storage.list()` calls as how the app discovers an item's photographs — see "Images" below. `path_full`/`path_thumb` are complete Storage paths, not bare object names, so a reader never has to reconstruct one with `imagePrefix()`. |

A `public.profiles` table existed in the pre-squash migrations and was dropped — never populated, never queried. Don't recreate it without a reason; it was dead weight, not a placeholder for something planned.

### Row Level Security

This is the *only* authorization layer — see [Design decisions](../explanation/design-decisions.md#why-authorization-lives-entirely-in-postgres-rls). Every policy in [`0006_policies.sql`](../../supabase/migrations/0006_policies.sql) is `user_id = (select auth.uid())` and nothing else; the scalar subquery is deliberate, so the planner evaluates it once per query rather than once per row.

`categories` and `items` each carry all four of `select`/`insert`/`update`/`delete`. `item_categories` carries three: a mapping row has nothing to edit, so there is no update policy. No role is named on any of them, so they apply to every role that can reach the table — RLS alone would deny `anon` regardless, since `auth.uid()` is null there and every predicate is `user_id = (select auth.uid())`, but [`0008_revoke_anon.sql`](../../supabase/migrations/0008_revoke_anon.sql) also revokes `anon`'s table privileges outright, rather than relying on the RLS predicate as the only thing standing between it and these three tables.

[`0011_category_shares.sql`](../../supabase/migrations/0011_category_shares.sql) redeclares the `select` policy on all three of those tables to also allow a row visible via an active `category_shares` grant — see "Sharing" below. Nothing else about them changed: insert/update/delete are still `user_id = (select auth.uid())` only, which is what makes a shared category read-only for its grantee without a separate flag anywhere saying so.

`web/e2e/signed-in/rls.spec.ts` is the executable version of this section: it asks the questions the app never would, with a real token, against a local stack.

### Sharing

Account-based, one category at a time, read-only, added in [`0011_category_shares.sql`](../../supabase/migrations/0011_category_shares.sql) (#483). No public/anonymous links — see [Design decisions](../explanation/design-decisions.md#why-sharing-has-no-public-link) for why that was ruled out.

- An owner invites by email; there is no separate accept step and no trigger resolving the invite against `auth.users`. The RLS predicate compares `category_shares.invited_email` directly against `(select auth.jwt() ->> 'email')`, so a grant simply starts working the moment its invited email signs in — including the first time, if the invite was sent before that email had an account.
- `tg_category_shares_enforce()` (in the same migration) re-derives `owner_user_id` from the category being shared, rejects sharing a category the caller doesn't own, rejects sharing with oneself, and normalizes the email to lowercase — the same shape as `tg_item_categories_enforce()`'s cross-tenant guard.
- Ending a grant is a `delete` on `category_shares`, from either side: the owner revoking and the grantee leaving are the same operation, permitted by the same policy, on the same row. Nothing tracks a "left" or "revoked" state — once the row is gone, it's gone for both.
- `expires_at` is optional and, when set, is checked both at creation (a `check` constraint rejects a grant that's already expired) and on every read (the extended `select` policies above ignore an expired grant rather than deleting it).
- Photos were explicitly out of scope of this migration (0011) on its own, extended to them by [`0012_shared_photos.sql`](../../supabase/migrations/0012_shared_photos.sql) and, for the `images` table specifically, by [`0013_images.sql`](../../supabase/migrations/0013_images.sql) — see "Storage" and "Images" below. A grant now reaches a shared category's items, metadata *and* photographs; nothing about it grants anything beyond `select` anywhere in that chain.

### Triggers and functions

Functions in [`0002_functions.sql`](../../supabase/migrations/0002_functions.sql), the triggers that fire them in [`0004_triggers.sql`](../../supabase/migrations/0004_triggers.sql). The functions come first because `items.tags_text` is a generated column calling `join_tags()`:

- `normalize_text()` — trims and collapses whitespace, returns `NULL` for anything blank.
- `enforce_user_id()` — forces `user_id = auth.uid()` on insert; blocks changing it on update.
- `tg_categories_normalize()` / `tg_items_normalize()` — apply `normalize_text()` to name/title/description/place, and for items also dedupe + sort `tags`.
- `tg_item_categories_enforce()` — verifies the item and category exist, belong to the *same* user, and sets/rechecks `user_id` on the join row (a cross-tenant assignment guard).
- `delete_item_if_orphan()` — after an `item_categories` row is deleted, deletes the item if it now belongs to zero categories. Runs `FOR EACH STATEMENT` with a transition table (not `FOR EACH ROW`) — see [Design decisions](../explanation/design-decisions.md#why-the-orphan-cleanup-trigger-is-statement-level).
- `tg_set_updated_at()` — stamps `updated_at` on every update of `categories` and `items`, via `trg_categories_updated_at` and `trg_items_updated_at`.

There is no image-cleanup trigger reaching into `storage.objects`. A `cleanup_item_images()` one existed and was removed: Supabase forbids deleting from `storage.objects` outside the Storage API, and the trigger made every item delete fail — see [Design decisions](../explanation/design-decisions.md#why-images-are-deleted-client-side-before-the-database-row). The `images` table (added later, see "Images" below) is a different matter: it's a plain `public` table this project owns, so its rows cascade away with the item that owned them (`item_id references items(id) on delete cascade`) like any other child row — the client only has to read their paths *before* that delete, to still remove the Storage bytes afterward.

- `keepalive()` — no-op RPC, granted to `anon` and `authenticated`, called daily by [`keep-alive.yml`](../../.github/workflows/keep-alive.yml) to stop a free-tier Supabase project from auto-pausing.

### Indexes

- Unique `(user_id, lower(name))` on `categories`.
- `(user_id, created_at desc)` on `items`, for list ordering.
- Trigram GIN indexes (`pg_trgm`) on `items.title`, `items.description`, `items.place`, `items.tags_text` — see [Design decisions](../explanation/design-decisions.md#why-search-uses-trigram-ilike-instead-of-full-text-search) for why these exist instead of Postgres full-text search.
- A plain GIN index on `items.tags` for containment filtering, which is an array operation and can't use the trigram index.
- `item_id`, `category_id` and `user_id` on `item_categories`.
- `(item_id, created_at asc, id)` and `user_id` on `images` — the former is both the read path (an item's photographs, oldest-first, matching the ordering `storage.list()` used to guarantee) and what a capture-before-cascade delete filters by; the latter matches `item_categories`' own precedent of indexing `user_id` even though `item_id` already narrows most queries.

Nothing here indexes `storage.objects`, and nothing can: hosted Supabase owns it as `supabase_storage_admin` and doesn't make `postgres` a member, so `create index` on it raises `42501` for every role available to us. Policies on it are fine; DDL is not.

### Storage

Single private bucket, `item-images`, all of it in [`0007_storage.sql`](../../supabase/migrations/0007_storage.sql). Object-level policies restrict access by path prefix — a user can only touch objects whose path starts with their own UID (paths are `<uid>/<itemId>/<file>`). The bucket itself additionally restricts uploads to `image/webp`, `image/jpeg`, `image/png`, capped at 5 MiB — defense in depth in case something calls the Storage API directly, bypassing the client's own compression and file-type filtering.

There are two sets of four policies on `storage.objects`, saying the same thing twice. The second set (`list own`, `upload own`, `update own`, `delete own`) was written by hand in the Supabase dashboard before any of this was in migrations, and was found still live in production when the baseline was taken; it tests the prefix with `left(name, 37)` instead of `split_part`, and names no role. Naming no role means it also applies to `anon`, which grants nothing — `auth.uid()` is null there, so the predicate is null and denies — and policies are OR'd, so this set can only ever match a subset of what the first already allows. It is written down rather than dropped so the repository describes the project as it actually is.

A ninth, additive `select` policy — [`0012_shared_photos.sql`](../../supabase/migrations/0012_shared_photos.sql), #483 — lets a category_shares grantee read an owner's objects too. The object's path carries no grantee-checkable identity of its own (it's still `<owner_uid>/<itemId>/<file>`), so the policy instead extracts the itemId segment and joins through `item_categories` to an active grant — the same predicate the select policies on `categories`/`items`/`item_categories` already use (see "Sharing" above). `public.storage_item_id()` does that extraction: a plain `split_part(...)::uuid` raises on any path whose second segment isn't a UUID, and a raised error inside an RLS `USING` clause aborts the whole query, not just that one row, so the function catches the cast failure and returns `NULL` instead. Insert/update/delete are untouched — a grantee gains exactly one new `select` path, nothing else.

### Images

`storage.list()` has no recursive/flat listing across prefixes, so discovering what photographs an item has used to mean one Storage API call per item — up to nine sequential round trips just to paint a page of the grid, and a whole retry/concurrency-pool apparatus in `exportCategory.ts` to make the same thing survive at export scale. [`0013_images.sql`](../../supabase/migrations/0013_images.sql) adds `public.images` as a queryable index of what's in Storage, written by the client at upload time: one row per photograph, `path_full`/`path_thumb` already complete Storage paths. "What images does this page's items have" is now one indexed query (`item_id in (...)`) instead of one per item.

- RLS mirrors `item_categories`: `select`/`insert`/`delete`, no `update` — a row has nothing to edit once written. `select` is additive the same way `categories`/`items`/`item_categories`/`storage.objects` are: owner, or an active `category_shares` grant reached by joining `item_categories` on `images.item_id` — a plain join, unlike `storage.objects`' policy, since `item_id` is a native column here rather than something to parse back out of a path string.
- `tg_images_enforce()` is the same shape as `tg_item_categories_enforce()`, with only one owned entity to check: it re-derives `user_id` from the item's own owner and rejects an insert whose item belongs to someone else.
- Storage still holds the bytes and is still the authority on what actually exists; this table is written and cleared by the client, never trusted blindly — see the FK-cascade note above for how a row's removal is sequenced against the Storage delete it implies.

## Client data-access layer

[`web/src/app/data/`](../../web/src/app/data/) holds the table and storage queries, plus the two other places the app talks past a UI boundary to something external — the auth client and the Photon gazetteer:

- `items.ts` — `listItems()` (paginated, category-scoped, optional search via `buildSearchFilter()`), `createItem()`, `updateItem()`, `deleteItem()`, `linkItemToCategory()`, `listItemPlaces()`.
- `categories.ts` — `listCategories()`, `createCategory()`, `renameCategory()`, `deleteCategory()`, plus `listItemIdsForCategory()` / `countItemsForCategory()` / `listItemIdsLinkedElsewhere()` used to work out which items a category deletion would orphan, and to warn about how many before it runs.
- `images.ts` — reads/writes the `images` table (`listImagesForItems()` for the grid/export read path, `listImagePathsForItems()` for the capture-before-cascade delete paths, `createImageRow()`, `deleteImageRow()`) plus the Storage-bytes calls that still go straight to Storage regardless of the table (`createSignedUrls()`, 1 hour expiry; `uploadImageObject()`; `removeImageObjects()`), and `imagePrefix()`, the one place the `<uid>/<itemId>` storage-path scheme is written down.
- `auth.ts` — `currentUserId()` (reads the local session, no network round trip — the read path) and `verifiedUserId()` (round-trips to the auth server — for a caller about to write bytes under a user-derived path).
- `photon.ts` — the one [Photon](https://photon.komoot.io/) client both geocoding surfaces (`ItemForm/usePhoton.tsx`'s autocomplete, `Map/usePlaces.tsx`'s background lookup of catalogued place names) go through: `photonSearchUrl()`, `photonLang()`, `coordsFromFeature()` and `isRetryableStatus()`. The two used to hit the endpoint independently, with two coordinate validators that disagreed on `NaN`.

It is not the only code holding the client, though. Auth and session work reaches [`supabase.ts`](../../web/src/app/supabase.ts) directly — `useSession.ts`, `page.tsx`, `login/useAuthRedirect.ts`, `login/useGoogleSignIn.ts` — none of which have anywhere else to live, since there is no session-management equivalent of `data/auth.ts`. Nothing under `components/` does; an ESLint rule (`no-restricted-imports`, scoped to `components/**`) keeps it that way.

## CI/CD

| Workflow (job) | Trigger | Does |
| --- | --- | --- |
| [`ci.yml`](../../.github/workflows/ci.yml) (`prek`) | push/PR to `main` | The repo-wide hooks from [`.pre-commit-config.yaml`](../../.pre-commit-config.yaml): file hygiene, spell check, shellcheck, markdownlint, and zizmor's security analysis of these workflows. |
| [`ci.yml`](../../.github/workflows/ci.yml) (`build_and_test`) | push/PR to `main` | Build, type-check, format check, lint, `vitest run --coverage` (gated by thresholds — see [Configuration](configuration.md#coverage-and-mutation-thresholds)), then the signed-out Playwright suite against the built export, served under the base path on desktop and a phone viewport — this replaced an earlier check that only served the export and confirmed it booted. |
| [`ci.yml`](../../.github/workflows/ci.yml) (`e2e_local_stack`) | push/PR to `main` | Starts a Supabase stack in Docker and runs the signed-in Playwright suite against it: the catalogue, search, the map, the entry forms, photographs, and the row-level security boundary. |
| [`ci.yml`](../../.github/workflows/ci.yml) (`mutation_test`) | push/PR to `main` | Stryker against the pure, high-risk modules listed in [`stryker.config.mjs`](../../web/stryker.config.mjs). |
| [`pages-deploy.yml`](../../.github/workflows/pages-deploy.yml) (`migrate`) | push to `main`, manual | Applies any pending migrations to the hosted database and reloads PostgREST's schema cache, before anything that depends on the new schema is built. |
| [`pages-deploy.yml`](../../.github/workflows/pages-deploy.yml) (`build`) | push to `main`, manual | Builds the static export. |
| [`pages-deploy.yml`](../../.github/workflows/pages-deploy.yml) (`deploy`) | push to `main`, manual | Publishes the export to GitHub Pages. |
| [`pages-deploy.yml`](../../.github/workflows/pages-deploy.yml) (`smoke_test`) | push to `main`, manual | Reruns the signed-out Playwright suite against the live deployed site. |
| [`keep-alive.yml`](../../.github/workflows/keep-alive.yml) | daily cron, manual | Calls the `keepalive()` RPC to stop a free-tier Supabase project auto-pausing. |
| [`auto-merge.yml`](../../.github/workflows/auto-merge.yml) | PR events | Merges Dependabot PRs for patch-level devDependency bumps only, once every required check passes (`gh pr merge --auto`) — it does not itself approve the PR, so a branch-protection rule requiring a review would still block it. |
