# Contributing to CollectionBuddy

## Local development

CollectionBuddy needs a Supabase backend (Postgres + Auth + Storage) to run
at all -- there is no mock/offline mode. The steps below set up the local
stack that ships in [`supabase/`](supabase/).

1. Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
    and Docker (the CLI runs the local stack in containers).

2. From the repository root, start the local stack and apply migrations:

    ```bash
    supabase start
    supabase db reset
    ```

    This runs Postgres, Auth (GoTrue), Storage, Studio, and Inbucket. `supabase start`
    prints the local API URL and anon key -- they match the defaults in
    `web/.env.example`, so you normally don't need to change anything.

    Google is the only sign-in provider, and it needs OAuth credentials even
    for local development -- without them, sign-in fails silently on an
    otherwise-normal-looking dev server. Export these before `supabase start`
    (a [Google OAuth client](https://console.cloud.google.com/apis/credentials)
    with `http://127.0.0.1:54321/auth/v1/callback` as an authorized redirect URI works):

    ```bash
    export GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID=...
    export GOTRUE_EXTERNAL_GOOGLE_SECRET=...
    ```

3. Set up the web app's environment and dependencies:

    ```bash
    cd web
    cp .env.example .env.local
    npm install
    npm run dev
    ```

    The app is now at `http://localhost:3000`.

## Commit hooks

[prek](https://github.com/j178/prek) runs the checks in
[`.pre-commit-config.yaml`](.pre-commit-config.yaml) against each commit.
Install it once, then install the hook:

```bash
prek install
```

`pre-commit` works too — the config is the standard format, and prek is just
a faster runner for it.

To run everything over the whole repo without committing:

```bash
prek run --all-files
```

Most of it is file hygiene and spell checking, plus:

- **[zizmor](https://docs.zizmor.sh/)** — security analysis of the GitHub
  Actions workflows. This is why every action is pinned to a commit hash
  rather than a tag: a tag can be repointed at new code, a hash cannot.
  Dependabot moves the hashes.
- **markdownlint** and **shellcheck** for the docs and `build.sh`.
- **ESLint / Prettier / TypeScript** for `web/`, so a commit is checked
  before it is made rather than after CI says so.

CI runs the same config (minus the three `web/` hooks, which duplicate what
the build job already does).

## Before opening a pull request

From `web/`, in this order:

```bash
npm run build
npx tsc --noEmit
npx prettier --check .
npm run lint
npm test -- --coverage
npm run e2e
npm run test:mutation
```

The build goes first on purpose: `next build` generates `next-env.d.ts` (gitignored), and
both `tsc` and ESLint need it on a clean checkout. These are the same checks CI runs (see
[`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

Two of them are easy to skip and shouldn't be. `npm test` on its own does not
enforce the coverage floors -- only `--coverage` does, which is what CI uses.
And `npm run e2e` needs `npm run build` first: it drives the built export, not
the dev server.

If your change touches the catalogue, search, the map, the entry forms,
photographs, exporting, or any row-level security policy, also run the
signed-in suite against a local database:

```bash
supabase start   # from the repository root
cd web && npm run e2e:local
```

## Architecture constraints worth knowing

- The app is a **static export** (`output: 'export'` in `next.config.ts`).
  There is no server runtime and no route handlers -- almost every
  component is a client component, and `layout.tsx` is the only server
  component; it renders once at build time, before any user session
  exists. Authorization is enforced entirely by Postgres Row Level
  Security, not by server code.
- Database changes go through a migration in `supabase/migrations/`, applied
  locally with `supabase db reset`.
