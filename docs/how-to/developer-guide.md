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
the path from `next.config.ts`. With `PAGES_BASE_URL` set to a URL without a
path, for both the build and the suite, the export is built for and served at
`/`, as on a [custom domain](#move-to-a-custom-domain).

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
menu, and — in `rls/` — the row-level security boundary itself. Those specs
bypass the interface almost entirely: they ask Postgres, with a real token, the
questions the app never would, one file per boundary (`isolation`,
`viewer-share`, `editor-share`, each with a `-photographs` half for Storage,
plus `search-rpc`, `orphan-sweep-rpc` and `quotas`; shared helpers in `rls/helpers.ts`). Change a
policy and these files say whether it holds.

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

Only `npm run e2e:local` collects, and it is gated by the floor in
`e2e/coverage.ts`: it runs every Chromium-based project (`chromium`, `mobile`,
`signed-in`) against a source-mapped build, so its report is the one complete
picture. `npm run e2e` collects nothing: its job is Firefox and the
production-config bundle, and a build without `E2E_COVERAGE_SOURCEMAPS=true`
(the deploy the smoke test runs against) has no `src/app/**` paths to map to,
so its "lines" would be a few dozen minified ones.

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
| `070_quotas_test.sql` | The quotas: photographs and thumbnails per owner, the bucket's ceilings at record and upload time, and entries, categories, shares, links and text |
| `075_query_plans_test.sql` | That every index-backed query can reach its index, and picks it at a realistic size |
| `080_orphan_sweep_test.sql` | What the orphan sweep may delete: both path columns, no uuid cast, the 48 h grace, other buckets, the mass-deletion ceiling; `supabase_read_only_user` and no API role runs it, in a read-only transaction |

`_helpers.psql` holds the shared fixtures; it is `.psql` because
`supabase test db` collects every `.sql` file as a test. pgTAP proves the
policy, trigger and constraint logic fast; `e2e/signed-in/rls/` proves the same
properties through the real PostgREST-and-JWT pipeline and is the only place
the Storage API and the bytes behind a `storage.objects` row are exercised. A
policy, grant, or ownership-trigger change needs its `rls/` case
regardless of pgTAP coverage.

A new query that names its index (CLAUDE.md, "measure, don't assume") also gets
a plan case in `075_query_plans_test.sql`, at both levels the file runs.
**Reachability** plans the query on fixture rows with every cheaper path
switched off (`enable_seqscan`, and whichever of `enable_indexscan`,
`enable_nestloop`, `enable_sort` leave another route), so it fails only when
the planner *cannot* use the index; that is what broke under RLS in #621.
**Preference** plans it again on generated rows after `analyze`, with default
settings, and fails when the planner would rather not. Plan the text the app
actually sends: read a function body from `pg_proc` rather than pasting it,
and run it as the role it runs as — the owner for `SECURITY DEFINER`,
`authenticated` with claims otherwise.

### Splinter (Supabase Advisors lints)

```bash
supabase/splinter.sh   # repository root, after supabase start; needs psql
```

Runs [Splinter](https://github.com/supabase/splinter), the lint set behind the
hosted dashboard's Advisors, against the local stack, and fails on any `WARN`
or `ERROR`: RLS disabled, a mutable `search_path`, an unindexed foreign key, a
`SECURITY DEFINER` function the API roles can execute. CI runs it right after
pgTAP. The script pins Splinter by commit and checksum and lists what it
excuses, each with its reason: `unused_index`, which reads runtime statistics
a freshly reset database does not have, and `search_category_items`, the one
deliberate `SECURITY DEFINER` RPC. A new excuse is a design decision and goes
into that list with its reason, never into a broader filter.

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

Runs are incremental: Stryker keeps every mutant's result in
`web/reports/stryker-incremental.json` and reruns only mutants whose code or
covering tests changed since. It cannot see a change anywhere else — a module
a target imports, a test helper, a dependency — so after one of those, or to
reproduce `main`, rerun everything:

```bash
npm run test:mutation -- --force
```

CI runs this on every PR, restoring `main`'s incremental file; `main` itself
always runs with `--force` ([Design decisions](../explanation/design-decisions.md#incremental-on-pull-requests-full-on-main)).
Only `main` publishes to the
[Stryker dashboard](https://dashboard.stryker-mutator.io/reports/github.com/nobuddyorg/CollectionBuddy/main);
locally, the report is `web/reports/mutation/index.html`.

## Run a load test

k6 scripts in `web/load/`, run by hand against your own `supabase start`
stack (`npm run load -- smoke`) or from the manual `k6-load-test.yml`
workflow. Never a gate. A local run also reports what Postgres did meanwhile
(slowest and most-called statements, scans per table and index). Everything
else — the scripts, the seed, the profiles, the workflow inputs, how to read
both reports, and why the hosted target stays off — is in
[Load testing](load-testing.md).

## Replay a property-test failure

Four functions with adversarial input carry fast-check properties beside their
example tests (`*.property.test.ts`: the search filter, the CSV cell, the ZIP
timestamp, the page range). Every run uses one fixed seed from
`vitest.setup.ts`, so a failure reproduces as it stands. A failure prints its
seed and a shrunk counterexample; to replay a different seed, or explore new
inputs:

```bash
cd web
FC_SEED=12345 npx vitest run property
```

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

A file Opengrep cannot parse is only partially analyzed, and no finding in its
unparsed lines is ever reported. CI's job summary names each one with its
first error line; locally, add `--verbose` to the scan to name them. None is
expected: keep the count at zero rather than adding the file to
`.semgrepignore`. Two TypeScript constructs are known to trip the parser
(#724), so write the equivalent instead:

- an `import('module').Name` type: use `import type { Name } from 'module'`;
- an instantiation expression such as `ReturnType<typeof vi.fn<F>>`: use
  `Mock<F>` from `vitest`.

## Run Lighthouse

CI's `lighthouse` job runs [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)
against the production export twice — signed out, and signed in through demo
mode — never against `next dev`:

```bash
supabase start   # repository root
cd web && npm run lighthouse
```

Thresholds and the baseline they were measured against are in
`web/lighthouserc.signed-out.json` and `.signed-in.json`. Performance is gated
against a measured baseline; accessibility must score exactly 1.0 on both
flows, a second, weighted lens on the pages `@axe-core/playwright` already
checks in the e2e suite. A finding fixed for Lighthouse gets an axe or
Playwright case too, so it cannot regress between runs. A fresh demo account
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
export NEXT_PUBLIC_SUPABASE_ANON_KEY=$(jq -r .PUBLISHABLE_KEY <<< "$status")
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
   existing file. Never edit, rename or delete an existing migration, not even
   to revert one ([Roll back a bad deploy](#roll-back-a-bad-deploy)); CI's
   `prek` job runs `supabase/check-migration-history.sh` against the PR's
   base, which fails on any of those, and on a new file not numbered after
   the last one there. The migration keeps the bundle `main` serves working
   ([Expand, then contract](#expand-then-contract)). A file that takes a lock
   starts with `set local lock_timeout` and `set local statement_timeout`
   after its `begin;`, so it fails fast instead of queueing every read behind
   it; the Squawk hook enforces that and the other lock and rewrite hazards.
   [`.squawk.toml`](../../.squawk.toml) turns off three rules:
   `require-concurrent-index-creation` and `-deletion`, since `CONCURRENTLY`
   cannot run inside the transaction every file is, and `prefer-robust-stmts`,
   since `IF NOT EXISTS` hides typos in files CI applies from scratch. The
   hook skips `0001`–`0009`, applied before it existed.
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

### Expand, then contract

`migrate` applies the schema before `build` and `deploy` publish the bundle
that needs it, so the previous bundle runs against the new schema until the
deploy finishes, and in a tab opened before it until that tab reloads. Every
migration therefore keeps the bundle currently serving working:

- **Expand** in the same PR as the client change: a new table, function,
  index or policy that admits more; a column that is nullable or has a
  default.
- **Contract** in a later PR, once the bundle that stopped using it is live:
  dropping or renaming a column, table or function, changing an RPC's
  parameters or result, a `not null` or check constraint the previous
  bundle's writes could violate.
- **A rename is both:** add the new name and keep the old one working in one
  PR, drop the old one in the next.
- **A security fix is the exception:** a policy that now denies what it must
  breaks the old bundle on exactly that path, which is the point.

Review holds this rule; no CI job checks it, since that would take a second
build and the previous commit's signed-in suite, both from its own checkout,
run against the new schema on the same stack.

### Squashing migrations again

The chain has been squashed three times (most recently on 2026-09-22) into the
0001–0007 baseline plus whatever landed since. Squashing is a deliberate,
occasional act that folds the whole current set, never a side effect of
another change. Do it the way the last one was verified: reset the local stack
from the old files and introspect, reset from the new files and introspect
again — column defaults, constraint expressions, index definitions, function
bodies, trigger timing, policy predicates, grants — and diff the two. A commit
of the squash carries a `Rewrites-migrations: <why>` trailer, the history
check's one override. Then, in
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
   `<project-url>/auth/v1/callback`. Then set every value in [Hosted Auth
   settings](../reference/configuration.md#hosted-auth-settings), and Data
   API → exposed schemas to `public` only. A new project starts with the
   email provider on: turn it off, keep **Confirm email** on and anonymous
   sign-ins off, because sharing trusts the signed-in email
   ([why](../explanation/design-decisions.md#why-the-hosted-auth-settings-are-pinned)).
   A fork sets `site_url` in `supabase/hosted-auth.json` to its own Pages URL.
4. Note the API URL and the publishable key (Settings → API Keys; if the
   tab offers **Create new API keys**, create them first); they become
   `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Nothing
   stores the secret key: the workflows fetch it
   ([API keys](../reference/configuration.md#api-keys)).

## Deploy to GitHub Pages

[`pages-deploy.yml`](../../.github/workflows/pages-deploy.yml) runs when CI
has passed on a push to `main` (`workflow_run`), and deploys exactly that
commit: `gate` checks it is still `main`'s tip and reads the Pages site URL,
whose path the build uses as `basePath`, `migrate` uploads an encrypted
dump when the dry run lists a pending migration
([Back up production](#back-up-production)), applies them and reloads the
PostgREST schema cache, `build` exports the site, `deploy` publishes it,
`smoke_test` runs the signed-out suite against the live URL. Each job depends
on the last, so a failed migration leaves the previous bundle serving the
previous schema. Nothing deploys from a developer machine.

- **`main`'s CI run is the gate, not the PR's.** A PR merged while behind
  `main` ships only if the merged tree passes; a red `main` deploys nothing
  until a fix merges and passes.
- **Only the tip deploys.** A CI run that finishes late, or is re-run, for a
  commit `main` has moved past deploys nothing; the tip deploys once its own CI
  passes. Deploys queue and never cancel each other, so a migration is never
  interrupted.
- **By hand:** Actions → *Deploy Pages* → *Run workflow* from `main`
  redeploys `main`'s tip, and only if CI passed on it. Nothing redeploys an
  older commit: going back is a new commit on `main`
  ([Roll back a bad deploy](#roll-back-a-bad-deploy)).
- The workflow runs from `main`'s copy of `pages-deploy.yml`, so a change to
  its trigger takes effect only once merged.

One-time setup for a fork:

1. Repo Settings → Pages → source **GitHub Actions**.
2. Settings → Environments: create `production` with deployment branches
   **Selected branches** → `main` only, and set the same rule on
   `github-pages`.
3. Secrets: `SUPABASE_DB_URL`, `SUPABASE_ACCESS_TOKEN`,
   `SUPABASE_AUTH_CONFIG_TOKEN`, `SUPABASE_PROJECT_REF` as **`production`
   environment** secrets; `NEXT_PUBLIC_SUPABASE_URL`,
   `NEXT_PUBLIC_SUPABASE_ANON_KEY` as repository secrets — what each is and
   why the DB URL must be the session pooler:
   [Configuration](../reference/configuration.md#github-actions-secrets). The
   two tokens are scoped to the project, with exactly the [permissions
   listed there](../reference/configuration.md#management-api-tokens).
4. Nothing to change for another repository name or a custom domain: the
   deploy takes `basePath` from the Pages site URL. A fork's own Site URL
   still goes into `supabase/hosted-auth.json`.
5. The backup bucket, key and age recipient:
   [Back up production](#back-up-production). Without them a deploy with a
   pending migration stops before applying it.
6. Optional: `STRYKER_DASHBOARD_API_KEY` to publish mutation reports;
   `keep-alive.yml` stays enabled on a free-tier project.
7. The README's CodeQL badge relies on GitHub's default code-scanning setup
   (Settings → Code security), a per-repo setting that does not carry over.
8. Settings → Branches (or Rules → Rulesets) → `main`: **Require status checks
   to pass** with the CI jobs required (at least `prek`, `build_and_test`,
   `e2e_local_stack`), and **Require branches to be up to date before
   merging**. The deploy gate already keeps an untested merge out of
   production; this keeps it off `main`, where a red run blocks every deploy
   until fixed. A Dependabot PR that falls behind then merges only once
   rebased (`@dependabot rebase`).
   A merge queue would do the same, but `ci.yml` has no `merge_group` trigger.
9. Settings → Code security: enable **Secret Protection** and its **Push
   protection** (free on a public repository). It blocks a secret key or a
   classic access token before it lands; `prek`'s gitleaks scan covers the
   legacy JWT and the database URL, which GitHub has no pattern for
   ([Configuration](../reference/configuration.md#github-actions-secrets)).

## Roll back a bad deploy

Production only rolls forward
([why](../explanation/design-decisions.md#why-migrations-only-roll-forward)).
`supabase_migrations.schema_migrations` records every version applied, and
`supabase db push` refuses to run while it names one the checkout has no file
for: `Remote migration versions not found in local migrations directory`.
GitHub's **Revert** on a PR that added a
migration deletes the file: every later `migrate` then fails, nothing after it
builds, and the bad bundle stays live. The history check in CI's `prek` job
fails such a PR; ignore the CLI's advice to run `supabase db pull`, which
writes a migration from production's schema.

- **The bundle is broken, the schema is fine:** revert the app code and keep
  the migration and the types generated from it. The previous bundle works on
  the new schema ([Expand, then contract](#expand-then-contract)), so the
  revert deploys with nothing pending. Drop `-m 1` for a squash merge:

  ```bash
  git revert --no-commit -m 1 <merge commit>
  git checkout <merge commit> -- supabase/migrations web/src/app/data/database.types.ts
  git commit
  ```

- **The schema is wrong:** add a compensating migration, numbered next, that
  undoes or corrects the bad one — drop what it added, re-create a policy with
  the predicate of the file that defined it before — and test it against a
  populated database ([Change the database schema](#change-the-database-schema)).
  It deploys like any other. If rows were lost,
  [restore them](#restore-production-from-a-backup) from the
  `…-pre-migration` archive `migrate` uploaded before applying the bad one.
- **A migration failed in production:** it ran in one transaction, so none of
  it was applied and no version recorded, but every deploy stops at `migrate`
  until it passes. Check that the failed run's *Show pending migrations* step
  lists the file, then fix or remove that file itself, with a
  `Rewrites-migrations: <why>` trailer on the commit, since production never
  applied it.
- **The history already diverged** (`migrate` fails as above): bring the
  deleted file back unchanged, with the trailer if a later file now exists,
  then compensate as above:
  `git checkout <commit that had it> -- supabase/migrations/<file>`. Only when
  a file must stay gone, as after a squash, does the repository owner
  reconcile the table by hand, after running *Back up production*
  ([Back up production](#back-up-production)):

  ```bash
  supabase migration list --db-url "$SUPABASE_DB_URL"
  supabase migration repair --status reverted <version> --db-url "$SUPABASE_DB_URL"
  ```

  `--status reverted` deletes the version's row and `--status applied`
  inserts one; neither touches the schema, so the row must describe what
  production really has. Afterwards `migration list` shows every local file
  with a remote version and no remote version without one.

## Move to a custom domain

Gives the app an origin of its own, out of reach of the org's other Pages
sites ([why](../explanation/design-decisions.md#why-the-origin-is-a-trust-boundary)).
It must be a host only this repository serves, such as
`collectionbuddy.nobuddy.org`; a path on the org's domain is the shared origin
again. The code needs no change: `pages-deploy.yml` reads the site URL from
the Pages settings (`actions/configure-pages` in `gate`) and passes it to the
build as `PAGES_BASE_URL`, whose path, empty on a custom domain, becomes
`basePath`. A workflow-deployed site ignores a `CNAME` file, so there is none.

Every user signs in again afterwards (the new origin starts with empty
storage, so theme, language and last collection reset too), and an installed
app is installed again from the new address. The site is down from step 4 to
the end of step 5, a few minutes: do it at a quiet time.

1. **Rehearse locally.** From `web/`:
   `PAGES_BASE_URL=https://collectionbuddy.example/ npm run build`, then the
   same variable on `npx playwright test --project=chromium`, which serves
   and tests the export at `/`. Run `npm run build` again afterwards.
2. **Verify the domain for the org** (org Settings → Pages → Add a domain,
   a `TXT` record GitHub names). Unverified, another GitHub account could
   claim the subdomain, now or after Pages is switched off with the DNS
   record left in place.
3. **DNS:** a `CNAME` record `collectionbuddy.nobuddy.org` →
   `nobuddyorg.github.io`, no wildcard. Prepare a PR that sets `site_url` in
   `supabase/hosted-auth.json` to `https://collectionbuddy.nobuddy.org/` and
   the Site URL row in [Configuration](../reference/configuration.md#hosted-auth-settings)
   to match; `uri_allow_list` stays empty, since GoTrue admits a redirect to
   the Site URL's own host. Get it reviewed, do not merge it yet.
4. **Repo Settings → Pages → Custom domain:** `collectionbuddy.nobuddy.org`,
   save, wait for the DNS check and the certificate, then tick **Enforce
   HTTPS**. The live build still expects `/CollectionBuddy/` from here on.
5. **Actions → Deploy Pages → Run workflow** from `main`. `gate` now reads
   the new URL, the build is served at `/`, and `smoke_test` runs against
   the new address. Then Supabase → Authentication → URL Configuration →
   Site URL to the new address, and merge the PR; its push re-runs
   `hosted-auth-check.yml`. Until the Site URL changes, sign-in on the new
   address fails.
6. **Revoke every session.** Tokens stay in the old origin's
   `localStorage`, still readable by the sibling sites, and a refresh token
   never used again stays valid. In the dashboard's SQL editor,
   `delete from auth.sessions;` (their refresh tokens cascade) signs everyone
   out; issued access tokens run out within the JWT expiry, an hour by default.
7. **Links:** the Google OAuth consent screen's home page, privacy policy and
   terms URLs, the repository's website field, and anything else pointing at
   the old address. `curl -sI` on the old address should now answer with a
   redirect to the new host.

To undo: remove the custom domain, deploy again by hand, set the Site URL
and `hosted-auth.json` back.

## Check the hosted Auth settings

[`hosted-auth-check.yml`](../../.github/workflows/hosted-auth-check.yml)
reads the production Auth config through the Management API every hour (at
:23), on a push to `main` that changes it or
[`supabase/hosted-auth.json`](../../supabase/hosted-auth.json), and by hand
from `main`. It fails when a pinned value differs, when any sign-in provider
the file does not name is on, or when a third-party auth integration exists,
and lists each difference in the job summary. It only reads; nothing it does
changes the project, and the response, which carries the Google client secret,
is never printed.

When it fails:

1. **Not deliberate, or anonymous sign-ins, the email provider, Confirm email
   or unverified sign-ins moved:** set the dashboard back first (Authentication
   → Sign In / Providers, URL Configuration). While any of those were open,
   anyone could have claimed a pending invite
   ([why](../explanation/design-decisions.md#why-the-hosted-auth-settings-are-pinned)).
   In Authentication → Users, look for accounts created in that window that
   are anonymous or have an email identity, and compare their addresses with
   `category_shares.invited_email`; delete any that claimed a grant, and tell
   the owner.
2. **Deliberate:** change the file in a PR that says why, reviewed like a
   policy change. The four settings above stay off (Confirm email on) unless
   the sharing model changes first.
3. **The API renamed a field** (a pinned field found `null`): check the
   [Management API reference](https://supabase.com/docs/reference/api/v1-get-auth-service-config)
   and rename it in the file.

A 401 or 403 means `SUPABASE_AUTH_CONFIG_TOKEN` expired, was revoked or
lacks **Auth Config: Read**
([Configuration](../reference/configuration.md#management-api-tokens)).

## Sweep orphaned photographs

[`cleanup-orphaned-photos.yml`](../../.github/workflows/cleanup-orphaned-photos.yml)
runs daily at 04:30 UTC, from `main` only, and deletes what
`orphan_sweep_plan()` (migration `0022`) lists: `item-images` objects older
than 48 h that no `images` row names as `path_full` or `path_thumb`, the oldest
10,000 per run. A run by hand is a dry run unless `dry_run` is unticked: it
lists what a real run would delete and never fetches the secret key.

**If rows or photographs may have been lost, disable the sweep first**, before
anything else: Actions → *Clean up orphaned photographs* → ⋯ → *Disable
workflow* (or `gh workflow disable cleanup-orphaned-photos.yml`). To it, every
photograph whose `images` row is gone is an orphan, deleted for good once it is
48 h old. Then find the cause, and [restore](#restore-production-from-a-backup)
if rows are gone.

**When a run refuses.** It fails and deletes nothing when more objects are
orphaned than max(50, 5 % of the bucket), because lost `images` rows look
exactly like mass orphaning. Disable it as above. A disabled workflow cannot be
run by hand, so to see the list, enable it, run it with the defaults (a dry
run), and disable it again. Only if every listed object is truly orphaned (no
row was ever meant to name it), run it by hand with `dry_run` off and
`allow_mass_delete` on. Each such run deletes at most 10,000 objects, and the
schedule keeps refusing while more than the ceiling remain, so repeat until the
dry run is under it, then enable the workflow again.

A change to the plan, its migration or the workflow runs CI's pgTAP job
(`080_orphan_sweep_test.sql`); after it merges, run the default dry run once
before the next 04:30 run.

## Back up production

Supabase's Free plan keeps no database backup, and no plan's backup contains
Storage objects ([why a workflow](../explanation/design-decisions.md#why-production-is-backed-up-by-a-workflow)).
[`backup.yml`](../../.github/workflows/backup.yml) runs daily at 02:47 UTC,
ahead of the 04:30 sweep, and by hand from `main`:

- `database` dumps roles, schema and the `auth` and `public` data with
  `supabase db dump` through the session pooler, adds `commit.txt` (the `main`
  commit it ran on) and `migration.txt` (the last migration production had
  applied), encrypts the tarball to
  `BACKUP_AGE_RECIPIENT` on the runner and uploads
  `database/<UTC time>-daily.tar.gz.age`. `migrate` uploads the same archive as
  `…-pre-migration.tar.gz.age` whenever its dry run lists a pending migration;
  if that upload fails, nothing is applied. Storage's tables are left out:
  `0007` recreates the bucket, and re-uploading a photograph recreates its row.
- `photographs` encrypts each `item-images` object not yet mirrored to
  `photos/<path>.age`. Paths never change, so each object is copied once. An
  object gone from the bucket moves to `photos-removed/<UTC day>/<path>.age`.

Nothing leaves the runner unencrypted, and nothing is an Actions artifact: the
repository is public.

One-time setup:

1. A private bucket on an S3-compatible store outside Supabase (Cloudflare R2,
   Backblaze B2, AWS S3). Lifecycle rules expire `database/` and
   `photos-removed/` after 30 days, and nothing under `photos/`. Anything
   shorter than a week leaves too little time to notice a loss the sweep made
   permanent 48 h after it happened.
2. An access key scoped to that bucket, read and write.
3. On a trusted machine, `age-keygen -o backup-identity.txt`. Keep that file
   offline or in a password manager, never in GitHub or the repository;
   without it no backup can be read. Its `Public key:` line is
   `BACKUP_AGE_RECIPIENT`.
4. The six values in the `production` environment
   ([Configuration](../reference/configuration.md#backups)). Then run
   **Back up production** by hand and check both jobs and the bucket.

## Restore production from a backup

Rehearse this on the local stack once after setup, and again after any change
to `backup.yml`, the dump, or the schema's shape.

1. **Disable the sweep first:** Actions → *Clean up orphaned photographs* →
   ⋯ → *Disable workflow* (or `gh workflow disable cleanup-orphaned-photos.yml`).
   To it every photograph whose `images` row is gone is an orphan, and it
   deletes those once they are 48 h old. Its mass-deletion ceiling
   ([Sweep orphaned photographs](#sweep-orphaned-photographs)) stops only a
   loss larger than max(50, 5 % of the bucket).
2. If a migration caused the loss, also disable *Deploy Pages* and merge
   nothing to `main` until the restore is done: every merge that passes CI
   migrates production. Leave *Back up production* running; it never
   overwrites an archive, and a photograph it no longer finds waits in
   `photos-removed/<day>/` until the 30-day rule expires it.
3. Fetch and decrypt the last archive from before the loss. With the backup
   key in `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_ENDPOINT_URL`,
   `AWS_REGION`, and `BUCKET` set:

   ```bash
   aws s3 ls "s3://$BUCKET/database/"
   aws s3 cp "s3://$BUCKET/database/<archive>" .
   age -d -i backup-identity.txt <archive> | tar -xz  # roles.sql schema.sql data.sql commit.txt migration.txt
   aws s3 cp --recursive "s3://$BUCKET/photos/" encrypted/
   aws s3 cp --recursive "s3://$BUCKET/photos-removed/<day>/" encrypted/  # each day since the loss
   (cd encrypted && find . -name '*.age' -printf '%P\n') | while IFS= read -r f; do
     mkdir -p "item-images/$(dirname "$f")"
     age -d -i backup-identity.txt -o "item-images/${f%.age}" "encrypted/$f"
   done
   ```

4. Load it into the local stack: `git checkout "$(cat commit.txt)"`,
   `supabase db reset --version "$(cat migration.txt)"` (a pre-migration
   commit already holds the migrations that were about to run), then, with
   `DB_URL` the local database:

   ```bash
   psql --single-transaction --variable ON_ERROR_STOP=1 \
     --file roles.sql \
     --command 'set session_replication_role = replica' \
     --file data.sql \
     --dbname "$DB_URL"
   ```

   `supabase db dump --local -f restored.sql` and `diff -B schema.sql
   restored.sql` should differ by nothing but `pgtap`, if you ever ran
   `supabase test db`; anything else is schema production had and the
   migrations lack. Upload the photographs (step 6) against the local API and
   look at the result in `npm run dev`.
5. Restore production, one of:
   - **The project still exists** (a migration, a bug or the sweep lost rows
     or photographs): copy back what is missing from the local stack of
     step 4, with `LOCAL_DB_URL` the local database and `SUPABASE_DB_URL`
     production's session pooler URL, then step 6. `on conflict do nothing`
     leaves every row production still has alone; a row deleted on purpose
     since the backup comes back too, so narrow the export with a `where`
     when you know what the loss touched. Replica mode keeps the ownership
     and quota triggers from judging a restore by the session's identity.

     ```bash
     echo 'set session_replication_role = replica;' > restore-rows.sql
     for t in categories items item_categories images category_shares; do
       cols=$(psql "$LOCAL_DB_URL" -Atc "select string_agg(quote_ident(attname), ', ' order by attnum) from pg_attribute where attrelid = 'public.$t'::regclass and attnum > 0 and not attisdropped and attgenerated = ''")
       psql "$LOCAL_DB_URL" -c "\\copy public.$t ($cols) to '$t.csv' csv"
       printf '%s\n' >> restore-rows.sql \
         "create temp table restore_$t as select $cols from public.$t with no data;" \
         "\\copy restore_$t from '$t.csv' csv" \
         "insert into public.$t ($cols) select * from restore_$t on conflict do nothing;"
     done
     psql "$SUPABASE_DB_URL" --single-transaction --variable ON_ERROR_STOP=1 --file restore-rows.sql
     ```

   - **The project is gone:** create one ([Set up a new Supabase
     environment](#set-up-a-new-supabase-environment)) and, from the
     `commit.txt` checkout with every migration after `migration.txt`
     deleted, `supabase db push --db-url "<its session pooler URL>"`: that
     creates the schema, the bucket, the Storage policies and the migration
     history. Run step 4's `psql` against the same URL, then step 6.
     Point `SUPABASE_DB_URL`, `SUPABASE_PROJECT_REF`,
     `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` at it, and
     the Google OAuth client's redirect URI. Collectors sign in with Google as
     before: `auth.identities` came back with their user ids.
6. Upload the photographs with a secret key of the target (Settings → API
   Keys) and its API URL. The key goes on `apikey` alone; a legacy
   `service_role` JWT would also need `-H "Authorization: Bearer $SECRET_KEY"`:

   ```bash
   (cd item-images && find . -type f -printf '%P\n') | while IFS= read -r name; do
     encoded=$(jq -rn --arg name "$name" '$name | split("/") | map(@uri) | join("/")')
     curl -sS -o /dev/null -w "%{http_code} $name\n" -X POST \
       "$SUPABASE_URL/storage/v1/object/item-images/$encoded" \
       -H "apikey: $SECRET_KEY" \
       -H "Content-Type: $(file --brief --mime-type "item-images/$name")" \
       --data-binary "@item-images/$name"
   done
   ```

   `200` restored the object; `400` with `Duplicate` means Storage still had
   it, since an upload never overwrites. A photograph whose row stays deleted
   is an orphan again, which the re-enabled sweep removes once it is 48 h old.
7. Check that no `images` row lacks its objects, then enable the sweep and
   *Deploy Pages* again:

   ```sql
   select count(*) from public.images im
   where not exists (select 1 from storage.objects o where o.bucket_id = 'item-images' and o.name = im.path_full)
      or (im.path_thumb is not null
          and not exists (select 1 from storage.objects o where o.bucket_id = 'item-images' and o.name = im.path_thumb));
   ```

## Migrate to publishable and secret keys

Supabase deprecates the legacy `anon` and `service_role` keys by the end of
2026; production must run on publishable and secret keys before then. The
repository already takes both ([API keys](../reference/configuration.md#api-keys)),
so this is dashboard and secret work only, and every step before the last is
reversible. Budget a quiet evening, well before December.

1. **Create the keys.** Supabase Dashboard → Settings → API Keys → tab
   **Publishable and secret API keys** → **Create new API keys**. That adds a
   `default` publishable and a `default` secret key; the legacy keys keep
   working.
2. **The sweep and the backup switch themselves.** From their next run,
   `cleanup-orphaned-photos.yml` and `backup.yml` fetch the secret key
   instead of `service_role`. To prove it now: add a photograph to any entry
   in production, then run Actions → *Back up production*; `photographs`
   must copy its two objects with `failed: 0`, downloading them with the
   secret key.
3. **Swap the public key.** Repository Settings → Secrets and variables →
   Actions → `NEXT_PUBLIC_SUPABASE_ANON_KEY` → **Update**, paste the
   publishable key (`sb_publishable_…`). The name stays.
4. **Redeploy.** Actions → *Deploy Pages* → *Run workflow* from `main`.
   `build` calls `keepalive()` with the key it baked in and stops before
   publishing if the project rejects it. Then sign in on the live site, open a
   category and a photograph, and run Actions → *CollectionBuddy Keepalive*
   by hand.
5. **Look for other holders.** Nothing else in this project uses a legacy
   key: no Edge Functions, no `pg_net` or Database Webhooks. A fork that
   added one follows [Supabase's migration guide](https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys).
6. **Deactivate the legacy keys**, a day after step 4 so open tabs have
   reloaded the new bundle: Settings → API Keys → tab **Legacy API keys** →
   disable. Reversible from the same tab. Afterwards run *CollectionBuddy
   Keepalive* again, and watch the next scheduled *Clean up orphaned
   photographs* and *Back up production* runs.

Supabase's separate JWT signing-keys migration (the key that signs users'
sessions) is independent of this one and has no deadline attached here.

## Scope the Management API tokens

The workflows once shared one access token, most likely a classic one, which
reaches every project on its owner's account. This replaces it with the two
scoped tokens in [Configuration](../reference/configuration.md#management-api-tokens).
Every step keeps the jobs running; do it after the change that added `0024`
has deployed.

1. **The Auth check's token.** Supabase Dashboard → Account → Access Tokens
   → **Generate new token**, named for its use. Expiry 90 days; resource
   access this one project; **Auth Config**: Read, nothing else. Copy the
   `sbp_fc…` value into a new `production` environment secret,
   `SUPABASE_AUTH_CONFIG_TOKEN`. Run Actions → *Check hosted Auth settings*:
   it must pass without the warning that it borrowed `SUPABASE_ACCESS_TOKEN`.
2. **The sweep and backup token.** Generate a second one the same way with
   **Database**: Read, **API Keys**: Read and **API Key Secrets**: Read, and
   update `SUPABASE_ACCESS_TOKEN` with it.
3. **Prove it.** Run *Clean up orphaned photographs* with the defaults (a dry
   run: the read-only query). Add a photograph to any entry in production,
   then run *Back up production*: `photographs` must copy its two objects
   with `failed: 0`, which fetches the secret key.
4. **Revoke the classic token** on the Access Tokens page, once nothing else
   uses it. `supabase login` on a laptop stores its own token and is
   unaffected.
5. Put the expiry date a week early in a calendar: [Rotate a
   credential](#rotate-a-credential).

## Rotate a credential

Rotate after a suspected leak, when someone with access leaves, or when a
token nears its expiry. Fix the cause of a leak first. Each procedure keeps the
old credential working until the new one is proven, except the database
password, which Supabase replaces at once.

- **Publishable key** (`NEXT_PUBLIC_SUPABASE_ANON_KEY`). Public by design, so
  rotation only cuts off copies of old bundles. Settings → API Keys → add a
  publishable key, update the repository secret, run *Deploy Pages* (its
  `build` step checks the new key), then delete the old key a day later. The
  legacy anon key cannot be rotated on its own: its JWT secret also signs
  `service_role` and every user session. Migrate instead.
- **Secret key.** Stored nowhere in GitHub. Settings → API Keys → add a
  secret key, then delete the old one; the workflows fetch whichever secret
  key exists on their next run. A deleted secret key cannot be restored. The
  legacy `service_role` key cannot be rotated on its own either: migrate, then
  deactivate the legacy keys.
- **Database password** (`SUPABASE_DB_URL`, a `production` environment
  secret). Only `migrate` and the `database` backup use it; the app never
  does. Wait until no *Deploy Pages* or *Back up production* run is in
  progress, then Dashboard → Database → Settings → **Reset database
  password**; it can take a few minutes to apply. Build the new session
  pooler string with the password percent-encoded ([Configuration](../reference/configuration.md#github-actions-secrets)),
  update the secret, and run *Back up production*: `database` must pass.
- **Management API tokens** (`SUPABASE_ACCESS_TOKEN`,
  `SUPABASE_AUTH_CONFIG_TOKEN`, `production`). Every 90 days, a week before
  they expire, with a calendar reminder for the next time. Supabase Dashboard
  → Account → Access Tokens → generate a scoped token with the same project,
  permissions and 90-day expiry ([Configuration](../reference/configuration.md#management-api-tokens)),
  and update its secret. Prove `SUPABASE_AUTH_CONFIG_TOKEN` with *Check hosted
  Auth settings*, and `SUPABASE_ACCESS_TOKEN` with *Clean up orphaned
  photographs* (a dry run by default) and *Back up production*; each must
  pass. Then revoke the old token on the same page. A classic token still in
  either secret: [Scope the Management API
  tokens](#scope-the-management-api-tokens).
- **Google OAuth client secret** (Supabase Dashboard → Authentication →
  Sign In / Providers → Google). Google Cloud Console → APIs & Services →
  Credentials → the OAuth client → **Add secret**; the old secret stays
  valid. Paste the new one into Supabase, save, and sign in on the live site.
  Then disable and delete the old secret in Google Cloud. A developer whose
  local stack uses this client updates `GOTRUE_EXTERNAL_GOOGLE_SECRET` and
  restarts it.
- **Backup store key** (`BACKUP_S3_ACCESS_KEY_ID`,
  `BACKUP_S3_SECRET_ACCESS_KEY`, `production`). Create a new key scoped to
  the bucket at the provider, update both secrets, run *Back up production*,
  then delete the old key.
- **Backup age identity.** Generate a new identity ([Back up
  production](#back-up-production)), update `BACKUP_AGE_RECIPIENT`, and keep
  the old identity: `database/` archives need it until they expire, and
  objects already under `photos/` are never copied again, so they stay
  encrypted to it for good.
