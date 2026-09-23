import { type Locator, type Page } from '@playwright/test';

interface AccountMenu {
  (): Locator;
  do: {
    chooseLanguage(language: 'de' | 'en'): Promise<void>;
    chooseTheme(theme: 'system' | 'light' | 'dark'): Promise<void>;
    open(): Promise<void>;
    signOut(): Promise<void>;
  };
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
    chooseLanguage: async (language: 'de' | 'en') => {
      await locators.languages[language].click();
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
