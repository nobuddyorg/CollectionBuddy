import { type Page } from '@playwright/test';

import { expect, test as base } from './test';

import { SEED } from './fixtures';
import {
  browserState,
  clearCollection,
  ensureUser,
  mintSession,
  reseedSingle,
} from './collectors';
import { answerGeocoder, photonFeature, uniqueName } from './helpers';
import { LOGIN_URL } from '../pages/login';

// The global sign-out revokes every session of its user, so it signs out a collector no other spec shares.
const test = base.extend<{ collector: { email: string; userId: string } }>({
  // One per parallel slot: two runs of this spec at once would otherwise revoke each other's session.
  collector: async ({}, provide, testInfo) => {
    const email = `e2e-sign-out-${testInfo.parallelIndex}@collectionbuddy.test`;
    const userId = await ensureUser(email, SEED.signOut.password);
    await provide({ email, userId });
  },
  storageState: async ({ collector, baseURL }, provide) => {
    const session = await mintSession(collector.email, SEED.signOut.password);
    await reseedSingle(session.client, {
      userId: collector.userId,
      category: SEED.signOut.category,
      title: SEED.signOut.item,
      place: 'Garmisch',
    });
    await provide(browserState(new URL(baseURL!).origin, session));

    // A fresh session: the journey revoked the one above.
    const after = await mintSession(collector.email, SEED.signOut.password);
    await clearCollection(after.client, collector.userId);
  },
});

test.use({ locale: 'en-GB' });

// What one account leaves in the browser; the appearance belongs to the device.
const PER_USER_KEYS = [
  'collectionbuddy.selectedCategory',
  'cb_geocode_cache_v1',
  'collectionbuddy.storageOwner',
];

const storedKeys = (page: Page) =>
  page.evaluate(() => Object.keys(window.localStorage));

test.describe('signing out', () => {
  test('sends a deletion still inside its undo window, returns to the login page, and stays signed out', async ({
    on,
    page,
    collector,
  }) => {
    const app = on(page);
    const title = uniqueName('Beim Abmelden');
    await app.categories.do.open(SEED.signOut.category);
    await app.catalogue.do.addEntry(title);
    await app.catalogue.do.removeEntry(title);

    await app.account.do.open();
    await app.account.do.signOut();
    await expect(page).toHaveURL(LOGIN_URL);

    // Left to its timer, the delete would run signed out, fail, and leave the entry standing.
    const reader = await mintSession(collector.email, SEED.signOut.password);
    const { data, error } = await reader.client
      .from('items')
      .select('id')
      .eq('title', title);
    if (error) throw error;
    expect(data).toEqual([]);

    // Confirms the session itself is gone, not just a client-side navigation.
    await page.reload({ waitUntil: 'networkidle' });
    await expect(page).toHaveURL(LOGIN_URL);
  });

  test('leaves the next person none of its collection or looked-up places, and keeps the appearance', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await answerGeocoder(page, [photonFeature('Garmisch', [11.08, 47.49])]);
    await app.categories.do.open(SEED.signOut.category);
    await app.map.do.open();
    await expect(app.map.locators.pins).toHaveCount(1);
    await expect
      .poll(() => storedKeys(page))
      .toEqual(expect.arrayContaining(PER_USER_KEYS));
    await app.map.do.close();
    await app.account.do.open();
    await app.account.do.chooseTheme('dark');

    await app.account.do.signOut();
    await expect(page).toHaveURL(LOGIN_URL);

    const left = await storedKeys(page);
    expect(left).toContain('theme');
    for (const key of PER_USER_KEYS) expect(left).not.toContain(key);
  });
});
