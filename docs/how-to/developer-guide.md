# Developer guide

Task-oriented recipes for contributing to or operating CollectionBuddy. For the day-to-day local setup (Docker, Supabase, Google OAuth, `npm run dev`) and the pre-PR checklist, see [CONTRIBUTING.md](../../CONTRIBUTING.md) — this guide covers everything past that.

## Run the checks CI runs, locally

From `web/`:

```bash
npm run lint
npx prettier --check .
npx tsc --noEmit
npm test -- --coverage
npm run build
```

These match [`ci.yml`](../../.github/workflows/ci.yml) exactly, in the order it runs them.

## Run mutation testing

A separate, slower check from the unit test suite — see [Design decisions](../explanation/design-decisions.md#why-mutation-testing-is-scoped-to-a-handful-of-files) for why it's scoped the way it is.

```bash
cd web
npm run test:mutation
```

CI only runs this on push to `main` (not per-PR), and publishes a report to the [Stryker dashboard](https://dashboard.stryker-mutator.io/reports/github.com/nobuddyorg/CollectionBuddy/main) when `STRYKER_DASHBOARD_API_KEY` is set — locally, without that variable, it just writes an HTML report to `web/reports/mutation/index.html`.

## Change the database schema

Every schema change goes through a new migration file, never an edit to an existing one:

1. Add a new `supabase/migrations/NNNN_description.sql` file (next number after the highest existing one — check `ls supabase/migrations/`).
2. Apply it locally: `supabase db reset` (re-runs every migration from scratch against your local stack).
3. Update `web/src/app/data/database.types.ts` to match — `supabase gen types typescript --local`, or by hand.
4. See [Architecture reference](../reference/architecture.md#database-schema) for what's already there, so your migration doesn't duplicate an existing table, trigger, or index.
5. Merging to `main` applies it to production — see below. Nothing needs applying by hand.

If you ever apply a migration outside the pipeline (SQL editor, `db push` by hand), send `notify pgrst, 'reload schema'` afterwards. PostgREST serves from a cached schema, so until it reloads, every write naming a newly added column fails with `PGRST204: Could not find the 'x' column of 'items' in the schema cache` — the table is fine, the API just hasn't noticed. Most Supabase projects have a `pgrst_ddl_watch` event trigger that does this automatically; this one doesn't, and can't, since creating an event trigger needs superuser and `postgres` isn't. The `migrate` job sends it on every run, so migrations that go through `main` are covered.

A migration that touches `storage.objects` can create and drop *policies* on it, but not indexes or anything else needing ownership: hosted Supabase owns that table as `supabase_storage_admin` and never grants it to `postgres`, so `create index` on it raises `42501` for every role available to us. An earlier migration carried such an index for a year, which meant that file — one transaction — had never applied anywhere, locally or in production, while the repo and its docs described it as live.

### Migrations

The seven files in `supabase/migrations/` are a squashed baseline, taken on 2026-08-06 and replacing the sixteen that came before. Those sixteen had reached the point where a third of their statements existed only to undo an earlier file: a table created and dropped, two full-text-search columns added and removed, one trigger written three times and then deleted. Reading them told you the history but not the schema.

The baseline was verified rather than asserted: the local stack was reset from it, both databases were introspected down to column defaults, constraint expressions, index definitions, function bodies, trigger timing, policy predicates and grants, and the two were diffed. The only differences left were local-stack platform defaults that no migration here sets.

Squashing again is a deliberate, occasional act, not routine. It needs the same verification, and it needs `supabase_migrations.schema_migrations` on the hosted project cleared so the new files are recorded as themselves. That table is the only reason the chain can't simply be rewritten in place.

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
3. Add `SUPABASE_DB_URL` — the **session pooler** connection string, Project Settings → Database → Connection string → Session pooler, with the password filled in and percent-encoded. The `migrate` job uses only this. It must be the pooler host (`aws-0-<region>.pooler.supabase.com`), not `db.<ref>.supabase.co`: the direct host is IPv6-only and GitHub runners have no IPv6, and `supabase link` does not paper over this — it reports success and the subsequent push fails anyway.
4. If the repo isn't named `CollectionBuddy`, update the `repo` constant in `web/next.config.ts` — the production `basePath` (`/CollectionBuddy`) is derived from it, and a mismatch breaks every static asset path on Pages.
5. Optional: add `STRYKER_DASHBOARD_API_KEY` as a secret if you want mutation-test reports published (see above).
6. Optional: if your Supabase project is on the free tier, keep [`keep-alive.yml`](../../.github/workflows/keep-alive.yml) enabled (it's on by default) — it pings a `keepalive()` RPC daily so the project doesn't auto-pause from inactivity.
