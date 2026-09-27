import { expect, test as base } from './test';

import { SEED } from './fixtures';
import {
  browserState,
  clearCollection,
  ensureUser,
  mintSession,
} from './collectors';

// A collector of its own per parallel slot: the first-run page needs an account that owns nothing.
const test = base.extend({
  storageState: async ({ baseURL }, provide, testInfo) => {
    const email = `e2e-first-run-${testInfo.parallelIndex}@collectionbuddy.test`;
    const userId = await ensureUser(email, SEED.firstRun.password);
    const session = await mintSession(email, SEED.firstRun.password);
    await clearCollection(session.client, userId);
    await provide(browserState(new URL(baseURL!).origin, session));
  },
});

test.use({ locale: 'en-GB' });

test.describe('a first run', () => {
  test('tells a collector with nothing yet where to start, and opens help from the empty page', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await page.goto('', { waitUntil: 'networkidle' });
    await expect(app.help.locators.buttons.emptyState).toBeVisible();
    await expect(app.categories.locators.inputs.newName).toBeVisible();

    await app.help.do.openFromEmptyState();
    await app.help.do.openTopic('collections');
    await expect(app.help.locators.topic('collections')).toContainText(
      'New collection',
    );

    await app.help.do.close();
    await expect(app.help()).toBeHidden();
    await expect(app.help.locators.buttons.emptyState).toBeFocused();
  });
});
