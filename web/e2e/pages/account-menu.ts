import { type Locator, type Page } from '@playwright/test';

interface AccountMenu {
  /**
   * Points to self.
   */
  (): Locator;
  /**
   * High-level interactions.
   */
  do: {
    chooseLanguage(lang: 'de' | 'en'): Promise<void>;
    chooseTheme(theme: 'system' | 'light' | 'dark'): Promise<void>;
    open(): Promise<void>;
    signOut(): Promise<void>;
  };
  /**
   * Raw locators.
   */
  locators: {
    buttons: {
      open: Locator;
      signOut: Locator;
    };
    languages: { de: Locator; en: Locator };
    themes: { system: Locator; light: Locator; dark: Locator };
  };
}

export function initAccountMenu(page: Page): AccountMenu {
  const root = page.locator('#user-menu');
  const locators = {
    buttons: {
      open: page.getByTestId('account-menu'),
      signOut: page.getByTestId('sign-out'),
    },
    languages: {
      de: page.getByTestId('lang-de'),
      en: page.getByTestId('lang-en'),
    },
    themes: {
      system: page.getByTestId('theme-system'),
      light: page.getByTestId('theme-light'),
      dark: page.getByTestId('theme-dark'),
    },
  };
  const interactions = {
    chooseLanguage: async (lang: 'de' | 'en') => {
      await locators.languages[lang].click();
    },
    chooseTheme: async (theme: 'system' | 'light' | 'dark') => {
      await locators.themes[theme].click();
    },
    open: async () => {
      await locators.buttons.open.click();
    },
    signOut: async () => {
      await locators.buttons.signOut.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
