// The browser proofs' shared steps: the demo-mode static export and its anonymous session.
const APP_URL = (
  __ENV.PROOF_APP_URL || 'http://localhost:4173/CollectionBuddy/'
).replace(/\/?$/, '/');

/** One Chromium VU, one iteration: each proof is a single scripted visit. */
export function browserScenario(extra = {}) {
  return {
    executor: 'shared-iterations',
    vus: 1,
    iterations: 1,
    maxDuration: '20m',
    options: { browser: { type: 'chromium' } },
    ...extra,
  };
}

/** Demo mode signs every visitor in anonymously; returns that session for API seeding (supabase-js keeps it in localStorage). */
export async function openAsDemoUser(page) {
  await page.goto(APP_URL, { waitUntil: 'networkidle' });
  await page.waitForFunction(
    () =>
      Object.keys(localStorage).some((key) => {
        try {
          return Boolean(JSON.parse(localStorage.getItem(key)).access_token);
        } catch {
          return false;
        }
      }),
    { timeout: 30000 },
  );
  const { key, value } = await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      try {
        const value = JSON.parse(localStorage.getItem(key));
        if (value.access_token) return { key, value };
      } catch {
        // Not the session entry.
      }
    }
    return {};
  });
  // storageKey lets a proof swap in another identity's session (supabase-js reads it on the next load).
  return {
    token: value.access_token,
    userId: value.user.id,
    email: value.user.email ?? '',
    storageKey: key,
  };
}

/** Reloads so the app reads what the API just seeded, then waits for the catalogue. */
export async function reloadCatalogue(page) {
  await page.reload({ waitUntil: 'networkidle' });
  await page
    .getByTestId('new-entry')
    .waitFor({ state: 'visible', timeout: 30000 });
}
