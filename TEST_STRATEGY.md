# Test strategy

What testing this repository needs, at which level, for which risks, and when it runs.

**This document is mandatory.** CLAUDE.md's first hard guardrail requires it to be read at the start of every task in this repository — implementation, refactor, bug fix or test work — and followed. It decides which layer a behavior is tested at, what may be mocked, and which gates a change clears. Disagree with it in the open and get agreement; don't depart from it quietly.

This is a working document, not a survey of testing in general. Everything in it is derived from what is actually in this repository: a static export with no server, a Postgres database that is the only thing enforcing authorization, and an unattended deploy that pushes migrations to production on merge. Where a common practice is not justified here, it says so and why.

Read alongside [docs/reference/architecture.md](docs/reference/architecture.md) (what exists) and [docs/explanation/design-decisions.md](docs/explanation/design-decisions.md) (why). [CONTRIBUTING.md](CONTRIBUTING.md) has the commands; this file has the reasoning behind them.

---

## 1. Purpose

To keep the confidence-per-test high and the feedback loop short, by putting each check at the cheapest level that would actually catch the failure it is aimed at.

The document exists because this repository has one property that changes the usual calculus: **there is no server**. Authorization is not layered — if a Row Level Security policy is wrong, nothing else catches it, and the interface looks identical while showing somebody else's collection. That single fact determines most of what follows.

It also names, deliberately, where the estate is currently thin. A strategy that only describes what is already green is not a strategy.

---

## 2. System testing context

### What is actually deployed

| Piece | What it is | Testing consequence |
| --- | --- | --- |
| `web/` | Next.js 16, `output: 'export'`, React 19, Tailwind 4 | No server runtime, no route handlers, no server-side authorization to test. The deployable is a folder of static files served under `/CollectionBuddy`. |
| GitHub Pages | Static host | Deployment failures are path failures (base path, icon 404, stale CDN asset), not runtime failures. They need a real fetch against the deployed origin to find. |
| Supabase Postgres 17 | 5 tables (`categories`, `items`, `item_categories`, `category_shares`, `images`), 15 functions, 10 triggers, ~15 indexes | Behaviour lives in SQL: normalization triggers, ownership triggers, a statement-level orphan sweep, generated columns. None of it is reachable from a unit test. |
| Postgres RLS | `supabase/migrations/0006_policies.sql`, `0007_storage.sql` | The entire authorization boundary. |
| PostgREST | Auto-generated REST API over the schema | There is no hand-written API to contract-test. The schema *is* the contract, and `database.types.ts` is the client's copy of it. |
| GoTrue | Google OAuth only (plus anonymous sign-in, local demo builds only) | Sign-in cannot be driven in CI. Sessions are minted through the auth API instead. |
| Supabase Storage | One private bucket `item-images`, 5 MiB/file, three image MIME types | Bytes cannot be deleted from SQL. Object paths (`<uid>/<itemId>/<file>`) are load-bearing for authorization. |
| `photon.komoot.io` | Third-party geocoder, called from the browser | Outside our control, allowed by CSP `connect-src`. Never called from a test. |
| `*.tile.openstreetmap.org` | Third-party map tiles | Same. |
| GitHub Actions | CI, unattended production deploy, daily storage sweep, daily keepalive | Holds `service_role`, `SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`. The highest-privilege code in the project is bash inside YAML. |

There is **no staging environment**. `pages-deploy.yml`'s `migrate` job applies pending migrations directly to production on every push to `main`. CI is the only thing between a migration and the live database.

### What the test estate is today

| Suite | Location | Volume | Runtime target | Where it runs |
| --- | --- | --- | --- | --- |
| Unit / component | `web/src/**/*.test.{ts,tsx}` | ~79 files, ~850 cases | Seconds. Treat over ~60s as a problem to fix. | Pre-commit hook, every PR, local |
| Signed-out browser | `web/e2e/public/` | 5 specs, ~30 cases × 2 viewports (Chromium desktop, Pixel 7) | Low minutes | Every PR, and again against the live site post-deploy |
| Signed-in integration | `web/e2e/signed-in/` | 9 specs, ~69 cases, needs a real Supabase stack | Low minutes + stack start | `e2e_local_stack` job, local via `npm run e2e:local` |
| Mutation | Stryker over 22 files (`web/mutation-targets.mjs`) | ~273 mutants | ~1 minute (documented) | Every PR and push to `main` |
| Repo hygiene | `.pre-commit-config.yaml` | `typos`, `zizmor`, `shellcheck`, `markdownlint`, file checks | Seconds | Gates every other CI job |
| Schema contract | `ci.yml`, `e2e_local_stack` | 1 diff | Seconds | Every PR |
| Post-deploy smoke | `e2e/public/` against the live URL | Same ~30 cases | Low minutes | Every deploy |

This is a mature estate. The work described below is mostly about **closing named gaps and holding the line**, not about building a test suite from nothing.

### Trust boundaries

1. **Browser bundle → PostgREST / Storage.** A user's JWT crosses it. Everything on the far side is enforced by RLS and triggers. Anyone can read the bundle, take the anon key, and issue arbitrary requests — so the only meaningful test of this boundary is one that does exactly that.
2. **Owner → grantee (`category_shares`).** A second identity reaching into someone else's category, at one of two roles. The `editor` role is the most permissive grant the schema can issue.
3. **`anon` → everything.** Denied by RLS on every table, since `auth.uid()` and `auth.jwt()` are both null there, and denied a second time on all five by an explicit `revoke` (`category_shares` joined that list in `0011_least_privilege_grants.sql`; before it, the select there was refused by `anon` lacking `EXECUTE` on `caller_email()` rather than by the table grant). Both halves need asserting; they fail differently — a revoked grant is `42501` before any predicate runs, a policy filter is an empty result.
4. **CI workflow → production.** `SUPABASE_DB_URL` and `service_role` live here. Not covered by any test; covered by `zizmor`, pinned action hashes, and review.
5. **App → third-party HTTP** (Photon, OSM tiles). Always faked in tests; never reached.

---

## 3. Testing principles

1. **Authorization is not testable from the client.** A component test asserting that a button is hidden proves a UX property, nothing more. Authorization tests hold a real token and talk to a real Postgres.
2. **Never mock the thing that carries the risk.** Mocking supabase-js tests our call shape, which is fine and cheap — it is not a test of RLS, triggers, constraints, or PostgREST behaviour.
3. **Coverage is a signal; mutation score is a stronger one.** Line coverage says the line ran. For pure, high-consequence logic, that is close to worthless on its own, which is why a short list of files carries both a 100% coverage floor and mutation testing.
4. **Prefer the lowest level that gives the same confidence.** Pagination math is a unit test. The *fact that the grid paginates* is one E2E case, not fourteen.
5. **Deterministic or deleted.** Playwright runs with `retries: 0` locally and in CI (the deployed target is the one exception, where a retry distinguishes a broken deploy from a dropped connection). A flake is a defect in the test or the code, not weather.
6. **Test the failure paths.** Export and import both skip-and-continue on a failed photograph, retry with backoff, and can be cancelled. Those are the paths that carry data loss, and they are the ones worth injecting failures into.
7. **If it is hard to test, fix the design.** Every file in `mutation-targets.mjs` earned its place by having its pure logic pulled out from the I/O it sits beside. That is the pattern: extract, then test the extract — not fake the world.
8. **Fixtures may not out-privilege the app.** The signed-in suite seeds through the user's own session; `service_role` opens exactly one door (creating the user). A fixture that can set up a state the app could not reach is a fixture that hides bugs.
9. **One new behaviour, one new assertion at one level.** Duplicated coverage at three levels costs three times as much to maintain and catches the bug once.

---

## 4. Risk model

Ranked by expected cost, not by likelihood alone. "Cheapest meaningful test" is the level below which the risk is genuinely not covered.

| # | Risk | What it costs | Cheapest meaningful test | Status |
| --- | --- | --- | --- | --- |
| R1 | **Cross-collection read/write** — a policy stops holding | Silent, total confidentiality failure. The UI looks fine. | Integration: real token, real Postgres, bypassing the UI (`e2e/signed-in/rls.spec.ts`) | Covered for owner-vs-stranger and viewer grants |
| R2 | **`editor` grant reaches too far** — an editor renames/deletes the category, manages shares, promotes itself, or writes outside the shared category | Privilege escalation between two real accounts | Same level as R1, with a second identity holding an `editor` grant | Covered — `rls.spec.ts`, on `Leihgabe` |
| R3 | **Photograph orphaning / data loss on delete** | Storage bytes with no way to find them, or an entry that loses its photos | Unit for the ordering (delete bytes *then* row); integration for the cascade | Covered by `photos.spec.ts` + unit; the sweep's predicate is verified against a real database, and has a dry run |
| R4 | **A migration that cannot apply to production** | Deploy blocked, or worse, half-applied ordering | `supabase start` in CI applies every migration from scratch | Covered from-scratch; **not** covered against a populated database — see §8 |
| R5 | **Client/schema drift** (`database.types.ts` vs. reality) | Runtime `PGRST204`s after deploy | The generated-types diff in `e2e_local_stack` | Covered |
| R6 | **Search-term injection into PostgREST's `or=()` grammar** | A search term parsed as filter structure | Unit + mutation on `buildSearchFilter`, plus adversarial-input E2E cases | Covered at both levels |
| R7 | **CSV formula injection in an export** | A spreadsheet executing a collector's text | Unit + mutation on `csvCell` | Covered |
| R8 | **Corrupt archive on export** (ZIP 32-bit overflow, pre-1980 dates) | An archive that will not open | Unit + mutation on `zip.ts` | Covered |
| R9 | **Static-export deployment faults** — base path, icon 404, manifest scope | A site that 404s everything after a green CI run | Serve the built export under the real base path in a browser; repeat against the deployed origin | Covered (`e2e/public/`, `smoke_test`) |
| R10 | **In-tab request races** — a stale search response overwriting a newer one; an expired signed URL | Wrong data shown, broken images | Unit on `useRequestSequence`, `imageCache`, `paging` | Covered |
| R11 | **Duplicate/repeated operations** — a retried photo upload, a re-run import | Duplicate objects or categories | Unit with injected fakes | Partly covered — see §8 |
| R12 | **Third-party outage** (Photon, OSM tiles) | Degraded map/autocomplete | Unit on the error branch. Not worth an integration test. | Covered |
| R13 | **Availability** — free-tier project auto-pause | The app is simply down | `keep-alive.yml` (a mitigation, not a test) | Mitigated, unmonitored |
| R14 | **Workflow logic faults** — the orphan sweep deleting the wrong objects | Irreversible deletion of live photographs, using `service_role` | Nothing cheap exists; it is bash + SQL in YAML | Mitigated — dry run, plus the review rules in §12 |
| R15 | **Capacity / throughput** | Slow list or search | Index design + `explain`, not a load test. Single-user-per-collection app. | Not justified as a test |

---

## 5. Test layers

### Classification

| Layer | Verdict | Why, for this repository |
| --- | --- | --- |
| Unit (pure functions) | **Required** | Where most of the logic that can be wrong in an interesting way lives, once extracted from I/O. Fast, deterministic, and the only level where mutation testing means anything. |
| Component / hook (Testing Library + jsdom) | **Required** | Rendering-level faults (a hydration mismatch, a missing `aria-*`, a disabled control) are invisible to pure-logic tests. Deliberately adopted in #193; keep extending it as files are touched. |
| Integration against real Postgres/Storage | **Required** | The only level at which RLS, triggers, constraints, generated columns and PostgREST behaviour exist at all. Non-negotiable here. |
| Service integration (managed services, local stack) | **Required** | GoTrue session minting, Storage signed URLs, MIME/size limits. All are real behaviour the app depends on and none of it is in our code. |
| API testing | **Required, but not a separate suite** | PostgREST is generated from the schema; there is no hand-written endpoint. API testing here *is* the integration suite, issuing PostgREST calls directly. |
| Contract testing | **Required in one narrow form; Pact-style is not justified** | The one real contract is schema ↔ `database.types.ts`, and CI already regenerates and diffs it. There are no independently deployed services to run consumer/provider verification between. |
| Authorization / security testing | **Required — highest priority** | See §7. |
| Property-based | **Recommended, narrowly** | See §10. |
| Mutation | **Required, scoped** | See §11. |
| E2E (browser, full stack) | **Required, deliberately small** | See §9. |
| API fuzzing | **Not justified as tooling; required as targeted adversarial inputs** | There is no bespoke API to fuzz. Fuzzing PostgREST tests Supabase's product. What *is* ours is what we put into a filter string, a CSV cell, or a ZIP header — covered by unit tests with hostile inputs and by mutation testing. |
| Concurrency testing | **Required at unit level only** | The concurrency that exists is in-tab (superseded requests, bounded upload/download pools), not multi-writer. Two users writing the same row is not a scenario this data model produces. |
| Load testing | **Not justified** | Collections are personal-scale, the app is one user per collection, and there is no throughput SLA. Capacity work belongs in index design and `explain`, not in a load harness. |
| Resilience / failure injection | **Required at unit level; optional above it** | Export/import retry, backoff, skip-on-failure and cancellation are driven through injected fakes today. Injecting failures into the real stack adds cost without adding much signal. |
| Infrastructure / deployment testing | **Required** | Two concrete forms already exist: every migration applied from scratch in CI, and the built export served under its real base path. Both are deployment tests wearing other names. |
| Smoke testing | **Required** | `smoke_test` runs the signed-out suite against the deployed origin. Prerendering in Node with real env vars masks failures that only exist as a bundle in a browser. |
| Production synthetic testing | **Optional** | The post-deploy smoke run is the synthetic, and it is enough. A scheduled signed-out probe would mainly catch a free-tier pause, which `keep-alive.yml` already prevents. Do not point anything signed-in at production. |

### Who owns which behaviour

| Behaviour | Owning layer | Not this |
| --- | --- | --- |
| Search-filter escaping, pagination windows, ZIP headers, CSV quoting, theme resolution, translation lookup | Unit + mutation | Do not re-assert this through the browser |
| Rendering, disabled states, focus trapping, keyboard paths, `aria-*` | Component (Testing Library) | Not E2E, unless the journey depends on it |
| Normalization, ownership rewriting, orphan sweep, constraints, cascades, generated columns | Integration (real Postgres) | Not unit — none of it exists in JS |
| Row/object visibility, grant scope, grant expiry, revocation, `anon` denial | Integration, as a second identity | **Never** from client code or a component test |
| `database.types.ts` ↔ schema | Contract diff in CI | Not a hand-written assertion |
| Base path, icons, manifest, service worker, CSP, framebusting | Signed-out browser suite, plus source-text assertions for the inline scripts | Not unit alone — the inline scripts run before React exists |
| One complete user journey (add an entry, photograph it, find it, export it) | E2E | Not one E2E case per field |
| Migration applicability | CI `supabase start` | Not review-by-eye |

---

## 6. Architecture-specific strategy

### The shape of the pyramid here

It is not the usual pyramid. The middle band is unusually load-bearing, because authorization and a large share of the business rules live in SQL and do not exist anywhere a unit test can reach them.

```text
Layer                             Roughly today   Runs against
--------------------------------  --------------  --------------------------------
Unit + component                       ~850       jsdom, fakes; 22 files mutation-scored
API-level integration                   ~25       real Postgres + Storage, real JWTs,
  (rls.spec.ts + storage assertions)               no browser — ~2/3 of it authorization
Browser, signed-in journeys             ~37       real stack, real bundle
Browser, signed-out                     ~30       built export, ×2 viewports; also post-deploy
```

Treat this as the shape to hold, not an accident. Two ways it goes wrong: new policies landing without the API-level band growing (authorization drifting out of test), or the browser bands growing to assert things a unit or component test could have settled (slow, flaky, and expensive to maintain). Watch the first ratio in particular — it is the one that fails silently.

### What must be real, and what may be faked

| Thing | In unit/component tests | In the integration suite |
| --- | --- | --- |
| Supabase client (`supabase.ts`) | Faked. Injected as a parameter wherever a module was designed for it (`exportCategory.ts`, `importCategory.ts`), otherwise module-mocked. | **Real.** A `createClient` per identity, carrying that identity's token and nothing else. |
| Postgres, RLS, triggers | Absent — do not simulate them | **Real.** This is the point of the suite. |
| Storage | Faked | **Real**, including MIME and size enforcement |
| Auth / sessions | Faked | **Real** GoTrue, session minted through the admin API and written to `localStorage` |
| `browser-image-compression` | Faked (it needs a Worker) | Real, in the browser half |
| Photon, OSM tiles | **Always faked** | Always faked. Never reach a third party from a test. |
| `crypto.randomUUID`, `Date.now` | Injected or stubbed | Real |
| `service_role` | Never | **Only** to create the test users. Never to seed rows. |

### Managed-service boundaries worth explicit attention

- **Function/runtime boundary** — none. There are no Edge Functions, no serverless handlers. If one is ever added it becomes the first server-side authorization surface in the project and needs its own section here before it ships.
- **Database-level security policies** — §7.
- **Managed storage** — object paths carry authorization meaning (`<uid>/<itemId>/<file>`). A path that does not parse must make one policy *not match*, not abort the statement; `storage_item_id()` exists for exactly that, and it is worth a direct test.
- **Eventual consistency** — PostgREST serves from a cached schema. A newly added column is invisible until `notify pgrst, 'reload schema'`. The `migrate` job sends it unconditionally; a migration applied by hand needs it too. This is the one "eventual consistency" failure mode in the system and it is a deploy-time concern, not a test-time one.
- **Throttling / row caps** — `max_rows = 1000` silently truncates an unranged PostgREST response. `images.ts` and `exportCategory.ts` page around it. Page-boundary behaviour is unit-tested with fakes; keep it that way, and keep the page sizes honest (`ROW_PAGE_SIZE`, `ITEM_PAGE_SIZE`).
- **Partial failure** — a thumbnail upload may fail while the full-size one succeeded; `path_thumb` goes null and the entry survives. That is a deliberate accepted failure, and the test for it belongs at unit level with an injected failing upload.
- **Duplicate invocation / idempotency** — see §8.
- **Local emulation vs. deployed** — the local stack *is* the real Postgres, GoTrue and Storage, in containers, at a pinned CLI version (2.110.0, matching what `db push` uses in production). It is not an emulator. Treat integration results from it as trustworthy; treat Pages-specific behaviour (base path, CDN) as only provable against the deployed site.

---

## 7. Security and authorization testing

**This is the highest-value testing in the repository.** The project's own history includes several RLS-correctness bugs (#292, #387, #335, #290, #386), and there is no second layer to catch the next one.

### Rules

1. Every authorization test holds a **real access token for a real identity** and issues requests **directly**, not through the interface. `e2e/signed-in/rls.spec.ts` is the executable form of the security model; the bulk of it deliberately bypasses the UI.
2. Every test needs **at least two identities**. A single-user suite makes only requests the policies are supposed to allow, so it cannot notice a broken policy.
3. Assert on the **mechanism, not just the outcome**. An empty result and a `42501` mean different things: the first says a policy filtered the row, the second says the grant never existed. Both are asserted for `anon` today; keep that distinction.
4. Assert that a **satisfiable** filter returns nothing. `select where user_id = <theirs>` returning `[]` is a much sharper signal than an unfiltered read that happens not to contain their row.
5. Write-side tests must **read back as the owner**. A policy that accepts a write while hiding it on read is the worst outcome, and only the owner's own read can rule it out.
6. Both **mirrored surfaces** need covering. `images` (a row naming an object) and `storage.objects` (the bytes) are separate authorization surfaces with separate policies and separate join paths — the table joins `item_categories` by `item_id`, storage parses an id back out of a path. A test against one proves nothing about the other.
7. Grants must be tested **in both directions**: that an active grant opens exactly what it should, and that revocation and expiry close it again with the object still present — otherwise the test only proves the thing stopped existing.

### The `editor` role (R2)

`0003_tables.sql` allows `role in ('viewer', 'editor')`. An `editor` grant reaches further than anything else in the schema: `has_category_write_access()` lets a non-owner update and delete items in someone else's category, insert `images` rows against someone else's item, link items into someone else's category, and read and write objects under someone else's uid prefix.

This was the estate's largest hole for as long as `rls.spec.ts` created grants through a helper that omitted `role` — every share it tested took the `'viewer'` default, and its "the grant does not extend to writing" case asserted a property true of viewers and false of editors. The helper now takes a role, that case is named `a viewer grant does not extend to writing`, and the describe block `a category shared at the editor role` covers the grant itself, on `Leihgabe` — a collection of its own, so the viewer cases on `Münzen` stay undisturbed.

What it asserts, with the second seeded collector holding the grant:

- An editor **can**: edit and delete the owner's entries in the shared collection; file an entry of its own into it; upload, sign and delete a photograph of a shared entry, and insert and delete its `images` row.
- An editor **cannot**: rename or delete the collection; promote itself; issue a grant of its own; reach a collection it was not granted; write once the grant has been revoked or has expired — both asserted with the entry still present, so it is the grant being tested and not a row that stopped existing.
- An editor **may** delete its own share. That is the grantee leaving, which `"delete own or invited category_shares"` covers deliberately; it ends its own access and touches nobody else's.

One asymmetry is asserted because it is easy to mistake for a bug and must stay a decision: `has_category_write_access()` bundles category ownership in, `has_category_read_access()` does not (`0006_policies.sql:60-65`). The consequence, executed rather than assumed, is that **owning a collection does not reveal an entry an editor merely filed into it** — the owner never held a grant on that entry, and holding the collection is not one. An earlier draft of this section claimed the opposite; the policy has always behaved this way.

The existing `editor` tests (`useShares.test.tsx`, `Sharing.test.tsx`, `ItemList/index.test.tsx`) assert that the client sends the right call and enables the right button — UX, by this repository's own rule, not authorization. They are not a substitute for the above.

### Standing rule for schema changes

Any PR touching `supabase/migrations/**` in a way that adds or changes a policy, grant, or ownership-affecting trigger must add or extend a case in `rls.spec.ts` in the same PR, and say in the commit message and PR description what it now allows or denies. A migration with no matching assertion is an unreviewed change to the only security boundary in the product.

### Out of scope, deliberately

- Penetration testing of Supabase itself.
- Anything that would need an anonymous share link — ruled out by design (see design-decisions.md); if it is ever built it is a new, higher-risk boundary needing its own model.
- Secret scanning beyond the `detect-private-key` hook and GitHub's own tooling.

---

## 8. Integration strategy

### Setup that must not be weakened

- **Seed as the user, never as `service_role`.** That role holds no grant on these tables; the service key creates the user and nothing else. A fixture that bypasses RLS can construct states the app cannot reach and will hide real policy bugs.
- **One scratch category per writing spec.** Specs run in parallel against one database. `Münzen` and `Briefmarken` are read-only fixtures; `Werkstatt`, `Fotostudio`, `Exportarchiv` and `Leihgabe` belong to the specs that write — the last to `rls.spec.ts`'s editor cases, which edit and delete what they find there. A test that writes into a collection another spec is counting makes both flaky, at random.
- **Clean up in `finally`.** Probe rows and probe objects must not survive a failed assertion — the next spec may be counting.
- **The suite fails on a console error.** `e2e/signed-in/test.ts` fails any test where the page threw or logged an error, which is what catches a rejected query behind a passing assertion. Keep it.

### Migrations against a populated database (R4)

CI applies every migration to an **empty** database (`supabase start`). Production applies only the *pending* ones to a database **full of rows**. Those are different operations, and the second is unattended.

A migration that adds a `not null` column without a default, a unique index existing rows violate, or a `check` constraint existing data fails, passes CI and fails in production. The blast radius is contained — `build` declares `needs: migrate`, so a failed push leaves the previous bundle serving the unchanged schema — but it fails in the worst place to discover it.

**Policy:** for any migration that alters an existing table or adds a constraint or index to one, verify it locally against a database that already holds rows (`supabase db reset`, seed, *then* apply the new file) before opening the PR, and say in the PR description that you did. This is a review-enforced practice, not an automated gate, because automating it means committing a production-shaped seed and maintaining it.

### Idempotency and repeated operations (R11)

Operations that can be repeated, and what is true of each today:

| Operation | Repeat behaviour | Covered? |
| --- | --- | --- |
| Import the same archive twice | Creates a **second category**, deliberately. `manifest.items[].id` is carried for a future merge identity but nothing reads it that way. | Documented; assert it, so it stays a decision rather than a discovery |
| Photo upload retry (`uploadWithRetry`, 3 attempts) | Retries the **same path**. Every Storage failure is treated as retryable, so a retry after a partially-succeeded upload hits an object it cannot overwrite — there is no update policy on `storage.objects` — and the photograph is skipped, leaving the written object to the sweep | Covered — `importCategory.test.ts`, with a fake that writes before failing |
| `createShare` for an existing `(category, email)` | Refused by `category_shares_category_email_unique` — re-sharing is a no-op, not a second grant with a different expiry | Assert at integration level |
| Revoke, then revoke again | Second delete affects zero rows | Trivially safe |
| `delete_item_if_orphan` on a repeated statement | Set-based and guarded by `not exists`; safe to re-run | Covered by cascade tests |
| The daily orphan sweep | 48h grace period is the whole idempotency story — it must never race an in-flight upload | See §12 |

### What integration tests should *not* do

Re-test pure logic that already has unit and mutation coverage. If pagination arithmetic is wrong, `paging.test.ts` says so in milliseconds; making the same point through a browser and a database costs a hundred times more and fails less clearly.

---

## 9. E2E strategy

Two suites with different jobs, and the split matters:

**`e2e/public/`** — everything in it must hold for a **signed-out visitor**. That is what makes it safe to run against production after every deploy. It covers what only a real browser and a real deploy can show: the base path, the manifest and every icon it advertises, the service worker, theme and language resolution before hydration, the login page's layout on desktop and on a phone. Nothing signed-in may ever be added here.

**`e2e/signed-in/`** — the critical journeys, against a real stack. Keep it to journeys and to things that genuinely cross the whole system:

- Open the catalogue signed in; a category shows exactly its entries, newest first.
- Create, rename and delete a category.
- Add an entry, edit it in place, delete it; normalization visible as the database performed it.
- Search narrows the grid on title, description, place and tag, and survives hostile characters (`%`, comma, quote, parenthesis).
- Photograph an entry: stored as a full/thumb pair under the owner's prefix, still there on the next visit, removable, and gone when the entry goes.
- The map draws a pin per placed entry and follows the search.
- Export a category and get an archive containing the manifest, the CSV and the photograph.
- Sign out, and the catalogue does not come back on reload.

That is roughly where the suite already sits. A UI change still ships with an E2E test — that is standing repository policy (CLAUDE.md) and this document does not relax it. What it does say is **where the rest of the assertions go**: the journey gets its browser case; the field-level details around it (disabled states, validation wording, focus order, every branch of a form) belong in component tests, where they run in milliseconds and fail legibly. Adding a *second* browser case for the same journey should feel expensive.

Two conventions worth keeping: mobile is a **target project** (Pixel 7), not a variation, because most layout faults in this project have been phone-only; and `expectTitles()` polls rather than reading the grid once, because search debounces and then waits on a round trip — an immediate assertion asserts on the previous answer.

---

## 10. Property-based testing strategy

**Recommended, narrowly. Not currently present, and not urgent.**

Most of this codebase's pure functions have small, enumerable input spaces that example-based tests already cover exhaustively, and mutation testing already proves those examples are load-bearing. Property-based testing earns its place only where an input space is genuinely adversarial and a property is easy to state:

| Candidate | Property |
| --- | --- |
| `buildSearchFilter` (`data/items.ts`) | For any string, the result parses as exactly four PostgREST conditions — no input can add a fifth or escape the quoting |
| `csvCell` (`data/exportFormat.ts`) | For any string, parsing the cell back per RFC 4180 yields either the input or the input prefixed with one `'`, and the parsed value never begins with `=`, `+`, `-` or `@` |
| `dosDateTime` (`data/zip.ts`) | For any date, the packed value decodes to a valid DOS date and never wraps below the 1980 epoch |
| `clampPage` / `pageRange` (`ItemList/paging.ts`) | For any page and total, the resulting range is non-empty, within bounds, and inclusive-correct |

Conditions if it is adopted: a **seeded, deterministic** runner (a recorded failing seed must reproduce); one dependency only (`fast-check`); properties live beside the existing example tests, they do not replace them; and it must stay inside the unit suite's time budget. Given this project's "every line has to earn its place" and "minimal dependencies" rules, adding the dependency needs a concrete reason — a near-miss in one of the functions above is a good one. Speculative adoption is not.

---

## 11. Mutation testing strategy

**Required, and the scope is a settled decision** — see design-decisions.md. Do not widen it without reproducing the reasoning.

- Scope is exactly `web/mutation-targets.mjs` (22 files), shared with `vitest.config.mts`'s per-file 100% coverage floors so the two lists cannot drift.
- Every file in that list pairs pure exported logic with a `// Stryker disable all` + `/* v8 ignore */` region around the I/O beside it. Those regions are load-bearing: a score read without them is not the number you think it is.
- Mutating the whole `src/app` tree means mutating JSX and Tailwind class strings — thousands of near-equivalent mutants, a score that means nothing, and a run nobody waits for.
- Adding a file to the list means first drawing that line inside it. If a file cannot be split that way, the file is the problem.
- An equivalent mutant (a check the type system needs but the runtime cannot reach) is marked `// Stryker disable next-line all` **with a comment saying why**. Never a test that cannot fail.
- CI runs it on **every PR**, not just `main`. Learning after the merge that a test asserts nothing is learning it too late.

Score has been 100% against a `break` of 90. §14 explains why the threshold stays at 90.

---

## 12. Performance and resilience testing

### Performance

**No numeric performance gate is justified here.** There is no throughput SLA, collections are personal-scale, and a synthetic load number against a free-tier Supabase project would measure the tier, not the code.

What replaces it is design-time discipline, per this repo's "measure, don't assume":

- A new query that filters or sorts must name the index that serves it, or add one. Search is four `ILIKE` branches OR'd together and **each one needs its trigram index** — a single unindexed branch collapses the whole query onto a sequential scan.
- A new bulk operation must be set-based. `delete_item_if_orphan()` was `FOR EACH ROW` and was a real O(n) fault at category-deletion scale; it is `FOR EACH STATEMENT` with a transition table now, and must stay that way.
- Anything reading a potentially large set must page. `max_rows = 1000` truncates silently.
- Bundle size and render cost are watched by eye, not gated. If that stops being enough, measure first.

`explain (analyze, buffers)` against the local stack is the tool. A PR that changes a hot query and says nothing about its plan is an incomplete PR.

### Resilience

Failure injection belongs at unit level, driven through the injected fakes these modules were designed for:

- Export: a failed signed-URL batch, a failed photo fetch, retry with backoff, skip-and-continue, and the resulting `skippedPhotoCount`.
- Import: a photo missing from the archive, an upload that fails all three attempts, a thumbnail that fails while the full size succeeds, and cancellation via `AbortSignal`.
- `runPool`: first rejection stops further pickup, in-flight work settles, the error is rethrown once.
- Storage: a failed thumbnail upload leaves `path_thumb` null and the entry intact.
- Delete: bytes first, row second — always. Reversing the order orphans files with no way to find them.

Injecting failures into the real stack is **optional** and mostly not worth it; the interesting branches are all reachable with a fake.

### The orphan-sweep workflow (R14)

`cleanup-orphaned-photos.yml` is the highest-privilege logic in the repository: it fetches a `service_role` key and issues a bulk Storage delete. Its failure mode is irreversible deletion of live photographs.

It is still not worth building a harness for a bash script in YAML, and the three cheap things are now in place:

1. **Reviewed as a database change.** CLAUDE.md's database guardrail names this file, so a change to its query carries the same expectations as a migration.
2. **A dry run.** `workflow_dispatch` takes a `dry_run` input that lists exactly what the sweep *would* delete and exits — before the `service_role` key is even fetched, so a dry run never puts that credential on the runner. It defaults to **true**, so a human clicking "Run workflow" gets the harmless answer unless they ask for the other one; a scheduled run sends no inputs and sweeps normally. This is the one piece of real verification available against the production database, and a change to the query should go through it first.
3. **The invariants are written down** — here and in CLAUDE.md — because the risk is a future edit tidying them away.

What the query must keep:

- **Both `path_full` and `path_thumb`.** A photograph is two Storage objects, `<uuid>.webp` and `<uuid>.thumb.webp`, held in one `images` row. Matching only `path_full` classes every thumbnail in the bucket as orphaned and deletes it. This is not hypothetical: it is what a straightforward reading of the fix for #636 produces, and it was caught by executing the predicate rather than reading it.
- **No cast of a path to `uuid`,** anywhere. A malformed path fails a cast outright and aborts the whole query rather than simply not matching — the same reasoning as `storage_item_id()` in an RLS predicate. Comparing text to text cannot raise.
- **The 48h grace period.** The only thing separating "orphaned" from "mid-upload", since `useItemImages.tsx` writes both objects before inserting the row that names them. Do not shorten it. If the sweep ever needs to run more aggressively, that is a design conversation, not a parameter tweak.

The predicate asks "does any `images` row reference this object", which is what orphaned actually means. It previously asked "does an item with this id exist", parsed out of the path — a proxy that answered wrongly in both directions: it kept an object whose path merely names a live item, and it could never find one whose row insert failed after the bytes landed.

Verified against a real database, with the cases that distinguish the three readings: an object no row references but whose item still exists (**collected**), an object inside the grace period (**kept**), an object referenced as `path_full` (**kept**), one referenced as `path_thumb` (**kept** — the case that fails under a `path_full`-only predicate), a path whose second segment is not a uuid (**collected, without raising**), and an object in another bucket (**untouched**). The plan is two anti-joins, each on its own unique index.

---

## 13. CI/CD execution strategy

### Pull request — the gate that matters

`prek` runs first and gates everything (file hygiene, `typos`, `zizmor`, `shellcheck`, `markdownlint`). It is the fastest check, so a bad JSON file or a stray key fails before spending minutes on browsers and a database. Then, in parallel:

| Job | What it proves |
| --- | --- |
| `build_and_test` | The export builds; types, format and lint hold; unit suite passes with coverage floors; the built export works in a real browser under the real base path, desktop and phone |
| `e2e_local_stack` | Every migration applies to a fresh Postgres; `database.types.ts` matches the schema; the signed-in journeys and **the whole authorization model** hold against a real stack |
| `mutation_test` | The unit assertions on high-risk pure logic are actually load-bearing |

All three are required. The order within `build_and_test` is not decoration: `next build` generates `next-env.d.ts`, which `tsc` and ESLint need on a clean checkout.

### Main

Identical to the PR set (CI runs on `push` to `main` too), plus the mutation dashboard publish so the badge tracks one branch.

### Deploy to production (also `main`)

`migrate` → `build` → `deploy` → `smoke_test`. The database is migrated **before** the bundle that depends on it, and nothing downstream runs if the migration fails, so a rejected migration leaves the old bundle serving the old schema. `smoke_test` then runs the signed-out suite against the **live URL**, with retries enabled there and only there: prerendering runs in Node with real env vars and can mask code that breaks once it is only a bundle in a browser.

### Scheduled

- Daily: the orphaned-photograph sweep (an operation, not a test).
- Daily: `keepalive()` (a mitigation, not a test).
- Weekly: Dependabot, grouped, with a 7-day cooldown. Auto-merge is restricted to **patch-level `direct:development` bumps** — a devDependency can reach the CI runner, a runtime dependency reaches every signed-in user's browser. Anything runtime waits for a human. That restriction is a security control; do not widen it.

### Pre-release

There is no release train and no staging. Merging to `main` *is* the release. That is a deliberate consequence of the deployment model, and it is why the PR gate is as heavy as it is.

### Production

`smoke_test` post-deploy, and nothing else. Nothing signed-in ever points at production; no test writes to it.

---

## 14. Quality gates

Every number below has a reason. A gate without one is noise.

| Gate | Value | Why this value |
| --- | --- | --- |
| Global coverage floor | statements 85, branches 78, functions 85, lines 88 (`vitest.config.mts`) | A **floor**, set by hand below what the suite actually achieves, with enough margin that CI's measurement (~0.1pp below local, pinned Node) does not flap. It exists to catch a large regression, not to chase a target. |
| `autoUpdate` | `false`, permanently | It was `true`. It wrote the local measurement back after every run, so a green local run kept producing a red PR. Raise by hand when coverage genuinely improves. |
| Per-file coverage floor | 100% on every file in `mutation-targets.mjs` except the two in `NO_COVERAGE_FLOOR` | These are small, pure, and high-consequence. 100% is reachable without contortion, and anything less on a file this size means a branch nobody thought about. |
| Mutation score | `break: 90`, `low: 90`, `high: 100`; actual has been 100% | The break stays at 90 rather than 100 to leave room for a genuinely equivalent mutant to appear without blocking an unrelated PR. Dropping from 100 is still a signal to investigate — it just is not an automatic stop. |
| Coverage/mutation thresholds, direction | **Never lowered** | A threshold lowered to make CI pass converts a design problem into a permanently weaker gate. If a legitimate change makes one unreachable, redesign or raise it with the user. |
| Test pass rate | 100%, `retries: 0` except the deployed target | A flake is a defect. The deployed run is the one place where a retry genuinely distinguishes a broken deploy from a dropped connection. |
| Authorization tests | The `rls.spec.ts` suite must pass; a migration touching policies/grants/ownership triggers must ship a matching assertion in the same PR | The only authorization boundary in the product. See §7. |
| Schema contract | The `database.types.ts` regenerate-and-diff must be clean | Drift here surfaces as runtime `PGRST204`s after deploy, i.e. in production. |
| i18n parity | Every `t()` key present in both `de.json` and `en.json` | Executable (`i18n/parity.test.ts`) — but add both languages in the same change rather than relying on it to catch the omission afterwards. |
| Deployment | `smoke_test` green against the live origin | The only check that sees what users see. |
| Performance | No numeric gate; an index/plan justification for any new filtering or sorting query | See §12. A number nobody can act on is worse than a rule reviewers can apply. |
| New UI | Needs an E2E test | Standing repository policy, unchanged. §9 adds only *where*: the right suite (`public/` must hold signed-out), one journey case, and the field-level detail in component tests alongside it. |
| New functional behaviour | Needs a unit test | Already repository policy. If the behaviour is authorization, a unit test does **not** discharge it. |
| Suppressions (`v8 ignore`, `Stryker disable`, `.skip`, ESLint/TS) | Only with a comment explaining why, and never to make a failing check pass before understanding it | The existing `Stryker disable` regions are a deliberate, documented pattern; a new one needs the same justification. |

---

## 15. Test anti-patterns

Specific to this repository. Each of these has either happened here or is a step away from something that did.

1. **Treating a client-side check as an authorization test.** "The delete button is hidden for a viewer" is a UX assertion. RLS is the check. A green component test here provides zero security confidence.
2. **Mocking supabase-js and calling the result an integration test.** It tests our call shape. Policies, triggers, constraints and PostgREST behaviour are all on the far side of the mock.
3. **Seeding fixtures with `service_role`.** It bypasses RLS and can construct states the app cannot reach. The service key creates users; that is all.
4. **Testing one mirrored surface and assuming the other.** `images` and `storage.objects` have separate policies and separate join paths.
5. **Sharing a seeded category between parallel writing specs.** One spec creating an entry while another counts them fails both, at random, and looks like flake.
6. **Leaving probe rows or objects behind on a failed assertion.** Clean up in `finally`.
7. **Putting a signed-in test in `e2e/public/`.** That suite runs against **production** after every deploy. Everything in it must hold for a signed-out visitor.
8. **Retries or `waitForTimeout` to paper over a flake.** Search debounces and then round-trips; poll for the expected state (`expectTitles`) instead of sleeping, and fix the race rather than retrying it.
9. **Re-testing pure logic through the browser.** Pagination windows, escaping and clamping are unit-tested and mutation-scored. A second copy at E2E level costs orders of magnitude more and fails less clearly.
10. **Lowering a threshold, or reaching for `v8 ignore` / `Stryker disable` / `.skip`, to get to green.** Understand the failure first; the suppression is almost never the answer, and when it is, it needs a comment.
11. **Test gaming.** A test written to touch a line, a branch added to dodge a mutant, a file excluded to avoid dealing with it. A green metric that does not correspond to real confidence is worse than a documented gap.
12. **Widening Stryker's scope to the component tree.** Mutating JSX and Tailwind strings produces thousands of meaningless mutants and a score nobody can act on.
13. **Testing a SQL-side storage cleanup trigger.** It cannot work — Supabase's `prevent-direct-deletes` guard is statement-level and raises even when the delete matches nothing. Writing a test for one means writing a test for a design that has already been tried and reverted.
14. **Running any test, migration or `db push` against the hosted project.** Local stack only.
15. **Asserting `expect(error ?? {}).toBeTruthy()` or similar.** An object is always truthy; assert the error code (`42501`) and the status. This exact trap is already called out in `rls.spec.ts`.
16. **Adding an E2E case for a field-level detail.** Journeys, not fields.

---

## 16. Evolution and maintenance of the strategy

This document is expected to change. It is wrong the moment the architecture moves and nobody updates it.

**Update it when:**

- A server-side execution surface appears (an Edge Function, a route handler, anything that is not a static file). That would be the first place authorization could live outside Postgres, and it changes §2, §6 and §7.
- A new trust boundary appears — another role, another grant shape, a second data source, or (explicitly) anonymous share links.
- A test layer's verdict in §5 changes, in either direction. Record the reasoning, not just the new verdict.
- A quality gate moves. Every number in §14 carries its justification; a change to the number is a change to the justification.
- A gap named here is closed. Delete the gap; do not leave the document describing a hole that no longer exists.
- An incident happens. A production fault that the estate did not catch is the single best input this document gets — add the risk to §4 and name the level that should have caught it.

**Review it** when migrations are next squashed, and whenever `docs/reference/architecture.md` is materially revised — those are the two moments this file is most likely to have quietly gone stale.

**Currently open, from this analysis:**

| Gap | Section | Priority |
| --- | --- | --- |
| Migrations are only ever exercised against an empty database | §8 | Medium — contained by `needs: migrate`, but discovered in production |
| Property-based testing not adopted for the four escaping/packing functions | §10 | Optional, dependency cost is real |
