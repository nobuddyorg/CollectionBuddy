import { type Locator, type Page } from '@playwright/test';

interface AccountMenu {
  (): Locator;
  do: {
    chooseLanguage(language: 'de' | 'en'): Promise<void>;
    chooseTheme(theme: 'system' | 'light' | 'dark'): Promise<void>;
    choosePhotoBackdrop(backdrop: 'theme' | 'black' | 'white'): Promise<void>;
    close(): Promise<void>;
    downloadModel(): Promise<void>;
    toggleBackgroundRemoval(): Promise<void>;
    toggleBackgroundRemovalHint(): Promise<void>;
    deleteAccount(): Promise<void>;
    open(): Promise<void>;
    openHelp(): Promise<void>;
    removePasskey(index: number): Promise<void>;
    savePasskey(): Promise<void>;
    togglePasskeyHint(): Promise<void>;
    signOut(): Promise<void>;
  };
  locators: {
    backgroundRemoval: {
      toggle: Locator;
      info: Locator;
      hint: Locator;
      download: Locator;
      progress: Locator;
    };
    buttons: {
      close: Locator;
      deleteAccount: Locator;
      open: Locator;
      help: Locator;
      signOut: Locator;
    };
    passkeys: {
      add: Locator;
      error: Locator;
      hint: Locator;
      info: Locator;
      saved: Locator;
      setting: Locator;
    };
    languages: { de: Locator; en: Locator };
    photoBackdrops: { theme: Locator; black: Locator; white: Locator };
    privacyLink: Locator;
    themes: { system: Locator; light: Locator; dark: Locator };
  };
}

export function initAccountMenu(page: Page): AccountMenu {
  const root = page.getByTestId('user-menu');
  const locators = {
    backgroundRemoval: {
      toggle: page.getByTestId('background-removal-toggle'),
      info: page.getByTestId('background-removal-info'),
      hint: page.getByTestId('background-removal-hint'),
      download: page.getByTestId('model-preload'),
      progress: page.getByTestId('model-status'),
    },
    buttons: {
      close: page.getByTestId('close-user-menu'),
      deleteAccount: page.getByTestId('delete-account'),
      open: page.getByTestId('account-menu'),
      help: page.getByTestId('open-help'),
      signOut: page.getByTestId('sign-out'),
    },
    passkeys: {
      add: page.getByTestId('passkey-add'),
      error: page.getByTestId('passkey-setting').getByRole('alert'),
      hint: page.getByTestId('passkey-hint'),
      info: page.getByTestId('passkey-info'),
      saved: page.getByTestId('passkey'),
      setting: page.getByTestId('passkey-setting'),
    },
    languages: {
      de: page.getByTestId('lang-de'),
      en: page.getByTestId('lang-en'),
    },
    photoBackdrops: {
      theme: page.getByTestId('photo-backdrop-theme'),
      black: page.getByTestId('photo-backdrop-black'),
      white: page.getByTestId('photo-backdrop-white'),
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
    choosePhotoBackdrop: async (backdrop: 'theme' | 'black' | 'white') => {
      await locators.photoBackdrops[backdrop].click();
    },
    close: async () => {
      await locators.buttons.close.click();
    },
    downloadModel: async () => {
      await locators.backgroundRemoval.download.click();
    },
    toggleBackgroundRemovalHint: async () => {
      await locators.backgroundRemoval.info.click();
    },
    toggleBackgroundRemoval: async () => {
      await locators.backgroundRemoval.toggle.click();
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
    removePasskey: async (index: number) => {
      await locators.passkeys.saved
        .nth(index)
        .getByTestId('passkey-remove')
        .click();
    },
    savePasskey: async () => {
      await locators.passkeys.add.click();
    },
    togglePasskeyHint: async () => {
      await locators.passkeys.info.click();
    },
    signOut: async () => {
      await locators.buttons.signOut.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}
