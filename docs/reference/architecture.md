# Architecture reference

What CollectionBuddy is made of. For _why_, see [Design decisions](../explanation/design-decisions.md).

## Application

- **Next.js, static export** (`output: 'export'` in [`web/next.config.ts`](../../web/next.config.ts)). No server runtime, no route handlers. Every page except `layout.tsx` is a client component; `layout.tsx` renders once at build time, before any session exists.
- `basePath` is empty in local dev. A production build takes it from `PAGES_BASE_URL`, which the deploy sets to the Pages site's URL: `/CollectionBuddy` for a project site, empty once the repository has a custom domain of its own ([Move to a custom domain](../how-to/developer-guide.md#move-to-a-custom-domain)). Unset, as in CI and every local build, it is `/CollectionBuddy`. Client code reads it as `NEXT_PUBLIC_BASE_PATH`; `site.webmanifest` names its URLs relative to itself, so it follows without one.
- **The origin is the session boundary.** The Supabase session (access and refresh token) sits in `localStorage` under `sb-<ref>-auth-token`, and the worker, Cache Storage and permission grants are per origin; as a project site the app shares its origin with every other Pages site of the org ([why that matters](../explanation/design-decisions.md#why-the-origin-is-a-trust-boundary)).
- The Supabase client ([`web/src/app/supabase.ts`](../../web/src/app/supabase.ts)) is created once at import time with `flowType: 'pkce'`, `persistSession`, `autoRefreshToken` and `detectSessionInUrl` on.
- Authorization is Postgres Row Level Security, and nothing else.
- **Service worker** ([`web/public/sw.js`](../../web/public/sw.js), registered by `useServiceWorker.ts`). Same-origin `GET`s only; Supabase is cross-origin and never touched. `_next/static/**` is cache-first (content-hashed, so immutable); navigations and `site.webmanifest` are network-first, with the cache as the offline fallback. Each build registers `sw.js?build=<NEXT_PUBLIC_BUILD_ID>` (a UUID `next.config.ts` draws per build), so a deploy installs a new worker whose cache is `collectionbuddy-<id>`, and its `activate` deletes every other `collectionbuddy-*` cache and nothing else on the shared Pages origin ([why](../explanation/design-decisions.md#why-the-service-worker-fetches-pages-network-first)).
- **Error boundary** ([`web/src/app/error.tsx`](../../web/src/app/error.tsx)). A `ChunkLoadError` (a lazy chunk the server no longer has, in a tab still running an earlier build) reloads the page once; within 30 s of that reload (`sessionStorage`), or for any other error, it shows a translated screen with a reload button instead of Next's built-in English one.

## Database schema

[`supabase/migrations/`](../../supabase/migrations/), applied in filename order: seven files ordered by dependency, not history — extensions, functions, tables, triggers, indexes, policies, storage — and none of them patches another. A change to the schema is a new numbered file after them; the chain is folded back into the seven only by a deliberate squash ([why](../explanation/design-decisions.md#why-the-migrations-were-squashed)).

| File | Changes |
| --- | --- |
| [`0008_drop_items_tags_gin.sql`](../../supabase/migrations/0008_drop_items_tags_gin.sql) | Drops the GIN index on `items.tags`, which no query read. |
| [`0009_user_quotas.sql`](../../supabase/migrations/0009_user_quotas.sql) | Per-owner quotas: 1 GiB of full-size photographs and 50,000 entries, with photograph sizes taken from Storage rather than the client. |
| [`0010_revoke_public_execute.sql`](../../supabase/migrations/0010_revoke_public_execute.sql) | Revokes PUBLIC's default `EXECUTE` on `storage_item_id()` and on the `SECURITY DEFINER` trigger functions of `0002`; triggers still fire, direct calls are refused. |
| [`0011_storage_item_id_no_subtransaction.sql`](../../supabase/migrations/0011_storage_item_id_no_subtransaction.sql) | `storage_item_id()` tests the segment with `pg_input_is_valid()` instead of catching the cast's error, so no call opens a subtransaction. Same results. |
| [`0012_storage_owner_policies_initplan.sql`](../../supabase/migrations/0012_storage_owner_policies_initplan.sql) | The owner-only `storage.objects` policies call `(select auth.uid())`, once per statement, like `0006`. Same rows allowed and denied. |
| [`0013_images_user_covers_size.sql`](../../supabase/migrations/0013_images_user_covers_size.sql) | Replaces `images (user_id)` with `(user_id) include (size_bytes)`, so the photo quota sum is an index-only scan. |
| [`0014_drop_redundant_item_categories_indexes.sql`](../../supabase/migrations/0014_drop_redundant_item_categories_indexes.sql) | Drops `item_categories (item_id)` and `(category_id)`, prefixes of the primary key and of `(category_id, created_at desc, item_id)`. |
| [`0015_revoke_api_role_execute.sql`](../../supabase/migrations/0015_revoke_api_role_execute.sql) | Revokes direct `EXECUTE` grants to `anon` (and, on trigger functions, `authenticated`) that hosted default privileges add, and stops `postgres`'s default privileges granting new functions to either. |
| [`0016_bound_row_volume.sql`](../../supabase/migrations/0016_bound_row_volume.sql) | Per-owner ceilings on categories and shares, a per-entry ceiling on category links, and length checks on every text column. |
| [`0017_shared_read_once_per_statement.sql`](../../supabase/migrations/0017_shared_read_once_per_statement.sql) | Adds `granted_category_ids()`; the read policies (tables and shared `storage.objects`) and `has_category_read_access()` ask it once per statement. Same rows allowed and denied ([why](../explanation/design-decisions.md#why-read-policies-take-the-callers-grants-as-one-set)). |
| [`0018_rpc_custom_plans.sql`](../../supabase/migrations/0018_rpc_custom_plans.sql) | `list_category_places()` and `search_category_items()` become plpgsql with `plan_cache_mode = force_custom_plan`, so each call is planned for the category it names; search checks access once per call, and both order ties by id so pages and a place's titles, ids and coordinates stay consistent. The map sends `ids` only for a place without finite coordinates, the only one the client writes a geocode back to: 1,283 KB to 331 KB for 25,000 entries. Same rows, same security mode ([why](../explanation/design-decisions.md#why-the-map-and-search-rpcs-are-plpgsql)). |
| [`0019_images_path_thumb_matches_item.sql`](../../supabase/migrations/0019_images_path_thumb_matches_item.sql) | `images.path_thumb` must name its own entry, as `path_full` must: the owner's client deletes both paths, so a planted thumbnail took another entry's photo with it. `not valid`: checked on every write from now on. |
| [`0020_one_collection_per_entry.sql`](../../supabase/migrations/0020_one_collection_per_entry.sql) | `tg_item_categories_quota()` refuses an entry's second category link (was: an 11th), with `PT507`. Existing rows untouched. |
| [`0021_item_writes_follow_the_grant.sql`](../../supabase/migrations/0021_item_writes_follow_the_grant.sql) | Adds `has_item_write_access()`. Writing an entry, its links, its `images` rows and the own-prefix objects under it needs write access to every category it is in, the entry's own owner included: revoking or demoting an editor ends their writes to the entries they filed ([why](../explanation/design-decisions.md#why-an-editors-filed-entries-follow-the-grant)). |
| [`0022_orphan_sweep_plan.sql`](../../supabase/migrations/0022_orphan_sweep_plan.sql) | Adds `orphan_sweep_plan()`, the query `cleanup-orphaned-photos.yml` used to carry inline, plus the counts its mass-deletion ceiling needs; executable by no API role. |
| [`0023_editor_photographs_follow_the_entry.sql`](../../supabase/migrations/0023_editor_photographs_follow_the_entry.sql) | An entry's owner reads the objects her own `images` rows name, so she signs and deletes a photograph an editor added to her entry. An own-prefix upload or delete needs an entry the caller sees and may write, so an ex-editor can no longer remove those bytes or fill a path a record names ([why](../explanation/design-decisions.md#why-a-photograph-an-editor-adds-to-your-entry-is-yours)). |
| [`0024_orphan_sweep_plan_read_only.sql`](../../supabase/migrations/0024_orphan_sweep_plan_read_only.sql) | Lets `supabase_read_only_user` execute `orphan_sweep_plan()`, so the sweep's Management API token runs it through the read-only query endpoint and needs no write access to the database. |
| [`0025_photo_ceilings_fit_the_plan.sql`](../../supabase/migrations/0025_photo_ceilings_fit_the_plan.sql) | Photograph ceilings sized to the Free plan's 1 GB: 256 MiB per owner with thumbnails counted (`images.thumb_size_bytes`, backfilled), 768 MiB in the bucket when a photograph is recorded, and `photo_upload_has_room()` in the upload policy: 832 MiB in the bucket, 320 MiB per uploader. The upload policy also refuses a path an `images` row names ([why](../explanation/design-decisions.md#why-quotas-are-counted-in-the-database)). |
| [`0026_places_in_stable_order.sql`](../../supabase/migrations/0026_places_in_stable_order.sql) | `list_category_places()` returns its places ordered by place, so the map can page them past PostgREST's `max_rows` (1,000), which truncated a larger category's places without an error. |

### Tables

| Table | Columns | Notes |
| --- | --- | --- |
| `categories` | `id`, `user_id`, `name`, `created_at`, `updated_at` | Name non-blank after normalization, at most 200 characters; unique per user, case-insensitively. |
| `items` | `id`, `user_id`, `title`, `description`, `place`, `place_lat`, `place_lng`, `tags text[]`, `tags_text` (generated), `created_at`, `updated_at` | Title non-blank. At most 300 characters of title, 10,000 of description, 500 of place, and 50 tags of up to 100 characters. `tags_text` is a space-joined copy of `tags` so tag search shares the `ILIKE` filter. `place_lat`/`place_lng` are set when the user picks a suggestion; null for hand-typed places, which the map geocodes on demand. |
| `item_categories` | `item_id`, `category_id`, `user_id`, `created_at` | Primary key `(item_id, category_id)`. An item belongs to exactly one category: the UI files it in one, and `0020` refuses a second link. Rows filed twice before `0020` are left as they are, and deleting one of their categories keeps the item. |
| `category_shares` | `id`, `category_id`, `owner_user_id`, `invited_email`, `role`, `expires_at`, `created_at` | One row per `(category, invited email)`, email at most 320 characters. `role` is `viewer` (default) or `editor`. |
| `images` | `id`, `item_id`, `user_id`, `path_full`, `path_thumb`, `size_bytes`, `thumb_size_bytes`, `created_at` | One row per photo; paths are complete Storage paths whose second segment is the row's own item, for both sizes. `size_bytes` is the full size's, which the export's size estimate reads; `thumb_size_bytes` the thumbnail's, 0 without one. Cascades away with its item. |

### Row Level Security

All policies are in [`0006_policies.sql`](../../supabase/migrations/0006_policies.sql), with the read policies rewritten by `0017`, built from an owner check and `security invoker` predicates:

- `user_id = (select auth.uid())` — the scalar subquery makes the planner evaluate it once per query, not per row.
- `category_id = any(array(select granted_category_ids()))` — the categories an active `category_shares` grant to the caller's email opens, at either role, read once per statement as an initPlan. `has_category_read_access(cat_id)` asks the same set for one category.
- `has_category_write_access(cat_id)` — category ownership, **or** an active grant at role `editor`.
- `has_item_write_access(item_id, owner_id)` — every category the entry is in passes `has_category_write_access()`, and the caller owns the entry or it is in at least one. Owning an entry is not enough once it is filed in someone else's category. Links the caller cannot see do not count, so for a non-owner this is write access via one of its visible categories.

Ownership is inside the write predicate and deliberately outside the read one; every read policy adds its own owner branch instead. Folding ownership into the read predicate would let a category's owner see every item linked into it, including ones an editor added that the owner was never granted.

| Table | `select` | `insert` | `update` | `delete` |
| --- | --- | --- | --- | --- |
| `categories` | owner, or read access | owner | owner | owner |
| `items` | owner, or read access via a linked category | owner | item write access | item write access |
| `item_categories` | owner, or read access to the category | owner (the item's) | — | write access to the category |
| `category_shares` | owner, or the invited email | owner | owner | owner, or the invited email |
| `images` | owner, or read access via the item's categories | item write access | — | item write access |

No `update` policy means no row matches, so the omission is the denial. Category-level actions — rename, delete, manage shares — are owner-only at every role.

Grants are the second denial: `anon` has `revoke all` on every table, and `authenticated` holds exactly the DML each table's policies back — no `UPDATE` on `item_categories`/`images`, no `TRUNCATE`/`REFERENCES`/`TRIGGER` anywhere. `TRUNCATE` is the one RLS does not filter. `0007` raises at migration time if RLS is ever found disabled on `storage.objects`.

[`web/e2e/signed-in/rls/`](../../web/e2e/signed-in/rls/) is the executable version of this section, one spec per boundary (`isolation`, `viewer-share`, `editor-share`, each with a `-photographs` half for Storage, plus `search-rpc`, `orphan-sweep-rpc` and `quotas`), with real tokens against a local stack; `supabase/tests/database/` covers the same logic directly in pgTAP.

### Sharing

Account-based, one category at a time, `viewer` or `editor`. No public links ([why](../explanation/design-decisions.md#why-sharing-has-no-public-link)).

- A viewer reads the category, its items, links and photos. An editor also adds, edits and deletes items and photos inside it, via `has_category_write_access()`. Neither touches the category itself. `page.tsx`'s `canEditSelected` mirrors this for the interface; the policies are the check.
- A grant is created as `viewer`; raising it is an `update` of `role`, gated by the owner-only update policy and by `tg_category_shares_enforce()`, which rejects any other column changing.
- The owner invites by email. There is no accept step: both predicates compare `invited_email` with `public.caller_email()`, so a grant works the moment that email signs in, even for the first time. Who can sign in with an address is up to the hosted Auth settings, which are pinned and checked ([why](../explanation/design-decisions.md#why-the-hosted-auth-settings-are-pinned)).
- `tg_category_shares_enforce()` derives `owner_user_id` from the category, rejects sharing a category the caller does not own or sharing with oneself, and lowercases the email.
- One grant per `(category, email)`; re-sharing is a no-op, not a second row with a different expiry.
- Ending or demoting an editor's grant also ends their writes to the entries they filed into the category: those stay the editor's rows, yet `has_item_write_access()` asks for write access to the category, not ownership. The entries stay in the category, readable to its grantees and to the editor, and invisible to the owner like every editor-filed entry; deleting the category removes them.
- A photograph an editor adds to the owner's entry is the owner's: bytes under the editor's prefix, the `images` row (and the quota) on the owner. She reads and deletes it like her own; once the grant ends, the editor can no longer remove it or upload under the entry, though it still reads the bytes it uploaded (see Storage).
- Ending a grant is a `delete` from either side — owner revoking and grantee leaving are the same operation on the same row. The client sends it at once, not after an undo window; the owner's Undo inserts the grant again ([why](../explanation/design-decisions.md#why-deletes-wait-out-an-undo-window-and-ending-a-grant-does-not)).
- `expires_at` is optional and only constrained to be after `created_at`. Both predicates re-check the clock on every read; `select`/`delete` on `category_shares` do not, so an expired grant stays visible for either side to clean up.

### Triggers and functions

Functions in [`0002_functions.sql`](../../supabase/migrations/0002_functions.sql), triggers in [`0004_triggers.sql`](../../supabase/migrations/0004_triggers.sql). The `language sql` functions that read tables — the two access predicates and the two RPCs — are created with `check_function_bodies` off, the way `pg_dump` restores functions, because Postgres would otherwise parse their bodies before `0003` creates the tables.

- `normalize_text()` — trims, collapses whitespace, returns `NULL` for blank.
- `join_tags()` — backs the `tags_text` generated column.
- `caller_email()` — the caller's JWT email, trimmed and lowercased.
- `enforce_user_id()` — sets `user_id = auth.uid()` on insert; on update restores the old owner rather than raising.
- `tg_categories_normalize()` / `tg_items_normalize()` — apply `normalize_text()`; items also dedupe and sort `tags`.
- `tg_item_categories_enforce()` — verifies both rows exist, requires write access to the category, sets `user_id` from the item's owner, and rejects the row if that owner is not the caller.
- `tg_category_shares_enforce()` — see Sharing.
- `tg_images_enforce()` — derives `images.user_id` from the item's owner; rejects an insert without `has_item_write_access()` to the item.
- `tg_images_size_from_storage()` — sets `images.size_bytes` and `thumb_size_bytes` to the sizes Storage recorded for `path_full` and `path_thumb`, or the bucket's 5 MiB cap for a path with nothing stored; the client's claim is ignored.
- `tg_images_quota()`, `tg_items_quota()`, `tg_categories_quota()`, `tg_category_shares_quota()`, `tg_item_categories_quota()` — `FOR EACH STATEMENT` after insert: refuse with SQLSTATE `PT507` (HTTP 507) a write that takes an owner past 256 MiB of photographs and thumbnails, 50,000 entries, 1,000 categories or 1,000 shares, or an entry into a second category. `tg_images_quota()` also refuses any photograph while the bucket holds more than 768 MiB, with the detail `project` ([why](../explanation/design-decisions.md#why-quotas-are-counted-in-the-database), [values](configuration.md#photograph-storage-ceilings)).
- `delete_item_if_orphan()` — after `item_categories` rows are deleted, deletes items now in zero categories. `FOR EACH STATEMENT` with a transition table ([why](../explanation/design-decisions.md#why-the-orphan-cleanup-trigger-is-statement-level)).
- `tg_set_updated_at()` — on `categories` and `items`.
- `storage_item_id()` — parses the item id out of a storage path, returning `NULL` rather than raising; it tests the segment with `pg_input_is_valid()` rather than catching the cast's error, so no call opens a subtransaction. See Storage.
- `keepalive()` — no-op RPC, callable by `anon`, hit daily by `keep-alive.yml`.
- `orphan_sweep_plan()` — what `cleanup-orphaned-photos.yml` deletes: the oldest unreferenced `item-images` objects past 48 h, with their count, bytes, the total orphaned and the mass-deletion ceiling. `SECURITY INVOKER`; no API role may execute it (`rls/orphan-sweep-rpc.spec.ts`), only `supabase_read_only_user`, as which the Management API's read-only query endpoint runs it (`0024`).
- `list_category_places()` — the map's distinct places for a category, ordered by place so the client can page them past `max_rows`, `SECURITY INVOKER`.
- `photo_upload_has_room()` — whether the bucket holds under 832 MiB and the caller's uid prefix under 320 MiB, orphans included; the upload policy's backstop. `SECURITY DEFINER`, since the caller may not read the rest of the bucket; it scans the bucket's rows, as nothing may index `storage.objects`, and returns only a boolean.
- `search_category_items()` — the searched catalogue page, `SECURITY DEFINER`: re-implements the read-access check (owns the item, or holds an active read grant on the category) and then queries with RLS bypassed so the trigram indexes are usable ([why](../explanation/design-decisions.md#why-search-uses-trigram-ilike-instead-of-full-text-search)). An authorization boundary in its own right, with its own spec (`rls/search-rpc.spec.ts`).

Every function pins `set search_path = ''`, and every one revokes `execute` from `public` and `anon` (trigger functions from `authenticated` too) before granting it to `authenticated` — except `keepalive()`, the one function `anon` may call. The revokes name `anon` and `authenticated` because hosted default privileges can give a new function a direct grant to each, which a revoke from `public` leaves in place (`0015`); `postgres`'s own default privileges no longer grant either.

### Indexes

- Unique `(user_id, lower(name))` on `categories`.
- `(user_id, created_at desc)` on `items`.
- Trigram GIN (`pg_trgm`) on `items.title`, `.description`, `.place`, `.tags_text`. No index on the `items.tags` array: nothing filters by containment (`0008_drop_items_tags_gin.sql`).
- `user_id` and `(category_id, created_at desc, item_id)` on `item_categories` — the catalogue page is driven from this table so one index serves ordering and scoping. It also serves the cascade from `categories`, and the primary key serves the one from `items`; neither needs an index of its own (`0014`).
- `(item_id, created_at asc, id)` and `(user_id) include (size_bytes, thumb_size_bytes)` on `images` — the second makes the photo quota's per-owner sum index-only (`0013`, `0025`).

Nothing indexes `storage.objects`; hosted Supabase owns it and refuses DDL with `42501`.

### Storage

One private bucket, `item-images` ([`0007_storage.sql`](../../supabase/migrations/0007_storage.sql)), restricted to `image/webp`, `image/jpeg`, `image/png` at 5 MiB per file. Paths are `<uid>/<itemId>/<file>`, where the uid is the **uploader's**. The client reads through signed URLs.

The browser compresses every photograph before upload: WebP where its canvas can encode it, JPEG where it cannot (Safari and every iOS browser; [why](../explanation/design-decisions.md#why-safari-uploads-jpeg-instead-of-webp)). The file name's extension is the type actually encoded (`<uuid>.webp` and `<uuid>.thumb.webp`, or `.jpg`), and an import stores each photograph as its archive name says. Nothing server-side reads the extension: no policy, trigger, constraint or the orphan sweep.

- **Owner-only policies** on `select`, `insert`, `delete`: `split_part(name, '/', 1) = (select auth.uid())::text`. `insert` and `delete` also need the second segment to name an entry the caller sees and has `has_item_write_access()` to: not one hidden from them, as the owner's entry is from an ex-editor, and not an id that names no entry (`0021`, `0023`). So an ex-editor can neither remove the bytes an `images` row names nor fill a path a row names before its bytes arrive, and an object whose entry is gone is left to the sweep. `insert` also refuses, for anyone, a path an `images` row names as `path_full` or `path_thumb`, since its size was sampled for the quota, and anything once the bucket or the uploader's prefix is past its backstop in `photo_upload_has_room()` (`0025`). `select` needs only the prefix, so an ex-editor still reads what it uploaded. Splinter skips the `storage` schema, so `040_storage_policy_surface_test.sql` checks that no policy here calls `auth.uid()` once per row.
- **Shared policies** on `select` and `delete`: extract the item id with `storage_item_id()` and join through `item_categories` to the same read/write predicates the tables use (`granted_category_ids()` for reading). `storage_item_id()` returns `NULL` on a path that does not parse, because a raised error inside `USING` aborts the statement instead of failing to match the row.
- **Own-records policy** on `select`: an `images` row of the caller's (`user_id`, the entry's owner) names the object as `path_full` or `path_thumb`, on the row's own entry (`0023`). It is how an entry's owner reads what an editor added under the editor's prefix, and it reveals only the bytes of rows she already reads; an object under her entry that no row of hers names stays unreadable to her.
- **No shared `insert`**: an editor's upload lands under the editor's own prefix and satisfies the owner-only set.
- **No `update` policy** for anyone, and that absence is the only denial — Storage's bootstrap re-grants the `UPDATE` privilege on every start. A path is fixed when written; `move()` and `upsert` are refused ([why](../explanation/design-decisions.md#why-a-storage-objects-path-can-never-change)).

`has_category_read_access()` excludes ownership and an owner cannot share with herself, so the shared policies never reach a category's owner. What she reads under an editor's prefix is exactly what her own `images` rows name: the photographs editors added to her entries. An entry an editor filed stays invisible to her with its photographs, whose rows are the editor's — the read asymmetry of [Row Level Security](#row-level-security). Deliberate.

### Images

`public.images` is the queryable index of what is in Storage, written by the client at upload time — a page's photos come embedded in the unsearched page read itself (a search lists them in one indexed query), instead of one `storage.list()` per item. Its RLS mirrors `item_categories`. Storage remains the authority on what exists; the client deletes objects first and lets the row cascade ([why](../explanation/design-decisions.md#why-images-are-deleted-client-side-before-the-database-row)). Objects nothing references are swept by `cleanup-orphaned-photos.yml`.

## Client data-access layer

[`web/src/app/data/`](../../web/src/app/data/) holds every table and storage query, and the two other external boundaries:

- `items.ts` — `listItems()` (paginated; a search goes through `search_category_items`), `createItem()`, `updateItem()`, `deleteItem()`, `linkItemToCategory()`, `listCategoryPlaces()` (every place, paged 1,000 at a time past `max_rows`). `itemSearch.ts` builds the `ILIKE` filter and decides the minimum search length; `exportItemPages.ts` pages a whole category oldest-first for an export, keyed on `(linked_at, item_id)` rather than an offset.
- `exportCategory.ts`, `exportFormat.ts`, `zip.ts` — the export: a store-only ZIP assembled in the tab, laid out as `CollectionBuddy-<slug>-<date>/` with `collection.json` (every field, full fidelity: tags as a list, coordinates as numbers, ids kept as a future merge identity), `collection.csv` (the same rows flattened to text for a spreadsheet, RFC 4180-quoted, user text formula-guarded) and `photos/NNN-<slug>/N.webp` (`N.jpg` for a JPEG, as stored), numbered and listed in each manifest item's `photos` in the order the app shows them, the cover first. `zip.ts` is hand-written because the bytes are already WebP- or JPEG-compressed, so deflate would cost a pass per megabyte for nothing; it has no Zip64, so 4 GiB and 65 535 entries are hard caps.
- `importCategory.ts`, `importFormat.ts`, `importPhoto.ts`, `importCancellation.ts` — the import: always a new category, never a merge into an existing one (importing the same archive twice makes two categories); photos re-upload through a bounded pool with retries, and a cancel aborts between items. The archive is read once, and only its trailer and central directory up front: `openZip()` hands each photo out as a slice of the file, read when its upload starts, so memory holds a few photos, not the archive (#755). Uploads finish in any order, so each photo row is sent a `created_at` 1 ms apart in manifest order (`importPhotoTasks()`), and an entry keeps its order and its cover; the archive needs no order key of its own, so every archive already exported imports the same way. A failed or cancelled import removes every object it tried to upload, then the half-built category.
- `categories.ts` — list/create/rename/delete, plus the counts the deletion warning needs.
- `images.ts` — the `images` table plus `createSignedUrls()` (1 h, at most 1,000 paths a call), `uploadImageObject()`, `removeImageObjects()`, and `imagePrefix()`, the one place the path scheme is written down. `imageRemoval.ts` holds `removeObjectsThenRows()`, the order every delete path takes: objects in batches of 1,000, stopping at the first refusal, then the rows ([why](../explanation/design-decisions.md#why-images-are-deleted-client-side-before-the-database-row)).
- `auth.ts` — `verifiedUserId()`, a round trip to the auth server for a caller about to write under a user-derived path.
- `photon.ts` — the one [Photon](https://photon.komoot.io/) geocoding client both the form's autocomplete and the map use.

The catalogue keeps each signature's own age (`components/ItemList/imageCache.ts`). A card's photographs are re-signed a few minutes before their own signatures expire, however recently another page was signed, and in batches of 1,000 paths. A failed re-sign keeps the old URLs on screen, and the refresh tries again a minute later (#757).

Session code (`useSession.ts`, `page.tsx`, `login/`) reaches `supabase.ts` directly; nothing under `components/` does. `depcruise` and an ESLint `no-restricted-imports` rule enforce both halves.

## CI/CD

Shared steps live in [`.github/actions/`](../../.github/actions): `setup-web` (Node version, npm cache, `npm ci --ignore-scripts`), `setup-supabase-cli` (the one CLI version, so CI's stack and the production `db push` cannot diverge), `start-local-stack` (that CLI plus `supabase start`), `summary-section` (a tee'd output file into the job summary), `playwright-results` (job summary and artifacts for a Playwright run), `backup-database` (the encrypted off-site dump `backup.yml` and `migrate` share), `call-keepalive` (one anonymous `keepalive()` call, from `keep-alive.yml` and `build`).

| Workflow (job) | Trigger | Does |
| --- | --- | --- |
| `ci.yml` (`prek`) | push/PR to `main` | The repo-wide hooks: file hygiene, `typos`, `markdownlint`, `sqlfluff-lint`, `zizmor`. |
| `ci.yml` (`changes`) | push/PR to `main` | Path filter: `web` and `sql` outputs the jobs below condition on; always true on a push to `main`. |
| `ci.yml` (`build_and_test`) | `web` changed | Build, type-check, format, lint, `depcruise`, `knip`, Vitest with coverage, the signed-out Playwright suite on desktop and phone viewports. |
| `ci.yml` (`e2e_local_stack`) | `web` or `sql` changed | Supabase in Docker: pgTAP (query plans included), the `database.types.ts` drift check, the full Chromium Playwright suite (signed-out and signed-in) with the one e2e coverage floor. |
| `ci.yml` (`mutation_test`) | `web` changed | Stryker over `mutation-targets.mjs`: incremental on a PR from `main`'s cached results, every mutant on `main`. |
| `ci.yml` (`opengrep`) | `web` or `sql` changed | Opengrep SAST; SARIF to code scanning; fails on ERROR severity. |
| `ci.yml` (`lighthouse`) | `web` changed | Lighthouse CI against the export, signed out and in demo mode. |
| `ci.yml` (`zap_baseline`) | `web` changed | OWASP ZAP passive scan against the export, signed out and in demo mode, served on the runner. |
| `pages-deploy.yml` (`gate` → `migrate` → `build` → `deploy` → `smoke_test`) | `ci.yml` passed on a push to `main` (`workflow_run`), manual from `main` | Only `main`'s tip, only once CI passed on it. When migrations are pending, upload an encrypted dump first; apply them and reload the PostgREST cache; export, and call `keepalive()` with the URL and key just baked in, so a rejected key never publishes; publish to Pages; run the signed-out suite against the live site. |
| `keep-alive.yml` | daily, manual | Calls `keepalive()` so a free-tier project does not pause. |
| `cleanup-orphaned-photos.yml` | daily (`30 4 * * *`), manual | Deletes Storage objects no `images` row references as `path_full` or `path_thumb`, older than 48 h, as `orphan_sweep_plan()` selects them — at most 10,000 per run, in requests of 1,000 (Storage's bulk-delete cap). Refuses to delete when more objects are orphaned than max(50, 5 % of the bucket), unless run by hand with `allow_mass_delete` ([Sweep orphaned photographs](../how-to/developer-guide.md#sweep-orphaned-photographs)). Manual runs are dry runs unless opted out. |
| `backup.yml` (`database`, `photographs`) | daily (`47 2 * * *`), manual | Encrypted off-site copies: a dump of roles, schema and `auth`/`public` data, and each new `item-images` object; objects gone from the bucket move to a prefix the backup bucket expires ([Back up production](../how-to/developer-guide.md#back-up-production)). |
| `hosted-auth-check.yml` | hourly (`23 * * * *`), a push to `main` changing it or `supabase/hosted-auth.json`, manual | Reads the production Auth config through the Management API and fails when it differs from `supabase/hosted-auth.json`, a provider the file does not name is on, or a third-party auth integration exists ([Check the hosted Auth settings](../how-to/developer-guide.md#check-the-hosted-auth-settings)). |
| `k6-load-test.yml` | manual only | k6 against a Supabase stack started in the run, or the hosted project behind an explicit opt-in; reports, never gates ([Load testing](../how-to/load-testing.md)). |
| `auto-merge.yml` | PR events | Auto-merges a Dependabot patch-level devDependency bump once checks pass, only if every `package-lock.json` entry it adds or changes is `dev: true`, which the deploy build never runs ([why](../explanation/design-decisions.md#why-dependabot-auto-merges-only-dev-only-lockfile-changes)); does not approve. |
