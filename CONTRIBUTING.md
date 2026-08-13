# Contributing to CollectionBuddy

## Local development

CollectionBuddy needs a Supabase backend (Postgres + Auth + Storage) to run
at all. There is no mock/offline mode. The steps below set up the local
stack that ships in [`supabase/`](supabase/).

1. Prerequisites:
    - **Node.js 22 or newer.** CI pins 22.x; the test setup relies on Node 22+ behaviour.
    - **Docker**, running: the Supabase CLI runs the local stack in containers.
    - **[Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
      2.110.0.** Both workflows pin that version, so it is the one the migrations are
      exercised against.

2. From the repository root, start the local stack and apply migrations:

    ```bash
    supabase start
    supabase db reset
    ```

    This runs Postgres, Auth (GoTrue), Storage, Studio, and Inbucket. `supabase start`
    prints the local API URL and anon key. They match the defaults in
    `web/.env.example`, so you normally don't need to change anything.

    Google is the only sign-in provider, and it needs OAuth credentials even
    for local development. Without them, sign-in fails silently on an
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
[`.pre-commit-config.yaml`](.pre-commit-config.yaml) against each commit:
file hygiene, spell checking, and (for `web/`) the same lint/format/type
checks CI runs. Install it once, then install the hook:

```bash
prek install
```

`pre-commit` works too. The config is the standard format, and prek is just
a faster runner for it. To run everything over the whole repo without
committing:

```bash
prek run --all-files
```

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

These are the same checks CI runs. See the [developer
guide](docs/how-to/developer-guide.md#run-the-checks-ci-runs-locally) for why
the order matters and what each one catches.

If your change touches the catalogue, search, the map, the entry forms,
photographs, exporting, or any row-level security policy, also run the
signed-in suite against a local database:

```bash
supabase start   # from the repository root
cd web && npm run e2e:local
```

For anything past this checklist (changing the database schema, deploying,
setting up a new Supabase environment), see the [developer
guide](docs/how-to/developer-guide.md).
