# Test strategy playbook

A portable testing strategy for apps built on the **"thin client, fat
database"** shape: a static or serverless frontend with no backend of its
own, on top of a Postgres database (Supabase, self-hosted PostgREST +
Postgres, or anything with the same properties) whose Row-Level-Security
policies are the **only** authorization boundary in the system.

Not a general "how to test software" essay. It's the distilled,
project-agnostic form of a strategy hardened against a real production app
of exactly this shape, including the mistakes that shape produces if you
don't plan for them. Copy this file into a new project of the same
archetype, then localize it (§16): fill the risk-model template with real
tables and roles, pick a real tool stack, measure real thresholds. Nothing
in this file should reference a real table name, file path, or measured
number — that belongs in the project's own docs, not here.

Two meta-rules the rest of this document assumes: **disagree in the open
rather than departing quietly** — if a task needs something the strategy
rules out, say so and get agreement first; and **update this the moment the
architecture it describes moves** — a strategy nobody updates produces false
confidence at exactly the layer nobody double-checks.

---

## 0. When this applies

- The frontend ships as static files or a thin serverless layer with **no
  server-side authorization code of its own**.
- Postgres RLS is where authorization actually lives, reached through an
  auto-generated REST/GraphQL layer rather than hand-written endpoints.
- The client's token is only as trustworthy as the policies written against
  it — anyone can extract the anon key and issue arbitrary requests, so the
  policies are the entire defense.
- There's probably no staging environment, and migrations likely apply
  straight to production on merge to the default branch.

If a server-side execution surface appears (an Edge Function, a route
handler) or a second authorization layer gets added, this playbook's central
claim — **the database is the only thing that can catch an authorization
bug** — stops holding, and the document needs rethinking, not patching.

---

## 1. Purpose

Keep confidence-per-test high and the feedback loop short by putting each
check at the cheapest level that would actually catch the failure it's aimed
at.

This needs its own document because, per §0, **there is no server**.
Authorization is not layered — a wrong database policy is uncaught by
anything else, and the interface looks completely normal while showing
somebody else's data. Most testing literature skips this because it assumes
a server to fall back on. A strategy that only describes what's already
green isn't a strategy — name the gaps (§16).

---

## 2. System testing context

### Map the shape, for the real project

Write this table into the project's own docs, filled in with its real
pieces:

| Piece | What it is | Testing consequence |
| --- | --- | --- |
| Static/serverless frontend | No route handlers, no server-side auth code | Nothing server-side to unit-test for auth |
| Static host / CDN | Deployment failures are usually path failures, not runtime ones | Needs a real fetch against the deployed origin |
| Postgres database | Tables, functions, triggers, indexes | Behavior in SQL is unreachable from a unit test — needs a real database |
| RLS policies | On every table, and any storage bucket | The entire authorization boundary — §7 |
| Auto-generated API layer | No hand-written API to contract-test | The schema *is* the contract; generated client types drifting from it is a real production failure mode |
| Auth provider | Whatever sign-in flow is used | Interactive sign-in usually can't run in CI; mint sessions via an admin/session API instead |
| Object storage | Size/MIME-limited bucket, files a row merely references | Bytes can't be deleted from SQL; object *paths* are often load-bearing for authorization |
| Third-party services from the browser | Outside your control | Always faked in tests |
| CI/CD | Holds the highest-privilege credentials if anything auto-deploys | The highest-privilege *code* is often bash in a workflow, not app code |

If there's no staging environment and CI applies pending migrations straight
to production, that fact should drive how heavy the pre-merge gate is (§13).

### What the estate should cover, roughly

Not a percentage target — a checklist of *kinds* of coverage that should
each exist somewhere: unit/component (bulk of the estate); a signed-out
browser suite (safe to run against production); a signed-in integration
suite against a real local stack; database tests (pgTAP or equivalent) for
the RLS/authorization matrix; mutation testing on a deliberate subset; fast
static analysis gating everything else; a schema-contract check in CI;
general-purpose SAST; and a post-deploy smoke test against the live URL.

### Trust boundaries to enumerate

1. **Browser bundle → database API.** A user's token crosses it; the bundle
   and anon key are both public, so the only meaningful test is one that
   does exactly what an attacker could: a direct request, bypassing the UI.
2. **One identity → another identity's data**, through whatever
   sharing/delegation exists. The most permissive role a grant can carry
   needs the most scrutiny (§7).
3. **Anonymous → everything.** Usually denied twice: by RLS (predicate never
   matches with no identity) and by an explicit revoke of the table grant.
   Test both — they fail differently (a revoked grant errors before any
   policy runs; a policy filter just returns nothing), and a project can
   have one covered while believing both are.
4. **CI/CD → production.** Whatever holds the highest-privilege credential.
   Rarely covered by a *test*; covered by workflow-scanning tools and review.
5. **App → third-party HTTP.** Always faked; never reached.

---

## 3. Testing principles

1. **Authorization is not testable from the client.** A hidden button proves
   a UX property, nothing more — authorization tests hold a real token and
   talk to a real database.
2. **Never mock the thing that carries the risk.** Mocking the database
   client tests your own call shape, not RLS/triggers/constraints.
3. **Coverage is a signal; mutation score is stronger.** Line coverage says
   the line ran — worthless on its own for pure, high-consequence logic.
4. **Prefer the lowest level with the same confidence.** Pagination math is
   a unit test; *that the UI paginates* is one E2E case, not one per field.
5. **Deterministic or deleted.** No retries to paper over flakiness, except
   the one boundary where a retry distinguishes a real fault from a dropped
   connection (typically post-deploy smoke). A flake is a defect, not
   weather.
6. **Test the failure paths.** Anything that retries, skips-and-continues,
   or is cancellable mid-operation carries a data-loss/duplication risk —
   worth injecting failures into deliberately.
7. **If it's hard to test, fix the design.** Extract pure logic from the I/O
   beside it, then test the extract — don't fake the world instead.
8. **Fixtures may not out-privilege the app.** An elevated/service-role
   credential in a fixture should open exactly one door (creating test
   identities); a fixture that reaches states the app itself couldn't hides
   bugs.
9. **One new behavior, one new assertion, at one level.** Duplicated
   coverage at three levels costs three times as much and catches the bug
   once.

---

## 4. Risk model — a template, not a checklist

Rank by expected cost, not likelihood alone. "Cheapest meaningful test"
means the level below which the risk is genuinely uncovered.

Generalized from what actually tends to go wrong when the database is the
only boundary — copy the columns, replace the rows with the real project's
tables/roles/operations, rank by real cost:

| Risk category | What it typically costs | Cheapest meaningful test |
| --- | --- | --- |
| **Cross-tenant read/write** — a policy stops holding | Silent, total confidentiality failure; UI looks fine | Integration test, real token, real database, bypassing the UI |
| **A permissive grant/role reaches further than intended** (an "editor" can also rename/delete/promote itself) | Privilege escalation between two real accounts | Same, with a second identity holding that role |
| **Orphaned files / data loss on delete** | Storage bytes unreachable, or an attachment silently lost | Unit test for delete ordering; integration test for the cascade |
| **A migration that can't apply to a populated database** | Deploy blocked or half-applied | From-scratch CI catches syntax, not a `NOT NULL` with no default, etc. — §8 |
| **Client/schema drift** | Runtime errors after deploy | A generated-types diff in CI |
| **Injection into a generated query grammar** | User input rewrites the query | Unit + mutation on the filter-builder, plus adversarial E2E input |
| **Export-format injection/corruption** (formula injection, archive-format limits) | A file that damages the opener or won't open | Unit + mutation on the encoding function |
| **Static-hosting/deployment faults** | A site that quietly breaks post-deploy | Serve the real artifact under its real path, locally and deployed |
| **In-client race conditions** | Stale data shown, broken assets | Unit tests on sequencing/caching, not an E2E timing test |
| **Duplicate/repeated operations** | Duplicate records or side effects | Unit tests with injected fakes simulating the retry |
| **Third-party outage** | Degraded feature, not your outage | Unit test on the error branch only |
| **Availability** (free-tier auto-pause) | App down or slow to first response | A keep-alive mitigation, not a test |
| **Destructive scheduled-job logic faults** | Irreversible deletion of live data | No cheap test; dry-run mode + treat the query as security-critical — §12 |
| **Capacity/throughput** | Slow queries at real usage | Index design + query-plan inspection, not a load harness, absent a real SLA |
| **Accessibility regressions** | Unusable with keyboard/screen reader | Static linting for the automatable subset, runtime checks for the rest — §9 |

A project should end up with 10-20 rows like this, each with a "covered /
partly / not covered" status, updated as real incidents happen (§16).

---

## 5. Test layers

| Layer | Verdict, in this archetype | Why |
| --- | --- | --- |
| Unit (pure functions) | **Required** | Where most interestingly-wrong logic lives once extracted from I/O; the only level mutation testing means anything at. |
| Component / hook | **Required** | Rendering faults (hydration mismatches, missing a11y attrs, a control that never disables) are invisible to pure-logic tests. |
| Integration against a real database/storage | **Required, non-negotiable** | The only level RLS, triggers, constraints and the API layer's real behavior exist at all. |
| Service integration (auth, storage, local stack) | **Required** | Session minting, signed URLs, MIME/size limits — real behavior in none of your own code. |
| API testing | **Required, usually not a separate suite** | If the API is auto-generated, this *is* the integration suite issuing direct calls. |
| Contract testing | **Required, narrow form** | The real contract is schema ↔ generated types; Pact-style provider/consumer testing rarely justified without independent deploys on both sides. |
| Authorization/security testing | **Required — highest priority** | §7. |
| Dynamic scanning (DAST) | **Recommended, narrow scope** | A passive baseline scan of the *running* built artifact — headers, cookie flags, passive injection/error-disclosure probes. Distinct from every static tool in §6; complements §7, never a substitute for it — see below. |
| Property-based | **Recommended, narrowly** | §10. |
| Mutation | **Required, deliberately scoped** | §11. |
| E2E (full stack) | **Required, deliberately small** | §9. |
| API fuzzing | **Usually not justified as tooling** | Fuzzing an auto-generated API layer mostly tests the vendor's product; hostile-input unit tests + mutation testing cover what's actually yours. |
| Concurrency testing | **Unit level, unless real multi-writer scenarios exist** | In-client races are common; same-row multi-writer conflicts are rare in single-owner data models. |
| Load testing | **Usually not justified** | Add it only once there's an actual throughput SLA. |
| Resilience/failure injection | **Required at unit level; optional above** | Drive retry/backoff/skip/cancel through injected fakes; the real stack adds cost without proportionate signal. |
| Infrastructure/deployment testing | **Required** | Every migration applied from scratch in CI, and the built artifact served under its real path. |
| Smoke testing | **Required** | Signed-out suite against the deployed origin — a Node prerender can mask failures only visible as a browser bundle. |
| Production synthetic testing | **Optional** | Mostly duplicates post-deploy smoke unless it catches something specific (e.g. a cold-start pause). Never signed-in against production. |

### Who owns which behavior — build this table for the real project

| Behavior class | Owning layer | Not this |
| --- | --- | --- |
| Pure data transforms (filters, pagination, encoding, formatting) | Unit + mutation | Not the browser |
| Rendering, disabled states, focus, keyboard paths, a11y attrs | Component tests | Not E2E, unless the journey depends on it |
| Normalization, ownership rewriting, cleanup jobs, constraints, cascades | Integration, real database | Not unit — doesn't exist in app code |
| Row/object visibility, grant scope, expiry, revocation, anon denial | Integration, second real identity | **Never** client code or a component test |
| Generated client types ↔ schema | Automated contract diff | Not a hand-written assertion |
| Base path, icons, manifest, anything pre-hydration | Signed-out browser suite | Not unit alone |
| One complete user journey | E2E | Not one E2E case per field |
| Migration applicability | CI applying from scratch | Not review-by-eye alone |
| Repo tooling outside the shipped bundle | The job/script that depends on it | Not unit tests, not in bundle coverage |

---

## 6. Architecture-specific strategy

### The shape of the pyramid

Not the usual pyramid — the middle band, integration against a real
database, is unusually load-bearing, since authorization and much business
logic live in SQL and exist nowhere a unit test can reach.

```text
Layer                              Weight           Runs against
---------------------------------  ---------------  --------------------------------
Unit + component                   most of it       fakes/in-memory; a scoped subset
                                                      also mutation-scored
Database tests (pgTAP or similar)  fast, targeted    real Postgres, direct SQL
API-level integration              a wide band       real database + storage, real
                                                      tokens, no browser — mostly auth
Browser, signed-in journeys        one per journey   real stack, real bundle
Browser, signed-out                small             built artifact; also post-deploy
```

Hold this shape deliberately. Two ways it drifts: new policies landing
without the API-level band growing (authorization silently leaving test
coverage — watch this one especially), or the browser bands growing to
assert things a cheaper level could have settled.

### What must be real, and what may be faked

| Thing | Unit/component tests | Integration suite |
| --- | --- | --- |
| Database client | Faked (injected param or module-mocked) | **Real** — one client per identity |
| Postgres, RLS, triggers | Absent — do not simulate | **Real.** The entire point of the suite. |
| Object storage | Faked | **Real**, including MIME/size enforcement |
| Auth/sessions | Faked | **Real**, session minted via admin API |
| Browser-only APIs (Worker, Canvas) | Faked | Real |
| Third-party services | **Always faked** | Always faked |
| Non-deterministic primitives (ids, clocks) | Injected/stubbed | Real |
| Elevated/service-role credential | Never | **Only** to create test identities — §3.8 |

### Managed-service boundaries worth explicit attention

- **Function/edge runtime.** If none exists, say so — the day one is added
  it's the first server-side auth surface and needs its own section.
- **Object storage paths carrying authorization meaning.** A path that fails
  to parse must make a policy **not match**, never abort the statement —
  worth a direct unit test of the fail-closed parser.
- **Schema-cache staleness.** A newly added column can be invisible until
  the API layer's cache reloads; a hand-applied migration needs the same
  reload step an automated deploy gets for free. The one "eventual
  consistency" failure mode here, and it's a deploy-time concern.
- **Row/response caps.** A default row limit silently truncates unranged
  responses — page around it deliberately; test page boundaries with fakes.
- **Partial failure across correlated writes.** If one action produces more
  than one write (e.g. full-size + thumbnail), decide and test the specific
  chosen behavior with an injected failing write, rather than leaving it to
  accident.
- **Local emulation vs. deployed.** If the local stack runs the *same*
  engines in containers, trust its integration results; reserve "only
  provable deployed" for genuinely host-specific behavior (CDN, cold starts).

### Static analysis layering

Four *different* tools answer four different questions — don't let one
stand in for another:

1. **Module-boundary/dependency-graph tool** (e.g. dependency-cruiser) — "does
   an import cross a boundary it shouldn't," by walking the whole graph. The
   one rule worth having from day one: only the data-access layer may import
   the database client directly — a single-file linter can't see an
   *indirect* reach through another module; a graph tool can. Also: no
   import cycles, no orphaned modules, and the shipped bundle never imports
   Node-only tooling that might carry privileged credentials.
2. **Dead-code/unused-dependency tool** (e.g. knip) — "does anything have
   zero reachable consumers." Generated files need an explicit ignore rather
   than hand-editing; anything referenced only as a string inside another
   tool's config needs an explicit entry point.
3. **General-purpose SAST** (e.g. Semgrep/Opengrep community pack) — language-level
   bug/vulnerability shapes nothing else catches. Verify once what it
   actually sends over the network (read the tool's source, not a
   docstring), and graduate findings by severity (block on "error," surface
   "warning"/"info" for triage). Prefer a path-level ignore for "never scan
   this generated file" and an inline per-line suppression for a single false
   positive — every suppression needs its reasoning written down at the
   suppression, and a claimed fix should be verified to actually stop the
   pattern-matcher firing, not just assumed to.
4. **A code-smell/maintainability linter** (cognitive complexity, duplication)
   — catches what a type checker and a graph tool are both blind to. Tune
   defaults against the project's *own* code before accepting them — a
   duplication rule firing on repeated class names is noise, and a
   complexity threshold copied from the default is a guess, not a
   measurement.

For all four: measure real run time before deciding placement. Seconds-scale
belongs in a fast pre-commit/pre-push gate; a live network fetch or cold
binary install belongs in CI only.

### Dynamic scanning (DAST)

Everything in §6 so far is static: it reads source, a dependency graph, or a
findings file. A **baseline (passive-only) scan** — spider plus passive
rules, never an active/attack scan — points a scanner at the *running* app
instead, against an isolated, ephemeral local build, never a deployed
target. It's the only layer that would notice a response header regressing
or a stack trace leaking into rendered HTML — things no static tool sees
because none of them look at real HTTP responses.

- **What it covers**: the same class of finding a SAST tool and static
  accessibility linting cover from other angles — generic
  header/cookie-flag misconfiguration, passive injection/error-disclosure
  probes — observed against real rendered responses instead of source text.
- **What it explicitly does not cover.** A DAST baseline scan never signs
  in with a real identity and never holds a token, so it says nothing about
  the authorization model — that's §7's job, exclusively. Never read a green
  DAST run as authorization coverage.
- **Never scans anything but a local, ephemeral build** — never a deployed
  or production target, signed in or out.
- **Scan more than the entry page** if the app's real content only exists
  once signed in (a login screen alone has almost nothing rendered for a
  content-based finding to hide in) — matching whatever other tooling
  already scans both states (e.g. an accessibility or performance gate).
- **A structurally unfixable static-hosting header stays explicitly
  ignored, not silently unaddressed** — if the hosting platform can't set a
  given security header at all, document why and move on, rather than
  leaving it as permanent unexplained noise.
- **Graduated severity**, same pattern as every other tool in this section:
  a small, deliberate set of findings that block, everything else surfaced
  for triage. Tighten the blocking set only once real scan history justifies it.

---

## 7. Security and authorization testing

**The highest-value testing in this architecture.** There's no second layer
to catch an authorization bug — it fails silently and looks like success.

### Rules

1. Every authorization test holds a **real access token for a real
   identity** and issues requests **directly against the API layer**, not
   through the UI.
2. Every test needs **at least two identities** — a single-identity suite
   only ever makes allowed requests, so it can never notice a broken policy.
3. Assert on the **mechanism, not just the outcome**: an empty result means
   a policy filtered the row; an authorization error means the grant never
   existed. Distinguish both, especially for the no-identity case.
4. Assert that a **satisfiable** filter returns nothing — querying for the
   other identity's known row and getting `[]` is sharper than an unfiltered
   read that merely doesn't contain it.
5. Write-side tests must **read back as the owner** — a write accepted but
   hidden from the writer's own later read is the worst outcome, and only
   that read can rule it out.
6. **Every mirrored authorization surface needs its own test.** A database
   row and a corresponding storage file (or any pair governed by separate
   policies) — a test against one proves nothing about the other.
7. Grants must be tested **in both directions**: an active grant opens
   exactly what it should, *and* revocation/expiry closes it again with the
   resource still present — otherwise "access denied" only proves the
   resource stopped existing.

### The most-permissive role needs the most scrutiny

If sharing has more than one role, the most permissive non-owner role is
where escalation lives. Write out, and test both halves: what it **can** do
inside its granted scope, and what it **cannot** — anything scoped to the
*parent* (rename, delete, manage access, self-promote), reaching an
ungranted resource, or acting after revocation/expiry (asserted with the
resource still present, so the test proves the grant stopped working, not
that the resource vanished).

One asymmetry worth checking and writing down once confirmed: if "can
write" includes ownership of the parent but "can read" requires an active
grant specifically, then **owning the parent doesn't automatically reveal
everything a delegate did inside it** — a legitimate design, easy to mistake
for a bug, worth a named executed test rather than a comment.

Tests asserting only "the client sends the right call" or "the button is
disabled" are UX tests, not a substitute for the above (§3.1).

### Two levels of authorization test

If the platform supports impersonating a role directly against the database
(pgTAP-style, injecting the claims a real token would carry), it
complements full end-to-end tests rather than replacing them:

- **Direct-database tests** prove the policy/trigger logic itself, fast
  enough for every schema change. Verify the impersonation mechanism itself
  works (identical query fails with no claim, passes with one, depends on
  its content) — otherwise a test running with full privileges would
  silently pass everything.
- **End-to-end tests** prove the same properties through the real pipeline
  — a real request, a real minted token — and are usually the only place
  storage-level authorization gets exercised at all.
- Fixtures at either layer still follow §3.8 — impersonate the real
  identity's own role, never a superuser bypass.

A schema change adding or modifying a policy, grant, or ownership-affecting
trigger ships a matching end-to-end case in the same change — a
direct-database case alongside it is encouraged but doesn't discharge this
on its own. State this as an absolute: the failure is invisible, there's no
second layer, and SQL review by eye has a documented history of missing
exactly this class of bug.

### SQL linting is a different concern

A SQL linter answers "is this well-formed," not "is this policy's logic
correct" — it discharges none of the above and adds no authorization
coverage on its own.

### Out of scope, deliberately

Penetration testing the managed platform itself; anything requiring an
anonymous/public share link if the project has ruled that out by design (a
new, higher-risk boundary if ever added, not a checkbox on an existing one);
secret scanning beyond a dedicated hook and the platform's own tooling.

---

## 8. Integration strategy

### Setup that must not be weakened

- **Seed as the user, never through an elevated/service-role bypass.** That
  credential exists only to create test identities — a bypass can construct
  states the app itself could never reach and hides real policy bugs.
- **Isolate fixtures across parallel specs.** Decide explicitly which
  fixtures are read-only shared state and which are scratch resources owned
  by one writing spec — a spec writing into another's resource makes both
  flaky, unpredictably.
- **Clean up in `finally`.** Probe records/files must not survive a failed
  assertion.
- **Fail the suite on an unexpected console/runtime error** — this is what
  catches a rejected background query hiding behind a passing assertion.

### Migrations against a populated database

CI applies every migration to an **empty** database; production applies
only *pending* ones to a database **full of rows** — different operations,
and in a no-staging setup the second is unattended. A `NOT NULL` with no
default, or a constraint existing data fails, passes from-scratch CI and
fails against production.

**Policy:** any migration altering an existing table, or adding a
constraint/index to one, gets verified locally against a database already
holding representative rows (reset, seed, *then* apply) before merge — and
that verification is stated explicitly. Treat as review-enforced rather than
automated unless a production-shaped CI seed is worth maintaining.

### Idempotency and repeated operations

Any repeatable/resubmittable operation needs a *decided*, tested answer —
not an accidental one discovered later:

| Operation shape | What to decide and test |
| --- | --- |
| An import/create run twice with the same input | Duplicate, or an identity to detect the repeat? Assert whichever is chosen. |
| A file upload retried after a partial failure | Same path? If storage has no overwrite verb, decide the fallback (skip+flag, fresh path) and test with a fake that fails partway. |
| Creating a grant/share that already exists | No-op or clear conflict, never a silent duplicate with different terms. |
| Revoking something already revoked | Safely idempotent — a second delete affecting zero rows. |
| A cleanup/orphan-detection job re-run | Safe to repeat without re-deleting or double-processing — set-based and existence-checked usually gets this free. |

### What integration tests should *not* do

Re-test pure logic already covered at unit/mutation level — a unit test
finds broken pagination arithmetic in milliseconds; the same point through a
browser and a real database costs orders of magnitude more.

---

## 9. E2E strategy

Split into at least two suites with genuinely different jobs.

**Signed-out** — everything in it must hold for an anonymous visitor, which
is what makes it safe to run against production post-deploy. Base path,
manifest/icons, pre-hydration behavior, layout at more than one viewport.
Nothing signed-in belongs here.

**Signed-in** — critical journeys against a real stack, kept to whole
journeys, not field detail: load the main view and see correct data;
create/edit/delete the core resource end to end; search narrows results,
including hostile input; an attached file persists, survives reload, and is
removed with its resource; any cross-cutting view (map, dashboard) matches
the list view; export/import round-trips; signing out actually ends the
session.

A UI change still generally needs one E2E case for its journey — but every
field-level detail around it (disabled states, validation wording, focus
order) belongs in component tests, milliseconds-fast and legible. A second
browser case for the same journey should feel expensive, because it is.

Two habits worth adopting: treat mobile as its own **target**, not a
variant, if layout faults tend to be viewport-specific; and **poll for
expected state** rather than reading once, whenever the UI debounces or
waits on a round trip.

### How the browser suite addresses the UI

**Address elements by a test id, not by role, accessible name, text, or
CSS.** A name- or text-based locator breaks on every copy edit and every
translation, and couples an assertion to wording the test isn't about; a
class-based one breaks on every restyle. A `data-testid` is an explicit,
greppable contract between the component and the suite: renaming a button's
label then changes one string in one file instead of turning a journey red.
When a test needs an element that has no id, add the id to the component —
don't contort the locator around markup that was never built to be
addressed.

Four cases stay off test ids, deliberately:

- **A third party's own DOM** (a map, a rich-text editor, an embedded
  widget) — you don't own that markup and can't add to it. Reach it the way
  it lets you, in the page object rather than the spec, with a one-line
  comment where it happens.
- **Document-level elements** — `html`, `body`, `meta`, `link`. There is
  exactly one of each; an id adds nothing.
- **Text that is itself the subject.** A localization case proving a page
  arrives in the right language still finds the element by id and asserts
  its *text*; finding it *by* that text makes the assertion circular — it
  can only ever fail as "element not found".
- **State carried by an attribute** (`disabled`, `aria-current`, `lang`).
  Find by id, assert the attribute.

**Wrap each screen in a page object, and hang them all off one tree.** Each
screen exports one `init<Screen>(page)` returning its root locator as a
callable, plus two properties: `locators` (raw handles, grouped — buttons,
inputs, texts) and `do` (whole interactions). Nesting follows the UI, so a
repeated row or card gets its own small object of the same shape:

```ts
export function initRecordList(page: Page) {
  const root = page.locator('#app-root');
  const locators = {
    buttons: { newRecord: root.getByTestId('new-record') },
    cards: root.getByTestId('record-card'),
  };
  const interactions = {
    addRecord: async (title: string) => {
      await locators.buttons.newRecord.click();
      await page.getByTestId('record-title').fill(title);
      await page.getByTestId('record-submit').click();
      await expect(locators.cards.filter({ hasText: title })).toBeVisible();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
```

One tree collects them, with getters so a spec that touches one screen
builds one screen's locators, and a fixture hands that tree to every spec:

```ts
export function createPageTree(page: Page) {
  return {
    get records() {
      return initRecordList(page);
    },
    get form() {
      return initRecordForm(page);
    },
  };
}

export const test = base.extend<{ on: typeof createPageTree }>({
  on: async ({}, use) => {
    await use((page) => createPageTree(page));
  },
});
```

A spec then reads as the journey it is, and names no selector at all:

```ts
test('files a record and finds it again', async ({ on, page }) => {
  const app = on(page);
  await app.records.do.addRecord('Title');
  await expect(app.records.card('Title').locators.title).toHaveText('Title');
});
```

Four rules keep that from decaying back into selectors sprinkled through
specs:

- **No spec names a selector.** A spec needing a new element grows the page
  object rather than reaching past it. Grepping the spec directory for the
  locator API (`getByTestId`, `getByRole`, `locator(`) should come back
  empty but for the document-level exceptions above — that grep is the
  check, so run it rather than trusting the convention.
- **`do` holds whole actions; `locators` holds the handles.** An action
  spanning two screens — a delete and the confirmation it raises — belongs
  to the screen that starts it, since it is one thing the user does, with a
  one-line comment saying why it reaches across.
- **Waiting belongs to the page object.** An `open()` returns when the
  screen is actually there, not when the click landed, so no spec carries a
  wait every other spec also needs — and none carries a sleep.
- **Assertions belong to the spec.** A page object may assert what its own
  action promises (the row it just created is on screen), because that is
  the action's postcondition. What the test is *about* stays in the test.

The cost is real and worth naming: a page object is indirection, and a
badly-drawn one hides the behavior instead of the markup. Keep each to a
single screen, keep `do` methods to things a user would name, and let a
spec drop to `locators` where the interaction is genuinely one click.

### Accessibility — two automated layers, neither proof of the whole claim

**Static** (a JSX/template a11y linter) catches what's wrong before
anything renders: missing alt text, invalid ARIA, an unlabeled control.
**Runtime** (an axe-core-style checker in the real browser suite) catches
what only a rendered DOM reveals: computed contrast, real focus order,
accessible-name computation — scoped to representative states, not every
route. Decide explicitly which severities block CI and which are surfaced
for triage; treating every finding as blocking usually gets the gate
disabled the first time it catches something ambiguous.

Neither layer proves full compliance, screen-reader-specific behavior, or a
keyboard-only walkthrough of custom widgets. A clean run is "no known
regression," not "verified accessible" — say that explicitly.

---

## 10. Property-based testing strategy

**Recommended, narrowly — only where it earns its dependency.** Most pure
functions have small, enumerable input spaces already covered exhaustively
by example tests, with mutation testing proving those examples load-bearing.
Property-based testing earns its place where an input space is genuinely
adversarial and a property is easy to state: a filter-builder that must
never let input escape its grammar, an encode/decode pair that must
round-trip for any input, a date-packing function that must never underflow
its valid range.

If adopted: a **seeded, deterministic** runner (a failing seed must
reproduce); one dependency; properties *beside* existing example tests, not
replacing them; inside the unit suite's normal time budget. Needs a real
near-miss as justification, not speculative adoption.

---

## 11. Mutation testing strategy

**Required, deliberately scoped — never the whole codebase.**

- Scope to a short, explicit, maintained file list, shared with any
  per-file coverage floor so the two can't drift apart.
- Every listed file pairs pure exported logic with I/O clearly excluded from
  mutation (reason given, if the tool supports inline regions) — those
  exclusions are load-bearing to the score.
- **Never mutate the rendering layer** — JSX/template mutants are
  near-equivalent by the thousand and the score means nothing. If a file
  can't split into "pure logic" and "rendering," the file is the problem.
- Run on every change touching scoped files, not just the default branch.

A surviving mutant has exactly two honest endings: **a missing assertion**
(kill it with a real behavioral test — usually an unpinned boundary or
error path), or **equivalent** (no input distinguishes it — a guard the type
system needs but runtime can't reach; delete the dead branch, or mark the
exclusion with the reason written at the exclusion). Never write a test that
can't fail just to kill a mutant.

Worth actively looking for beyond those two: the mutant survives because the
code is more complicated than it needs to be — usually the one that pays for
the whole exercise. A score below threshold fails the build; above threshold
but below 100% isn't automatic-pass either — every survivor is an open
question.

---

## 12. Performance and resilience testing

### Performance

**No numeric backend gate is usually justified** without a real throughput
SLA — a synthetic load number against a low-traffic app mostly measures the
hosting tier. What replaces it: a new filtering/sorting query names its
index (every branch of an OR'd search needs its own — one gap collapses the
whole query to a sequential scan); a new bulk operation is set-based, not
row-by-row; anything reading a large set pages around the API's row cap.
Inspect the real query plan for any new hot query.

**The frontend bundle/page-load side benefits from a numeric gate**
(Lighthouse-style), since bundle size and render cost degrade invisibly
without one. If adopted: run against the real production build, never a dev
server; a small number of representative pages/states, not every route;
gate on performance specifically, leaving accessibility to §9's tooling
rather than double-asserting the same finding; take a median of several
runs; and **set thresholds from a measured baseline with real margin**,
never a tool's generic defaults or the measured value exactly — if a
measurement reveals something worth understanding (a first-run layout shift
a real session would never see), write down *why* the threshold sits where
it does rather than silently widening it.

### Resilience

Drive failure injection at unit level through fakes those modules should
already accept: a batched network operation's failed sub-call and
retry/skip behavior; a bulk import's missing input, exhausted retries,
partial multi-write failure, and cancellation; a bounded concurrency pool's
first-rejection-stops-pickup behavior; delete ordering, verified and never
silently reversed. Injecting into the real stack is optional and rarely
worth it once these branches are reachable with a fake.

### Destructive scheduled jobs — the highest-risk logic in the system

A scheduled job with elevated credentials doing irreversible bulk deletes
(a storage-cleanup sweep is the canonical example) is more security-critical
than most RLS policies — its failure mode is silent, irreversible, and
touches live data. Rarely worth a test harness for bash-in-YAML, but three
cheap mitigations are almost always worth having: **review its query like a
schema change**; **a dry-run mode that lists what it would delete and exits,
before fetching any elevated credential**, defaulted on for manual runs; and
**a grace period** between "looks orphaned" and "eligible for deletion" long
enough that a slow or partial write can never fall inside it — usually the
single most important invariant, and the easiest for a future edit to
accidentally shrink while "simplifying."

Three lessons worth carrying into any project of this shape:

- **Match every derived artifact, not just the primary one.** If one record
  produces more than one storage object (full-size + thumbnail), matching
  only the primary path classifies every secondary object as orphaned. Not
  hypothetical — a plausible first draft naturally produces this, caught
  only by executing the predicate against real data.
- **Never cast an untrusted/malformed identifier into a typed column inside
  the query.** A failed cast aborts the *entire* query rather than simply
  not matching — fail closed to "no match," don't raise.
- **Ask "does anything still reference this object," not a proxy for it**
  (like "does a record with this parsed-out id exist"). A proxy answers
  wrong both ways: it can keep an object merely sharing an id with something
  unrelated, and can never find one whose owning record's insert failed
  after the bytes were already written.

---

## 13. CI/CD execution strategy

1. **Fast hygiene first** — file hygiene, secrets, formatting, anything
   seconds-scale gates everything else, so a bad config fails before minutes
   are spent on browsers and databases.
2. **Path-filter heavier jobs on PRs** — a database job runs only when
   database-adjacent files changed, etc. A job skipped by its own condition
   reports as passing, never weakening what branch protection requires.
3. **Run the full, unconditional set on whatever branch actually deploys**,
   regardless of what that push touched — path-filtering is a PR-time
   speedup, not a release-time one.
4. **Order the deploy pipeline to fail safe**: migrate, then build, then
   deploy, then smoke-test, each depending on the last, so a rejected
   migration leaves the previous bundle serving the previous schema.
5. **Retry only the deploy-target smoke test** — the one place a retry
   distinguishes a broken deploy from a dropped connection. Everywhere else,
   `retries: 0`.
6. **No staging means the PR gate has to be heavier, not lighter** — if
   merging to default *is* the release, run the full authorization/
   integration suite on every relevant PR, not nightly-only.

**Scheduled jobs:** a destructive cleanup sweep (dry-run by default, §12);
an availability keep-alive (a mitigation, not a test); dependency updates —
restrict auto-merge to patch-level, dev-only bumps if anything auto-merges
at all, since a dev dependency reaches the CI runner but a runtime one
reaches every user's browser. That asymmetry is a security control, not a
convenience setting.

---

## 14. Quality gates

Every gate needs a stated reason — a gate without one is noise, and tends to
get loosened the first time it's inconvenient.

| Gate | Generic guidance |
| --- | --- |
| Coverage floor | A **floor** set from what the suite achieves with margin — not a target. Raise by hand when the suite genuinely improves. |
| Auto-ratcheting coverage | **Don't** — it makes a green local run produce a red PR. Raise floors by hand. |
| Mutation score | A break threshold below 100% so an equivalent mutant can't block an unrelated change — every survivor above it is still an open question, not a pass. |
| Direction of any threshold | **Never lowered** to pass a build — that converts a design problem into a permanently weaker gate. Redesign, or raise the question, instead. |
| Test pass rate | 100%, `retries: 0` except the one deploy-target boundary (§13). |
| Authorization tests | Must pass; a policy/grant/trigger change ships a matching case in the same change (§7). |
| Schema contract | The generated-types-vs-schema diff must be clean — drift surfaces as production runtime errors otherwise. |
| Deployment | Post-deploy smoke green against the **live** origin. |
| Performance | No numeric backend gate without a real SLA; a frontend budget from a measured baseline with margin (§12). |
| Static analysis | Graduated by severity — block on real findings, surface the rest for triage (§6). |
| Suppressions (any kind) | Only with a comment explaining *why*, added after understanding the failure — never as a first response to red. |
| New UI | Needs an E2E case for the journey, plus component coverage for field-level detail. |
| New functional behavior | Needs a unit test; authorization behavior additionally needs §7. |

---

## 15. Test anti-patterns

Each of these fails silently or looks like flake when it's actually a
defect.

1. Treating a client-side check as an authorization test — it's UX, zero
   security confidence.
2. Mocking the database client and calling it an integration test — it
   tests your own call shape, nothing on the far side of the mock.
3. Seeding fixtures with an elevated/service-role credential — bypasses RLS,
   can construct states the app can't reach.
4. Testing one mirrored authorization surface and assuming the other.
5. Sharing one seeded resource between parallel writing specs — fails both,
   at random, looks like flake.
6. Leaving probe records/files behind on a failed assertion.
7. Putting a signed-in test in the signed-out suite that runs against
   production.
8. Retries or arbitrary sleeps to paper over a flake — poll for expected
   state and fix the race instead.
9. Re-testing pure logic through the browser — orders of magnitude more
   costly, fails far less clearly.
10. Lowering a threshold, or reaching for a suppression, to get to green —
    understand the failure first.
11. Test gaming — a test written to touch a line, a branch to dodge a
    mutant, a file excluded to avoid dealing with it.
12. Widening mutation scope to the rendering layer.
13. Writing a test for a platform behavior the platform has already ruled
    out — check its constraints before writing the test, not after it fails
    mysteriously.
14. Running any test, migration, or destructive operation against the real
    hosted project — local stack only, always.
15. Asserting a weak truthiness check on an error object instead of its
    actual code/status.
16. Adding an E2E case for a field-level detail — journeys belong at E2E,
    fields in component tests.

---

## 16. Adapting and maintaining this playbook

**Copying into a new project:** fill §2's context table and trust-boundary
list with real pieces; build §4's risk table with real tables/roles/
operations, ranked by real cost; fill §5's ownership table once real modules
exist to assign; pick the real tool stack for §6's four static-analysis
layers and §11's mutation scope, and measure real thresholds for §12/§14 —
never carry over another project's numbers. Write the concrete instantiation
into the project's own docs (architecture doc, design-decisions doc, CI
config, pre-merge checklist), not into a copy of this file — keep this file
itself free of project-specific facts so it stays reusable next time.

**When to update it:** a server-side execution surface appears where there
was none (invalidates §0, needs rethinking); a new trust boundary appears
(another role, grant shape, data source, or a previously-ruled-out
capability); a layer's verdict in §5 changes (record the reasoning, not just
the verdict); a quality gate moves (a changed number is a changed
justification); a named gap closes (delete it, don't describe a hole that no
longer exists); or an incident happens — the single best input this kind of
document gets, so add it to the risk model and name the level that should
have caught it.
