# Design decisions

The reasoning behind choices that aren't obvious from reading the code once. For *what* exists, see the [Architecture reference](../reference/architecture.md).

## Why authorization lives entirely in Postgres RLS

CollectionBuddy is a static export ([`web/next.config.ts`](../../web/next.config.ts), `output: 'export'`) — there is no server runtime, so there's nowhere to put server-side authorization checks even if we wanted to. Every table's Row Level Security policies (`user_id = auth.uid()`) are the *only* place access is enforced. This means the client can be fully trusted with the anon key — it has no more access than RLS grants it regardless of what the frontend code does or doesn't check. A bug in a React component can make the UI behave wrong; it can't leak another user's data, because the database itself refuses the query.

The practical consequence for contributors: never treat a client-side check (e.g. "only show the delete button if...") as a security boundary. It's UX, not authorization. The real check is the RLS policy, and any new query needs to be covered by one.

## Why sharing has no public link

Issue #483 asked for three things: share a whole category, share a single entry, share a filtered list — with other users or via a public link. What shipped first ([`0011_category_shares.sql`](../../supabase/migrations/0011_category_shares.sql)) is only the first of those three, account-based only, and that scope cut wasn't arbitrary.

A public link means an anonymous, unauthenticated reader. Every RLS predicate in this project is `user_id = (select auth.uid())` or, since 0011, an `exists` against a grant keyed on `(select auth.jwt() ->> 'email')` — both resolve to nothing for `anon`, by design (see "Why authorization lives entirely in Postgres RLS", above). Actually authorizing an anonymous reader would mean either a new RLS policy that grants `anon` something for the first time in this project's history, keyed on an unguessable token instead of an identity, or a server-side component (an Edge Function) validating that token — the first server-side code this otherwise-static app would ever have. Either is real, separable work, and a materially larger attack surface than extending an existing owner-only predicate to also match a second known identity, on a project whose issue history already includes several RLS-correctness bugs (#292, #387, #335, #290, #386).

There's also no real revocation story for a link once it's been handed out: unlike an account-based grant, which a delete on `category_shares` ends immediately for a specific person, a link already seen (or screenshotted, or forwarded) can't actually be taken back — "revoking" it only stops *new* requests through the app's own token check.

Account-based sharing needed none of that: a recipient is already an authenticated user, so RLS just gets a second predicate to check, `select`-only, no new role and no new grant to `anon` anywhere. If public links are still wanted after this ships, they're a deliberately separate, explicitly higher-risk piece of work — not a rider on this migration.

## Why images are deleted client-side before the database row

Only the Storage API (`supabase.storage.remove()`, called from `data/images.ts`) can delete the actual file bytes; SQL reaches the `storage.objects` metadata row and nothing more. So the app always deletes storage objects from the client *first*, then deletes the item/category row — `useItemImages.tsx` and the category-deletion flow in `ItemList/index.tsx` both follow this order deliberately. If you're adding a new place where items or categories get deleted, keep this order: deleting the row first would orphan the actual image files in storage with no way to find and remove them afterward.

There used to be a `cleanup_item_images()` trigger as a backstop for an app crashing between those two steps. It was removed because it had stopped being a backstop and become a wall: Supabase's `prevent-direct-deletes` storage migration (on this project since 2026-02-28) guards `storage.objects` with a `BEFORE DELETE ... FOR EACH STATEMENT` trigger that raises `42501` for any session outside the Storage API. Statement-level means it fires even when the delete matches nothing — which is the normal case here, since the client has already removed the objects — so every item deletion failed outright. There is no SQL-side backstop available; collecting orphans would need the Storage API, from application code or a scheduled job.

## Why the orphan-cleanup trigger is statement-level

`delete_item_if_orphan()` removes an item once it belongs to zero categories. The first version ran `FOR EACH ROW`, doing one `EXISTS` probe per deleted `item_categories` row — deleting a 500-item category meant ~500 sequential lookups against the shared `item_categories` table. It was rewritten to run `FOR EACH STATEMENT` with a transition table (`old_rows`), turning that into a single set-based `DELETE ... WHERE id IN (...) AND NOT EXISTS (...)`. Same logic, one query instead of N — this is a real fix for category deletion at any meaningful size, not a micro-optimization.

## Why search uses trigram ILIKE instead of full-text search

Early migrations added `tsvector` full-text-search columns and GIN indexes for them. They were dropped because the app never actually used FTS — search is a simple substring match (`ILIKE '%query%'`) across title, description, place, and tags, combined with `OR`. FTS indexes were dead weight: extra storage, extra work on every write, for a feature that wasn't there. What backs search today is `pg_trgm` trigram GIN indexes on each searched column, which is what `ILIKE '%...%'` actually needs to avoid a sequential scan.

The 3-character minimum before a search fires (`buildSearchFilter` isn't called below that, both in the item list and in place autocomplete) exists for the same reason: a trigram index needs at least one 3-character trigram to produce candidates, so a 1–2 character query can't use the index at all — it would force a sequential scan on every keystroke for no benefit, since the result set at that length is nearly the whole table anyway.

## Why mutation testing is scoped to a handful of files

Line coverage answers "did this code run during a test," not "would a real bug in this code have been caught." For most of this app — presentational components, hooks that mostly orchestrate Supabase calls — that gap doesn't matter much. It matters a lot for a handful of pure functions doing string and boundary-condition construction, where a test can execute every line and still not assert anything meaningful:

- `buildSearchFilter` (`data/items.ts`) — escaping/quoting for PostgREST's `or=()` filter grammar. Get the escaping wrong and search either breaks or, worse, lets a search term leak into the filter as structural syntax.
- `getPaginationItems` (`Pagination.tsx`) — the ellipsis/window boundary logic has several off-by-one-prone conditions.
- `pairImageEntries` / `toImgEntries` (`useItemImages.tsx`) — matching `.webp`/`.thumb.webp` pairs by filename.
- `formatPlaceDisplay` / `dedupePhotonFeatures` / `isQueryLongEnough` / `coordsFromFeature` (`usePhoton.tsx`) — geocoding result formatting, de-duplication, and reading the coordinates off a picked suggestion.
- `resolveTranslationKey` (`I18nProvider.tsx`) — dotted-key lookup against the translation tree.
- `restoreAt` (`ItemList/optimistic.ts`) — putting a card back at its old index after a failed delete. Clamping an index against a list that may have changed underneath, with an off-by-one on either side that would drop the card in the wrong place and a negative index that `splice` would silently read as "from the end".
- `dosDateTime` and `assertZipRoom` (`data/zip.ts`) — clamping a pre-1980 date to the epoch instead of letting it wrap, and refusing an archive that would overflow ZIP's 32-bit byte/entry-count fields instead of silently emitting a corrupt file.
- `csvCell` (`data/exportFormat.ts`) — RFC 4180 quoting plus a formula-injection guard that must fire on a leading `=`/`+`/`-`/`@` in user text but never on this app's own numeric cells, where the same leading `-` is just a negative coordinate.
- `exportCategory` (`data/exportCategory.ts`) — the pagination walk, retry/backoff and skip-on-failure loop, driven against injected Supabase/storage fakes; an off-by-one in the page boundary or the backoff math would drop items or hammer a rate-limited endpoint.
- `coordsFromFeature` (`data/photon.ts`) — reading lng-first GeoJSON coordinates and rejecting anything non-finite, the exact NaN check the app's two geocoding callers used to disagree on.
- `exportProgressMessage` (`CategorySelect/useExportCategory.tsx`) — picks the export-phase wording, including the "0 of 0" edge case when a category has no photographs.
- `clampPage` and `pageRange` (`ItemList/paging.ts`) — clamping a page number that has outlived its entries back onto a real page, and the inclusive-range math PostgREST's `.range()` needs so a page is never one row short.
- `getCachedSignedUrl` (`ItemList/imageCache.ts`) — the TTL-minus-safety-margin boundary that decides whether a signed URL is still trusted or must be re-signed.
- `partitionByStoredCoords` (`Map/usePlaces.tsx`) — dedupes place names by first-seen coordinates while rejecting a stored NaN pair that would otherwise draw a pin nowhere and suppress the geocode lookup that would have found it.
- `classifyLocationError` (`Map/useCurrentLocation.ts`) — the exact error-code equality that tells "permission denied" apart from every other way a geolocation fix can fail.
- `coinSizeCss` (`Coin/size.ts`) — the `clamp()` bounds keeping the medallion between a 300px floor and 80% of viewport width.
- `getFocusable` (`CenteredModal/getFocusable.ts`) — the selector list and visibility filter that decide which elements the modal's focus trap will cycle through.
- `useEscapeToClose` (`CenteredModal/useEscapeToClose.tsx`) — the whole hook is left mutation-tested since it's just an event listener; the risk is honoring `defaultPrevented` so a nested widget's own Escape handling doesn't also close the modal around it.
- `normalizePreference` and `resolveTheme` (`useTheme.ts`) — a stored value that is anything but exactly `'light'`/`'dark'` (including the literal string `'system'`) must fall back to system, and `resolveTheme` is what turns that into light or dark.

Stryker is scoped to exactly these ([`web/stryker.config.mjs`](../../web/stryker.config.mjs)), each paired with a `/* v8 ignore start/stop */` + `// Stryker disable all/restore all` block around the surrounding React/effect/Supabase code in the same file. Running mutation testing over the whole `src/app` tree would mean mutating JSX and Tailwind class strings too — thousands of mostly-equivalent mutants, a multi-minute run, and a score that means nothing either way. A short list of small, pure, high-consequence functions runs in seconds and produces a number worth acting on. That speed is why CI runs it on every PR as well as on pushes to `main` (see [`ci.yml`](../../.github/workflows/ci.yml)): it was held back at first on the theory that it was too slow and would flap, but a run that takes about a minute at a score that has been 100% throughout is not a step anyone needs protecting from. Finding out on the PR is the point — learning after the merge that a test asserts nothing is learning it too late.

## Component-level testing strategy (issue #193)

Before this decision, the coverage ratchet only ever exercised pure logic (`data/items.ts`, `Pagination.tsx`, `resolveTranslationKey`, etc.) — components, hooks, and provider internals were deliberately excluded via `/* v8 ignore */` blocks, on the reasoning that rendering-level bugs (like the hydration mismatch fixed in `008d33b`) would surface via manual QA and the post-deploy smoke test instead. That gap is real: no pure-logic unit test could have caught a hydration mismatch.

The decision is to invest incrementally in component/hook testing rather than accept the pure-logic-only ceiling permanently. `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, and `jsdom` were added (`web/vitest.setup.ts`, `web/vitest.config.ts`), and a first batch of presentational components and stateful hooks now have rendering tests: `ui/IconButton`, `ui/Spinner`, `Icon`, `CategorySelect/CategoryText`, `CategorySelect/Buttons`, `Coin/TextRing`, and the `useTheme` hook. The coverage floor's `autoUpdate` picked up the improvement automatically (at the time — `autoUpdate` has since been turned off; see [Configuration](../reference/configuration.md#coverage-and-mutation-thresholds)) (~9% → ~15% lines, as of #193) — this is a starting point, not a target; further components/hooks should keep getting covered incrementally as they're touched, the same way the pure-logic floor already ratchets up.

Two infrastructure gotchas worth knowing if you add more component tests:

- **`window.localStorage` is undefined in jsdom tests without a workaround.** Node 22+ ships its own global `localStorage` (behind `--localstorage-file`), and Vitest's built-in jsdom environment treats any key already present on the Node global as "already provided" and skips overriding it with jsdom's real implementation — see the `globalThis`-patching code at the top of `web/vitest.setup.ts`. Any code under test that touches `window.localStorage`/`sessionStorage` needs that patch in place, which is why it's applied globally in the shared setup file rather than per-test.
- **Testing Library's auto-cleanup doesn't fire** because `vitest.config.ts` doesn't set `test.globals: true`. `web/vitest.setup.ts` explicitly calls `afterEach(cleanup)` so DOM nodes from one test don't leak into the next within the same file — omitting this causes flaky "found multiple elements" failures instead of an obvious error.

## npm audit: what's overridden and what's accepted risk (issue #191)

`web/package.json`'s `overrides` pins three transitive dependencies that `npm audit` flagged and that had a same-major (non-breaking) patched version available:

- `qs` → `6.15.3` (was resolving to a range vulnerable to a `qs.stringify` DoS, GHSA-q8mj-m7cp-5q26), pulled in only via `typed-rest-client`, a dev-tooling dependency never reachable from app code.
- `@babel/core` → `7.29.7` (was `7.29.0`, vulnerable to GHSA-4x5r-pxfx-6jf8) — a dev-only transitive dependency of the Stryker mutation-testing toolchain, never shipped.
- `minimatch` → `10.2.6`, which pulls in an already-patched `brace-expansion@5.0.8`. Before this override, three different major versions of `minimatch` (3.1.5, 9.0.9, 10.2.6) were installed across `eslint`, `typescript-eslint`, and Stryker's dependency trees, each pinning its own `brace-expansion` — two of which (1.1.12, 2.0.3) were inside vulnerable ranges (GHSA-f886-m6hf-6m8v, GHSA-3jxr-9vmj-r5cp, GHSA-mh99-v99m-4gvg). Overriding `brace-expansion` directly (either a blanket version or scoped via `"minimatch@<version>": {...}` / nested-path override syntax) reliably broke `npm audit`'s own advisory correlation — it started reporting a bogus 20-vulnerability cascade across unrelated packages (`eslint`, `serve`, `typescript-eslint`, ...) despite `npm ls` showing the actual resolved tree was correct and `npm run lint` working fine. Overriding `minimatch` itself instead (letting its own `brace-expansion` dependency come along for free) sidesteps that `npm audit` bug entirely and also collapses three separate `minimatch` copies into one deduped install.
  - **If you touch this again**: don't reach for `npm audit fix` here, even the non-`--force` form. On this project it silently reshuffled unrelated transitive versions (observed once toward a `minimatch` release flagged across nearly its entire version range) and made the audit output worse. Prefer targeted `overrides` entries plus `npm install` (not a from-scratch `rm -rf node_modules package-lock.json`, which re-resolves the whole tree against current registry/advisory data and was independently observed to produce a *worse* baseline than the committed lockfile).

What's left after the above — `next`, `postcss`, `sharp` — is accepted risk, not fixed:

- `sharp` (libvips CVEs) and `postcss` (XSS/path-traversal in its stringifier/source-map loader) both come from `next`'s own optional image-optimization dependency chain. The only non-major fix path is `next@9.3.3` — a 7-major-version downgrade `npm audit fix --force` offers, which isn't a serious option.
- Neither is reachable in this deployment: the app is `output: 'export'` with `images: { unoptimized: true }` (`web/next.config.ts`), so Next's server-side image optimizer — and therefore `sharp` — never runs; `postcss`'s vulnerable copy is `next`'s own build-time instance (not the direct `postcss` dependency Tailwind uses), never part of the shipped static output.
- Revisit if a future Next major naturally drops the vulnerable `sharp`/`postcss` versions, or if `next audit` ever shows these as reachable at runtime.
