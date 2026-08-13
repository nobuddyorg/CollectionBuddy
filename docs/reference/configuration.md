# Configuration reference

## Web app environment variables

Set in `web/.env.local` (see `web/.env.example`). Both are required — the Supabase client throws at import time if either is missing.

| Variable                        | Local default                                           | Production                       |
| ------------------------------- | ------------------------------------------------------- | -------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`      | `http://127.0.0.1:54321` (matches `supabase start`)     | Your Supabase project's API URL  |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase's well-known local dev anon key (not a secret) | Your Supabase project's anon key |

There's no separate API key for place search/geocoding — that uses the free public [Photon](https://photon.komoot.io/) API directly from the client, unauthenticated.

## Google OAuth

Required even for local development — see [CONTRIBUTING.md](../../CONTRIBUTING.md#local-development) for the exact steps (creating the OAuth client, the redirect URI, and the two `GOTRUE_EXTERNAL_GOOGLE_*` environment variables `supabase start` needs). Those map into `supabase/config.toml`'s `[auth.external.google]` block.

## Local Supabase stack ports

From `supabase/config.toml`:

| Service                       | Port  |
| ----------------------------- | ----- |
| API                           | 54321 |
| Postgres                      | 54322 |
| Studio (dashboard UI)         | 54323 |
| Inbucket (local mail capture) | 54324 |

Project-level storage limit is 50 MiB (`[storage]`), though the `item-images` bucket itself is further restricted to 5 MiB per file and `image/webp`/`image/jpeg`/`image/png` only (see [Architecture reference](architecture.md#storage)).

## GitHub Actions secrets

| Secret                          | Used by                                                                       | Required?                                                                                                                                              |
| ------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `NEXT_PUBLIC_SUPABASE_URL`      | `ci.yml`, `pages-deploy.yml`, `keep-alive.yml`, `cleanup-orphaned-photos.yml` | Yes                                                                                                                                                    |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `ci.yml`, `pages-deploy.yml`, `keep-alive.yml`                                | Yes                                                                                                                                                    |
| `SUPABASE_DB_URL`               | `pages-deploy.yml` (`migrate` job)                                            | Yes — session-pooler connection string; `db push` uses it                                                                                              |
| `SUPABASE_ACCESS_TOKEN`         | `pages-deploy.yml` (`migrate` job), `cleanup-orphaned-photos.yml`             | Yes — management-API token, used for the PostgREST schema reload and, in the cleanup job, to run the orphan query and fetch a fresh `service_role` key |
| `SUPABASE_PROJECT_REF`          | `pages-deploy.yml` (`migrate` job), `cleanup-orphaned-photos.yml`             | Yes — names the project for those same calls                                                                                                           |
| `STRYKER_DASHBOARD_API_KEY`     | `ci.yml` (`mutation_test` job)                                                | No — without it, Stryker just skips the dashboard reporter and writes a local HTML report instead.                                                     |

## Coverage and mutation thresholds

Defined in [`web/vitest.config.ts`](../../web/vitest.config.ts) (`test.coverage.thresholds`) and [`web/stryker.config.mjs`](../../web/stryker.config.mjs):

- Global coverage floor is raised **by hand** (`autoUpdate: false`) as real coverage improves, and never edited down — so a regression fails CI. It auto-ratcheted once and was turned off: it wrote the local measurement straight back into the file after every run, including values CI could not reach, so a green local run kept producing a red PR.
- Most of the pure, high-risk modules (see [Design decisions](../explanation/design-decisions.md#why-mutation-testing-is-scoped-to-a-handful-of-files)) additionally have a 100% per-file coverage floor and a mutation-score break threshold of 90 (the two `Map/` hooks, `usePlaces.tsx` and `useCurrentLocation.ts`, are mutation-tested without a per-file floor).
- Mutation testing runs on every PR, not only on `main`. Only `main` publishes to the dashboard, so the badge tracks one branch.

## End-to-end tests

[`web/playwright.config.ts`](../../web/playwright.config.ts), specs in `web/e2e/`. Two projects — desktop Chrome and a Pixel 7 viewport — run against the built export in CI and against the deployed site after a release.

| Variable                   | Effect                                                                                                         |
| -------------------------- | -------------------------------------------------------------------------------------------------------------- |
| _(unset)_                  | Builds nothing; serves `web/out` under the base path and tests that.                                           |
| `E2E_BASE_URL`             | Tests a deployed origin instead, and starts no server.                                                         |
| `E2E_PORT`                 | Port for the local server (default `4173`).                                                                    |
| `E2E_SUPABASE_URL`         | Adds the `setup` and `signed-in` projects. Unset, they do not exist, so `npm run e2e` needs nothing installed. |
| `E2E_SUPABASE_ANON_KEY`    | Used by the setup step to sign the test user in.                                                               |
| `E2E_SUPABASE_SERVICE_KEY` | Used _only_ to create that user — `service_role` has no table grants.                                          |

`npm run e2e:local` sets all three from `supabase status` and builds the bundle against the local stack. Point it at anything other than a local stack and it would seed a real database, which is why nothing reads these from a deployed project's secrets.

No retries locally — a page that fails one run in ten fails for a tenth of visitors — and two against a remote target, where a retry separates a broken deploy from a dropped connection.

## i18n

Two languages, German (`de`, default) and English (`en`) — [`web/src/app/i18n/de.json`](../../web/src/app/i18n/de.json) / `en.json`. Keys are grouped by feature area: `brand`, `page`, `header`, `category_select`, `item_create`, `item_list`, `google_sign_in_button`, `login_page`, `common`. A parity test (`web/src/app/i18n/parity.test.ts`) scans every `t('…')` call site in the source and fails if a key is missing from either JSON file, or if the two files don't declare exactly the same set of keys — so a key can't be renamed in code without updating both translations, and a translation can't be added to one language and silently missing from the other.
