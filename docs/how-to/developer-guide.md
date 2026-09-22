# Developer guide

Recipes for contributing to and operating CollectionBuddy. Local setup and the
pre-PR checklist are in [CONTRIBUTING.md](../../CONTRIBUTING.md); this guide
covers each check in depth, and everything past the checklist.

## Run the checks CI runs, locally

The checklist in [CONTRIBUTING.md](../../CONTRIBUTING.md#before-opening-a-pull-request)
is CI's `build_and_test` job step for step, plus `mutation_test`. The
stack-dependent jobs — `e2e_local_stack`, `opengrep`, `lighthouse`,
`zap_baseline` — each have a section below.

On a pull request, CI's `changes` job skips `build_and_test`, `mutation_test`,
`lighthouse` and `zap_baseline` unless `web/**` changed, and `e2e_local_stack`
and `opengrep` unless `web/**` or `supabase/**` changed; a push to `main` runs
everything. A skipped job reports as passed. Every job writes its report to its
own Actions summary rather than a PR comment — see
[Configuration](../reference/configuration.md#ci-job-summaries).

## Run the end-to-end suite

```bash
cd web
npm run build   # the suite drives the built export, not the dev server
npm run e2e
```

Playwright starts and stops the server itself, serving `out/` **under the base
path** (`/CollectionBuddy`) the way GitHub Pages does — `next build` bakes that
path into every asset URL, so an export served at `/` 404s on nearly
everything. `scripts/serve-export.mjs` builds the directory for that, reading
the path from `next.config.ts`.

```bash
npx playwright test --ui               # pick tests, watch, step through
npx playwright test e2e/public/theme.spec.ts
npx playwright test --project=mobile   # the Pixel 7 viewport only
npx playwright show-report             # after a failed run
```

The same suite runs against the deployed site after every release:

```bash
E2E_BASE_URL="https://nobuddyorg.github.io/CollectionBuddy/" npm run e2e
```

With `E2E_BASE_URL` set it starts no server. That run catches what only
production has: a wrong base path, an icon that 404s, a stale CDN asset.
**Everything in `e2e/public/` must hold for a signed-out visitor** — that is
what keeps a run against production read-only.

### The signed-in suite

`e2e/signed-in/` runs against a real database: catalogue, search, paging, map,
entry forms, photos, export and import, sharing from both sides, the account
menu, and — in `rls.spec.ts` — the row-level security boundary itself.
`rls.spec.ts` bypasses the interface almost entirely: it asks Postgres, with a
real token, the questions the app never would, including the `editor` grant in
its own describe block. Change a policy and this file says whether it holds.

```bash
supabase start     # repository root
cd web
npm run e2e:local
```

`e2e:local` reads the stack's keys, **builds the bundle against it** — the
Supabase URL is baked in at build time, so a build pointed elsewhere would test
a bundle talking to production — and runs the suite. CI runs the same script.

Sign-in does not go through the interface, since no runner can drive Google
OAuth. `e2e/signed-in.setup.ts` creates a user through the auth admin API,
signs in, and writes the session into `localStorage` as Playwright storage
state. Before adding tests here:

- **Seeding runs as the user, not as `service_role`.** That role has no table
  grants; its key opens one door, creating the user. Everything else goes
  through the same policies the app does, so a fixture cannot reach a state
  the app could not.
- **Spec files run in parallel against one database.** Tests that write use
  `SEED.scratchCategory`; the collections the reading tests describe are never
  touched.
- **Poll, don't read once.** `expectTitles(page, [...])` waits for the
  debounced search round trip; an assertion straight after typing reads the
  previous answer.

### How a spec addresses the app

Every element a spec touches carries a `data-testid`, and no spec names a
selector of its own. `e2e/pages/` holds one page object per screen,
`createPageTree(page)` collects them, and `e2e/fixture.ts` hands that tree to
every test as the `on` fixture, so a test starts `async ({ on, page })` and
reads as the journey it is. [TEST_STRATEGY.md](../../TEST_STRATEGY.md) §9 has
the shape and the rules; the screens are:

- `catalogue` — grid, search box, pagination; `card(title)` for one entry and
  its photos
- `categories` — the collection strip, the panel behind it, `tab(name)`
- `form` — the entry form, tag chips, place autocomplete
- `sharing` — the invite box; `row(email)` for a grant's role, expiry, revoke
- `map`, `viewer`, `confirm`, `toast`, `account`, `login`

Leaflet's pins and popups are the one thing reached by class name, inside
`e2e/pages/map.ts`: that markup is the library's. A new case that needs an
element with no id adds the id to the component and a locator to the page
object. The grep that keeps this honest should return only `html`, `body`,
`meta` and `link` assertions:

```bash
grep -rn 'getByTestId\|getByRole\|locator(' web/e2e --include=*.spec.ts
```

### The e2e coverage report

`npm run e2e` and `npm run e2e:local` collect JS/CSS coverage through
Playwright's own `page.coverage` (Chromium CDP, no instrumentation step);
`e2e/global-teardown.ts` merges every worker's data into
`web/coverage-e2e/index.html`. `i18n.spec.ts` (own browser context) and the
`firefox` project (no CDP) do not contribute. V8 discards a document's counts
on a full navigation, whatever `resetOnNavigation` says, so the fixture
flushes them before every `page.goto` and `page.reload`; a navigation the
app triggers itself (the OAuth redirect) still loses what ran before it.

Only `npm run e2e:local` is gated, by the floor in `e2e/coverage.ts`: it runs
every Chromium-based project (`chromium`, `mobile`, `signed-in`) against a
source-mapped build, so its report is the one complete picture. `npm run e2e`
reports without a floor. A build without `E2E_COVERAGE_SOURCEMAPS=true`, such
as the production deploy the smoke test runs against, has no `src/app/**`
paths to map to, and its "lines" are a few dozen minified ones — a different
metric, not a regression.

## Run the pgTAP database suite

`supabase/tests/database/` runs [pgTAP](https://pgtap.org/) directly against
Postgres, impersonating `authenticated` and `anon` the way PostgREST does —
`set local role` plus a `request.jwt.claims` GUC — inside a transaction that
rolls back.

```bash
supabase start   # repository root
supabase test db
```

| File | Covers |
| --- | --- |
| `000_schema_test.sql` | Trigger shape, every constraint, the delete cascades — as real writes |
| `001_grants_test.sql` | What each role may address at all, before RLS runs |
| `002_function_hardening_test.sql` | `search_path` pinning; which functions run as their owner |
| `005_impersonation_sanity_test.sql` | That the impersonation the suite relies on works |
| `010`, `020`, `025`, `030` | Ownership, viewer grants, a grant's lifecycle, the editor role |
| `040_storage_policy_surface_test.sql` | Bucket configuration; the storage verbs two security fixes removed |
| `050`, `055` | The SQL functions and every branch of the write-path triggers |
| `060`, `065` | The two read RPCs: who may call them, what they return |

`_helpers.psql` holds the shared fixtures; it is `.psql` because
`supabase test db` collects every `.sql` file as a test. pgTAP proves the
policy, trigger and constraint logic fast; `rls.spec.ts` proves the same
properties through the real PostgREST-and-JWT pipeline and is the only place
the Storage API and the bytes behind a `storage.objects` row are exercised. A
policy, grant, or ownership-trigger change needs its `rls.spec.ts` case
regardless of pgTAP coverage.

## Run mutation testing

```bash
cd web
npm run test:mutation
```

Stryker mutates exactly the files in [`mutation-targets.mjs`](../../web/mutation-targets.mjs),
which `vitest.config.mts` also reads for its per-file 100% coverage floors, so
the two cannot drift. A file goes on the list once its logic is reachable from
tests without faking the world: take the raw call as an injected parameter and
assert the request it composed. There is no `Stryker disable` or
`/* v8 ignore */` in `src/`; a survivor is a missing assertion or dead code to
delete, except the React dependency-list class explained in
[Design decisions](../explanation/design-decisions.md#what-still-survives-and-why-no-test-can-kill-it).

CI runs this on every PR. Only `main` publishes to the
[Stryker dashboard](https://dashboard.stryker-mutator.io/reports/github.com/nobuddyorg/CollectionBuddy/main);
locally, the report is `web/reports/mutation/index.html`.

## Run Opengrep

CI's `opengrep` job scans `web/src`, `web/scripts`, `web/e2e` and `supabase`
with [Opengrep](https://opengrep.dev/) and uploads SARIF to the Security tab.
It is a standalone binary, not an npm dependency:

```bash
curl -fsSL https://raw.githubusercontent.com/opengrep/opengrep/main/install.sh | bash -s -- -v v1.30.0
"$HOME/.opengrep/cli/latest/opengrep" scan --config auto \
  web/src web/scripts web/e2e supabase
```

`--config auto` fetches Semgrep's public community rules anonymously. An
**ERROR** finding fails the job; WARNING and INFO are surfaced for triage. It
runs in CI rather than as a commit hook because of that network fetch.

## Run Lighthouse

CI's `lighthouse` job runs [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)
against the production export twice — signed out, and signed in through demo
mode — never against `next dev`:

```bash
supabase start   # repository root
cd web && npm run lighthouse
```

Thresholds and the baseline they were measured against are in
`web/lighthouserc.signed-out.json` and `.signed-in.json`. The performance
category is the gate; accessibility findings belong to `@axe-core/playwright`
in the e2e suite, so they are not double-asserted here. A fresh demo account
has no categories, so the signed-in pass measures a different code path than a
populated catalogue.

## Run the OWASP ZAP baseline scan

CI's `zap_baseline` job runs a passive scan against the built export, signed
out and then signed in through demo mode. It reports headers, cookie flags and
passive-injection findings; it says nothing about authorization
([TEST_STRATEGY.md](../../TEST_STRATEGY.md) §6). Both passes need the stack:

```bash
supabase start   # repository root
cd web
status=$(supabase status -o json)
export NEXT_PUBLIC_SUPABASE_URL=$(jq -r .API_URL <<< "$status")
export NEXT_PUBLIC_SUPABASE_ANON_KEY=$(jq -r .ANON_KEY <<< "$status")
npm run build
ln -s . out/CollectionBuddy   # zap-baseline.py always spiders from the host root
npx serve out -l 4173
```

In a second terminal, from the repository root (Docker Desktop: replace
`--network host` with `-t http://host.docker.internal:4173/`):

```bash
docker run --rm -v "$(pwd):/zap/wrk/:rw" --network host \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t http://127.0.0.1:4173/ -c /zap/wrk/.zap/rules.tsv -I \
  -r /zap/wrk/zap-report-signed-out.html
```

For the signed-in pass: stop `serve`, `rm out/CollectionBuddy`, rebuild with
`NEXT_PUBLIC_DEMO_MODE=true npm run build`, recreate the symlink, serve on
`4174`, and run the same `docker` command against that port with
`-r /zap/wrk/zap-report-signed-in.html`.

Afterwards delete the two `zap-report-*.html` files and `out/CollectionBuddy`;
`npm run e2e` serves the export differently and does not expect the symlink.

## Regenerate the app icons

```bash
cd web
npm run icons
```

Renders every icon in `web/public/` from `web/public/logo.png` (414 px, the
ceiling on icon sharpness — a bigger raster does not help, a vector would).
Needs a headless browser, so it is not part of the build; commit what it
writes. `src/app/manifest.test.ts` checks that every icon `site.webmanifest`
names exists at the size it claims.

## Change the database schema

1. Add `supabase/migrations/NNNN_description.sql`, numbered after the highest
   existing file. Never edit an existing migration.
2. Apply it: `supabase db reset` (re-runs every migration from scratch).
3. Regenerate `web/src/app/data/database.types.ts`:
   `supabase gen types typescript --local`. CI fails if it drifts.
4. Check [Architecture](../reference/architecture.md#database-schema) so the
   migration does not duplicate an existing table, trigger or index.
5. Merge to `main` applies it to production. Nothing is applied by hand.

Three things a from-scratch reset will not tell you:

- **Populated data.** Production applies the migration to live rows,
  unattended. A `not null` column without a default, a unique index existing
  rows violate, or a check constraint existing data fails passes CI and fails
  there. If the migration alters an existing table or adds a constraint or
  index to one: `supabase db reset`, seed rows into the affected tables
  (`web/e2e/signed-in.setup.ts` covers most shapes), apply the new file on top,
  and say in the PR that you did.
- **`storage.objects` DDL.** Policies on it are fine; `create index` or any
  other DDL raises `42501` on hosted Supabase, which owns that table as
  `supabase_storage_admin` and never grants it to `postgres`.
- **The PostgREST schema cache.** A migration applied outside the pipeline
  (SQL editor, `db push` by hand) needs `notify pgrst, 'reload schema'`
  afterwards, or every write naming a new column fails with `PGRST204`. The
  `migrate` job sends it on every run.

### Squashing migrations again

The chain has been squashed three times (most recently on 2026-09-22) into the
0001–0007 baseline plus whatever landed since. Squashing is a deliberate,
occasional act that folds the whole current set, never a side effect of
another change. Do it the way the last one was verified: reset the local stack
from the old files and introspect, reset from the new files and introspect
again — column defaults, constraint expressions, index definitions, function
bodies, trigger timing, policy predicates, grants — and diff the two. Then, in
the hosted project's SQL editor and right before merging, delete the rows of
the files that no longer exist so `db push` stops looking for them:

```sql
delete from supabase_migrations.schema_migrations where version > '0007';
```

That table is the only reason the chain cannot be rewritten in place. Versions
0001–0007 stay recorded as applied, so the new files never run on the populated
database; the diff above is what proves they would have produced it.

## Set up a new Supabase environment

For a fork, or a new production project:

1. Create a Supabase project.
2. `supabase link --project-ref <ref>` then `supabase db push`. Pasting files
   into the SQL editor also works but leaves `supabase_migrations.schema_migrations`
   untouched; `supabase migration repair --status applied <version>` reconciles it.
3. Auth settings: enable **Google** with an OAuth client whose redirect URI is
   `<project-url>/auth/v1/callback`.
4. Note the API URL and anon key (Project Settings → API); they become
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Deploy to GitHub Pages

[`pages-deploy.yml`](../../.github/workflows/pages-deploy.yml) runs on every
push to `main`: `migrate` applies pending migrations and reloads the PostgREST
schema cache, `build` exports the site, `deploy` publishes it, `smoke_test`
runs the signed-out suite against the live URL. Each job depends on the last,
so a failed migration leaves the previous bundle serving the previous schema.
Nothing deploys from a developer machine.

One-time setup for a fork:

1. Repo Settings → Pages → source **GitHub Actions**.
2. Secrets: `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`,
   `SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_PROJECT_REF` — what
   each is and why the DB URL must be the session pooler:
   [Configuration](../reference/configuration.md#github-actions-secrets).
3. If the repository is not named `CollectionBuddy`, change `repo` in
   `web/next.config.ts`; the production `basePath` derives from it.
4. Optional: `STRYKER_DASHBOARD_API_KEY` to publish mutation reports;
   `keep-alive.yml` stays enabled on a free-tier project.
5. The README's CodeQL badge relies on GitHub's default code-scanning setup
   (Settings → Code security), a per-repo setting that does not carry over.
