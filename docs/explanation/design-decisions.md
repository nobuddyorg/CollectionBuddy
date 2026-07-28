# Design decisions

The reasoning behind choices that aren't obvious from reading the code once. For *what* exists, see the [Architecture reference](../reference/architecture.md).

## Why authorization lives entirely in Postgres RLS

CollectionBuddy is a static export ([`web/next.config.ts`](../../web/next.config.ts), `output: 'export'`) — there is no server runtime, so there's nowhere to put server-side authorization checks even if we wanted to. Every table's Row Level Security policies (`user_id = auth.uid()`) are the *only* place access is enforced. This means the client can be fully trusted with the anon key — it has no more access than RLS grants it regardless of what the frontend code does or doesn't check. A bug in a React component can make the UI behave wrong; it can't leak another user's data, because the database itself refuses the query.

The practical consequence for contributors: never treat a client-side check (e.g. "only show the delete button if...") as a security boundary. It's UX, not authorization. The real check is the RLS policy, and any new query needs to be covered by one.

## Why images are deleted client-side before the database row

`cleanup_item_images()` (the trigger that fires on item delete) can only ever run `DELETE FROM storage.objects WHERE ...` — that removes the storage **metadata** row, not the actual file bytes sitting in the storage backend. Only the Storage API (`supabase.storage.remove()`, called from `data/images.ts`) can delete the real bytes, and that API isn't reachable from inside a Postgres trigger.

So the app always deletes storage objects from the client *first*, then deletes the item/category row — `useItemImages.tsx` and the category-deletion flow in `ItemList/index.tsx` both follow this order deliberately. The trigger is a backstop for the case where an app crashes between those two steps (e.g. mid-request), not the primary cleanup path. If you're adding a new place where items or categories get deleted, keep this order — deleting the row first would orphan the actual image files in storage with no way to find and remove them afterward.

## Why the orphan-cleanup trigger is statement-level

`delete_item_if_orphan()` removes an item once it belongs to zero categories. The first version ran `FOR EACH ROW`, doing one `EXISTS` probe per deleted `item_categories` row — deleting a 500-item category meant ~500 sequential lookups against the shared `item_categories` table. `0012_batch_delete_triggers.sql` rewrote it to `FOR EACH STATEMENT` with a transition table (`old_rows`), turning that into a single set-based `DELETE ... WHERE id IN (...) AND NOT EXISTS (...)`. Same logic, one query instead of N — this is a real fix for category deletion at any meaningful size, not a micro-optimization.

## Why search uses trigram ILIKE instead of full-text search

Early migrations (`0002`, `0008`) added `tsvector` full-text-search columns and GIN indexes for them. They were dropped in `0011_fix_search_indexes.sql` because the app never actually used FTS — search is a simple substring match (`ILIKE '%query%'`) across title, description, place, and tags, combined with `OR`. FTS indexes were dead weight: extra storage, extra work on every write, for a feature that wasn't there. What backs search today is `pg_trgm` trigram GIN indexes on each searched column, which is what `ILIKE '%...%'` actually needs to avoid a sequential scan.

The 3-character minimum before a search fires (`buildSearchFilter` isn't called below that, both in the item list and in place autocomplete) exists for the same reason: a trigram index needs at least one 3-character trigram to produce candidates, so a 1–2 character query can't use the index at all — it would force a sequential scan on every keystroke for no benefit, since the result set at that length is nearly the whole table anyway.

## Why mutation testing is scoped to five files

Line coverage answers "did this code run during a test," not "would a real bug in this code have been caught." For most of this app — presentational components, hooks that mostly orchestrate Supabase calls — that gap doesn't matter much. It matters a lot for a handful of pure functions doing string and boundary-condition construction, where a test can execute every line and still not assert anything meaningful:

- `buildSearchFilter` (`data/items.ts`) — escaping/quoting for PostgREST's `or=()` filter grammar. Get the escaping wrong and search either breaks or, worse, lets a search term leak into the filter as structural syntax.
- `getPaginationItems` (`Pagination.tsx`) — the ellipsis/window boundary logic has several off-by-one-prone conditions.
- `pairImageEntries` / `toImgEntries` (`useItemImages.tsx`) — matching `.webp`/`.thumb.webp` pairs by filename.
- `formatPlaceDisplay` / `dedupePhotonFeatures` / `isQueryLongEnough` (`usePhoton.tsx`) — geocoding result formatting and de-duplication.
- `resolveTranslationKey` (`I18nProvider.tsx`) — dotted-key lookup against the translation tree.

Stryker is scoped to exactly these ([`web/stryker.config.mjs`](../../web/stryker.config.mjs)), each paired with a `/* v8 ignore start/stop */` + `// Stryker disable all/restore all` block around the surrounding React/effect/Supabase code in the same file. Running mutation testing over the whole `src/app` tree would mean mutating JSX and Tailwind class strings too — thousands of mostly-equivalent mutants, a multi-minute run, and a score that means nothing either way. Five small, pure, high-consequence functions run in seconds and produce a number worth acting on. This is also why CI runs it only on push to `main` rather than per PR (see [`ci.yml`](../../.github/workflows/ci.yml)) — it's slower than the unit suite, and a flapping break threshold on every PR would get the whole step deleted rather than fixed.
