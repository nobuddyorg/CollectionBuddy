import { expect, test } from '../fixture';

// Language is decided client-side; a wrong <html lang> mispronounces the page with no visible symptom.
test.describe('the language a page arrives in', () => {
  test.describe('in a German browser', () => {
    test.use({ locale: 'de-DE' });

    test('follows a German browser', async ({ on, page }) => {
      await on(page).login.do.open();
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      await expect(on(page).login.locators.tagline).toHaveText(
        'Sammeln • Ordnen • Behalten',
      );
    });

    test('describes the page in the language it is showing', async ({
      on,
      page,
    }) => {
      await on(page).login.do.open();
      const description = page.locator('meta[name="description"]');
      await expect(description).toHaveAttribute('content', /\S/);
    });
  });

  test.describe('in an English browser', () => {
    test.use({ locale: 'en-GB' });

    test('follows an English browser', async ({ on, page }) => {
      await on(page).login.do.open();
      await expect(page.locator('html')).toHaveAttribute('lang', 'en');
      await expect(on(page).login.locators.tagline).toHaveText(
        'Collect • Organize • Keep',
      );
    });

    test('lets a stored choice overrule the browser', async ({ on, page }) => {
      await page.addInitScript(() => localStorage.setItem('lang', 'de'));
      await on(page).login.do.open();
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    });
  });

  test.describe('in a Japanese browser', () => {
    test.use({ locale: 'ja-JP' });

    test('falls back to German for a language it does not speak', async ({
      on,
      page,
    }) => {
      await on(page).login.do.open();
      await expect(page.locator('html')).toHaveAttribute('lang', 'de');
      await expect(on(page).login.locators.tagline).toHaveText(
        'Sammeln • Ordnen • Behalten',
      );
      await expect(page.locator('body')).not.toContainText('login.');
      await expect(page.locator('body')).not.toContainText('page.footer');
    });
  });
});
