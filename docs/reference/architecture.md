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

A `public.profiles` table existed in the pre-squash migrations and was dropped — never populated, never queried. Don't recreate it without a reason; it was dead weight, not a placeholder for something planned.

### Row Level Security

This is the *only* authorization layer — see [Design decisions](../explanation/design-decisions.md#why-authorization-lives-entirely-in-postgres-rls). Every policy in [`0006_policies.sql`](../../supabase/migrations/0006_policies.sql) is `user_id = (select auth.uid())` and nothing else; the scalar subquery is deliberate, so the planner evaluates it once per query rather than once per row.

`categories` and `items` each carry all four of `select`/`insert`/`update`/`delete`. `item_categories` carries three: a mapping row has nothing to edit, so there is no update policy. No role is named on any of them, so they apply to every role that can reach the table — only `authenticated` is granted anything, and `auth.uid()` is null for `anon`, so the predicate is null and denies.

`web/e2e/signed-in/rls.spec.ts` is the executable version of this section: it asks the questions the app never would, with a real token, against a local stack.

### Triggers and functions

Functions in [`0002_functions.sql`](../../supabase/migrations/0002_functions.sql), the triggers that fire them in [`0004_triggers.sql`](../../supabase/migrations/0004_triggers.sql). The functions come first because `items.tags_text` is a generated column calling `join_tags()`:

- `normalize_text()` — trims and collapses whitespace, returns `NULL` for anything blank.
- `enforce_user_id()` — forces `user_id = auth.uid()` on insert; blocks changing it on update.
- `tg_categories_normalize()` / `tg_items_normalize()` — apply `normalize_text()` to name/title/description/place, and for items also dedupe + sort `tags`.
- `tg_item_categories_enforce()` — verifies the item and category exist, belong to the *same* user, and sets/rechecks `user_id` on the join row (a cross-tenant assignment guard).
- `delete_item_if_orphan()` — after an `item_categories` row is deleted, deletes the item if it now belongs to zero categories. Runs `FOR EACH STATEMENT` with a transition table (not `FOR EACH ROW`) — see [Design decisions](../explanation/design-decisions.md#why-the-orphan-cleanup-trigger-is-statement-level).
There is no image-cleanup trigger. A `cleanup_item_images()` one existed and was removed: Supabase forbids deleting from `storage.objects` outside the Storage API, and the trigger made every item delete fail — see [Design decisions](../explanation/design-decisions.md#why-images-are-deleted-client-side-before-the-database-row).
- `keepalive()` — no-op RPC, granted to `anon` and `authenticated`, called daily by [`keep-alive.yml`](../../.github/workflows/keep-alive.yml) to stop a free-tier Supabase project from auto-pausing.

### Indexes

- Unique `(user_id, lower(name))` on `categories`.
- `(user_id, created_at desc)` on `items`, for list ordering.
- Trigram GIN indexes (`pg_trgm`) on `items.title`, `items.description`, `items.place`, `items.tags_text` — see [Design decisions](../explanation/design-decisions.md#why-search-uses-trigram-ilike-instead-of-full-text-search) for why these exist instead of Postgres full-text search.
- A plain GIN index on `items.tags` for containment filtering, which is an array operation and can't use the trigram index.
- `item_id`, `category_id` and `user_id` on `item_categories`.

Nothing here indexes `storage.objects`, and nothing can: hosted Supabase owns it as `supabase_storage_admin` and doesn't make `postgres` a member, so `create index` on it raises `42501` for every role available to us. Policies on it are fine; DDL is not.

### Storage

Single private bucket, `item-images`, all of it in [`0007_storage.sql`](../../supabase/migrations/0007_storage.sql). Object-level policies restrict access by path prefix — a user can only touch objects whose path starts with their own UID (paths are `<uid>/<itemId>/<file>`). The bucket itself additionally restricts uploads to `image/webp`, `image/jpeg`, `image/png`, capped at 5 MiB — defense in depth in case something calls the Storage API directly, bypassing the client's own compression and file-type filtering.

There are two sets of four policies on `storage.objects`, saying the same thing twice. The second set (`list own`, `upload own`, `update own`, `delete own`) was written by hand in the Supabase dashboard before any of this was in migrations, and was found still live in production when the baseline was taken; it tests the prefix with `left(name, 37)` instead of `split_part`, and names no role. Naming no role means it also applies to `anon`, which grants nothing — `auth.uid()` is null there, so the predicate is null and denies — and policies are OR'd, so this set can only ever match a subset of what the first already allows. It is written down rather than dropped so the repository describes the project as it actually is.

## Client data-access layer

[`web/src/app/data/`](../../web/src/app/data/) holds the table and storage queries, plus the two other places the app talks past a UI boundary to something external — the auth client and the Photon gazetteer:

- `items.ts` — `listItems()` (paginated, category-scoped, optional search via `buildSearchFilter()`), `createItem()`, `updateItem()`, `deleteItem()`, `linkItemToCategory()`, `listItemPlaces()`.
- `categories.ts` — `listCategories()`, `createCategory()`, `renameCategory()`, `deleteCategory()`, plus `listItemIdsForCategory()` / `countItemsForCategory()` / `listItemIdsLinkedElsewhere()` used to work out which items a category deletion would orphan, and to warn about how many before it runs.
- `images.ts` — `listImageObjects()` / `listAllImageObjects()` / `listItemImages()`, `createSignedUrls()` (1 hour expiry), `uploadImageObject()`, `removeImageObjects()`, `removeItemImages()`, plus `imagePrefix()`, the one place the `<uid>/<itemId>` storage-path scheme is written down.
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
