import { expect, test } from './test';

// The only place either is changed; the signed-out specs seed that storage.
test.use({ locale: 'en-GB' });

type Page = import('@playwright/test').Page;

const themeAttr = (page: Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'));

async function openAccountMenu(page: Page) {
  await page.goto('', { waitUntil: 'networkidle' });
  await expect(page.getByTestId('selected-category')).not.toBeEmpty();
  await page.getByRole('button', { name: 'Account menu' }).click();
}

test.describe('the account menu', () => {
  test('changes the appearance, and the next visit arrives in it', async ({
    page,
  }) => {
    await openAccountMenu(page);
    expect(await themeAttr(page)).not.toBe('dark');

    await page.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect.poll(() => themeAttr(page)).toBe('dark');

    // Before hydration: the head script found it, with no flash to fix up.
    await page.reload({ waitUntil: 'domcontentloaded' });
    expect(await themeAttr(page)).toBe('dark');
  });

  test('changes the language, and the next visit arrives in it', async ({
    page,
  }) => {
    await openAccountMenu(page);

    await page.getByRole('button', { name: 'Deutsch', exact: true }).click();
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
    await expect(
      page.getByRole('heading', { level: 2, name: 'Sammlung' }),
    ).toBeVisible();

    await page.reload({ waitUntil: 'domcontentloaded' });
    await expect(page.locator('html')).toHaveAttribute('lang', 'de');
  });
});
