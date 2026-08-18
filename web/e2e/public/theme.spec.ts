import { expect, test } from '@playwright/test';

import { cssVar } from '../helpers';

const PAPER = 'rgb(244, 243, 239)';
const CHARCOAL = 'rgb(25, 24, 21)';

const themeAttr = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'));

// Covers only the pre-React half: an inline script sets the theme from OS/storage
// before hydration, since nothing else runs early enough. Its failure mode is a
// flash of the wrong theme, invisible to unit tests.
test.describe('the theme a page arrives in', () => {
  test('follows a dark OS when nothing has been chosen', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('login/');
    expect(await themeAttr(page)).toBe('dark');
    await expect(page.locator('body')).toHaveCSS('background-color', CHARCOAL);
  });

  test('follows a light OS when nothing has been chosen', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto('login/');
    expect(await themeAttr(page)).toBe('light');
    await expect(page.locator('body')).toHaveCSS('background-color', PAPER);
  });

  test('lets a stored choice overrule the OS', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' });
    await page.addInitScript(() => localStorage.setItem('theme', 'dark'));
    await page.goto('login/');
    expect(await themeAttr(page)).toBe('dark');
    await expect(page.locator('body')).toHaveCSS('background-color', CHARCOAL);
  });

  test('and the other way round', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => localStorage.setItem('theme', 'light'));
    await page.goto('login/');
    expect(await themeAttr(page)).toBe('light');
  });

  // Storage is not a trusted input; an invalid value must fall back to the OS.
  test('falls back to the OS for a stored value that is not a theme', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => localStorage.setItem('theme', 'sepia'));
    await page.goto('login/');
    expect(await themeAttr(page)).toBe('dark');
  });

  // `domcontentloaded` fires before hydration, so this fails if the theme
  // attribute is only ever set by React.
  test('is decided before the page is interactive, not after', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('login/', { waitUntil: 'domcontentloaded' });
    expect(await themeAttr(page)).toBe('dark');
    await expect(page.locator('body')).toHaveCSS('background-color', CHARCOAL);
  });

  test('tells the browser which way round the page is', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('login/');
    // Drives the scrollbars and any native control the app does not style.
    expect(await cssVar(page, 'color-scheme')).toBe('dark');
  });

  // Browser chrome around an installed app is the one surface CSS can't reach.
  test('declares a theme colour for each scheme', async ({ page }) => {
    await page.goto('login/');
    const metas = page.locator('meta[name="theme-color"]');
    await expect(metas).toHaveCount(2);
    await expect(metas.first()).toHaveAttribute('content', '#f4f3ef');
    await expect(metas.last()).toHaveAttribute('content', '#191815');
  });
});
