import { expect, type Locator, type Page } from '@playwright/test';

import { initConfirm } from './dialogs';
import { initEntryForm } from './entry-form';

interface Catalogue {
  (): Locator;
  do: {
    addEntry(title: string, description?: string): Promise<void>;
    clearSearch(): Promise<void>;
    removeEntry(title: string): Promise<void>;
    removeEntryByKeyboard(title: string): Promise<void>;
    openEntryForm(): Promise<void>;
    openMap(): Promise<void>;
    search(term: string): Promise<void>;
    waitForCardsSettled(): Promise<void>;
  };
  locators: {
    buttons: {
      newEntry: Locator;
      openMap: Locator;
      clearSearch: Locator;
      clearSearchFromEmptyState: Locator;
      nextPage: Locator;
      previousPage: Locator;
      pageNumbers: Locator;
    };
    cards: Locator;
    /** Every title on the page, in the order the grid shows them. */
    cardTitles: Locator;
    inputs: {
      search: Locator;
    };
    pagination: Locator;
    texts: {
      emptyTitle: Locator;
      searchStatus: Locator;
    };
  };
  /** One card, found by the title it shows. */
  card(title: string): CatalogueCard;
}

interface CatalogueCard {
  (): Locator;
  do: {
    delete(): Promise<void>;
    edit(): Promise<void>;
    openImage(): Promise<void>;
    uploadPhoto(file: string): Promise<void>;
  };
  locators: {
    buttons: {
      delete: Locator;
      edit: Locator;
      deleteImage: Locator;
      openImage: Locator;
    };
    description: Locator;
    images: Locator;
    place: Locator;
    tags: Locator;
    title: Locator;
    uploadInput: Locator;
  };
}

function initCard(root: Locator): CatalogueCard {
  const locators = {
    buttons: {
      delete: root.getByTestId('delete-entry'),
      edit: root.getByTestId('edit-entry'),
      deleteImage: root.getByTestId('delete-image'),
      openImage: root.getByTestId('open-image'),
    },
    description: root.getByTestId('item-card-description'),
    images: root.getByTestId('item-image'),
    place: root.getByTestId('item-card-place'),
    tags: root.getByTestId('item-card-tag'),
    title: root.getByTestId('item-card-title'),
    uploadInput: root.getByTestId('upload-photo').first(),
  };
  const interactions = {
    delete: async () => {
      await locators.buttons.delete.click();
    },
    edit: async () => {
      await locators.buttons.edit.click();
    },
    openImage: async () => {
      await locators.buttons.openImage.first().click();
    },
    uploadPhoto: async (file: string) => {
      await locators.uploadInput.setInputFiles(file);
    },
  };
  return Object.assign(() => root, { locators, do: interactions });
}

export function initCatalogue(page: Page): Catalogue {
  const root = page.getByTestId('app-root');
  const pagination = root.getByTestId('pagination');
  const locators = {
    buttons: {
      newEntry: root.getByTestId('new-entry'),
      openMap: root.getByTestId('open-map'),
      clearSearch: root.getByTestId('search-clear'),
      clearSearchFromEmptyState: root.getByTestId('empty-clear-search'),
      nextPage: pagination.getByTestId('page-next'),
      previousPage: pagination.getByTestId('page-previous'),
      pageNumbers: pagination.getByTestId('page-number'),
    },
    cards: root.getByTestId('item-card'),
    cardTitles: root.getByTestId('item-card-title'),
    inputs: {
      search: root.getByTestId('search-input'),
    },
    pagination,
    texts: {
      emptyTitle: root.getByTestId('empty-title'),
      searchStatus: root.getByTestId('search-status'),
    },
  };
  const card = (title: string) =>
    initCard(locators.cards.filter({ hasText: title }));
  const confirm = initConfirm(page);
  const form = initEntryForm(page);
  const interactions = {
    addEntry: async (title: string, description?: string) => {
      await locators.buttons.newEntry.click();
      await form.do.fill({ title, description });
      await form.do.submit();
      await expect(card(title)()).toBeVisible();
    },
    clearSearch: async () => {
      await locators.buttons.clearSearch.click();
    },
    // Answers the confirmation too: an action spanning two screens belongs to the one that starts it.
    removeEntry: async (title: string) => {
      await card(title).do.delete();
      await confirm.do.accept();
      await expect(card(title)()).toHaveCount(0);
    },
    // The confirmation opens on Cancel, so Tab reaches Confirm.
    removeEntryByKeyboard: async (title: string) => {
      await card(title).locators.buttons.delete.focus();
      await page.keyboard.press('Enter');
      await expect(confirm.locators.buttons.cancel).toBeFocused();
      await page.keyboard.press('Tab');
      await expect(confirm.locators.buttons.accept).toBeFocused();
      await page.keyboard.press('Enter');
      await expect(card(title)()).toHaveCount(0);
    },
    openEntryForm: async () => {
      await locators.buttons.newEntry.click();
    },
    openMap: async () => {
      await locators.buttons.openMap.click();
    },
    search: async (term: string) => {
      await locators.inputs.search.fill(term);
    },
    // Cards fade in (.fade-up, 500ms); axe samples contrast mid-fade as a false positive unless settled.
    waitForCardsSettled: async () => {
      await expect(locators.cards.first()).toHaveCSS('opacity', '1');
      for (const oneCard of await locators.cards.all()) {
        await expect(oneCard).toHaveCSS('opacity', '1');
      }
    },
  };
  return Object.assign(() => root, { locators, do: interactions, card });
}
