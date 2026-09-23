# Contributing to CollectionBuddy

CollectionBuddy needs a Supabase backend to run at all; there is no mock
mode. The local stack in [`supabase/`](supabase/) runs one in Docker.

## Prerequisites

- **Node.js 22** — CI pins 22.x, and the test setup relies on Node 22
  behaviour.
- **Docker**, running.
- **[Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
  2.110.0** — the version CI pins and applies the migrations with.

## Try the local demo

The fastest way to run the app. No Google account, no OAuth credentials:

```bash
supabase start && supabase db reset   # repository root
cd web && npm install && npm run demo # http://localhost:3000
```

Demo mode signs every visitor in as a fresh anonymous Supabase user, so there
is no login screen. It is for one person on their own machine: anonymous
users cannot share with each other, and signing out starts a new, empty one.
Data lives in the Docker volume until `supabase db reset` or `supabase stop`.

## Local development

Google OAuth is the only real sign-in, and it needs credentials even locally
— without them the dev server looks normal and sign-in fails silently.

1. Create a [Google OAuth client](https://console.cloud.google.com/apis/credentials)
   with `http://127.0.0.1:54321/auth/v1/callback` as an authorized redirect URI.
2. Export its credentials **before** starting the stack, then run the app:

   ```bash
   export GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=...
   export GOTRUE_EXTERNAL_GOOGLE_SECRET=...
   supabase start && supabase db reset      # repository root
   cd web && cp .env.example .env.local && npm install && npm run dev
   ```

`.env.example` already holds the local stack's URL and anon key.

## Commit hooks

[prek](https://github.com/j178/prek) runs [`.pre-commit-config.yaml`](.pre-commit-config.yaml)
on every commit; `pre-commit` reads the same file:

- file hygiene, `typos`, `markdownlint`;
- gitleaks over the staged changes: service-role keys and database URLs
  block the commit, anon keys pass ([`.gitleaks.toml`](.gitleaks.toml));
- `zizmor` and `actionlint` over `.github/` — security, then syntax,
  expression types, job references, and ShellCheck on workflow `run:` blocks
  when `shellcheck` is on your `PATH` (CI's runner has it; composite actions'
  own scripts are not checked);
- `sqlfluff-lint` over `supabase/`, and Squawk over new migrations for lock
  and rewrite hazards ([`.squawk.toml`](.squawk.toml));
- lockfile-lint on `web/package-lock.json`: every package from
  `registry.npmjs.org`, over HTTPS, with an integrity hash;
- the same format/lint/type/architecture/dead-code checks CI runs in `web/`.

```bash
prek install           # once
prek run --all-files   # everything, without committing
```

## Before opening a pull request

From `web/`, in this order — `build` generates `next-env.d.ts`, which `tsc`
and ESLint need:

```bash
npm run build
npx tsc --noEmit
npx prettier --check .
npm run lint
npm run depcruise
npm run knip
npm test -- --coverage
npm run e2e
```

These are CI's `build_and_test` job. The rest of CI is required when your
change touches what it covers; the ones below `test:mutation` need the local
stack (`supabase start` from the repository root):

| Command | Required when you touched | CI job |
| --- | --- | --- |
| `npm run test:mutation` | code in a file listed in `web/mutation-targets.mjs` (comments produce no new mutants) | `mutation_test` |
| `npm run e2e:local` | catalogue, search, map, entry forms, photos, sharing, export/import, or any RLS policy | `e2e_local_stack` |
| `supabase test db` (repository root) | RLS policies, grants, triggers, functions, or the schema | `e2e_local_stack` |
| `supabase/splinter.sh` (repository root, needs `psql`) | RLS policies, grants, triggers, functions, or the schema | `e2e_local_stack` |
| `opengrep scan --config auto web/src web/scripts web/e2e supabase` | anything under those paths | `opengrep` |
| `npm run lighthouse` | anything that ships in the bundle | `lighthouse` |
| OWASP ZAP baseline | response headers, CSP, the login page | `zap_baseline` |

The [developer guide](docs/how-to/developer-guide.md) has each one's install
steps, what it reads, and how to interpret a failure. On a PR, CI skips jobs
whose paths did not change; the local list above is not conditional.

## What a pull request says

- **Any change under `supabase/migrations/`** is called out as
  security-relevant, with one line on what it now allows or denies. RLS is
  this app's only authorization boundary.
- **A migration that alters an existing table** or adds a constraint or index
  to one was tested against a populated local database, and the PR says so —
  CI only proves it applies from scratch, production applies it to live rows
  with no staging in between. Recipe: [Change the database schema](docs/how-to/developer-guide.md#change-the-database-schema).
- **A policy, grant, or ownership-trigger change** ships its case in
  `web/e2e/signed-in/rls/` in the same PR.
- **A UI change** ships an end-to-end case for its journey; **a functional
  change** ships a unit test. Which layer proves what:
  [TEST_STRATEGY.md](TEST_STRATEGY.md).
- **A deliberate trade-off** — the obvious version over an abstraction, a
  suppression with its reason — is named, not left for review to find.

Never lower a coverage or mutation threshold to get to green, and never
commit to `main` — the hook blocks it, and `--no-verify` is not the answer.
