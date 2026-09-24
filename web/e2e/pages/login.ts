import { type Locator, type Page } from '@playwright/test';

interface LoginPage {
  (): Locator;
  do: {
    open(): Promise<void>;
    signIn(): Promise<void>;
  };
  locators: {
    buttons: {
      signIn: Locator;
    };
    coin: Locator;
    collectibles: Locator;
    tagline: Locator;
    wordmark: Locator;
    wordmarkParts: Locator;
  };
}

export function initLoginPage(page: Page): LoginPage {
  const root = page.locator('#app-root');
  const locators = {
    buttons: {
      signIn: root.getByTestId('google-sign-in'),
    },
    coin: root.getByTestId('coin'),
    collectibles: root.getByTestId('collectible'),
    tagline: root.getByTestId('tagline'),
    wordmark: root.getByTestId('wordmark'),
    wordmarkParts: root.getByTestId('wordmark-part'),
  };
  const interactions = {
    open: async () => {
      await page.goto('login/', { waitUntil: 'networkidle' });
    },
    signIn: async () => {
      await locators.buttons.signIn.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
