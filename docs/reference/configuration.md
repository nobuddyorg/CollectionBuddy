# Configuration reference

## Web app environment variables

`web/.env.local`, from `web/.env.example`. Both are required; the Supabase client throws at import time without them.

| Variable | Local | Production |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `http://127.0.0.1:54321` | The project's API URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase's well-known local anon key | The project's anon key |
| `NEXT_PUBLIC_DEMO_MODE` | `true` signs every visitor in anonymously; `npm run demo` sets it | unset |

Place search uses the public [Photon](https://photon.komoot.io/) API unauthenticated; there is no key.

## Google OAuth

`supabase start` reads `GOTRUE_EXTERNAL_GOOGLE_CLIENT_ID` and `GOTRUE_EXTERNAL_GOOGLE_SECRET` into `supabase/config.toml`'s `[auth.external.google]` block. Setup: [CONTRIBUTING.md](../../CONTRIBUTING.md#local-development).

## Local Supabase stack

From `supabase/config.toml`: API `54321`, Postgres `54322`, Studio `54323`, Mailpit `54324`. Anonymous sign-ins are enabled for demo mode. The project-level storage limit is 50 MiB; the `item-images` bucket is further restricted to 5 MiB per file and `image/webp`, `image/jpeg`, `image/png` ([Architecture](architecture.md#storage)).

## GitHub Actions secrets

| Secret | Used by | Notes |
| --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | `ci.yml`, `pages-deploy.yml`, `keep-alive.yml`, `cleanup-orphaned-photos.yml` | Required |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `ci.yml`, `pages-deploy.yml`, `keep-alive.yml` | Required |
| `SUPABASE_DB_URL` | `pages-deploy.yml` (`migrate`) | Required. The **session pooler** string (`aws-0-<region>.pooler.supabase.com`), password percent-encoded. The direct `db.<ref>.supabase.co` host is IPv6-only and unreachable from GitHub runners; `supabase link` reports success anyway and the push fails. |
| `SUPABASE_ACCESS_TOKEN` | `pages-deploy.yml` (`migrate`), `cleanup-orphaned-photos.yml` | Required. Management-API token: reloads the PostgREST schema cache after a migration; in the cleanup job, runs the orphan query and fetches a fresh `service_role` key. Without it `migrate` returns 401 and the deploy stops. |
| `SUPABASE_PROJECT_REF` | same two | Required |
| `STRYKER_DASHBOARD_API_KEY` | `ci.yml` (`mutation_test`) | Optional; without it Stryker writes a local HTML report only |

## Coverage and mutation thresholds

| Gate | Where | Value |
| --- | --- | --- |
| Unit coverage, global | `web/vitest.config.mts` `GLOBAL_COVERAGE_THRESHOLDS` | 99% statements, branches, functions, lines |
| Unit coverage, per file | same file, `PER_FILE_FLOOR`, over `mutation-targets.mjs` | 100%, except the two `Map/` hooks in `NO_COVERAGE_FLOOR` |
| Mutation score | `web/stryker.config.mjs` `thresholds.break` | 99 — one below the measured 100, so a single new equivalent mutant cannot block unrelated work |
| E2E JS/CSS coverage | `web/e2e/coverage.ts` `COVERAGE_THRESHOLDS` | One floor for the signed-out suite, one for signed-in; source-mapped (`E2E_COVERAGE_SOURCEMAPS=true`) |
| Lighthouse | `web/lighthouserc.signed-out.json`, `.signed-in.json` | Performance, best-practices and SEO scores plus LCP, TBT, CLS; set from a measured baseline with margin |

Every floor is raised by hand when a real run reports a higher number, and never lowered to make a change fit. `autoUpdate` is off in Vitest: it wrote the local measurement back into the config after every run, so a green local run produced a red PR.

Stryker runs Vitest through `web/vitest.mutation.config.mts`, which only changes `test.reporters`: Vitest adds a `github-actions` annotation reporter under `GITHUB_ACTIONS`, and a killed mutant is an expected test failure that would otherwise become a workflow annotation.

## CI job summaries

Each job writes its report to its own Actions summary (`$GITHUB_STEP_SUMMARY`); nothing posts a PR comment, and Codecov's comment is off in [`codecov.yml`](../../codecov.yml).

| Job | Summary | Source |
| --- | --- | --- |
| `build_and_test` | Coverage against the thresholds above | `davelosert/vitest-coverage-report-action` over the `json-summary` reporter |
| `build_and_test` | Signed-out e2e results | `daun/playwright-report-summary` over the `json` reporter |
| `build_and_test` | `depcruise` and `knip` output | The step's text, `tee`'d into the summary; Knip prints nothing when clean, so the summary says so |
| `e2e_local_stack` | pgTAP results; signed-in e2e results | `pg_prove` output; the same Playwright action |
| `mutation_test` | Mutation score, overall and per file | `web/scripts/mutation-summary.mjs` over Stryker's `json` reporter |
| `opengrep` | Finding count, total and by rule | `jq` over the uploaded SARIF |
| `lighthouse` | Scores, LCP, CLS against each page's thresholds | `web/scripts/lighthouse-summary.mjs` over each target's `manifest.json` |
| `build_and_test`, `e2e_local_stack` | Non-blocking accessibility findings | `web/e2e/axe.ts` `reportNonBlockingFindings`, from inside the test, CI only |
| `zap_baseline` | PASS/WARN/IGNORE/FAIL per rule, per pass | `report_md.md` written by `zaproxy/action-baseline` |

## End-to-end tests

[`web/playwright.config.ts`](../../web/playwright.config.ts), specs in `web/e2e/`. Projects: `chromium` (Desktop Chrome), `mobile` (Pixel 7), `firefox`; with a local stack also `setup` and `signed-in`.

| Variable | Effect |
| --- | --- |
| _(unset)_ | Serves `web/out` under the base path and tests it |
| `E2E_BASE_URL` | Tests that origin instead; starts no server; `retries: 2` |
| `E2E_PORT` | Local server port, default `4173` |
| `E2E_SUPABASE_URL` | Enables the `setup` and `signed-in` projects |
| `E2E_SUPABASE_ANON_KEY` | Signs the test user in |
| `E2E_SUPABASE_SERVICE_KEY` | Creates the test user, nothing else — `service_role` has no table grants |
| `E2E_COVERAGE_SOURCEMAPS` | `true` makes `next build` emit source maps so the coverage report maps to `src/app/**` |

`npm run e2e:local` sets the three `E2E_SUPABASE_*` values from `supabase status` and builds the bundle against the local stack; nothing reads them from a deployed project's secrets, because the suite seeds whatever database it is pointed at. Retries are `0` locally: a page that fails one run in ten fails for a tenth of visitors.

## i18n

German (`de`, default) and English (`en`): [`web/src/app/i18n/de.json`](../../web/src/app/i18n/de.json), `en.json`, keys grouped by area (`brand`, `page`, `header`, `category_select`, `item_create`, `item_list`, `google_sign_in_button`, `login_page`, `common`). `web/src/app/i18n/parity.test.ts` scans every `t('…')` call site and fails on a key missing from either file or on the two files declaring different key sets.
