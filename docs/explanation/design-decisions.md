# Design decisions

Why things are the way they are, where reading the code once would not tell you. For _what_ exists, see the [Architecture reference](../reference/architecture.md).

## Why authorization lives entirely in Postgres RLS

The app is a static export: there is no server runtime, so there is nowhere to put server-side authorization even if we wanted it. Row Level Security is the _only_ place access is enforced, which means the client can be fully trusted with the anon key — it has no more access than the policies grant, whatever the frontend does. A bug in a component can make the UI behave wrong; it cannot leak another user's data.

The consequence for contributors: a client-side check ("only show the delete button if…") is UX, not authorization. The policy is the check, and every new query needs one.

## Why sharing has no public link

Issue #483 asked for sharing a category, a single entry, or a filtered list, with other users or by public link. What shipped is whole-category sharing with named accounts, and the cut was deliberate.

A public link means an anonymous reader. Every predicate here resolves an actual `auth.uid()` or an actual JWT email, both empty for `anon`. Authorizing a link would mean either the first policy that grants `anon` anything, keyed on an unguessable token, or the first server-side code this app has ever had. Either is a materially larger attack surface than extending an owner-only predicate to a second known identity, on a project whose history already includes several RLS-correctness bugs (#292, #387, #335, #290, #386). A link also has no real revocation: once seen or forwarded it cannot be taken back, whereas deleting a `category_shares` row ends a specific person's access immediately.

The `editor` role (#562) widened the grant without touching that argument: sharing is no longer read-only, but it is still _identified_. If public links are ever wanted, they are a separate, explicitly higher-risk piece of work.

## Why the migrations were squashed

Three times: on 2026-08-06 sixteen migrations became a seven-file baseline; in #580 those seven plus the seven that had accumulated since were folded back into `0001`–`0007`; on 2026-09-22 the eight that had followed (`0008`–`0015`, three of them security fixes to `0007`) were folded in again, so each file once more holds one concern. A third of the original statements existed only to undo an earlier file — a table created and dropped, full-text-search columns added and removed, a trigger written three times. Reading them told you the history but not the schema.

Every squash was verified rather than asserted: the local stack was reset from the new files, both databases introspected down to column defaults, constraint expressions, index definitions, function bodies, trigger timing, policy predicates and grants, and diffed. The only differences were local-stack platform defaults no migration sets. Doing it again: [Developer guide](../how-to/developer-guide.md#squashing-migrations-again).

Since the third squash every function lives in `0002_functions.sql`. The `language sql` ones that read tables are created with `check_function_bodies` off, as `pg_dump` restores them, because Postgres would otherwise parse their bodies before `0003_tables.sql` exists; the pgTAP suite calls every one of them, so a broken body still fails CI.

## Why quotas are counted in the database

Any signed-in collector could otherwise create rows and upload 5 MiB objects without end, and on a free-tier project that is the likeliest way to take the app down (#637). There is no server to rate-limit at, so the ceilings live in the database:

| Ceiling | Enforced by |
| --- | --- |
| 1 GiB of full-size photographs per owner | `tg_images_quota()` (`0009`) |
| 50,000 entries per owner | `tg_items_quota()` (`0009`) |
| 1,000 categories per owner | `tg_categories_quota()` (`0016`) |
| 1,000 shares per owner, across all their categories | `tg_category_shares_quota()` (`0016`) |
| 10 categories per entry | `tg_item_categories_quota()` (`0016`) |
| Text: category name 200, title 300, description 10,000, place 500, invited email 320 characters; 50 tags of up to 100 characters | `check` constraints (`0016`) |

A photograph added by an editor lands on the owner's row, so it counts against the owner's quota. The link ceiling is per entry rather than per owner because the entry ceiling already bounds the entries; together they bound the links. The UI files an entry in one category, so no message covers the link ceiling; the form's `maxLength`s mirror the text ceilings, so typing stops before the database would refuse. The text checks are `not valid`: every write since `0016` is checked, but a row already past a limit was left in place rather than failing the unattended deploy, and editing such a row fails until the long field is shortened. Once production holds no row past a limit, a later migration can `validate constraint` each one.

The byte count cannot trust the client, which sends `size_bytes` itself. `tg_images_size_from_storage()` replaces it with the size Storage recorded for the object, which Storage writes before the upload request returns. A row inserted before its object exists counts the bucket's 5 MiB cap, so under-reporting a size buys nothing. The counts are statement-level, so a batch insert is checked once per owner. A refusal carries SQLSTATE `PT507`, which PostgREST turns into HTTP 507, and the app shows a message naming the limit rather than a generic failure.

What this does not bound: bytes uploaded to Storage that never get an `images` row. Policies on `storage.objects` can't sum an owner's usage without scanning the table on every upload, and DDL there is refused. Those objects count as orphans and go in the daily sweep after 48 h.

## Why images are deleted client-side before the database row

Only the Storage API can delete file bytes; SQL reaches the `storage.objects` metadata row and nothing more. So the client removes the objects _first_, then deletes the item or category row. Reversing the order orphans the files with no way to find them again.

A `cleanup_item_images()` trigger used to back this up. It was removed because Supabase's `prevent-direct-deletes` migration guards `storage.objects` with a `BEFORE DELETE ... FOR EACH STATEMENT` trigger that raises `42501` for any session outside the Storage API — statement-level, so it fires even when the delete matches nothing, which is the normal case once the client has already removed the objects. Every item deletion failed. There is no SQL-side backstop available; [`cleanup-orphaned-photos.yml`](../../.github/workflows/cleanup-orphaned-photos.yml) sweeps unreferenced objects daily through the Storage API instead, past a 48 h grace period so nothing still uploading is mistaken for orphaned.

## Why a storage object's path can never change

No update policy exists on `storage.objects` ([`0007_storage.sql`](../../supabase/migrations/0007_storage.sql)), and the grant `postgres` makes there omits `UPDATE`. Storage's own bootstrap grant still carries it and is re-applied on every start, so the missing policy is the control, not the privilege. `move()`, `copy()`-to-self and `upsert` are refused for owner and grantee alike. It took a working exploit to find out why this matters.

The owner-only storage policies key on path segment 1, the uploader's uid. The shared policies cannot — a grantee's uid appears nowhere in `<uid>/<itemId>/<file>` — so they key on segment 2 and join through `item_categories`. The old `"update shared objects"` policy tested segment 2 in both `USING` and `WITH CHECK`, and `UPDATE` is the one verb where those halves describe different rows: an update that rewrote **segment 1** passed both. An editor could move the owner's photo into their own uid prefix. Three controls then failed to reach it — revoking the share (the object now matched the attacker's own-prefix policy), the owner's read (segment 1 was no longer hers, and `has_category_read_access()` excludes ownership), and the sweep (it keyed on segment 2, which the move left intact). The photo was gone, permanently, to an account whose access had been revoked.

Pinning segment 1 would have closed the hole and left a strict subset of `"update own objects"` — a capability nothing uses. `data/images.ts` only ever calls `upload` (never with `upsert`), `remove` and `createSignedUrls`, so dropping the verb costs nothing. `rls.spec.ts` asserts it from both sides.

## Why the orphan-cleanup trigger is statement-level

`delete_item_if_orphan()` removes an item once it belongs to zero categories. The first version ran `FOR EACH ROW`, one `EXISTS` probe per deleted `item_categories` row — deleting a 500-item category meant ~500 sequential lookups. It now runs `FOR EACH STATEMENT` with a transition table, one set-based `DELETE ... WHERE id IN (...) AND NOT EXISTS (...)`. Same logic, one query instead of N.

## Why search uses trigram ILIKE instead of full-text search

Early migrations added `tsvector` columns and GIN indexes. They were dropped because search is a substring match (`ILIKE '%query%'`) across title, description, place and tags, and full-text search was never used — extra storage and write cost for a feature that was not there. `pg_trgm` GIN indexes on each searched column are what `ILIKE '%…%'` needs to avoid a sequential scan.

On their own those indexes only work under `BYPASSRLS`. `texticlike` is not leakproof, and Postgres refuses to evaluate a non-leakproof qual before a relation's RLS qual, so for `authenticated` the planner never chooses them: a rare-term search over a 100,000-item category measured 415.8 ms as a sequential scan, and `enable_seqscan = off` did not change the plan (#621). The catalogue's search therefore goes through `search_category_items()`, a `SECURITY DEFINER` function that re-implements the read-access check itself and queries with RLS bypassed — 24.3 ms on the same term. The map's `list_category_places()` stays `SECURITY INVOKER` and still cannot use them.

The 3-character minimum before a search fires is not about the index: a one- or two-character query matches nearly every row, so firing one per keystroke would cost a full scan for no narrowing. The debounce does the same job for typing speed.

## Why mutation testing is scoped to a list of files

Line coverage answers "did this run," not "would a real bug here have been caught." For presentational components and hooks that mostly orchestrate Supabase calls, the gap barely matters. It matters a lot for pure functions doing string and boundary construction — the PostgREST filter builder, pagination windows, ZIP date packing, CSV formula-injection guards, retry/backoff arithmetic — where a test can execute every line and assert nothing. The list is [`web/mutation-targets.mjs`](../../web/mutation-targets.mjs), shared with `vitest.config.mts`'s per-file coverage floors so the two cannot drift; each entry's own comment says what it guards.

Mutating the whole `src/app` tree would mean JSX and Tailwind class strings too: thousands of near-equivalent mutants, a multi-minute run, and a score that means nothing. A scoped run finishes in seconds and produces a number worth acting on, which is why CI runs it on every PR rather than only on `main` — learning after the merge that a test asserts nothing is learning it too late.

### Incremental on pull requests, full on `main`

Stryker's incremental mode (#714) reuses a mutant's previous result when neither the mutated code nor the tests that covered it changed, diffing both against `web/reports/stryker-incremental.json`. What it cannot see is everything else: a module a target imports without being on the list itself (`supabase.ts`, `data/auth.ts`, the i18n, toast and confirm providers), a test helper, a dependency bump. So CI keys the cached file on `package-lock.json` and the Stryker and Vitest config, and a change there starts from nothing; and `main` runs with `--force`, rerunning every mutant, so the dashboard score is always a full run and `main`'s file is the one every PR restores. A PR that only changes a non-target module a target depends on can pass on a reused result. `main`'s run is where that surfaces, and `npm run test:mutation -- --force` reproduces it locally.

### No suppressions

There is no `Stryker disable` or `/* v8 ignore */` in `src/`. There used to be — around the Supabase query builders, the whole of `useExportCategory`, and a handful of lines carrying mutants nobody could kill. What they hid is now tested: a PostgREST builder composes its request eagerly and only sends it when awaited, so `items.test.ts` reads back the table, filter, method, headers and body each call produced, without a server; the one real call per module (`getSession`, `compressThumb`) has a small test that mocks the module underneath and drives the default. Three suppressed lines turned out to guard code that did not need to exist — a guard for a value the callee accepted anyway, an option that spelled out the library's default, a wrapper every caller unwrapped — which is the ending [TEST_STRATEGY.md](../../TEST_STRATEGY.md) §11 calls the one that pays for the exercise.

### What still survives, and why no test can kill it

React compares a dependency array against the **previous render's** array element by element. Stryker's `ArrayDeclaration` mutator rewrites `[]` as `["Stryker was here"]` in _every_ render, so `prevDeps` and `nextDeps` are the same constant and nothing fires. No input distinguishes the two: every empty dependency list is an equivalent mutant by construction.

Where the memoization those lists guard was not load-bearing, it is gone — callbacks handed straight to elements nothing memoizes earned nothing from `useCallback`. What remains is where identity really is a contract: a mount-only `useEffect`, or a callback another hook lists in its own dependencies. Those survive, deliberately unsuppressed, so the report keeps showing them.

The other class is the **timeout**, which Stryker counts as a kill. Most were avoidable and the fixes were worth having: counters replaced by iteration over the thing being counted (`chunk()`, `attempts()`, the pool's shared iterator); page fakes backed by a finite table so a walk that asks for one page too many gets nothing instead of spinning; and `timeoutMS` raised to 20 s, since with the 5 s default a mutant covered by a few hundred tests was reported as a timeout after failing seven of them honestly. Three remain, each a mutant whose only effect is non-termination: two in `excludePendingDeletes`, whose job is returning the same reference when nothing changed (break that and the effect reading it re-renders for ever — the bug the line prevents), and `readAllPages`' one unbounded walk, which cannot know how many pages it needs.

## Why four functions have property tests

`buildSearchFilter`, `csvCell`, `dosDateTime` and `clampPage`/`pageRange` take
input that is adversarial or unbounded (any search term, any user text, any
date, any page and total), and each has a property that is easy to state: the
filter is always exactly four quoted conditions that match the term literally;
a CSV cell always parses back to the text, apostrophe-guarded exactly when it
would start a formula; a DOS timestamp always decodes to a valid date and
clamps rather than wraps; a page range always holds an entry when there is
one. The generic playbook adopts property testing only after a near-miss;
these were adopted at the maintainer's request (#616) without one. They run
seeded and deterministic, with one dependency (`fast-check`), beside the
example tests, in about two seconds. Everything else keeps example tests
alone: small, enumerable inputs gain nothing from generated ones.

## Why component tests run in jsdom, and two things that bite

Pure-logic tests could not have caught the hydration mismatch fixed in `008d33b`, so components and hooks are rendering-tested with Testing Library (`web/vitest.setup.ts`). Two things to know when adding more:

- **`window.localStorage` is undefined in jsdom without a patch.** Node 22 ships a global `localStorage`, and Vitest's jsdom environment skips overriding any key already on the Node global. `vitest.setup.ts` patches `globalThis`; anything touching `localStorage`/`sessionStorage` relies on it.
- **Testing Library's auto-cleanup does not fire** because `test.globals` is off. `vitest.setup.ts` calls `afterEach(cleanup)` explicitly; without it, DOM from one test leaks into the next as flaky "found multiple elements" failures.

## Why SQL linting runs `core` minus nine rules, and never autofixes

[`.sqlfluff`](../../.sqlfluff) uses the `core` bundle and excludes nine rules, for one reason: a migration is applied history and a pgTAP suite is reviewed SQL, so a finding that only reformats one is churn on security-critical files, not a caught defect. `aliasing.table` and five `layout.*` rules would rewrite every file; `references.special_chars` objects to the quoted policy names, and renaming a policy is DDL against the authorization boundary; `references.keywords` objects to the documented `category_shares.role` column; `references.consistent` would qualify every column reference across applied migrations. What is left — `ambiguous.*`, most of `structure.*`, `capitalisation.*` pinned to `lower` — was clean when adopted and still earns its place on new SQL. Only `sqlfluff-lint` runs as a hook, never `sqlfluff-fix`.

## Why read policies take the caller's grants as one set

A grantee's read used to call `has_category_read_access(category_id)` on every row, and twice per entry, since the `items` policy reads `item_categories` under that table's own policy. The function pins `search_path`, and PostgreSQL never inlines a function with a `SET` clause, so each row paid a full call and an index probe into `category_shares`. The k6 `shared-viewer` run measured it: 300 shared entries browsed slower than the owner's 10,000, and at the `peak` profile p95 passed 9 s with 3.6% of requests failing. `0017` has every read policy ask `granted_category_ids()` instead, a set evaluated once per statement and probed per row, and `has_category_read_access()` is defined on the same set, so what a grant is (email, expiry) is written once. Ownership stays outside the set for the same reason it stays outside the read predicate. `075_query_plans_test.sql` fails if a read plan calls `has_category_read_access()` again.

## Why the map and search RPCs are plpgsql

Postgres 17 plans a SQL function's body without its argument values, so `category_id = cat_id` was costed on an average category. In the load test's `peak` run a 1,000-entry shared category was read by scanning all 26,000 links, 10,936 times. `0018` makes both RPCs plpgsql with `plan_cache_mode = force_custom_plan`: each call is planned with the category it names, as the SQL functions were already re-planned on every call, so planning costs nothing extra. The query text is unchanged, and `075_query_plans_test.sql` plans that same text with literal arguments, which is now also what runs.

## Why load testing is manual and local by default

Collections are personal-scale, one owner each, with no throughput SLA, and a load number measured against a Free-tier project or a CI runner measures the hosting tier (TEST_STRATEGY.md §12). So the k6 scripts (#662) are a measurement a person asks for, never a gate. The default target is a Supabase stack started inside the workflow run, because there is no staging and the only other backend is production, shared with real collectors. The hosted target exists behind two switches and currently cannot sign in ([Load testing](../how-to/load-testing.md#the-hosted-target-and-why-not)).

What would regress under load is gated deterministically instead: `075_query_plans_test.sql` (#704) asserts that each index-backed query can reach its index and, at a realistic row count, picks it. A plan assertion costs milliseconds and fails the PR that broke it; a load test would only show a slower number later.

## npm audit: what's overridden and what's accepted risk

`web/package.json`'s `overrides` pin transitive dependencies that `npm audit` flagged and that have a same-major patched version:

- `qs` → `6.16.0`, via `typed-rest-client` and `@lhci/cli`'s `express` (GHSA-q8mj-m7cp-5q26, GHSA-x5fp-wj9c-mxmx). Dev-only.
- `@babel/core` → `7.29.7` (GHSA-4x5r-pxfx-6jf8). Stryker's toolchain, never shipped.
- `minimatch` → `10.2.6`, which brings a patched `brace-expansion`. Three `minimatch` majors used to be installed across `eslint`, `typescript-eslint` and Stryker, two with vulnerable `brace-expansion` ranges. Overriding `brace-expansion` directly broke `npm audit`'s own advisory correlation into a bogus 20-vulnerability cascade; overriding `minimatch` sidesteps that and dedupes the install.
- `sharp` → `0.35.4` (GHSA-rgj7-g3m4-5g8c), in range of `next`'s own `optionalDependencies`. It was accepted risk while the only fix was a 7-major `next` downgrade; a same-range patch shipped later. Check for that before assuming a downgrade is the only option.
- `eslint` → `$eslint` (the direct ESLint 10) under `eslint-plugin-import`, `eslint-plugin-react`, `eslint-plugin-react-hooks` and `eslint-plugin-jsx-a11y` (#722). The installed releases declare peer ranges that stop at ESLint 9, and `eslint-config-next` pulls in the first three. Without the override, every `npm ci` prints `ERESOLVE overriding peer dependency`. The accepted risk: a rule that silently stops reporting under ESLint 10 would look like a clean lint run. Revisit when a plugin widens its `eslint` peer range, and drop that entry. `eslint-plugin-react-hooks` already has: `7.1.1`, inside `eslint-config-next`'s range, supports ESLint 10, but its `set-state-in-effect` rule reports three existing hooks (`usePhoton`, `useItems`, `I18nProvider`), so moving to it is its own change.
- No `typescript-eslint` entry. It once repeated the direct dependency's literal range, which npm refuses as soon as Dependabot bumps the direct one (#721). `eslint-config-next`'s range dedupes to the one copy without it.
- `tmp` → `0.2.7` and `uuid` → `^14.0.2`, from `@lhci/cli` (#651). Both dev-only, reached only by `lhci open`, which this project never runs; the calls each package makes stayed source-compatible, checked against the installed packages.

Accepted risk: `extract-zip` (GHSA-jmr9-qjv8-65gv, GHSA-7pqw-9j4j-h8q3), unresolved upstream, four levels under `@lhci/cli`. Only `@puppeteer/browsers`' Chrome-download path calls it, and this project's Lighthouse config points at the runner's or Playwright's existing Chrome, so that path never executes. Revisit if `@lhci/cli` moves past `lighthouse@13.3.0` / `puppeteer-core@24.43.1`.

**Do not run `npm audit fix` here**, not even without `--force`: it reshuffled unrelated transitive versions and made the audit output worse. A from-scratch `rm -rf node_modules package-lock.json && npm install` re-resolves the whole tree against current advisories and was observed to produce a worse baseline than the committed lockfile. Add a targeted `overrides` entry and run `npm install`.
