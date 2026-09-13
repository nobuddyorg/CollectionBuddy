import { expect, test } from './test';

import { expectNoSeriousA11yViolations } from '../axe';
import { openCategory } from './helpers';

// Runs against real, signed-in pages -- the same rendered DOM a collector
// actually sees, not a mock. See #650: this complements (doesn't replace)
// eslint-plugin-jsx-a11y's static check, which can't see computed contrast,
// focus order, or the real accessible-name/ARIA-state computation.
test.use({ locale: 'en-GB' });

// Cards mount with `.fade-up` (globals.css), a 500ms opacity/transform
// animation. axe's color-contrast check samples whatever is on screen the
// instant it runs, so scanning mid-fade reads a blended, lower-contrast
// colour than the settled one globals.contrast.test.ts actually verifies --
// a false positive in the check's timing, not a real design defect. Same
// wait login.spec.ts already uses for the same animation.
async function waitForCardsSettled(page: import('@playwright/test').Page) {
  await expect(page.getByTestId('item-card').first()).toHaveCSS('opacity', '1');
}

test.describe('accessibility -- signed in', () => {
  // Covers the catalogue grid *and* an entry's detail (title, description,
  // place, tags are all rendered inline on the card -- this app has no
  // separate detail page, see docs/reference/architecture.md).
  test('the catalogue grid has no serious or critical violations', async ({
    page,
  }, testInfo) => {
    await openCategory(page, 'Münzen');
    await waitForCardsSettled(page);
    await expectNoSeriousA11yViolations(page, testInfo);
  });

  test('the map view has no serious or critical violations', async ({
    page,
  }, testInfo) => {
    await openCategory(page, 'Münzen');
    await page.getByTestId('open-map').click();
    await expect(page.locator('.leaflet-container')).toBeVisible();
    await expectNoSeriousA11yViolations(page, testInfo);
  });

  test('search results have no serious or critical violations', async ({
    page,
  }, testInfo) => {
    await openCategory(page, 'Münzen');
    await page.getByTestId('search-input').fill('Silberdenar');
    await expect(page.getByTestId('item-card')).toHaveCount(1);
    await waitForCardsSettled(page);
    await expectNoSeriousA11yViolations(page, testInfo);
  });

  // The empty-results state: distinct markup from a populated grid (a
  // message instead of cards), and a real non-happy-path a collector hits
  // on every search that doesn't match.
  test('the no-results search state has no serious or critical violations', async ({
    page,
  }, testInfo) => {
    await openCategory(page, 'Münzen');
    await page.getByTestId('search-input').fill('zzzznothing');
    await expect(page.getByTestId('item-card')).toHaveCount(0);
    await expectNoSeriousA11yViolations(page, testInfo);
  });

  test('the entry form has no serious or critical violations', async ({
    page,
  }, testInfo) => {
    await openCategory(page, 'Münzen');
    await page.getByTestId('new-entry').click();
    await expect(page.getByTestId('item-title')).toBeVisible();
    await expectNoSeriousA11yViolations(page, testInfo);
    // Closed, not submitted -- this spec only looks, it doesn't write. The
    // creation form (ItemCreate) has no Cancel button, only the modal's own
    // close control (EditItemModal is the one that passes ItemForm an
    // onCancel, for the edit flow).
    await page.getByRole('button', { name: 'Close', exact: true }).click();
  });

  // The sharing panel lives inside the same expanded strip categories.spec.ts
  // drives (SharingSection, rendered for an owned, unshared category).
  test('the sharing panel has no serious or critical violations', async ({
    page,
  }, testInfo) => {
    await openCategory(page, 'Münzen');
    await waitForCardsSettled(page);
    await page.getByTestId('expand-categories').click();
    await expect(page.getByLabel('New collection')).toBeVisible();
    await expectNoSeriousA11yViolations(page, testInfo);
  });
});
