import { expect, test } from '../fixture';

test.use({ locale: 'en-GB' });

const HEALED_KEY = 'e2e-root-layout-healed';

// Nothing a visitor does makes the root layout throw, so this breaks what I18nProvider reads while it renders.
test('a root layout that throws still gets a translated error screen, and its reload recovers', async ({
  on,
  page,
}) => {
  const app = on(page);
  await page.addInitScript((healedKey) => {
    if (sessionStorage.getItem(healedKey)) return;
    Object.defineProperty(Navigator.prototype, 'languages', {
      get: () => undefined,
    });
  }, HEALED_KEY);

  await app.login.do.open();

  await expect(app.appError()).toContainText('Something went wrong');
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(app.login.locators.buttons.signIn).toBeHidden();

  await page.evaluate((healedKey) => {
    sessionStorage.setItem(healedKey, '1');
  }, HEALED_KEY);
  await app.appError.do.reload();

  await expect(app.login.locators.buttons.signIn).toBeVisible();
  await expect(app.appError()).toBeHidden();
});
