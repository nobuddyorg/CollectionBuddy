import { expect, test as base } from './test';

import { SEED } from './fixtures';
import { browserState, freshCollector } from './collectors';

// A collector of its own per parallel slot: the first-run page needs an account that owns nothing.
const test = base.extend({
  storageState: async ({ baseURL }, provide, testInfo) => {
    const email = `e2e-first-run-${testInfo.parallelIndex}@collectionbuddy.test`;
    const collector = await freshCollector(email, SEED.firstRun.password);
    await provide(browserState(new URL(baseURL!).origin, collector));
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
