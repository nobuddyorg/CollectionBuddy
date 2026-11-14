import { type Locator, type Page } from '@playwright/test';

interface LoginPage {
  (): Locator;
  do: {
    open(): Promise<void>;
    signIn(): Promise<void>;
    signInWithPasskey(): Promise<void>;
  };
  locators: {
    buttons: {
      signIn: Locator;
      signInWithPasskey: Locator;
    };
    coin: Locator;
    collectibles: Locator;
    privacyLink: Locator;
    tagline: Locator;
    wordmark: Locator;
    wordmarkParts: Locator;
  };
}

export const LOGIN_URL = /\/login\/?$/;

export function initLoginPage(page: Page): LoginPage {
  const root = page.getByTestId('app-root');
  const locators = {
    buttons: {
      signIn: root.getByTestId('google-sign-in'),
      signInWithPasskey: root.getByTestId('passkey-sign-in'),
    },
    coin: root.getByTestId('coin'),
    collectibles: root.getByTestId('collectible'),
    privacyLink: root.getByTestId('login-privacy-link'),
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
    signInWithPasskey: async () => {
      await locators.buttons.signInWithPasskey.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
