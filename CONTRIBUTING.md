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

    This runs Postgres, Auth (GoTrue), Storage, Studio, and Mailpit. `supabase start`
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

## Try the local demo

Want to see the app without a Google account or OAuth credentials? Skip
step 2's Google setup above and run the demo build instead of `npm run dev`:

```bash
supabase start
supabase db reset
cd web
npm install
npm run demo
```

`npm run demo` points the app at your local stack and turns on demo mode:
every visitor is signed in automatically, as a fresh anonymous Supabase
user, so there's no login screen and nothing to sign up for. It's meant
for one person browsing on their own machine — there's no sharing between
anonymous users, and signing out (the account menu in the header) starts a
new, empty one. The data itself lives in the Docker volume `supabase
start` created, so it survives restarts until you run `supabase db reset`
or tear the stack down.

## Commit hooks

[prek](https://github.com/j178/prek) runs the checks in
[`.pre-commit-config.yaml`](.pre-commit-config.yaml) against each commit:
file hygiene, spell checking, SQL linting (`sqlfluff`, over
`supabase/migrations/` and `supabase/tests/database/`, config in
[`.sqlfluff`](.sqlfluff)), and (for `web/`) the same lint/format/type checks
CI runs. Install it once, then install the hook:

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
npm run depcruise
npm run knip
npm test -- --coverage
npm run e2e
npm run test:mutation
```

These are the same checks CI runs. See the [developer
guide](docs/how-to/developer-guide.md#run-the-checks-ci-runs-locally) for why
the order matters and what each one catches.

### General-purpose static analysis (Opengrep)

CI also runs [Opengrep](https://opengrep.dev/) (an LGPL fork of the Semgrep
engine) over `web/src`, `web/scripts`, `web/e2e` and `supabase`, uploading
SARIF to GitHub's code-scanning Security tab. It's a standalone binary, not
an npm dependency, so it isn't part of the `web/` checklist above; to
reproduce a run locally:

```bash
curl -fsSL https://raw.githubusercontent.com/opengrep/opengrep/main/install.sh | bash -s -- -v v1.30.0
"$HOME/.opengrep/cli/latest/opengrep" scan --config auto \
  web/src web/scripts web/e2e supabase
```

`--config auto` fetches Semgrep's public community rule pack anonymously (no
account or API key); see [TEST_STRATEGY.md](TEST_STRATEGY.md) for what it
covers and why it's CI-only rather than a `prek` hook.

If your change touches the catalogue, search, the map, the entry forms,
photographs, sharing, exporting, or any row-level security policy, also run
the signed-in suite against a local database:

```bash
supabase start   # from the repository root
cd web && npm run e2e:local
```

### Performance budgets (Lighthouse CI)

CI also runs [Lighthouse CI](https://github.com/GoogleChrome/lighthouse-ci)
against the real production export — signed out (the plain static build) and
signed in (demo mode against a local Supabase stack) — never against `next
dev`. It's CI-only, not part of the `web/` checklist above or a `prek` hook:
building twice, serving each build, and running headless Chrome against it is
the same cost class as the e2e suite, which is already CI-only. To reproduce
a run locally:

```bash
supabase start   # from the repository root
cd web && npm run lighthouse
```

See [TEST_STRATEGY.md](TEST_STRATEGY.md) for the measured baseline the
thresholds are set against and how the accessibility-category overlap with
`@axe-core/playwright` (above) is handled.

If your change touches a row-level security policy, a grant, an
ownership-affecting trigger, or the schema more generally, also run the
pgTAP database suite (`supabase/tests/database/`) against the local stack.
It complements `e2e:local`'s `rls.spec.ts` rather than duplicating it: pgTAP
runs fast, function/schema-level assertions directly against Postgres,
inside a transaction that rolls back, by impersonating the `authenticated`
and `anon` roles the way PostgREST itself does; the Playwright suite is
what proves the same policies hold through a real request carrying a real
JWT. See [TEST_STRATEGY.md](TEST_STRATEGY.md) for the full division of
labor.

```bash
supabase start   # from the repository root, if not already running
supabase test db
```

For anything past this checklist (changing the database schema, deploying,
setting up a new Supabase environment), see the [developer
guide](docs/how-to/developer-guide.md).
