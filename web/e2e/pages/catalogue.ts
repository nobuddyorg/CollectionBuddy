import { expect, type Locator, type Page } from '@playwright/test';

interface Catalogue {
  /**
   * Points to self.
   */
  (): Locator;
  /**
   * High-level interactions.
   */
  do: {
    addEntry(title: string, description?: string): Promise<void>;
    clearSearch(): Promise<void>;
    removeEntry(title: string): Promise<void>;
    openEntryForm(): Promise<void>;
    openMap(): Promise<void>;
    search(term: string): Promise<void>;
  };
  /**
   * Raw locators.
   */
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
    card: {
      titles: Locator;
      descriptions: Locator;
      places: Locator;
      tags: Locator;
      images: Locator;
    };
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
  const root = page.locator('#app-root');
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
    card: {
      titles: root.getByTestId('item-card-title'),
      descriptions: root.getByTestId('item-card-description'),
      places: root.getByTestId('item-card-place'),
      tags: root.getByTestId('item-card-tag'),
      images: root.getByTestId('item-image'),
    },
    inputs: {
      search: root.getByTestId('search-input'),
    },
    pagination,
    texts: {
      emptyTitle: root.getByTestId('empty-title'),
      searchStatus: root.getByTestId('search-status'),
    },
  };
  const interactions = {
    addEntry: async (title: string, description?: string) => {
      await locators.buttons.newEntry.click();
      await page.getByTestId('item-title').fill(title);
      if (description) {
        await page.getByTestId('item-description').fill(description);
      }
      await page.getByTestId('item-submit').click();
      await expect(locators.cards.filter({ hasText: title })).toBeVisible();
    },
    clearSearch: async () => {
      await locators.buttons.clearSearch.click();
    },
    // Reaches the confirmation the delete raises, since that dialog is the
    // second half of this one action rather than a screen of its own.
    removeEntry: async (title: string) => {
      const card = locators.cards.filter({ hasText: title });
      await card.getByTestId('delete-entry').click();
      await page.getByTestId('confirm-accept').click();
      await expect(card).toHaveCount(0);
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
  };
  return Object.assign(() => root, {
    locators,
    do: interactions,
    card: (title: string) =>
      initCard(locators.cards.filter({ hasText: title })),
  });
}
