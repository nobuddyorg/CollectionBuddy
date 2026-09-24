import { type Locator, type Page } from '@playwright/test';

interface SharingPanel {
  (): Locator;
  do: {
    clearExpiry(): Promise<void>;
    invite(email: string): Promise<void>;
    setExpiry(date: string): Promise<void>;
    toggleCanEdit(email: string): Promise<void>;
    revoke(email: string): Promise<void>;
  };
  locators: {
    buttons: {
      clearExpiry: Locator;
      expiry: Locator;
      submit: Locator;
    };
    inputs: {
      email: Locator;
      expiry: Locator;
    };
    rows: Locator;
    texts: {
      empty: Locator;
    };
  };
  /** One grant row, by the address it was issued to. */
  row(email: string): ShareRow;
}

interface ShareRow {
  (): Locator;
  locators: {
    buttons: {
      revoke: Locator;
    };
    canEdit: Locator;
    editorBadge: Locator;
    email: Locator;
    expiry: Locator;
  };
}

function initRow(root: Locator): ShareRow {
  return Object.assign(() => root, {
    locators: {
      buttons: {
        revoke: root.getByTestId('share-revoke'),
      },
      canEdit: root.getByTestId('share-can-edit'),
      editorBadge: root.getByTestId('share-editor-badge'),
      email: root.getByTestId('share-email-label'),
      expiry: root.getByTestId('share-expiry-label'),
    },
  });
}

export function initSharingPanel(page: Page): SharingPanel {
  const root = page.locator('#app-root');
  const locators = {
    buttons: {
      clearExpiry: root.getByTestId('share-expiry-clear'),
      expiry: root.getByTestId('share-expiry'),
      submit: root.getByTestId('share-submit'),
    },
    inputs: {
      email: root.getByTestId('share-email'),
      expiry: root.getByTestId('share-expiry-input'),
    },
    rows: root.getByTestId('share-row'),
    texts: {
      empty: root.getByTestId('share-list-empty'),
    },
  };
  const row = (email: string) =>
    initRow(locators.rows.filter({ hasText: email }));
  const interactions = {
    clearExpiry: async () => {
      await locators.buttons.clearExpiry.click();
    },
    invite: async (email: string) => {
      await locators.inputs.email.fill(email);
      await locators.buttons.submit.click();
    },
    setExpiry: async (date: string) => {
      await locators.inputs.expiry.fill(date);
    },
    toggleCanEdit: async (email: string) => {
      // Clicked, not checked: the box follows the stored role until the confirmation behind it is answered.
      await row(email).locators.canEdit.click();
    },
    revoke: async (email: string) => {
      await row(email).locators.buttons.revoke.click();
    },
  };
  return Object.assign(() => root, { locators, do: interactions, row });
}
