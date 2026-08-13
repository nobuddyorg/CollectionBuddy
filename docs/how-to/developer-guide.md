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
npm run e2e:local       # the e2e_local_stack job; needs `supabase start` first
```

A fourth job, `prek`, runs the repo-wide hooks — `prek run --all-files` from the repository
root is the same thing.

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
npx playwright test e2e/theme.spec.ts
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

`e2e/signed-in/` runs against a real database: the catalogue, search, the map, the entry forms, photographs, exporting a category, and — in `rls.spec.ts` — the row-level security boundary itself. That last one is the executable version of the RLS model, and half of it deliberately bypasses the interface: it asks, with a real token, the questions the app would never think to ask. Change a policy in `0006_policies.sql` or `0007_storage.sql` and this is the file that says whether it still holds.

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

## Run mutation testing

Line coverage counts lines that _ran_; mutation testing counts lines that are actually _checked_. It is the number worth reading — see [Design decisions](../explanation/design-decisions.md#why-mutation-testing-is-scoped-to-a-handful-of-files) for why it's scoped the way it is.

```bash
cd web
npm run test:mutation
```

CI runs this on **every** PR as well as on pushes to `main` (about a minute for ~273 mutants). The score has been 100% throughout; the break threshold is 90. That is 100% of the roughly one-third of mutants left after the `Stryker disable` regions — the `disable` blocks are load-bearing, so a score read without them is not the number you think it is. Only main publishes to the [Stryker dashboard](https://dashboard.stryker-mutator.io/reports/github.com/nobuddyorg/CollectionBuddy/main), so the badge keeps tracking one branch — locally, without `STRYKER_DASHBOARD_API_KEY`, it writes an HTML report to `web/reports/mutation/index.html`.

Adding a file to `mutate` in [`stryker.config.mjs`](../../web/stryker.config.mjs) means first drawing a line inside it: every file in that list pairs pure exported logic with a `// Stryker disable all` region around whatever I/O it sits beside. Mutating a `fetch` call scores how elaborately the network was faked, which is not worth a number. Where a mutant is genuinely equivalent — a check the type system needs but the runtime does not — say so with `// Stryker disable next-line all` and a comment explaining why, rather than writing a test that cannot fail.

## Coverage floors

`vitest.config.ts` carries a global floor plus per-file 100% floors for the pure, high-risk modules. The global floor is not auto-updated: raise it by hand when coverage genuinely improves, and never lower it to make a change fit. It had been left about 16 points below what the suite actually achieved, which meant half the tests could have been deleted with CI still green.

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

If you ever apply a migration outside the pipeline (SQL editor, `db push` by hand), send `notify pgrst, 'reload schema'` afterwards. PostgREST serves from a cached schema, so until it reloads, every write naming a newly added column fails with `PGRST204: Could not find the 'x' column of 'items' in the schema cache` — the table is fine, the API just hasn't noticed. Most Supabase projects have a `pgrst_ddl_watch` event trigger that does this automatically; this one doesn't, and can't, since creating an event trigger needs superuser and `postgres` isn't. The `migrate` job sends it on every run, so migrations that go through `main` are covered.

A migration that touches `storage.objects` can create and drop _policies_ on it, but not indexes or anything else needing ownership: hosted Supabase owns that table as `supabase_storage_admin` and never grants it to `postgres`, so `create index` on it raises `42501` for every role available to us. An earlier migration carried such an index for a year, which meant that file — one transaction — had never applied anywhere, locally or in production, while the repo and its docs described it as live.

### Squashing migrations again

`supabase/migrations/` was squashed once already, down to a seven-file baseline (`0001` to `0007`); six more have been added on top of it since (`0008` to `0013`). See [Design decisions](../explanation/design-decisions.md#why-the-migrations-were-squashed) for why the original sixteen were squashed and how that baseline was verified. Squashing again is a deliberate, occasional act, not routine, and it folds the whole current set, not just the original seven.

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
