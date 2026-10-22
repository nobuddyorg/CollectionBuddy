import { type Page } from '@playwright/test';

// Not './test': the last step is a refused sign-in, which logs to the console by design; the rest is held to it by hand.
import { expect, test as base } from '../fixture';

import { collectPageProblems, expectNoPageProblems } from '../helpers';
import { LOGIN_URL } from '../pages/login';
import {
  browserState,
  clearCollection,
  ensureUser,
  mintSession,
  reseedSingle,
} from './collectors';
import { SEED } from './fixtures';

// WebAuthn refuses an IP address as relying party, so this spec alone serves the export as `localhost` (config.toml's RP ID).
const onLocalhost = (url: string) =>
  url.replace('//127.0.0.1:', '//localhost:');

// A signed-in collector per parallel slot: the journey signs out globally, twice.
const test = base.extend<{ collector: { email: string; userId: string } }>({
  baseURL: async ({ baseURL }, provide) => {
    await provide(onLocalhost(baseURL!));
  },
  collector: async ({}, provide, testInfo) => {
    const email = `e2e-passkeys-${testInfo.parallelIndex}@collectionbuddy.test`;
    const userId = await ensureUser(email, SEED.passkeys.password);
    await provide({ email, userId });
  },
  storageState: async ({ collector, baseURL }, provide) => {
    const session = await mintSession(collector.email, SEED.passkeys.password);
    // A previous run's authenticator is gone with its browser; its passkeys would only crowd the list.
    const { data: left } = await session.client.auth.passkey.list();
    for (const passkey of left ?? []) {
      await session.client.auth.passkey.delete({ passkeyId: passkey.id });
    }
    await reseedSingle(session.client, {
      userId: collector.userId,
      category: SEED.passkeys.category,
      title: SEED.passkeys.item,
      place: 'Lindau',
    });
    await provide(browserState(new URL(baseURL!).origin, session));

    const after = await mintSession(collector.email, SEED.passkeys.password);
    await clearCollection(after.client, collector.userId);
  },
});

test.use({ locale: 'en-GB' });

/** Chrome's virtual platform authenticator: the fingerprint is always there and always matches. */
async function addFingerprintReader(page: Page) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

test.describe('signing in with a fingerprint', () => {
  test('saves one, signs back in with it alone, and is refused once it is removed', async ({
    on,
    page,
  }) => {
    const app = on(page);
    const problems = collectPageProblems(page);
    await addFingerprintReader(page);
    await app.categories.do.open(SEED.passkeys.category);

    await app.account.do.open();
    await expect(app.account.locators.fingerprints.saved).toHaveCount(0);
    await expect(app.account.locators.fingerprints.hint).toBeHidden();
    await app.account.do.toggleFingerprintHint();
    await expect(app.account.locators.fingerprints.hint).toBeVisible();
    await app.account.do.saveFingerprint();
    await expect(
      app.toast().filter({ hasText: 'Fingerprint saved.' }),
    ).toBeVisible();
    await expect(app.account.locators.fingerprints.saved).toHaveCount(1);

    await app.account.do.signOut();
    await expect(page).toHaveURL(LOGIN_URL);

    // No Google, no password: the authenticator picks the account.
    await app.login.do.signInWithFingerprint();
    await expect(page).not.toHaveURL(LOGIN_URL);
    await app.categories.do.open(SEED.passkeys.category);

    await app.account.do.open();
    await app.account.do.removeFingerprint(0);
    await expect(
      app.toast().filter({ hasText: 'Fingerprint sign-in removed.' }),
    ).toBeVisible();
    await expect(app.account.locators.fingerprints.saved).toHaveCount(0);
    expectNoPageProblems(problems);

    await app.account.do.signOut();
    await expect(page).toHaveURL(LOGIN_URL);

    // The device still holds its key; Auth no longer knows it, so a lost phone is locked out.
    await app.login.do.signInWithFingerprint();
    await expect(
      app.toast.locators.alert.filter({
        hasText: 'Fingerprint sign-in failed.',
      }),
    ).toBeVisible();
    await expect(page).toHaveURL(LOGIN_URL);
  });
});
