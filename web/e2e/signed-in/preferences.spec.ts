import { expect, test } from './test';

import { themeAttribute } from '../helpers';

// The only place either is changed; the signed-out specs seed that storage.
test.use({ locale: 'en-GB' });

test.describe('the account menu', () => {
  test.beforeEach(async ({ on, page }) => {
    await on(page).categories.do.load();
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

  test('fills a phone’s screen and closes from its own button; on a wider screen it drops down, with no such button', async ({
    on,
    page,
  }) => {
    const account = on(page).account;
    await expect(account.locators.buttons.close).toBeHidden();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(account()).toBeVisible();
    expect(await account().boundingBox()).toEqual({
      x: 0,
      y: 0,
      width: 390,
      height: 844,
    });

    await account.do.close();
    await expect(account()).toBeHidden();
    await expect(account.locators.buttons.open).toBeFocused();
  });

  test('links the privacy notice, which leads back to the catalogue', async ({
    on,
    page,
  }) => {
    await on(page).account.locators.privacyLink.click();
    await expect(on(page).privacy.locators.title).toHaveText('Privacy notice');
    await expect(on(page).privacy.locators.contact).toHaveAttribute(
      'href',
      'mailto:info@nobuddy.org',
    );

    await on(page).privacy.locators.back.click();
    await expect(on(page).categories.locators.selected).not.toBeEmpty();
  });
});
