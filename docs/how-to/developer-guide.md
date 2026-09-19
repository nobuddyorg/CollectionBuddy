# Developer guide

Task-oriented recipes for contributing to or operating CollectionBuddy. For the day-to-day local setup (Docker, Supabase, Google OAuth, `npm run dev`) and the pre-PR checklist, see [CONTRIBUTING.md](../../CONTRIBUTING.md) — this guide covers everything past that.

## Run the checks CI runs, locally

From `web/`, in this order — the build comes first on purpose. `next build` generates
`next-env.d.ts` (gitignored), and both `tsc` and ESLint need it on a clean checkout to
resolve the ambient module types it references:

```bash
npm run build
npx tsc --noEmit
npx prettier --check .
npm run lint
npm test -- --coverage
npm run e2e
```

That is the `build_and_test` job in [`ci.yml`](../../.github/workflows/ci.yml), step for
step. Two more jobs run alongside it rather than after it, so run them separately:

```bash
npm run test:mutation   # the mutation_test job
supabase test db        # part of the e2e_local_stack job; needs `supabase start` first
npm run e2e:local       # the rest of the e2e_local_stack job; same prerequisite
```

A fourth job, `prek`, runs the repo-wide hooks — `prek run --all-files` from the repository
root is the same thing.

A fifth job, `changes`, decides whether `build_and_test`, `mutation_test`, and
`e2e_local_stack` run at all: on a PR, each is skipped unless the paths it
actually covers changed — see `.github/workflows/ci.yml`'s `changes` job for
exactly which, and [TEST_STRATEGY.md](../../TEST_STRATEGY.md) §13 for the
general rationale. Don't be surprised to see one of them missing on a
docs-only or SQL-only PR — the local commands above still all run and are
still worth running before opening one, since nothing about the local
pre-PR checklist is conditional.

Coverage, mutation score, and end-to-end results all show up as a table in their job's own
Actions summary rather than as a PR comment — see [Configuration
reference](../reference/configuration.md#ci-job-summaries).

## Run the end-to-end suite

```bash
cd web
npm run build   # e2e drives the built export, not the dev server
npm run e2e
```

Playwright starts and stops the server itself. It serves `out/` **under the base path**, because that is where GitHub Pages puts it and `next build` bakes that path into every asset URL, router link and manifest entry — an export served at `/` 404s on nearly everything it asks for. `scripts/serve-export.mjs` builds a directory for that, and takes the path from `EXPORT_BASE_PATH` in [`next.config.ts`](../../web/next.config.ts) so the name exists in one place.

Useful while writing tests:

```bash
npx playwright test --ui             # pick tests, watch them run, step through
npx playwright test e2e/public/theme.spec.ts
npx playwright test --project=mobile # the phone viewport only
npx playwright show-report           # after a failed run
```

The same suite runs against the deployed site after every release, pointed at another origin:

```bash
E2E_BASE_URL="https://nobuddyorg.github.io/CollectionBuddy/" npm run e2e
```

With `E2E_BASE_URL` set it starts no server of its own. That run is what catches the failures only production can have — a base path that doesn't match, an icon that 404s once deployed, a stale asset from the CDN.

**Everything in `e2e/public/` has to hold for a signed-out visitor.** Those runs have no Supabase session, which is what keeps a run against production read-only.

### The signed-in suite

`e2e/signed-in/` runs against a real database: the catalogue, search, paging, the map, the entry forms, photographs, exporting and importing a category, sharing one and being shared with, the account menu's language and appearance, and — in `rls.spec.ts` — the row-level security boundary itself. That last one is the executable version of the RLS model, and nearly all of it deliberately bypasses the interface: one test looks at the page, and the other twenty-odd ask Postgres directly, with a real token, the questions the app would never think to ask. Change a policy in `0006_policies.sql` or `0007_storage.sql` and this is the file that says whether it still holds, including the `editor` grant — the widest one the schema can issue — in its own describe block.

```bash
supabase start     # from the repository root
cd web
npm run e2e:local
```

That one script reads the stack's own keys, **builds the bundle against it** — the Supabase URL is baked in at build time, so a build pointed elsewhere would produce a suite that passes while testing a bundle talking to production — and runs the suite. CI runs the same script, so the two cannot drift.

Sign-in does not go through the interface, because the only way in is Google OAuth and no runner can drive it. `e2e/signed-in.setup.ts` creates a user through the auth admin API, signs in, and writes the session into `localStorage` as Playwright storage state. It does not spell out the storage key: supabase-js derives that from the project URL, so the setup hands the same library somewhere to write and reads back what it wrote.

Two things worth knowing before adding tests here:

- **Seeding runs as the user, not as `service_role`.** That role is granted nothing on these tables — [`0006_policies.sql`](../../supabase/migrations/0006_policies.sql) grants `authenticated` and no one else, because row-level security is this app's only authorization layer. The service key opens exactly one door: creating the user. Everything else goes through the same policies the app does, so a fixture cannot set up a state the app itself could not reach.
- **Spec files run in parallel against one database.** Tests that write use their own category (`SEED.scratchCategory`); the collections the reading tests describe are never touched. A test that creates an entry in a collection another file is counting would make both wrong, at random.

Prefer `expectTitles(page, [...])` over reading the grid once: the search box debounces and then waits on a round trip, so anything that asserts immediately after typing is asserting on the previous answer.

### Known E2E journey-coverage gaps

A walk of README's feature list and this suite (2026-09), checking each
feature against `e2e/signed-in/` and — per TEST_STRATEGY.md §9 — whether an
apparent gap is actually delegated to a component/unit test instead. Most
of README's list is covered one way or the other: photo strips and the
multi-photo carousel are unit-tested in `ModalImage.test.tsx`, and the
sharing UI's mechanics (invite form, role selector) are unit-tested in
`Sharing.test.tsx`/`useShares.test.tsx`.

The two gaps that walk found are closed:

- Importing is round-tripped in `import.spec.ts`: a real export is
  downloaded and handed straight back to the real file input, which is the
  half `importCategory.test.ts`'s fake I/O structurally cannot reach.
- Sharing is driven through the interface from both sides, with two real
  signed-in browser sessions — `sharing.spec.ts` (the owner invites,
  promotes to `editor`, then revokes) and `shared-with-me.spec.ts` (the
  grantee's own session, from `OTHER_AUTH_STATE_PATH`, which sees the
  collection marked as someone else's, finds the owner-only controls shut,
  and leaves the share). What a grant then opens or refuses stays in
  `rls.spec.ts`, at the API level, where it belongs.

Local demo mode (`npm run demo`) still has no E2E coverage, but it's dev
tooling rather than a production code path, so it's a lower-priority gap
than those two were.

### The pgTAP database suite

`supabase/tests/database/` runs [pgTAP](https://pgtap.org/) directly against Postgres — no PostgREST, no browser — by impersonating the `authenticated` and `anon` roles the way a real request does: `set local role`, plus a `request.jwt.claims` GUC carrying the claims a JWT would. It runs in the same job as the signed-in suite, right after `supabase start`, because a schema or policy regression is cheaper to catch there than after paying for Playwright's browser install too.

```bash
supabase start   # from the repository root, if not already running
supabase test db
```

It complements `rls.spec.ts` rather than duplicating it: pgTAP proves the policy, trigger and constraint logic fast and directly; `rls.spec.ts` proves the same properties hold through the real PostgREST-and-JWT pipeline, and is still the only place `storage.objects` and the real Storage API get exercised. See [TEST_STRATEGY.md](../../TEST_STRATEGY.md#7-security-and-authorization-testing) for the full division of labor. A policy, grant, or ownership-affecting trigger change still needs its `rls.spec.ts` case regardless of whether a pgTAP case exists alongside it — that rule (CLAUDE.md guardrail 3) is not discharged by pgTAP coverage.

## Run mutation testing

Line coverage counts lines that _ran_; mutation testing counts lines that are actually _checked_. It is the number worth reading — see [Design decisions](../explanation/design-decisions.md#why-mutation-testing-is-scoped-to-a-handful-of-files) for why it's scoped the way it is.

```bash
cd web
npm run test:mutation
```

CI runs this on **every** PR as well as on pushes to `main` — check the `mutation_test` job's own duration on a recent run rather than trusting a number written here, since the mutant count and runtime both drift as files are added to the scoped list. The score has been 100% throughout; the break threshold is 90. That is 100% of the roughly one-third of mutants left after the `Stryker disable` regions — the `disable` blocks are load-bearing, so a score read without them is not the number you think it is. Only main publishes to the [Stryker dashboard](https://dashboard.stryker-mutator.io/reports/github.com/nobuddyorg/CollectionBuddy/main), so the badge keeps tracking one branch — locally, without `STRYKER_DASHBOARD_API_KEY`, it writes an HTML report to `web/reports/mutation/index.html`.

The list of mutated files is [`mutation-targets.mjs`](../../web/mutation-targets.mjs), which [`stryker.config.mjs`](../../web/stryker.config.mjs) and `vitest.config.mts`'s per-file coverage floors both read, so the two can't drift apart — a file on that list carries a 100% coverage floor too, unless it is one of the handful named in the same file's `NO_COVERAGE_FLOOR`. Adding one to that list means first drawing a line inside it: every file in that list pairs pure exported logic with a `// Stryker disable all` region around whatever I/O it sits beside. Mutating a `fetch` call scores how elaborately the network was faked, which is not worth a number. Where a mutant is genuinely equivalent — a check the type system needs but the runtime does not — say so with `// Stryker disable next-line all` and a comment explaining why, rather than writing a test that cannot fail.

## Run the OWASP ZAP baseline scan

`ci.yml`'s `zap_baseline` job runs a passive DAST scan against the built static export, twice
— signed out, then signed in via demo mode — see [TEST_STRATEGY.md](../../TEST_STRATEGY.md)'s
§6 "Dynamic scanning (DAST)" for what this kind of scan covers and what it deliberately
doesn't (it is not a substitute for `rls.spec.ts`). Both passes need the local stack up first
(`supabase start` from the repo root); from `web/`:

```bash
cd web
status=$(supabase status -o json)
export NEXT_PUBLIC_SUPABASE_URL=$(jq -r .API_URL <<< "$status")
export NEXT_PUBLIC_SUPABASE_ANON_KEY=$(jq -r .ANON_KEY <<< "$status")

npm run build
ln -s . out/CollectionBuddy   # see the job's own comment for why this is needed
npx serve out -l 4173
```

Then, from the repository root, in a second terminal (Docker Desktop users: swap
`--network host` for `-t http://host.docker.internal:4173/` below; that flag only works on
Linux):

```bash
docker run --rm -v "$(pwd):/zap/wrk/:rw" --network host \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t http://127.0.0.1:4173/ -c /zap/wrk/.zap/rules.tsv -I \
  -r /zap/wrk/zap-report-signed-out.html
```

The self-referencing symlink is required, not cosmetic: `zap-baseline.py` always resets its
spider to the target's host root regardless of any path in the URL you give it, but the
export only renders under `/CollectionBuddy/` (`next.config.ts` bakes that in). The symlink
makes the one build answer identically at both.

For the signed-in pass, stop the first `serve` (`Ctrl-C`), remove the symlink
(`rm out/CollectionBuddy`), then rebuild with demo mode on and repeat against a different port
so nothing from the first pass lingers:

```bash
NEXT_PUBLIC_DEMO_MODE=true npm run build
ln -s . out/CollectionBuddy
npx serve out -l 4174
```

```bash
docker run --rm -v "$(pwd):/zap/wrk/:rw" --network host \
  ghcr.io/zaproxy/zaproxy:stable \
  zap-baseline.py -t http://127.0.0.1:4174/ -c /zap/wrk/.zap/rules.tsv -I \
  -r /zap/wrk/zap-report-signed-in.html
```

Worth knowing before reading too much into the signed-in pass's report: a fresh demo-mode
account has zero categories (same caveat `scripts/lighthouse.mjs` already carries), so it
scans a different code path and a larger bundle, not real seeded catalogue content.

Both `zap-report-*.html` files land at the repository root (delete them afterward — they
aren't build artifacts anything else expects to find there). Remove `out/CollectionBuddy`
before running `npm run e2e`/`npm run e2e:local` afterward; the real e2e suite serves the
export differently (`web/scripts/serve-export.mjs`) and doesn't expect that symlink to exist.
`supabase stop` when done.

## Coverage floors

`vitest.config.mts` carries a global floor plus per-file 100% floors for the pure, high-risk modules. The global floor is not auto-updated: raise it by hand when coverage genuinely improves, and never lower it to make a change fit. It had been left about 16 points below what the suite actually achieved, which meant half the tests could have been deleted with CI still green.

## Read the e2e JS/CSS coverage report

`npm run e2e` and `npm run e2e:local` both collect JS/CSS coverage automatically, via Playwright's own `page.coverage` (Chromium's CDP coverage collector, so this needs no Istanbul/babel instrumentation step). `e2e/coverage.ts` wires it into every test through an auto fixture; `e2e/global-teardown.ts` merges what each worker collected into one report after all projects finish, via [`monocart-coverage-reports`](https://github.com/cenfun/monocart-coverage-reports).

```bash
open web/coverage-e2e/index.html   # after any e2e run
```

`e2e/coverage.ts`'s `COVERAGE_THRESHOLDS` gates on it: `generateCoverageReport()` throws out of `global-teardown.ts` if statements/branches/functions/lines drop below their floor, which fails the whole `npm run e2e`/`e2e:local` run the same as a failed test would. Like `vitest.config.mts`'s floor, it's not auto-ratcheted — raise it by hand when a real run reports a higher achieved number, never lower it to make a change fit. There is one floor per suite, since the two never run together and reach wildly different amounts of the app: a shared floor would have to be the signed-out one, and the signed-in suite could then lose most of its coverage without the gate noticing. Each is a margin below what a real run achieved — the signed-out one from a local run (chromium + mobile, `e2e/public`), the signed-in one from CI's `e2e_local_stack` job, the only place that suite can run. See the comment above `COVERAGE_THRESHOLDS` for the exact numbers.

Two things opt out of coverage collection entirely: `i18n.spec.ts` (it drives its own `browser.newContext()` rather than the `page` fixture the auto fixture attaches to), and the `firefox` project (Playwright's Coverage API is Chromium-only over CDP; Firefox still runs every other assertion in `e2e/public`, just without contributing to this report or the gate).

CI posts the `console-summary`/`markdown-summary` table to the job summary and uploads the full `web/coverage-e2e/` report as a build artifact (`e2e-coverage`/`e2e-coverage-signed-in`) on every run, pass or fail — both via `.github/actions/playwright-results`, alongside the existing Playwright HTML report. `pages-deploy.yml`'s `smoke_test` job (post-deploy check against production) doesn't use that action and isn't part of this — it stays a narrower pass/fail signal, not a coverage source.

By default coverage is measured against the built bundle, not the original source, since the export doesn't ship source maps (`next.config.ts` only sets `productionBrowserSourceMaps` when `E2E_COVERAGE_SOURCEMAPS=true`). CI (`ci.yml`'s `build_and_test` job) and `npm run e2e:local` (`scripts/e2e-local-stack.mjs`) both set it, so their reports map back to real `src/app/**` files and lines (`sourceFilter` in `e2e/coverage.ts` keeps vendor library source out of it); a plain local `npm run build && npm run e2e` doesn't, and reads against the minified bundle instead. `pages-deploy.yml`'s actual deploy build never sets it — turning source maps on there would ship them in the production static export, which is a separate, deliberate call this doesn't make.

## Regenerate the app icons

The home-screen and splash-screen icons in `web/public/` are rendered from a single piece of artwork, `web/public/logo.png`:

```bash
cd web
npm run icons
```

Run it after changing `logo.png`, and commit what it writes — it needs a headless browser, so it is not part of the build. It only ever scales the artwork down, and refuses to write an icon that would need scaling up: `logo.png` is 414px across, which is the hard ceiling on how sharp any icon can be. Raising that ceiling means a vector source, not a bigger export of the same raster.

`site.webmanifest` lists the results by hand. `src/app/manifest.test.ts` checks that every icon it names exists, is the size it claims, and covers what a launcher needs — so an entry added there without a file (or the other way round) fails the suite rather than a phone.

## Change the database schema

Every schema change goes through a new migration file, never an edit to an existing one:

1. Add a new `supabase/migrations/NNNN_description.sql` file (next number after the highest existing one — check `ls supabase/migrations/`).
2. Apply it locally: `supabase db reset` (re-runs every migration from scratch against your local stack).
3. Update `web/src/app/data/database.types.ts` to match — `supabase gen types typescript --local`, or by hand.
4. See [Architecture reference](../reference/architecture.md#database-schema) for what's already there, so your migration doesn't duplicate an existing table, trigger, or index.
5. Merging to `main` applies it to production — see below. Nothing needs applying by hand.

`supabase db reset` only proves the migration applies against an **empty**
database — that's all CI checks too. Production applies it with `db push`
against a database full of rows, unattended, with no staging in between: a
`not null` column with no default, a unique index existing rows violate, or a
check constraint existing data fails would pass every automated check and
only fail there. If your migration alters an existing table, or adds a
constraint or index to one, reset and seed the local database (the
`e2e/signed-in.setup.ts` seed covers most shapes), apply the new migration
file on top of that populated database rather than through a fresh reset,
and say in the PR description that you did.

If you ever apply a migration outside the pipeline (SQL editor, `db push` by hand), send `notify pgrst, 'reload schema'` afterwards. PostgREST serves from a cached schema, so until it reloads, every write naming a newly added column fails with `PGRST204: Could not find the 'x' column of 'items' in the schema cache` — the table is fine, the API just hasn't noticed. Most Supabase projects have a `pgrst_ddl_watch` event trigger that does this automatically; this one doesn't, and can't, since creating an event trigger needs superuser and `postgres` isn't. The `migrate` job sends it on every run, so migrations that go through `main` are covered.

A migration that touches `storage.objects` can create and drop _policies_ on it, but not indexes or anything else needing ownership: hosted Supabase owns that table as `supabase_storage_admin` and never grants it to `postgres`, so `create index` on it raises `42501` for every role available to us. An earlier migration carried such an index for a year, which meant that file — one transaction — had never applied anywhere, locally or in production, while the repo and its docs described it as live.

### Squashing migrations again

`supabase/migrations/` has been squashed twice, most recently in #580. It holds the resulting seven-file baseline (`0001` to `0007`) plus the migrations that have landed since (`0008` onward — see the [architecture reference](../reference/architecture.md#database-schema) for what each one changes). See [Design decisions](../explanation/design-decisions.md#why-the-migrations-were-squashed) for what each round folded in and how the result was verified. Squashing is a deliberate, occasional act, not routine, and it folds the whole current set, not just whatever has accumulated since the last time.

If you do it: verify it the same way, by introspecting both databases down to column defaults, constraint expressions, index definitions, function bodies, trigger timing, policy predicates and grants, and diffing them. Afterward, clear `supabase_migrations.schema_migrations` on the hosted project so the new files are recorded as themselves. That table is the only reason the chain can't simply be rewritten in place.

## Set up a new Supabase environment (e.g. for a fork, or production)

The local stack in `supabase/` and a real hosted Supabase project need the same setup, done twice:

1. Create a Supabase project (or use the local CLI stack — see CONTRIBUTING.md).
2. Apply every migration in `supabase/migrations/`, in order — `supabase link --project-ref <ref>` then `supabase db push`. Pasting files into the SQL editor also works, but note that it leaves `supabase_migrations.schema_migrations` untouched, so the project ends up not knowing what it has run; `supabase migration repair --status applied <version>` is what reconciles that afterwards.
3. In the project's Auth settings, enable **Google** as a provider and set the same (or a new) OAuth client ID/secret, with a redirect URI of `<project-url>/auth/v1/callback`.
4. Note the project's API URL and anon key (Project Settings → API) — these become `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Deploy to GitHub Pages

The production path is [`pages-deploy.yml`](../../.github/workflows/pages-deploy.yml): push to `main`, and it applies any pending migrations to the hosted database, then builds the static export and deploys it via GitHub's official Pages actions. `build.sh` at the repo root does the same build locally, for a sanity check before pushing — it does not deploy anything itself.

The `migrate` job runs first and the build depends on it, so the schema is never behind the bundle that expects it. If a migration fails, nothing is deployed and the previous bundle keeps serving against the unchanged schema.

One-time setup for a new fork or a repo renamed away from `CollectionBuddy`:

1. Repo Settings → Pages → set the source to **GitHub Actions**.
2. Add repository secrets `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, pointed at your (non-local) Supabase project.
3. Add `SUPABASE_DB_URL` — the **session pooler** connection string, Project Settings → Database → Connection string → Session pooler, with the password filled in and percent-encoded. It must be the pooler host (`aws-0-<region>.pooler.supabase.com`), not `db.<ref>.supabase.co`: the direct host is IPv6-only and GitHub runners have no IPv6, and `supabase link` does not paper over this — it reports success and the subsequent push fails anyway.
4. Add `SUPABASE_ACCESS_TOKEN` (a personal access token from <https://supabase.com/dashboard/account/tokens>) and `SUPABASE_PROJECT_REF` (the project ref from your project URL). The `migrate` job's last step uses these to send `notify pgrst, 'reload schema'` over the management API — without them that step returns 401, and because `build` declares `needs: migrate`, the whole deploy stops.
5. If the repo isn't named `CollectionBuddy`, update the `repo` constant in `web/next.config.ts` — the production `basePath` (`/CollectionBuddy`) is derived from it, and a mismatch breaks every static asset path on Pages.
6. Optional: add `STRYKER_DASHBOARD_API_KEY` as a secret if you want mutation-test reports published (see above).
7. Optional: if your Supabase project is on the free tier, keep [`keep-alive.yml`](../../.github/workflows/keep-alive.yml) enabled (it's on by default) — it pings a `keepalive()` RPC daily so the project doesn't auto-pause from inactivity.
8. The README's CodeQL badge links to this repo's code-scanning results, but `.github/workflows/` carries no CodeQL workflow file — it relies on GitHub's "default setup" (repo Settings → Code security → Code scanning), a per-repo setting that does not carry over from the upstream repo. Switch it on there, or the badge renders green while scanning nothing.
