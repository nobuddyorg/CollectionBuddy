import { expect, test } from './test';

// The only place either is changed; the signed-out specs seed that storage.
test.use({ locale: 'en-GB' });

type Page = import('@playwright/test').Page;

const themeAttribute = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'));

test.describe('the account menu', () => {
  test.beforeEach(async ({ on, page }) => {
    await page.goto('', { waitUntil: 'networkidle' });
    await expect(on(page).categories.locators.selected).not.toBeEmpty();
    await on(page).account.do.open();
  });

  test('changes the appearance, and the next visit arrives in it', async ({
    on,
    page,
  }) => {
    expect(await themeAttribute(page)).not.toBe('dark');

    await on(page).account.do.chooseTheme('dark');
    await expect.poll(() => themeAttribute(page)).toBe('dark');

    // Before hydration: the head script found it, with no flash to fix up.
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await themeAttribute(page)).toBe('dark');
  });

  test('changes the language, and the next visit arrives in it', async ({
    on,
    page,
  }) => {
    await on(page).account.do.chooseLanguage('de');
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(on(page).categories.locators.texts.label).toHaveText(
      'Sammlung',
    );

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });
});
