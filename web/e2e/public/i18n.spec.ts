// Not '../coverage': every test here opens its own `browser.newContext()`
// rather than using the `page` fixture, so the autoCoverage fixture there
// would have nothing to attach to.
import { expect, test } from '@playwright/test';

import { createPageTree } from '../pages';

// Language is decided client-side (storage, then browser); a wrong `<html lang>`
// mispronounces the page for screen readers without any visible symptom.
test.describe('the language a page arrives in', () => {
  test('follows a German browser', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'de-DE' });
    const page = await context.newPage();
    await page.goto('login/', { waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(createPageTree(page).login.locators.tagline).toHaveText(
      'Sammeln • Ordnen • Behalten',
    );
    await context.close();
  });

  test('follows an English browser', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-GB' });
    const page = await context.newPage();
    await page.goto('login/', { waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(createPageTree(page).login.locators.tagline).toHaveText(
      'Collect • Organize • Keep',
    );
    await context.close();
  });

  test('lets a stored choice overrule the browser', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-GB' });
    const page = await context.newPage();
    await page.addInitScript(() => localStorage.setItem('lang', 'de'));
    await page.goto('login/', { waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await context.close();
  });

  test('falls back rather than showing translation keys', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'ja-JP' });
    const page = await context.newPage();
    await page.goto('login/', { waitUntil: 'networkidle' });
    await expect(page.locator('body')).not.toContainText('login.');
    await expect(page.locator('body')).not.toContainText('page.footer');
    await context.close();
  });

  test('describes the page in the language it is showing', async ({
    browser,
  }) => {
    const context = await browser.newContext({ locale: 'de-DE' });
    const page = await context.newPage();
    await page.goto('login/', { waitUntil: 'networkidle' });
    const description = page.locator('meta[name="description"]');
    await expect(description).toHaveAttribute('content', /\S/);
    await context.close();
  });
});
