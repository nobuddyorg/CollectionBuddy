import { expect, test } from '@playwright/test';

import { cssVar } from './helpers';

const PAPER = 'rgb(244, 243, 239)';
const CHARCOAL = 'rgb(25, 24, 21)';

const themeAttr = (page: import('@playwright/test').Page) =>
  page.evaluate(() => document.documentElement.getAttribute('data-theme'));

// The control itself lives in the account menu, behind a session, so what can
// be held here is the half that runs for everyone: what the page decides
// before React exists, from the OS and from whatever is in storage.
//
// That half is the one worth guarding anyway. It is an inline script that
// duplicates useTheme's inputs by hand because nothing else runs early enough,
// and its failure mode is a flash of the wrong theme -- invisible to every
// unit test, and to anyone not looking at the moment the page loads.
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

  // Storage is not a trusted input: a value left by an older build, or edited
  // by hand, must land on system rather than on an attribute nothing styles.
  test('falls back to the OS for a stored value that is not a theme', async ({
    page,
  }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.addInitScript(() => localStorage.setItem('theme', 'sepia'));
    await page.goto('login/');
    expect(await themeAttr(page)).toBe('dark');
  });

  // The flash the inline script exists to prevent. `domcontentloaded` is
  // before hydration -- if the attribute were being set by React, it would not
  // be there yet, and the visitor would have seen paper first.
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

  // Both entries have to survive the build: the browser chrome around an
  // installed app is the one surface the CSS cannot reach.
  test('declares a theme colour for each scheme', async ({ page }) => {
    await page.goto('login/');
    const metas = page.locator('meta[name="theme-color"]');
    await expect(metas).toHaveCount(2);
    await expect(metas.first()).toHaveAttribute('content', '#f4f3ef');
    await expect(metas.last()).toHaveAttribute('content', '#191815');
  });
});
