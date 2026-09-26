import { expect, test } from './test';

test.use({ locale: 'en-GB' });

test.describe('help', () => {
  test.beforeEach(async ({ on, page }) => {
    await page.goto('', { waitUntil: 'networkidle' });
    await expect(on(page).categories.locators.selected).not.toBeEmpty();
  });

  test('opens from the account menu, explains a topic, and hands focus back to the menu button', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await app.account.do.open();
    await app.account.do.openHelp();
    await expect(app.help()).toBeVisible();
    await expect(app.account()).toBeHidden();

    await app.help.do.openTopic('sharing');
    await expect(app.help.locators.topic('sharing')).toContainText('Can edit');

    await page.keyboard.press('Escape');
    await expect(app.help()).toBeHidden();
    await expect(app.account.locators.buttons.open).toBeFocused();
  });

  test('opens with Ctrl+/ (Cmd+/) from anywhere on the page', async ({
    on,
    page,
  }) => {
    const app = on(page);
    await app.help.do.openByKeyboard();
    await expect(app.help()).toBeVisible();

    await app.help.do.close();
    await expect(app.help()).toBeHidden();
  });
});
