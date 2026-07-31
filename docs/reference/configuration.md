# Configuration reference

## Web app environment variables

Set in `web/.env.local` (see `web/.env.example`). Both are required — the Supabase client throws at import time if either is missing.

| Variable | Local default | Production |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` (matches `supabase start`) | Your Supabase project's API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase's well-known local dev anon key (not a secret) | Your Supabase project's anon key |

There's no separate API key for place search/geocoding — that uses the free public [Photon](https://photon.komoot.io/) API directly from the client, unauthenticated.

## Google OAuth

Required even for local development — see [CONTRIBUTING.md](../../CONTRIBUTING.md#local-development) for the exact steps (creating the OAuth client, the redirect URI, and the two `GOTRUE_EXTERNAL_GOOGLE_*` environment variables `supabase start` needs). Those map into `supabase/config.toml`'s `[auth.external.google]` block.

## Local Supabase stack ports

From `supabase/config.toml`:

| Service | Port |
| --- | --- |
| API | 54321 |
| Postgres | 54322 |
| Studio (dashboard UI) | 54323 |
| Inbucket (local mail capture) | 54324 |

Project-level storage limit is 50 MiB (`[storage]`), though the `item-images` bucket itself is further restricted to 5 MiB per file and `image/webp`/`image/jpeg`/`image/png` only (see [Architecture reference](architecture.md#storage)).

## GitHub Actions secrets

| Secret | Used by | Required? |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `ci.yml`, `pages-deploy.yml`, `keep-alive.yml` | Yes |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `ci.yml`, `pages-deploy.yml`, `keep-alive.yml` | Yes |
| `STRYKER_DASHBOARD_API_KEY` | `ci.yml` (`mutation_test` job) | No — without it, Stryker just skips the dashboard reporter and writes a local HTML report instead. |

## Coverage and mutation thresholds

Defined in [`web/vitest.config.ts`](../../web/vitest.config.ts) (`test.coverage.thresholds`) and [`web/stryker.config.mjs`](../../web/stryker.config.mjs):

- Global coverage floor auto-ratchets upward (`autoUpdate: true`) as real coverage improves — it's never edited down, so a regression fails CI.
- A handful of pure, high-risk modules (see [Design decisions](../explanation/design-decisions.md#why-mutation-testing-is-scoped-to-a-handful-of-files)) additionally have a 100% per-file coverage floor and a mutation-score break threshold of 90.

## i18n

Two languages, German (`de`, default) and English (`en`) — [`web/src/app/i18n/de.json`](../../web/src/app/i18n/de.json) / `en.json`. Keys are grouped by feature area: `page`, `header`, `category_select`, `item_create`, `item_list`, `google_sign_in_button`, `login_page`, `common`. A parity test (`web/src/app/i18n/parity.test.ts`) scans every `t('…')` call site in the source and fails if a key is missing from either JSON file, or if the two files don't declare exactly the same set of keys — so a key can't be renamed in code without updating both translations, and a translation can't be added to one language and silently missing from the other.
