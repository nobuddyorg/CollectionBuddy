import { type Locator, type Page } from '@playwright/test';

interface AccountMenu {
  (): Locator;
  do: {
    chooseLanguage(language: 'de' | 'en'): Promise<void>;
    chooseTheme(theme: 'system' | 'light' | 'dark'): Promise<void>;
    deleteAccount(): Promise<void>;
    open(): Promise<void>;
    openHelp(): Promise<void>;
    signOut(): Promise<void>;
  };
  locators: {
    buttons: {
      deleteAccount: Locator;
      open: Locator;
      help: Locator;
      signOut: Locator;
    };
    languages: { de: Locator; en: Locator };
    privacyLink: Locator;
    themes: { system: Locator; light: Locator; dark: Locator };
  };
}

export function initAccountMenu(page: Page): AccountMenu {
  const root = page.getByTestId('user-menu');
  const locators = {
    buttons: {
      deleteAccount: page.getByTestId('delete-account'),
      open: page.getByTestId('account-menu'),
      help: page.getByTestId('open-help'),
      signOut: page.getByTestId('sign-out'),
    },
    languages: {
      de: page.getByTestId('lang-de'),
      en: page.getByTestId('lang-en'),
    },
    privacyLink: page.getByTestId('menu-privacy-link'),
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
    // Only starts it: the confirmation decides.
    deleteAccount: async () => {
      await locators.buttons.deleteAccount.click();
    },
    open: async () => {
      await locators.buttons.open.click();
    },
    openHelp: async () => {
      await locators.buttons.help.click();
    },
    signOut: async () => {
      await locators.buttons.signOut.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
