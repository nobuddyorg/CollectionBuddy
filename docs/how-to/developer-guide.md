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

A separate, slower check from the unit test suite — see [Design decisions](../explanation/design-decisions.md#why-mutation-testing-is-scoped-to-five-files) for why it's scoped the way it is.

```bash
cd web
npm run test:mutation
```

CI only runs this on push to `main` (not per-PR), and publishes a report to the [Stryker dashboard](https://dashboard.stryker-mutator.io/reports/github.com/nobuddyorg/CollectionBuddy/main) when `STRYKER_DASHBOARD_API_KEY` is set — locally, without that variable, it just writes an HTML report to `web/reports/mutation/index.html`.

## Change the database schema

Every schema change goes through a new migration file, never an edit to an existing one:

1. Add a new `supabase/migrations/NNNN_description.sql` file (next number after the highest existing one — check `ls supabase/migrations/`).
2. Apply it locally: `supabase db reset` (re-runs every migration from scratch against your local stack).
3. Update `web/src/app/data/database.types.ts` by hand to match. `supabase gen types typescript --local` is the normal way to do this, but it currently can't run against this project locally — `db reset` fails applying `0012_batch_delete_triggers.sql` with "must be owner of table objects" (a permissions gap in the local Supabase stack, not a real schema problem). Until that's fixed, keep the types file in sync manually.
4. See [Architecture reference](../reference/architecture.md#database-schema) for what's already there, so your migration doesn't duplicate an existing table, trigger, or index.

## Set up a new Supabase environment (e.g. for a fork, or production)

The local stack in `supabase/` and a real hosted Supabase project need the same setup, done twice:

1. Create a Supabase project (or use the local CLI stack — see CONTRIBUTING.md).
2. Apply every migration in `supabase/migrations/`, in order — via `supabase db push` against the hosted project, or by pasting each file into the project's SQL editor.
3. In the project's Auth settings, enable **Google** as a provider and set the same (or a new) OAuth client ID/secret, with a redirect URI of `<project-url>/auth/v1/callback`.
4. Note the project's API URL and anon key (Project Settings → API) — these become `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`.

## Deploy to GitHub Pages

The production path is [`pages-deploy.yml`](../../.github/workflows/pages-deploy.yml): push to `main`, and it builds the static export and deploys it via GitHub's official Pages actions. `build.sh` at the repo root does the same build locally, for a sanity check before pushing — it does not deploy anything itself.

One-time setup for a new fork or a repo renamed away from `CollectionBuddy`:

1. Repo Settings → Pages → set the source to **GitHub Actions**.
2. Add repository secrets `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`, pointed at your (non-local) Supabase project.
3. If the repo isn't named `CollectionBuddy`, update the `repo` constant in `web/next.config.ts` — the production `basePath` (`/CollectionBuddy`) is derived from it, and a mismatch breaks every static asset path on Pages.
4. Optional: add `STRYKER_DASHBOARD_API_KEY` as a secret if you want mutation-test reports published (see above).
5. Optional: if your Supabase project is on the free tier, keep [`keep-alive.yml`](../../.github/workflows/keep-alive.yml) enabled (it's on by default) — it pings a `keepalive()` RPC daily so the project doesn't auto-pause from inactivity.
