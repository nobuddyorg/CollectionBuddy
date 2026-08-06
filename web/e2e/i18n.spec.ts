import { expect, test } from '@playwright/test';

// German is the served default in the markup and English is what most CI
// browsers ask for, so the language a visitor actually gets is decided on the
// client -- from storage, then from the browser. Worth checking end to end
// because the failure is quiet: the page renders perfectly, in the wrong
// language, and `<html lang>` then tells a screen reader to pronounce it with
// the wrong phonetics.
test.describe('the language a page arrives in', () => {
  test('follows a German browser', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'de-DE' });
    const page = await context.newPage();
    await page.goto('login/', { waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    // Exact, because the same words run round the medallion as well -- a
    // substring match finds the tagline and the engraving both.
    await expect(
      page.getByText('Sammeln • Ordnen • Behalten', { exact: true }),
    ).toBeVisible();
    await context.close();
  });

  test('follows an English browser', async ({ browser }) => {
    const context = await browser.newContext({ locale: 'en-GB' });
    const page = await context.newPage();
    await page.goto('login/', { waitUntil: 'networkidle' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(
      page.getByText('Collect • Organize • Keep', { exact: true }),
    ).toBeVisible();
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

  // A locale the app has no translations for is not an error -- it falls back
  // to what the document was served as rather than rendering key names.
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

  // Kept in step with the language for the same reason as `lang`: a browser
  // that reads a description in the other language offers to translate a page
  // already in the visitor's own.
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
