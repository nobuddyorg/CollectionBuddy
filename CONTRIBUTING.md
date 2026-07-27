# Contributing to CollectionBuddy

## Local development

CollectionBuddy needs a Supabase backend (Postgres + Auth + Storage) to run
at all -- there is no mock/offline mode. The steps below set up the local
stack that ships in [`supabase/`](supabase/).

1.  Install the [Supabase CLI](https://supabase.com/docs/guides/local-development/cli/getting-started)
    and Docker (the CLI runs the local stack in containers).

2.  From the repository root, start the local stack and apply migrations:

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

3.  Set up the web app's environment and dependencies:

    ```bash
    cd web
    cp .env.example .env.local
    npm install
    npm run dev
    ```

    The app is now at `http://localhost:3000`.

## Before opening a pull request

From `web/`:

```bash
npm run lint
npx prettier --check .
npm test
npm run build
```

These are the same checks CI runs (see [`.github/workflows/ci.yml`](.github/workflows/ci.yml)).

## Architecture constraints worth knowing

- The app is a **static export** (`output: 'export'` in `next.config.ts`).
  There is no server runtime and no route handlers -- almost every
  component is a client component, and `layout.tsx` is the only server
  component; it renders once at build time, before any user session
  exists. Authorization is enforced entirely by Postgres Row Level
  Security, not by server code.
- Database changes go through a migration in `supabase/migrations/`, applied
  locally with `supabase db reset`.
